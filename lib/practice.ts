import { z } from "zod";

export const CorrectionSchema = z.object({
  original: z.string().min(1).max(500),
  natural: z.string().min(1).max(500),
  reason: z.string().min(1).max(1000),
  alternatives: z.array(z.string().max(300)).max(8),
  examples: z.array(z.string().max(600)).max(8),
});
export const PlanSchema = z.object({
  title: z.string().min(1).max(160),
  focus: z.array(z.string().min(1).max(200)).min(2).max(8),
  shadowing: z.object({ text: z.string().min(100).max(3000), tips: z.array(z.string().max(500)).min(1).max(5) }),
  translations: z.array(z.object({ chinese: z.string().min(1).max(500), hint: z.string().max(300), reference: z.string().min(1).max(800), explanation: z.string().min(1).max(800) })).min(3).max(6),
  conversation: z.object({ scenario: z.string().min(1).max(800), opening: z.string().min(1).max(800), goals: z.array(z.string().max(300)).min(2).max(5) }),
});
export const GradeSchema = z.object({ natural: z.string().min(1).max(1500), feedback: z.string().min(1).max(1500), corrections: z.array(CorrectionSchema).max(10) });
export const ChatReplySchema = z.object({ reply: z.string().min(1).max(2000), corrections: z.array(CorrectionSchema).max(10) });
export const TurnSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000), corrections: z.array(CorrectionSchema).max(10).optional() });
export const PracticeRecordSchema = z.object({
  id: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), plan: PlanSchema,
  shadowingDone: z.boolean(), answers: z.array(z.string().max(1500)).max(6),
  grades: z.array(GradeSchema.nullable()).max(6), turns: z.array(TurnSchema).max(60),
});
export type Plan = z.infer<typeof PlanSchema>;
export type Grade = z.infer<typeof GradeSchema>;
export type Turn = z.infer<typeof TurnSchema>;
export type PracticeRecord = z.infer<typeof PracticeRecordSchema>;
export function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}
