import { z } from "zod";

export const dynamic = "force-dynamic";
const Word = z.object({ word: z.string().min(1).max(120), meaning: z.string().max(500), example: z.string().max(800), note: z.string().max(500).optional() });
const Payload = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), raw: z.string().min(1).max(30000), words: z.array(Word).min(1).max(100) });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ message: "请从网站内提交记录。" }, { status: 403 });
  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "请检查课堂记录内容。" }, { status: 400 });
  const { date, raw, words } = parsed.data;
  const token = process.env.NOTION_TOKEN;
  const pageId = process.env.NOTION_PAGE_ID;
  if (!token || !pageId) return Response.json({ message: "尚未配置 Notion。请先在 Vercel 中添加 NOTION_TOKEN 和 NOTION_PAGE_ID。" }, { status: 503 });
  let notionSynced = false;
  {
    const lines = [`${date} — Vocabulary from Conversation`, ...words.flatMap((item) => [`${item.word}：${item.meaning}`, `${item.example}${item.note ? `（${item.note}）` : ""}`])];
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: "PATCH", headers: { authorization: `Bearer ${token}`, "notion-version": "2022-06-28", "content-type": "application/json" }, body: JSON.stringify({ children: lines.map((line, index) => ({ object: "block", type: index === 0 ? "heading_2" : "paragraph", [index === 0 ? "heading_2" : "paragraph"]: { rich_text: [{ type: "text", text: { content: line } }] } })) }) });
    notionSynced = response.ok;
  }
  if (!notionSynced) return Response.json({ message: "Notion 同步失败。请检查 integration 权限和页面 ID。" }, { status: 502 });
  return Response.json({ status: "saved", notionSynced }, { headers: { "cache-control": "private, no-store" } });
}
