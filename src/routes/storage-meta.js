module.exports = (app, deps) => {
  const {
    authRequired,
    requireFilePermission,
    pool,
    sendDbError,
    resolveStorageSpaceTypeByRequest,
    normalizeFolderId,
    checkFolderOwnership,
    hasNameConflict,
    hasEntryNameConflict,
    hasFilePermission,
    collectDescendantFolderIds,
    toInClause
  } = deps;

  app.get("/api/stats", authRequired, async (req, res) => {
    try {
      const [fileRows] = await pool.query(
        "SELECT COUNT(*) AS fileCount, IFNULL(SUM(size), 0) AS totalSize FROM files WHERE user_id = ? AND deleted_at IS NULL",
        [req.user.userId]
      );
      const [folderRows] = await pool.query("SELECT COUNT(*) AS folderCount FROM folders WHERE user_id = ? AND deleted_at IS NULL", [req.user.userId]);

      // 获取用户配额和用户组信息
      const [userRows] = await pool.query(`
        SELECT u.quota_bytes AS quota, 
               (SELECT GROUP_CONCAT(g.id) 
                FROM user_group_members m 
                JOIN user_groups g ON g.id = m.group_id 
                WHERE m.user_id = u.id) AS groupIds
        FROM users u 
        WHERE u.id = ?
      `, [req.user.userId]);
      
      const userQuota = userRows.length > 0 ? Number(userRows[0].quota) : -1;
      const groupIdsStr = userRows[0].groupIds;
      
      // 计算有效配额：用户配额优先，否则使用用户组配额
      let quota = userQuota;
      if (userQuota === -1 && groupIdsStr) {
        // 用户未设置配额，查询用户组的最小配额
        const groupIds = groupIdsStr.split(',').map(id => parseInt(id.trim()));
        const placeholders = groupIds.map(() => '?').join(',');
        const [groupRows] = await pool.query(`
          SELECT MIN(quota_bytes) AS minQuota 
          FROM user_groups 
          WHERE id IN (${placeholders})
        `, groupIds);
        
        if (groupRows.length > 0 && groupRows[0].minQuota !== null) {
          quota = Number(groupRows[0].minQuota);
        }
      }

      res.json({
        fileCount: fileRows[0].fileCount,
        totalSize: fileRows[0].totalSize,
        folderCount: folderRows[0].folderCount,
        quota
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/folders", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const parentId = normalizeFolderId(req.query.parentId);
    if (parentId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    try {
      let rows;
      if (parentId === null) {
        [rows] = await pool.query(
          "SELECT id, name, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt FROM folders WHERE user_id = ? AND space_type = ? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY updated_at DESC",
          [req.user.userId, spaceType]
        );
      } else {
        [rows] = await pool.query(
          "SELECT id, name, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt FROM folders WHERE user_id = ? AND space_type = ? AND parent_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
          [req.user.userId, spaceType, parentId]
        );
      }
      res.json(rows);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/folders/:id/path", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.params.id);
    if (!folderId) {
      res.status(400).json({ message: "目录ID不合法" });
      return;
    }
    try {
      const chain = [];
      let currentId = folderId;
      while (currentId) {
        const [rows] = await pool.query(
          "SELECT id, name, parent_id AS parentId FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
          [currentId, req.user.userId, spaceType]
        );
        if (rows.length === 0) {
          res.status(404).json({ message: "目录不存在" });
          return;
        }
        chain.unshift({ id: rows[0].id, name: rows[0].name });
        currentId = rows[0].parentId;
      }
      res.json(chain);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/quick-access", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    try {
      const [rows] = await pool.query(
        `SELECT qa.entry_type AS entryType, qa.entry_id AS entryId, COALESCE(f.name, fi.original_name) AS name, qa.created_at AS createdAt
         FROM quick_access qa
         LEFT JOIN folders f ON qa.entry_type = 'folder' AND f.id = qa.entry_id
         LEFT JOIN files fi ON qa.entry_type = 'file' AND fi.id = qa.entry_id
         WHERE qa.user_id = ?
           AND (
             (qa.entry_type = 'folder' AND f.user_id = ? AND f.space_type = ? AND f.deleted_at IS NULL)
             OR (qa.entry_type = 'file' AND fi.user_id = ? AND fi.space_type = ? AND fi.deleted_at IS NULL)
           )
         ORDER BY qa.created_at DESC`,
        [req.user.userId, req.user.userId, spaceType, req.user.userId, spaceType]
      );
      res.json(rows);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/quick-access", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const rawEntryType = String(req.body.entryType || "").trim().toLowerCase();
    const fallbackFolderId = normalizeFolderId(req.body.folderId);
    const entryType = rawEntryType || (fallbackFolderId ? "folder" : "");
    const entryId = normalizeFolderId(req.body.entryId !== undefined ? req.body.entryId : fallbackFolderId);
    if (!["folder", "file"].includes(entryType)) {
      res.status(400).json({ message: "收藏类型不合法" });
      return;
    }
    if (!entryId) {
      res.status(400).json({ message: "收藏对象ID不合法" });
      return;
    }
    try {
      const existsSql = entryType === "file"
        ? "SELECT id FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1"
        : "SELECT id FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1";
      const [targetRows] = await pool.query(existsSql, [entryId, req.user.userId, spaceType]);
      if (!targetRows.length) {
        res.status(404).json({ message: entryType === "file" ? "文件不存在" : "目录不存在" });
        return;
      }
      const [existsRows] = await pool.query(
        "SELECT id FROM quick_access WHERE user_id = ? AND entry_type = ? AND entry_id = ? LIMIT 1",
        [req.user.userId, entryType, entryId]
      );
      if (!existsRows.length) {
        await pool.query(
          "INSERT INTO quick_access (user_id, folder_id, entry_type, entry_id) VALUES (?, ?, ?, ?)",
          [req.user.userId, entryId, entryType, entryId]
        );
      }
      res.json({ message: "已加入快捷访问" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/quick-access/:entryType/:entryId", authRequired, async (req, res) => {
    const entryType = String(req.params.entryType || "").trim().toLowerCase();
    const entryId = normalizeFolderId(req.params.entryId);
    if (!["folder", "file"].includes(entryType)) {
      res.status(400).json({ message: "收藏类型不合法" });
      return;
    }
    if (!entryId) {
      res.status(400).json({ message: "收藏对象ID不合法" });
      return;
    }
    try {
      if (entryType === "folder") {
        await pool.query(
          "DELETE FROM quick_access WHERE user_id = ? AND ((entry_type = 'folder' AND entry_id = ?) OR folder_id = ?)",
          [req.user.userId, entryId, entryId]
        );
      } else {
        await pool.query("DELETE FROM quick_access WHERE user_id = ? AND entry_type = ? AND entry_id = ?", [req.user.userId, entryType, entryId]);
      }
      res.json({ message: "已移除快捷访问" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/quick-access/:folderId", authRequired, async (req, res) => {
    const folderId = normalizeFolderId(req.params.folderId);
    if (!folderId) {
      res.status(400).json({ message: "目录ID不合法" });
      return;
    }
    try {
      await pool.query(
        "DELETE FROM quick_access WHERE user_id = ? AND ((entry_type = 'folder' AND entry_id = ?) OR folder_id = ?)",
        [req.user.userId, folderId, folderId]
      );
      res.json({ message: "已移除快捷访问" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/folders", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const name = String(req.body.name || "").trim();
    const parentId = normalizeFolderId(req.body.parentId);
    if (!name) {
      res.status(400).json({ message: "目录名不能为空" });
      return;
    }
    if (parentId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    try {
      const owned = await checkFolderOwnership(req.user.userId, parentId, spaceType);
      if (!owned) {
        res.status(404).json({ message: "上级目录不存在" });
        return;
      }
      const duplicated = await hasNameConflict(req.user.userId, "folder", parentId, name, 0, spaceType);
      if (duplicated) {
        res.status(409).json({ message: "已经有同名的目录" });
        return;
      }
      await pool.query("INSERT INTO folders (user_id, space_type, name, parent_id) VALUES (?, ?, ?, ?)", [req.user.userId, spaceType, name, parentId]);
      res.json({ message: "目录创建成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.patch("/api/folders/:id", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.params.id);
    const name = req.body.name === undefined ? undefined : String(req.body.name || "").trim();
    const parentId = req.body.parentId === undefined ? undefined : normalizeFolderId(req.body.parentId);
    if (!folderId) {
      res.status(400).json({ message: "目录ID不合法" });
      return;
    }
    if (name !== undefined && !name) {
      res.status(400).json({ message: "目录名不能为空" });
      return;
    }
    if (parentId === undefined && req.body.parentId !== undefined) {
      res.status(400).json({ message: "上级目录参数不合法" });
      return;
    }
    if (parentId === folderId) {
      res.status(400).json({ message: "目录不能移动到自己下面" });
      return;
    }
    if (name !== undefined && !hasFilePermission(req, "rename")) {
      res.status(403).json({ message: "无权执行该操作" });
      return;
    }
    if (parentId !== undefined && !hasFilePermission(req, "move")) {
      res.status(403).json({ message: "无权执行该操作" });
      return;
    }
    try {
      const [currentRows] = await pool.query("SELECT id, name, parent_id AS parentId FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
        folderId,
        req.user.userId,
        spaceType
      ]);
      if (currentRows.length === 0) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      if (parentId !== undefined) {
        const owned = await checkFolderOwnership(req.user.userId, parentId, spaceType);
        if (!owned) {
          res.status(404).json({ message: "目标目录不存在" });
          return;
        }
        if (parentId !== null) {
          const allFolderIds = await collectDescendantFolderIds(req.user.userId, folderId, spaceType);
          if (allFolderIds.includes(parentId)) {
            res.status(400).json({ message: "目录不能移动到自己的子目录" });
            return;
          }
        }
      }
      const nextFolderName = name !== undefined ? name : String(currentRows[0].name || "");
      const nextParentId = parentId !== undefined ? parentId : normalizeFolderId(currentRows[0].parentId);
      const duplicated = await hasEntryNameConflict(
        req.user.userId,
        nextParentId,
        nextFolderName,
        { excludeFolderId: folderId },
        spaceType
      );
      if (duplicated) {
        res.status(409).json({ message: "当前目录已经存在同名的文件或目录" });
        return;
      }
      const updateFields = [];
      const params = [];
      if (name !== undefined) {
        updateFields.push("name = ?");
        params.push(name);
      }
      if (parentId !== undefined) {
        updateFields.push("parent_id = ?");
        params.push(parentId);
      }
      if (updateFields.length === 0) {
        res.status(400).json({ message: "没有可更新内容" });
        return;
      }
      params.push(folderId, req.user.userId, spaceType);
      await pool.query(`UPDATE folders SET ${updateFields.join(", ")} WHERE id = ? AND user_id = ? AND space_type = ?`, params);
      res.json({ message: "目录更新成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/folders/:id", authRequired, requireFilePermission("delete"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.params.id);
    if (!folderId) {
      res.status(400).json({ message: "目录ID不合法" });
      return;
    }
    try {
      const [folderRows] = await pool.query("SELECT id FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
        folderId,
        req.user.userId,
        spaceType
      ]);
      if (folderRows.length === 0) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const allFolderIds = await collectDescendantFolderIds(req.user.userId, folderId, spaceType);
      const inClause = toInClause(allFolderIds);
      await pool.query(`UPDATE folders SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND id IN (${inClause})`, [req.user.userId, spaceType, ...allFolderIds]);
      await pool.query(`UPDATE files SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND folder_id IN (${inClause})`, [
        req.user.userId,
        spaceType,
        ...allFolderIds
      ]);
      res.json({ message: "目录已移入回收站" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/files", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.query.folderId);
    const keyword = String(req.query.keyword || "").trim();
    if (folderId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    try {
      const params = [req.user.userId, spaceType];
      let sql =
        "SELECT id, folder_id AS folderId, original_name AS originalName, thumbnail_storage_name AS thumbnailStorageName, size, mime_type AS mimeType, created_at AS createdAt, updated_at AS updatedAt FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL";
      if (folderId === null) {
        sql += " AND folder_id IS NULL";
      } else {
        sql += " AND folder_id = ?";
        params.push(folderId);
      }
      if (keyword) {
        sql += " AND original_name LIKE ?";
        params.push(`%${keyword}%`);
      }
      sql += " ORDER BY updated_at DESC";
      const [rows] = await pool.query(sql, params);
      res.json(rows);
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
