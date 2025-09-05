export interface AgentState {
  userId: string;
  inputMessage: string;
  chatHistory: Array<{ sender: string; content: string; timestamp: string }>;
  portfolioData: any; // Includes P/L analysis
  psychologicalAnalysis: string;
  relevantKnowledge: string;
  finalResponse: string;
}

