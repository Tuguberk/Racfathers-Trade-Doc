import { StateGraph } from "@langchain/langgraph";
import { prisma } from "../db/prisma.js";
import { AgentState } from "./state.js";
import {
  fetchMultiExchangePortfolio,
  fetchActivePositions,
  Position,
} from "../services/multiExchangeService.js";
import { PromptService } from "../services/promptService.js";
import {
  getAdvancedAnalysis,
  getEmbedding,
  getUtilityResponse,
} from "../services/llmService.js";
import {
  getCachedPortfolio,
  setCachedPortfolio,
  deleteCachedPortfolio,
} from "../services/redisService.js";
import { sendWhatsAppNotification } from "../services/notificationService.js";
import { journalGraph } from "../journal/graph.js";
import { looksLikeJournal } from "../journal/intent_keywords.js";
import { classifyJournalIntent, JournalNLP } from "../journal/llm_intent.js";
import { JOURNAL_FEATURE_ENABLED } from "../config.js";

// Helper function to detect crisis/suicide-related messages
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

// Helper function to detect portfolio-related requests
function isPortfolioRequest(message: string): boolean {
  const portfolioKeywords = [
    "portfolio",
    "assets",
    "holdings",
    "balance",
    "wallet",
    "coins",
    "tokens",
    "positions",
    "money",
    "funds",
    "show me",
    "get my",
    "fetch",
    "check my",
    "what do i have",
  ];

  const lowerMessage = message.toLowerCase();
  return portfolioKeywords.some((keyword) => {
    // For single words, use word boundary check to avoid partial matches
    if (!keyword.includes(" ")) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      return regex.test(lowerMessage);
    }
    // For phrases, use simple includes
    return lowerMessage.includes(keyword);
  });
}

// Helper function to detect position-related requests
function isPositionRequest(message: string): boolean {
  const positionKeywords = [
    "position",
    "positions",
    "active position",
    "open position",
    "futures",
    "long",
    "short",
    "pnl",
    "profit",
    "loss",
    "unrealized",
    "leverage",
  ];

  const lowerMessage = message.toLowerCase();
  return positionKeywords.some((keyword) => {
    // For single words, use word boundary check to avoid partial matches
    if (!keyword.includes(" ")) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      return regex.test(lowerMessage);
    }
    // For phrases, use simple includes
    return lowerMessage.includes(keyword);
  });
}

// Helper function to detect emotional/feelings-related messages
function isEmotionalMessage(message: string): boolean {
  const emotionalKeywords = [
    "feel",
    "feeling",
    "scared",
    "afraid",
    "worried",
    "anxious",
    "stress",
    "panic",
    "fear",
    "fomo",
    "excited",
    "nervous",
    "confident",
    "doubt",
    "regret",
    "sad",
    "happy",
    "frustrated",
    "angry",
    "confused",
    "lost",
    "overwhelmed",
    "depressed",
    "hopeful",
    "optimistic",
    "pessimistic",
  ];

  const lowerMessage = message.toLowerCase();
  return emotionalKeywords.some((keyword) => {
    // For single words, use word boundary check to avoid partial matches
    if (!keyword.includes(" ")) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      return regex.test(lowerMessage);
    }
    // For phrases, use simple includes
    return lowerMessage.includes(keyword);
  });
}

// Helper: detect explicit financial advice requests (keep simple/keyword-based)
function isFinancialAdviceRequest(message: string): boolean {
  const adviceKeywords = [
    "buy",
    "sell",
    "entry",
    "target",
    "stop loss",
    "take profit",
    "signal",
    "call",
    "long",
    "short",
    "buy btc",
    "sell btc",
    "buy eth",
    "sell eth",
  ];
  const lower = message.toLowerCase();
  return adviceKeywords.some((kw) => lower.includes(kw));
}

// Helper function to detect help / usage info requests
function isHelpRequest(message: string): boolean {
  const helpKeywords = [
    "help",
    "how do i",
    "how to use",
    "how can i",
    "what can you do",
    "what can u do",
    "what can i do",
    "commands",
    "command list",
    "features",
    "options",
    "usage",
    "instructions",
    "guide",
    "menu",
    "capabilities",
    "explain yourself",
  ];
  const lower = message.toLowerCase();
  return helpKeywords.some((kw) => lower.includes(kw));
}

// Helper function to detect if user wants fresh portfolio data
function shouldFetchFreshPortfolio(message: string): boolean {
  const freshDataKeywords = [
    "refresh",
    "update",
    "fetch",
    "get latest",
    "check current",
    "reload",
    "fresh",
    "new",
    "recent",
    "current",
    "now",
    "updated",
    "real-time",
    "live",
  ];

  const lowerMessage = message.toLowerCase();
  return freshDataKeywords.some((keyword) => {
    // For single words, use word boundary check to avoid partial matches
    if (!keyword.includes(" ")) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      return regex.test(lowerMessage);
    }
    // For phrases, use simple includes
    return lowerMessage.includes(keyword);
  });
}

