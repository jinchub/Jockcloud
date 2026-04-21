const createEntryRecycleRuntime = ({
  pool,
  fs,
  path,
  normalizeStorageSpaceType,
  normalizeStorageRelativePath,
  resolveAbsoluteStoragePath,
  makeStorageName,
  normalizeFileCategoryKey,
  RECYCLE_RETENTION_DAYS
}) => {
  const buildFolderLogicalPathResolver = async (userId, spaceType = "normal") => {
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const [folderRows] = await pool.query(
      "SELECT id, name, parent_id AS parentId FROM folders WHERE user_id = ? AND space_type = ?",
      [userId, normalizedSpaceType]
    );
    const folderMap = new Map(folderRows.map((item) => [item.id, item]));
    const cache = new Map();
    const resolve = (folderId, visited = new Set()) => {
      if (folderId === null || folderId === undefined) return "我的文件";
      if (cache.has(folderId)) return cache.get(folderId);
      if (visited.has(folderId)) return "我的文件";
      const folder = folderMap.get(folderId);
      if (!folder) {
        cache.set(folderId, "我的文件");
        return "我的文件";
      }
      visited.add(folderId);
      const parentPath = resolve(folder.parentId, visited);
      visited.delete(folderId);
      const currentPath = parentPath === "我的文件"
        ? `我的文件/${folder.name}`
        : `${parentPath}/${folder.name}`;
      cache.set(folderId, currentPath);
      return currentPath;
    };
    return resolve;
  };

  const copyStoredFile = (storageName, copyName, spaceType = "normal") => {
    const sourceStorageName = normalizeStorageRelativePath(storageName);
    const sourcePath = resolveAbsoluteStoragePath(sourceStorageName, spaceType);
    if (!fs.existsSync(sourcePath)) {
      throw new Error("源文件不存在");
    }
    const sourceDir = path.posix.dirname(sourceStorageName);
    const targetDir = sourceDir === "." ? "" : sourceDir;
    const newStorageName = makeStorageName(copyName, targetDir);
    const targetPath = resolveAbsoluteStoragePath(newStorageName, spaceType);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return newStorageName;
  };

  const hasNameConflict = async (userId, type, targetFolderId, name, excludeId = 0, spaceType = "normal") => {
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    if (type === "file") {
      const [rows] = await pool.query(
        "SELECT id FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL AND id <> ? LIMIT 1",
        [userId, normalizedSpaceType, targetFolderId, name, excludeId]
      );
      return rows.length > 0;
    }
    const [rows] = await pool.query(
      "SELECT id FROM folders WHERE user_id = ? AND space_type = ? AND parent_id <=> ? AND name = ? AND deleted_at IS NULL AND id <> ? LIMIT 1",
      [userId, normalizedSpaceType, targetFolderId, name, excludeId]
    );
    return rows.length > 0;
  };

  const hasEntryNameConflict = async (
    userId,
    targetFolderId,
    name,
    { excludeFileId = 0, excludeFolderId = 0 } = {},
    spaceType = "normal"
  ) => {
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const [fileRows] = await pool.query(
      "SELECT id FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL AND id <> ? LIMIT 1",
      [userId, normalizedSpaceType, targetFolderId, name, excludeFileId]
    );
    if (fileRows.length > 0) {
      return true;
    }
    const [folderRows] = await pool.query(
      "SELECT id FROM folders WHERE user_id = ? AND space_type = ? AND parent_id <=> ? AND name = ? AND deleted_at IS NULL AND id <> ? LIMIT 1",
      [userId, normalizedSpaceType, targetFolderId, name, excludeFolderId]
    );
    return folderRows.length > 0;
  };

  const copyFileRecord = async (userId, fileRow, targetFolderId, spaceType = "normal") => {
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const copiedName = fileRow.originalName;
    const newStorageName = copyStoredFile(fileRow.storageName, copiedName, normalizedSpaceType);
    let newThumbnailStorageName = null;
    if (fileRow.thumbnailStorageName) {
      const thumbExt = path.extname(String(fileRow.thumbnailStorageName || "")).replace(/^\./, "") || "webp";
      const thumbCopyName = `${path.parse(copiedName || "thumb").name || "thumb"}-thumb.${thumbExt}`;
      newThumbnailStorageName = copyStoredFile(fileRow.thumbnailStorageName, thumbCopyName, normalizedSpaceType);
    }
    await pool.query(
      "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, normalizedSpaceType, targetFolderId, copiedName, newStorageName, newThumbnailStorageName, normalizeFileCategoryKey(fileRow.fileCategory), fileRow.size, fileRow.mimeType]
    );
  };

  const copyFolderRecursive = async (userId, sourceFolderId, targetParentId, rootFolderId, spaceType = "normal", newFolderName = null) => {
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const [folderRows] = await pool.query(
      "SELECT id, name FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
      [sourceFolderId, userId, normalizedSpaceType]
    );
    if (folderRows.length === 0) {
      throw new Error("目录不存在");
    }
    const sourceFolder = folderRows[0];
    const folderName = newFolderName || sourceFolder.name;
    const [insertResult] = await pool.query("INSERT INTO folders (user_id, space_type, name, parent_id) VALUES (?, ?, ?, ?)", [
      userId,
      normalizedSpaceType,
      folderName,
      targetParentId
    ]);
    const newFolderId = insertResult.insertId;
    const [fileRows] = await pool.query(
      "SELECT original_name AS originalName, storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName, file_category AS fileCategory, size, mime_type AS mimeType FROM files WHERE user_id = ? AND space_type = ? AND folder_id = ? AND deleted_at IS NULL",
      [userId, normalizedSpaceType, sourceFolderId]
    );
    for (const fileRow of fileRows) {
      await copyFileRecord(userId, fileRow, newFolderId, normalizedSpaceType);
    }
    const [childRows] = await pool.query(
      "SELECT id FROM folders WHERE user_id = ? AND space_type = ? AND parent_id = ? AND deleted_at IS NULL",
      [userId, normalizedSpaceType, sourceFolderId]
    );
    for (const child of childRows) {
      await copyFolderRecursive(userId, child.id, newFolderId, rootFolderId, normalizedSpaceType);
    }
    return newFolderId;
  };

  const cleanupExpiredRecycleEntries = async () => {
    const [expiredFileRows] = await pool.query(
      "SELECT storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName, space_type AS spaceType FROM files WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [RECYCLE_RETENTION_DAYS]
    );
    await pool.query(
      "DELETE FROM files WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [RECYCLE_RETENTION_DAYS]
    );
    await pool.query(
      "DELETE FROM folders WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [RECYCLE_RETENTION_DAYS]
    );
    expiredFileRows.forEach((item) => {
      const targetPath = resolveAbsoluteStoragePath(item.storageName, item.spaceType);
      if (targetPath && fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      if (item.thumbnailStorageName) {
        const thumbPath = resolveAbsoluteStoragePath(item.thumbnailStorageName, item.spaceType);
        if (thumbPath && fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      }
    });
  };

  return {
    buildFolderLogicalPathResolver,
    hasNameConflict,
    hasEntryNameConflict,
    copyFileRecord,
    copyFolderRecursive,
    cleanupExpiredRecycleEntries
  };
};

module.exports = {
  createEntryRecycleRuntime
};
