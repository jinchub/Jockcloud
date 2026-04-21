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
    collectDescendantFolderIds,
    toInClause,
    hasFilePermission,
    checkFolderOwnership,
    hasNameConflict,
    copyFileRecord,
    copyFolderRecursive,
    resolveUniqueName,
    safeFileName,
    normalizeStorageSpaceType
  } = deps;

  app.get("/api/entries", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const rawParentId = req.query.parentId;
    const parentId = rawParentId === undefined ? undefined : normalizeFolderId(rawParentId);
    const keyword = String(req.query.keyword || "").trim();
    const category = String(req.query.category || "").trim();
    const type = String(req.query.type || "all").trim();
    const sortByRaw = String(req.query.sortBy || "updatedAt").trim();
    const orderRaw = String(req.query.order || "desc").trim().toLowerCase();
    const pageRaw = Number.parseInt(String(req.query.page || "1"), 10);
    const pageSizeRaw = Number.parseInt(String(req.query.pageSize || "50"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = [20, 50, 100, 150, 200].includes(pageSizeRaw) ? pageSizeRaw : 50;

    if (rawParentId !== undefined && parentId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }

    if (parentId === undefined && !category && !keyword) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }

    if (!["all", "folder", "file"].includes(type)) {
      res.status(400).json({ message: "类型参数不合法" });
      return;
    }
    const sortMap = {
      name: "name",
      type: "type",
      size: "size",
      updatedAt: "updatedAt",
      createdAt: "createdAt"
    };
    const sortBy = sortMap[sortByRaw] || "updatedAt";
    const order = orderRaw === "asc" ? "ASC" : "DESC";
    try {
      const folderParams = [req.user.userId, spaceType];
      const fileParams = [req.user.userId, spaceType];
      let folderSql =
        "SELECT id, name, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt, 'folder' AS type, 0 AS size FROM folders WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL";
      let fileSql =
        "SELECT id, original_name AS name, folder_id AS parentId, created_at AS createdAt, updated_at AS updatedAt, 'file' AS type, size, mime_type AS mimeType, thumbnail_storage_name AS thumbnailStorageName, file_category AS fileCategory FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL";

      if (category) {
        folderSql += " AND 1=0";
        
        if (category === "image") {
          fileSql += " AND mime_type LIKE 'image/%'";
        } else if (category === "video") {
          fileSql += " AND mime_type LIKE 'video/%'";
        } else if (category === "audio") {
          fileSql += " AND mime_type LIKE 'audio/%'";
        } else if (category === "text") {
          fileSql += " AND (mime_type LIKE 'text/%' OR original_name REGEXP '\\\\.(txt|md|markdown|log|ini|conf|cfg|yaml|yml|json|xml|csv|tsv|srt|ass|ssa|vtt|rtf|tex)$')";
        } else if (category === "archive") {
          fileSql += " AND (mime_type IN ('application/zip','application/x-zip-compressed','application/x-rar-compressed','application/vnd.rar','application/x-7z-compressed','application/x-tar','application/gzip','application/x-gzip','application/x-bzip','application/x-bzip2','application/x-xz') OR original_name REGEXP '\\\\.(zip|rar|7z|tar|gz|tgz|bz2|xz|cab|iso)$')";
        } else if (category === "program") {
          fileSql += " AND (mime_type IN ('application/x-msdownload','application/x-msi','application/vnd.microsoft.portable-executable','application/vnd.android.package-archive','application/x-apple-diskimage','application/x-rpm','application/x-debian-package') OR original_name REGEXP '\\\\.(exe|msi|apk|dmg|pkg|deb|rpm|appimage|ipa)$')";
        } else if (category === "doc") {
          fileSql += " AND LOWER(original_name) REGEXP '\\\\.(docx|doc|xlsx|xls|pptx|ppt|pdf|wps|et|dps|epub|mobi|azw3|ibooks|ps|eps|html|htm|xml|md|tif|tiff)$'";
        } else if (category === "other") {
           fileSql += " AND NOT (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%' OR mime_type LIKE 'audio/%' OR mime_type LIKE 'text/%' OR mime_type LIKE 'application/pdf' OR mime_type LIKE 'application/msword' OR mime_type LIKE 'application/vnd.%' OR mime_type IN ('application/zip','application/x-zip-compressed','application/x-rar-compressed','application/vnd.rar','application/x-7z-compressed','application/x-tar','application/gzip','application/x-gzip','application/x-bzip','application/x-bzip2','application/x-xz','application/x-msdownload','application/x-msi','application/vnd.microsoft.portable-executable','application/vnd.android.package-archive','application/x-apple-diskimage','application/x-rpm','application/x-debian-package') OR original_name REGEXP '\\\\.(zip|rar|7z|tar|gz|tgz|bz2|xz|cab|iso|exe|msi|apk|dmg|pkg|deb|rpm|appimage|ipa)$')";
        }
      } else {
        if (parentId === null) {
          folderSql += " AND parent_id IS NULL";
          fileSql += " AND folder_id IS NULL";
        } else if (parentId !== undefined) {
          folderSql += " AND parent_id = ?";
          fileSql += " AND folder_id = ?";
          folderParams.push(parentId);
          fileParams.push(parentId);
        }
      }

      if (keyword) {
        folderSql += " AND name LIKE ?";
        fileSql += " AND original_name LIKE ?";
        folderParams.push(`%${keyword}%`);
        fileParams.push(`%${keyword}%`);
      }

      const entries = [];
      if (type === "all" || type === "folder") {
        const [folderRows] = await pool.query(folderSql, folderParams);
        entries.push(...folderRows);
      }
      if (type === "all" || type === "file") {
        const [fileRows] = await pool.query(fileSql, fileParams);
        const normalizedRows = fileRows.map((item) => {
          const rawCategory = normalizeFileCategoryKey(item.fileCategory);
          const resolvedCategory = rawCategory === "other"
            ? resolveStoredFileCategory(item.name, item.mimeType)
            : rawCategory;
          return { ...item, fileCategory: normalizeFileCategoryKey(resolvedCategory) };
        });
        entries.push(...normalizedRows);
      }
      entries.sort((a, b) => {
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
      const output = entries.map((item) => {
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

  app.get("/api/entries/:type/:id", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const entryId = normalizeFolderId(req.params.id);
    const type = String(req.params.type || "");
    if (!entryId) {
      res.status(400).json({ message: "ID不合法" });
      return;
    }
    if (!["folder", "file"].includes(type)) {
      res.status(400).json({ message: "类型不合法" });
      return;
    }
    try {
      if (type === "folder") {
        const [rows] = await pool.query(
          "SELECT id, name, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt FROM folders WHERE id = ? AND user_id = ? AND space_type = ? LIMIT 1",
          [entryId, req.user.userId, spaceType]
        );
        if (rows.length === 0) {
          res.status(404).json({ message: "目录不存在" });
          return;
        }
        const folderIds = await collectDescendantFolderIds(req.user.userId, entryId, spaceType);
        const folderClause = folderIds.map(() => "?").join(", ");
        const [fileRows] = await pool.query(
          `SELECT COUNT(*) AS fileCount, IFNULL(SUM(size), 0) AS totalSize
           FROM files
           WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND folder_id IN (${folderClause})`,
          [req.user.userId, spaceType, ...folderIds]
        );
        const [folderRows] = await pool.query(
          "SELECT COUNT(*) AS folderCount FROM folders WHERE user_id = ? AND space_type = ? AND parent_id = ? AND deleted_at IS NULL",
          [req.user.userId, spaceType, entryId]
        );
        res.json({ ...rows[0], fileCount: fileRows[0].fileCount, folderCount: folderRows[0].folderCount, totalSize: fileRows[0].totalSize });
        return;
      }
      const [rows] = await pool.query(
        "SELECT id, original_name AS name, size, mime_type AS mimeType, file_category AS fileCategory, folder_id AS parentId, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt FROM files WHERE id = ? AND user_id = ? AND space_type = ? LIMIT 1",
        [entryId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const rawCategory = normalizeFileCategoryKey(rows[0].fileCategory);
      const resolvedCategory = rawCategory === "other"
        ? resolveStoredFileCategory(rows[0].name, rows[0].mimeType)
        : rawCategory;
      res.json({ ...rows[0], fileCategory: normalizeFileCategoryKey(resolvedCategory) });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/entries/batch", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const action = String(req.body.action || "").trim();
    const rawEntries = Array.isArray(req.body.entries) ? req.body.entries : [];
    const targetFolderId = req.body.targetFolderId === undefined ? undefined : normalizeFolderId(req.body.targetFolderId);
    const pasteStrategy = String(req.body.pasteStrategy ? req.body.pasteStrategy : "cancel").trim().toLowerCase();
    if (!["copy", "move", "delete"].includes(action)) {
      res.status(400).json({ message: "操作类型不合法" });
      return;
    }
    const permissionMap = { copy: "copy", move: "move", delete: "delete" };
    if (!hasFilePermission(req, permissionMap[action])) {
      res.status(403).json({ message: "无权执行该操作" });
      return;
    }
    if (rawEntries.length === 0) {
      res.status(400).json({ message: "请选择文件或目录" });
      return;
    }
    if ((action === "copy" || action === "move") && targetFolderId === undefined) {
      res.status(400).json({ message: "目标目录参数不合法" });
      return;
    }
    if ((action === "copy" || action === "move")) {
      const owned = await checkFolderOwnership(req.user.userId, targetFolderId, spaceType);
      if (!owned) {
        res.status(404).json({ message: "目标目录不存在" });
        return;
      }
    }
    const entries = [];
    for (const item of rawEntries) {
      const id = normalizeFolderId(item && item.id);
      const type = String(item && item.type || "").trim();
      if (!id || !["file", "folder"].includes(type)) {
        res.status(400).json({ message: "条目参数不合法" });
        return;
      }
      entries.push({ id, type });
    }
    
    // 检查冲突并准备处理
    let conflicts = [];
    let conflictResolved = false;
    const processedEntries = [];
    
    if (action === "copy" || action === "move") {
      // 获取当前目标目录中已有的文件名
      const [existingNameRows] = await pool.query(
        "SELECT original_name AS name, 'file' AS type FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND deleted_at IS NULL UNION ALL SELECT name, 'folder' AS type FROM folders WHERE user_id = ? AND space_type = ? AND parent_id <=> ? AND deleted_at IS NULL",
        [req.user.userId, normalizedSpaceType, targetFolderId, req.user.userId, normalizedSpaceType, targetFolderId]
      );
      const usedNameSet = new Set(existingNameRows.map((item) => safeFileName(item.name || "")).filter(Boolean));
      
      for (const entry of entries) {
        if (entry.type === "file") {
          const [rows] = await pool.query(
            "SELECT original_name AS originalName, folder_id AS folderId FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
            [entry.id, req.user.userId, spaceType]
          );
          if (rows.length === 0) {
            continue;
          }
          if (action === "move" && rows[0].folderId === targetFolderId) {
            processedEntries.push({ ...entry, skip: true });
            continue;
          }
          const duplicated = await hasNameConflict(
            req.user.userId,
            "file",
            targetFolderId,
            rows[0].originalName,
            action === "move" ? entry.id : 0,
            spaceType
          );
          
          if (duplicated) {
            if (pasteStrategy === "cancel") {
              conflicts.push({ id: entry.id, type: "file", name: rows[0].originalName });
            } else if (pasteStrategy === "auto_rename") {
              // 自动重命名
              const newName = resolveUniqueName(rows[0].originalName, usedNameSet);
              usedNameSet.add(newName);
              processedEntries.push({ ...entry, originalName: rows[0].originalName, newName });
            } else if (pasteStrategy === "overwrite") {
              // 先删除同名的文件
              await pool.query(
                "UPDATE files SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL",
                [req.user.userId, normalizedSpaceType, targetFolderId, rows[0].originalName]
              );
              usedNameSet.add(rows[0].originalName);
              processedEntries.push({ ...entry, originalName: rows[0].originalName });
            }
          } else {
            usedNameSet.add(rows[0].originalName);
            processedEntries.push({ ...entry, originalName: rows[0].originalName });
          }
        } else {
          const [rows] = await pool.query(
            "SELECT name, parent_id AS parentId FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
            [entry.id, req.user.userId, spaceType]
          );
          if (rows.length === 0) {
            continue;
          }
          if (action === "move" && rows[0].parentId === targetFolderId) {
            processedEntries.push({ ...entry, skip: true });
            continue;
          }
          const duplicated = await hasNameConflict(
            req.user.userId,
            "folder",
            targetFolderId,
            rows[0].name,
            action === "move" ? entry.id : 0,
            spaceType
          );
          
          if (duplicated) {
            if (pasteStrategy === "cancel") {
              conflicts.push({ id: entry.id, type: "folder", name: rows[0].name });
            } else if (pasteStrategy === "auto_rename") {
              // 自动重命名文件夹
              const newName = resolveUniqueName(rows[0].name, usedNameSet);
              usedNameSet.add(newName);
              processedEntries.push({ ...entry, originalName: rows[0].name, newName });
            } else if (pasteStrategy === "overwrite") {
              // 先删除同名的文件夹
              await pool.query(
                "UPDATE folders SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND parent_id <=> ? AND name = ? AND deleted_at IS NULL",
                [req.user.userId, normalizedSpaceType, targetFolderId, rows[0].name]
              );
              usedNameSet.add(rows[0].name);
              processedEntries.push({ ...entry, originalName: rows[0].name });
            }
          } else {
            usedNameSet.add(rows[0].name);
            processedEntries.push({ ...entry, originalName: rows[0].name });
          }
        }
      }
      
      if (conflicts.length > 0) {
        res.status(409).json({
          message: "当前目录已经存在同名的文件或目录",
          code: "NAME_CONFLICT",
          conflicts
        });
        return;
      }
    }
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    const entriesToProcess = processedEntries.length > 0 ? processedEntries : entries;
    
    for (const entry of entriesToProcess) {
      try {
        if (entry.skip) {
          successCount += 1;
          continue;
        }
        
        if (action === "delete") {
          if (entry.type === "file") {
            const [rows] = await pool.query("SELECT id FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
              entry.id,
              req.user.userId,
              spaceType
            ]);
            if (rows.length === 0) {
              throw new Error("文件不存在");
            }
            await pool.query("UPDATE files SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND space_type = ?", [entry.id, req.user.userId, spaceType]);
          } else {
            const [folderRows] = await pool.query("SELECT id FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
              entry.id,
              req.user.userId,
              spaceType
            ]);
            if (folderRows.length === 0) {
              throw new Error("目录不存在");
            }
            const allFolderIds = await collectDescendantFolderIds(req.user.userId, entry.id, spaceType);
            const inClause = toInClause(allFolderIds);
            await pool.query(`UPDATE folders SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND id IN (${inClause})`, [req.user.userId, spaceType, ...allFolderIds]);
            await pool.query(`UPDATE files SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND folder_id IN (${inClause})`, [
              req.user.userId,
              spaceType,
              ...allFolderIds
            ]);
          }
        } else if (action === "move") {
          if (entry.type === "file") {
            const [rows] = await pool.query("SELECT id, original_name AS originalName, folder_id AS folderId FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
              entry.id,
              req.user.userId,
              spaceType
            ]);
            if (rows.length === 0) {
              throw new Error("文件不存在");
            }
            if (rows[0].folderId === targetFolderId) {
              successCount += 1;
              continue;
            }
            await pool.query("UPDATE files SET folder_id = ?, original_name = ? WHERE id = ? AND user_id = ? AND space_type = ?", [
              targetFolderId, 
              entry.newName || rows[0].originalName, 
              entry.id, 
              req.user.userId, 
              spaceType
            ]);
          } else {
            const [rows] = await pool.query("SELECT id, name, parent_id AS parentId FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
              entry.id,
              req.user.userId,
              spaceType
            ]);
            if (rows.length === 0) {
              throw new Error("目录不存在");
            }
            if (entry.id === targetFolderId) {
              throw new Error("目录不能移动到自己下面");
            }
            if (targetFolderId !== null) {
              const allFolderIds = await collectDescendantFolderIds(req.user.userId, entry.id, spaceType);
              if (allFolderIds.includes(targetFolderId)) {
                throw new Error("目录不能移动到自己的子目录");
              }
            }
            if (rows[0].parentId === targetFolderId) {
              successCount += 1;
              continue;
            }
            await pool.query("UPDATE folders SET parent_id = ?, name = ? WHERE id = ? AND user_id = ? AND space_type = ?", [
              targetFolderId, 
              entry.newName || rows[0].name, 
              entry.id, 
              req.user.userId, 
              spaceType
            ]);
          }
        } else if (action === "copy") {
          if (entry.type === "file") {
            const [rows] = await pool.query(
              "SELECT original_name AS originalName, storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName, file_category AS fileCategory, size, mime_type AS mimeType FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
              [entry.id, req.user.userId, spaceType]
            );
            if (rows.length === 0) {
              throw new Error("文件不存在");
            }
            
            // 复制文件记录，使用新名称（如果有）
            const modifiedFileRow = {
              ...rows[0],
              originalName: entry.newName || rows[0].originalName
            };
            await copyFileRecord(req.user.userId, modifiedFileRow, targetFolderId, spaceType);
          } else {
            const [rows] = await pool.query("SELECT id, name FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
              entry.id,
              req.user.userId,
              spaceType
            ]);
            if (rows.length === 0) {
              throw new Error("目录不存在");
            }
            if (targetFolderId !== null) {
              const allFolderIds = await collectDescendantFolderIds(req.user.userId, entry.id, spaceType);
              if (allFolderIds.includes(targetFolderId)) {
                throw new Error("目录不能复制到自己的子目录");
              }
            }
            
            // 复制文件夹，使用新名称（如果有）
            await copyFolderRecursive(req.user.userId, entry.id, targetFolderId, entry.id, spaceType, entry.newName || null);
          }
        }
        successCount += 1;
      } catch (error) {
        failCount += 1;
        errors.push({ id: entry.id, type: entry.type, message: error.message });
      }
    }
    res.json({ message: "批量操作完成", successCount, failCount, errors });
  });
};
