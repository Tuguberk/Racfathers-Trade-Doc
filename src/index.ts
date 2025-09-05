import express from "express";
import bodyParser from "body-parser";
import { config } from "./config.js";
import onboardingRouter from "./routes/onboarding.js";
import whatsappRouter from "./routes/whatsapp.js";
import { prisma } from "./db/prisma.js";

const app = express();

console.log(`🚀 Starting Psy-Trader server...`);
console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`🌐 Port: ${config.port}`);

// Twilio sends application/x-www-form-urlencoded
app.use("/api/whatsapp/webhook", bodyParser.urlencoded({ extended: false }));
// For regular JSON/form
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (req, res) => {
  console.log(`💊 Health check requested`);
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`✅ Database connection healthy`);
    res.json({ ok: true });
  } catch (error) {
    console.error(`❌ Database connection failed:`, error);
    res.status(500).json({ ok: false });
  }
});

app.use(onboardingRouter);
app.use(whatsappRouter);

console.log(`🛣️  Routes registered: onboarding, whatsapp`);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`🎉 Psy-Trader server is ready and listening on :${config.port}`);
  console.log(`📱 WhatsApp webhook endpoint: /api/whatsapp/webhook`);
  console.log(`👋 Onboarding endpoint: /onboard/:token`);
  console.log(`💊 Health check endpoint: /health`);
});
