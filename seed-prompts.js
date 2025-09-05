import { prisma } from './src/db/prisma.js';

const defaultPrompts = [
  {
    name: 'portfolio_quote',
    title: 'Portfolio Viewing Quote',
    description: 'Short motivational quote when user views portfolio',
    category: 'portfolio',
    content: `Generate a brief, inspiring trading psychology quote (1-2 sentences) relevant to viewing portfolio data.
Portfolio context: {portfolioSummary}
User emotion: {psychAnalysis}

Focus on:
- Staying objective when viewing assets
- Not being emotional about numbers
- Long-term perspective

Keep it short, wise, and motivating.`
  },
  {
    name: 'emotional_support',
    title: 'Emotional Support Response',
    description: 'Detailed psychological support for emotional messages',
    category: 'emotional',
    content: `As Psy-Trader, provide detailed psychological support for this emotional crypto trader.
User message: "{inputMessage}"
Psychology analysis: {psychAnalysis}
Relevant wisdom: {knowledge}
Chat history: {recentHistory}

Provide a comprehensive response (4-6 sentences) that:
- Acknowledges and validates their emotions
- Explains the psychological pattern they're experiencing
- Offers 2-3 practical coping strategies
- Provides reassurance and perspective
- Includes relevant trading psychology wisdom

Be empathetic, detailed, and therapeutic in approach.`
  },
  {
    name: 'general_response',
    title: 'General Brief Response',
    description: 'Brief responses for general trading questions',
    category: 'general',
    content: `As Psy-Trader, respond briefly to this crypto trader's message.
User message: "{inputMessage}"
Psychology: {psychAnalysis}
Knowledge: {knowledge}

Provide a concise response (1-2 sentences) that:
- Addresses their question directly
- Includes a brief psychological insight
- Stays focused and practical

Be brief but helpful.`
  },
  {
    name: 'psychology_analysis',
    title: 'Psychology Analysis',
    description: 'Analyzing user emotional state from messages',
    category: 'analysis',
    content: `Analyze the emotional state of this crypto trader message. 
Return JSON: {"emotion": "calm|anxious|excited|fearful|greedy|confused", "confidence": 1-10, "urgency": 1-10, "needs_support": {needsSupport}}

Message: "{inputMessage}"
Recent chat: {recentHistory}`
  },
  {
    name: 'knowledge_search',
    title: 'Knowledge Base Search',
    description: 'Query for searching relevant knowledge',
    category: 'knowledge',
    content: `trading psychology advice for state: {psychAnalysis}`
  }
];

async function seedPrompts() {
  console.log('🌱 Seeding default agent prompts...');

  for (const prompt of defaultPrompts) {
    try {
      await prisma.agentPrompt.upsert({
        where: { name: prompt.name },
        update: {
          content: prompt.content,
          title: prompt.title,
          description: prompt.description,
          category: prompt.category,
        },
        create: prompt,
      });
      console.log(`✅ Seeded prompt: ${prompt.title}`);
    } catch (error) {
      console.error(`❌ Failed to seed prompt ${prompt.name}:`, error);
    }
  }

  console.log('🎉 Prompt seeding completed!');
  await prisma.$disconnect();
}

seedPrompts().catch(console.error);
