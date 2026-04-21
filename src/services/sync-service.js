const createSyncService = ({ pool, runSyncTaskNow, logError }) => {
  const runDueSyncTasks = async () => {
    const [rows] = await pool.query(
      `SELECT user_id AS userId, task_id AS taskId
       FROM sync_tasks
       WHERE task_type = 'schedule' AND status = 'running' AND (next_run_at IS NULL OR next_run_at <= NOW())
       ORDER BY next_run_at ASC, id ASC
       LIMIT 500`
    );
    for (const row of rows) {
      try {
        await runSyncTaskNow(row.userId, row.taskId, "schedule");
      } catch (error) {
        logError("同步定时任务执行失败", {
          userId: Number(row.userId) || 0,
          taskId: String(row.taskId || ""),
          errorMessage: error && error.message ? error.message : "unknown",
          stack: error && error.stack ? error.stack : ""
        });
      }
    }
  };

  return {
    runDueSyncTasks
  };
};

module.exports = {
  createSyncService
};
