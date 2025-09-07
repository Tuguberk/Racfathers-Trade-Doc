import { StateGraph, END } from "@langchain/langgraph";
import { prisma } from "../db/prisma.js";
import { JournalState } from "./state.js";
import {
  getAdvancedAnalysis,
  getUtilityResponse,
} from "../services/llmService.js";

// Natural language due date parser (lightweight)
function parseDueDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const input = raw.trim().toLowerCase();
  const now = new Date();

  const iso = input.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }

  const rel = input.match(
    /^in\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)$/
  );
  if (rel) {
    const amt = parseInt(rel[1]);
    const unit = rel[2];
    const d = new Date(now);
    switch (unit) {
      case "day":
      case "days":
        d.setDate(d.getDate() + amt);
        break;
      case "week":
      case "weeks":
        d.setDate(d.getDate() + amt * 7);
        break;
      case "month":
      case "months":
        d.setMonth(d.getMonth() + amt);
        break;
      case "year":
      case "years":
        d.setFullYear(d.getFullYear() + amt);
        break;
    }
    return d;
  }

  const plainRel = input.match(
    /^(\d+)\s+(day|days|week|weeks|month|months|year|years)$/
  );
  if (plainRel) {
    const amt = parseInt(plainRel[1]);
    const unit = plainRel[2];
    const d = new Date(now);
    switch (unit) {
      case "day":
      case "days":
        d.setDate(d.getDate() + amt);
        break;
      case "week":
      case "weeks":
        d.setDate(d.getDate() + amt * 7);
        break;
      case "month":
      case "months":
        d.setMonth(d.getMonth() + amt);
        break;
      case "year":
      case "years":
        d.setFullYear(d.getFullYear() + amt);
        break;
    }
    return d;
  }

  if (input === "next month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1, 1);
    return d;
  }
  if (input === "next week") {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (input === "next year") {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() + 1, 0, 1);
    return d;
  }

  if (input === "end of month") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  if (input === "end of year") {
    return new Date(now.getFullYear(), 11, 31);
  }

  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const mMatch = input.match(
    /^(?:by\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?$/
  );
  if (mMatch) {
    const idx = months.indexOf(mMatch[1]);
    let year = mMatch[2] ? parseInt(mMatch[2]) : now.getFullYear();
    if (!mMatch[2] && idx < now.getMonth()) year += 1; // roll forward
    return new Date(year, idx, 1);
  }

  const qMatch = input.match(/^q([1-4])\s+(\d{4})$/);
  if (qMatch) {
    const q = parseInt(qMatch[1]);
    const year = parseInt(qMatch[2]);
    return new Date(year, (q - 1) * 3, 1);
  }

  const byYear = input.match(/^by\s+(\d{4})$/);
  if (byYear) {
    return new Date(parseInt(byYear[1]), 11, 31);
  }

  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Parse and extract data for journal entries
async function journal_parse(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("📒 Parsing journal intent and extracting data");
  console.log("Journal State:\n", state);

  const { inputMessage, journalAction, entryDraft, goalDraft } = state;

  // For SET_GOAL, use LLM to extract goal information
  if (journalAction === "SET_GOAL") {
    console.log("🎯 Parsing SET_GOAL with LLM");

    const goalExtractionPrompt = `Extract goal information from this message and return STRICT JSON:

Message: """${inputMessage}"""

Extract:
- goal_text: The main goal (required)
- target: Specific target/metric if mentioned
- due_date: When they want to achieve it
- timeframe: How long they have (1 year, 6 months, etc.)

Return JSON format:
{
  "goal_text": "string",
  "target": "string or null", 
  "due_date": "string or null",
  "timeframe": "string or null"
}`;

    try {
      const llmResponse = await getUtilityResponse(goalExtractionPrompt);
      const cleanResponse = llmResponse.replace(
        /^\s*```(?:json)?\s*|\s*```\s*$/g,
        ""
      );
      const goalData = JSON.parse(cleanResponse);

      console.log("🎯 LLM extracted goal data:", goalData);

      return {
        goalDraft: {
          text: goalData.goal_text || inputMessage,
          target: goalData.target || undefined,
          due: goalData.due_date || undefined,
        },
      };
    } catch (error) {
      console.error("❌ Error parsing goal with LLM:", error);
      // Fallback to simple extraction
      return {
        goalDraft: {
          text: inputMessage,
          target: undefined,
          due: undefined,
        },
      };
    }
  }

  // For ADD_ENTRY, use LLM to extract structured data
  if (journalAction === "ADD_ENTRY") {
    console.log("📝 Parsing ADD_ENTRY with LLM");
    const schemaExample =
      '{"market":null,"emotions":null,"mistakes":null,"lessons":null,"tags":["..."],"trades":[{"symbol":"BTC","direction":"long","r":2.1,"pnl":150}]}';
    const basePrompt = `You are a strict JSON extraction engine. OUTPUT ONLY VALID MINIFIED JSON MATCHING THE SCHEMA FIELDS. NO EXPLANATION.
Message: """${inputMessage}"""
Extract the following fields (use null if absent):
market, emotions, mistakes, lessons, tags (array of lowercase keywords), trades (array of objects: symbol, direction (long/short), r (number), pnl (number)).
Rules:
- Output ONLY JSON. No backticks. No prose.
- tags: derive simple keywords (e.g., panic, mistake, fear) only if present.
- Do not hallucinate trades; only include if explicitly described.
Return JSON now:
${schemaExample}`;

    async function tryExtract(attempt: number): Promise<any | null> {
      try {
        const raw = await getUtilityResponse(
          basePrompt + (attempt > 1 ? `\nREMINDER: ONLY JSON.` : "")
        );
        const clean = raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
        const firstBrace = clean.indexOf("{");
        const lastBrace = clean.lastIndexOf("}");
        if (firstBrace === -1 || lastBrace === -1) throw new Error("No braces");
        const jsonSlice = clean.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonSlice);
      } catch (e) {
        console.warn(
          `⚠️ ADD_ENTRY parse attempt ${attempt} failed:`,
          (e as Error).message
        );
        return null;
      }
    }

    let entryData = await tryExtract(1);
    if (!entryData) entryData = await tryExtract(2);
    if (!entryData) {
      // Last resort: minimal heuristic extraction
      const lower = inputMessage.toLowerCase();
      const tagCandidates = [
        "mistake",
        "panic",
        "fear",
        "confidence",
        "plan",
        "discipline",
      ];
      const foundTags = tagCandidates.filter((t) => lower.includes(t));
      return {
        entryDraft: {
          date: new Date().toISOString(),
          market: lower.includes("btc")
            ? "BTC"
            : lower.includes("eth")
            ? "ETH"
            : undefined,
          emotions: inputMessage,
          mistakes: lower.includes("mistake") ? inputMessage : undefined,
          lessons: undefined,
          tags: foundTags,
          trades: undefined,
        },
      };
    }

    console.log("📝 Robust extraction data:", entryData);
    return {
      entryDraft: {
        date: new Date().toISOString(),
        market: entryData.market ?? undefined,
        emotions: entryData.emotions ?? inputMessage,
        mistakes: entryData.mistakes ?? undefined,
        lessons: entryData.lessons ?? undefined,
        tags: Array.isArray(entryData.tags) ? entryData.tags : [],
        trades: Array.isArray(entryData.trades) ? entryData.trades : null,
      },
    };
  }

  // For other actions, use simple parsing or LLM as needed
  if (journalAction === "GET_ENTRIES") {
    console.log(
      "🔍 GET_ENTRIES requested - skipping filter parsing, returning URL only"
    );
    return {
      finalResponse: "🔗 Open journal: https://racfella.racfathers.io/journal",
    };
  }

  return state;
}

