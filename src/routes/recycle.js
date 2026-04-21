module.exports = (app, deps) => {
  const {
    authRequired,
    requireFilePermission,
    pool,
    sendDbError,
    resolveStorageSpaceTypeByRequest,
    normalizeFolderId,
    normalizeFileCategoryKey,
    resolveStoredFileCategory,
    checkFolderOwnership,
    collectDescendantFolderIds,
    toInClause,
    resolveAbsoluteStoragePath,
    fs,
    cleanupExpiredRecycleEntries,
    buildFolderLogicalPathResolver
  } = deps;

  app.get("/api/recycle", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const type = String(req.query.type || "all").trim();
    const sortByRaw = String(req.query.sortBy || "deletedAt").trim();
    const orderRaw = String(req.query.order || "desc").trim().toLowerCase();
    const pageRaw = Number.parseInt(String(req.query.page || "1"), 10);
    const pageSizeRaw = Number.parseInt(String(req.query.pageSize || "50"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = [20, 50, 100, 150, 200].includes(pageSizeRaw) ? pageSizeRaw : 50;
    if (!["all", "folder", "file"].includes(type)) {
      res.status(400).json({ message: "类型参数不合法" });
      return;
    }
    const sortMap = {
      name: "name",
      type: "type",
      size: "size",
      deletedAt: "deletedAt",
      updatedAt: "updatedAt",
      createdAt: "createdAt"
    };
    const sortBy = sortMap[sortByRaw] || "deletedAt";
    const order = orderRaw === "asc" ? "ASC" : "DESC";
    try {
      await cleanupExpiredRecycleEntries();
      const recycleItems = [];
      const resolveLogicalPath = await buildFolderLogicalPathResolver(req.user.userId, spaceType);
      if (type === "all" || type === "folder") {
        const [folders] = await pool.query(
          "SELECT id, name, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt, 'folder' AS type, 0 AS size FROM folders WHERE user_id = ? AND space_type = ? AND deleted_at IS NOT NULL",
          [req.user.userId, spaceType]
        );
        recycleItems.push(...folders);
      }
      if (type === "all" || type === "file") {
        const [files] = await pool.query(
          "SELECT id, original_name AS name, folder_id AS parentId, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt, 'file' AS type, size, mime_type AS mimeType, thumbnail_storage_name AS thumbnailStorageName, file_category AS fileCategory FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NOT NULL",
          [req.user.userId, spaceType]
        );
        const normalizedFiles = files.map((item) => {
          const rawCategory = normalizeFileCategoryKey(item.fileCategory);
          const resolvedCategory = rawCategory === "other"
            ? resolveStoredFileCategory(item.name, item.mimeType)
            : rawCategory;
          return { ...item, fileCategory: normalizeFileCategoryKey(resolvedCategory) };
        });
        recycleItems.push(...normalizedFiles);
      }
      const withOriginalDir = recycleItems.map((item) => {
        const originalDir = item.parentId === null ? "我的文件" : resolveLogicalPath(item.parentId);
        return { ...item, originalDir };
      });
      withOriginalDir.sort((a, b) => {
        let left = a[sortBy];
        let right = b[sortBy];
        if (sortBy === "name" || sortBy === "type") {
          left = String(left || "").toLowerCase();
          right = String(right || "").toLowerCase();
        } else {
          left = Number(new Date(left)) || Number(left) || 0;
          right = Number(new Date(right)) || Number(right) || 0;
        }
        if (left === right && type === "all") {
          if (a.type === b.type) return 0;
          return a.type === "folder" ? -1 : 1;
        }
        const result = left < right ? -1 : 1;
        return order === "ASC" ? result : -result;
      });
      const output = withOriginalDir.map((item) => {
        if (item.type !== "file") return item;
        const { mimeType, thumbnailStorageName, ...rest } = item;
        return { ...rest, hasThumbnail: !!String(thumbnailStorageName || "").trim() };
      });
      const total = output.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const startIndex = total === 0 ? 0 : (safePage - 1) * pageSize;
      const items = output.slice(startIndex, startIndex + pageSize);
      res.json({ items, total, page: safePage, pageSize, totalPages });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/recycle/files/:id/restore", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    if (!fileId) {
      res.status(400).json({ message: "文件ID不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT id, folder_id AS folderId FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NOT NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在或未删除" });
        return;
      }
      const folderId = rows[0].folderId;
      if (folderId !== null) {
        const owned = await checkFolderOwnership(req.user.userId, folderId, spaceType);
        if (!owned) {
          res.status(400).json({ message: "原目录不存在，请先恢复目录" });
          return;
        }
      }
      await pool.query("UPDATE files SET deleted_at = NULL WHERE id = ? AND user_id = ? AND space_type = ?", [fileId, req.user.userId, spaceType]);
      res.json({ message: "文件已恢复" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/recycle/folders/:id/restore", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.params.id);
    if (!folderId) {
      res.status(400).json({ message: "目录ID不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT id, parent_id AS parentId FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NOT NULL LIMIT 1",
        [folderId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "目录不存在或未删除" });
        return;
      }
      const parentId = rows[0].parentId;
      if (parentId !== null) {
        const [parentRows] = await pool.query(
          "SELECT id FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
          [parentId, req.user.userId, spaceType]
        );
        if (parentRows.length === 0) {
          res.status(400).json({ message: "上级目录未恢复，请先恢复上级目录" });
          return;
        }
      }
      const allFolderIds = await collectDescendantFolderIds(req.user.userId, folderId, spaceType);
      const inClause = toInClause(allFolderIds);
      await pool.query(`UPDATE folders SET deleted_at = NULL WHERE user_id = ? AND space_type = ? AND id IN (${inClause})`, [req.user.userId, spaceType, ...allFolderIds]);
      await pool.query(`UPDATE files SET deleted_at = NULL WHERE user_id = ? AND space_type = ? AND folder_id IN (${inClause})`, [req.user.userId, spaceType, ...allFolderIds]);
      res.json({ message: "目录已恢复" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/recycle/files/:id", authRequired, requireFilePermission("delete"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    if (!fileId) {
      res.status(400).json({ message: "文件ID不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT id, storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NOT NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在或未删除" });
        return;
      }
      await pool.query("DELETE FROM files WHERE id = ? AND user_id = ? AND space_type = ?", [fileId, req.user.userId, spaceType]);
      const targetPath = resolveAbsoluteStoragePath(rows[0].storageName, spaceType);
      if (targetPath && fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      if (rows[0].thumbnailStorageName) {
        const thumbnailPath = resolveAbsoluteStoragePath(rows[0].thumbnailStorageName, spaceType);
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
        }
      }
      res.json({ message: "文件已彻底删除" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/recycle/folders/:id", authRequired, requireFilePermission("delete"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.params.id);
    if (!folderId) {
      res.status(400).json({ message: "目录ID不合法" });
      return;
    }
    try {
      const [rows] = await pool.query("SELECT id FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NOT NULL LIMIT 1", [
        folderId,
        req.user.userId,
        spaceType
      ]);
      if (rows.length === 0) {
        res.status(404).json({ message: "目录不存在或未删除" });
        return;
      }
      const allFolderIds = await collectDescendantFolderIds(req.user.userId, folderId, spaceType);
      const inClause = toInClause(allFolderIds);
      const [fileRows] = await pool.query(
        `SELECT storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName FROM files WHERE user_id = ? AND space_type = ? AND folder_id IN (${inClause}) AND deleted_at IS NOT NULL`,
        [req.user.userId, spaceType, ...allFolderIds]
      );
      await pool.query(`DELETE FROM files WHERE user_id = ? AND space_type = ? AND folder_id IN (${inClause}) AND deleted_at IS NOT NULL`, [
        req.user.userId,
        spaceType,
        ...allFolderIds
      ]);
      await pool.query(`DELETE FROM folders WHERE user_id = ? AND space_type = ? AND id IN (${inClause}) AND deleted_at IS NOT NULL`, [
        req.user.userId,
        spaceType,
        ...allFolderIds
      ]);
      fileRows.forEach((item) => {
        const targetPath = resolveAbsoluteStoragePath(item.storageName, spaceType);
        if (targetPath && fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        if (item.thumbnailStorageName) {
          const thumbnailPath = resolveAbsoluteStoragePath(item.thumbnailStorageName, spaceType);
          if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
        }
      });
      res.json({ message: "目录已彻底删除" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/recycle", authRequired, requireFilePermission("delete"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    try {
      const [fileRows] = await pool.query(
        "SELECT storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NOT NULL",
        [req.user.userId, spaceType]
      );
      await pool.query("DELETE FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NOT NULL", [req.user.userId, spaceType]);
      await pool.query("DELETE FROM folders WHERE user_id = ? AND space_type = ? AND deleted_at IS NOT NULL", [req.user.userId, spaceType]);
      fileRows.forEach((item) => {
        const targetPath = resolveAbsoluteStoragePath(item.storageName, spaceType);
        if (targetPath && fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        if (item.thumbnailStorageName) {
          const thumbnailPath = resolveAbsoluteStoragePath(item.thumbnailStorageName, spaceType);
          if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
        }
      });
      res.json({ message: "回收站已清空" });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
