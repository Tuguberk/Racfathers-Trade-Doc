import { prisma } from "../db/prisma.js";

export interface WalletAddress {
  id: string;
  address: string;
  label: string | null;
  createdAt: Date;
}

/**
 * Basic validation for wallet address format
 * This is a simple check - you might want to add more specific validation per blockchain
 */
export function isValidWalletAddress(address: string): boolean {
  const trimmed = address.trim();

  // Basic checks for common wallet address formats
  if (trimmed.length < 20 || trimmed.length > 120) {
    return false;
  }

  // Check for common wallet address patterns
  const patterns = [
    /^0x[a-fA-F0-9]{40}$/, // Ethereum
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/, // Bitcoin Legacy
    /^bc1[a-z0-9]{39,59}$/, // Bitcoin Bech32
    /^[rX][a-zA-Z0-9]{24,34}$/, // Ripple
    /^[a-zA-Z0-9]{32,44}$/, // Generic crypto address pattern
  ];

  return patterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Get all wallet addresses for a user by WhatsApp number
 */
export async function getUserWalletAddresses(
  whatsappNumber: string
): Promise<WalletAddress[]> {
  const user = await prisma.user.findUnique({
    where: { whatsappNumber },
    include: {
      walletAddresses: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return user?.walletAddresses || [];
}

/**
 * Add a new wallet address for a user
 */
export async function addUserWalletAddress(
  whatsappNumber: string,
  address: string,
  label?: string
): Promise<WalletAddress> {
  const user = await prisma.user.findUnique({
    where: { whatsappNumber },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Check if wallet already exists
  const existingWallet = await prisma.walletAddress.findFirst({
    where: {
      userId: user.id,
      address: address.trim(),
    },
  });

  if (existingWallet) {
    throw new Error("Wallet address already exists for this user");
  }

  return await prisma.walletAddress.create({
    data: {
      userId: user.id,
      address: address.trim(),
      label: label?.trim() || null,
    },
  });
}

/**
 * Remove a wallet address for a user
 */
export async function removeUserWalletAddress(
  whatsappNumber: string,
  address: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { whatsappNumber },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const deletedWallet = await prisma.walletAddress.deleteMany({
    where: {
      userId: user.id,
      address: address.trim(),
    },
  });

  return deletedWallet.count > 0;
}

/**
 * Update wallet address label
 */
export async function updateWalletLabel(
  whatsappNumber: string,
  address: string,
  newLabel: string
): Promise<WalletAddress | null> {
  const user = await prisma.user.findUnique({
    where: { whatsappNumber },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const updatedWallet = await prisma.walletAddress.updateMany({
    where: {
      userId: user.id,
      address: address.trim(),
    },
    data: {
      label: newLabel.trim() || null,
    },
  });

  if (updatedWallet.count === 0) {
    return null;
  }

  // Return the updated wallet
  return await prisma.walletAddress.findFirst({
    where: {
      userId: user.id,
      address: address.trim(),
    },
  });
}