// Format portfolio data into a clean table
function formatPortfolioTable(portfolioData: any): string {
  console.log(
    "🔍 Formatting portfolio table:",
    JSON.stringify(portfolioData, null, 2)
  );

  // Check for new multi-exchange structure
  const {
    exchanges = [],
    walletPortfolios = [],
    positions = [],
    combinedSummary,
  } = portfolioData;

  // If we have combinedSummary (new structure), use it
  if (combinedSummary && combinedSummary.totalUSDT > 0) {
    let table = `📊 *Portfolio Summary*\n`;
    table += `💰 Total: $${combinedSummary.totalUSDT.toLocaleString()}\n`;

    // Show positions summary if any
    if (combinedSummary.totalPositions > 0) {
      table += `🎯 Active Positions: ${combinedSummary.totalPositions}`;
      const pnlColor = combinedSummary.totalUnrealizedPnl >= 0 ? "🟢" : "🔴";
      table += ` | PnL: ${pnlColor} $${combinedSummary.totalUnrealizedPnl.toFixed(
        2
      )}\n`;
    }

    table += `\n`;

    // Show exchange breakdown
    if (combinedSummary.exchangesTotalUSDT > 0) {
      table += `🏦 Exchanges: $${combinedSummary.exchangesTotalUSDT.toLocaleString()}\n`;

      // Show individual exchange balances
      exchanges.forEach((exchange: any) => {
        if (exchange.totalUSDT > 0) {
          table += `   • ${
            exchange.exchange
          }: $${exchange.totalUSDT.toLocaleString()}\n`;
        }
      });
    }

    if (combinedSummary.walletUSDT > 0) {
      table += `🔗 Wallets: $${combinedSummary.walletUSDT.toLocaleString()}\n`;
    }

    table += `\n*Top Holdings:*\n`;

    // Show combined holdings from all sources
    const displayHoldings = combinedSummary.topCombinedHoldings.slice(0, 8);

    displayHoldings.forEach((holding: any, index: number) => {
      const percentage =
        combinedSummary.totalUSDT > 0
          ? ((holding.estUSDT / combinedSummary.totalUSDT) * 100).toFixed(1)
          : "0.0";

      let sourceIcon = "🏦";
      let sourceInfo = "";

      if (holding.source === "exchange") {
        sourceIcon = "🏦";
        sourceInfo = ` (${holding.exchange})`;
      } else if (holding.source === "wallet") {
        sourceIcon = "🔗";
        sourceInfo = holding.chain ? ` (${holding.chain})` : "";
      }

      table += `${index + 1}. ${sourceIcon} ${
        holding.asset
      }${sourceInfo}: $${holding.estUSDT.toFixed(0)} (${percentage}%)\n`;
    });

    return table;
  }

  // Fallback: Check old structure or empty portfolio
  const { totalUSDT, topHoldings } = portfolioData.summary || {
    totalUSDT: 0,
    topHoldings: [],
  };

  if (totalUSDT === 0 && exchanges.length === 0) {
    return "📊 *Portfolio Summary*\n\nNo assets found or all balances are zero.";
  }

  // Handle old structure if needed
  let table = `📊 *Portfolio Summary*\n`;
  table += `💰 Total: $${totalUSDT.toLocaleString()}\n\n`;

  if (topHoldings && topHoldings.length > 0) {
    table += `*Holdings:*\n`;
    const displayHoldings = topHoldings.slice(0, 6);

    displayHoldings.forEach((holding: any, index: number) => {
      const percentage =
        totalUSDT > 0
          ? ((holding.estUSDT / totalUSDT) * 100).toFixed(1)
          : "0.0";
      table += `${index + 1}. 🏦 ${holding.asset}: $${holding.estUSDT.toFixed(
        0
      )} (${percentage}%)\n`;
    });
  }

  return table;
}

// Format positions into a clean table
export function formatPositionsTable(positions: Position[]): string {
  if (!positions || positions.length === 0) {
    return "🎯 *Active Positions*\n\nNo active positions found.";
  }

  let table = `🎯 *Active Positions* (${positions.length})\n\n`;

  let totalPnl = 0;
  positions.forEach((position, index) => {
    const side = position.side === "long" ? "🟢 Long" : "🔴 Short";
    const pnl = position.unrealizedPnl || 0;
    const pnlColor = pnl >= 0 ? "🟢" : "🔴";
    const percentage = position.percentage || 0;
    const percentageColor = percentage >= 0 ? "🟢" : "🔴";

    totalPnl += pnl;

    table += `${index + 1}. ${side} ${position.symbol}\n`;
    table += `   💰 Size: ${position.size.toFixed(4)}`;
    if (position.leverage) {
      table += ` | ⚡ ${position.leverage}x`;
    }
    table += `\n`;
    table += `   🎯 Entry: $${position.entryPrice?.toFixed(2) || "N/A"}`;
    table += ` | 📊 Mark: $${position.markPrice?.toFixed(2) || "N/A"}\n`;
    table += `   ${pnlColor} PnL: $${pnl.toFixed(
      2
    )} (${percentageColor}${percentage.toFixed(2)}%)\n`;
    table += `   🏦 ${position.exchange}\n\n`;
  });

  const totalPnlColor = totalPnl >= 0 ? "🟢" : "🔴";
  table += `📈 *Total Unrealized PnL: ${totalPnlColor} $${totalPnl.toFixed(
    2
  )}*`;

  return table;
}

