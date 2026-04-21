module.exports = (app, deps) => {
  const {
    authRequired,
    pool,
    sendDbError,
    normalizeSyncDirection,
    normalizeSyncTaskType,
    normalizeSyncScheduleUnit,
    normalizeSyncScheduleTime,
    normalizeSyncScheduleAt,
    normalizeSyncScheduleDateType,
    normalizeSyncScheduleDateValue,
    normalizeSyncEmptyDirMode,
    normalizeSyncFileUpdateRule,
    normalizeSyncDeleteRule,
    normalizeSyncTaskStatus,
    normalizeSyncTaskItem,
    getSyncTaskNextRunAt,
    formatSyncDetailTime,
    appendSyncTaskHistoryLog,
    runSyncTaskNow
  } = deps;
  const sseClients = new Map();
  const getSseKey = (userId, taskId) => `${Number(userId) || 0}:${String(taskId || "")}`;
  const getIsoTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  };
  const sendSse = (userId, taskId, payload) => {
    const key = getSseKey(userId, taskId);
    const clients = sseClients.get(key);
    if (!clients || !clients.size) return;
    const text = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      try {
        res.write(text);
      } catch (e) {}
    }
  };
  const addSseClient = (userId, taskId, res) => {
    const key = getSseKey(userId, taskId);
    const clients = sseClients.get(key) || new Set();
    clients.add(res);
    sseClients.set(key, clients);
  };
  const removeSseClient = (userId, taskId, res) => {
    const key = getSseKey(userId, taskId);
    const clients = sseClients.get(key);
    if (!clients) return;
    clients.delete(res);
    if (!clients.size) {
      sseClients.delete(key);
    }
  };
  const queryTaskRealtimeLog = async (userId, taskId) => {
    const [rows] = await pool.query(
      `SELECT
         t.status AS status,
         d.detail_message AS detail,
         d.detail_status AS detailStatus,
         d.detail_at AS detailAt
       FROM sync_tasks t
       LEFT JOIN sync_task_details d
         ON d.user_id = t.user_id AND d.task_id = t.task_id
       WHERE t.user_id = ? AND t.task_id = ?
       LIMIT 1`,
      [userId, taskId]
    );
    if (!rows.length) return null;
    const detailText = String(rows[0].detail || "");
    const lines = detailText ? detailText.split("\n").filter(Boolean) : [];
    return {
      status: normalizeSyncTaskStatus(rows[0].status),
      detailStatus: normalizeSyncTaskStatus(rows[0].detailStatus || rows[0].status),
      detail: detailText,
      detailAt: getIsoTime(rows[0].detailAt),
      lineCount: lines.length
    };
  };
  const emitTaskSnapshot = async (userId, taskId, type = "snapshot") => {
    const payload = await queryTaskRealtimeLog(userId, taskId);
    if (!payload) return;
    sendSse(userId, taskId, { type, ...payload });
  };
  const appendTaskLogAndPush = async (userId, taskId, message, status, detailAt) => {
    const merged = await appendSyncTaskHistoryLog(pool, userId, taskId, message, status, detailAt);
    sendSse(userId, taskId, {
      type: "log",
      status: normalizeSyncTaskStatus(status),
      detailStatus: normalizeSyncTaskStatus(status),
      detail: merged,
      detailAt: getIsoTime(detailAt),
      lineCount: merged ? merged.split("\n").filter(Boolean).length : 0
    });
  };

  app.get("/api/sync-tasks", authRequired, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT
           t.task_id AS id,
           t.name,
           t.local_dir AS localDir,
           t.remote_mount_id AS remoteMountId,
           t.remote_mount_name AS remoteMountName,
           t.remote_dir AS remoteDir,
           t.sync_direction AS direction,
           t.task_type AS type,
           t.schedule_value AS scheduleValue,
           t.schedule_unit AS scheduleUnit,
           t.schedule_time AS scheduleTime,
           t.schedule_at AS scheduleAt,
           t.schedule_date_type AS scheduleDateType,
           t.schedule_date_value AS scheduleDateValue,
           t.sync_empty_dir AS syncEmptyDir,
           t.file_update_rule AS fileUpdateRule,
           t.delete_rule AS deleteRule,
           t.status,
           t.last_run_at AS lastRunAt,
           t.next_run_at AS nextRunAt,
           t.created_at AS createdAt,
           d.detail_message AS detail,
           d.detail_status AS detailStatus,
           d.detail_at AS detailAt
         FROM sync_tasks t
         LEFT JOIN sync_task_details d
           ON d.user_id = t.user_id AND d.task_id = t.task_id
         WHERE t.user_id = ?
         ORDER BY t.created_at DESC, t.id DESC`,
        [req.user.userId]
      );
      const result = rows.map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        localDir: String(item.localDir || "/"),
        remoteMountId: String(item.remoteMountId || ""),
        remoteMountName: String(item.remoteMountName || ""),
        remoteDir: String(item.remoteDir || "/"),
        direction: normalizeSyncDirection(item.direction),
        type: normalizeSyncTaskType(item.type),
        scheduleValue: Math.max(1, Number(item.scheduleValue || 1)),
        scheduleUnit: normalizeSyncScheduleUnit(item.scheduleUnit),
        scheduleTime: normalizeSyncScheduleTime(item.scheduleTime),
        scheduleAt: item.scheduleAt ? new Date(item.scheduleAt).toISOString() : "",
        scheduleDateTime: item.scheduleAt ? new Date(item.scheduleAt).toISOString().slice(0, 16) : "",
        scheduleDateType: normalizeSyncScheduleDateType(item.scheduleDateType),
        scheduleDateValue: normalizeSyncScheduleDateValue(item.scheduleDateValue, item.scheduleDateType),
        syncEmptyDir: normalizeSyncEmptyDirMode(item.syncEmptyDir),
        fileUpdateRule: normalizeSyncFileUpdateRule(item.fileUpdateRule),
        deleteRule: normalizeSyncDeleteRule(item.deleteRule),
        status: normalizeSyncTaskStatus(item.status),
        detail: String(item.detail || ""),
        detailStatus: normalizeSyncTaskStatus(item.detailStatus || item.status),
        detailAt: item.detailAt ? new Date(item.detailAt).toISOString() : "",
        lastRunAt: item.lastRunAt ? new Date(item.lastRunAt).toISOString() : "",
        nextRunAt: item.nextRunAt ? new Date(item.nextRunAt).toISOString() : "",
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
      }));
      res.json(result);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/sync-tasks/:taskId/realtime-log", authRequired, async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: "同步任务ID不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        `SELECT
           t.status AS status,
           d.detail_message AS detail,
           d.detail_status AS detailStatus,
           d.detail_at AS detailAt
         FROM sync_tasks t
         LEFT JOIN sync_task_details d
           ON d.user_id = t.user_id AND d.task_id = t.task_id
         WHERE t.user_id = ? AND t.task_id = ?
         LIMIT 1`,
        [req.user.userId, taskId]
      );
      if (!rows.length) {
        res.status(404).json({ message: "同步任务不存在" });
        return;
      }
      const detailText = String(rows[0].detail || "");
      const lines = detailText ? detailText.split("\n").filter(Boolean) : [];
      res.json({
        status: normalizeSyncTaskStatus(rows[0].status),
        detailStatus: normalizeSyncTaskStatus(rows[0].detailStatus || rows[0].status),
        detail: detailText,
        detailAt: rows[0].detailAt ? new Date(rows[0].detailAt).toISOString() : "",
        lineCount: lines.length
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/sync-tasks/:taskId/log-stream", authRequired, async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: "同步任务ID不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT task_id AS id FROM sync_tasks WHERE user_id = ? AND task_id = ? LIMIT 1",
        [req.user.userId, taskId]
      );
      if (!rows.length) {
        res.status(404).json({ message: "同步任务不存在" });
        return;
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }
      addSseClient(req.user.userId, taskId, res);
      const heartbeatTimer = setInterval(() => {
        try {
          res.write(`data: ${JSON.stringify({ type: "ping", ts: Date.now() })}\n\n`);
        } catch (e) {}
      }, 15000);
      await emitTaskSnapshot(req.user.userId, taskId, "snapshot");
      req.on("close", () => {
        clearInterval(heartbeatTimer);
        removeSseClient(req.user.userId, taskId, res);
      });
      req.on("error", () => {
        clearInterval(heartbeatTimer);
        removeSseClient(req.user.userId, taskId, res);
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/sync-tasks", authRequired, async (req, res) => {
    const incoming = Array.isArray(req.body?.tasks) ? req.body.tasks : null;
    if (!incoming) {
      res.status(400).json({ message: "同步任务参数不合法" });
      return;
    }
    const tasks = incoming.map(normalizeSyncTaskItem).filter(Boolean);
    if (tasks.length > 3000) {
      res.status(400).json({ message: "同步任务数量过多" });
      return;
    }
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query("DELETE FROM sync_task_details WHERE user_id = ?", [req.user.userId]);
      await connection.query("DELETE FROM sync_tasks WHERE user_id = ?", [req.user.userId]);
      if (tasks.length > 0) {
        const taskPlaceholders = tasks.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const taskParams = [];
        tasks.forEach((task) => {
          taskParams.push(
            req.user.userId,
            task.id,
            task.name,
            task.localDir,
            task.remoteMountId,
            task.remoteMountName,
            task.remoteDir,
            task.direction,
            task.type,
            task.scheduleValue,
            task.scheduleUnit,
            task.scheduleTime,
            task.scheduleAt,
            task.scheduleDateType,
            task.scheduleDateValue,
            task.syncEmptyDir,
            task.fileUpdateRule,
            task.deleteRule,
            task.status,
            task.lastRunAt,
            task.nextRunAt,
            task.createdAt
          );
        });
        await connection.query(
          `INSERT INTO sync_tasks (
             user_id, task_id, name, local_dir, remote_mount_id, remote_mount_name, remote_dir,
             sync_direction, task_type, schedule_value, schedule_unit, schedule_time, schedule_at, schedule_date_type, schedule_date_value,
             sync_empty_dir, file_update_rule,
             delete_rule, status, last_run_at, next_run_at, created_at
           ) VALUES ${taskPlaceholders}`,
          taskParams
        );

        const detailTasks = tasks.filter((task) => task.detail);
        if (detailTasks.length > 0) {
          const detailPlaceholders = detailTasks.map(() => "(?, ?, ?, ?, ?)").join(", ");
          const detailParams = [];
          detailTasks.forEach((task) => {
            detailParams.push(req.user.userId, task.id, task.detail, task.detailStatus, task.detailAt);
          });
          await connection.query(
            `INSERT INTO sync_task_details (user_id, task_id, detail_message, detail_status, detail_at)
             VALUES ${detailPlaceholders}`,
            detailParams
          );
        }
      }
      await connection.commit();
      res.json({ message: "同步任务已保存", total: tasks.length });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  app.post("/api/sync-tasks/:taskId/start", authRequired, async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: "同步任务ID不合法" });
      return;
    }
    console.log(`[同步启动] userId=${req.user.userId}, taskId=${taskId}`);
    try {
      const [rows] = await pool.query(
        `SELECT task_id AS id, task_type AS type, schedule_value AS scheduleValue, schedule_unit AS scheduleUnit, schedule_time AS scheduleTime, schedule_at AS scheduleAt,
                schedule_date_type AS scheduleDateType, schedule_date_value AS scheduleDateValue
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
        scheduleDateValue: normalizeSyncScheduleDateValue(rows[0].scheduleDateValue, rows[0].scheduleDateType)
      };
      const now = new Date();
      console.log(`[同步任务类型] taskId=${taskId}, type=${task.type}`);
      if (task.type === "schedule") {
        const nextRunAt = getSyncTaskNextRunAt(task, now);
        if (!nextRunAt) {
          res.status(400).json({ message: "指定时间需晚于当前时间" });
          return;
        }
        await pool.query(
          "UPDATE sync_tasks SET status = ?, next_run_at = ? WHERE user_id = ? AND task_id = ?",
          ["running", nextRunAt, req.user.userId, taskId]
        );
        await appendTaskLogAndPush(req.user.userId, taskId, `[${formatSyncDetailTime(now)}] 已启动定时任务`, "running", now);
        if (task.scheduleUnit === "time_point") {
          sendSse(req.user.userId, taskId, { type: "status", status: "running" });
          res.json({ message: "指定时间任务已启动" });
          return;
        }
        res.json({ message: "定时任务已启动" });
        (async () => {
          try {
            await runSyncTaskNow(req.user.userId, taskId, "manual", (currentTaskId, message) => {
              appendTaskLogAndPush(req.user.userId, currentTaskId, message, "running", new Date()).catch(() => {});
            });
            await emitTaskSnapshot(req.user.userId, taskId, "end");
          } catch (runError) {
            await pool.query(
              "UPDATE sync_tasks SET status = ? WHERE user_id = ? AND task_id = ?",
              ["error", req.user.userId, taskId]
            );
            console.log(`[同步启动错误-后台执行] taskId=${taskId}, error=${runError.message}`);
            await emitTaskSnapshot(req.user.userId, taskId, "end");
          }
        })();
        return;
      }
      await pool.query(
        "UPDATE sync_tasks SET status = ?, next_run_at = NULL WHERE user_id = ? AND task_id = ?",
        ["running", req.user.userId, taskId]
      );
      sendSse(req.user.userId, taskId, { type: "status", status: "running" });
      console.log(`[开始执行同步] taskId=${taskId}`);
      res.json({ message: "单次同步已启动" });
      (async () => {
        try {
          await runSyncTaskNow(req.user.userId, taskId, "manual", (currentTaskId, message) => {
            appendTaskLogAndPush(req.user.userId, currentTaskId, message, "running", new Date()).catch(() => {});
          });
          console.log(`[同步完成] taskId=${taskId}`);
          await emitTaskSnapshot(req.user.userId, taskId, "end");
        } catch (runError) {
          console.log(`[同步失败] taskId=${taskId}, error=${runError.message}`);
          await pool.query(
            "UPDATE sync_tasks SET status = ? WHERE user_id = ? AND task_id = ?",
            ["error", req.user.userId, taskId]
          );
          await emitTaskSnapshot(req.user.userId, taskId, "end");
        }
      })();
    } catch (error) {
      console.log(`[同步启动错误] taskId=${taskId}, error=${error.message}`);
      sendDbError(res, error);
    }
  });

  app.post("/api/sync-tasks/:taskId/pause", authRequired, async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: "同步任务ID不合法" });
      return;
    }
    try {
      const now = new Date();
      const [result] = await pool.query(
        "UPDATE sync_tasks SET status = ?, next_run_at = NULL WHERE user_id = ? AND task_id = ?",
        ["paused", req.user.userId, taskId]
      );
      if (!result || Number(result.affectedRows || 0) === 0) {
        res.status(404).json({ message: "同步任务不存在" });
        return;
      }
      await appendTaskLogAndPush(req.user.userId, taskId, `[${formatSyncDetailTime(now)}] 已暂停任务`, "paused", now);
      sendSse(req.user.userId, taskId, { type: "end", status: "paused" });
      res.json({ message: "任务已暂停" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/sync-tasks/:taskId/run", authRequired, async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: "同步任务 ID 不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT task_id AS id FROM sync_tasks WHERE user_id = ? AND task_id = ? LIMIT 1",
        [req.user.userId, taskId]
      );
      if (!rows.length) {
        res.status(404).json({ message: "同步任务不存在" });
        return;
      }
      const now = new Date();
      await pool.query(
        "UPDATE sync_tasks SET status = ?, next_run_at = NULL WHERE user_id = ? AND task_id = ?",
        ["running", req.user.userId, taskId]
      );
      await appendTaskLogAndPush(req.user.userId, taskId, `[${formatSyncDetailTime(now)}] 已触发单次同步`, "running", now);
      sendSse(req.user.userId, taskId, { type: "status", status: "running" });
      res.json({ message: "单次同步已触发" });
      (async () => {
        try {
          await runSyncTaskNow(req.user.userId, taskId, "manual", (currentTaskId, message) => {
            appendTaskLogAndPush(req.user.userId, currentTaskId, message, "running", new Date()).catch(() => {});
          });
          await emitTaskSnapshot(req.user.userId, taskId, "end");
        } catch (error) {
          console.log(`[单次触发错误-后台执行] taskId=${taskId}, error=${error.message}`);
          await pool.query(
            "UPDATE sync_tasks SET status = ? WHERE user_id = ? AND task_id = ?",
            ["error", req.user.userId, taskId]
          );
          await emitTaskSnapshot(req.user.userId, taskId, "end");
        }
      })();
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/sync-tasks/:taskId/clear-log", authRequired, async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: "同步任务 ID 不合法" });
      return;
    }
    try {
      const now = new Date();
      await pool.query(
        "DELETE FROM sync_task_details WHERE user_id = ? AND task_id = ?",
        [req.user.userId, taskId]
      );
      await appendTaskLogAndPush(req.user.userId, taskId, `[${formatSyncDetailTime(now)}] 日志已清空`, "success", now);
      res.json({ message: "日志已清空" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/sync-tasks/:taskId", authRequired, async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: "同步任务ID不合法" });
      return;
    }
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query("DELETE FROM sync_task_details WHERE user_id = ? AND task_id = ?", [req.user.userId, taskId]);
      await connection.query("DELETE FROM sync_tasks WHERE user_id = ? AND task_id = ?", [req.user.userId, taskId]);
      await connection.commit();
      res.json({ message: "同步任务已删除" });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
};
