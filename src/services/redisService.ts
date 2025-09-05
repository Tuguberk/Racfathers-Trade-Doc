import Redis from 'ioredis';
import { config } from '../config.js';

const redis = new Redis(config.redisUrl);

export async function setToken(key: string, value: string, ttlSeconds: number) {
  await redis.set(key, value, 'EX', ttlSeconds);
}

export async function getToken(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function delToken(key: string) {
  await redis.del(key);
}

export { redis };

