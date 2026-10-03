import { z } from "zod";
import { ChatReplySchema, GradeSchema, PlanSchema, PracticeRecordSchema, TurnSchema, shanghaiDate } from "@/lib/practice";
import { connections } from "@/lib/server/connections";
import { aiJson } from "@/lib/server/ai";
import { ApiError, failure, privateHeaders, readJson, sameOrigin } from "@/lib/server/http";
import { readNotes, savePracticeSnapshot, textBlocks } from "@/lib/server/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), previousTitles: z.array(z.string().max(160)).max(14).default([]) }),
  z.object({ action: z.literal("grade"), question: PlanSchema.shape.translations.element, answer: z.string().trim().min(1).max(1500) }),
  z.object({ action: z.literal("chat"), scenario: PlanSchema.shape.conversation, turns: z.array(TurnSchema).min(2).max(60) }),
  z.object({ action: z.literal("save"), record: PracticeRecordSchema }),
]);
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = Input.safeParse(await readJson(request));
    if (!input.success) throw new ApiError("练习内容不完整或过长，请检查后重试。");
    const config = connections(request);
    const data = input.data;
    if (data.action === "generate") {
      if (!config.aiKey) throw new ApiError("请先在连接设置中填写 OpenAI API Key。", 503);
      const notes = await readNotes(config);
      const plan = await aiJson(config, PlanSchema,
        'Create a NEW daily practice grounded in the supplied course notes. Use date and variation to vary topic, grammar, collocations and scenarios, avoiding previous titles. Level B1-B2. Return {title,focus:[2-8 grammar/collocation targets actually from notes],shadowing:{text:80-150 English words,tips:[Chinese rhythm/linking tips]},translations:[3-6 {chinese,hint,reference,explanation}],conversation:{scenario:Chinese role-play instructions,opening:English first question,goals:[Chinese goals]}}. Translation questions must test BOTH grammar and collocations from notes. Do not copy the same passage.',
        { date: shanghaiDate(), variation: crypto.randomUUID(), notes: notes.text, previousTitles: [...notes.previous, ...data.previousTitles] });
      return Response.json({ date: shanghaiDate(), plan, sourceLines: notes.lineCount, truncated: notes.truncated }, { headers: privateHeaders });
    }
    if (data.action === "grade") {
      const result = await aiJson(config, GradeSchema, 'Evaluate the Chinese-to-English translation. Accept valid alternatives, not just the reference. Return {natural:corrected answer,feedback:Chinese explanation,corrections:[{original,natural,reason,alternatives:[],examples:[]}]}. Empty corrections if correct.', data);
      return Response.json(result, { headers: privateHeaders });
    }
    if (data.action === "chat") {
      if (data.turns.at(-1)?.role !== "user") throw new ApiError("请先输入你的英语回复。");
      const result = await aiJson(config, ChatReplySchema, 'Continue this English role-play in 1-3 sentences and ask a relevant follow-up question. Correct ONLY the most recent user message; do not correct previous messages again. Return {reply:English response,corrections:[{original,natural,reason:Chinese,alternatives:[],examples:[]}]}. Empty corrections when no errors. Encourage the target expressions naturally.', data);
      return Response.json(result, { headers: privateHeaders });
    }
    const { record } = data;
    const blocks = [
      ...textBlocks(`${record.date} · ${record.plan.title}`, "heading_2"),
      ...textBlocks(`练习重点：${record.plan.focus.join(" / ")}`),
      ...textBlocks(`影子跟读${record.shadowingDone ? "（已完成）" : "（未完成）"}`, "heading_3"),
      ...textBlocks(record.plan.shadowing.text), ...textBlocks(record.plan.shadowing.tips.join("\n")),
      ...textBlocks("语法与搭配翻译", "heading_3"),
      ...record.plan.translations.flatMap((question, index) => textBlocks([
        `题目 ${index + 1}：${question.chinese}`, `我的翻译：${record.answers[index] || "未作答"}`,
        `参考：${question.reference}`, `说明：${question.explanation}`,
        ...(record.grades[index] ? [`反馈：${record.grades[index]!.feedback}`, `自然表达：${record.grades[index]!.natural}`, ...record.grades[index]!.corrections.map(item => `${item.original} → ${item.natural}\n${item.reason}\n${item.examples.join("\n")}`)] : []),
      ].join("\n"))),
      ...textBlocks("AI 对话与纠错", "heading_3"), ...textBlocks(record.plan.conversation.scenario),
      ...record.turns.flatMap(turn => textBlocks(`${turn.role === "user" ? "我" : "AI"}：${turn.content}${turn.corrections?.length ? `\n纠错：\n${turn.corrections.map(item => `${item.original} → ${item.natural}\n${item.reason}\n可迁移：${item.alternatives.join(" / ")}\n${item.examples.join("\n")}`).join("\n")}` : ""}`)),
    ];
    const saved = await savePracticeSnapshot(config, `Daily Practice · ${record.date} · ${record.plan.title}`, blocks, record.id);
    return Response.json({ notionSynced: true, url: saved.url }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
