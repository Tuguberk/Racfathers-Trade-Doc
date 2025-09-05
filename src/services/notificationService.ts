import twilio from "twilio";
import { config } from "../config.js";

export async function sendWhatsAppNotification(
  to: string,
  message: string
): Promise<void> {
  try {
    if (
      !config.twilio.accountSid ||
      !config.twilio.authToken ||
      !config.twilio.from
    ) {
      console.log(
        `⚠️  Twilio not configured, skipping notification: ${message}`
      );
      return;
    }

    const client = twilio(config.twilio.accountSid, config.twilio.authToken);

    await client.messages.create({
      from: config.twilio.from,
      to: to,
      body: message,
    });

    console.log(`📱 WhatsApp notification sent to ${to}: ${message}`);
  } catch (error: any) {
    console.error(`❌ Failed to send WhatsApp notification:`, error.message);
    // Don't throw error to avoid breaking the main flow
  }
}
