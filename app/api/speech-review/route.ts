import { z } from "zod";

export const dynamic = "force-dynamic";

const Correction = z.object({
  original: z.string().min(1).max(500),
  natural: z.string().min(1).max(500),
  reason: z.string().min(1).max(1000),
  alternatives: z.array(z.string().max(300)).max(8),
  examples: z.array(z.string().max(600)).max(8),
});

const Payload = z.object({
  transcript: z.string().min(1).max(30000),
  revised: z.string().min(1).max(30000),
  corrections: z.array(Correction).max(100),
});

export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ message: "请从网站内提交记录。" }, { status: 403, headers });
  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "请检查转录与纠正内容。" }, { status: 400, headers });

  const { transcript, revised, corrections } = parsed.data;
  const token = process.env.NOTION_TOKEN;
  const pageId = process.env.NOTION_PAGE_ID;
  if (!token || !pageId) return Response.json({ message: "尚未配置 Notion。请先在 Vercel 中添加 NOTION_TOKEN 和 NOTION_PAGE_ID。" }, { status: 503, headers });
  let notionSynced = false;
  {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
    const children = [
      { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: `${date} — Speaking Transcript & Collocation Review` } }] } },
      { object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: "Original transcript" } }] } },
      { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: transcript.slice(0, 1900) } }] } },
      ...corrections.flatMap((item) => [
        { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: `${item.original} → ${item.natural}` } }] } },
        { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: `${item.reason} 可迁移：${item.alternatives.join(" / ")}` } }] } },
      ]),
      { object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: "Lightly revised version" } }] } },
      { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: revised.slice(0, 1900) } }] } },
    ];
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "notion-version": "2022-06-28", "content-type": "application/json" },
      body: JSON.stringify({ children }),
    });
    notionSynced = response.ok;
  }

  if (!notionSynced) return Response.json({ message: "Notion 同步失败。请检查 integration 权限和页面 ID。" }, { status: 502, headers });
  return Response.json({ status: "saved", notionSynced }, { headers });
}
