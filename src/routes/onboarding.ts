import { Router } from "express";
import { config, generateToken } from "../config.js";
import { setToken, getToken, delToken } from "../services/redisService.js";
import { prisma } from "../db/prisma.js";
import { encrypt } from "../services/cryptoService.js";
import {
  getUserWalletAddresses,
  isValidWalletAddress,
} from "../services/userService.js";
import twilio from "twilio";

const router = Router();

// Utility to render minimal HTML page
function page(html: string) {
  return `<!doctype html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Psy-Trader Onboarding</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 600px;
      margin: 40px auto;
      padding: 0 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      color: #333;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .form-content {
      padding: 30px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 16px;
      transition: all 0.3s ease;
      background: #f9fafb;
    }
    input:focus {
      outline: none;
      border-color: #4f46e5;
      background: white;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }
    .wallet-section {
      background: #f8fafc;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      border: 1px solid #e2e8f0;
    }
    .wallet-section h3 {
      margin: 0 0 16px 0;
      color: #1e293b;
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .wallet-icon {
      width: 20px;
      height: 20px;
      background: #4f46e5;
      border-radius: 50%;
      display: inline-block;
    }
    .wallet-input-group {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      align-items: flex-start;
    }
    .wallet-input-group input:first-child {
      flex: 2;
    }
    .wallet-input-group input:nth-child(2) {
      flex: 1;
      min-width: 140px;
    }
    .btn {
      padding: 12px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn-add {
      background: #10b981;
      color: white;
      width: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-add:hover {
      background: #059669;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
    .btn-remove {
      background: #ef4444;
      color: white;
      padding: 8px 12px;
      min-width: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-remove:hover {
      background: #dc2626;
      transform: translateY(-1px);
    }
    .btn-submit {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      width: 100%;
      font-size: 16px;
      padding: 16px;
      margin-top: 24px;
    }
    .btn-submit:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(79, 70, 229, 0.3);
    }
    .security-note {
      background: #ecfdf5;
      border: 1px solid #d1fae5;
      border-radius: 8px;
      padding: 16px;
      color: #065f46;
      font-size: 14px;
      margin-top: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .security-icon {
      width: 16px;
      height: 16px;
      background: #10b981;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .wallet-placeholder {
      color: #9ca3af;
      font-style: italic;
      text-align: center;
      padding: 20px;
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    @media (max-width: 640px) {
      .wallet-input-group {
        flex-direction: column;
      }
      .wallet-input-group input:nth-child(2) {
        min-width: auto;
      }
    }
  </style>
  </head><body>
  <div class="container">
    <div class="header">
      <h2>🔗 Connect Your Trading Account</h2>
    </div>
    <div class="form-content">
      ${html}
      <div class="security-note">
        <div class="security-icon"></div>
        <span>🔒 Your API keys and wallet addresses are encrypted immediately and stored securely.</span>
      </div>
    </div>
  </div>
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

// Get wallet addresses for a WhatsApp number (helper API)
router.get("/api/wallets/:whatsappNumber", async (req, res) => {
  try {
    const whatsappNumber = req.params.whatsappNumber;
    const wallets = await getUserWalletAddresses(whatsappNumber);
    return res.json({ wallets });
  } catch (error: any) {
    return res.status(404).json({ error: error.message });
  }
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
          `<div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid or Expired Link</h3>
            <p style="color: #64748b; margin-bottom: 24px;">This onboarding link is no longer valid. Please request a new one from WhatsApp.</p>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; color: #b91c1c;">
              💡 Return to WhatsApp and send a message to get a new setup link.
            </div>
          </div>`
        )
      );
  }
  console.log(`✅ Valid onboarding token for: ${number}`);
  res.send(
    page(`
    <form method="POST">
      <div class="form-group">
        <label>🔑 Binance API Key</label>
        <input name="apiKey" required placeholder="Enter your Binance API Key"/>
      </div>
      
      <div class="form-group">
        <label>🔐 Binance Secret Key</label>
        <input name="apiSecret" required placeholder="Enter your Binance Secret Key"/>
      </div>
      
      <div class="wallet-section">
        <h3><span class="wallet-icon"></span>Wallet Addresses (Optional)</h3>
        <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Add your crypto wallet addresses to track your portfolio across multiple platforms.</p>
        
        <div id="wallet-inputs">
          <div id="wallet-placeholder" class="wallet-placeholder">
            Click "Add Wallet" to start adding your wallet addresses
          </div>
        </div>
        
        <button type="button" onclick="addWalletInput()" class="btn btn-add">
          <span>+</span> Add Wallet Address
        </button>
      </div>
      
      <button type="submit" class="btn btn-submit">
        💾 Save & Continue
      </button>
    </form>
    
    <script>
      let walletCount = 0;
      
      function addWalletInput() {
        walletCount++;
        const placeholder = document.getElementById('wallet-placeholder');
        if (placeholder) {
          placeholder.style.display = 'none';
        }
        
        const walletInputs = document.getElementById('wallet-inputs');
        const newGroup = document.createElement('div');
        newGroup.className = 'wallet-input-group';
        newGroup.innerHTML = \`
          <input 
            name="walletAddress[]" 
            placeholder="0x... or wallet address" 
            style="font-family: 'Courier New', monospace; font-size: 14px;"
          />
          <input 
            name="walletLabel[]" 
            placeholder="Label (e.g., Main Wallet)"
          />
          <button 
            type="button" 
            onclick="removeWalletInput(this)" 
            class="btn btn-remove"
            title="Remove wallet"
          >
            ×
          </button>
        \`;
        walletInputs.appendChild(newGroup);
        
        // Focus on the new address input
        const newAddressInput = newGroup.querySelector('input[name="walletAddress[]"]');
        newAddressInput.focus();
      }
      
      function removeWalletInput(button) {
        walletCount--;
        button.parentElement.remove();
        
        // Show placeholder if no wallets left
        if (walletCount === 0) {
          const placeholder = document.getElementById('wallet-placeholder');
          if (placeholder) {
            placeholder.style.display = 'block';
          }
        }
      }
      
      // Add some visual feedback for form submission
      document.querySelector('form').addEventListener('submit', function(e) {
        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.innerHTML = '⏳ Saving...';
        submitBtn.disabled = true;
      });
    </script>
  `)
  );
});

