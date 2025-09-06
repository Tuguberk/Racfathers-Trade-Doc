import express from "express";
import { prisma } from "../db/prisma.js";
import {
  getWalletPortfolio,
  initMoralis,
  WalletPortfolio,
} from "../services/moralisService.js";
import {
  fetchMultiExchangePortfolio,
  fetchActivePositions,
  Position,
} from "../services/multiExchangeService.js";

// Extended portfolio type with wallet info
interface WalletPortfolioWithInfo extends WalletPortfolio {
  walletAddress: string;
  walletLabel: string | null;
}

const router = express.Router();

// Get journal entry by ID
router.get("/api/journal/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Journal entry ID is required",
      });
    }

    const journalEntry = await prisma.journalEntry.findUnique({
      where: {
        id: id,
      },
    });

    if (!journalEntry) {
      return res.status(404).json({
        success: false,
        error: "Journal entry not found",
      });
    }

    // Fetch user's wallet addresses
    const walletAddresses = await prisma.walletAddress.findMany({
      where: {
        userId: journalEntry.userId,
      },
      select: {
        address: true,
        label: true,
      },
    });

    let assets: WalletPortfolioWithInfo[] = [];
    let exchangeData = null;
    let positions: Position[] = [];

    // If user has wallet addresses, fetch their assets
    if (walletAddresses.length > 0) {
      try {
        // Initialize Moralis if not already initialized
        await initMoralis();

        // Get portfolio for each wallet address
        const portfolioPromises = walletAddresses.map(
          async (wallet): Promise<WalletPortfolioWithInfo> => {
            try {
              const portfolio = await getWalletPortfolio(wallet.address);
              return {
                walletAddress: wallet.address,
                walletLabel: wallet.label,
                ...portfolio,
              };
            } catch (error) {
              console.warn(
                `Failed to fetch portfolio for ${wallet.address}:`,
                error
              );
              return {
                walletAddress: wallet.address,
                walletLabel: wallet.label,
                address: wallet.address,
                tokens: [],
                nfts: [],
                totalUSDValue: 0,
              };
            }
          }
        );

        assets = await Promise.all(portfolioPromises);
      } catch (error) {
        console.warn("Error fetching wallet assets:", error);
        // Continue without assets if there's an error
        assets = [];
      }
    }

    // Fetch exchange data
    try {
      exchangeData = await fetchMultiExchangePortfolio(journalEntry.userId);
    } catch (error) {
      console.warn("Error fetching exchange data:", error);
      exchangeData = null;
    }

    return res.json({
      success: true,
      data: {
        ...journalEntry,
        assets: assets,
        exchangeData: exchangeData,
      },
    });
  } catch (error) {
    console.error("Error fetching journal entry:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
