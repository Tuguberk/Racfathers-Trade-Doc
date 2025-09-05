import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { mainAgent } from "../agent/mainAgent.js";
import { config, generateToken } from "../config.js";
import { setToken } from "../services/redisService.js";
import twilio from "twilio";

const router = Router();

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
    });

    const reply = String(
      result.finalResponse || "I'm here with you. Breathe. How can I help?"
    );
    console.log(
      `✅ Agent processing complete. Response length: ${reply.length} chars`
    );

    // Split response into multiple messages if it contains separator
    const responses = reply.split('\n\n---\n\n');
    console.log(`📤 Sending ${responses.length} message(s) to user`);

    // Send each response as a separate WhatsApp message
    for (let i = 0; i < responses.length; i++) {
      const message = responses[i].trim();
      if (message) {
        twiml.message(message);
        console.log(`📤 Message ${i + 1}/${responses.length} prepared: ${message.substring(0, 50)}...`);
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
