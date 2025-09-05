import { Router } from "express";
import { config, generateToken } from "../config.js";
import { setToken, getToken, delToken } from "../services/redisService.js";
import { prisma } from "../db/prisma.js";
import { encrypt } from "../services/cryptoService.js";
import twilio from "twilio";

const router = Router();

// Utility to render minimal HTML page
function page(html: string) {
  return `<!doctype html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Psy-Trader Onboarding</title>
  <style>body{font-family:system-ui,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;}input,button{font-size:16px;padding:10px;margin:6px 0;width:100%;}label{font-weight:600;margin-top:10px;display:block}form{border:1px solid #ddd;border-radius:8px;padding:16px}</style>
  </head><body>
  <h2>Connect Your Binance API Keys</h2>
  ${html}
  <p style="color:#666;font-size:14px">Your keys are encrypted immediately and stored securely.</p>
  </body></html>`;
}

// Generate onboarding URL for a WhatsApp number (helper for webhook)
router.post("/api/onboard-url", async (req, res) => {
  const { whatsappNumber } = req.body as { whatsappNumber?: string };
  if (!whatsappNumber)
    return res.status(400).json({ error: "whatsappNumber required" });
  const token = generateToken();
  await setToken(`onboard:${token}`, whatsappNumber, 300);
  return res.json({ url: `${config.appBaseUrl}/onboard/${token}` });
});

router.get("/onboard/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`🔗 Onboarding page accessed with token: ${token}`);
  const number = await getToken(`onboard:${token}`);
  if (!number) {
    console.log(`❌ Invalid or expired onboarding token: ${token}`);
    return res
      .status(400)
      .send(
        page(
          "<p>Invalid or expired link. Please request a new one from WhatsApp.</p>"
        )
      );
  }
  console.log(`✅ Valid onboarding token for: ${number}`);
  res.send(
    page(`
    <form method="POST">
      <label>Binance API Key</label>
      <input name="apiKey" required placeholder="Enter API Key"/>
      <label>Binance Secret Key</label>
      <input name="apiSecret" required placeholder="Enter Secret Key"/>
      <button type="submit">Save & Confirm</button>
    </form>
  `)
  );
});

router.post("/onboard/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`📝 API keys submission for token: ${token}`);
  const number = await getToken(`onboard:${token}`);
  if (!number) {
    console.log(`❌ Invalid token on API keys submission: ${token}`);
    return res.status(400).send(page("<p>Invalid or expired link.</p>"));
  }

  const apiKey = String((req.body as any)?.apiKey || "");
  const apiSecret = String((req.body as any)?.apiSecret || "");
  if (!apiKey || !apiSecret) {
    console.log(`⚠️  Incomplete API credentials for: ${number}`);
    return res
      .status(400)
      .send(page("<p>Both API Key and Secret are required.</p>"));
  }

  console.log(`🔐 Encrypting API credentials for: ${number}`);
  const encryptedApiKey = encrypt(apiKey);
  const encryptedApiSecret = encrypt(apiSecret);

  // Create user record or update if already exists
  console.log(`💾 Saving user to database: ${number}`);
  await prisma.user.upsert({
    where: { whatsappNumber: number },
    create: { whatsappNumber: number, encryptedApiKey, encryptedApiSecret },
    update: { encryptedApiKey, encryptedApiSecret },
  });

  await delToken(`onboard:${token}`);
  console.log(`🧹 Onboarding token cleaned up: ${token}`);

  // Send WhatsApp confirmation
  try {
    if (
      config.twilio.accountSid &&
      config.twilio.authToken &&
      config.twilio.from
    ) {
      console.log(`📱 Sending WhatsApp confirmation to: ${number}`);
      const client = twilio(config.twilio.accountSid, config.twilio.authToken);
      await client.messages.create({
        from: config.twilio.from,
        to: number,
        body: "✅ Your Binance keys are securely saved. You can now continue in WhatsApp.",
      });
      console.log(`✅ WhatsApp confirmation sent successfully`);
    } else {
      console.log(`⚠️  Twilio not configured, skipping WhatsApp confirmation`);
    }
  } catch (e: any) {
    console.error(`❌ Failed to send WhatsApp confirmation:`, e.message);
    // ignore outbound error to not block success page
  }

  console.log(`🎉 Onboarding completed successfully for: ${number}`);
  res.send(
    page(
      "<p>Success! Your keys are saved. Please return to WhatsApp to continue your session.</p>"
    )
  );
});

export default router;