// Generate portfolio analysis summary
function generatePortfolioSummary(portfolioData: any): string {
  // Use new multi-exchange structure
  const { combinedSummary, exchanges = [] } = portfolioData;

  if (combinedSummary && combinedSummary.totalUSDT > 0) {
    const totalUSDT = combinedSummary.totalUSDT;
    const exchangeCount = exchanges.filter(
      (ex: any) => ex.totalUSDT > 0
    ).length;
    const topHolding = combinedSummary.topCombinedHoldings?.[0];

    let summary = `You have $${totalUSDT.toLocaleString()} across ${exchangeCount} exchange(s)`;

    if (combinedSummary.topCombinedHoldings.length > 5) {
      summary += " with a well-diversified portfolio";
    } else if (combinedSummary.topCombinedHoldings.length > 3) {
      summary += " with a moderately diversified portfolio";
    } else {
      summary += " with a concentrated portfolio";
    }

    if (topHolding && topHolding.estUSDT > 0) {
      const topPercentage = ((topHolding.estUSDT / totalUSDT) * 100).toFixed(1);
      summary += `, with ${topHolding.asset} being your largest position at ${topPercentage}%.`;
    }

    return summary;
  }

  // Fallback for old structure or empty portfolio
  const { totalUSDT, topHoldings } = portfolioData.summary || {
    totalUSDT: 0,
    topHoldings: [],
  };

  if (totalUSDT === 0) {
    return "Your portfolio appears to be empty or all positions are very small.";
  }

  const assetCount = topHoldings.length;
  const topAsset = topHoldings[0];
  const diversification =
    assetCount > 5
      ? "well-diversified"
      : assetCount > 3
      ? "moderately diversified"
      : "concentrated";

  let summary = `You have $${totalUSDT.toLocaleString()} across ${assetCount} assets. `;
  summary += `Your portfolio is ${diversification}`;

  if (topAsset && topAsset.estUSDT > 0) {
    const topPercentage = ((topAsset.estUSDT / totalUSDT) * 100).toFixed(1);
    summary += `, with ${topAsset.asset} being your largest position at ${topPercentage}%.`;
  }

  return summary;
}

async function retrieve_user_and_history(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(
    `📋 Step 1: Retrieving user and chat history for user: ${state.userId}`
  );
  const user = await prisma.user.findUnique({
    where: { id: state.userId },
  });
  if (!user) {
    console.error(`❌ User not found: ${state.userId}`);
    throw new Error("User not found");
  }
  const messages = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { timestamp: "asc" },
  });
  console.log(`💬 Retrieved ${messages.length} chat messages from history`);
  return {
    chatHistory: messages.map((m: any) => ({
      sender: m.sender,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    })),
  };
}

// Journal routing functions
async function route_intent(state: AgentState): Promise<Partial<AgentState>> {
  if (!JOURNAL_FEATURE_ENABLED) return { isJournalRequest: false };

  // Crisis has priority (reuse existing helper)
  const crisis = isCrisisMessage(state.inputMessage);
  if (crisis.isCrisis) return { isCrisisMessage: true };

  if (!looksLikeJournal(state.inputMessage)) return { isJournalRequest: false };

  const nlp = await classifyJournalIntent(state.inputMessage);
  if (nlp.crisis_flag) return { isCrisisMessage: true };

  const MIN = 0.6;
  // Prioritize explicit goal setting regardless of confidence
  const conf = nlp.confidence ?? 0;
  const action =
    nlp.intent === "SET_GOAL"
      ? "SET_GOAL"
      : nlp.intent === "NONE" || conf < MIN
      ? "ADD_ENTRY"
      : (nlp.intent as any);
  return {
    isJournalRequest: true,
    journalAction: action,
    journalNLP: nlp as any,
  };
}

