const Throttle = require('stream-throttle').Throttle;

module.exports = (app, deps) => {
  const {
    authRequired,
    requireFilePermission,
    pool,
    sendDbError,
    resolveStorageSpaceTypeByRequest,
    normalizeFolderId,
    detectArchiveType,
    ARCHIVE_SUPPORTED_TYPE_SET,
    resolveAbsoluteStoragePath,
    fs,
    listArchiveEntries,
    normalizeRelativePath,
    checkFolderOwnership,
    resolveFolderByRelativeDir,
    path,
    os,
    extractArchiveToDirectory,
    getUploadCategoryRuntimeOptions,
    DEFAULT_SETTINGS,
    readSettings,
    getUploadStorageDir,
    resolveStorageRootDir,
    crypto,
    resolveStorageNameFromPath,
    inferMimeTypeByFileName,
    normalizeFileCategoryKey,
    mammoth,
    xlsx,
    Buffer,
    resolveStoredFileCategory,
    writeExtractedThumbnailFromSource,
    runCompressArchive,
    resolveUniqueName,
    collectDescendantFolderIds,
    safeFileName,
    hasFilePermission,
    logFileOperation
  } = deps;

  const isLocalhostRequest = (req) => {
    const ip = req.ip || req.connection.remoteAddress || "";
    return ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || ip.startsWith("::ffff:127.0.0.1");
  };

  const getUserGroupIds = async (userId) => {
    try {
      const [rows] = await pool.query("SELECT group_id FROM user_group_members WHERE user_id = ?", [userId]);
      return rows.map(row => Number(row.group_id));
    } catch (error) {
      return [];
    }
  };

  const getUserDownloadSpeedLimit = async (userId, settings) => {
    if (!userId || !settings || !settings.download) {
      // 没有用户或设置时，使用全局限制
      if (settings && settings.download && settings.download.globalSpeedLimit) {
        const speedLimit = settings.download.globalSpeedLimit;
        if (speedLimit.unit === 'MB/s') {
          return (speedLimit.value || 0) * 1024;  // 转换为 KB/s
        }
        return speedLimit.value || 0;  // KB/s
      }
      // 向后兼容旧格式
      if (settings && settings.download && settings.download.globalSpeedLimitKb !== undefined) {
        return settings.download.globalSpeedLimitKb;
      }
      return (settings && settings.download && settings.download.globalSpeedLimitMb ? settings.download.globalSpeedLimitMb * 1024 : 102400);
    }
    
    // 优先级 1: 用户组速度限制（用户组权限 > 全局权限）
    const userGroupIds = await getUserGroupIds(userId);
    const groupSpeedLimits = settings.download.groupSpeedLimits || {};
    
    // 遍历用户所属的所有组，返回第一个设置的速度限制
    for (const groupId of userGroupIds) {
      const speedData = groupSpeedLimits[String(groupId)];
      if (speedData) {
        let speedKb;
        if (typeof speedData === 'object') {
          // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
          speedKb = speedData.unit === 'MB/s' ? (speedData.value || 0) * 1024 : (speedData.value || 0);
        } else {
          // 旧格式：纯数字（KB/s）
          speedKb = speedData;
        }
        // 如果用户组设置了速度限制（>0），则使用该限制
        if (speedKb > 0) {
          return speedKb;
        }
      }
    }
    
    // 优先级 2: 全局速度限制（当用户组没有限制时使用）
    if (settings.download.globalSpeedLimit) {
      const speedLimit = settings.download.globalSpeedLimit;
      if (speedLimit.unit === 'MB/s') {
        return (speedLimit.value || 0) * 1024;  // 转换为 KB/s
      }
      return speedLimit.value || 0;  // KB/s
    }
    // 向后兼容旧格式
    if (settings.download.globalSpeedLimitKb !== undefined) {
      return settings.download.globalSpeedLimitKb;
    }
    return (settings.download.globalSpeedLimitMb ? settings.download.globalSpeedLimitMb * 1024 : 102400);
  };

  const createSpeedLimitedStream = (readStream, res, speedLimitKbPerSecond) => {
    // speedLimitKbPerSecond 单位是 KB/s
    if (speedLimitKbPerSecond <= 0) {
      readStream.pipe(res);
      return;
    }
    
    // 使用 stream-throttle 库创建限速流
    const throttle = new Throttle({
      rate: speedLimitKbPerSecond * 1024  // 转换为字节/秒
    });
    
    readStream.pipe(throttle).pipe(res);
  };

  app.get("/api/files/:id/zip/entries", authRequired, requireFilePermission("download"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    if (!fileId) {
      res.status(400).json({ message: "文件 ID 不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT original_name AS originalName, storage_name AS storageName, mime_type AS mimeType FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const fileRow = rows[0];
      const archiveType = detectArchiveType(fileRow.originalName, fileRow.mimeType);
      if (!archiveType) {
        res.status(400).json({ message: "仅支持常见压缩包类型" });
        return;
      }
      if (!ARCHIVE_SUPPORTED_TYPE_SET.has(archiveType)) {
        res.status(400).json({ message: "该压缩类型暂不支持查看" });
        return;
      }
      const filePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ message: "压缩包已丢失" });
        return;
      }
      const rawEntries = await listArchiveEntries(filePath, archiveType);
      const entries = [];
      for (const item of rawEntries) {
        const rawPath = String(item && item.path ? item.path : "");
        const normalizedPath = normalizeRelativePath(rawPath);
        if (!normalizedPath) continue;
        entries.push({
          path: normalizedPath,
          isDirectory: Boolean(item && item.isDirectory),
          size: Math.max(0, Number(item && item.size ? item.size : 0)),
          compressedSize: Math.max(0, Number(item && item.compressedSize ? item.compressedSize : 0)),
          modifiedAt: item && item.modifiedAt ? String(item.modifiedAt) : null
        });
      }
      res.json({ entries, total: entries.length });
    } catch (error) {
      res.status(500).json({ message: error && error.message ? error.message : "读取压缩包失败" });
    }
  });

  app.get("/api/files/:id/zip/entry", authRequired, requireFilePermission("download"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    const entryPath = String(req.query.path || "").trim();
    const mode = String(req.query.mode || "stream").trim().toLowerCase();
    if (!fileId) {
      res.status(400).json({ message: "文件 ID 不合法" });
      return;
    }
    if (!entryPath) {
      res.status(400).json({ message: "文件路径参数不能为空" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT original_name AS originalName, storage_name AS storageName, mime_type AS mimeType FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const fileRow = rows[0];
      const archiveType = detectArchiveType(fileRow.originalName, fileRow.mimeType);
      if (!archiveType) {
        res.status(400).json({ message: "仅支持常见压缩包类型" });
        return;
      }
      if (!ARCHIVE_SUPPORTED_TYPE_SET.has(archiveType)) {
        res.status(400).json({ message: "该压缩类型暂不支持查看" });
        return;
      }
      const filePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ message: "压缩包已丢失" });
        return;
      }
      
      const normalizedEntryPath = normalizeRelativePath(entryPath.replace(/\\/g, "/"));
      if (!normalizedEntryPath) {
        res.status(400).json({ message: "文件路径不合法" });
        return;
      }
      
      let contentBuffer = null;
      const fileName = normalizedEntryPath.split("/").pop() || "file";
      
      if (archiveType === "zip") {
        const JSZip = require("jszip");
        const zipData = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(zipData);
        const zipEntry = zip.file(normalizedEntryPath);
        if (!zipEntry) {
          res.status(404).json({ message: "压缩包中不存在该文件" });
          return;
        }
        contentBuffer = await zipEntry.async("nodebuffer");
      } else {
        const rawEntries = await listArchiveEntries(filePath, archiveType);
        const targetEntry = rawEntries.find((item) => {
          const itemPath = normalizeRelativePath(String(item && item.path ? item.path : ""));
          return itemPath === normalizedEntryPath && !item.isDirectory;
        });
        
        if (!targetEntry) {
          res.status(404).json({ message: "压缩包中不存在该文件" });
          return;
        }
        
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jockcloud-extract-"));
        try {
          await extractArchiveToDirectory(filePath, archiveType, tempDir);
          const extractedFilePath = path.join(tempDir, normalizedEntryPath.replace(/\//g, path.sep));
          if (!fs.existsSync(extractedFilePath)) {
            res.status(404).json({ message: "文件提取失败" });
            return;
          }
          contentBuffer = fs.readFileSync(extractedFilePath);
        } finally {
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
        }
      }
      
      // 处理 Office 文档预览模式
      if (mode === "office") {
        const escapedOriginalName = String(fileName).replace(/[&<>"']/g, (char) => (
          { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
        ));
        const extMatch = fileName.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : "";
        try {
          if (contentBuffer.length === 0) {
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { padding: 20px; font-family: sans-serif; }</style></head><body></body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
          if (ext === "docx" || ext === "doc") {
            const result = await mammoth.convertToHtml({ buffer: contentBuffer });
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; } img { max-width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; margin: 10px 0; } table, th, td { border: 1px solid #ddd; } th, td { padding: 8px; text-align: left; } th { background-color: #f2f2f2; }</style></head><body>${result.value || "<p>文档内容为空</p>"}</body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
          if (ext === "xlsx" || ext === "xls" || ext === "csv") {
            const workbook = xlsx.read(contentBuffer, { type: "buffer", raw: true, cellDates: true, WTF: false });
            const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
            let tabsHtml = "";
            let contentHtml = "";
            if (sheetNames.length === 0) {
              tabsHtml = `<button class="tab-button active" onclick="showSheet(0)">Sheet1</button>`;
              contentHtml = `<div class="sheet-content active" id="sheet-0"><div style="min-height: 120px;"></div></div>`;
            } else {
              sheetNames.forEach((sheetName, index) => {
                const worksheet = workbook.Sheets && workbook.Sheets[sheetName] ? workbook.Sheets[sheetName] : null;
                const escapedSheetName = String(sheetName || "未命名工作表").replace(/[&<>"']/g, (char) => (
                  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
                ));
                const sheetHtml = worksheet && worksheet["!ref"]
                  ? xlsx.utils.sheet_to_html(worksheet)
                  : "<div style=\"min-height: 120px;\"></div>";
                tabsHtml += `<button class="tab-button ${index === 0 ? "active" : ""}" onclick="showSheet(${index})">${escapedSheetName}</button>`;
                contentHtml += `<div class="sheet-content ${index === 0 ? "active" : ""}" id="sheet-${index}">${sheetHtml}</div>`;
              });
            }
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { font-family: Arial, sans-serif; margin: 0; padding: 20px; } .tabs { border-bottom: 1px solid #ccc; margin-bottom: 20px; } .tab-button { background: #f1f1f1; border: none; padding: 10px 20px; cursor: pointer; margin-right: 5px; border-top-left-radius: 5px; border-top-right-radius: 5px; } .tab-button.active { background: #007cba; color: white; } .sheet-content { display: none; overflow: auto; } .sheet-content.active { display: block; } table { border-collapse: collapse; width: 100%; font-size: 12px; } td, th { border: 1px solid #ddd; padding: 4px 8px; text-align: left; white-space: nowrap; } th { background-color: #f2f2f2; font-weight: bold; }</style><script>function showSheet(index) { const sheets = document.querySelectorAll(".sheet-content"); const buttons = document.querySelectorAll(".tab-button"); sheets.forEach((sheet) => sheet.classList.remove("active")); buttons.forEach((button) => button.classList.remove("active")); const target = document.getElementById("sheet-" + index); if (target) target.classList.add("active"); if (buttons[index]) buttons[index].classList.add("active"); }</script></head><body><div class="tabs">${tabsHtml}</div><div class="content">${contentHtml}</div></body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
          res.status(400).send("不支持的办公文档格式预览");
          return;
        } catch (err) {
          res.status(500).send("文档解析失败: " + (err && err.message ? err.message : "未知错误"));
          return;
        }
      }
      
      // 默认的流式传输模式
      const mimeType = inferMimeTypeByFileName(fileName) || "application/octet-stream";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader("Content-Length", contentBuffer.length);
      res.send(contentBuffer);
      return;
    } catch (error) {
      res.status(500).json({ message: error && error.message ? error.message : "读取文件失败" });
    }
  });

  app.post("/api/files/:id/zip/extract", authRequired, requireFilePermission("upload"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    const targetFolderIdRaw = req.body && req.body.targetFolderId !== undefined ? normalizeFolderId(req.body.targetFolderId) : undefined;
    const targetPathRaw = req.body && req.body.targetPath !== undefined ? String(req.body.targetPath || "") : "";
    const targetPath = normalizeRelativePath(targetPathRaw);
    if (!fileId) {
      res.status(400).json({ message: "文件ID不合法" });
      return;
    }
    if (targetFolderIdRaw === undefined && req.body && req.body.targetFolderId !== undefined) {
      res.status(400).json({ message: "目标目录参数不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT original_name AS originalName, storage_name AS storageName, mime_type AS mimeType FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const fileRow = rows[0];
      const archiveType = detectArchiveType(fileRow.originalName, fileRow.mimeType);
      if (!archiveType) {
        res.status(400).json({ message: "仅支持常见压缩包类型" });
        return;
      }
      if (!ARCHIVE_SUPPORTED_TYPE_SET.has(archiveType)) {
        res.status(400).json({ message: "该压缩类型暂不支持解压" });
        return;
      }
      const filePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ message: "压缩包已丢失" });
        return;
      }
      let targetFolderId = targetFolderIdRaw;
      if (targetFolderId === undefined && !targetPath) {
        res.status(400).json({ message: "请指定解压目录" });
        return;
      }
      if (targetFolderId !== undefined) {
        const owned = await checkFolderOwnership(req.user.userId, targetFolderId, spaceType);
        if (!owned) {
          res.status(404).json({ message: "目标目录不存在" });
          return;
        }
      } else {
        targetFolderId = await resolveFolderByRelativeDir(req.user.userId, null, targetPath, new Map(), spaceType);
      }
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jockcloud-unzip-"));
      const extractDir = path.join(tempDir, "extract");
      try {
        await extractArchiveToDirectory(filePath, archiveType, extractDir);
        const files = [];
        const folderSet = new Set();
        const scan = (currentDir, baseDir) => {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = normalizeRelativePath(path.relative(baseDir, fullPath));
            if (!relativePath) continue;
            if (entry.isDirectory()) {
              folderSet.add(relativePath);
              scan(fullPath, baseDir);
              continue;
            }
            if (!entry.isFile()) continue;
            const segments = relativePath.split("/").slice(0, -1);
            if (segments.length > 0) {
              let cursor = "";
              for (const segment of segments) {
                cursor = cursor ? `${cursor}/${segment}` : segment;
                folderSet.add(cursor);
              }
            }
            const stat = fs.statSync(fullPath);
            files.push({ sourcePath: fullPath, relativePath, size: Math.max(0, Number(stat.size || 0)) });
          }
        };
        if (fs.existsSync(extractDir)) scan(extractDir, extractDir);
        if (files.length === 0 && folderSet.size === 0) {
          res.json({ message: "压缩包内没有可解压文件", total: 0 });
          return;
        }
        const [quotaRows] = await pool.query("SELECT quota_bytes AS quota FROM users WHERE id = ? LIMIT 1", [req.user.userId]);
        const quota = quotaRows.length > 0 ? Number(quotaRows[0].quota) : -1;
        const incomingSize = files.reduce((total, item) => total + item.size, 0);
        if (quota !== -1) {
          const [usageRows] = await pool.query(
            "SELECT IFNULL(SUM(size), 0) AS totalSize FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL",
            [req.user.userId, spaceType]
          );
          const usedSize = usageRows.length > 0 ? Number(usageRows[0].totalSize || 0) : 0;
          if (usedSize + incomingSize > quota) {
            res.status(413).json({ message: "超出空间配额，无法解压" });
            return;
          }
        }
        let uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
        try {
          const settings = await readSettings();
          uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(settings);
        } catch (error) {}
        const folderCache = new Map();
        const folderPaths = Array.from(folderSet).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b, "zh-CN"));
        let createdFolderCount = 0;
        for (const folderPath of folderPaths) {
          const normalizedFolderPath = normalizeRelativePath(folderPath);
          if (!normalizedFolderPath) continue;
          await resolveFolderByRelativeDir(req.user.userId, targetFolderId, normalizedFolderPath, folderCache, spaceType);
          createdFolderCount += 1;
        }
        let importedCount = 0;
        for (const item of files) {
          const relativePath = normalizeRelativePath(item.relativePath);
          if (!relativePath) continue;
          const fileName = safeFileName(relativePath.split("/").pop() || "file");
          if (!fileName) continue;
          const targetDir = getUploadStorageDir(req.user);
          const storageDir = path.join(resolveStorageRootDir(spaceType), targetDir);
          fs.mkdirSync(storageDir, { recursive: true });
          const storageBaseName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${fileName}`;
          const targetPathOnDisk = path.join(storageDir, storageBaseName);
          fs.copyFileSync(item.sourcePath, targetPathOnDisk);
          const storageName = resolveStorageNameFromPath(targetPathOnDisk, storageBaseName, resolveStorageRootDir(spaceType));
          const entryFolderId = await resolveFolderByRelativeDir(req.user.userId, targetFolderId, relativePath.split("/").slice(0, -1).join("/"), folderCache, spaceType);
          const mimeType = inferMimeTypeByFileName(fileName, "application/octet-stream");
          const fileCategory = normalizeFileCategoryKey(resolveStoredFileCategory(fileName, mimeType, uploadCategoryRuntimeOptions));
          const thumbnailStorageName = fileCategory === "image" ? writeExtractedThumbnailFromSource(item.sourcePath, storageName, mimeType, spaceType) : "";
          await pool.query(
            "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [req.user.userId, spaceType, entryFolderId, fileName, storageName, thumbnailStorageName || null, fileCategory, item.size, mimeType]
          );
          importedCount += 1;
        }
        const totalImported = importedCount + createdFolderCount;
        res.json({ message: `解压完成，共导入 ${importedCount} 个文件、${createdFolderCount} 个目录`, total: totalImported });
      } finally {
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
      }
    } catch (error) {
      res.status(500).json({ message: error && error.message ? error.message : "解压失败" });
    }
  });

  app.get("/api/download/:id", authRequired, requireFilePermission("download"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    if (!fileId) {
      res.status(400).json({ message: "文件 ID 不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT id, original_name AS originalName, storage_name AS storageName, size, folder_id AS folderId, file_category AS fileCategory FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const filePath = resolveAbsoluteStoragePath(rows[0].storageName, spaceType);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ message: "文件已丢失" });
        return;
      }
      
      // 记录文件下载操作
      await logFileOperation(pool, {
        operationType: 'download',
        fileId: rows[0].id,
        folderId: rows[0].folderId,
        fileName: rows[0].originalName,
        fileSize: rows[0].size,
        fileCategory: rows[0].fileCategory,
        userId: req.user.userId,
        ip: req.ip
      });
      
      const settings = await readSettings();
      const speedLimitKb = await getUserDownloadSpeedLimit(req.user.userId, settings);
      
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].originalName)}`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', rows[0].size);
      
      const readStream = fs.createReadStream(filePath);
      createSpeedLimitedStream(readStream, res, speedLimitKb);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/download/batch", authRequired, requireFilePermission("download"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const rawEntries = Array.isArray(req.body && req.body.entries) ? req.body.entries : [];
    const normalizedEntries = [];
    const dedupSet = new Set();
    for (const rawEntry of rawEntries) {
      const type = rawEntry && rawEntry.type === "folder" ? "folder" : (rawEntry && rawEntry.type === "file" ? "file" : "");
      const id = normalizeFolderId(rawEntry && rawEntry.id);
      if (!type || !id) continue;
      const key = `${type}:${id}`;
      if (dedupSet.has(key)) continue;
      dedupSet.add(key);
      normalizedEntries.push({ type, id });
    }
    if (!normalizedEntries.length) {
      res.status(400).json({ message: "请选择要下载的文件或目录" });
      return;
    }
    const selectedFileIds = normalizedEntries.filter((item) => item.type === "file").map((item) => item.id);
    const selectedFolderIds = normalizedEntries.filter((item) => item.type === "folder").map((item) => item.id);
    try {
      const selectedFileRows = [];
      const selectedFolderRows = [];
      if (selectedFileIds.length > 0) {
        const clause = selectedFileIds.map(() => "?").join(", ");
        const [fileRows] = await pool.query(
          `SELECT id, original_name AS originalName, storage_name AS storageName
           FROM files
           WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${clause})`,
          [req.user.userId, spaceType, ...selectedFileIds]
        );
        selectedFileRows.push(...fileRows);
      }
      if (selectedFolderIds.length > 0) {
        const clause = selectedFolderIds.map(() => "?").join(", ");
        const [folderRows] = await pool.query(
          `SELECT id, name, parent_id AS parentId
           FROM folders
           WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${clause})`,
          [req.user.userId, spaceType, ...selectedFolderIds]
        );
        selectedFolderRows.push(...folderRows);
      }
      if (selectedFileRows.length === 0 && selectedFolderRows.length === 0) {
        res.status(404).json({ message: "未找到可下载项" });
        return;
      }
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jockcloud-batch-"));
      const sourceRoot = path.join(tempDir, "source");
      const archiveName = `批量下载-${Date.now()}.zip`;
      const archivePath = path.join(tempDir, archiveName);
      const topLevelNameSet = new Set();
      try {
        fs.mkdirSync(sourceRoot, { recursive: true });
        let copiedCount = 0;
        for (const fileRow of selectedFileRows) {
          const sourcePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
          if (!sourcePath || !fs.existsSync(sourcePath)) continue;
          const outputName = resolveUniqueName(fileRow.originalName || `文件-${fileRow.id}`, topLevelNameSet);
          fs.copyFileSync(sourcePath, path.join(sourceRoot, outputName));
          copiedCount += 1;
        }
        for (const selectedFolder of selectedFolderRows) {
          const rootFolderName = resolveUniqueName(selectedFolder.name || `目录-${selectedFolder.id}`, topLevelNameSet);
          const folderRoot = path.join(sourceRoot, rootFolderName);
          fs.mkdirSync(folderRoot, { recursive: true });
          const folderIds = await collectDescendantFolderIds(req.user.userId, Number(selectedFolder.id), spaceType);
          if (!folderIds.length) continue;
          const folderClause = folderIds.map(() => "?").join(", ");
          const [folderRows] = await pool.query(
            `SELECT id, name, parent_id AS parentId
             FROM folders
             WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${folderClause})`,
            [req.user.userId, spaceType, ...folderIds]
          );
          const [fileRows] = await pool.query(
            `SELECT id, folder_id AS folderId, original_name AS originalName, storage_name AS storageName
             FROM files
             WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND folder_id IN (${folderClause})`,
            [req.user.userId, spaceType, ...folderIds]
          );
          const folderMap = new Map();
          folderRows.forEach((item) => {
            folderMap.set(Number(item.id), {
              id: Number(item.id),
              name: safeFileName(item.name || "未命名目录"),
              parentId: item.parentId === null || item.parentId === undefined ? null : Number(item.parentId)
            });
          });
          const resolveFolderRelativePath = (currentId) => {
            const paths = [];
            let cursor = folderMap.get(Number(currentId)) || null;
            const guard = new Set();
            while (cursor && Number(cursor.id) !== Number(selectedFolder.id)) {
              if (guard.has(cursor.id)) break;
              guard.add(cursor.id);
              paths.unshift(cursor.name || "未命名目录");
              cursor = cursor.parentId ? folderMap.get(Number(cursor.parentId)) : null;
            }
            return paths.join(path.sep);
          };
          for (const folderRow of folderRows) {
            const relativePath = resolveFolderRelativePath(folderRow.id);
            const targetPath = relativePath ? path.join(folderRoot, relativePath) : folderRoot;
            fs.mkdirSync(targetPath, { recursive: true });
          }
          for (const fileRow of fileRows) {
            const relativePath = resolveFolderRelativePath(fileRow.folderId);
            const targetDir = relativePath ? path.join(folderRoot, relativePath) : folderRoot;
            const sourcePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
            if (!sourcePath || !fs.existsSync(sourcePath)) continue;
            fs.mkdirSync(targetDir, { recursive: true });
            const targetPath = path.join(targetDir, safeFileName(fileRow.originalName || `文件-${fileRow.id}`));
            fs.copyFileSync(sourcePath, targetPath);
            copiedCount += 1;
          }
        }
        if (copiedCount === 0) fs.writeFileSync(path.join(sourceRoot, "空目录.txt"), "");
        await runCompressArchive(sourceRoot, archivePath);
        if (!fs.existsSync(archivePath)) {
          res.status(500).json({ message: "打包失败" });
          return;
        }
        
        const settings = await readSettings();
        const speedLimitKb = await getUserDownloadSpeedLimit(req.user.userId, settings);
        
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
      } catch (error) {
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        res.status(500).json({ message: error && error.message ? error.message : "批量打包失败" });
      }
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/archive/batch", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    if (!hasFilePermission(req, "download") || !hasFilePermission(req, "upload")) {
      res.status(403).json({ message: "无权执行该操作" });
      return;
    }
    const rawEntries = Array.isArray(req.body && req.body.entries) ? req.body.entries : [];
    const rawParentId = req.body ? req.body.parentId : undefined;
    const rawArchiveName = req.body && req.body.name !== undefined ? req.body.name : "";
    const normalizedEntries = [];
    const dedupSet = new Set();
    for (const rawEntry of rawEntries) {
      const type = rawEntry && rawEntry.type === "folder" ? "folder" : (rawEntry && rawEntry.type === "file" ? "file" : "");
      const id = normalizeFolderId(rawEntry && rawEntry.id);
      if (!type || !id) continue;
      const key = `${type}:${id}`;
      if (dedupSet.has(key)) continue;
      dedupSet.add(key);
      normalizedEntries.push({ type, id });
    }
    if (!normalizedEntries.length) {
      res.status(400).json({ message: "请选择要压缩的文件或目录" });
      return;
    }
    let targetFolderId = null;
    if (!(rawParentId === undefined || rawParentId === null || String(rawParentId) === "null")) {
      targetFolderId = normalizeFolderId(rawParentId);
      if (!targetFolderId) {
        res.status(400).json({ message: "目标目录参数不合法" });
        return;
      }
    }
    try {
      if (targetFolderId !== null) {
        const owned = await checkFolderOwnership(req.user.userId, targetFolderId, spaceType);
        if (!owned) {
          res.status(404).json({ message: "目标目录不存在" });
          return;
        }
      }
      const selectedFileIds = normalizedEntries.filter((item) => item.type === "file").map((item) => item.id);
      const selectedFolderIds = normalizedEntries.filter((item) => item.type === "folder").map((item) => item.id);
      const selectedFileRows = [];
      const selectedFolderRows = [];
      if (selectedFileIds.length > 0) {
        const clause = selectedFileIds.map(() => "?").join(", ");
        const [fileRows] = await pool.query(
          `SELECT id, original_name AS originalName, storage_name AS storageName
           FROM files
           WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${clause})`,
          [req.user.userId, spaceType, ...selectedFileIds]
        );
        selectedFileRows.push(...fileRows);
      }
      if (selectedFolderIds.length > 0) {
        const clause = selectedFolderIds.map(() => "?").join(", ");
        const [folderRows] = await pool.query(
          `SELECT id, name, parent_id AS parentId
           FROM folders
           WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${clause})`,
          [req.user.userId, spaceType, ...selectedFolderIds]
        );
        selectedFolderRows.push(...folderRows);
      }
      if (selectedFileRows.length === 0 && selectedFolderRows.length === 0) {
        res.status(404).json({ message: "未找到可压缩项" });
        return;
      }
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jockcloud-archive-"));
      const sourceRoot = path.join(tempDir, "source");
      const archivePath = path.join(tempDir, "archive.zip");
      const topLevelNameSet = new Set();
      try {
        fs.mkdirSync(sourceRoot, { recursive: true });
        let copiedCount = 0;
        for (const fileRow of selectedFileRows) {
          const sourcePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
          if (!sourcePath || !fs.existsSync(sourcePath)) continue;
          const outputName = resolveUniqueName(fileRow.originalName || `文件-${fileRow.id}`, topLevelNameSet);
          fs.copyFileSync(sourcePath, path.join(sourceRoot, outputName));
          copiedCount += 1;
        }
        for (const selectedFolder of selectedFolderRows) {
          const rootFolderName = resolveUniqueName(selectedFolder.name || `目录-${selectedFolder.id}`, topLevelNameSet);
          const folderRoot = path.join(sourceRoot, rootFolderName);
          fs.mkdirSync(folderRoot, { recursive: true });
          const folderIds = await collectDescendantFolderIds(req.user.userId, Number(selectedFolder.id), spaceType);
          if (!folderIds.length) continue;
          const folderClause = folderIds.map(() => "?").join(", ");
          const [folderRows] = await pool.query(
            `SELECT id, name, parent_id AS parentId
             FROM folders
             WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${folderClause})`,
            [req.user.userId, spaceType, ...folderIds]
          );
          const [fileRows] = await pool.query(
            `SELECT id, folder_id AS folderId, original_name AS originalName, storage_name AS storageName
             FROM files
             WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND folder_id IN (${folderClause})`,
            [req.user.userId, spaceType, ...folderIds]
          );
          const folderMap = new Map();
          folderRows.forEach((item) => {
            folderMap.set(Number(item.id), {
              id: Number(item.id),
              name: safeFileName(item.name || "未命名目录"),
              parentId: item.parentId === null || item.parentId === undefined ? null : Number(item.parentId)
            });
          });
          const resolveFolderRelativePath = (currentId) => {
            const paths = [];
            let cursor = folderMap.get(Number(currentId)) || null;
            const guard = new Set();
            while (cursor && Number(cursor.id) !== Number(selectedFolder.id)) {
              if (guard.has(cursor.id)) break;
              guard.add(cursor.id);
              paths.unshift(cursor.name || "未命名目录");
              cursor = cursor.parentId ? folderMap.get(Number(cursor.parentId)) : null;
            }
            return paths.join(path.sep);
          };
          for (const folderRow of folderRows) {
            const relativePath = resolveFolderRelativePath(folderRow.id);
            const targetPath = relativePath ? path.join(folderRoot, relativePath) : folderRoot;
            fs.mkdirSync(targetPath, { recursive: true });
          }
          for (const fileRow of fileRows) {
            const relativePath = resolveFolderRelativePath(fileRow.folderId);
            const targetDir = relativePath ? path.join(folderRoot, relativePath) : folderRoot;
            const sourcePath = resolveAbsoluteStoragePath(fileRow.storageName, spaceType);
            if (!sourcePath || !fs.existsSync(sourcePath)) continue;
            fs.mkdirSync(targetDir, { recursive: true });
            const targetPath = path.join(targetDir, safeFileName(fileRow.originalName || `文件-${fileRow.id}`));
            fs.copyFileSync(sourcePath, targetPath);
            copiedCount += 1;
          }
        }
        if (copiedCount === 0) fs.writeFileSync(path.join(sourceRoot, "空目录.txt"), "");
        await runCompressArchive(sourceRoot, archivePath);
        if (!fs.existsSync(archivePath)) {
          res.status(500).json({ message: "压缩失败" });
          return;
        }
        const requestedName = safeFileName(String(rawArchiveName || "").trim()) || "新建压缩包";
        const normalizedArchiveName = requestedName.toLowerCase().endsWith(".zip") ? requestedName : `${requestedName}.zip`;
        const [nameRows] = await pool.query(
          "SELECT original_name AS originalName FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND deleted_at IS NULL",
          [req.user.userId, spaceType, targetFolderId]
        );
        const usedNameSet = new Set(nameRows.map((item) => safeFileName(item.originalName || "")).filter(Boolean));
        const finalArchiveName = resolveUniqueName(normalizedArchiveName, usedNameSet);
        const targetDir = getUploadStorageDir(req.user);
        const storageDir = path.join(resolveStorageRootDir(spaceType), targetDir);
        fs.mkdirSync(storageDir, { recursive: true });
        const storageBaseName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeFileName(finalArchiveName)}`;
        const targetPathOnDisk = path.join(storageDir, storageBaseName);
        fs.copyFileSync(archivePath, targetPathOnDisk);
        const stat = fs.statSync(targetPathOnDisk);
        const storageName = resolveStorageNameFromPath(targetPathOnDisk, storageBaseName, resolveStorageRootDir(spaceType));
        await pool.query(
          "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [req.user.userId, spaceType, targetFolderId, finalArchiveName, storageName, null, "archive", Math.max(0, Number(stat.size || 0)), "application/zip"]
        );
        res.json({ message: `压缩完成，已生成 ${finalArchiveName}` });
      } catch (error) {
        res.status(500).json({ message: error && error.message ? error.message : "批量压缩失败" });
      } finally {
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
      }
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/download/folder/:id", authRequired, requireFilePermission("download"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.params.id);
    if (!folderId) {
      res.status(400).json({ message: "目录ID不合法" });
      return;
    }
    try {
      const [targetRows] = await pool.query(
        "SELECT id, name, parent_id AS parentId FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [folderId, req.user.userId, spaceType]
      );
      if (!targetRows.length) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const folderIds = await collectDescendantFolderIds(req.user.userId, folderId, spaceType);
      if (!folderIds.length) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const folderClause = folderIds.map(() => "?").join(", ");
      const [folderRows] = await pool.query(
        `SELECT id, name, parent_id AS parentId
         FROM folders
         WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${folderClause})`,
        [req.user.userId, spaceType, ...folderIds]
      );
      const [fileRows] = await pool.query(
        `SELECT id, folder_id AS folderId, original_name AS originalName, storage_name AS storageName
         FROM files
         WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND folder_id IN (${folderClause})`,
        [req.user.userId, spaceType, ...folderIds]
      );
      const folderMap = new Map();
      folderRows.forEach((item) => {
        folderMap.set(Number(item.id), {
          id: Number(item.id),
          name: safeFileName(item.name || "未命名目录"),
          parentId: item.parentId === null || item.parentId === undefined ? null : Number(item.parentId)
        });
      });
      const targetFolder = folderMap.get(Number(folderId));
      if (!targetFolder) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jockcloud-folder-"));
      const sourceRoot = path.join(tempDir, "source");
      const archiveName = `${safeFileName(targetFolder.name || "folder") || "folder"}.zip`;
      const archivePath = path.join(tempDir, archiveName);
      const resolveFolderRelativePath = (currentId) => {
        const paths = [];
        let cursor = folderMap.get(Number(currentId)) || null;
        const guard = new Set();
        while (cursor && Number(cursor.id) !== Number(folderId)) {
          if (guard.has(cursor.id)) break;
          guard.add(cursor.id);
          paths.unshift(cursor.name || "未命名目录");
          cursor = cursor.parentId ? folderMap.get(Number(cursor.parentId)) : null;
        }
        return paths.join(path.sep);
      };
      try {
        fs.mkdirSync(sourceRoot, { recursive: true });
        for (const folderRow of folderRows) {
          const relativePath = resolveFolderRelativePath(folderRow.id);
          const targetPath = relativePath ? path.join(sourceRoot, relativePath) : sourceRoot;
          fs.mkdirSync(targetPath, { recursive: true });
        }
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
        if (copiedCount === 0) fs.writeFileSync(path.join(sourceRoot, "空目录.txt"), "");
        await runCompressArchive(sourceRoot, archivePath);
        if (!fs.existsSync(archivePath)) {
          res.status(500).json({ message: "打包失败" });
          return;
        }
        
        const settings = await readSettings();
        const speedLimitKb = await getUserDownloadSpeedLimit(req.user.userId, settings);
        
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
      } catch (error) {
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        res.status(500).json({ message: error && error.message ? error.message : "目录打包失败" });
      }
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
