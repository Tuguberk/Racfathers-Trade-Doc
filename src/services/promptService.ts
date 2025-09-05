import { prisma } from "../db/prisma.js";

interface PromptVariables {
  inputMessage?: string;
  message?: string;
  portfolioSummary?: string;
  psychAnalysis?: string;
  knowledge?: string;
  recentHistory?: string;
  chatHistory?: string;
  isEmotional?: string;
  needsSupport?: boolean;
}

export class PromptService {
  private static promptCache = new Map<string, any>();
  private static lastCacheUpdate = 0;
  private static CACHE_TTL = 30000; // 30 seconds

  /**
   * Get a prompt by name with variable substitution
   */
  static async getPrompt(
    promptName: string,
    variables: PromptVariables = {}
  ): Promise<string> {
    try {
      const prompt = await this.getCachedPrompt(promptName);
      if (!prompt) {
        console.log(`⚠️ Prompt not found: ${promptName}, using fallback`);
        return this.getFallbackPrompt(promptName, variables);
      }

      if (!prompt.isActive) {
        console.log(`⚠️ Prompt inactive: ${promptName}, using fallback`);
        return this.getFallbackPrompt(promptName, variables);
      }

      // Replace variables in the prompt
      let content = prompt.content;
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        content = content.replace(
          new RegExp(placeholder, "g"),
          String(value || "")
        );
      }

      console.log(`✅ Using prompt: ${prompt.title}`);
      return content;
    } catch (error: any) {
      console.error(`❌ Error getting prompt ${promptName}:`, error.message);
      return this.getFallbackPrompt(promptName, variables);
    }
  }

  /**
   * Get all prompts grouped by category
   */
  static async getAllPrompts() {
    return await prisma.agentPrompt.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }

  /**
   * Update a prompt
   */
  static async updatePrompt(id: string, data: any) {
    const updated = await prisma.agentPrompt.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    // Clear cache to force refresh
    this.promptCache.clear();
    this.lastCacheUpdate = 0;

    return updated;
  }

  /**
   * Create a new prompt
   */
  static async createPrompt(data: any) {
    const created = await prisma.agentPrompt.create({
      data,
    });

    // Clear cache
    this.promptCache.clear();
    this.lastCacheUpdate = 0;

    return created;
  }

  /**
   * Toggle prompt active status
   */
  static async togglePrompt(id: string) {
    const prompt = await prisma.agentPrompt.findUnique({ where: { id } });
    if (!prompt) throw new Error("Prompt not found");

    const updated = await prisma.agentPrompt.update({
      where: { id },
      data: { isActive: !prompt.isActive },
    });

    this.promptCache.clear();
    this.lastCacheUpdate = 0;

    return updated;
  }

  /**
   * Get cached prompt or fetch from database
   */
  private static async getCachedPrompt(promptName: string) {
    const now = Date.now();

    // Check if cache is expired
    if (now - this.lastCacheUpdate > this.CACHE_TTL) {
      console.log(`🔄 Refreshing prompt cache...`);
      await this.refreshCache();
    }

    return this.promptCache.get(promptName);
  }

  /**
   * Refresh the prompt cache
   */
  private static async refreshCache() {
    try {
      const prompts = await prisma.agentPrompt.findMany();
      this.promptCache.clear();

      for (const prompt of prompts) {
        this.promptCache.set(prompt.name, prompt);
      }

      this.lastCacheUpdate = Date.now();
      console.log(`✅ Cached ${prompts.length} prompts`);
    } catch (error: any) {
      console.error(`❌ Failed to refresh prompt cache:`, error.message);
    }
  }

  /**
   * Fallback prompts when database prompts are not available
   */
  private static getFallbackPrompt(
    promptName: string,
    variables: PromptVariables
  ): string {
    const fallbacks: Record<string, string> = {
      portfolio_quote: `"Stay focused on your long-term goals, not short-term market noise."`,
      emotional_support: `I understand you're going through some difficult emotions right now. These feelings are completely normal in trading. Take a deep breath, step back from the charts, and remember that your mental health is more important than any trade. Consider taking a short break to clear your mind.`,
      general_response: `I hear you. Remember that successful trading is as much about psychology as it is about strategy. Stay disciplined and trust your process.`,
      psychology_analysis: `{"emotion": "neutral", "confidence": 5, "urgency": 5, "needs_support": false}`,
      knowledge_search: `trading psychology and emotional management advice`,
    };

    const fallback =
      fallbacks[promptName] ||
      `I'm here to help you with trading psychology. How are you feeling about your current situation?`;
    console.log(`🔄 Using fallback prompt for: ${promptName}`);
    return fallback;
  }
}
