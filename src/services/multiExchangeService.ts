import ccxt from "ccxt";
import { prisma } from "../db/prisma.js";
import { decrypt } from "./cryptoService.js";
import { getUserWalletAddresses } from "./userService.js";
import {
  getMultipleWalletPortfolios,
  WalletPortfolio,
} from "./moralisService.js";

export interface ExchangeBalance {
  exchange: string;
  totalUSDT: number;
  holdings: Array<{
    asset: string;
    amount: number;
    estUSDT: number;
    free?: number;
    used?: number;
  }>;
  error?: string;
}

export interface Position {
  id: string;
  exchange: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  notional?: number;
  entryPrice?: number;
  markPrice?: number;
  percentage?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  marginType?: "isolated" | "cross";
  leverage?: number;
  isActive: boolean;
}

export interface MultiExchangePortfolioData {
  exchanges: ExchangeBalance[];
  walletPortfolios: WalletPortfolio[];
  positions: Position[];
  combinedSummary: {
    exchangesTotalUSDT: number;
    walletUSDT: number;
    totalUSDT: number;
    totalPositions: number;
    totalUnrealizedPnl: number;
    topCombinedHoldings: Array<{
      source: "exchange" | "wallet";
      exchange?: string;
      asset: string;
      amount: number;
      estUSDT: number;
      chain?: string;
    }>;
  };
  plAnalysis: string;
}

// Exchange configuration
const EXCHANGE_CONFIGS = {
  binance: {
    class: ccxt.binance,
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
    },
  },
  "binance-futures": {
    class: ccxt.binance,
    options: {
      defaultType: "future",
      adjustForTimeDifference: true,
    },
  },
  bybit: {
    class: ccxt.bybit,
    options: {
      defaultType: "unified", // Unified trading account for spot and futures
    },
  },
  kraken: {
    class: ccxt.kraken,
    options: {},
  },
};

// Liquid staking and derivative token mapping
const TOKEN_MAPPING: Record<string, { baseAsset: string; multiplier: number }> =
  {
    // Binance Liquid Swap tokens
    LDETH: { baseAsset: "ETH", multiplier: 1.0 }, // Lido Staked ETH
    LDUSDC: { baseAsset: "USDC", multiplier: 1.0 }, // Lido USD Coin
    LDBTC: { baseAsset: "BTC", multiplier: 1.0 }, // Lido BTC
    LDBNB: { baseAsset: "BNB", multiplier: 1.0 }, // Lido BNB

    // Other liquid staking tokens
    stETH: { baseAsset: "ETH", multiplier: 1.0 }, // Lido Staked ETH
    rETH: { baseAsset: "ETH", multiplier: 1.0 }, // Rocket Pool ETH
    cbETH: { baseAsset: "ETH", multiplier: 1.0 }, // Coinbase Wrapped Staked ETH
    sETH2: { baseAsset: "ETH", multiplier: 1.0 }, // StakeWise Staked ETH2

    // Wrapped tokens
    WETH: { baseAsset: "ETH", multiplier: 1.0 }, // Wrapped ETH
    WBTC: { baseAsset: "BTC", multiplier: 1.0 }, // Wrapped BTC
    WBNB: { baseAsset: "BNB", multiplier: 1.0 }, // Wrapped BNB

    // Add more as needed
  };

