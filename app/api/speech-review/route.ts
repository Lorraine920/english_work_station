import { z } from "zod";
import { CorrectionSchema, shanghaiDate } from "@/lib/practice";
import { connections } from "@/lib/server/connections";
import { ApiError, failure, privateHeaders, readJson, sameOrigin } from "@/lib/server/http";
import { saveNotionPage, textBlocks } from "@/lib/server/notion";

export const dynamic = "force-dynamic";
const Payload = z.object({ transcript: z.string().min(1).max(30000), revised: z.string().min(1).max(30000), corrections: z.array(CorrectionSchema).max(100) });
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const parsed = Payload.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("请检查转录与纠正内容。");
    const { transcript, revised, corrections } = parsed.data;
    const blocks = [
      ...textBlocks("Original transcript", "heading_2"), ...textBlocks(transcript),
      ...textBlocks("Collocation review", "heading_2"),
      ...corrections.flatMap(item => textBlocks(`${item.original} → ${item.natural}\n${item.reason}\n可迁移：${item.alternatives.join(" / ")}\n${item.examples.join("\n")}`)),
      ...textBlocks("Lightly revised version", "heading_2"), ...textBlocks(revised),
    ];
    await saveNotionPage(connections(request), `${shanghaiDate()} · Speaking Review`, blocks);
    return Response.json({ status: "saved", notionSynced: true }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
