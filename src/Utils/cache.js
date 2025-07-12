// Example: src/utils/cache.js
import Redis from "ioredis";
const redis = new Redis(process.env.REDIS_URL);
export const cacheGig = async (gigId, data) => redis.set(`gig:${gigId}`, JSON.stringify(data), "EX", 3600);