async function handle_journal(state: AgentState): Promise<Partial<AgentState>> {
  const nlp = (state as any).journalNLP as JournalNLP | undefined;
  const result = await journalGraph.invoke({
    userId: state.userId,
    inputMessage: state.inputMessage,
    isJournalRequest: true,
    journalAction:
      nlp?.intent && nlp.intent !== "NONE" ? (nlp.intent as any) : "ADD_ENTRY",
    filters: nlp?.range
      ? { from: nlp.range.from, to: nlp.range.to }
      : undefined,
    entryDraft: { date: nlp?.date, tags: nlp?.tags },
    goalDraft:
      nlp?.intent === "SET_GOAL"
        ? {
            text: nlp.goal_text || state.inputMessage,
            due: nlp.goal_due,
            target: nlp.goal_target,
          }
        : undefined,
  });
  return {
    finalResponse:
      (result as any).finalResponse || "📒 Journal operation completed.",
  };
}

async function check_cached_portfolio(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(
    `🗄️  Step 2: Checking cached portfolio for user: ${state.userId}`
  );

  const shouldFetchFresh = shouldFetchFreshPortfolio(state.inputMessage);
  console.log(`🔄 User wants fresh data: ${shouldFetchFresh}`);

  if (shouldFetchFresh) {
    console.log(`🔄 User requested fresh data, skipping cache`);
    // Clear existing cache if user wants fresh data
    await deleteCachedPortfolio(state.userId);
    return {
      shouldFetchFreshPortfolio: true,
      hasCachedPortfolio: false,
    };
  }

  // Check for cached portfolio
  const cachedPortfolio = await getCachedPortfolio(state.userId);

  if (cachedPortfolio) {
    console.log(`✅ Found cached portfolio data (10min cache)`);
    return {
      portfolioData: cachedPortfolio,
      shouldFetchFreshPortfolio: false,
      hasCachedPortfolio: true,
    };
  }

  console.log(`❌ No cached portfolio found, will fetch fresh data`);
  return {
    shouldFetchFreshPortfolio: true,
    hasCachedPortfolio: false,
  };
}

async function fetch_and_analyze_portfolio(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(
    `💰 Step 3: Fetching and analyzing portfolio for user: ${state.userId}`
  );
  const user = await prisma.user.findUnique({ where: { id: state.userId } });
  if (!user) {
    console.error(`❌ User not found during portfolio fetch: ${state.userId}`);
    throw new Error("User not found");
  }

  // Send immediate notification to user that portfolio fetching has started
  await sendWhatsAppNotification(
    user.whatsappNumber,
    "🔄 Fetching your portfolio data from all exchanges and blockchain wallets... This may take a few moments."
  );

  try {
    console.log(`🏦 Fetching multi-exchange portfolio for user: ${user.id}`);
    const portfolio = await fetchMultiExchangePortfolio(user.id);
    console.log(`📊 Multi-exchange portfolio data retrieved successfully`);
    console.log(
      `💼 Portfolio summary: Total exchanges: ${portfolio.exchanges.length}, Total USD: $${portfolio.combinedSummary.totalUSDT}`
    );

    // Log exchange breakdown
    if (portfolio.exchanges?.length > 0) {
      portfolio.exchanges.forEach((exchange) => {
        console.log(
          `🏦 ${exchange.exchange}: $${exchange.totalUSDT.toLocaleString()} (${
            exchange.holdings.length
          } assets)`
        );
        if (exchange.error) {
          console.warn(`⚠️ ${exchange.exchange} error: ${exchange.error}`);
        }
      });
    }

    // Log wallet portfolio summary if available
    if (portfolio.walletPortfolios?.length > 0) {
      console.log(
        `🔗 Wallet portfolios: ${
          portfolio.walletPortfolios.length
        } wallets, $${portfolio.combinedSummary.walletUSDT.toLocaleString()}`
      );
    }

    // Cache the portfolio for 10 minutes (600 seconds)
    console.log(`💾 Caching multi-exchange portfolio data for 10 minutes`);
    await setCachedPortfolio(user.id, portfolio, 600);

    // Save snapshot async (non-blocking)
    prisma.portfolioSnapshot
      .create({ data: { userId: user.id, data: portfolio as any } })
      .catch((err: any) => {
        console.error(`⚠️  Failed to save portfolio snapshot:`, err.message);
      });

    return { portfolioData: portfolio };
  } catch (error: any) {
    console.error(`❌ Failed to fetch portfolio:`, error.message);
    throw error;
  }
}

