import fetch from "node-fetch";
import { config } from "../config.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

async function openRouterChat(model: string, prompt: string): Promise<string> {
  console.log(`🤖 LLM Chat Request - Model: ${model}`);
  console.log(`📝 Prompt length: ${prompt.length} characters`);

  const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openRouterKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
            You are Rac'fella, an AI specialized in crypto trading psychology. 
            You use **Cognitive Behavioral Therapy (CBT)**, **Socratic Questioning**, and **Stoic Philosophy** to guide users. 
            Your main goal is to provide empathetic, short, WhatsApp-style messages that help users process their emotions and think realistically about their trading experiences.

            Key principles:

            1. **Empathy First**  
              - Always acknowledge and validate the user’s emotions, whether positive or negative.  
              - Show that you understand, share, and are with them: e.g., "I hear how heavy this feels…" or "Sounds like that made you really happy!"  

            2. **Temporary Nature of Emotions**  
              - Remind them that negative feelings (anxiety, fear, frustration) are temporary.  
              - Do not dismiss their feelings; instead, encourage them to notice and let emotions pass while maintaining balance.  

            3. **Cognitive Behavioral Therapy (CBT)**  
              - Detect maladaptive thoughts and irrational beliefs (overconfidence, self-blame, magical thinking).  
              - Use questions and reframes to help users generate realistic and positive alternatives.

            4. **Socratic Questioning**  
              - Ask guiding questions that make users examine their beliefs and assumptions:  
                * "What evidence do you have for that thought?"  
                * "Could there be another explanation?"  
                * "If a friend felt this way, what would you tell them?"  
              - Lead users to their own insight rather than giving direct answers.  
              - Make questions short, clear, and WhatsApp-friendly.  

            5. **Stoic Philosophy**  
              - Emphasize what is within the user’s control vs. what is not (market outcomes, luck).  
              - Encourage acceptance of temporary feelings without letting them define self-worth.  
              - Reinforce focusing on process, discipline, and long-term growth.  

            6. **WhatsApp Style Communication**  
              - Keep messages concise (1-3 sentences).  
              - Use short, clear, conversational sentences and questions.  
              - Be warm, empathetic, and supportive; maintain a casual but caring tone.  

            7. **Scenario Awareness**  
              - **Beginner Wins by Luck:** Guide to understand chance vs skill, avoid overconfidence.  
              - **Beginner Loses Blindly:** Normalize losses, challenge global self-failure thinking.  
              - **Intermediate Wins with Analysis:** Reinforce discipline and rational pride.  
              - **Intermediate Knowledge, Still Losing:** Focus on controllables and process, not just outcomes.  
              - **Expert Yet Losing:** Accept market uncertainty, separate ego from results, maintain perspective.  

            8. **Crisis Management**  
              - If user shows signs of extreme anxiety, distress, or self-harm thoughts:  
                * Empathize first, show care.  
                * Use Socratic questioning to guide insight.  
                * Encourage professional help and provide crisis resources.  
                * Avoid giving financial advice; prioritize immediate safety.  

            Instructions for responses:  
            - Always start with acknowledging and validating emotions.  
            - Use Socratic questions to guide reflection.  
            - Apply CBT reframes for maladaptive thoughts.  
            - Use Stoic reminders about control and impermanence.  
            - Keep WhatsApp-style short sentences and questions.  
            - Never lecture, minimize feelings, or provide financial advice in distress situations.  

            Example approach:  
            User: "I lost all my money, I’m useless…"  
            Agent: "I hear how heavy this feels 😔. Do you think losing once defines your whole ability? Have others experienced setbacks too? What’s something you *did* succeed at recently?"
            `,
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 300, // Limit tokens to control response length
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ OpenRouter chat error: ${res.status}`, errorText);
    throw new Error(`OpenRouter chat error: ${res.status} ${errorText}`);
  }

  // Get response as text first to check if it's HTML
  const responseText = await res.text();

  // Check if response starts with HTML
  if (
    responseText.startsWith("<!DOCTYPE") ||
    responseText.startsWith("<html")
  ) {
    console.error(
      `❌ Received HTML instead of JSON. Response: ${responseText.substring(
        0,
        200
      )}...`
    );
    throw new Error(
      "OpenRouter API returned HTML instead of JSON. This usually indicates an API issue or invalid credentials."
    );
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error(
      `❌ Failed to parse JSON response: ${responseText.substring(0, 200)}...`
    );
    throw new Error(`Invalid JSON response from OpenRouter API: ${parseError}`);
  }
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    console.error(`❌ Invalid LLM response structure:`, data);
    throw new Error("Invalid LLM response");
  }

  console.log(`✅ LLM response received. Length: ${content.length} chars`);
  console.log(`💭 Response preview: "${content.substring(0, 100)}..."`);

  return content.trim();
}

async function openRouterEmbedding(
  model: string,
  input: string
): Promise<number[]> {
  console.log(`🧮 Embedding Request - Model: ${model}`);
  console.log(`📝 Input text length: ${input.length} characters`);

  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openRouterKey}`,
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ OpenRouter embedding error: ${res.status}`, errorText);
    throw new Error(`OpenRouter embedding error: ${res.status} ${errorText}`);
  }

  // Get response as text first to check if it's HTML
  const responseText = await res.text();

  // Check if response starts with HTML
  if (
    responseText.startsWith("<!DOCTYPE") ||
    responseText.startsWith("<html")
  ) {
    console.error(
      `❌ Received HTML instead of JSON. Response: ${responseText.substring(
        0,
        200
      )}...`
    );
    throw new Error(
      "OpenRouter API returned HTML instead of JSON. This usually indicates an API issue or invalid credentials."
    );
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error(
      `❌ Failed to parse JSON response: ${responseText.substring(0, 200)}...`
    );
    throw new Error(`Invalid JSON response from OpenRouter API: ${parseError}`);
  }
  const vec = data?.data?.[0]?.embedding as number[] | undefined;

  if (!vec || !Array.isArray(vec)) {
    console.error(`❌ Invalid embedding response structure:`, data);
    throw new Error("Invalid embedding response");
  }

  console.log(
    `✅ Embedding generated. Vector length: ${vec.length} dimensions`
  );

  return vec;
}

async function openaiEmbedding(text: string): Promise<number[]> {
  console.log(`🧮 OpenAI Embedding Request`);
  console.log(`📝 Input text length: ${text.length} characters`);

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ OpenAI embedding error: ${res.status}`, errorText);
    throw new Error(`OpenAI embedding error: ${res.status} ${errorText}`);
  }

  const data: any = await res.json();
  const vec = data?.data?.[0]?.embedding as number[] | undefined;

  if (!vec || !Array.isArray(vec)) {
    console.error(`❌ Invalid OpenAI embedding response structure:`, data);
    throw new Error("Invalid OpenAI embedding response");
  }

  console.log(
    `✅ OpenAI Embedding generated. Vector length: ${vec.length} dimensions`
  );

  return vec;
}

export async function getAdvancedAnalysis(prompt: string): Promise<string> {
  console.log(`🔬 Advanced Analysis Request`);
  return openRouterChat(config.models.advanced, prompt);
}

export async function getUtilityResponse(prompt: string): Promise<string> {
  console.log(`🛠️  Utility Response Request`);
  return openRouterChat(config.models.utility, prompt);
}

export async function getEmbedding(text: string): Promise<number[]> {
  console.log(`🎯 Embedding Request`);
  return openaiEmbedding(text);
}
