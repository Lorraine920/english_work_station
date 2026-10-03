import { z } from "zod";
import { connections } from "@/lib/server/connections";
import { ApiError, failure, privateHeaders, readJson, sameOrigin } from "@/lib/server/http";
import { readNotes, saveNotionPage, textBlocks } from "@/lib/server/notion";

export const dynamic = "force-dynamic";
const Word = z.object({ word: z.string().min(1).max(120), meaning: z.string().max(500), example: z.string().max(800), note: z.string().max(500).optional() });
const Payload = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), raw: z.string().min(1).max(30000), words: z.array(Word).min(1).max(100) });
export async function GET(request: Request) {
  try { sameOrigin(request); return Response.json(await readNotes(connections(request)), { headers: privateHeaders }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const parsed = Payload.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("请检查课堂记录，最多保存 100 个词条，每个词条不超过 120 字符。");
    const { date, raw, words } = parsed.data;
    const blocks = [
      ...textBlocks("课程原始记录", "heading_2"), ...textBlocks(raw),
      ...textBlocks("词汇与搭配", "heading_2"),
      ...words.flatMap(item => textBlocks(`${item.word}：${item.meaning}\n${item.example}${item.note ? `\n${item.note}` : ""}`)),
    ];
    const saved = await saveNotionPage(connections(request), `${date} · Course Notes`, blocks);
    return Response.json({ status: "saved", notionSynced: true, url: saved.url }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