// Analyze and route to a single mode: crisis | journal | portfolio_position | financial_advice | psychology
async function analyze_and_route(
  state: AgentState
): Promise<Partial<AgentState>> {
  const msg = state.inputMessage || "";
  console.log(
    `🤖 Analyzing user intent with LLM for message: "${msg.substring(
      0,
      100
    )}..."`
  );

  // Step 1: Crisis detection (highest priority - always check first)
  const crisis = isCrisisMessage(msg);
  if (crisis.isCrisis) {
    console.log(`🚨 CRISIS DETECTED: Routing to crisis handler`);
    return { intent: "crisis", isCrisisMessage: true };
  }

  // Step 2: LLM-based Intent Classification
  const intentAnalysisPrompt = `You are a trading psychology AI assistant. Analyze the user's message and classify their intent.

User Message: "${msg}"
Recent Chat History: ${JSON.stringify((state.chatHistory || []).slice(-5))}

Classify the user's intent as one of these categories:
1. "crisis" - User expresses suicidal thoughts, extreme despair, self-harm, or severe financial distress
2. "journal" - User wants to write journal, reflect, set goals, or review past entries
3. "portfolio_position" - User asks about their portfolio, positions, balances, holdings, or wants to check their assets
4. "financial_advice" - User asks for trading signals, buy/sell recommendations, or specific investment advice
5. "psychology" - User discusses emotions, feelings, stress, or needs emotional support
6. "help" - User asks what you can do, wants a command list, features, usage instructions, or how to use the assistant

Respond with a JSON object containing:
{
  "intent": "category_name",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why you chose this category"
}

Be precise and consider the context. If uncertain, use "psychology" as default.`;

  let llmIntentResponse;
  try {
    llmIntentResponse = await getUtilityResponse(intentAnalysisPrompt);
    console.log(`🧠 LLM Intent Analysis Result: ${llmIntentResponse}`);
  } catch (error) {
    console.warn(
      "LLM intent classification failed, falling back to keyword analysis:",
      error
    );
    return await fallbackKeywordRouting(state);
  }

  // Parse LLM response to extract intent and confidence
  const { intent, confidence, reasoning } =
    parseIntentResponse(llmIntentResponse);
  console.log(
    `📊 Parsed Intent: ${intent} (confidence: ${confidence}%) - ${reasoning}`
  );

  // Step 3: Route based on LLM classification with confidence thresholds
  if (confidence >= 0.8) {
    return await routeByIntent(intent, state, msg);
  } else if (confidence >= 0.6) {
    // Medium confidence - validate with keyword checks
    console.log(
      `🔍 Medium confidence (${confidence}%), validating with keywords`
    );
    const keywordValidation = await validateIntentWithKeywords(intent, msg);

    if (keywordValidation.isValid) {
      console.log(`✅ Keyword validation passed for ${intent}`);
      return await routeByIntent(intent, state, msg);
    } else {
      console.log(`❌ Keyword validation failed, using fallback routing`);
      return await fallbackKeywordRouting(state);
    }
  } else {
    // Low confidence - use keyword-based fallback
    console.log(
      `⚠️ Low confidence (${confidence}%), using keyword-based routing`
    );
    return await fallbackKeywordRouting(state);
  }
}

// Helper function to parse LLM intent response
function parseIntentResponse(response: string): {
  intent: string;
  confidence: number;
  reasoning: string;
} {
  try {
    // Try to extract JSON if present
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: parsed.intent || "psychology",
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || "No reasoning provided",
      };
    }

    // Fallback: extract intent from text
    const intentMatch = response.toLowerCase().match(/intent[:\s]+([a-z_]+)/);
    const confidenceMatch = response.match(/confidence[:\s]+(\d+)/);

    return {
      intent: intentMatch?.[1] || "psychology",
      confidence: confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.5,
      reasoning: response.substring(0, 200),
    };
  } catch (error) {
    console.warn("Failed to parse intent response:", error);
    return {
      intent: "psychology",
      confidence: 0.3,
      reasoning: "Failed to parse response",
    };
  }
}

// Helper function to validate intent with keyword matching
async function validateIntentWithKeywords(
  intent: string,
  message: string
): Promise<{ isValid: boolean; details: string }> {
  const lowerMsg = message.toLowerCase();

  switch (intent) {
    case "portfolio_position":
      const hasPortfolioKeywords =
        isPortfolioRequest(message) || isPositionRequest(message);
      return {
        isValid: hasPortfolioKeywords,
        details: "Checked portfolio/position keywords",
      };

    case "financial_advice":
      const hasAdviceKeywords = isFinancialAdviceRequest(message);
      return {
        isValid: hasAdviceKeywords,
        details: "Checked financial advice keywords",
      };

    case "journal":
      const hasJournalKeywords =
        JOURNAL_FEATURE_ENABLED && looksLikeJournal(message);
      return {
        isValid: hasJournalKeywords,
        details: "Checked journal keywords",
      };

    case "crisis":
      const hasCrisisKeywords = isCrisisMessage(message).isCrisis;
      return { isValid: hasCrisisKeywords, details: "Checked crisis keywords" };

    case "psychology":
      // Psychology is default - always valid
      return { isValid: true, details: "Psychology is default intent" };

    default:
      return { isValid: false, details: "Unknown intent" };
  }
}