// Add a new journal entry
async function journal_add_entry(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("📒 Adding new journal entry");

  const { userId, entryDraft } = state;

  if (!entryDraft) {
    return {
      finalResponse:
        "❌ No entry data to add. Please provide some information about your trading day.",
    };
  }

  try {
    const entry = await prisma.journalEntry.create({
      data: {
        userId,
        date: entryDraft.date ? new Date(entryDraft.date) : new Date(),
        market: entryDraft.market,
        emotions: entryDraft.emotions,
        mistakes: entryDraft.mistakes,
        lessons: entryDraft.lessons,
        tags: entryDraft.tags || [],
        trades: (entryDraft.trades as any) || null,
      },
    });

    let response = "";

    // Add link for user to view the saved entry
    response += `🔗 https://racfella.racfathers.io/record?id=${entry.id}\n`;
    // Prompt user about on-chain save option (placeholder informational message)
    response += `⛓️ Save on-chain: You can persist this entry on-chain.\n`;

    return { finalResponse: response };
  } catch (error) {
    console.error("Error adding journal entry:", error);
    return {
      finalResponse: "❌ Failed to add journal entry. Please try again.",
    };
  }
}

// Get journal entries based on filters
async function journal_get_entries(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("📒 Retrieving journal entries");
  // Simplified: just provide the journal URL
  return {
    finalResponse: " Open journal: https://racfella.racfathers.io/journal",
  };
}