router.post("/onboard/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`📝 API keys submission for token: ${token}`);
  const number = await getToken(`onboard:${token}`);
  if (!number) {
    console.log(`❌ Invalid token on API keys submission: ${token}`);
    return res.status(400).send(page(`
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid Link</h3>
        <p style="color: #64748b;">This onboarding link is no longer valid.</p>
      </div>
    `));
  }

  const apiKey = String((req.body as any)?.apiKey || "");
  const apiSecret = String((req.body as any)?.apiSecret || "");
  if (!apiKey || !apiSecret) {
    console.log(`⚠️  Incomplete API credentials for: ${number}`);
    return res
      .status(400)
      .send(page(`
        <div style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3 style="color: #ef4444; margin-bottom: 12px;">Incomplete Information</h3>
          <p style="color: #64748b; margin-bottom: 24px;">Both Binance API Key and Secret Key are required to continue.</p>
          <div style="background: #fef3cd; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; color: #92400e;">
            💡 Please go back and fill in both API credentials.
          </div>
        </div>
      `));
  }

  // Process wallet addresses
  const walletAddresses = (req.body as any)?.walletAddress || [];
  const walletLabels = (req.body as any)?.walletLabel || [];

  // Ensure arrays and filter empty addresses
  const addresses = Array.isArray(walletAddresses)
    ? walletAddresses
    : [walletAddresses];
  const labels = Array.isArray(walletLabels) ? walletLabels : [walletLabels];

  const validWallets = addresses
    .map((addr: string, index: number) => ({
      address: String(addr || "").trim(),
      label: String(labels[index] || "").trim() || null,
    }))
    .filter(
      (wallet: any) =>
        wallet.address.length > 0 && isValidWalletAddress(wallet.address)
    );

  // Check if any invalid wallet addresses were provided
  const invalidWallets = addresses
    .filter((addr: string) => addr && addr.trim().length > 0)
    .filter((addr: string) => !isValidWalletAddress(addr.trim()));

  if (invalidWallets.length > 0) {
    console.log(
      `⚠️  Invalid wallet addresses provided for: ${number}`,
      invalidWallets
    );
    return res
      .status(400)
      .send(
        page(
          `<div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🚫</div>
            <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid Wallet Address</h3>
            <p style="color: #64748b; margin-bottom: 24px;">One or more wallet addresses have an invalid format.</p>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; color: #b91c1c;">
              <strong>Invalid addresses:</strong><br>
              ${invalidWallets.map(addr => `• ${addr}`).join('<br>')}
            </div>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; color: #0369a1; margin-top: 16px;">
              💡 Supported formats: Ethereum (0x...), Bitcoin (1..., 3..., bc1...), and other major crypto addresses.
            </div>
          </div>`
        )
      );
  }

  console.log(`🔐 Encrypting API credentials for: ${number}`);
  const encryptedApiKey = encrypt(apiKey);
  const encryptedApiSecret = encrypt(apiSecret);

  // Create user record or update if already exists
  console.log(`💾 Saving user to database: ${number}`);
  const user = await prisma.user.upsert({
    where: { whatsappNumber: number },
    create: {
      whatsappNumber: number,
      encryptedApiKey,
      encryptedApiSecret,
    },
    update: {
      encryptedApiKey,
      encryptedApiSecret,
    },
  });

  // Save wallet addresses
  if (validWallets.length > 0) {
    console.log(
      `🔗 Saving ${validWallets.length} wallet addresses for: ${number}`
    );

    // Delete existing wallet addresses for this user to avoid duplicates
    await prisma.walletAddress.deleteMany({
      where: { userId: user.id },
    });

    // Create new wallet addresses
    await prisma.walletAddress.createMany({
      data: validWallets.map((wallet: any) => ({
        userId: user.id,
        address: wallet.address,
        label: wallet.label,
      })),
    });
  }

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
  const walletMessage =
    validWallets.length > 0
      ? ` and ${validWallets.length} wallet address${
          validWallets.length > 1 ? "es" : ""
        }`
      : "";
  res.send(
    page(
      `<div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 64px; margin-bottom: 24px;">🎉</div>
        <h3 style="color: #10b981; margin-bottom: 16px;">Setup Complete!</h3>
        <p style="color: #64748b; margin-bottom: 24px;">Your Binance API keys${walletMessage} have been saved securely.</p>
        <div style="background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <div style="font-size: 24px; margin-bottom: 12px;">✅</div>
          <p style="color: #065f46; font-weight: 600; margin: 0;">All data encrypted and secure</p>
        </div>
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; color: #0369a1;">
          💬 <strong>Next:</strong> Return to WhatsApp to continue your trading session
        </div>
      </div>`
    )
  );
});

export default router;