// Helper function to route based on validated intent
async function routeByIntent(
  intent: string,
  state: AgentState,
  message: string
): Promise<Partial<AgentState>> {
  console.log(`🎯 Routing to intent: ${intent}`);

  switch (intent) {
    case "crisis":
      return { intent: "crisis", isCrisisMessage: true };

    case "help":
      return { intent: "help", isHelpRequest: true };

    case "journal":
      if (!JOURNAL_FEATURE_ENABLED) {
        console.log(`📒 Journal feature disabled, falling back to psychology`);
        return await routeByIntent("psychology", state, message);
      }

      try {
        const nlp = await classifyJournalIntent(message);
        if (nlp.crisis_flag) return { intent: "crisis", isCrisisMessage: true };

        const MIN = 0.6;
        const conf = nlp.confidence ?? 0;
        const action =
          nlp.intent === "SET_GOAL"
            ? "SET_GOAL"
            : nlp.intent === "NONE" || conf < MIN
            ? "ADD_ENTRY"
            : (nlp.intent as any);

        return {
          intent: "journal",
          isJournalRequest: true,
          journalAction: action,
          journalNLP: nlp as any,
        };
      } catch (e) {
        console.warn("Journal NLP failed, falling back to psychology:", e);
        return await routeByIntent("psychology", state, message);
      }

    case "portfolio_position":
      const isPosition = isPositionRequest(message);
      const isPortfolio = !isPosition && isPortfolioRequest(message);
      return {
        intent: "portfolio_position",
        isPositionRequest: isPosition,
        isPortfolioRequest: isPortfolio || !isPosition,
      };

    case "financial_advice":
      return {
        intent: "financial_advice",
        isFinancialAdviceRequest: true,
      };

    case "psychology":
    default:
      // Generate psychological analysis
      const psychPrompt = await PromptService.getPrompt("psychology_analysis", {
        inputMessage: message,
        recentHistory: JSON.stringify((state.chatHistory || []).slice(-5)),
        isEmotional: String(isEmotionalMessage(message)),
        isCrisis: "false",
      });
      const psychAnalysis = await getUtilityResponse(psychPrompt);

      return {
        intent: "psychology",
        isEmotionalMessage: isEmotionalMessage(message),
        psychologicalAnalysis: psychAnalysis,
      };
  }
}

// Help / usage handler
async function handle_help(state: AgentState): Promise<Partial<AgentState>> {
  const helpMessage = `🛟 *Assistant Help & Commands*

I can support you in several areas. Try messages like:

📒 Journal:
  • "I want to reflect on today's trades"
  • "Set a goal to improve risk management"

💰 Portfolio & Positions:
  • "Show my portfolio"
  • "List my open positions"
  • "Refresh my holdings"

🧠 Psychology & Emotions:
  • "I'm feeling anxious after that loss"
  • "Help me stay disciplined"

🎯 Goals:
  • "Set a goal: reduce overtrading"
  • "Add a goal to journal daily"

📊 Commands / Keywords:
  • portfolio / positions / refresh
  • journal / goal / reflect
  • feelings like anxious, stressed, FOMO

❓ You can ask: "What can you do?" anytime.

Let me know what you'd like to do next.`;

  return { finalResponse: helpMessage };
}

// Fallback keyword-based routing (original logic)
async function fallbackKeywordRouting(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(`🔄 Using fallback keyword-based routing`);
  const msg = state.inputMessage || "";

  // Crisis first
  const crisis = isCrisisMessage(msg);
  if (crisis.isCrisis) {
    return { intent: "crisis", isCrisisMessage: true };
  }

  // Journal (if enabled)
  if (JOURNAL_FEATURE_ENABLED && looksLikeJournal(msg)) {
    try {
      const nlp = await classifyJournalIntent(msg);
      if (nlp.crisis_flag) return { intent: "crisis", isCrisisMessage: true };
      const MIN = 0.6;
      const conf = nlp.confidence ?? 0;
      const action =
        nlp.intent === "SET_GOAL"
          ? "SET_GOAL"
          : nlp.intent === "NONE" || conf < MIN
          ? "ADD_ENTRY"
          : (nlp.intent as any);
      return {
        intent: "journal",
        isJournalRequest: true,
        journalAction: action,
        journalNLP: nlp as any,
      };
    } catch (e) {
      console.warn("Journal NLP failed; continuing intent analysis", e);
    }
  }

  // Portfolio / Position
  const posReq = isPositionRequest(msg);
  const portReq = !posReq && isPortfolioRequest(msg);
  if (posReq || portReq) {
    return {
      intent: "portfolio_position",
      isPositionRequest: posReq,
      isPortfolioRequest: portReq || !posReq,
    };
  }

  // Help / Usage
  if (isHelpRequest(msg)) {
    return { intent: "help", isHelpRequest: true };
  }

  // Financial advice
  if (isFinancialAdviceRequest(msg)) {
    return {
      intent: "financial_advice",
      isFinancialAdviceRequest: true,
    };
  }

  // Psychology (default)
  const psychPrompt = await PromptService.getPrompt("psychology_analysis", {
    inputMessage: msg,
    recentHistory: JSON.stringify((state.chatHistory || []).slice(-5)),
    isEmotional: String(isEmotionalMessage(msg)),
    isCrisis: "false",
  });
  const psych = await getUtilityResponse(psychPrompt);
  return {
    intent: "psychology",
    isEmotionalMessage: isEmotionalMessage(msg),
    psychologicalAnalysis: psych,
  };
}

