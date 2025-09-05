import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { mainAgent } from "../agent/mainAgent.js";
import { config, generateToken } from "../config.js";
import { setToken } from "../services/redisService.js";
import twilio from "twilio";

const router = Router();

// Helper function to intelligently split long messages
function splitLongMessage(message: string, maxLength: number = 1200): string[] {
  if (message.length <= maxLength) {
    return [message];
  }

  const parts: string[] = [];
  let currentPart = "";

  // Split by paragraphs first
  const paragraphs = message.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds limit, save current part and start new one
    if (currentPart.length + paragraph.length + 2 > maxLength) {
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
        currentPart = "";
      }

      // If single paragraph is too long, split by sentences
      if (paragraph.length > maxLength) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        let sentencePart = "";

        for (const sentence of sentences) {
          if (sentencePart.length + sentence.length + 1 > maxLength) {
            if (sentencePart.trim()) {
              parts.push(sentencePart.trim());
            }
            sentencePart = sentence;
          } else {
            sentencePart += (sentencePart ? " " : "") + sentence;
          }
        }

        if (sentencePart.trim()) {
          currentPart = sentencePart;
        }
      } else {
        currentPart = paragraph;
      }
    } else {
      currentPart += (currentPart ? "\n\n" : "") + paragraph;
    }
  }

  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }

  return parts.length > 0 ? parts : [message.substring(0, maxLength) + "..."];
}

router.post("/api/whatsapp/webhook", async (req, res) => {
  const from = String((req.body as any)?.From || ""); // e.g., 'whatsapp:+15551234567'
  const body = String((req.body as any)?.Body || "").trim();
  const twiml = new twilio.twiml.MessagingResponse();

  console.log(`📱 New WhatsApp message received from: ${from}`);
  console.log(`💬 Message content: "${body}"`);

  if (!from || !body) {
    console.log("⚠️  Empty message or sender, ignoring");
    return res.status(200).send(); // Just return 200 without any response
  }

  // Check user exists
  const user = await prisma.user.findUnique({
    where: { whatsappNumber: from },
  });

  if (!user) {
    console.log(`🆕 New user detected: ${from}, starting onboarding`);
    // Generate onboarding URL
    const token = generateToken();
    await setToken(`onboard:${token}`, from, 300);
    const url = `${config.appBaseUrl}/onboard/${token}`;
    console.log(`🔗 Generated onboarding token: ${token}`);
    twiml.message(
      `Welcome to Psy-Trader 👋\n\nTo begin, securely connect your Binance API keys here (link valid 5 minutes):\n${url}`
    );
    return res.type("text/xml").send(twiml.toString());
  }

  console.log(`👤 Existing user found: ${user.id} (${from})`);

  // Save incoming message
  await prisma.chatMessage.create({
    data: { userId: user.id, sender: "USER", content: body },
  });
  console.log(`💾 User message saved to database`);

  try {
    console.log(`🤖 Starting AI agent processing for user: ${user.id}`);
    const result = await mainAgent.invoke({
      userId: user.id,
      inputMessage: body,
      chatHistory: [],
      portfolioData: null,
      psychologicalAnalysis: "",
      relevantKnowledge: "",
      finalResponse: "",
      isPortfolioRequest: false,
      isEmotionalMessage: false,
    });

    const reply = String(
      result.finalResponse || "I'm here with you. Breathe. How can I help?"
    );
    console.log(
      `✅ Agent processing complete. Response length: ${reply.length} chars`
    );
    console.log(`📝 Raw response content: ${reply.substring(0, 150)}...`);

    // Split response into multiple messages if it contains separator
    let responses = reply
      .split("\n\n---\n\n")
      .filter((r) => r && r.trim().length > 0);

    // If no separator was used, treat as single message
    if (responses.length === 0) {
      responses = [reply.trim()];
    }

    // Further split any messages that are still too long
    const finalResponses: string[] = [];
    for (const response of responses) {
      const splitParts = splitLongMessage(response.trim(), 1200);
      finalResponses.push(...splitParts);
    }

    console.log(`📤 Final message split: ${finalResponses.length} part(s)`);

    // Ensure we have at least one response
    if (finalResponses.length === 0) {
      console.log(`⚠️ No valid responses after processing, using fallback`);
      finalResponses.push("I'm here to help. How are you feeling? 💙");
    }

    // Send each response as a separate WhatsApp message
    for (let i = 0; i < finalResponses.length; i++) {
      const message = finalResponses[i].trim();
      if (message && message.length > 0) {
        // Final safety check - hard limit at 1500 chars
        const safeMessage =
          message.length > 1500
            ? message.substring(0, 1480) + "... (cont'd)"
            : message;

        twiml.message(safeMessage);
        console.log(
          `📤 Message ${i + 1}/${finalResponses.length} prepared (${
            safeMessage.length
          } chars): ${safeMessage.substring(0, 80)}...`
        );
      }
    }

    // Save the full agent response to database
    await prisma.chatMessage.create({
      data: { userId: user.id, sender: "AGENT", content: reply },
    });
    console.log(`💾 Agent response saved to database`);

    console.log(`� Sending complete WhatsApp response`);
    return res.type("text/xml").send(twiml.toString());
  } catch (e: any) {
    console.error(
      `❌ Error processing message for user ${user.id}:`,
      e.message
    );
    console.error(`🔍 Stack trace:`, e.stack);
    twiml.message(
      "Sorry — I hit a snag analyzing that. Please try again shortly."
    );
    return res.type("text/xml").send(twiml.toString());
  }
});

export default router;
