import express from "express";
import bodyParser from "body-parser";
import { config } from "./config.js";
import dashboardRouter from "./routes/dashboard.js";
import onboardingRouter from "./routes/onboarding.js";
import whatsappRouter from "./routes/whatsapp.js";
import promptsRouter from "./routes/prompts.js";
import knowledgeRouter from "./routes/knowledge.js";
import visualizerRouter from "./routes/visualizer.js";
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

app.use(dashboardRouter);
app.use(onboardingRouter);
app.use(whatsappRouter);
app.use(promptsRouter);
app.use(knowledgeRouter);
app.use(visualizerRouter);

console.log(`🛣️  Routes registered: dashboard, onboarding, whatsapp, prompts, knowledge, visualizer`);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`🎉 Psy-Trader server is ready and listening on :${config.port}`);
  console.log(`🏠 Dashboard homepage: http://localhost:${config.port}`);
  console.log(`📱 WhatsApp webhook endpoint: /api/whatsapp/webhook`);
  console.log(`👋 Onboarding endpoint: /onboard/:token`);
  console.log(`🧠 Agent prompts management: /prompts`);
  console.log(`📚 Knowledge base management: /knowledge`);
  console.log(`� Agent Graph Visualizer: /graph-visualizer`);
  console.log(`�💊 Health check endpoint: /health`);
});
