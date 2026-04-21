const createFolderResolver = ({
  pool,
  normalizeStorageSpaceType,
  normalizeRelativePath,
  safeFileName
}) => {
  const resolveFolderByRelativePath = async (userId, baseFolderId, relativePath, cache, spaceType = "normal") => {
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) {
      return baseFolderId;
    }
    const folderParts = normalized.split("/").slice(0, -1);
    let parentId = baseFolderId;
    for (const part of folderParts) {
      const folderName = safeFileName(part).trim();
      if (!folderName) {
        continue;
      }
      const cacheKey = `${parentId === null ? "null" : parentId}/${folderName}`;
      if (cache.has(cacheKey)) {
        parentId = cache.get(cacheKey);
        continue;
      }
      const [existRows] = await pool.query(
        "SELECT id FROM folders WHERE user_id = ? AND space_type = ? AND parent_id <=> ? AND name = ? AND deleted_at IS NULL LIMIT 1",
        [userId, normalizedSpaceType, parentId, folderName]
      );
      if (existRows.length > 0) {
        parentId = existRows[0].id;
        cache.set(cacheKey, parentId);
        continue;
      }
      const [insertResult] = await pool.query(
        "INSERT INTO folders (user_id, space_type, name, parent_id) VALUES (?, ?, ?, ?)",
        [userId, normalizedSpaceType, folderName, parentId]
      );
      parentId = insertResult.insertId;
      cache.set(cacheKey, parentId);
    }
    return parentId;
  };

  const resolveFolderByRelativeDir = async (userId, baseFolderId, relativeDir, cache, spaceType = "normal") => {
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const normalized = normalizeRelativePath(relativeDir);
    if (!normalized) {
      return baseFolderId;
    }
    const folderParts = normalized.split("/");
    let parentId = baseFolderId;
    for (const part of folderParts) {
      const folderName = safeFileName(part).trim();
      if (!folderName) {
        continue;
      }
      const cacheKey = `${parentId === null ? "null" : parentId}/${folderName}`;
      if (cache.has(cacheKey)) {
        parentId = cache.get(cacheKey);
        continue;
      }
      const [existRows] = await pool.query(
        "SELECT id FROM folders WHERE user_id = ? AND space_type = ? AND parent_id <=> ? AND name = ? AND deleted_at IS NULL LIMIT 1",
        [userId, normalizedSpaceType, parentId, folderName]
      );
      if (existRows.length > 0) {
        parentId = existRows[0].id;
        cache.set(cacheKey, parentId);
        continue;
      }
      const [insertResult] = await pool.query(
        "INSERT INTO folders (user_id, space_type, name, parent_id) VALUES (?, ?, ?, ?)",
        [userId, normalizedSpaceType, folderName, parentId]
      );
      parentId = insertResult.insertId;
      cache.set(cacheKey, parentId);
    }
    return parentId;
  };

  return {
    resolveFolderByRelativePath,
    resolveFolderByRelativeDir
  };
};

module.exports = {
  createFolderResolver
};
