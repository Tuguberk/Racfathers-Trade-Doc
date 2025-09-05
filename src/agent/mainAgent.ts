import { StateGraph } from "@langchain/langgraph";
import { prisma } from "../db/prisma.js";
import { AgentState } from "./state.js";
import { decrypt } from "../services/cryptoService.js";
import { fetchPortfolio } from "../services/binanceService.js";
import { getAdvancedAnalysis, getEmbedding } from "../services/llmService.js";

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

async function analyze_psychological_state(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(`🧠 Step 3: Analyzing psychological state`);
  console.log(`📝 Current message: "${state.inputMessage}"`);
  console.log(`📚 Chat history length: ${state.chatHistory.length} messages`);

  const prompt = `You are a trading psychology analyst. Analyze the user's emotional state.
Return a compact JSON like { "state": "fear|anxiety|greed|fomo|calm|...", "reason": "..." }.

Latest message: ${state.inputMessage}
Recent messages: ${JSON.stringify(state.chatHistory.slice(-10))}
Portfolio summary: ${JSON.stringify(state.portfolioData?.summary)}
`;

  console.log(`🔍 Sending psychological analysis request to LLM`);
  const raw = await getAdvancedAnalysis(prompt);
  console.log(
    `🎯 Raw LLM response for psychology: ${raw.substring(0, 200)}...`
  );

  // Best-effort parse
  let parsed = raw;
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      parsed = raw.slice(jsonStart, jsonEnd + 1);
      const testParse = JSON.parse(parsed);
      console.log(`✅ Successfully parsed psychology JSON:`, testParse);
    }
  } catch (parseError) {
    console.log(`⚠️  Could not parse psychology JSON, using raw response`);
  }

  return { psychologicalAnalysis: parsed };
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
  console.log(
    `🎭 Psychology analysis: ${state.psychologicalAnalysis.substring(
      0,
      100
    )}...`
  );
  console.log(
    `📚 Knowledge base content length: ${state.relevantKnowledge.length} chars`
  );

  const persona = `You are Psy-Trader, a calm, empathetic, yet clear-headed counselor for crypto traders.
Tone: soothing, supportive, grounded, brief but meaningful. Avoid financial advice; focus on psychology.`;

  const prompt = `${persona}
User message: ${state.inputMessage}
Portfolio summary: ${JSON.stringify(state.portfolioData?.summary)}
Psychology analysis: ${state.psychologicalAnalysis}
Relevant wisdom:\n${state.relevantKnowledge}

Write a concise response that:
- Acknowledges emotions and context
- Mentions portfolio state supportively (no precise numbers unless already provided)
- Integrates one relevant quote/wisdom naturally
- Offers 1-2 clear, calming next steps
`;

  console.log(`🤖 Sending final response generation request to LLM`);
  const resp = await getAdvancedAnalysis(prompt);
  console.log(`✅ Generated response length: ${resp.length} characters`);
  console.log(`💭 Response preview: "${resp.substring(0, 150)}..."`);

  return { finalResponse: resp };
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
  },
})
  .addNode("retrieve_user_and_history", retrieve_user_and_history)
  .addNode("fetch_and_analyze_portfolio", fetch_and_analyze_portfolio)
  .addNode("analyze_psychological_state", analyze_psychological_state)
  .addNode("search_knowledge_base", search_knowledge_base)
  .addNode("generate_final_response", generate_final_response)
  .addEdge("__start__", "retrieve_user_and_history")
  .addEdge("retrieve_user_and_history", "fetch_and_analyze_portfolio")
  .addEdge("fetch_and_analyze_portfolio", "analyze_psychological_state")
  .addEdge("analyze_psychological_state", "search_knowledge_base")
  .addEdge("search_knowledge_base", "generate_final_response")
  .addEdge("generate_final_response", "__end__");

console.log(`🚀 AI Agent graph compiled successfully with 5 nodes`);

export const mainAgent = graph.compile();
