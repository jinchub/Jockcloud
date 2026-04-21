const createRateLimitMiddleware = ({
  readSettings,
  cleanupWindowMs = 60 * 1000,
  defaultWindowSeconds = 60,
  defaultMaxRequests = 100
}) => {
  const rateLimitStore = new Map();

  const pruneExpired = (windowMs) => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (!data || !Array.isArray(data.timestamps)) {
        rateLimitStore.delete(key);
        continue;
      }
      const validTimestamps = data.timestamps.filter((ts) => now - ts <= windowMs);
      if (validTimestamps.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, { ...data, timestamps: validTimestamps });
      }
    }
  };

  const middleware = async (req, res, next) => {
    try {
      const settings = await readSettings();
      const rateLimitConfig = settings.system && settings.system.rateLimit
        ? settings.system.rateLimit
        : {};

      if (!rateLimitConfig.enabled) {
        next();
        return;
      }

      const windowSeconds = Number(rateLimitConfig.windowSeconds) || defaultWindowSeconds;
      const maxRequests = Number(rateLimitConfig.maxRequests) || defaultMaxRequests;
      const windowMs = windowSeconds * 1000;
      const now = Date.now();

      pruneExpired(windowMs);

      const key = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
      const current = rateLimitStore.get(key);
      const timestamps = current && Array.isArray(current.timestamps) ? current.timestamps : [];
      const recentTimestamps = timestamps.filter((ts) => now - ts <= windowMs);

      if (recentTimestamps.length >= maxRequests) {
        res.status(429).json({ message: "请求过于频繁，请稍后再试" });
        return;
      }

      recentTimestamps.push(now);
      rateLimitStore.set(key, { timestamps: recentTimestamps });
      next();
    } catch (_error) {
      const windowMs = defaultWindowSeconds * 1000;
      const now = Date.now();

      pruneExpired(windowMs);

      const key = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
      const current = rateLimitStore.get(key);
      const timestamps = current && Array.isArray(current.timestamps) ? current.timestamps : [];
      const recentTimestamps = timestamps.filter((ts) => now - ts <= windowMs);

      if (recentTimestamps.length >= defaultMaxRequests) {
        res.status(429).json({ message: "请求过于频繁，请稍后再试" });
        return;
      }

      recentTimestamps.push(now);
      rateLimitStore.set(key, { timestamps: recentTimestamps });
      next();
    }
  };

  const startCleanup = (intervalMs = 5 * 60 * 1000) => setInterval(() => {
    pruneExpired(cleanupWindowMs);
  }, intervalMs);

  return {
    middleware,
    startCleanup
  };
};

module.exports = {
  createRateLimitMiddleware
};
