import { Router } from "express";
import { mainAgent } from "../agent/mainAgent.js";
import { AgentState } from "../agent/state.js";

const router = Router();

// Studio integration endpoint - provides graph visualization data
router.get("/studio/graph", async (req, res) => {
  try {
    const graphInfo = {
      name: "Psy-Trader AI Agent",
      description: "5-node psychological trading advisor",
      nodes: [
        {
          id: "retrieve_user_and_history",
          name: "User & History",
          type: "database",
          description: "Fetches user data and chat history",
        },
        {
          id: "fetch_and_analyze_portfolio",
          name: "Portfolio Analysis",
          type: "external_api",
          description: "Gets Binance portfolio via CCXT",
        },
        {
          id: "analyze_message_intent",
          name: "Intent Analysis",
          type: "llm",
          description: "Determines portfolio vs emotional request",
        },
        {
          id: "search_knowledge_base",
          name: "Knowledge Search",
          type: "vector_search",
          description: "Vector similarity search in psychology articles",
        },
        {
          id: "generate_final_response",
          name: "Response Generation",
          type: "llm",
          description: "Creates contextual response",
        },
      ],
      edges: [
        { from: "__start__", to: "retrieve_user_and_history" },
        {
          from: "retrieve_user_and_history",
          to: "fetch_and_analyze_portfolio",
        },
        { from: "fetch_and_analyze_portfolio", to: "analyze_message_intent" },
        { from: "analyze_message_intent", to: "search_knowledge_base" },
        { from: "search_knowledge_base", to: "generate_final_response" },
        { from: "generate_final_response", to: "__end__" },
      ],
      state_schema: {
        userId: "string",
        inputMessage: "string",
        chatHistory: "array",
        portfolioData: "object",
        psychologicalAnalysis: "string",
        relevantKnowledge: "string",
        finalResponse: "string",
        isPortfolioRequest: "boolean",
        isEmotionalMessage: "boolean",
      },
    };

    res.json(graphInfo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Execute agent with debugging info
router.post("/studio/execute", async (req, res) => {
  try {
    const { userId, inputMessage } = req.body;

    if (!userId || !inputMessage) {
      return res.status(400).json({
        error: "userId and inputMessage are required",
      });
    }

    const initialState: AgentState = {
      userId,
      inputMessage,
      chatHistory: [],
      portfolioData: undefined,
      psychologicalAnalysis: "",
      relevantKnowledge: "",
      finalResponse: "",
      isPortfolioRequest: false,
      isEmotionalMessage: false,
    };

    console.log(`🎬 Studio: Starting agent execution for user ${userId}`);
    console.log(`📝 Studio: Input message: "${inputMessage}"`);

    // Execute with step tracking
    const startTime = Date.now();
    let stepCount = 0;

    const result = await mainAgent.invoke(initialState as any, {
      configurable: {},
      callbacks: [
        {
          handleChainStart: (chain: any) => {
            stepCount++;
            console.log(
              `🔄 Studio Step ${stepCount}: ${chain.name || "Unknown"}`
            );
          },
          handleChainEnd: (output: any) => {
            console.log(`✅ Studio Step completed`);
          },
          handleChainError: (error: any) => {
            console.log(`❌ Studio Step error:`, error.message);
          },
        },
      ],
    });

    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      execution_time_ms: executionTime,
      steps_executed: stepCount,
      initial_state: initialState,
      final_state: result,
      response: result.finalResponse,
    });
  } catch (error: any) {
    console.error("❌ Studio execution error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Get current agent state for debugging
router.get("/studio/state", async (req, res) => {
  try {
    const sampleState = {
      userId: "debug-user",
      inputMessage: "Show my portfolio and help with FOMO",
      chatHistory: [],
      portfolioData: null,
      psychologicalAnalysis: null,
      relevantKnowledge: null,
      finalResponse: null,
      isPortfolioRequest: null,
      isEmotionalMessage: null,
    };

    res.json({
      sample_state: sampleState,
      state_description:
        "This is the AgentState structure used by the Psy-Trader agent",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