async function search_knowledge_base(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(`📚 Step 5: Searching knowledge base`);

  // Special crisis intervention query
  let queryText;
  if (state.isCrisisMessage) {
    queryText = `crisis intervention suicide prevention mental health emergency support financial loss depression`;
    console.log(`🚨 CRISIS QUERY: "${queryText}"`);
  } else {
    queryText = `trading psychology advice for state: ${state.psychologicalAnalysis}`;
    console.log(`🔍 Knowledge query: "${queryText}"`);
  }

  const embedding = await getEmbedding(queryText);
  console.log(`🧮 Generated embedding vector (length: ${embedding.length})`);

  // Query pgvector via raw SQL; limit 2
  const vectorLiteral = `[${embedding.join(",")}]`;
  console.log(`🔎 Executing vector similarity search in knowledge base`);

  try {
    const rows: Array<{ id: string; content: string; author: string }> =
      await prisma.$queryRawUnsafe(
        `SELECT id, content, author FROM "KnowledgeArticle" ORDER BY embedding <-> '${vectorLiteral}'::vector LIMIT 2`
      );
    console.log(`📖 Found ${rows.length} relevant knowledge articles`);
    rows.forEach((row, index) => {
      console.log(
        `📄 Article ${index + 1} (ID: ${row.id}): ${row.content.substring(
          0,
          100
        )}...`
      );
    });

    const knowledge = rows
      .map((r) => `${r.content}\nAuthor: ${r.author}`)
      .join("\n\n---\n\n");
    return { relevantKnowledge: knowledge };
  } catch (error: any) {
    console.error(`❌ Failed to search knowledge base:`, error.message);
    return { relevantKnowledge: "" };
  }
}

// Crisis mode handler
async function handle_crisis(state: AgentState): Promise<Partial<AgentState>> {
  const crisisPrompt = await PromptService.getPrompt("crisis_intervention", {
    inputMessage: state.inputMessage,
    psychAnalysis: state.psychologicalAnalysis,
    knowledge: state.relevantKnowledge,
    isCrisis: "true",
  });
  const crisisResponse = await getAdvancedAnalysis(crisisPrompt);

  try {
    const user = await prisma.user.findUnique({
      where: { id: state.userId },
      select: { whatsappNumber: true, id: true },
    });
    const userInfo = user
      ? `User: ${user.whatsappNumber} (ID: ${user.id})`
      : `User ID: ${state.userId}`;
    await sendWhatsAppNotification(
      process.env.ADMIN_WHATSAPP_NUMBER || "whatsapp:+905516105835",
      `🚨 CRISIS ALERT: Immediate attention required.\n\n${userInfo}\n\nMessage: "${state.inputMessage}"`
    );
  } catch (error) {
    console.error(`❌ Failed to send crisis alert:`, error);
  }

  return { finalResponse: `🚨 ${crisisResponse}` };
}

// Portfolio/Position mode: assumes portfolioData is ready (or empty)
async function generate_portfolio_response(
  state: AgentState
): Promise<Partial<AgentState>> {
  const responses: string[] = [];
  if (state.portfolioData) {
    const cacheIndicator = state.hasCachedPortfolio ? " 📋 Cached" : " 🔄 Live";
    responses.push(formatPortfolioTable(state.portfolioData) + cacheIndicator);

    const positions = state.portfolioData.positions || [];
    if (state.isPositionRequest && positions.length > 0) {
      responses.push(formatPositionsTable(positions as Position[]));
    }

    const portfolioSummary = generatePortfolioSummary(state.portfolioData);
    const analysisPrompt = await PromptService.getPrompt("portfolio_analysis", {
      portfolioSummary,
      psychAnalysis: state.psychologicalAnalysis,
      knowledge: state.relevantKnowledge,
    });
    const insight = (await getAdvancedAnalysis(analysisPrompt)).trim();
    if (insight) responses.push(insight);
  } else {
    responses.push(
      "Couldn't access your portfolio right now. Please try again shortly."
    );
  }
  return { finalResponse: responses.filter(Boolean).join("\n\n---\n\n") };
}

// Psychology mode handler
async function handle_psychology(
  state: AgentState
): Promise<Partial<AgentState>> {
  const generalPrompt = await PromptService.getPrompt("emotional_support", {
    inputMessage: state.inputMessage,
    psychAnalysis: state.psychologicalAnalysis,
    knowledge: state.relevantKnowledge,
  });
  const response = (await getAdvancedAnalysis(generalPrompt)).trim();
  return {
    finalResponse:
      response ||
      "I'm here to support you through your trading journey. How are you feeling right now? 💙",
  };
}