// Set a new goal
async function journal_set_goal(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("🎯 Setting new goal");

  const { userId, goalDraft } = state;

  if (!goalDraft?.text) {
    return {
      finalResponse:
        "❌ Please specify your goal. Example: 'My goal is to improve my win rate to 70%'",
    };
  }

  try {
    const parsedDue = parseDueDate(goalDraft.due);
    if (goalDraft.due && !parsedDue) {
      console.log(
        `⚠️ Unable to parse due date '${goalDraft.due}', storing null.`
      );
    }
    const goal = await prisma.journalGoal.create({
      data: {
        userId,
        text: goalDraft.text,
        target: goalDraft.target,
        due: parsedDue,
        status: "ACTIVE",
        progress: 0,
      },
    });

    let response = `🎯 New goal set!\n📝 **${goalDraft.text}**\n`;
    if (goalDraft.target) response += `🎯 Target: ${goalDraft.target}\n`;
    if (goalDraft.due && goal.due) {
      response += `📅 Due: ${goal.due.toISOString().split("T")[0]}\n`;
    } else if (goalDraft.due && !goal.due) {
      response += `📅 (Due ifadesi anlaşılamadı: "${goalDraft.due}")\n`;
    }

    return { finalResponse: response };
  } catch (error) {
    console.error("Error setting goal:", error);
    return { finalResponse: "❌ Failed to set goal. Please try again." };
  }
}

// Get all goals
async function journal_get_goals(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("🎯 Retrieving goals");

  const { userId } = state;

  try {
    const goals = await prisma.journalGoal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { checkIns: true },
    });

    if (goals.length === 0) {
      return {
        finalResponse:
          "🎯 No goals found. Set your first goal with 'My goal is...'",
      };
    }

    let response = `🎯 Your Goals:\n\n`;

    goals.forEach((goal, index) => {
      const statusEmoji =
        goal.status === "ACTIVE"
          ? "🟢"
          : goal.status === "COMPLETED"
          ? "✅"
          : "❌";
      response += `**${index + 1}. ${goal.text}** ${statusEmoji}\n`;
      response += `📊 Progress: ${goal.progress}%\n`;
      if (goal.target) response += `🎯 Target: ${goal.target}\n`;
      if (goal.due)
        response += `📅 Due: ${goal.due.toISOString().split("T")[0]}\n`;
      response += `💬 Check-ins: ${goal.checkIns.length}\n\n`;
    });

    return { goals, finalResponse: response };
  } catch (error) {
    console.error("Error retrieving goals:", error);
    return { finalResponse: "❌ Failed to retrieve goals. Please try again." };
  }
}

// Check in on goal progress
async function journal_checkin(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("🎯 Processing goal check-in");

  const { userId, inputMessage } = state;

  try {
    // Get most recent active goal
    const goal = await prisma.journalGoal.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    if (!goal) {
      return { finalResponse: "🎯 No active goals found. Set a goal first!" };
    }

    // Extract progress/score from message (simple extraction)
    const progressMatch = inputMessage.match(/(\d+)%/);
    const scoreMatch = inputMessage.match(/score[:\s]+(\d+)/i);

    const checkIn = await prisma.journalCheckIn.create({
      data: {
        userId,
        goalId: goal.id,
        note: inputMessage,
        score: scoreMatch ? parseInt(scoreMatch[1]) : null,
      },
    });

    // Update goal progress if percentage found
    if (progressMatch) {
      const newProgress = Math.min(100, parseInt(progressMatch[1]));
      await prisma.journalGoal.update({
        where: { id: goal.id },
        data: {
          progress: newProgress,
          status: newProgress >= 100 ? "COMPLETED" : "ACTIVE",
        },
      });
    }

    let response = `✅ Check-in recorded for: **${goal.text}**\n`;
    response += `📝 Note: ${inputMessage}\n`;
    if (progressMatch)
      response += `📊 Progress updated: ${progressMatch[1]}%\n`;

    return { finalResponse: response };
  } catch (error) {
    console.error("Error processing check-in:", error);
    return {
      finalResponse: "❌ Failed to process check-in. Please try again.",
    };
  }
}

