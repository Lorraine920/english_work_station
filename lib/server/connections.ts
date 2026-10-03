import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./http";

const COOKIE = "studio_connections";
const ConfigSchema = z.object({
  notionToken: z.string().max(300).default(""), pageId: z.string().max(200).default(""),
  aiKey: z.string().max(300).default(""), model: z.string().max(100).default("gpt-4.1-mini"),
});
export type Connections = z.infer<typeof ConfigSchema>;
const runtime = globalThis as typeof globalThis & { studioConnectionKey?: Buffer };
const localKey = runtime.studioConnectionKey ??= randomBytes(32);
function encryptionKey() {
  const secret = process.env.CONNECTION_SECRET;
  if (secret && secret.length >= 32) return createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV === "production") throw new ApiError("请先在部署环境设置至少 32 字符的 CONNECTION_SECRET，再保存连接。", 503);
  return localKey;
}
export function normalizePageId(value: string) {
  const match = value.trim().split("?")[0].match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  if (!match) throw new ApiError("请输入有效的 Notion 页面 ID 或页面链接。");
  return match[1].replaceAll("-", "");
}
export function connections(request: Request): Connections {
  let saved: Partial<Connections> = {};
  const value = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (value) {
    try {
      const packed = Buffer.from(value, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), packed.subarray(0, 12));
      decipher.setAuthTag(packed.subarray(12, 28));
      const data = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString());
      if (data.expires > Date.now()) saved = ConfigSchema.parse(data.config);
    } catch { /* Invalid or expired cookies never expose credentials. */ }
  }
  return ConfigSchema.parse({
    notionToken: saved.notionToken || process.env.NOTION_TOKEN || "",
    pageId: saved.pageId || process.env.NOTION_PAGE_ID || "",
    aiKey: saved.aiKey || process.env.OPENAI_API_KEY || "",
    model: saved.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
  });
}
export function connectionCookie(config: Connections) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ config, expires: Date.now() + 30 * 86400000 })), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function clearConnectionCookie() { return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
export function connectionStatus(config: Connections) {
  return { notionConfigured: Boolean(config.notionToken && config.pageId), aiConfigured: Boolean(config.aiKey), pageId: config.pageId, model: config.model };
}
export function requireNotion(config: Connections) {
  if (!config.notionToken || !config.pageId) throw new ApiError("请先在连接设置中填写 Notion Token 和页面链接。", 503);
  return { ...config, pageId: normalizePageId(config.pageId) };
}
