// backend/config/redis.js
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || null;

let client = null;
let connected = false;
let connectionPromise = null;

/**
 * Create and connect Redis client with proper error handling
 */
async function createRedisClient() {
  if (client && connected) return client;
  if (connectionPromise) return connectionPromise;
  
  if (!REDIS_URL) {
    console.warn("[redis] REDIS_URL not provided, continuing without Redis.");
    return null;
  }

  connectionPromise = (async () => {
    try {
      if (client && !connected) {
        try {
          await client.quit();
        } catch (e) {
          // Ignore quit errors
        }
        client = null;
      }

      client = createClient({ 
        url: REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error("[redis] Max reconnection attempts reached");
              return new Error("Max reconnection attempts reached");
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      // Error handler
      client.on("error", (err) => {
        console.warn("[redis] error:", err && err.message ? err.message : err);
        connected = false;
      });

      // Connection events
      client.on("connect", () => {
        console.log("[redis] connecting...");
        connected = false;
      });

      client.on("ready", () => {
        connected = true;
        console.log("[redis] ✅ ready and connected");
      });

      client.on("reconnecting", () => {
        console.log("[redis] reconnecting...");
        connected = false;
      });

      client.on("end", () => {
        console.log("[redis] connection ended");
        connected = false;
      });

      await client.connect();
      return client;
    } catch (err) {
      console.warn("[redis] failed to connect:", err && err.message ? err.message : err);
      client = null;
      connected = false;
      connectionPromise = null;
      return null;
    }
  })();

  return connectionPromise;
}

// Initialize connection
const redisClientPromise = createRedisClient();

/**
 * Get Redis client - returns null if not available
 * Always use this function instead of direct client access
 */
export async function getRedisClient() {
  try {
    const c = await redisClientPromise;
    if (!c) return null;
    
    // Check if client is still connected
    if (!c.isOpen && !c.isReady) {
      // Try to reconnect
      try {
        await c.connect();
      } catch (e) {
        console.warn("[redis] reconnection failed:", e.message);
        return null;
      }
    }
    
    return c;
  } catch (err) {
    console.warn("[redis] getRedisClient error:", err.message);
    return null;
  }
}

/**
 * Export default for backward compatibility
 * Returns a Promise that resolves to the client or null
 */
export default redisClientPromise;

/**
 * Health check function
 */
export async function isRedisHealthy() {
  try {
    const c = await getRedisClient();
    if (!c) return false;
    await c.ping();
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Graceful shutdown
 */
export async function closeRedis() {
  if (client && connected) {
    try {
      await client.quit();
      console.log("[redis] connection closed");
    } catch (err) {
      console.warn("[redis] error closing connection:", err.message);
    }
    client = null;
    connected = false;
    connectionPromise = null;
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await closeRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeRedis();
  process.exit(0);
});
