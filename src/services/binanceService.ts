import ccxt from "ccxt";

export interface PortfolioData {
  balance: any;
  summary: {
    totalUSDT: number;
    topHoldings: Array<{ asset: string; amount: number; estUSDT: number }>;
  };
  plAnalysis: string;
}

export async function fetchPortfolio(
  apiKey: string,
  apiSecret: string
): Promise<PortfolioData> {
  console.log(`🏦 Connecting to Binance API...`);
  const exchange = new ccxt.binance({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
    sandbox: false, // Make sure we're not in sandbox mode
    options: {
      defaultType: "spot", // Specify spot trading
      adjustForTimeDifference: true, // Auto-adjust for time sync issues
    },
  });

  try {
    // Load markets first
    console.log(`📊 Loading market data from Binance`);
    await exchange.loadMarkets();
    console.log(`✅ Market data loaded`);

    // Check API connectivity and permissions
    console.log(`🔍 Testing API connectivity...`);
    try {
      const accountStatus = await exchange.fetchStatus();
      console.log(`📡 Exchange status:`, accountStatus);
    } catch (statusError: any) {
      console.log(`⚠️ Could not fetch exchange status:`, statusError.message);
    }

    // Fetch balance with different methods and account types
    console.log(`💰 Fetching account balance from Binance`);
    let balance;

    try {
      // Try spot balance first
      balance = await exchange.fetchBalance({ type: "spot" });
      console.log(`✅ Spot balance fetched successfully`);
    } catch (spotError: any) {
      console.log(`⚠️ Spot balance failed, trying default:`, spotError.message);
      try {
        balance = await exchange.fetchBalance();
        console.log(`✅ Default balance fetched successfully`);
      } catch (defaultError: any) {
        console.log(`❌ Default balance also failed:`, defaultError.message);
        throw new Error(`Cannot fetch balance: ${defaultError.message}`);
      }
    }

    // Debug: Log the raw balance structure
    console.log(`🔍 Raw balance keys:`, Object.keys(balance));
    console.log(`🔍 Balance.free keys:`, Object.keys(balance.free || {}));
    console.log(`🔍 Balance.used keys:`, Object.keys(balance.used || {}));
    console.log(`🔍 Balance.total keys:`, Object.keys(balance.total || {}));

    // Log some sample balances for debugging
    Object.keys(balance.free || {})
      .slice(0, 3)
      .forEach((asset) => {
        const free = (balance.free as any)?.[asset] || 0;
        const used = (balance.used as any)?.[asset] || 0;
        const total = (balance.total as any)?.[asset] || 0;
        console.log(`🔍 ${asset}: free=${free}, used=${used}, total=${total}`);
      });

    // Try to also get futures balance if available
    try {
      console.log(`🚀 Attempting to fetch futures balance...`);
      const futuresBalance = await exchange.fetchBalance({ type: "future" });
      console.log(
        `🚀 Futures balance retrieved, assets:`,
        Object.keys(futuresBalance.total || {})
      );
    } catch (futuresError: any) {
      console.log(`ℹ️ No futures access:`, futuresError.message);
    }

    // Estimate total USDT value for non-USDT assets using tickers
    let totalUSDT = 0;
    const holdings: Array<{ asset: string; amount: number; estUSDT: number }> =
      [];

    // Use free + used balances instead of just total
    const allBalances: { [key: string]: number } = {};

    // Combine free and used balances
    Object.keys(balance.free || {}).forEach((asset) => {
      const free = (balance.free as any)?.[asset] || 0;
      const used = (balance.used as any)?.[asset] || 0;
      const total = free + used;
      if (total > 0) {
        allBalances[asset] = total;
      }
    });

    // Also check total balances as fallback
    Object.keys(balance.total || {}).forEach((asset) => {
      const total = (balance.total as any)?.[asset] || 0;
      if (total > 0) {
        allBalances[asset] = Math.max(allBalances[asset] || 0, total);
      }
    });

    const assetCount = Object.keys(allBalances).length;
    console.log(`🔍 Processing ${assetCount} assets in portfolio`);

    if (assetCount === 0) {
      console.log(`⚠️ No assets found in balance! This might indicate:`);
      console.log(`   - API key doesn't have spot trading permissions`);
      console.log(`   - All balances are zero`);
      console.log(
        `   - Assets are in a different account type (futures, margin, etc.)`
      );
    }

    for (const [asset, amount] of Object.entries(allBalances)) {
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) {
        console.log(`⚠️ Skipping ${asset} with amount: ${amount}`);
        continue;
      }

      console.log(`💰 Processing ${asset}: ${numAmount}`);
      let estUSDT = 0;

      if (asset === "USDT") {
        estUSDT = numAmount;
        console.log(`💵 ${asset}: ${numAmount} USDT (direct)`);
      } else {
        // Try multiple symbol formats
        const symbols = [`${asset}/USDT`, `${asset}USDT`];
        let priceFound = false;

        for (const symbol of symbols) {
          if (exchange.markets[symbol]) {
            try {
              const ticker = await exchange.fetchTicker(symbol);
              if (ticker && typeof ticker.last === "number") {
                estUSDT = numAmount * ticker.last;
                console.log(
                  `📈 ${asset}: ${numAmount} × $${
                    ticker.last
                  } = $${estUSDT.toFixed(2)} (via ${symbol})`
                );
                priceFound = true;
                break;
              }
            } catch (tickerError: any) {
              console.log(
                `⚠️ Ticker error for ${symbol}: ${tickerError.message}`
              );
            }
          } else {
            console.log(`❌ Market not found: ${symbol}`);
          }
        }

        if (!priceFound) {
          console.log(`❌ Could not find price for ${asset} in any format`);
          // Still add to holdings with 0 USDT value for visibility
          holdings.push({ asset, amount: numAmount, estUSDT: 0 });
        }
      }

      totalUSDT += estUSDT;
      if (estUSDT > 0.01) {
        // Lower threshold
        holdings.push({ asset, amount: numAmount, estUSDT });
      }
    }

    holdings.sort((a, b) => b.estUSDT - a.estUSDT);
    console.log(`💼 Portfolio total: $${totalUSDT.toFixed(2)} USDT`);
    console.log(
      `🏆 Top holdings: ${holdings
        .slice(0, 3)
        .map((h) => `${h.asset}($${h.estUSDT.toFixed(2)})`)
        .join(", ")}`
    );

    // Simple P/L analysis placeholder based on value buckets
    const plAnalysis =
      totalUSDT > 10000
        ? "Substantial portfolio size; focus on risk-managed decisions."
        : totalUSDT > 1000
        ? "Moderate portfolio; small position sizing aids resilience."
        : "Lean portfolio; prioritize learning and strict risk control.";

    console.log(`🎯 Portfolio analysis: ${plAnalysis}`);

    return {
      balance,
      summary: {
        totalUSDT: Number(totalUSDT.toFixed(2)),
        topHoldings: holdings.slice(0, 5),
      },
      plAnalysis,
    };
  } catch (error: any) {
    console.error(`❌ Failed to fetch portfolio from Binance:`, error.message);

    // More specific error messages
    if (error.message.includes("Invalid API")) {
      throw new Error(
        `Invalid API credentials. Please check your Binance API key and secret.`
      );
    } else if (error.message.includes("IP")) {
      throw new Error(
        `IP restriction error. Please check your API key IP whitelist settings on Binance.`
      );
    } else if (error.message.includes("permission")) {
      throw new Error(
        `API permission error. Make sure your API key has spot trading permissions enabled.`
      );
    } else {
      throw new Error(`Binance API Error: ${error.message}`);
    }
  }
}
