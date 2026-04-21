const cron = require("node-cron");

let syncSchedulerJob = null;

const startSyncSchedulerJob = ({
  cronExpression,
  runDueSyncTasks,
  logError
}) => {
  if (syncSchedulerJob) {
    return syncSchedulerJob;
  }
  syncSchedulerJob = cron.schedule(cronExpression, () => {
    runDueSyncTasks().catch((error) => {
      logError("同步任务调度失败", {
        errorMessage: error && error.message ? error.message : "unknown",
        stack: error && error.stack ? error.stack : ""
      });
    });
  });
  return syncSchedulerJob;
};

module.exports = {
  startSyncSchedulerJob
};
