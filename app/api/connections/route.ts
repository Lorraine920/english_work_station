import { z } from "zod";
import { clearConnectionCookie, connectionCookie, connections, connectionStatus, normalizePageId } from "@/lib/server/connections";
import { failure, privateHeaders, readJson, sameOrigin, ApiError } from "@/lib/server/http";
import { pageTitle } from "@/lib/server/notion";
import { aiJson, listAiModels } from "@/lib/server/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Input = z.object({ action: z.enum(["save", "test-notion", "test-ai", "models"]), notionToken: z.string().trim().max(300).optional(), pageId: z.string().trim().max(200).optional(), aiKey: z.string().trim().max(300).optional(), model: z.string().trim().min(1).max(100).optional() });
export async function GET(request: Request) {
  return Response.json(connectionStatus(connections(request)), { headers: privateHeaders });
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = Input.safeParse(await readJson(request));
    if (!input.success) throw new ApiError("请检查连接设置。");
    const current = connections(request);
    const action = input.data.action;
    const config = { ...current };
    if (action === "save" || action === "test-notion") {
      config.notionToken = input.data.notionToken || current.notionToken;
      config.pageId = input.data.pageId ? normalizePageId(input.data.pageId) : current.pageId;
    }
    if (action !== "test-notion") {
      config.aiKey = input.data.aiKey || current.aiKey;
      config.model = input.data.model || current.model;
    }
    const saved = (message: string) => Response.json({ ...connectionStatus(config), message }, { headers: { ...privateHeaders, "set-cookie": connectionCookie(config) } });
    if (action === "models") return Response.json({ models: await listAiModels(config) }, { headers: privateHeaders });
    if (input.data.action === "test-ai") {
      await aiJson(config, z.object({ ok: z.literal(true) }), 'Return {"ok":true}.', "Connection test");
      return saved("AI 连接成功，已保存。");
    }
    if (action === "test-notion") return saved(`已连接：${await pageTitle(config)}，连接已保存。`);
    if (config.notionToken || config.pageId) await pageTitle(config);
    return saved("连接设置已保存。");
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); return Response.json({ message: "已清除此浏览器的连接。部署环境配置仍然有效。" }, { headers: { ...privateHeaders, "set-cookie": clearConnectionCookie() } }); }
  catch (error) { return failure(error); }
}
