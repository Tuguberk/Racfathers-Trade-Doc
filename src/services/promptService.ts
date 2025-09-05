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
   * System prompts that should be hard-coded (output format, behavior rules)
   */
  private static getSystemPrompt(promptName: string): string {
    const systemPrompts: Record<string, string> = {
      system_base: `You are Psy-Trader, a professional trading psychology coach. Your responses should be:
- Empathetic and supportive
- Practical and actionable
- Based on established trading psychology principles
- Never provide financial advice, only psychological guidance
- Keep responses concise but meaningful
- Use emojis appropriately to enhance emotional connection`,

      system_output_format: `RESPONSE FORMAT RULES:
- CRITICAL: Keep each message under 1200 characters for WhatsApp compatibility
- Use clear, concise language
- Break long responses into multiple parts using "\\n\\n---\\n\\n" separator
- Include relevant emojis for emotional connection
- Use bullet points for lists to save space
- Prioritize the most important information first
- Always end with a supportive question or statement`,

      system_portfolio_format: `PORTFOLIO RESPONSE FORMAT:
- First message: Portfolio table (max 1200 chars)
- Second message: Key insights and advice (max 1200 chars) 
- Use concise formatting: Asset: Amount ($Value - %)
- Focus on top 5-7 holdings only
- Include percentages and dollar amounts
- Emphasize psychological implications briefly`,
    };

    return systemPrompts[promptName] || "";
  }

  /**
   * Fallback prompts when database prompts are not available
   */
  private static getFallbackPrompt(
    promptName: string,
    variables: PromptVariables
  ): string {
    // First check for system prompts
    const systemPrompt = this.getSystemPrompt(promptName);
    if (systemPrompt) {
      return systemPrompt;
    }

    const fallbacks: Record<string, string> = {
      psychology_analysis: `Analyze the user's psychological state from their message: "{message}"

Recent chat context: {chatHistory}
Is emotional message: {isEmotional}

Provide a brief psychological assessment focusing on:
- Emotional state (fear, greed, confidence, etc.)
- Risk tolerance indicators
- Need for support or intervention
- Market psychology patterns

Keep it concise and focused.`,

      portfolio_analysis: `${this.getSystemPrompt("system_base")}
${this.getSystemPrompt("system_portfolio_format")}

IMPORTANT: Keep response under 1200 characters. Be concise but supportive.

PORTFOLIO ANALYSIS:
{portfolioSummary}

PSYCHOLOGICAL STATE:
{psychAnalysis}

RELEVANT KNOWLEDGE:
{knowledge}

Provide supportive analysis of their portfolio from a psychological perspective. Focus on the most important psychological insights. Address emotional concerns with practical, brief guidance.`,

      emotional_support: `${this.getSystemPrompt("system_base")}
${this.getSystemPrompt("system_output_format")}

IMPORTANT: Keep response under 1200 characters total. Be concise but empathetic.

USER MESSAGE: {inputMessage}

PSYCHOLOGICAL ANALYSIS: {psychAnalysis}

RELEVANT KNOWLEDGE: {knowledge}

Provide empathetic support focusing on their emotional state. Offer the most crucial coping strategies and psychological guidance. Be brief but meaningful.`,
    };

    const fallback =
      fallbacks[promptName] ||
      `${this.getSystemPrompt("system_base")}

I'm here to help you with trading psychology. How are you feeling about your current situation?`;

    console.log(`🔄 Using fallback prompt for: ${promptName}`);
    return fallback;
  }
}
