/**
 * LangGraph Studio Entry Point
 *
 * This file exports the graph definition for LangGraph Studio visualization
 */

import { graph_definition } from "./mainAgent.js";
import { AgentState } from "./state.js";

// Export for LangGraph Studio
export const graph = graph_definition;

// Export state type for Studio
export type { AgentState };

// Provide sample state for Studio testing
export const sampleState: AgentState = {
  userId: "sample-user-123",
  inputMessage: "Show me my portfolio and help me understand my emotions",
  chatHistory: [
    {
      sender: "user",
      content: "I'm feeling anxious about my crypto investments",
      timestamp: new Date().toISOString(),
    },
    {
      sender: "assistant",
      content:
        "I understand your concerns. Let me help you with both your portfolio and emotional state.",
      timestamp: new Date().toISOString(),
    },
  ],
  portfolioData: undefined,
  psychologicalAnalysis: "",
  relevantKnowledge: "",
  finalResponse: "",
  isPortfolioRequest: true,
  isEmotionalMessage: true,
};

// Studio configuration
export const studioConfig = {
  title: "Rac'fella AI Agent",
  description:
    "A 5-node AI agent that combines portfolio analysis with psychological trading advice",
  nodes: [
    {
      id: "retrieve_user_and_history",
      name: "User & History Retrieval",
      description: "Fetches user data and chat history from database",
    },
    {
      id: "fetch_and_analyze_portfolio",
      name: "Portfolio Analysis",
      description: "Retrieves Binance portfolio data and calculates holdings",
    },
    {
      id: "analyze_message_intent",
      name: "Intent Analysis",
      description: "Determines if request is portfolio-related or emotional",
    },
    {
      id: "search_knowledge_base",
      name: "Knowledge Search",
      description: "Searches psychology articles using vector similarity",
    },
    {
      id: "generate_final_response",
      name: "Response Generation",
      description:
        "Creates contextual response based on portfolio and psychology",
    },
  ],
  edges: [
    { from: "__start__", to: "retrieve_user_and_history" },
    { from: "retrieve_user_and_history", to: "fetch_and_analyze_portfolio" },
    { from: "fetch_and_analyze_portfolio", to: "analyze_message_intent" },
    { from: "analyze_message_intent", to: "search_knowledge_base" },
    { from: "search_knowledge_base", to: "generate_final_response" },
    { from: "generate_final_response", to: "__end__" },
  ],
};