// Financial Advice mode handler (educational, non-prescriptive)
async function handle_financial_advice(
  state: AgentState
): Promise<Partial<AgentState>> {
  const guidancePrompt = await PromptService.getPrompt("financial_guidance", {
    inputMessage: state.inputMessage,
    psychAnalysis: state.psychologicalAnalysis,
    knowledge: state.relevantKnowledge,
  });
  const response = (await getAdvancedAnalysis(guidancePrompt)).trim();
  return {
    finalResponse:
      response ||
      "I can't provide direct buy/sell signals. We can instead define your risk per trade, entry criteria, and invalidation level. Want a simple checklist?",
  };
}

// Conditional function to decide route after analyze_and_route with better error handling
function routeByAnalyzedIntent(state: AgentState): string {
  const intent = state.intent;
  console.log(`🎯 Routing decision for intent: "${intent}"`);

  // Validate intent is one of the expected values
  const validIntents = [
    "crisis",
    "journal",
    "portfolio_position",
    "financial_advice",
    "psychology",
    "help",
  ];

  if (!intent || !validIntents.includes(intent)) {
    console.warn(
      `⚠️ Invalid or missing intent: "${intent}", defaulting to psychology`
    );
    return "psychology";
  }

  // Special case: If journal is disabled, route to psychology
  if (intent === "journal" && !JOURNAL_FEATURE_ENABLED) {
    console.log(`📒 Journal feature disabled, routing to psychology instead`);
    return "psychology";
  }

  console.log(`✅ Valid intent confirmed: ${intent}`);
  return intent;
}

// Conditional function to decide whether to fetch fresh portfolio or use cache
function portfolioDecision(state: AgentState): string {
  return state.shouldFetchFreshPortfolio ? "fetch" : "generate";
}

// Conditional function to decide whether to search knowledge base
function nextAfterKnowledge(state: AgentState): string {
  return state.intent === "financial_advice" ? "fa" : "psych";
}

const graph = new StateGraph<AgentState>({
  channels: {
    userId: null,
    inputMessage: null,
    chatHistory: null,
    portfolioData: null,
    psychologicalAnalysis: null,
    relevantKnowledge: null,
    finalResponse: null,
    isPortfolioRequest: null,
    isPositionRequest: null,
    isEmotionalMessage: null,
    isCrisisMessage: null,
    intent: null,
    isFinancialAdviceRequest: null,
    shouldFetchFreshPortfolio: null,
    hasCachedPortfolio: null,
    isJournalRequest: null,
    journalAction: null,
    journalNLP: null,
  },
})
  .addNode("retrieve_user_and_history", retrieve_user_and_history)
  .addNode("analyze_and_route", analyze_and_route)
  .addNode("handle_crisis", handle_crisis)
  .addNode("handle_journal", handle_journal)
  .addNode("handle_help", handle_help)
  .addNode("check_cached_portfolio", check_cached_portfolio)
  .addNode("fetch_and_analyze_portfolio", fetch_and_analyze_portfolio)
  .addNode("generate_portfolio_response", generate_portfolio_response)
  .addNode("search_knowledge_base", search_knowledge_base)
  .addNode("handle_psychology", handle_psychology)
  .addNode("handle_financial_advice", handle_financial_advice)
  .addEdge("__start__", "retrieve_user_and_history")
  .addEdge("retrieve_user_and_history", "analyze_and_route")
  .addConditionalEdges(
    "analyze_and_route",
    (s: AgentState) => s.intent || "end",
    {
      crisis: "handle_crisis",
      journal: "handle_journal",
      help: "handle_help",
      portfolio_position: "check_cached_portfolio",
      financial_advice: "search_knowledge_base",
      psychology: "search_knowledge_base",
      end: "__end__",
    }
  )
  .addEdge("handle_crisis", "__end__")
  .addEdge("handle_journal", "__end__")
  .addEdge("handle_help", "__end__")
  .addConditionalEdges("check_cached_portfolio", portfolioDecision, {
    fetch: "fetch_and_analyze_portfolio",
    generate: "generate_portfolio_response",
  })
  .addEdge("fetch_and_analyze_portfolio", "generate_portfolio_response")
  .addEdge("generate_portfolio_response", "__end__")
  .addConditionalEdges("search_knowledge_base", nextAfterKnowledge, {
    fa: "handle_financial_advice",
    psych: "handle_psychology",
  })
  .addEdge("handle_financial_advice", "__end__")
  .addEdge("handle_psychology", "__end__");

console.log(
  `🚀 AI Agent graph compiled with 11 nodes (crisis | journal | portfolio_position | financial_advice | psychology | help)`
);

// Compile the graph
export const mainAgent = graph.compile();

// Export the graph for LangGraph Studio
export const graph_definition = graph;
