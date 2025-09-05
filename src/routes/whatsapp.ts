import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { mainAgent } from "../agent/mainAgent.js";
import { config, generateToken } from "../config.js";
import { setToken } from "../services/redisService.js";
import { sendWhatsAppNotification } from "../services/notificationService.js";
import twilio from "twilio";
import fetch from "node-fetch";

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
    res.set("Content-Type", "text/xml; charset=utf-8");
    return res.send(twiml.toString());
  }

  console.log(`👤 Existing user found: ${user.id} (${from})`);

  // Check for special commands before processing with AI agent
  const lowerBody = body.toLowerCase().trim();

  // Handle help command
  if (
    lowerBody === "help" ||
    lowerBody === "commands" ||
    lowerBody === "menu"
  ) {
    console.log(`ℹ️ Help command detected from: ${from}`);
    twiml.message(
      `🤖 *Psy-Trader Commands*\n\n� *Fetch My Assets* - Show your portfolio\n🎯 *Show Active Positions* - Display futures positions\n�🔄 *Change API Key* - Update exchange credentials\n🔗 *Change Wallets* - Manage wallet addresses\n💬 *Help* - Show this menu\n\n💡 You can also chat naturally about trading and emotions!`
    );
    res.set("Content-Type", "text/xml; charset=utf-8");
    return res.send(twiml.toString());
  }

  // Handle "show positions" or "active positions" command
  if (
    (lowerBody.includes("show") && lowerBody.includes("position")) ||
    lowerBody.includes("active position") ||
    lowerBody.includes("my position") ||
    lowerBody.includes("futures") ||
    lowerBody === "positions"
  ) {
    console.log(`🎯 Positions command detected from: ${from}`);
    twiml.message("🎯 Fetching your active positions...");
    res.set("Content-Type", "text/xml; charset=utf-8");
    const twimlResponse = res.send(twiml.toString());

    // Process positions in background
    try {
      const { fetchActivePositions } = await import(
        "../services/multiExchangeService.js"
      );
      const { formatPositionsTable } = await import("../agent/mainAgent.js");
      const positions = await fetchActivePositions(user.id);

      const positionsTable = formatPositionsTable(positions);

      await sendWhatsAppNotification(from, positionsTable);
    } catch (error: any) {
      console.error("Error fetching positions:", error);
      await sendWhatsAppNotification(
        from,
        "❌ Sorry, I couldn't fetch your positions. Please make sure your exchange API keys are configured correctly."
      );
    }

    return twimlResponse;
  }

  // Handle "change api key" or "change api keys" command
  if (lowerBody.includes("change api") || lowerBody.includes("update api")) {
    console.log(`🔄 API key change command detected from: ${from}`);
    try {
      const response = await fetch(`${config.appBaseUrl}/api/change-api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: from }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          url: string;
          message: string;
        };
        twiml.message(
          `🔄 Update Your API Keys\n\nClick the link below to securely update your Binance API credentials (valid for 5 minutes):\n\n${data.url}\n\n⚡ This will replace your current API keys with new ones.`
        );
      } else {
        twiml.message(
          "❌ Sorry, I couldn't generate an API key update link. Please try again."
        );
      }
    } catch (error) {
      console.error("Error generating API key change link:", error);
      twiml.message(
        "❌ There was an error processing your request. Please try again."
      );
    }
    res.set("Content-Type", "text/xml; charset=utf-8");
    return res.send(twiml.toString());
  }

  // Handle "change wallets" or "manage wallets" command
  if (
    lowerBody.includes("change wallet") ||
    lowerBody.includes("manage wallet") ||
    lowerBody.includes("update wallet")
  ) {
    console.log(`🔄 Wallet change command detected from: ${from}`);
    try {
      const response = await fetch(`${config.appBaseUrl}/api/change-wallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: from }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          url: string;
          message: string;
        };
        twiml.message(
          `🔄 Manage Your Wallets\n\nClick the link below to update your crypto wallet addresses (valid for 5 minutes):\n\n${data.url}\n\n💡 You can add, remove, or replace your current wallet addresses.`
        );
      } else {
        twiml.message(
          "❌ Sorry, I couldn't generate a wallet management link. Please try again."
        );
      }
    } catch (error) {
      console.error("Error generating wallet change link:", error);
      twiml.message(
        "❌ There was an error processing your request. Please try again."
      );
    }
    res.set("Content-Type", "text/xml; charset=utf-8");
    return res.send(twiml.toString());
  }

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

    // Additional validation for empty response
    const validReply =
      reply.trim() || "I'm here to help. How are you feeling? 💙";

    console.log(
      `✅ Agent processing complete. Response length: ${validReply.length} chars`
    );
    console.log(`📝 Raw response content: ${validReply.substring(0, 150)}...`);

    // Split response into multiple messages if it contains separator
    let responses = validReply
      .split("\n\n---\n\n")
      .filter((r) => r && r.trim().length > 0);

    // If no separator was used, treat as single message
    if (responses.length === 0) {
      responses = [validReply.trim()];
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

    console.log(
      `📊 TwiML object has ${finalResponses.length} message(s) prepared`
    );
    console.log(`🔍 TwiML object type:`, typeof twiml);

    // Save the full agent response to database
    await prisma.chatMessage.create({
      data: { userId: user.id, sender: "AGENT", content: validReply },
    });
    console.log(`💾 Agent response saved to database`);

    console.log(`📱 Sending complete WhatsApp response`);
    const twimlString = twiml.toString();
    console.log(`📋 TwiML Response:`);
    console.log(twimlString);
    res.set("Content-Type", "text/xml; charset=utf-8");
    return res.send(twimlString);
  } catch (e: any) {
    console.error(
      `❌ Error processing message for user ${user.id}:`,
      e.message
    );
    console.error(`🔍 Stack trace:`, e.stack);
    twiml.message(
      "Sorry — I hit a snag analyzing that. Please try again shortly."
    );
    console.log(`📱 Sending error response via WhatsApp`);
    const errorTwimlString = twiml.toString();
    console.log(`📋 Error TwiML Response:`);
    console.log(errorTwimlString);
    res.set("Content-Type", "text/xml; charset=utf-8");
    return res.send(errorTwimlString);
  }
});

export default router;
