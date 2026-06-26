const crypto = require("crypto");

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

  // 管理接口：为现有文件计算MD5
  app.post("/api/admin/calc-md5", authRequired, async (req, res) => {
    if (!req.user || req.user.role !== "admin") {
      res.status(403).json({ message: "需要管理员权限" });
      return;
    }
    
    const batchSize = Number.parseInt(String(req.body.batchSize || "50"), 10);
    const actualBatchSize = Number.isFinite(batchSize) && batchSize > 0 && batchSize <= 200 ? batchSize : 50;
    
    try {
      // 获取没有md5的文件
      const [files] = await pool.query(
        "SELECT id, storage_name, space_type, original_name FROM files WHERE md5 IS NULL AND deleted_at IS NULL LIMIT ?",
        [actualBatchSize]
      );
      
      if (files.length === 0) {
        res.json({ message: "没有需要处理的文件", processed: 0, remaining: 0 });
        return;
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const file of files) {
        try {
          const filePath = resolveAbsoluteStoragePath(file.storage_name, file.space_type);
          
          if (!filePath || !fs.existsSync(filePath)) {
            errorCount++;
            continue;
          }
          
          const md5 = await new Promise((resolve, reject) => {
            const hash = crypto.createHash("md5");
            const stream = fs.createReadStream(filePath);
            stream.on("data", (chunk) => hash.update(chunk));
            stream.on("end", () => resolve(hash.digest("hex")));
            stream.on("error", reject);
          });
          
          await pool.query("UPDATE files SET md5 = ? WHERE id = ?", [md5, file.id]);
          successCount++;
        } catch (e) {
          errorCount++;
        }
      }
      
      // 获取剩余未处理的文件数量
      const [remainingRows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM files WHERE md5 IS NULL AND deleted_at IS NULL"
      );
      const remaining = remainingRows[0].cnt;
      
      res.json({ 
        message: `处理完成，成功: ${successCount}, 失败: ${errorCount}`,
        processed: successCount + errorCount,
        remaining: remaining
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/recycle", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const type = String(req.query.type || "all").trim();
    const sortByRaw = String(req.query.sortBy || "deletedAt").trim();
    const orderRaw = String(req.query.order || "desc").trim().toLowerCase();
    const pageRaw = Number.parseInt(String(req.query.page || "1"), 10);
    const pageSizeRaw = Number.parseInt(String(req.query.pageSize || "50"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = pageSizeRaw === 0 ? 0 : ([20, 50, 100, 150, 200].includes(pageSizeRaw) ? pageSizeRaw : 50);
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
      const recycleRootLabel = spaceType === "hidden" ? "私密空间" : "我的文件";
      const withOriginalDir = recycleItems.map((item) => {
        const originalDir = item.parentId === null ? recycleRootLabel : resolveLogicalPath(item.parentId);
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
      const effectivePageSize = pageSize === 0 ? total : pageSize;
      const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
      const safePage = Math.min(page, totalPages);
      const startIndex = total === 0 ? 0 : (safePage - 1) * effectivePageSize;
      const items = output.slice(startIndex, pageSize === 0 ? total : startIndex + pageSize);
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
      const storageName = rows[0].storageName;
      const thumbnailStorageName = rows[0].thumbnailStorageName;
      
      await pool.query("DELETE FROM files WHERE id = ? AND user_id = ? AND space_type = ?", [fileId, req.user.userId, spaceType]);
      
      // 检查是否还有其他用户引用此物理文件（通过md5或storage_name）
      const [otherRefs] = await pool.query(
        "SELECT id FROM files WHERE storage_name = ? AND deleted_at IS NULL LIMIT 1",
        [storageName]
      );
      
      // 只有没有其他用户引用时，才删除物理文件
      if (otherRefs.length === 0) {
        const targetPath = resolveAbsoluteStoragePath(storageName, spaceType);
        if (targetPath && fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      }
      
      // 缩略图也检查引用
      if (thumbnailStorageName) {
        const [thumbRefs] = await pool.query(
          "SELECT id FROM files WHERE thumbnail_storage_name = ? AND deleted_at IS NULL LIMIT 1",
          [thumbnailStorageName]
        );
        if (thumbRefs.length === 0) {
          const thumbnailPath = resolveAbsoluteStoragePath(thumbnailStorageName, spaceType);
          if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
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
      
      // 收集需要删除的物理文件（去重）
      const storageNamesToDelete = [...new Set(fileRows.map(item => item.storageName).filter(Boolean))];
      const thumbnailNamesToDelete = [...new Set(fileRows.map(item => item.thumbnailStorageName).filter(Boolean))];
      
      // 对每个物理文件检查是否还有其他用户引用
      for (const storageName of storageNamesToDelete) {
        const [otherRefs] = await pool.query(
          "SELECT id FROM files WHERE storage_name = ? AND deleted_at IS NULL LIMIT 1",
          [storageName]
        );
        if (otherRefs.length === 0) {
          const targetPath = resolveAbsoluteStoragePath(storageName, spaceType);
          if (targetPath && fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
        }
      }
      
      for (const thumbnailStorageName of thumbnailNamesToDelete) {
        const [thumbRefs] = await pool.query(
          "SELECT id FROM files WHERE thumbnail_storage_name = ? AND deleted_at IS NULL LIMIT 1",
          [thumbnailStorageName]
        );
        if (thumbRefs.length === 0) {
          const thumbnailPath = resolveAbsoluteStoragePath(thumbnailStorageName, spaceType);
          if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
        }
      }
      
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
      
      // 收集需要删除的物理文件（去重）
      const storageNamesToDelete = [...new Set(fileRows.map(item => item.storageName).filter(Boolean))];
      const thumbnailNamesToDelete = [...new Set(fileRows.map(item => item.thumbnailStorageName).filter(Boolean))];
      
      // 对每个物理文件检查是否还有其他用户引用
      for (const storageName of storageNamesToDelete) {
        const [otherRefs] = await pool.query(
          "SELECT id FROM files WHERE storage_name = ? AND deleted_at IS NULL LIMIT 1",
          [storageName]
        );
        if (otherRefs.length === 0) {
          const targetPath = resolveAbsoluteStoragePath(storageName, spaceType);
          if (targetPath && fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
        }
      }
      
      for (const thumbnailStorageName of thumbnailNamesToDelete) {
        const [thumbRefs] = await pool.query(
          "SELECT id FROM files WHERE thumbnail_storage_name = ? AND deleted_at IS NULL LIMIT 1",
          [thumbnailStorageName]
        );
        if (thumbRefs.length === 0) {
          const thumbnailPath = resolveAbsoluteStoragePath(thumbnailStorageName, spaceType);
          if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
        }
      }
      
      res.json({ message: "回收站已清空" });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
