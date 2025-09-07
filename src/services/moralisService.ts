import Moralis from "moralis";
import { config } from "../config.js";

// Type definitions
interface Token {
  balance: string;
  decimals: number;
  symbol: string;
  name: string;
  token_address: string;
  usd_value: number;
  usd_price: number;
  chain: string;
}

interface NFT {
  [key: string]: any;
  chain: string;
}

export interface WalletPortfolio {
  address: string;
  tokens: Token[];
  nfts: NFT[];
  totalUSDValue: number;
}

export async function initMoralis() {
  if (!Moralis.Core.isStarted) {
    if (!config.moralisApiKey) {
      throw new Error("MORALIS_API_KEY is required");
    }
    await Moralis.start({
      apiKey: config.moralisApiKey,
    });
  }
  console.log("🔗 Moralis initialized for wallet portfolio fetching");
}

// Chain hexes for supported networks
const CHAINS = {
  // Mainnets
  eth: "0x1",
  polygon: "0x89",
  bsc: "0x38",
  optimism: "0xa",
  avalanche: "0xa86a",
  arbitrum: "0xa4b1",

  // Testnets (commented out for production)
  // sepolia: "0xaa36a7",
  // goerli: "0x5",
  // mumbai: "0x13881",
  // bsc_testnet: "0x61",
  // avalanche_fuji: "0xa869",
  // arbitrum_goerli: "0x66eed",
};

// Fetch token balances for all supported chains
export async function getTokenBalances(
  address: string
): Promise<{ tokens: Token[] }> {
  await initMoralis();
  console.log(`🔍 Fetching token balances for address: ${address}`);

  // Get balances from all chains
  const chainEntries = Object.entries(CHAINS) as [
    keyof typeof CHAINS,
    string
  ][];
  const chainPromises = chainEntries.map(
    async ([chainKey, chainId]): Promise<Token[]> => {
      try {
        console.log(`🔗 Fetching tokens for ${chainKey} (${chainId})...`);
        const response =
          await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
            address,
            chain: chainId,
            excludeSpam: true,
            excludeUnverifiedContracts: true,
          });

        const result = (response.toJSON().result || []) as any[];
        console.log(`✅ Chain ${chainKey} returned ${result.length} tokens`);

        // Add chain information to each token
        return result.map(
          (token): Token => ({
            ...token,
            chain: chainKey,
            // Ensure consistent property names
            balance: token.balance || "0",
            decimals: token.decimals || 18,
            symbol: token.symbol || "",
            name: token.name || token.symbol || "Unknown Token",
            token_address: token.token_address,
            usd_value: token.usd_value || 0,
            usd_price: token.usd_price || 0,
          })
        );
      } catch (error: any) {
        console.warn(
          `⚠️ Failed to fetch tokens for chain ${chainKey}:`,
          error.message
        );
        return [];
      }
    }
  );

  try {
    const results = await Promise.all(chainPromises);

    // Flatten the array and filter tokens
    const tokens = (results.flat() as Token[]).filter((token) => {
      if (!token) return false;

      // Only include tokens with meaningful USD value (minimum $0.01)
      const shouldInclude = Number(token.usd_value) >= 0.01;

      if (shouldInclude) {
        console.log(
          `💰 Including ${token.symbol} on ${
            token.chain
          }: $${token.usd_value.toFixed(2)}`
        );
      }

      return shouldInclude;
    });

    console.log(`🎯 Total tokens found across all chains: ${tokens.length}`);
    return { tokens };
  } catch (error) {
    console.error("❌ Error processing token results:", error);
    return { tokens: [] };
  }
}

// Fetch NFT holdings with metadata
export async function getNFTs(address: string): Promise<{ nfts: NFT[] }> {
  await initMoralis();
  console.log(`🖼️ Fetching NFTs for address: ${address}`);

  // Get NFTs from all major chains
  const chainEntries = Object.entries(CHAINS) as [
    keyof typeof CHAINS,
    string
  ][];
  const chainPromises = chainEntries.map(
    async ([chainKey, chainId]): Promise<NFT[]> => {
      try {
        console.log(`🖼️ Fetching NFTs for ${chainKey}...`);
        const response = await Moralis.EvmApi.nft.getWalletNFTs({
          address,
          chain: chainId,
          excludeSpam: true,
          normalizeMetadata: true,
          mediaItems: false,
        });

        const nfts = response.toJSON().result as any[];
        console.log(`✅ Chain ${chainKey} returned ${nfts.length} NFTs`);

        // Add chain information to each NFT
        return nfts.map(
          (nft): NFT => ({
            ...nft,
            chain: chainKey,
          })
        );
      } catch (error: any) {
        console.warn(
          `⚠️ Failed to fetch NFTs for chain ${chainKey}:`,
          error.message
        );
        return [];
      }
    }
  );

  try {
    const results = await Promise.all(chainPromises);
    // Flatten the array of arrays and filter out empty results
    const nfts = results.flat().filter(Boolean) as NFT[];

    console.log(`🎯 Total NFTs found across all chains: ${nfts.length}`);
    return { nfts };
  } catch (error) {
    console.error("❌ Error processing NFT results:", error);
    return { nfts: [] };
  }
}

// Get complete wallet portfolio for a single address
export async function getWalletPortfolio(
  address: string
): Promise<WalletPortfolio> {
  console.log(`📊 Fetching complete portfolio for wallet: ${address}`);

  try {
    const [tokenData, nftData] = await Promise.all([
      getTokenBalances(address),
      getNFTs(address),
    ]);

    const totalUSDValue = tokenData.tokens.reduce(
      (sum, token) => sum + token.usd_value,
      0
    );

    console.log(`💼 Wallet ${address} portfolio summary:`);
    console.log(`   💰 Total USD Value: $${totalUSDValue.toFixed(2)}`);
    console.log(`   🪙 Tokens: ${tokenData.tokens.length}`);
    console.log(`   🖼️ NFTs: ${nftData.nfts.length}`);

    return {
      address,
      tokens: tokenData.tokens,
      nfts: nftData.nfts,
      totalUSDValue: Number(totalUSDValue.toFixed(2)),
    };
  } catch (error: any) {
    console.error(`❌ Error fetching portfolio for ${address}:`, error.message);
    return {
      address,
      tokens: [],
      nfts: [],
      totalUSDValue: 0,
    };
  }
}

// Get portfolios for multiple wallet addresses
export async function getMultipleWalletPortfolios(
  addresses: string[]
): Promise<WalletPortfolio[]> {
  console.log(
    `📊 Fetching portfolios for ${addresses.length} wallet addresses`
  );

  if (addresses.length === 0) {
    return [];
  }

  // Process wallets in parallel but with some rate limiting
  const batchSize = 3; // Process 3 wallets at a time to avoid rate limits
  const portfolios: WalletPortfolio[] = [];

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    console.log(
      `🔄 Processing wallet batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        addresses.length / batchSize
      )}`
    );

    const batchPromises = batch.map((address) => getWalletPortfolio(address));
    const batchResults = await Promise.all(batchPromises);
    portfolios.push(...batchResults);

    // Small delay between batches to be respectful to the API
    if (i + batchSize < addresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const totalWalletValue = portfolios.reduce(
    (sum, portfolio) => sum + portfolio.totalUSDValue,
    0
  );
  console.log(
    `🎯 Combined wallet portfolio value: $${totalWalletValue.toFixed(2)}`
  );

  return portfolios;
}
