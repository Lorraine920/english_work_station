import type { Connections } from "./connections";
import { requireNotion } from "./connections";
import { ApiError } from "./http";
import { createHash } from "node:crypto";

type RichText = { plain_text?: string; text?: { content: string } };
type Block = { id: string; type: string; has_children?: boolean; [key: string]: unknown };
type BlockList = { results: Block[]; has_more: boolean; next_cursor?: string };
export async function notion<T>(config: Connections, path: string, method = "GET", body?: unknown): Promise<T> {
  const { notionToken } = requireNotion(config);
  let response: Response;
  try {
    const options: RequestInit = {
      method, headers: { authorization: `Bearer ${notionToken}`, "notion-version": "2022-06-28", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(15000),
    };
    response = await fetch(`https://api.notion.com/v1/${path}`, options);
    // Explicit 429 responses have not performed the write, so retrying them
    // is safe. Network errors on writes are intentionally not retried.
    for (let retry = 0; retry < 2 && response.status === 429; retry++) {
      const delay = Math.min(5000, Math.max(1000, Number(response.headers.get("retry-after") || 1) * 1000));
      await new Promise(resolve => setTimeout(resolve, delay));
      response = await fetch(`https://api.notion.com/v1/${path}`, { ...options, signal: AbortSignal.timeout(15000) });
    }
  } catch { throw new ApiError("Notion 请求超时或网络不可用。", 504); }
  if (!response.ok) throw new ApiError(response.status === 401 ? "Notion Token 无效。" : response.status === 404 || response.status === 403 ? "无法访问 Notion 页面。请检查页面链接，并在页面 Connections 中授权 integration。" : response.status === 429 ? "Notion 请求过于频繁，请稍后重试。" : "Notion 请求失败，请检查 integration 的读取和写入权限。", 502);
  return response.json() as Promise<T>;
}
export function textBlocks(text: string, type = "paragraph") {
  // A rich_text content item is limited to 2,000 characters.
  const blocks: Record<string, unknown>[] = [];
  for (let i = 0; i < Math.max(text.length, 1); i += 1800) {
    blocks.push({ object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: text.slice(i, i + 1800) } }] } });
  }
  return blocks;
}
export async function pageTitle(config: Connections) {
  const page = await notion<{ properties: Record<string, { type: string; title?: RichText[] }> }>(config, `pages/${requireNotion(config).pageId}`);
  return Object.values(page.properties).find(property => property.type === "title")?.title?.map(item => item.plain_text ?? item.text?.content ?? "").join("") || "课程笔记";
}
export async function readNotes(config: Connections) {
  const root = requireNotion(config).pageId;
  const lines: string[] = [];
  const previous: string[] = [];
  let requests = 0;
  let truncated = false;
  async function walk(id: string, depth: number) {
    const blocks: Block[] = [];
    let cursor: string | undefined;
    do {
      if (requests >= 20) { truncated = true; break; }
      requests++;
      const data = await notion<BlockList>(config, `blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`);
      blocks.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    for (const block of blocks) {
      const value = block[block.type] as { rich_text?: RichText[]; title?: string; cells?: RichText[][] } | undefined;
      if (block.type === "child_page" && value?.title?.startsWith("Daily Practice ·")) { previous.push(value.title); continue; }
      const text = value?.rich_text?.map(item => item.plain_text ?? item.text?.content ?? "").join("") ?? value?.title ?? value?.cells?.map(cell => cell.map(item => item.plain_text ?? item.text?.content ?? "").join("")).join(" | ");
      if (text) lines.push(text);
      if (block.has_children || block.type === "child_page") {
        if (depth < 4 && requests < 20) await walk(block.id, depth + 1);
        else truncated = true;
      }
    }
  }
  await walk(root, 0);
  const text = lines.join("\n");
  if (!text.trim()) throw new ApiError("Notion 页面里还没有可用的课程笔记。请先保存课程记录或添加文字笔记。", 400);
  return { text: text.slice(-35000), lineCount: lines.length, truncated: truncated || text.length > 35000, previous: previous.slice(-14) };
}
export async function saveNotionPage(config: Connections, title: string, blocks: Record<string, unknown>[], existingId?: string) {
  const pageId = requireNotion(config).pageId;
  let id = existingId;
  let url = "";
  if (!id) {
    const page = await notion<{ id: string; url: string }>(config, "pages", "POST", {
      parent: { page_id: pageId }, properties: { title: { type: "title", title: [{ type: "text", text: { content: title.slice(0, 180) } }] } },
      children: blocks.slice(0, 100),
    });
    id = page.id; url = page.url;
    blocks = blocks.slice(100);
  }
  for (let offset = 0; offset < blocks.length; offset += 100) {
    await notion(config, `blocks/${id}/children`, "PATCH", { children: blocks.slice(offset, offset + 100) });
  }
  return { id, url: url || `https://www.notion.so/${id.replaceAll("-", "")}` };
}

// Keep daily snapshots immutable; retrying an identical save reuses its page.
export async function savePracticeSnapshot(config: Connections, title: string, blocks: Record<string, unknown>[], recordId: string) {
  const fingerprint = createHash("sha256").update(recordId).update(JSON.stringify(blocks)).digest("hex").slice(0, 16);
  const snapshotTitle = `${title.slice(0, 140)} · ${fingerprint}`;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const data = await notion<BlockList>(config, `blocks/${requireNotion(config).pageId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`);
    const existing = data.results.find(block => block.type === "child_page" && (block.child_page as { title?: string })?.title === snapshotTitle);
    if (existing) return { id: existing.id, url: `https://www.notion.so/${existing.id.replaceAll("-", "")}` };
    if (!data.has_more) {
      // Publish the final title only after every block has been written. A
      // failed batch must never be mistaken for a completed retry.
      const saved = await saveNotionPage(config, `${snapshotTitle}（同步中）`, blocks);
      await notion(config, `pages/${saved.id}`, "PATCH", { properties: { title: { type: "title", title: [{ type: "text", text: { content: snapshotTitle } }] } } });
      return saved;
    }
    cursor = data.next_cursor;
  }
  throw new ApiError("Notion 目标页面下的记录过多，请为练习选择新的课程页面。", 400);
}
