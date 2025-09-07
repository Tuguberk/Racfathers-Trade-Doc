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
  confidence: z.number().min(0).max(1).optional(),
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
Return STRICT RAW JSON ONLY (no markdown fences, no commentary).
ALWAYS include a numeric field "confidence" (0-1).
If not journal related: intent="NONE" and confidence <= 0.3.
If suicidal ideation detected: crisis_flag=true.
Intents:
- ADD_ENTRY: user wants to log or write a note about trading, feelings, mistakes, lessons.
- GET_ENTRIES: user wants to view past journal entries, possibly filtered by date or tag.
- SET_GOAL: user states a trading goal or target (phrases like "my goal", "I want to achieve", number + timeframe).
- GET_GOALS: user wants to list existing goals.
- CHECKIN: user reports progress/percentage/score toward a goal.
- SUMMARY: user requests a weekly/monthly/overall review or summary.
JSON SCHEMA FIELDS (omit only those not applicable):
{"intent":"ADD_ENTRY|GET_ENTRIES|SET_GOAL|GET_GOALS|CHECKIN|SUMMARY|NONE","confidence":0.0,"date":"optional","range":{"from":"optional","to":"optional"},"tags":["optional"],"goal_text":"optional","goal_due":"optional","goal_target":"optional","crisis_flag":false,"rationale":"optional"}`;

const USER = (msg: string) => `Message: """${msg}"""\nReturn ONLY raw JSON.`;

export async function classifyJournalIntent(
  message: string
): Promise<JournalNLP> {
  const prompt = `${SYSTEM}\n${USER(message)}\nJSON:`;
  let raw: any;
  let txt = "";
  try {
    raw = await getUtilityResponse(prompt);
    txt = typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch (e) {
    return {
      intent: "NONE",
      confidence: 0,
      rationale: "llm_error",
      crisis_flag: false,
    } as JournalNLP;
  }
  const clean = txt.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  try {
    const obj: any = JSON.parse(clean);
    if (!obj.intent) obj.intent = "NONE";
    if (typeof obj.confidence !== "number") {
      obj.confidence = obj.intent === "NONE" ? 0.2 : 0.85; // heuristic fallback
    }
    const parsed = JournalNLPZ.safeParse(obj);
    if (parsed.success) return parsed.data as JournalNLP;
    return {
      intent: "NONE",
      confidence: 0,
      rationale: "parse_error",
      crisis_flag: false,
    } as JournalNLP;
  } catch {
    return {
      intent: "NONE",
      confidence: 0,
      rationale: "json_parse_error",
      crisis_flag: false,
    } as JournalNLP;
  }
}
