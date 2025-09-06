import { looksLikeJournal } from "./intent_keywords.js";
import { classifyJournalIntent, JournalNLP } from "./llm_intent.js";

// Crisis detection function (imported from main agent)
function isCrisisMessage(message: string): {
  isCrisis: boolean;
  triggerWords: string[];
} {
  const crisisKeywords = [
    "jump from a bridge",
    "jump from bridge",
    "end it all",
    "kill myself",
    "suicide",
    "suicidal",
    "want to die",
    "don't want to live",
    "life is not worth",
    "nothing to live for",
    "better off dead",
    "give up on life",
    "can't go on",
    "no point living",
    "end my life",
    "harm myself",
    "hurt myself",
    "lost everything",
    "lost all",
    "lost my money",
    "financial ruin",
    "can't take it anymore",
    "hopeless",
    "worthless",
    "no way out",
    "I am going to die",
    "die",
    "death",
    "dead",
    "kill",
  ];

  const lowerMessage = message.toLowerCase();
  const triggerWords = crisisKeywords.filter((keyword) => {
    // For single words, use word boundary check to avoid partial matches
    if (!keyword.includes(" ")) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      return regex.test(lowerMessage);
    }
    // For phrases, use simple includes
    return lowerMessage.includes(keyword);
  });

  return {
    isCrisis: triggerWords.length > 0,
    triggerWords: triggerWords,
  };
}

export type RouteResult = {
  route: "JOURNAL" | "CRISIS" | "NONJOURNAL";
  nlp?: JournalNLP;
};

export async function routeMessage(message: string): Promise<RouteResult> {
  // 1. Crisis has highest priority
  const crisis = isCrisisMessage(message);
  if (crisis.isCrisis) {
    return { route: "CRISIS" };
  }

  // 2. Check if it looks like a journal request
  if (!looksLikeJournal(message)) {
    return { route: "NONJOURNAL" };
  }

  // 3. Use LLM classification
  const nlp = await classifyJournalIntent(message);

  // 4. Crisis flag from LLM takes priority
  if (nlp.crisis_flag) {
    return { route: "CRISIS", nlp };
  }

  // 5. Confidence gate - if below threshold but still journal-ish, default to ADD_ENTRY
  const MIN_CONFIDENCE = 0.6;
  if (nlp.intent === "NONE" || nlp.confidence < MIN_CONFIDENCE) {
    // Still looks like journal based on keywords, so treat as ADD_ENTRY
    return {
      route: "JOURNAL",
      nlp: { ...nlp, intent: "ADD_ENTRY", confidence: 0.7 },
    };
  }

  return { route: "JOURNAL", nlp };
}