async function fetchExchangeBalance(
  exchangeName: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string
): Promise<ExchangeBalance> {
  console.log(`🏦 Fetching balance from ${exchangeName}...`);

  const config =
    EXCHANGE_CONFIGS[exchangeName as keyof typeof EXCHANGE_CONFIGS];
  if (!config) {
    return {
      exchange: exchangeName,
      totalUSDT: 0,
      holdings: [],
      error: `Unsupported exchange: ${exchangeName}`,
    };
  }

  try {
    const exchangeOptions: any = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      sandbox: false,
      options: config.options,
    };

    // Add passphrase if provided (for exchanges like KuCoin)
    if (passphrase) {
      exchangeOptions.passphrase = passphrase;
    }

    const exchange = new config.class(exchangeOptions);

    // Load markets
    await exchange.loadMarkets();

    // Fetch balance
    const balance = await exchange.fetchBalance();

    if (!balance || !balance.total) {
      console.log(`⚠️ No balance data from ${exchangeName}`);
      return {
        exchange: exchangeName,
        totalUSDT: 0,
        holdings: [],
      };
    }

    // Filter out zero balances and convert to our format
    const holdings = Object.entries(balance.total)
      .filter(([asset, amount]) => (amount as number) > 0.001) // Filter tiny amounts
      .map(([asset, amount]) => {
        const free = (balance.free as any)?.[asset] || 0;
        const used = (balance.used as any)?.[asset] || 0;

        return {
          asset: asset,
          amount: amount as number,
          free: free as number,
          used: used as number,
          estUSDT: 0, // Will be calculated later
        };
      });

    console.log(
      `📊 ${exchangeName}: Found ${holdings.length} assets with balance`
    );
    console.log(
      `💰 Assets found:`,
      holdings.map((h) => `${h.asset}: ${h.amount}`)
    );

    // Calculate USDT values
    let totalUSDT = 0;
    const enrichedHoldings = [];

    for (const holding of holdings) {
      try {
        let usdtValue = 0;

        console.log(`💱 Processing ${holding.asset}: ${holding.amount}`);

        if (holding.asset === "USDT" || holding.asset === "USD") {
          usdtValue = holding.amount;
          console.log(`� ${holding.asset}: ${holding.amount} USDT (direct)`);
        } else if (holding.asset.startsWith("LD")) {
          // Handle Liquid Swap tokens (LD prefix)
          const baseAsset = holding.asset.substring(2); // Remove 'LD' prefix
          console.log(
            `💧 Liquid Swap token detected: ${holding.asset} -> ${baseAsset}`
          );

          // For Liquid Swap tokens, treat them 1:1 with their base asset
          if (baseAsset === "USDC" || baseAsset === "USDT") {
            usdtValue = holding.amount; // LDUSDC ≈ USDC ≈ 1 USD
            console.log(
              `💧 ${holding.asset}: ${holding.amount} ≈ $${usdtValue.toFixed(
                2
              )} (${baseAsset} equivalent)`
            );
          } else if (
            baseAsset === "BTC" ||
            baseAsset === "ETH" ||
            baseAsset === "BNB"
          ) {
            // Get price for the base asset
            const baseSymbol = `${baseAsset}/USDT`;
            if (exchange.markets[baseSymbol]) {
              try {
                const ticker = await exchange.fetchTicker(baseSymbol);
                if (ticker && typeof ticker.last === "number") {
                  usdtValue = holding.amount * ticker.last;
                  console.log(
                    `💧 ${holding.asset}: ${holding.amount} × $${
                      ticker.last
                    } = $${usdtValue.toFixed(2)} (${baseAsset} equivalent)`
                  );
                }
              } catch (tickerError: any) {
                console.log(
                  `⚠️ Could not get ${baseAsset} price: ${tickerError.message}`
                );
              }
            }
          }
        } else if (holding.asset === "USDC") {
          // Regular USDC - treat as 1:1 with USD
          usdtValue = holding.amount;
          console.log(
            `💰 ${holding.asset} treated as USD stable coin: $${usdtValue}`
          );
        } else if (TOKEN_MAPPING[holding.asset]) {
          // Handle liquid staking and derivative tokens
          const mapping = TOKEN_MAPPING[holding.asset];
          console.log(
            `� ${holding.asset} mapped to ${mapping.baseAsset} with ${mapping.multiplier}x multiplier`
          );

          const baseSymbol = `${mapping.baseAsset}/USDT`;
          if (exchange.markets[baseSymbol]) {
            try {
              const ticker = await exchange.fetchTicker(baseSymbol);
              if (ticker && typeof ticker.last === "number") {
                usdtValue = holding.amount * ticker.last * mapping.multiplier;
                console.log(
                  `💰 ${holding.asset} value calculated: $${usdtValue.toFixed(
                    2
                  )}`
                );
              }
            } catch (tickerError: any) {
              console.log(
                `⚠️ Could not get ticker for ${baseSymbol}: ${tickerError.message}`
              );
            }
          } else {
            console.log(
              `❌ ${baseSymbol} market not found for ${holding.asset} calculation`
            );
          }
        } else {
          // Try multiple symbol formats for regular assets
          const symbols = [
            `${holding.asset}/USDT`,
            `${holding.asset}USDT`,
            `${holding.asset}/USD`,
          ];
          let priceFound = false;

          for (const symbol of symbols) {
            if (exchange.markets[symbol]) {
              try {
                const ticker = await exchange.fetchTicker(symbol);
                if (ticker && typeof ticker.last === "number") {
                  usdtValue = holding.amount * ticker.last;
                  console.log(
                    `📈 ${holding.asset}: ${holding.amount} × $${
                      ticker.last
                    } = $${usdtValue.toFixed(2)} (via ${symbol})`
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
            console.log(
              `❌ Could not find price for ${holding.asset} in any format`
            );
          }
        }

        console.log(`💰 Final USDT value for ${holding.asset}: $${usdtValue}`);

        enrichedHoldings.push({
          ...holding,
          estUSDT: usdtValue,
        });

        totalUSDT += usdtValue;
        console.log(`📊 Running total: $${totalUSDT}`);
      } catch (error: any) {
        console.warn(
          `⚠️ Could not get price for ${holding.asset} on ${exchangeName}: ${error.message}`
        );
        enrichedHoldings.push({
          ...holding,
          estUSDT: 0,
        });
      }
    }

    const filteredHoldings = enrichedHoldings.filter((h) => h.estUSDT > 0.1);
    console.log(`🎯 Final result for ${exchangeName}:`);
    console.log(`   Total USDT: $${totalUSDT}`);
    console.log(
      `   Holdings: ${enrichedHoldings.length} → ${filteredHoldings.length} (after filter)`
    );

    return {
      exchange: exchangeName,
      totalUSDT,
      holdings: filteredHoldings, // Filter out very low value holdings
    };
  } catch (error: any) {
    console.error(
      `❌ Error fetching balance from ${exchangeName}:`,
      error.message
    );
    return {
      exchange: exchangeName,
      totalUSDT: 0,
      holdings: [],
      error: error.message,
    };
  }
}

// Fetch positions from a specific exchange
async function fetchExchangePositions(
  exchangeName: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string
): Promise<Position[]> {
  console.log(`🎯 Fetching positions from ${exchangeName}...`);

  const config =
    EXCHANGE_CONFIGS[exchangeName as keyof typeof EXCHANGE_CONFIGS];
  if (!config) {
    console.log(`❌ Unsupported exchange for positions: ${exchangeName}`);
    return [];
  }

  // Check if exchange supports positions/futures
  function supportsFutures(exchange: string): boolean {
    const futuresSupported = ["binance", "bybit", "okx", "bitmex", "bitget"];
    return (
      futuresSupported.includes(exchange.toLowerCase()) ||
      exchange.includes("futures")
    );
  }

  if (!supportsFutures(exchangeName)) {
    console.log(`⚠️ ${exchangeName} does not support positions (spot only)`);
    return [];
  }

  try {
    // Special handling for futures exchanges
    let finalOptions: any = { ...config.options };

    if (
      exchangeName.includes("futures") ||
      (exchangeName === "bybit" && supportsFutures(exchangeName))
    ) {
      finalOptions.defaultType =
        exchangeName === "bybit" ? "unified" : "future";
    }

    const exchangeOptions: any = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      sandbox: false,
      options: finalOptions,
    };

    if (passphrase) {
      exchangeOptions.passphrase = passphrase;
    }

    const exchange = new config.class(exchangeOptions);
    await exchange.loadMarkets();

    // Fetch positions
    console.log(`📊 Fetching positions from ${exchangeName}...`);
    const positions = await exchange.fetchPositions();

    console.log(
      `🎯 Found ${positions.length} total positions from ${exchangeName}`
    );

    // Filter only active positions
    const activePositions = positions.filter(
      (pos: any) => pos.contracts > 0 || Math.abs(pos.unrealizedPnl || 0) > 0.01
    );

    console.log(
      `🔥 Active positions: ${activePositions.length}/${positions.length}`
    );

    const formattedPositions: Position[] = activePositions.map((pos: any) => {
      const side = pos.side === "long" ? "long" : "short";
      const unrealizedPnl = pos.unrealizedPnl || 0;
      const percentage = pos.percentage || 0;

      console.log(
        `📍 Position: ${pos.symbol} ${side} - Size: ${
          pos.contracts
        }, PnL: $${unrealizedPnl.toFixed(2)} (${percentage.toFixed(2)}%)`
      );

      return {
        id: `${exchangeName}-${pos.symbol}-${Date.now()}`,
        exchange: exchangeName,
        symbol: pos.symbol,
        side,
        size: pos.contracts || pos.contractSize || 0,
        notional: pos.notional,
        entryPrice: pos.entryPrice,
        markPrice: pos.markPrice,
        percentage: percentage,
        unrealizedPnl: unrealizedPnl,
        realizedPnl: pos.realizedPnl || 0,
        marginType: pos.marginType as "isolated" | "cross" | undefined,
        leverage: pos.leverage,
        isActive: true,
      };
    });

    console.log(
      `✅ Formatted ${formattedPositions.length} active positions from ${exchangeName}`
    );
    return formattedPositions;
  } catch (error: any) {
    console.error(
      `❌ Error fetching positions from ${exchangeName}:`,
      error.message
    );
    return [];
  }
}

// Store positions in database
async function storePositionsInDatabase(
  userId: string,
  positions: Position[]
): Promise<void> {
  console.log(`💾 Storing ${positions.length} positions for user: ${userId}`);

  try {
    // Deactivate all existing positions for this user
    await prisma.position.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    // Insert new positions
    for (const position of positions) {
      await prisma.position.upsert({
        where: {
          userId_exchange_symbol: {
            userId: userId,
            exchange: position.exchange,
            symbol: position.symbol,
          },
        },
        create: {
          userId: userId,
          exchange: position.exchange,
          symbol: position.symbol,
          side: position.side,
          size: position.size,
          notional: position.notional,
          entryPrice: position.entryPrice,
          markPrice: position.markPrice,
          percentage: position.percentage,
          unrealizedPnl: position.unrealizedPnl,
          realizedPnl: position.realizedPnl,
          marginType: position.marginType,
          leverage: position.leverage,
          isActive: true,
        },
        update: {
          side: position.side,
          size: position.size,
          notional: position.notional,
          entryPrice: position.entryPrice,
          markPrice: position.markPrice,
          percentage: position.percentage,
          unrealizedPnl: position.unrealizedPnl,
          realizedPnl: position.realizedPnl,
          marginType: position.marginType,
          leverage: position.leverage,
          isActive: true,
          timestamp: new Date(),
        },
      });
    }

    console.log(
      `✅ Successfully stored ${positions.length} positions in database`
    );
  } catch (error: any) {
    console.error(`❌ Error storing positions in database:`, error.message);
  }
}

export async function fetchMultiExchangePortfolio(
  userId: string
): Promise<MultiExchangePortfolioData> {
  console.log(`🔄 Fetching multi-exchange portfolio for user: ${userId}`);

  // Get user data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      exchangeKeys: {
        where: { isActive: true },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const exchangeBalances: ExchangeBalance[] = [];
  const allPositions: Position[] = [];

  // Fetch balances and positions from all configured exchanges
  for (const exchangeKey of user.exchangeKeys) {
    console.log(`🏦 Fetching data from ${exchangeKey.exchange}...`);

    const apiKey = decrypt(exchangeKey.encryptedApiKey);
    const apiSecret = decrypt(exchangeKey.encryptedApiSecret);
    const passphrase = exchangeKey.encryptedPassphrase
      ? decrypt(exchangeKey.encryptedPassphrase)
      : undefined;

    // Fetch balance
    const balance = await fetchExchangeBalance(
      exchangeKey.exchange,
      apiKey,
      apiSecret,
      passphrase
    );
    exchangeBalances.push(balance);

    // Fetch positions (only for futures exchanges)
    const positions = await fetchExchangePositions(
      exchangeKey.exchange,
      apiKey,
      apiSecret,
      passphrase
    );
    allPositions.push(...positions);
  }

  // Store positions in database
  if (allPositions.length > 0) {
    await storePositionsInDatabase(userId, allPositions);
  }

  // Fetch wallet portfolios
  console.log(`🔗 Fetching wallet portfolios...`);
  const walletAddresses = await getUserWalletAddresses(userId);
  const walletPortfolios =
    walletAddresses.length > 0
      ? await getMultipleWalletPortfolios(walletAddresses.map((w) => w.address))
      : [];

  // Calculate combined summary
  const exchangesTotalUSDT = exchangeBalances.reduce(
    (sum, ex) => sum + ex.totalUSDT,
    0
  );
  const walletUSDT = walletPortfolios.reduce(
    (sum, wallet) => sum + wallet.totalUSDValue,
    0
  );
  const totalUSDT = exchangesTotalUSDT + walletUSDT;

  // Calculate position stats
  const totalPositions = allPositions.length;
  const totalUnrealizedPnl = allPositions.reduce(
    (sum, pos) => sum + (pos.unrealizedPnl || 0),
    0
  );

  // Combine top holdings from all sources
  const topCombinedHoldings = [];

  // Add exchange holdings
  for (const exchange of exchangeBalances) {
    for (const holding of exchange.holdings.slice(0, 10)) {
      topCombinedHoldings.push({
        source: "exchange" as const,
        exchange: exchange.exchange,
        asset: holding.asset,
        amount: holding.amount,
        estUSDT: holding.estUSDT,
      });
    }
  }

  // Add wallet holdings
  for (const wallet of walletPortfolios) {
    for (const token of wallet.tokens.slice(0, 10)) {
      if (token.usd_value > 1) {
        topCombinedHoldings.push({
          source: "wallet" as const,
          asset: token.symbol,
          amount: parseFloat(token.balance || "0"),
          estUSDT: token.usd_value,
          chain: token.name || "Unknown",
        });
      }
    }
  }

  // Sort by USD value and take top holdings
  topCombinedHoldings.sort((a, b) => b.estUSDT - a.estUSDT);

  console.log(`💰 Multi-exchange portfolio summary:`);
  console.log(`   - Exchanges: $${exchangesTotalUSDT.toLocaleString()}`);
  console.log(`   - Wallets: $${walletUSDT.toLocaleString()}`);
  console.log(`   - Total: $${totalUSDT.toLocaleString()}`);
  console.log(`   - Active Positions: ${totalPositions}`);
  console.log(`   - Unrealized P&L: $${totalUnrealizedPnl.toFixed(2)}`);

  return {
    exchanges: exchangeBalances,
    walletPortfolios,
    positions: allPositions,
    combinedSummary: {
      exchangesTotalUSDT,
      walletUSDT,
      totalUSDT,
      totalPositions,
      totalUnrealizedPnl,
      topCombinedHoldings: topCombinedHoldings.slice(0, 15),
    },
    plAnalysis: "Multi-exchange portfolio fetched successfully",
  };
}

// Fetch only positions (separate from portfolio)
export async function fetchActivePositions(
  userId: string
): Promise<Position[]> {
  console.log(`🎯 Fetching active positions for user: ${userId}`);

  // Get user data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      exchangeKeys: {
        where: { isActive: true },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const allPositions: Position[] = [];

  // Fetch positions from all futures exchanges
  for (const exchangeKey of user.exchangeKeys) {
    // Only fetch from futures-capable exchanges
    if (
      exchangeKey.exchange.includes("futures") ||
      exchangeKey.exchange === "bybit"
    ) {
      console.log(`🎯 Fetching positions from ${exchangeKey.exchange}...`);

      const apiKey = decrypt(exchangeKey.encryptedApiKey);
      const apiSecret = decrypt(exchangeKey.encryptedApiSecret);
      const passphrase = exchangeKey.encryptedPassphrase
        ? decrypt(exchangeKey.encryptedPassphrase)
        : undefined;

      const positions = await fetchExchangePositions(
        exchangeKey.exchange,
        apiKey,
        apiSecret,
        passphrase
      );
      allPositions.push(...positions);
    }
  }

  // Store positions in database
  if (allPositions.length > 0) {
    await storePositionsInDatabase(userId, allPositions);
  }

  console.log(`🎯 Total active positions found: ${allPositions.length}`);
  return allPositions;
}
