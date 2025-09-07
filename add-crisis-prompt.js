import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addCrisisPrompt() {
  try {
    const result = await prisma.agentPrompt.create({
      data: {
        name: 'crisis_intervention',
        title: 'Crisis Intervention & Suicide Prevention',
        description: 'Emergency response system for users showing suicidal ideation or crisis symptoms',
        content: `🚨 CRISIS INTERVENTION REQUIRED 🚨

User message: {{inputMessage}}
Psychological analysis: {{psychAnalysis}}
Relevant knowledge: {{knowledge}}

This user is showing signs of suicidal ideation or self-harm thoughts. Your response must:

1. EXPRESS IMMEDIATE CARE AND CONCERN
2. VALIDATE their pain without dismissing financial concerns  
3. PROVIDE CRISIS RESOURCES (suicide prevention hotlines)
4. ENCOURAGE IMMEDIATE PROFESSIONAL HELP
5. REMIND them that financial losses are recoverable, life is not
6. STAY WITH THEM - ask them to reach out again soon
7. NEVER minimize their feelings or give financial advice right now

Crisis Resources:
• National Suicide Prevention Lifeline: 988 (US)
• Crisis Text Line: Text HOME to 741741
• International: befrienders.org
• Turkey Crisis Line: 182

Focus on IMMEDIATE SAFETY first, trading psychology second.
Be warm, supportive, and directive about seeking help.
Maximum 200 words to avoid overwhelming them.`,
        category: 'crisis',
        isActive: true
      }
    });
    console.log('✅ Crisis intervention prompt added:', result.id);
  } catch (error) {
    console.error('❌ Error adding prompt:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addCrisisPrompt();
