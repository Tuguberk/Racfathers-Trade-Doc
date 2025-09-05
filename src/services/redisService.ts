import { Redis } from "ioredis";
import { config } from "../config.js";

const redis = new Redis(config.redisUrl);

export async function setToken(key: string, value: string, ttlSeconds: number) {
  await redis.set(key, value, "EX", ttlSeconds);
}

export async function getToken(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function delToken(key: string) {
  await redis.del(key);
}

// Portfolio caching functions
export async function setCachedPortfolio(
  userId: string,
  portfolioData: any,
  ttlSeconds: number = 600
) {
  const key = `portfolio:${userId}`;
  await redis.set(key, JSON.stringify(portfolioData), "EX", ttlSeconds);
}

export async function getCachedPortfolio(userId: string): Promise<any | null> {
  const key = `portfolio:${userId}`;
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

export async function deleteCachedPortfolio(userId: string) {
  const key = `portfolio:${userId}`;
  await redis.del(key);
}

export { redis };
