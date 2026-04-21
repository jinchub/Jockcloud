module.exports = (app, deps) => {
  const {
    authRequired,
    pool,
    sendDbError,
    resolveStorageSpaceTypeByRequest,
    resolveTransferTaskTypeByRequest,
    getTransferTaskText,
    normalizeUploadTaskItem,
    normalizeUploadTaskStatus
  } = deps;

  app.get("/api/upload-tasks", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const taskType = resolveTransferTaskTypeByRequest(req);
    try {
      const [rows] = await pool.query(
        `SELECT task_id AS id, name, size, started_at AS startedAt, target_path AS targetPath, source_path AS sourcePath, progress, status
         FROM upload_tasks
         WHERE user_id = ? AND space_type = ? AND task_type = ?
         ORDER BY started_at DESC, id DESC`,
        [req.user.userId, spaceType, taskType]
      );
      const result = rows.map((item) => ({
        ...item,
        size: Number(item.size || 0),
        progress: Number(item.progress || 0),
        startedAt: item.startedAt ? new Date(item.startedAt).toISOString() : new Date().toISOString(),
        status: normalizeUploadTaskStatus(item.status)
      }));
      res.json(result);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/upload-tasks", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const taskType = resolveTransferTaskTypeByRequest(req);
    const taskText = getTransferTaskText(taskType);
    const incoming = Array.isArray(req.body?.tasks) ? req.body.tasks : null;
    if (!incoming) {
      res.status(400).json({ message: `${taskText}参数不合法` });
      return;
    }
    const tasks = incoming.map(normalizeUploadTaskItem).filter(Boolean);
    if (tasks.length > 2000) {
      res.status(400).json({ message: `${taskText}数量过多` });
      return;
    }
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query("DELETE FROM upload_tasks WHERE user_id = ? AND space_type = ? AND task_type = ?", [req.user.userId, spaceType, taskType]);
      if (tasks.length > 0) {
        const placeholders = tasks.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params = [];
        tasks.forEach((task) => {
          params.push(
            req.user.userId,
            spaceType,
            taskType,
            task.id,
            task.name,
            task.size,
            task.startedAt,
            task.targetPath,
            task.sourcePath,
            task.progress,
            task.status
          );
        });
        await connection.query(
          `INSERT INTO upload_tasks (user_id, space_type, task_type, task_id, name, size, started_at, target_path, source_path, progress, status)
           VALUES ${placeholders}`,
          params
        );
      }
      await connection.commit();
      res.json({ message: `${taskText}已保存`, total: tasks.length });
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

  app.delete("/api/upload-tasks/:taskId", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const taskType = resolveTransferTaskTypeByRequest(req);
    const taskText = getTransferTaskText(taskType);
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId) {
      res.status(400).json({ message: `${taskText}ID不合法` });
      return;
    }
    try {
      await pool.query("DELETE FROM upload_tasks WHERE user_id = ? AND space_type = ? AND task_type = ? AND task_id = ?", [req.user.userId, spaceType, taskType, taskId]);
      res.json({ message: `${taskText}记录已删除` });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/upload-tasks", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const taskType = resolveTransferTaskTypeByRequest(req);
    const taskText = getTransferTaskText(taskType);
    try {
      await pool.query("DELETE FROM upload_tasks WHERE user_id = ? AND space_type = ? AND task_type = ?", [req.user.userId, spaceType, taskType]);
      res.json({ message: `${taskText}记录已清空` });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
