export interface AgentState {
  userId: string;
  inputMessage: string;
  chatHistory: Array<{ sender: string; content: string; timestamp: string }>;
  portfolioData: any; // Includes P/L analysis
  psychologicalAnalysis: string;
  relevantKnowledge: string;
  finalResponse: string;
  isPortfolioRequest?: boolean;
  isPositionRequest?: boolean;
  isEmotionalMessage?: boolean;
  isCrisisMessage?: boolean; // Critical: Crisis/suicide detection
  // Unified intent for routing: "crisis" | "journal" | "portfolio_position" | "financial_advice" | "psychology"
  intent?: string;
  isFinancialAdviceRequest?: boolean;
  shouldFetchFreshPortfolio?: boolean;
  hasCachedPortfolio?: boolean;

  // Journal-related fields
  isJournalRequest?: boolean;
  journalAction?: string;
  journalNLP?: any;
}
