import { StateGraph } from "@langchain/langgraph";
import { prisma } from "../db/prisma.js";
import { AgentState } from "./state.js";
import { decrypt } from "../services/cryptoService.js";
import { fetchPortfolio } from "../services/binanceService.js";
import { PromptService } from "../services/promptService.js";
import {
  getAdvancedAnalysis,
  getEmbedding,
  getUtilityResponse,
} from "../services/llmService.js";

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
  return portfolioKeywords.some((keyword) => lowerMessage.includes(keyword));
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
  return emotionalKeywords.some((keyword) => lowerMessage.includes(keyword));
}

// Format portfolio data into a clean table
function formatPortfolioTable(portfolioData: any): string {
  if (!portfolioData?.summary?.topHoldings?.length) {
    return "📊 *Portfolio Summary*\n\nNo assets found or all balances are zero.";
  }

  const { totalUSDT, topHoldings } = portfolioData.summary;
  let table = `📊 *Portfolio Summary*\n`;
  table += `💰 Total: $${totalUSDT.toLocaleString()}\n\n`;

  // Limit to top 6 holdings for space
  const displayHoldings = topHoldings.slice(0, 6);

  displayHoldings.forEach((holding: any, index: number) => {
    const percentage =
      totalUSDT > 0 ? ((holding.estUSDT / totalUSDT) * 100).toFixed(1) : "0.0";
    // More compact format
    table += `${index + 1}. ${holding.asset}: $${holding.estUSDT.toFixed(
      0
    )} (${percentage}%)\n`;
  });

  if (topHoldings.length > 6) {
    table += `\n...and ${topHoldings.length - 6} more assets`;
  }

  return table;
}

// Generate portfolio analysis summary
function generatePortfolioSummary(portfolioData: any): string {
  const { totalUSDT, topHoldings } = portfolioData.summary;

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

async function fetch_and_analyze_portfolio(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(
    `💰 Step 2: Fetching and analyzing portfolio for user: ${state.userId}`
  );
  const user = await prisma.user.findUnique({ where: { id: state.userId } });
  if (!user) {
    console.error(`❌ User not found during portfolio fetch: ${state.userId}`);
    throw new Error("User not found");
  }
  console.log(`🔐 Decrypting API credentials for Binance`);
  const apiKey = decrypt(user.encryptedApiKey);
  const apiSecret = decrypt(user.encryptedApiSecret);

  try {
    const portfolio = await fetchPortfolio(apiKey, apiSecret);
    console.log(`📊 Portfolio data retrieved successfully`);
    console.log(
      `💼 Portfolio summary: ${JSON.stringify(
        portfolio?.summary || {},
        null,
        2
      )}`
    );

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
  console.log(`🔍 Step 3: Analyzing message intent`);
  console.log(`📝 Current message: "${state.inputMessage}"`);

  const isPortfolioReq = isPortfolioRequest(state.inputMessage);
  const isEmotionalReq = isEmotionalMessage(state.inputMessage);

  console.log(`📊 Portfolio request detected: ${isPortfolioReq}`);
  console.log(`💭 Emotional message detected: ${isEmotionalReq}`);

  // Analyze user's psychological state with context
  const psychPrompt = await PromptService.getPrompt("psychology_analysis", {
    inputMessage: state.inputMessage,
    recentHistory: JSON.stringify(state.chatHistory.slice(-5)),
    isEmotional: isEmotionalReq.toString(),
  });

  const psychAnalysis = await getUtilityResponse(psychPrompt);
  console.log(`🧠 Psychology analysis: ${psychAnalysis}`);

  return {
    psychologicalAnalysis: psychAnalysis,
    isPortfolioRequest: isPortfolioReq,
    isEmotionalMessage: isEmotionalReq,
  };
}

async function search_knowledge_base(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(`📚 Step 4: Searching knowledge base`);
  const queryText = `trading psychology advice for state: ${state.psychologicalAnalysis}`;
  console.log(`🔍 Knowledge query: "${queryText}"`);

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
  console.log(`✍️  Step 5: Generating final response`);
  console.log(`📊 Is portfolio request: ${state.isPortfolioRequest}`);

  let responses: string[] = [];

  // Handle portfolio requests specifically
  if (state.isPortfolioRequest && state.portfolioData) {
    console.log(`📈 Generating portfolio-specific response`);

    // First message: Portfolio table
    const portfolioTable = formatPortfolioTable(state.portfolioData);
    responses.push(portfolioTable);

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
      responses.push(`💭 ${formattedInsight}`);
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
  },
})
  .addNode("retrieve_user_and_history", retrieve_user_and_history)
  .addNode("fetch_and_analyze_portfolio", fetch_and_analyze_portfolio)
  .addNode("analyze_message_intent", analyze_message_intent)
  .addNode("search_knowledge_base", search_knowledge_base)
  .addNode("generate_final_response", generate_final_response)
  .addEdge("__start__", "retrieve_user_and_history")
  .addEdge("retrieve_user_and_history", "fetch_and_analyze_portfolio")
  .addEdge("fetch_and_analyze_portfolio", "analyze_message_intent")
  .addEdge("analyze_message_intent", "search_knowledge_base")
  .addEdge("search_knowledge_base", "generate_final_response")
  .addEdge("generate_final_response", "__end__");

console.log(`🚀 AI Agent graph compiled successfully with 5 nodes`);

// Compile the graph
export const mainAgent = graph.compile();

// Export the graph for LangGraph Studio
export const graph_definition = graph;
