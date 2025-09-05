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
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
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
