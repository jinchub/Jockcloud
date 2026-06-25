/**
 * 打包下载工具模块
 * 抽取 downloads.js 和 shares.js 中的重复打包逻辑
 */

/**
 * 构建文件夹相对路径解析器
 * @param {Map} folderMap - 文件夹ID到文件夹信息的映射
 * @param {number|string} rootFolderId - 根文件夹ID
 * @param {Object} path - Node.js path 模块
 * @returns {Function} (currentId) => string
 */
const createFolderRelativePathResolver = (folderMap, rootFolderId, path) => {
  return (currentId) => {
    const paths = [];
    let cursor = folderMap.get(Number(currentId)) || null;
    const guard = new Set();
    while (cursor && Number(cursor.id) !== Number(rootFolderId)) {
      if (guard.has(cursor.id)) break;
      guard.add(cursor.id);
      paths.unshift(cursor.name || "未命名目录");
      cursor = cursor.parentId ? folderMap.get(Number(cursor.parentId)) : null;
    }
    return paths.join(path.sep);
  };
};

/**
 * 构建文件夹映射
 * @param {Array} folderRows - 文件夹数据库行
 * @returns {Map}
 */
const buildFolderMap = (folderRows) => {
  const folderMap = new Map();
  folderRows.forEach((item) => {
    folderMap.set(Number(item.id), {
      id: Number(item.id),
      name: item.name || "未命名目录",
      parentId: item.parentId === null || item.parentId === undefined ? null : Number(item.parentId)
    });
  });
  return folderMap;
};

/**
 * 将文件复制到打包目录
 * @param {Object} params
 * @returns {number} 复制的文件数量
 */
const copyFilesToArchiveDir = ({ fileRows, folderMap, rootFolderId, sourceRoot, fs, path, resolveAbsoluteStoragePath, spaceType, safeFileName }) => {
  const resolveFolderRelativePath = createFolderRelativePathResolver(folderMap, rootFolderId, path);
  let copiedCount = 0;
  for (const fileRow of fileRows) {
    const relativePath = resolveFolderRelativePath(fileRow.folderId);
    const targetDir = relativePath ? path.join(sourceRoot, relativePath) : sourceRoot;
    const sourcePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, safeFileName(fileRow.originalName || `文件-${fileRow.id}`));
    fs.copyFileSync(sourcePath, targetPath);
    copiedCount += 1;
  }
  return copiedCount;
};

/**
 * 将文件夹结构复制到打包目录
 * @param {Object} params
 * @returns {number} 复制的文件数量
 */
const copyFoldersToArchiveDir = ({ folderRows, fileRows, rootFolderId, sourceRoot, fs, path, resolveAbsoluteStoragePath, spaceType, safeFileName }) => {
  const folderMap = buildFolderMap(folderRows);
  const resolveFolderRelativePath = createFolderRelativePathResolver(folderMap, rootFolderId, path);
  let copiedCount = 0;
  for (const folderRow of folderRows) {
    const relativePath = resolveFolderRelativePath(folderRow.id);
    const targetPath = relativePath ? path.join(sourceRoot, relativePath) : sourceRoot;
    fs.mkdirSync(targetPath, { recursive: true });
  }
  for (const fileRow of fileRows) {
    const relativePath = resolveFolderRelativePath(fileRow.folderId);
    const targetDir = relativePath ? path.join(sourceRoot, relativePath) : sourceRoot;
    const sourcePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, safeFileName(fileRow.originalName || `文件-${fileRow.id}`));
    fs.copyFileSync(sourcePath, targetPath);
    copiedCount += 1;
  }
  return copiedCount;
};

/**
 * 创建打包流式响应
 * @param {Object} params
 */
const streamArchiveResponse = ({ archivePath, archiveName, res, fs, speedLimitKb, createSpeedLimitedStream, tempDir }) => {
  const stat = fs.statSync(archivePath);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', stat.size);

  let cleaned = false;
  const cleanup = () => {
    if (!cleaned) {
      cleaned = true;
      fs.rm(tempDir, { recursive: true, force: true }, () => {});
    }
  };

  const archiveStream = fs.createReadStream(archivePath);
  createSpeedLimitedStream(archiveStream, res, speedLimitKb);
  archiveStream.on("end", cleanup);
  archiveStream.on("error", cleanup);
  res.on("close", cleanup);
  res.on("finish", cleanup);
  res.on("error", cleanup);
};

/**
 * 安全清理临时目录
 * @param {Object} fs
 * @param {string} tempDir
 */
const safeCleanupTempDir = (fs, tempDir) => {
  fs.rm(tempDir, { recursive: true, force: true }, () => {});
};

module.exports = {
  createFolderRelativePathResolver,
  buildFolderMap,
  copyFilesToArchiveDir,
  copyFoldersToArchiveDir,
  streamArchiveResponse,
  safeCleanupTempDir
};
