const startRuntimeCleanupJobs = ({
  cleanupRuntimeAuthData,
  cleanupExpiredChunkSessions,
  authCleanupIntervalMs = 60 * 1000,
  chunkCleanupIntervalMs
}) => {
  const authTimer = setInterval(() => {
    cleanupRuntimeAuthData();
  }, authCleanupIntervalMs);

  const chunkTimer = setInterval(() => {
    cleanupExpiredChunkSessions();
  }, chunkCleanupIntervalMs);

  return {
    authTimer,
    chunkTimer
  };
};

module.exports = {
  startRuntimeCleanupJobs
};
