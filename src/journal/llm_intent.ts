import { z } from "zod";
import { getUtilityResponse } from "../services/llmService.js";

export const JournalNLPZ = z.object({
  intent: z.enum([
    "ADD_ENTRY",
    "GET_ENTRIES",
    "SET_GOAL",
    "GET_GOALS",
    "CHECKIN",
    "SUMMARY",
    "NONE",
  ]),
  confidence: z.number().min(0).max(1),
  date: z.string().optional(),
  range: z
    .object({ from: z.string().optional(), to: z.string().optional() })
    .optional(),
  tags: z.array(z.string()).optional(),
  goal_text: z.string().optional(),
  goal_due: z.string().optional(),
  goal_target: z.string().optional(),
  crisis_flag: z.boolean().optional(),
  rationale: z.string().optional(),
});
export type JournalNLP = z.infer<typeof JournalNLPZ>;

const SYSTEM = `You classify trading journal requests.
Return STRICT JSON only, no prose.
If message isn't journal-related, intent="NONE".
Check for suicidal ideation; if present set crisis_flag=true.
Intents:
- ADD_ENTRY: "log", "note", "write in my journal"
- GET_ENTRIES: "show my journal", "entries from {dates}", "tag: mistakes"
- SET_GOAL: "set goal", "my goal is ..."
- GET_GOALS: "list goals"
- CHECKIN: "check in", "update progress"
- SUMMARY: "weekly review", "monthly summary"`;

const USER = (msg: string) => `Message: """${msg}"""\nReturn JSON only.`;

export async function classifyJournalIntent(
  message: string
): Promise<JournalNLP> {
  const prompt = `${SYSTEM}\n${USER(message)}\nJSON:`;
  const raw = await getUtilityResponse(prompt);
  const txt = typeof raw === "string" ? raw : JSON.stringify(raw);
  const clean = txt.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");

  try {
    const parsed = JournalNLPZ.safeParse(JSON.parse(clean));
    if (!parsed.success)
      return {
        intent: "NONE",
        confidence: 0,
        rationale: "parse_error",
        crisis_flag: false,
      };
    return parsed.data;
  } catch (error) {
    return {
      intent: "NONE",
      confidence: 0,
      rationale: "json_parse_error",
      crisis_flag: false,
    };
  }
}
