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
    console.log("⚠️  Empty message or sender, sending default greeting");
    twiml.message("Hello! Send a message to begin.");
    return res.type("text/xml").send(twiml.toString());
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
    });

    const reply =
      result.finalResponse || "I'm here with you. Breathe. How can I help?";
    console.log(
      `✅ Agent processing complete. Response length: ${
        String(reply).length
      } chars`
    );

    // Save agent message
    await prisma.chatMessage.create({
      data: { userId: user.id, sender: "AGENT", content: reply },
    });
    console.log(`💾 Agent response saved to database`);

    twiml.message(reply);
    console.log(`📤 Response sent via WhatsApp`);
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
