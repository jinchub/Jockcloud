const createSyncTaskStreamRoutes = (app, { authRequired, pool, getRuntimeDeps }) => {
  const activeStreams = new Map();

  const broadcastLog = (taskId, message) => {
    const stream = activeStreams.get(taskId);
    if (stream) {
      stream.write(`data: ${JSON.stringify({ type: "log", message })}\n\n`);
    }
  };

  const broadcastStatus = (taskId, status) => {
    const stream = activeStreams.get(taskId);
    if (stream) {
      stream.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
    }
  };

  const broadcastEnd = (taskId) => {
    const stream = activeStreams.get(taskId);
    if (stream) {
      stream.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
      stream.end();
      activeStreams.delete(taskId);
    }
  };

  const {
    normalizeSyncTaskType,
    normalizeSyncScheduleUnit,
    normalizeSyncScheduleTime,
    normalizeSyncScheduleAt,
    normalizeSyncScheduleDateType,
    normalizeSyncScheduleDateValue,
    getSyncTaskNextRunAt,
    formatSyncDetailTime,
    appendSyncTaskHistoryLog,
    normalizeSyncTaskStatus,
    runSyncTaskNow
  } = getRuntimeDeps();

  app.get("/api/sync-tasks/:taskId/stream", authRequired, async (req, res) => {
      const taskId = String(req.params.taskId || "").trim();
      if (!taskId) {
        res.status(400).json({ message: "任务 ID 不合法" });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      activeStreams.set(taskId, res);

      res.on("close", () => {
        activeStreams.delete(taskId);
      });

      res.on("error", () => {
        activeStreams.delete(taskId);
      });
    });

    app.post("/api/sync-tasks/:taskId/start-stream", authRequired, async (req, res) => {
      const taskId = String(req.params.taskId || "").trim();
      if (!taskId) {
        res.status(400).json({ message: "任务 ID 不合法" });
        return;
      }

      try {
        const [rows] = await pool.query(
          `SELECT id, type, schedule_value AS scheduleValue, schedule_unit AS scheduleUnit,
                  schedule_time AS scheduleTime, schedule_at AS scheduleAt,
                  schedule_date_type AS scheduleDateType, schedule_date_value AS scheduleDateValue,
                  status
           FROM sync_tasks
           WHERE user_id = ? AND task_id = ?
           LIMIT 1`,
          [req.user.userId, taskId]
        );

        if (rows.length === 0) {
          res.status(404).json({ message: "同步任务不存在" });
          return;
        }

        const task = {
          id: String(rows[0].id || ""),
          type: normalizeSyncTaskType(rows[0].type),
          scheduleValue: Math.max(1, Number(rows[0].scheduleValue || 1)),
          scheduleUnit: normalizeSyncScheduleUnit(rows[0].scheduleUnit),
          scheduleTime: normalizeSyncScheduleTime(rows[0].scheduleTime),
          scheduleAt: normalizeSyncScheduleAt(rows[0].scheduleAt),
          scheduleDateType: normalizeSyncScheduleDateType(rows[0].scheduleDateType),
          scheduleDateValue: normalizeSyncScheduleDateValue(rows[0].scheduleDateValue, rows[0].scheduleDateType),
          status: normalizeSyncTaskStatus(rows[0].status)
        };

        const now = new Date();

        res.json({ message: "同步任务已启动" });

        try {
          const onLog = (message) => {
            broadcastLog(taskId, message);
          };
          await runSyncTaskNow(req.user.userId, taskId, "manual", onLog);
          broadcastStatus(taskId, "success");
        } catch (runError) {
          broadcastStatus(taskId, "error");
          broadcastLog(taskId, `[${formatSyncDetailTime(new Date())}] 同步失败：${runError.message}`);
          throw runError;
        } finally {
          broadcastEnd(taskId);
        }
      } catch (error) {
        broadcastLog(taskId, `[${formatSyncDetailTime(new Date())}] 错误：${error.message}`);
        broadcastEnd(taskId);
        console.error(`[同步流错误] taskId=${taskId}`, error);
      }
    });

    app.post("/api/sync-tasks/:taskId/pause-stream", authRequired, async (req, res) => {
      const taskId = String(req.params.taskId || "").trim();
      if (!taskId) {
        res.status(400).json({ message: "任务 ID 不合法" });
        return;
      }

      const now = new Date();
      const [result] = await pool.query(
        "UPDATE sync_tasks SET status = ?, next_run_at = NULL WHERE user_id = ? AND task_id = ?",
        ["paused", req.user.userId, taskId]
      );

      if (!result || Number(result.affectedRows || 0) === 0) {
        res.status(404).json({ message: "同步任务不存在" });
        return;
      }

      broadcastLog(taskId, `[${formatSyncDetailTime(now)}] 任务已暂停`);
      broadcastStatus(taskId, "paused");
      broadcastEnd(taskId);

      res.json({ message: "任务已暂停" });
    });
  };

  module.exports = createSyncTaskStreamRoutes;
