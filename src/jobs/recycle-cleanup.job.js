const startRecycleCleanupJob = ({
  cleanupExpiredRecycleEntries,
  logError,
  intervalMs
}) => setInterval(() => {
  cleanupExpiredRecycleEntries().catch((error) => {
    logError("回收站定时清理失败", {
      errorMessage: error && error.message ? error.message : "unknown",
      stack: error && error.stack ? error.stack : ""
    });
  });
}, intervalMs);

module.exports = {
  startRecycleCleanupJob
};
