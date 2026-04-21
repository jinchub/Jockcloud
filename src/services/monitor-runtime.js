const createMonitorRuntime = ({
  pool,
  crypto,
  summarizeForLog,
  logInfo,
  logError
}) => {
  const apiMonitorStore = new Map();
  const API_MONITOR_MAX_ENTRIES = 100;
  const API_MONITOR_RETENTION_MS = 10 * 60 * 1000;

  const cleanupApiMonitorStore = () => {
    const now = Date.now();
    for (const [key, data] of apiMonitorStore.entries()) {
      if (now - data.timestamp > API_MONITOR_RETENTION_MS) {
        apiMonitorStore.delete(key);
      }
    }
  };

  const saveApiMonitorLog = async (monitorData) => {
    try {
      await pool.query(
        "INSERT INTO api_monitor_logs (request_id, method, url, status_code, duration_ms, user_id, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          monitorData.id,
          monitorData.method,
          monitorData.url,
          monitorData.statusCode,
          monitorData.durationMs,
          monitorData.userId || null,
          monitorData.ip || null
        ]
      );
    } catch (error) {
      console.error("Failed to save API monitor log:", error);
    }
  };

  const cleanupOldMonitorLogs = async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await pool.query("DELETE FROM api_monitor_logs WHERE created_at < ?", [oneHourAgo]);
    } catch (error) {
      console.error("Failed to cleanup old monitor logs:", error);
    }
  };

  const startMonitorJobs = () => {
    setInterval(cleanupApiMonitorStore, 60 * 1000);
    setInterval(cleanupOldMonitorLogs, 5 * 60 * 1000);
  };

  const monitorMiddleware = (req, res, next) => {
    const requestId = crypto.randomBytes(6).toString("hex");
    const startedAt = Date.now();
    let responseBody;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };
    res.send = (body) => {
      if (responseBody === undefined) {
        responseBody = body;
      }
      return originalSend(body);
    };
    req.requestId = requestId;
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const userId = req.user && req.user.userId ? req.user.userId : null;
      const url = req.originalUrl || req.url;
      const payload = {
        requestId,
        method: req.method,
        url,
        statusCode: res.statusCode,
        durationMs,
        userId,
        ip: req.ip || (req.socket && req.socket.remoteAddress) || "",
        userAgent: req.headers["user-agent"] || "",
        response: summarizeForLog(responseBody)
      };

      if (url.startsWith("/api/")) {
        const monitorData = {
          id: requestId,
          method: req.method,
          url,
          statusCode: res.statusCode,
          durationMs,
          timestamp: startedAt,
          userId,
          ip: req.ip || (req.socket && req.socket.remoteAddress) || ""
        };
        apiMonitorStore.set(requestId, monitorData);

        if (apiMonitorStore.size > API_MONITOR_MAX_ENTRIES) {
          const oldestKey = apiMonitorStore.keys().next().value;
          if (oldestKey) {
            apiMonitorStore.delete(oldestKey);
          }
        }

        saveApiMonitorLog(monitorData);
      }

      if (res.statusCode >= 500) {
        logError("请求完成", payload);
        return;
      }
      logInfo("请求完成", payload);
    });
    next();
  };

  return {
    apiMonitorStore,
    startMonitorJobs,
    monitorMiddleware
  };
};

module.exports = {
  createMonitorRuntime
};
