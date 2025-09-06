import { StateGraph, END } from "@langchain/langgraph";
import { prisma } from "../db/prisma.js";
import { JournalState } from "./state.js";
import { getAdvancedAnalysis } from "../services/llmService.js";

// Parse and extract data for journal entries
async function journal_parse(
  state: JournalState
): Promise<Partial<JournalState>> {
  console.log("📒 Parsing journal intent and extracting data");

  const { inputMessage, journalAction, entryDraft } = state;

  // Extract data based on the message for ADD_ENTRY
  if (journalAction === "ADD_ENTRY") {
    const msg = inputMessage.toLowerCase();
    const draft = entryDraft || {};

    // Simple keyword extraction
    const emotions =
      msg.match(/(?:feel|feeling|emotion|mood)[s]?[:\s]+([^\.]+)/)?.[1] ||
      draft.emotions;
    const mistakes =
      msg.match(/(?:mistake|error|wrong)[s]?[:\s]+([^\.]+)/)?.[1] ||
      draft.mistakes;
    const lessons =
      msg.match(/(?:lesson|learn|takeaway)[s]?[:\s]+([^\.]+)/)?.[1] ||
      draft.lessons;
    const market =
      msg.match(/(?:market|trading|btc|eth|crypto)[:\s]+([^\.]+)/)?.[1] ||
      draft.market;

    // Extract tags from "tags:" patterns
    const tagMatch = msg.match(/tags?[:\s]+([^\.]+)/);
    const tags = tagMatch
      ? tagMatch[1].split(/[,\s]+/).filter((t) => t.length > 0)
      : draft.tags || [];

    return {
      entryDraft: {
        ...draft,
        date: draft.date || new Date().toISOString(),
        emotions,
        mistakes,
        lessons,
        market,
        tags,
      },
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

    let response = "✅ Journal entry added!\n";
    if (entryDraft.emotions)
      response += `😊 Emotions: ${entryDraft.emotions}\n`;
    if (entryDraft.mistakes)
      response += `❌ Mistakes: ${entryDraft.mistakes}\n`;
    if (entryDraft.lessons) response += `💡 Lessons: ${entryDraft.lessons}\n`;
    if (entryDraft.tags && entryDraft.tags.length > 0)
      response += `🏷️ Tags: ${entryDraft.tags.join(", ")}\n`;

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

  const { userId, filters } = state;

  try {
    let whereClause: any = { userId };

    if (filters?.from && filters?.to) {
      whereClause.date = {
        gte: new Date(filters.from),
        lte: new Date(filters.to),
      };
    } else if (filters?.from) {
      whereClause.date = { gte: new Date(filters.from) };
    } else if (filters?.to) {
      whereClause.date = { lte: new Date(filters.to) };
    }

    if (filters?.tag) {
      whereClause.tags = { has: filters.tag };
    }

    const entries = await prisma.journalEntry.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
      take: 10,
    });

    if (entries.length === 0) {
      return {
        finalResponse: "📒 No journal entries found for your criteria.",
      };
    }

    let response = `📒 Found ${entries.length} journal entries:\n\n`;

    entries.forEach((entry, index) => {
      const date = entry.date.toISOString().split("T")[0];
      response += `**${index + 1}. ${date}**\n`;
      if (entry.market) response += `🏪 Market: ${entry.market}\n`;
      if (entry.emotions) response += `😊 Emotions: ${entry.emotions}\n`;
      if (entry.mistakes) response += `❌ Mistakes: ${entry.mistakes}\n`;
      if (entry.lessons) response += `💡 Lessons: ${entry.lessons}\n`;
      if (entry.tags.length > 0)
        response += `🏷️ Tags: ${entry.tags.join(", ")}\n`;
      response += `\n`;
    });

    return { entries, finalResponse: response };
  } catch (error) {
    console.error("Error retrieving journal entries:", error);
    return {
      finalResponse: "❌ Failed to retrieve journal entries. Please try again.",
    };
  }
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
    const goal = await prisma.journalGoal.create({
      data: {
        userId,
        text: goalDraft.text,
        target: goalDraft.target,
        due: goalDraft.due ? new Date(goalDraft.due) : null,
        status: "ACTIVE",
        progress: 0,
      },
    });

    let response = `🎯 New goal set!\n📝 **${goalDraft.text}**\n`;
    if (goalDraft.target) response += `🎯 Target: ${goalDraft.target}\n`;
    if (goalDraft.due) response += `📅 Due: ${goalDraft.due}\n`;

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