// Generate journal summary
async function journal_summary(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("🧾 Generating journal summary");

  const { userId, filters } = state;

  try {
    // Default to last 30 days if no filters
    const fromDate = filters?.from
      ? new Date(filters.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = filters?.to ? new Date(filters.to) : new Date();

    const entries = await prisma.journalEntry.findMany({
      where: {
        userId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: "desc" },
    });

    const goals = await prisma.journalGoal.findMany({
      where: { userId },
      include: { checkIns: true },
    });

    if (entries.length === 0 && goals.length === 0) {
      return { finalResponse: "🧾 No journal data found for summary period." };
    }

    // Calculate metrics
    const totalEntries = entries.length;
    const totalTrades = entries.reduce((sum, entry) => {
      if (entry.trades && Array.isArray(entry.trades)) {
        return sum + (entry.trades as any).length;
      }
      return sum;
    }, 0);

    // Calculate win rate from trades with R values
    let winningTrades = 0;
    let totalTradesWithR = 0;
    let totalR = 0;

    entries.forEach((entry) => {
      if (entry.trades && Array.isArray(entry.trades)) {
        (entry.trades as any).forEach((trade: any) => {
          if (typeof trade.r === "number") {
            totalTradesWithR++;
            totalR += trade.r;
            if (trade.r > 0) winningTrades++;
          }
        });
      }
    });

    const winRate =
      totalTradesWithR > 0 ? (winningTrades / totalTradesWithR) * 100 : 0;
    const avgR = totalTradesWithR > 0 ? totalR / totalTradesWithR : 0;

    // Extract top mistakes and lessons
    const mistakes = entries
      .filter((e) => e.mistakes)
      .map((e) => e.mistakes)
      .slice(0, 3);
    const lessons = entries
      .filter((e) => e.lessons)
      .map((e) => e.lessons)
      .slice(0, 3);

    // Generate AI summary
    const summaryPrompt = `Analyze this trading journal data and provide a brief, encouraging summary:

📊 **Stats (${fromDate.toISOString().split("T")[0]} to ${
      toDate.toISOString().split("T")[0]
    })**
- Journal entries: ${totalEntries}
- Total trades logged: ${totalTrades}
- Win rate: ${winRate.toFixed(1)}%
- Average R: ${avgR.toFixed(2)}
- Active goals: ${goals.filter((g) => g.status === "ACTIVE").length}
- Completed goals: ${goals.filter((g) => g.status === "COMPLETED").length}

**Top Mistakes:**
${mistakes.map((m, i) => `${i + 1}. ${m}`).join("\n")}

**Top Lessons:**
${lessons.map((l, i) => `${i + 1}. ${l}`).join("\n")}

Provide a concise, motivational summary focusing on growth patterns and actionable insights.`;

    const aiSummary = await getAdvancedAnalysis(summaryPrompt);

    return {
      summaryText: aiSummary,
      finalResponse: aiSummary,
    };
  } catch (error) {
    console.error("Error generating summary:", error);
    return {
      finalResponse: "❌ Failed to generate summary. Please try again.",
    };
  }
}

// Generate final response
async function journal_respond(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("📒 Generating final journal response");

  if (state.finalResponse) {
    return { finalResponse: state.finalResponse };
  }

  return { finalResponse: "📒 Journal operation completed." };
}

// Create the journal subgraph
const journalStateGraph = new StateGraph<JournalState>({
  channels: {
    userId: null,
    inputMessage: null,
    isJournalRequest: null,
    journalAction: null,
    filters: null,
    entryDraft: null,
    goalDraft: null,
    entries: null,
    goals: null,
    summaryText: null,
    finalResponse: null,
  },
})
  .addNode("journal_parse", journal_parse)
  .addNode("journal_add_entry", journal_add_entry)
  .addNode("journal_get_entries", journal_get_entries)
  .addNode("journal_set_goal", journal_set_goal)
  .addNode("journal_get_goals", journal_get_goals)
  .addNode("journal_checkin", journal_checkin)
  .addNode("journal_summary", journal_summary)
  .addNode("journal_respond", journal_respond)
  .addNode("journal_route_action", (state: JournalState) => state)
  .addEdge("journal_parse", "journal_route_action")
  .addConditionalEdges(
    "journal_route_action",
    (state: JournalState) => state.journalAction || "ADD_ENTRY",
    {
      ADD_ENTRY: "journal_add_entry",
      GET_ENTRIES: "journal_get_entries",
      SET_GOAL: "journal_set_goal",
      GET_GOALS: "journal_get_goals",
      CHECKIN: "journal_checkin",
      SUMMARY: "journal_summary",
    }
  )
  .addEdge("journal_add_entry", "journal_respond")
  .addEdge("journal_get_entries", "journal_respond")
  .addEdge("journal_set_goal", "journal_respond")
  .addEdge("journal_get_goals", "journal_respond")
  .addEdge("journal_checkin", "journal_respond")
  .addEdge("journal_summary", "journal_respond")
  .addEdge("journal_respond", END)
  .setEntryPoint("journal_parse");

export const journalGraph = journalStateGraph.compile();
