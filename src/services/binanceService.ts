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
  });

  try {
    console.log(`💰 Fetching account balance from Binance`);
    const balance = await exchange.fetchBalance();
    console.log(`✅ Balance fetched successfully`);

    // Estimate total USDT value for non-USDT assets using tickers
    let totalUSDT = 0;
    const holdings: Array<{ asset: string; amount: number; estUSDT: number }> =
      [];

    // Prepare markets once
    console.log(`📊 Loading market data from Binance`);
    await exchange.loadMarkets();
    console.log(`✅ Market data loaded`);

    const totals = balance.total || {};
    const assetCount = Object.keys(totals).length;
    console.log(`🔍 Processing ${assetCount} assets in portfolio`);

    for (const [asset, amount] of Object.entries(totals as any)) {
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) continue;
      let estUSDT = 0;
      if (asset === "USDT") {
        estUSDT = numAmount;
        console.log(`💵 ${asset}: ${numAmount} USDT (direct)`);
      } else {
        const symbol = `${asset}/USDT`;
        if (exchange.markets[symbol]) {
          try {
            const ticker = await exchange.fetchTicker(symbol);
            if (ticker && typeof ticker.last === "number") {
              estUSDT = numAmount * ticker.last;
              console.log(
                `📈 ${asset}: ${numAmount} × $${
                  ticker.last
                } = $${estUSDT.toFixed(2)}`
              );
            }
          } catch (tickerError: any) {
            console.log(
              `⚠️  Could not fetch ticker for ${symbol}: ${tickerError.message}`
            );
          }
        } else {
          console.log(`❌ No market found for ${symbol}`);
        }
      }
      totalUSDT += estUSDT;
      if (estUSDT > 1) holdings.push({ asset, amount: numAmount, estUSDT });
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
    throw new Error(`Binance API Error: ${error.message}`);
  }
}
