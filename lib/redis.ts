import { Redis } from "@upstash/redis";

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const isRedisConfigured =
  upstashUrl &&
  upstashToken &&
  !upstashUrl.includes("your-upstash-redis") &&
  !upstashToken.includes("your_upstash");

export const redis = isRedisConfigured
  ? new Redis({
      url: upstashUrl,
      token: upstashToken,
    })
  : null;

// In-Memory cache fallback for URL deduplication and rate limiting
const memorySeenUrls = new Set<string>();
const memoryStats = {
  dailyIngests: 0,
  lastReset: Date.now(),
};

export const RedisService = {
  /**
   * Check if a URL was recently ingested to avoid re-processing duplicate webhooks or RSS posts.
   * Returns true if the URL is new (and marks it seen), false if it was already processed.
   */
  async checkAndMarkUrlSeen(url: string, ttlSeconds = 86400 * 7): Promise<boolean> {
    const key = `seen_url:${encodeURIComponent(url)}`;
    if (redis) {
      try {
        const exists = await redis.get(key);
        if (exists) return false;
        await redis.set(key, "1", { ex: ttlSeconds });
        return true;
      } catch (err) {
        console.warn("[Redis] Failed to check seen URL, falling back to memory:", err);
      }
    }

    if (memorySeenUrls.has(url)) {
      return false;
    }
    memorySeenUrls.add(url);
    // Keep memory set from growing indefinitely
    if (memorySeenUrls.size > 5000) {
      const first = memorySeenUrls.values().next().value;
      if (first) memorySeenUrls.delete(first);
    }
    return true;
  },

  /**
   * Increments the daily ingested leads counter for analytics.
   */
  async recordIngestEvent(): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const key = `stats:ingests:${today}`;

    if (redis) {
      try {
        const count = await redis.incr(key);
        await redis.expire(key, 86400 * 30); // 30 days retention
        return count;
      } catch (err) {
        console.warn("[Redis] Failed to record ingest event:", err);
      }
    }

    memoryStats.dailyIngests += 1;
    return memoryStats.dailyIngests;
  },

  /**
   * Simple sliding-window rate limiter per IP/client token (e.g., 60 requests per minute).
   */
  async checkRateLimit(identifier: string, limit = 60, windowSeconds = 60): Promise<{ success: boolean; remaining: number }> {
    const key = `ratelimit:${identifier}`;
    if (redis) {
      try {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, windowSeconds);
        }
        return {
          success: current <= limit,
          remaining: Math.max(0, limit - current),
        };
      } catch (err) {
        console.warn("[Redis] Rate limit check error:", err);
      }
    }

    // Pass through if Redis not enabled
    return { success: true, remaining: limit };
  },
};
