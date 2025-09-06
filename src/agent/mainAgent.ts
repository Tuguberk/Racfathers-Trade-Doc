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
  const action =
    nlp.intent === "NONE" || nlp.confidence < MIN
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
        ? { text: nlp.goal_text, due: nlp.goal_due, target: nlp.goal_target }
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

async function analyze_message_intent(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(`🔍 Step 4: Analyzing message intent`);
  console.log(`📝 Current message: "${state.inputMessage}"`);

  const isPortfolioReq = isPortfolioRequest(state.inputMessage);
  const isEmotionalReq = isEmotionalMessage(state.inputMessage);
  const crisisResult = isCrisisMessage(state.inputMessage);
  const isCrisisReq = crisisResult.isCrisis;

  console.log(`📊 Portfolio request detected: ${isPortfolioReq}`);
  console.log(`💭 Emotional message detected: ${isEmotionalReq}`);
  console.log(`🚨 CRISIS MESSAGE DETECTED: ${isCrisisReq}`);

  if (isCrisisReq) {
    console.log(
      `🚨 CRISIS TRIGGER WORDS: [${crisisResult.triggerWords.join(", ")}]`
    );
  }

  // URGENT: Force psychological analysis for crisis messages regardless of portfolio request
  if (isCrisisReq) {
    console.log(
      `🚨 CRISIS INTERVENTION: Forcing psychological analysis for urgent case`
    );
    return {
      psychologicalAnalysis: "", // Will be filled in next step
      isPortfolioRequest: isPortfolioReq,
      isEmotionalMessage: true, // Force emotional processing
      isCrisisMessage: true,
      relevantKnowledge: "", // Will search crisis intervention knowledge
    };
  }

  console.log(`📊 Portfolio request detected: ${isPortfolioReq}`);
  console.log(`💭 Emotional message detected: ${isEmotionalReq}`);

  // Skip psychological analysis for portfolio requests
  if (isPortfolioReq) {
    console.log(`📊 Skipping psychological analysis for portfolio request`);
    return {
      psychologicalAnalysis: "", // Empty for portfolio requests
      isPortfolioRequest: isPortfolioReq,
      isEmotionalMessage: isEmotionalReq,
      relevantKnowledge: "", // Skip knowledge base for portfolio requests
    };
  }

  // Analyze user's psychological state with context for non-portfolio requests
  const psychPrompt = await PromptService.getPrompt("psychology_analysis", {
    inputMessage: state.inputMessage,
    recentHistory: JSON.stringify(state.chatHistory.slice(-5)),
    isEmotional: isEmotionalReq.toString(),
    isCrisis: isCrisisReq.toString(), // Add crisis context
  });

  const psychAnalysis = await getUtilityResponse(psychPrompt);
  console.log(`🧠 Psychology analysis: ${psychAnalysis}`);

  return {
    psychologicalAnalysis: psychAnalysis,
    isPortfolioRequest: isPortfolioReq,
    isEmotionalMessage: isEmotionalReq,
    isCrisisMessage: isCrisisReq,
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
    const rows: Array<{ id: string; content: string }> =
      await prisma.$queryRawUnsafe(
        `SELECT id, content FROM "KnowledgeArticle" ORDER BY embedding <-> '${vectorLiteral}'::vector LIMIT 2`
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

    const knowledge = rows.map((r) => r.content).join("\n\n");
    return { relevantKnowledge: knowledge };
  } catch (error: any) {
    console.error(`❌ Failed to search knowledge base:`, error.message);
    return { relevantKnowledge: "" };
  }
}

async function generate_final_response(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(`✍️  Step 6: Generating final response`);
  console.log(state);

  // 🚨 URGENT CRISIS INTERVENTION
  if (state.isCrisisMessage) {
    console.log(`🚨 GENERATING CRISIS INTERVENTION RESPONSE`);

    const crisisPrompt = await PromptService.getPrompt("crisis_intervention", {
      inputMessage: state.inputMessage,
      psychAnalysis: state.psychologicalAnalysis,
      knowledge: state.relevantKnowledge,
      isCrisis: "true",
    });

    const crisisResponse = await getAdvancedAnalysis(crisisPrompt);

    // Get user information for crisis alert
    const user = await prisma.user.findUnique({
      where: { id: state.userId },
      select: { whatsappNumber: true, id: true },
    });

    // Send urgent notification to admin/support team with user details
    try {
      const userInfo = user
        ? `User: ${user.whatsappNumber} (ID: ${user.id})`
        : `User ID: ${state.userId}`;
      await sendWhatsAppNotification(
        process.env.ADMIN_WHATSAPP_NUMBER || "whatsapp:+905516105835",
        `🚨 CRISIS ALERT: User showing suicidal ideation. Immediate attention required.\n\n${userInfo}\n\nMessage: "${state.inputMessage}"\n\nPlease contact immediately!`
      );
      console.log(
        `🚨 Crisis alert sent to admin for user: ${
          user?.whatsappNumber || state.userId
        }`
      );
    } catch (error) {
      console.error(`❌ Failed to send crisis alert:`, error);
    }

    return { finalResponse: `🚨 ${crisisResponse}` };
  }
  console.log(`📊 Is portfolio request: ${state.isPortfolioRequest}`);

  let responses: string[] = [];

  // Handle portfolio requests specifically
  if (state.isPortfolioRequest && state.portfolioData) {
    console.log(`📈 Generating portfolio-specific response`);

    // Add cache indicator to portfolio display
    const cacheIndicator = state.hasCachedPortfolio
      ? " (📋 Cached)"
      : " (🔄 Live)";

    // First message: Portfolio table
    const portfolioTable = formatPortfolioTable(state.portfolioData);
    responses.push(portfolioTable + cacheIndicator);

    // Second message: Analysis and advice
    const portfolioSummary = generatePortfolioSummary(state.portfolioData);

    const analysisPrompt = await PromptService.getPrompt("portfolio_analysis", {
      portfolioSummary,
      psychAnalysis: state.psychologicalAnalysis,
      knowledge: state.relevantKnowledge,
    });

    console.log(`🔍 Portfolio analysis prompt prepared`);
    const psychInsight = await getAdvancedAnalysis(analysisPrompt);

    // Ensure the response is properly formatted
    const formattedInsight = psychInsight.trim();
    if (formattedInsight) {
      responses.push(`${formattedInsight}`);
    }
  } else {
    // Handle general trading psychology questions
    console.log(`🧠 Generating general psychology response`);

    const generalPrompt = await PromptService.getPrompt("emotional_support", {
      inputMessage: state.inputMessage,
      psychAnalysis: state.psychologicalAnalysis,
      knowledge: state.relevantKnowledge,
    });

    console.log(`🔍 General response prompt prepared`);
    const response = await getAdvancedAnalysis(generalPrompt);

    // Ensure the response is properly formatted
    const formattedResponse = response.trim();
    if (formattedResponse) {
      responses.push(formattedResponse);
    }
  }

  // Filter out empty responses
  const validResponses = responses.filter((r) => r && r.trim().length > 0);

  if (validResponses.length === 0) {
    console.log(`⚠️ No valid responses generated, using fallback`);
    validResponses.push(
      "I'm here to support you through your trading journey. How are you feeling right now? 💙"
    );
  }

  // Join multiple responses with a separator
  const finalResponse = validResponses.join("\n\n---\n\n");

  console.log(`✅ Generated ${validResponses.length} response parts`);
  console.log(`💭 Total response length: ${finalResponse.length} characters`);
  console.log(`📝 Response preview: ${finalResponse.substring(0, 100)}...`);

  return { finalResponse };
}

// Conditional function to decide whether to fetch fresh portfolio or use cache
function shouldFetchPortfolioCondition(state: AgentState): string {
  if (state.shouldFetchFreshPortfolio) {
    return "fetch_and_analyze_portfolio";
  }
  return "analyze_message_intent";
}

// Conditional function to decide whether to search knowledge base
function shouldSearchKnowledgeCondition(state: AgentState): string {
  if (state.isPortfolioRequest) {
    console.log(`📊 Portfolio request: skipping knowledge base search`);
    return "generate_final_response";
  }
  return "search_knowledge_base";
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
    isEmotionalMessage: null,
    isCrisisMessage: null,
    shouldFetchFreshPortfolio: null,
    hasCachedPortfolio: null,
    isJournalRequest: null,
    journalAction: null,
    journalNLP: null,
  },
})
  .addNode("retrieve_user_and_history", retrieve_user_and_history)
  .addNode("route_intent", route_intent)
  .addNode("handle_journal", handle_journal)
  .addNode("check_cached_portfolio", check_cached_portfolio)
  .addNode("fetch_and_analyze_portfolio", fetch_and_analyze_portfolio)
  .addNode("analyze_message_intent", analyze_message_intent)
  .addNode("search_knowledge_base", search_knowledge_base)
  .addNode("generate_final_response", generate_final_response)
  .addEdge("__start__", "retrieve_user_and_history")
  .addEdge("retrieve_user_and_history", "route_intent")
  .addConditionalEdges(
    "route_intent",
    (s: AgentState) => (s.isJournalRequest ? "journal" : "nonjournal"),
    {
      journal: "handle_journal",
      nonjournal: "check_cached_portfolio",
    }
  )
  .addEdge("handle_journal", "__end__")
  .addConditionalEdges(
    "check_cached_portfolio",
    shouldFetchPortfolioCondition,
    {
      fetch_and_analyze_portfolio: "fetch_and_analyze_portfolio",
      analyze_message_intent: "analyze_message_intent",
    }
  )
  .addEdge("fetch_and_analyze_portfolio", "analyze_message_intent")
  .addConditionalEdges(
    "analyze_message_intent",
    shouldSearchKnowledgeCondition,
    {
      search_knowledge_base: "search_knowledge_base",
      generate_final_response: "generate_final_response",
    }
  )
  .addEdge("search_knowledge_base", "generate_final_response")
  .addEdge("generate_final_response", "__end__");

console.log(`🚀 AI Agent graph compiled successfully with 8 nodes`);

// Compile the graph
export const mainAgent = graph.compile();

// Export the graph for LangGraph Studio
export const graph_definition = graph;
