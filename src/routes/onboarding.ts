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
    .exchange-section {
      background: #fdfefe;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      border: 1px solid #e2e8f0;
    }
    .exchange-section h3 {
      margin: 0 0 16px 0;
      color: #1e293b;
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .exchange-icon {
      width: 20px;
      height: 20px;
      background: #f59e0b;
      border-radius: 50%;
      display: inline-block;
    }
    .exchange-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .exchange-header {
      display: flex;
      justify-content: between;
      align-items: center;
      padding: 16px 20px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .exchange-header h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      flex: 1;
    }
    .exchange-toggle {
      position: relative;
      display: inline-block;
      width: 50px;
      height: 24px;
      margin-left: auto;
    }
    .exchange-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #cbd5e1;
      transition: 0.3s;
      border-radius: 24px;
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
    .exchange-toggle input:checked + .toggle-slider {
      background-color: #4f46e5;
    }
    .exchange-toggle input:checked + .toggle-slider:before {
      transform: translateX(26px);
    }
    .exchange-inputs {
      padding: 20px;
      display: none;
    }
    .exchange-inputs.active {
      display: block;
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

// Generate new onboarding URL for changing API keys
router.post("/api/change-api-keys", async (req, res) => {
  const { whatsappNumber } = req.body as { whatsappNumber?: string };
  if (!whatsappNumber)
    return res.status(400).json({ error: "whatsappNumber required" });

  console.log(`🔄 API key change request from: ${whatsappNumber}`);

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { whatsappNumber },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const token = generateToken();
  await setToken(`change-api:${token}`, whatsappNumber, 300);
  const url = `${config.appBaseUrl}/change-api/${token}`;

  console.log(
    `🔗 Generated API change token: ${token} for user: ${whatsappNumber}`
  );
  return res.json({
    url,
    message: "API key change link generated (valid for 5 minutes)",
  });
});

// Generate new onboarding URL for managing wallet addresses
router.post("/api/change-wallets", async (req, res) => {
  const { whatsappNumber } = req.body as { whatsappNumber?: string };
  if (!whatsappNumber)
    return res.status(400).json({ error: "whatsappNumber required" });

  console.log(`🔄 Wallet change request from: ${whatsappNumber}`);

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { whatsappNumber },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const token = generateToken();
  await setToken(`change-wallets:${token}`, whatsappNumber, 300);
  const url = `${config.appBaseUrl}/change-wallets/${token}`;

  console.log(
    `🔗 Generated wallet change token: ${token} for user: ${whatsappNumber}`
  );
  return res.json({
    url,
    message: "Wallet management link generated (valid for 5 minutes)",
  });
});

// Change API Keys page
router.get("/change-api/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`🔄 API change page accessed with token: ${token}`);
  const number = await getToken(`change-api:${token}`);
  if (!number) {
    console.log(`❌ Invalid or expired API change token: ${token}`);
    return res.status(400).send(
      page(
        `<div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid or Expired Link</h3>
            <p style="color: #64748b; margin-bottom: 24px;">This API key change link is no longer valid. Please request a new one from WhatsApp.</p>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; color: #b91c1c;">
              💡 Return to WhatsApp and type "change api key" to get a new link.
            </div>
          </div>`
      )
    );
  }

  console.log(`✅ Valid API change token for: ${number}`);

  // Get existing exchange keys for the user
  const user = await prisma.user.findUnique({
    where: { whatsappNumber: number },
    include: {
      exchangeKeys: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  const currentExchanges = user?.exchangeKeys || [];
  console.log(`📊 Found ${currentExchanges.length} existing exchange keys for user`);

  res.send(
    page(`
    <div style="text-align: center; margin-bottom: 30px;">
      <h3 style="color: #1e293b; margin-bottom: 8px;">🔄 Update Exchange API Keys</h3>
      <p style="color: #64748b; font-size: 14px;">Manage API keys from all your exchanges</p>
    </div>

    ${currentExchanges.length > 0 ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h4 style="margin: 0 0 16px 0; color: #374151;">📊 Current Exchange Connections:</h4>
      ${currentExchanges.map(exchangeKey => `
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-weight: 600; color: #374151; text-transform: capitalize;">
              🏦 ${exchangeKey.exchange}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
              Added: ${exchangeKey.createdAt.toLocaleDateString()}
            </div>
          </div>
          <div style="color: #22c55e; font-size: 12px; font-weight: 500;">
            ✅ Active
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <form method="POST">
      <div class="exchange-section">
        <h3><span class="exchange-icon">🏦</span>Exchange API Keys</h3>
        <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">
          Add or update API keys from your exchanges. All keys are optional - add only the exchanges you use.
          ${currentExchanges.length > 0 ? ' Adding new keys will replace your existing ones.' : ''}
        </p>

        <!-- Binance -->
        <div class="exchange-group">
          <div class="exchange-header">
            <img src="https://cryptologos.cc/logos/binance-coin-bnb-logo.png" alt="Binance" width="24" height="24">
            <h4>Binance</h4>
            <span class="exchange-badge">Spot & Futures</span>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>API Key</label>
              <input name="binance-apiKey" placeholder="Enter Binance API Key" />
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input name="binance-apiSecret" placeholder="Enter Binance Secret Key" />
            </div>
          </div>
        </div>

        <!-- Bybit -->
        <div class="exchange-group">
          <div class="exchange-header">
            <img src="https://cryptologos.cc/logos/bybit-logo.png" alt="Bybit" width="24" height="24">
            <h4>Bybit</h4>
            <span class="exchange-badge">Spot</span>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>API Key</label>
              <input name="bybit-apiKey" placeholder="Enter Bybit API Key" />
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input name="bybit-apiSecret" placeholder="Enter Bybit Secret Key" />
            </div>
          </div>
        </div>

        <!-- Kraken -->
        <div class="exchange-group">
          <div class="exchange-header">
            <img src="https://cryptologos.cc/logos/kraken-logo.png" alt="Kraken" width="24" height="24">
            <h4>Kraken</h4>
            <span class="exchange-badge">Spot</span>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>API Key</label>
              <input name="kraken-apiKey" placeholder="Enter Kraken API Key" />
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input name="kraken-apiSecret" placeholder="Enter Kraken Secret Key" />
            </div>
          </div>
        </div>

        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 20px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 20px;">⚠️</span>
            <strong style="color: #92400e;">API Key Security</strong>
          </div>
          <ul style="color: #92400e; font-size: 14px; margin: 0; padding-left: 20px;">
            <li>Only enable <strong>Read</strong> permissions on your API keys</li>
            <li>Never enable trading, withdrawal, or transfer permissions</li>
            <li>All keys are encrypted and stored securely</li>
            <li>Leave fields empty to remove exchange connections</li>
          </ul>
        </div>
      </div>
      
      <button type="submit" class="btn btn-submit">
        🔄 Update Exchange API Keys
      </button>
    </form>
    
    <script>
      document.querySelector('form').addEventListener('submit', function(e) {
        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.innerHTML = '⏳ Updating...';
        submitBtn.disabled = true;
      });
    </script>
  `)
  );
});

// Change Wallets page
router.get("/change-wallets/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`🔄 Wallet change page accessed with token: ${token}`);
  const number = await getToken(`change-wallets:${token}`);
  if (!number) {
    console.log(`❌ Invalid or expired wallet change token: ${token}`);
    return res.status(400).send(
      page(
        `<div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid or Expired Link</h3>
            <p style="color: #64748b; margin-bottom: 24px;">This wallet management link is no longer valid. Please request a new one from WhatsApp.</p>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; color: #b91c1c;">
              💡 Return to WhatsApp and type "change wallets" to get a new link.
            </div>
          </div>`
      )
    );
  }

  console.log(`✅ Valid wallet change token for: ${number}`);

  // Get existing wallets for this user
  const existingWallets = await getUserWalletAddresses(number);

  res.send(
    page(`
    <div style="text-align: center; margin-bottom: 20px;">
      <h3 style="color: #1e293b; margin-bottom: 8px;">🔄 Manage Wallet Addresses</h3>
      <p style="color: #64748b; font-size: 14px;">Update your crypto wallet addresses</p>
    </div>
    
    ${
      existingWallets.length > 0
        ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h4 style="margin: 0 0 12px 0; color: #374151;">Current Wallets:</h4>
      ${existingWallets
        .map(
          (wallet) => `
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 8px;">
          <div style="font-family: monospace; font-size: 14px; color: #374151; word-break: break-all;">${
            wallet.address
          }</div>
          ${
            wallet.label
              ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${wallet.label}</div>`
              : ""
          }
        </div>
      `
        )
        .join("")}
    </div>
    `
        : ""
    }
    
    <form method="POST">
      <div class="wallet-section">
        <h3><span class="wallet-icon"></span>Update Wallet Addresses</h3>
        <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Add new wallet addresses. This will replace all your current wallets.</p>
        
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
        🔄 Update Wallets
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
        
        const newAddressInput = newGroup.querySelector('input[name="walletAddress[]"]');
        newAddressInput.focus();
      }
      
      function removeWalletInput(button) {
        walletCount--;
        button.parentElement.remove();
        
        if (walletCount === 0) {
          const placeholder = document.getElementById('wallet-placeholder');
          if (placeholder) {
            placeholder.style.display = 'block';
          }
        }
      }
      
      document.querySelector('form').addEventListener('submit', function(e) {
        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.innerHTML = '⏳ Updating...';
        submitBtn.disabled = true;
      });
    </script>
  `)
  );
});

router.get("/onboard/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`🔗 Onboarding page accessed with token: ${token}`);
  const number = await getToken(`onboard:${token}`);
  if (!number) {
    console.log(`❌ Invalid or expired onboarding token: ${token}`);
    return res.status(400).send(
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
      
      <div class="exchange-section">
        <h3><span class="exchange-icon">🏦</span>Exchange API Keys (Optional)</h3>
        <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Add API keys from your exchanges to track all your trading assets. All keys are optional - add only the exchanges you use.</p>
        
        <!-- Binance Spot -->
        <div class="exchange-card">
          <div class="exchange-header">
            <h4>🟡 Binance Spot</h4>
            <label class="exchange-toggle">
              <input type="checkbox" id="binance-toggle" onchange="toggleExchange('binance')">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="binance-inputs" class="exchange-inputs" style="display: none;">
            <div class="form-group">
              <label>API Key</label>
              <input name="binance-apiKey" placeholder="Enter your Binance API Key"/>
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input name="binance-apiSecret" placeholder="Enter your Binance Secret Key"/>
            </div>
          </div>
        </div>

        <!-- Binance Futures -->
        <div class="exchange-card">
          <div class="exchange-header">
            <h4>🟠 Binance Futures</h4>
            <label class="exchange-toggle">
              <input type="checkbox" id="binance-futures-toggle" onchange="toggleExchange('binance-futures')">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="binance-futures-inputs" class="exchange-inputs" style="display: none;">
            <div class="form-group">
              <label>API Key</label>
              <input name="binance-futures-apiKey" placeholder="Enter your Binance Futures API Key"/>
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input name="binance-futures-apiSecret" placeholder="Enter your Binance Futures Secret Key"/>
            </div>
          </div>
        </div>

        <!-- Bybit -->
        <div class="exchange-card">
          <div class="exchange-header">
            <h4>� Bybit</h4>
            <label class="exchange-toggle">
              <input type="checkbox" id="bybit-toggle" onchange="toggleExchange('bybit')">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="bybit-inputs" class="exchange-inputs" style="display: none;">
            <div class="form-group">
              <label>API Key</label>
              <input name="bybit-apiKey" placeholder="Enter your Bybit API Key"/>
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input name="bybit-apiSecret" placeholder="Enter your Bybit Secret Key"/>
            </div>
          </div>
        </div>

        <!-- Kraken -->
        <div class="exchange-card">
          <div class="exchange-header">
            <h4>🔴 Kraken</h4>
            <label class="exchange-toggle">
              <input type="checkbox" id="kraken-toggle" onchange="toggleExchange('kraken')">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="kraken-inputs" class="exchange-inputs" style="display: none;">
            <div class="form-group">
              <label>API Key</label>
              <input name="kraken-apiKey" placeholder="Enter your Kraken API Key"/>
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input name="kraken-apiSecret" placeholder="Enter your Kraken Private Key"/>
            </div>
          </div>
        </div>
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
      
      function toggleExchange(exchangeName) {
        const toggle = document.getElementById(exchangeName + '-toggle');
        const inputs = document.getElementById(exchangeName + '-inputs');
        
        if (toggle.checked) {
          inputs.style.display = 'block';
          inputs.classList.add('active');
        } else {
          inputs.style.display = 'none';
          inputs.classList.remove('active');
          // Clear inputs when disabled
          const inputElements = inputs.querySelectorAll('input');
          inputElements.forEach(input => input.value = '');
        }
      }
      
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
    return res.status(400).send(
      page(`
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid Link</h3>
        <p style="color: #64748b;">This onboarding link is no longer valid.</p>
      </div>
    `)
    );
  }

  // Parse exchange API keys
  const exchangeData = [];
  const exchanges = ["binance", "binance-futures", "bybit", "kraken"];

  // Legacy support - check if old API key format is used
  const legacyApiKey = String((req.body as any)?.apiKey || "").trim();
  const legacyApiSecret = String((req.body as any)?.apiSecret || "").trim();

  if (legacyApiKey && legacyApiSecret) {
    // Legacy Binance format
    exchangeData.push({
      exchange: "binance",
      apiKey: legacyApiKey,
      apiSecret: legacyApiSecret,
    });
  } else {
    // New multi-exchange format
    for (const exchange of exchanges) {
      const apiKey = String(
        (req.body as any)?.[`${exchange}-apiKey`] || ""
      ).trim();
      const apiSecret = String(
        (req.body as any)?.[`${exchange}-apiSecret`] || ""
      ).trim();

      if (apiKey && apiSecret) {
        exchangeData.push({
          exchange,
          apiKey,
          apiSecret,
        });
      }
    }
  }

  console.log(
    `🏦 Found ${exchangeData.length} exchange API key sets for: ${number}`
  );

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
    return res.status(400).send(
      page(
        `<div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🚫</div>
            <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid Wallet Address</h3>
            <p style="color: #64748b; margin-bottom: 24px;">One or more wallet addresses have an invalid format.</p>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; color: #b91c1c;">
              <strong>Invalid addresses:</strong><br>
              ${invalidWallets.map((addr) => `• ${addr}`).join("<br>")}
            </div>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; color: #0369a1; margin-top: 16px;">
              💡 Supported formats: Ethereum (0x...), Bitcoin (1..., 3..., bc1...), and other major crypto addresses.
            </div>
          </div>`
      )
    );
  }

  // Create or update user (no legacy API fields)
  console.log(`👤 Saving user to database: ${number}`);

  const user = await prisma.user.upsert({
    where: { whatsappNumber: number },
    create: { whatsappNumber: number },
    update: {},
  });

  // Save exchange API keys
  if (exchangeData.length > 0) {
    console.log(
      `🏦 Saving ${exchangeData.length} exchange API keys for: ${number}`
    );

    // Delete existing exchange keys for this user
    await prisma.exchangeApiKey.deleteMany({
      where: { userId: user.id },
    });

    // Create new exchange API keys for all provided exchanges
    if (exchangeData.length > 0) {
      await prisma.exchangeApiKey.createMany({
        data: exchangeData.map((exchange) => ({
          userId: user.id,
          exchange: exchange.exchange,
          encryptedApiKey: encrypt(exchange.apiKey),
          encryptedApiSecret: encrypt(exchange.apiSecret),
          encryptedPassphrase: null, // Can be added later for exchanges that need it
          isActive: true,
        })),
      });
    }
  }

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
          <p style="color: #64748b; margin-bottom: 24px;">Your exchange API keys${walletMessage} have been saved securely.</p>
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

// Handle API key changes
router.post("/change-api/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`🔄 API keys update submission for token: ${token}`);
  const number = await getToken(`change-api:${token}`);
  if (!number) {
    console.log(`❌ Invalid token on API keys update: ${token}`);
    return res.status(400).send(
      page(`
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid Link</h3>
        <p style="color: #64748b;">This API key change link is no longer valid.</p>
      </div>
    `)
    );
  }

  console.log(`🏦 Processing multi-exchange API keys update for: ${number}`);

  // Get user
  const user = await prisma.user.findUnique({
    where: { whatsappNumber: number },
  });
  if (!user) {
    return res.status(404).send(
      page(
        `<div style="text-align: center; padding: 40px 20px;">User not found.</div>`
      )
    );
  }

  // Deactivate all existing exchange keys first
  await prisma.exchangeApiKey.updateMany({
    where: { userId: user.id },
    data: { isActive: false }
  });

  // Process exchange API keys
  const exchanges = ['binance', 'bybit', 'kraken'];
  const updatedExchanges = [];
  let hasValidKeys = false;

  for (const exchange of exchanges) {
    const apiKey = String((req.body as any)?.[`${exchange}-apiKey`] || "").trim();
    const apiSecret = String((req.body as any)?.[`${exchange}-apiSecret`] || "").trim();
    
    if (apiKey && apiSecret) {
      console.log(`🔐 Processing ${exchange} API keys for user: ${number}`);
      
      try {
        const encryptedApiKey = encrypt(apiKey);
        const encryptedApiSecret = encrypt(apiSecret);

        await prisma.exchangeApiKey.upsert({
          where: { 
            userId_exchange: { 
              userId: user.id, 
              exchange: exchange 
            } 
          },
          create: {
            userId: user.id,
            exchange: exchange,
            encryptedApiKey,
            encryptedApiSecret,
            isActive: true,
          },
          update: {
            encryptedApiKey,
            encryptedApiSecret,
            isActive: true,
          },
        });

        updatedExchanges.push(exchange);
        hasValidKeys = true;
        console.log(`✅ ${exchange} API keys updated successfully`);
      } catch (error: any) {
        console.error(`❌ Failed to update ${exchange} API keys:`, error.message);
      }
    } else {
      console.log(`⚠️ Skipping ${exchange} - no API keys provided`);
    }
  }

  if (!hasValidKeys) {
    console.log(`⚠️ No valid API keys provided for user: ${number}`);
    return res.status(400).send(
      page(`
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <h3 style="color: #ef4444; margin-bottom: 12px;">No API Keys Provided</h3>
        <p style="color: #64748b; margin-bottom: 24px;">Please provide at least one complete set of exchange API credentials.</p>
        <button onclick="history.back()" class="btn btn-primary">Go Back</button>
      </div>
    `)
    );
  }

  await delToken(`change-api:${token}`);
  console.log(`🧹 API change token cleaned up: ${token}`);

  // Send WhatsApp confirmation
  try {
    if (config.twilio.accountSid && config.twilio.authToken && config.twilio.from) {
      console.log(`📱 Sending API update confirmation to: ${number}`);
      const client = twilio(config.twilio.accountSid, config.twilio.authToken);
      
      const exchangeList = updatedExchanges.map(ex => 
        ex.charAt(0).toUpperCase() + ex.slice(1)
      ).join(', ');
      
      await client.messages.create({
        from: config.twilio.from,
        to: number,
        body: `🔄 Your API keys have been updated successfully!\n\n🏦 Updated exchanges: ${exchangeList}\n\n💡 Type "fetch my assets" to see your portfolio.`,
      });
      console.log(`✅ API update confirmation sent successfully`);
    }
  } catch (e: any) {
    console.error(`❌ Failed to send API update confirmation:`, e.message);
  }

  console.log(`🎉 Multi-exchange API keys updated successfully for: ${number}`);
  console.log(`📊 Updated exchanges: ${updatedExchanges.join(', ')}`);
  
  res.send(
    page(`
    <div style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 64px; margin-bottom: 24px;">🎉</div>
      <h3 style="color: #10b981; margin-bottom: 16px;">API Keys Updated!</h3>
      <p style="color: #64748b; margin-bottom: 24px;">Your exchange API credentials have been updated and encrypted securely.</p>
      
      <div style="background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <div style="font-size: 24px; margin-bottom: 12px;">🏦</div>
        <p style="color: #065f46; font-weight: 600; margin: 0 0 8px 0;">Updated Exchanges:</p>
        <p style="color: #059669; margin: 0;">${updatedExchanges.map(ex => 
          ex.charAt(0).toUpperCase() + ex.slice(1)
        ).join(', ')}</p>
      </div>
      
      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; color: #0369a1; margin-bottom: 20px;">
        💬 <strong>Next:</strong> Return to WhatsApp and type "fetch my assets" to see your updated portfolio
      </div>
      
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; color: #92400e;">
        <strong>🔐 Security Reminder:</strong> Your API keys are encrypted and stored securely. Only read permissions should be enabled on your exchange accounts.
      </div>
    </div>
  `)
  );
});

// Handle wallet changes
router.post("/change-wallets/:token", async (req, res) => {
  const token = req.params.token;
  console.log(`🔄 Wallet addresses update submission for token: ${token}`);
  const number = await getToken(`change-wallets:${token}`);
  if (!number) {
    console.log(`❌ Invalid token on wallet addresses update: ${token}`);
    return res.status(400).send(
      page(`
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid Link</h3>
        <p style="color: #64748b;">This wallet management link is no longer valid.</p>
      </div>
    `)
    );
  }

  // Process wallet addresses
  const walletAddresses = (req.body as any)?.walletAddress || [];
  const walletLabels = (req.body as any)?.walletLabel || [];

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
      `⚠️  Invalid wallet addresses provided for wallet update: ${number}`,
      invalidWallets
    );
    return res.status(400).send(
      page(`
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🚫</div>
        <h3 style="color: #ef4444; margin-bottom: 12px;">Invalid Wallet Address</h3>
        <p style="color: #64748b; margin-bottom: 24px;">One or more wallet addresses have an invalid format.</p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; color: #b91c1c;">
          <strong>Invalid addresses:</strong><br>
          ${invalidWallets.map((addr) => `• ${addr}`).join("<br>")}
        </div>
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; color: #0369a1; margin-top: 16px;">
          💡 Supported formats: Ethereum (0x...), Bitcoin (1..., 3..., bc1...), and other major crypto addresses.
        </div>
      </div>
    `)
    );
  }

  console.log(`🔗 Updating wallet addresses for: ${number}`);

  // Get user
  const user = await prisma.user.findUnique({
    where: { whatsappNumber: number },
  });

  if (!user) {
    return res.status(404).send(
      page(`
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <h3 style="color: #ef4444; margin-bottom: 12px;">User Not Found</h3>
        <p style="color: #64748b;">Unable to find user account.</p>
      </div>
    `)
    );
  }

  // Delete existing wallet addresses
  await prisma.walletAddress.deleteMany({
    where: { userId: user.id },
  });

  // Create new wallet addresses if any
  if (validWallets.length > 0) {
    await prisma.walletAddress.createMany({
      data: validWallets.map((wallet: any) => ({
        userId: user.id,
        address: wallet.address,
        label: wallet.label,
      })),
    });
  }

  await delToken(`change-wallets:${token}`);
  console.log(`🧹 Wallet change token cleaned up: ${token}`);

  // Send WhatsApp confirmation
  try {
    if (
      config.twilio.accountSid &&
      config.twilio.authToken &&
      config.twilio.from
    ) {
      console.log(`📱 Sending wallet update confirmation to: ${number}`);
      const client = twilio(config.twilio.accountSid, config.twilio.authToken);
      const message =
        validWallets.length > 0
          ? `🔄 Your wallet addresses have been updated! Now tracking ${
              validWallets.length
            } wallet${validWallets.length > 1 ? "s" : ""}.`
          : "🔄 All wallet addresses have been removed from your account.";

      await client.messages.create({
        from: config.twilio.from,
        to: number,
        body: message,
      });
      console.log(`✅ Wallet update confirmation sent successfully`);
    }
  } catch (e: any) {
    console.error(`❌ Failed to send wallet update confirmation:`, e.message);
  }

  console.log(`🎉 Wallet addresses updated successfully for: ${number}`);
  const walletMessage =
    validWallets.length > 0
      ? `${validWallets.length} wallet address${
          validWallets.length > 1 ? "es" : ""
        } saved`
      : "all wallet addresses removed";

  res.send(
    page(`
    <div style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 64px; margin-bottom: 24px;">🎉</div>
      <h3 style="color: #10b981; margin-bottom: 16px;">Wallets Updated!</h3>
      <p style="color: #64748b; margin-bottom: 24px;">Your wallet addresses have been updated - ${walletMessage}.</p>
      <div style="background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <div style="font-size: 24px; margin-bottom: 12px;">✅</div>
        <p style="color: #065f46; font-weight: 600; margin: 0;">Wallet configuration updated</p>
      </div>
      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; color: #0369a1;">
        💬 <strong>Next:</strong> Return to WhatsApp to continue trading
      </div>
    </div>
  `)
  );
});

export default router;
