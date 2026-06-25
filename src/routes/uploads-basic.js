module.exports = (app, deps) => {
  const {
    authRequired,
    loadUserGroupContextMap,
    resolveGroupQuota,
    requireFilePermission,
    chunkUploadSingle,
    uploadArray,
    pool,
    sendDbError,
    resolveStorageSpaceTypeByRequest,
    normalizeChunkClientTaskId,
    normalizeFolderId,
    normalizeRelativePath,
    safeFileName,
    normalizeUploadName,
    MAX_UPLOAD_CHUNK_SIZE_BYTES,
    checkFolderOwnership,
    getUploadRuntimeOptions,
    DEFAULT_SETTINGS,
    getUploadCategoryRuntimeOptions,
    readSettings,
    getUploadLimitError,
    getUploadFormatError,
    findChunkSessionByFile,
    getChunkMarksDir,
    fs,
    removeChunkSessionsByClientTaskId,
    crypto,
    getChunkSessionDir,
    getChunkDataPath,
    writeChunkMeta,
    removeChunkSession,
    normalizeChunkUploadId,
    readChunkMeta,
    normalizeStorageSpaceType,
    path,
    getUploadStorageDir,
    resolveStorageRootDir,
    pickWritableStorageRoot,
    getStorageReserveErrorMessage,
    resolveStorageNameFromPath,
    resolveUploadCategory,
    writeThumbnailFromDataUrl,
    normalizeFileCategoryKey,
    resolveStoredFileCategory,
    resolveFolderByRelativePath,
    hasEntryNameConflict,
    hasFilePermission,
    resolveUniqueName,
    logFileOperation,
    generateVideoThumbnail
  } = deps;

  const resolveEffectiveQuotaForUser = async (userId) => {
    const groupContextMap = await loadUserGroupContextMap([userId]);
    const groupContext = groupContextMap.get(Number(userId)) || { groupQuotas: [] };
    return resolveGroupQuota(undefined, groupContext.groupQuotas);
  };

  const getFileExtension = (name) => {
    const normalizedName = String(name || "").trim();
    const dotIndex = normalizedName.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === normalizedName.length - 1) return "";
    return normalizedName.slice(dotIndex + 1).toLowerCase();
  };

  app.post("/api/upload/chunk/init", authRequired, requireFilePermission("upload"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const clientTaskId = normalizeChunkClientTaskId(req.body && req.body.clientTaskId);
    const folderId = normalizeFolderId(req.body && req.body.folderId);
    const relativePath = normalizeRelativePath(req.body && req.body.relativePath);
    const fallbackName = relativePath ? String(relativePath).split("/").pop() : "";
    const rawFileName = String(req.body && req.body.fileName ? req.body.fileName : fallbackName);
    const fileName = safeFileName(normalizeUploadName(rawFileName)).trim();
    const fileSize = Math.floor(Number(req.body && req.body.fileSize));
    const mimeType = String(req.body && req.body.mimeType ? req.body.mimeType : "application/octet-stream").trim().slice(0, 255) || "application/octet-stream";
    const totalChunks = Math.floor(Number(req.body && req.body.totalChunks));
    const chunkSize = Math.floor(Number(req.body && req.body.chunkSize));
    if (folderId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    if (!fileName) {
      res.status(400).json({ message: "文件名不合法" });
      return;
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      res.status(400).json({ message: "文件大小不合法" });
      return;
    }
    if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
      res.status(400).json({ message: "分片总数不合法" });
      return;
    }
    if (!Number.isFinite(chunkSize) || chunkSize <= 0 || chunkSize > MAX_UPLOAD_CHUNK_SIZE_BYTES) {
      res.status(400).json({ message: `分片大小不合法，单片不能超过 ${Math.floor(MAX_UPLOAD_CHUNK_SIZE_BYTES / 1024 / 1024)}MB` });
      return;
    }
    if (!clientTaskId) {
      res.status(400).json({ message: "上传任务ID不合法" });
      return;
    }
    if (Math.ceil(fileSize / chunkSize) !== totalChunks) {
      res.status(400).json({ message: "分片参数不匹配" });
      return;
    }
    let uploadId = "";
    try {
      const owned = await checkFolderOwnership(req.user.userId, folderId, spaceType);
      if (!owned) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const groupMaxSizeMb = req.user ? req.user.groupUploadMaxSizeMb : undefined;
      const groupMaxFileCount = req.user ? req.user.groupUploadMaxFileCount : undefined;
      const runtimeGroupOptions = {};
      if (groupMaxSizeMb !== undefined) runtimeGroupOptions.groupMaxSizeMb = groupMaxSizeMb;
      if (groupMaxFileCount !== undefined) runtimeGroupOptions.groupMaxFileCount = groupMaxFileCount;
      let uploadRuntimeOptions = getUploadRuntimeOptions(DEFAULT_SETTINGS, runtimeGroupOptions);
      let uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
      try {
        const settings = await readSettings();
        uploadRuntimeOptions = getUploadRuntimeOptions(settings, runtimeGroupOptions);
        uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(settings);
      } catch (e) {}
      if (fileSize <= Number(uploadRuntimeOptions.chunkUploadThresholdBytes || 0)) {
        const thresholdMb = Math.max(1, Math.floor(Number(uploadRuntimeOptions.chunkUploadThresholdMb || DEFAULT_SETTINGS.system.chunkUploadThresholdMb)));
        res.status(400).json({ message: `仅支持大于${thresholdMb}MB文件走分片上传` });
        return;
      }
      const uploadBatchTotalRaw = Math.floor(Number(req.body && req.body.uploadBatchTotal));
      const uploadBatchTotal = Number.isFinite(uploadBatchTotalRaw) && uploadBatchTotalRaw > 0 ? uploadBatchTotalRaw : 1;
      if (uploadRuntimeOptions.maxUploadFileCount > 0 && uploadBatchTotal > uploadRuntimeOptions.maxUploadFileCount) {
        res.status(413).json({ message: `单次最多上传 ${uploadRuntimeOptions.maxUploadFileCount} 个文件` });
        return;
      }
      const limitError = getUploadLimitError({ size: fileSize, originalname: fileName, mimetype: mimeType }, uploadRuntimeOptions);
      if (limitError) {
        res.status(413).json({ message: limitError });
        return;
      }
      const formatError = getUploadFormatError({ originalname: fileName, mimetype: mimeType }, uploadCategoryRuntimeOptions);
      if (formatError) {
        res.status(400).json({ message: formatError });
        return;
      }
      const quota = await resolveEffectiveQuotaForUser(req.user.userId);
      if (quota !== -1) {
        const [usageRows] = await pool.query(
          "SELECT IFNULL(SUM(size), 0) AS totalSize FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL",
          [req.user.userId, spaceType]
        );
        const usedSize = usageRows.length > 0 ? Number(usageRows[0].totalSize || 0) : 0;
        if (usedSize + fileSize > quota) {
          res.status(413).json({ message: "超出空间配额，无法上传" });
          return;
        }
      }
      if (req.body && req.body.resume) {
        const existingSession = findChunkSessionByFile({ userId: req.user.userId, spaceType, fileName, fileSize });
        if (existingSession) {
          uploadId = existingSession.uploadId;
          const marksDir = getChunkMarksDir(uploadId);
          let uploadedChunks = [];
          if (fs.existsSync(marksDir)) {
            uploadedChunks = fs.readdirSync(marksDir)
              .map((name) => {
                const matched = /^(\d+)\.ok$/.exec(name);
                return matched ? Number(matched[1]) : -1;
              })
              .filter((index) => Number.isInteger(index) && index >= 0);
          }
          res.json({ uploadId, chunkSize, totalChunks, uploadedChunks });
          return;
        }
      }

      removeChunkSessionsByClientTaskId({ userId: req.user.userId, spaceType, clientTaskId });
      uploadId = crypto.randomBytes(16).toString("hex");
      const sessionDir = getChunkSessionDir(uploadId);
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.mkdirSync(getChunkMarksDir(uploadId), { recursive: true });
      fs.writeFileSync(getChunkDataPath(uploadId), Buffer.alloc(0));
      writeChunkMeta(uploadId, {
        uploadId,
        userId: req.user.userId,
        spaceType,
        folderId,
        fileName,
        fileSize,
        mimeType,
        relativePath,
        clientTaskId,
        totalChunks,
        chunkSize,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      res.json({ uploadId, chunkSize, totalChunks });
    } catch (error) {
      if (uploadId) removeChunkSession(uploadId);
      sendDbError(res, error);
    }
  });

  app.post("/api/upload/chunk/:uploadId", authRequired, requireFilePermission("upload"), chunkUploadSingle("chunk"), async (req, res) => {
    const uploadId = normalizeChunkUploadId(req.params.uploadId);
    if (!uploadId) {
      res.status(400).json({ message: "上传会话ID不合法" });
      return;
    }
    const chunk = req.file;
    const chunkIndex = Math.floor(Number(req.body && req.body.chunkIndex));
    if (!chunk || !chunk.buffer) {
      res.status(400).json({ message: "未收到分片数据" });
      return;
    }
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
      res.status(400).json({ message: "分片序号不合法" });
      return;
    }
    const meta = readChunkMeta(uploadId);
    if (!meta) {
      res.status(404).json({ message: "上传会话不存在或已失效" });
      return;
    }
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    if (Number(meta.userId) !== Number(req.user.userId) || normalizeStorageSpaceType(meta.spaceType) !== spaceType) {
      res.status(403).json({ message: "无权操作该上传会话" });
      return;
    }
    try {
      if (chunkIndex >= Number(meta.totalChunks || 0)) {
        removeChunkSession(uploadId);
        res.status(400).json({ message: "分片序号超出范围" });
        return;
      }
      const expectedSize = chunkIndex === Number(meta.totalChunks) - 1
        ? Number(meta.fileSize) - chunkIndex * Number(meta.chunkSize)
        : Number(meta.chunkSize);
      if (expectedSize <= 0 || chunk.buffer.length !== expectedSize) {
        removeChunkSession(uploadId);
        res.status(400).json({ message: "分片大小不匹配" });
        return;
      }
      const dataPath = getChunkDataPath(uploadId);
      if (!fs.existsSync(dataPath)) {
        removeChunkSession(uploadId);
        res.status(404).json({ message: "上传会话不存在或已失效" });
        return;
      }
      let fd;
      try {
        fd = fs.openSync(dataPath, "r+");
        fs.writeSync(fd, chunk.buffer, 0, chunk.buffer.length, chunkIndex * Number(meta.chunkSize));
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
      const markPath = path.join(getChunkMarksDir(uploadId), `${chunkIndex}.ok`);
      if (!fs.existsSync(markPath)) fs.writeFileSync(markPath, "");
      meta.updatedAt = Date.now();
      writeChunkMeta(uploadId, meta);
      const markFiles = fs.readdirSync(getChunkMarksDir(uploadId)).filter((name) => /^\d+\.ok$/.test(name));
      res.json({ message: "分片上传成功", uploadedChunks: markFiles.length, totalChunks: Number(meta.totalChunks || 0) });
    } catch (error) {
      removeChunkSession(uploadId);
      sendDbError(res, error);
    }
  });

  app.delete("/api/upload/chunk/:uploadId", authRequired, requireFilePermission("upload"), async (req, res) => {
    const uploadId = normalizeChunkUploadId(req.params.uploadId);
    if (!uploadId) {
      res.status(400).json({ message: "上传会话ID不合法" });
      return;
    }
    const meta = readChunkMeta(uploadId);
    if (!meta) {
      res.json({ message: "上传会话已清理" });
      return;
    }
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    if (Number(meta.userId) !== Number(req.user.userId) || normalizeStorageSpaceType(meta.spaceType) !== spaceType) {
      res.status(403).json({ message: "无权操作该上传会话" });
      return;
    }
    removeChunkSession(uploadId);
    res.json({ message: "上传会话已清理" });
  });

  app.delete("/api/upload/chunk-task/:taskId", authRequired, requireFilePermission("upload"), async (req, res) => {
    const clientTaskId = normalizeChunkClientTaskId(req.params.taskId);
    if (!clientTaskId) {
      res.status(400).json({ message: "上传任务ID不合法" });
      return;
    }
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    removeChunkSessionsByClientTaskId({ userId: req.user.userId, spaceType, clientTaskId });
    res.json({ message: "上传会话已清理" });
  });

  app.post("/api/upload/chunk/:uploadId/complete", authRequired, requireFilePermission("upload"), async (req, res) => {
    const uploadId = normalizeChunkUploadId(req.params.uploadId);
    if (!uploadId) {
      res.status(400).json({ message: "上传会话ID不合法" });
      return;
    }
    const meta = readChunkMeta(uploadId);
    if (!meta) {
      res.status(404).json({ message: "上传会话不存在或已失效" });
      return;
    }
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    if (Number(meta.userId) !== Number(req.user.userId) || normalizeStorageSpaceType(meta.spaceType) !== spaceType) {
      res.status(403).json({ message: "无权操作该上传会话" });
      return;
    }
    const marksDir = getChunkMarksDir(uploadId);
    const totalChunks = Number(meta.totalChunks || 0);
    if (!fs.existsSync(marksDir)) {
      removeChunkSession(uploadId);
      res.status(400).json({ message: "分片上传未完成" });
      return;
    }
    const markSet = new Set(
      fs.readdirSync(marksDir)
        .map((name) => {
          const matched = /^(\d+)\.ok$/.exec(name);
          return matched ? Number(matched[1]) : -1;
        })
        .filter((index) => Number.isInteger(index) && index >= 0)
    );
    for (let i = 0; i < totalChunks; i += 1) {
      if (!markSet.has(i)) {
        removeChunkSession(uploadId);
        res.status(400).json({ message: "分片上传未完成" });
        return;
      }
    }
    const dataPath = getChunkDataPath(uploadId);
    const dataStats = fs.existsSync(dataPath) ? fs.statSync(dataPath) : null;
    
    // 检查是否有已合并的文件（冲突重试场景）
    const mergedFilePath = meta.mergedFilePath;
    const hasMergedFile = mergedFilePath && fs.existsSync(mergedFilePath);
    
    if (!hasMergedFile) {
      // 正常流程：检查分片是否完整
      if (!dataStats) {
        removeChunkSession(uploadId);
        res.status(400).json({ message: "分片文件不存在" });
        return;
      }
      if (!fs.existsSync(marksDir)) {
        removeChunkSession(uploadId);
        res.status(400).json({ message: "分片上传未完成" });
        return;
      }
      const markSet = new Set(
        fs.readdirSync(marksDir)
          .map((name) => {
            const matched = /^(\d+)\.ok$/.exec(name);
            return matched ? Number(matched[1]) : -1;
          })
          .filter((index) => Number.isInteger(index) && index >= 0)
      );
      for (let i = 0; i < totalChunks; i += 1) {
        if (!markSet.has(i)) {
          removeChunkSession(uploadId);
          res.status(400).json({ message: "分片上传未完成" });
          return;
        }
      }
      if (Number(dataStats.size || 0) !== Number(meta.fileSize || 0)) {
        removeChunkSession(uploadId);
        res.status(400).json({ message: "分片文件大小不匹配" });
        return;
      }
    }
    
    let finalFilePath = hasMergedFile ? mergedFilePath : "";
    try {
      const owned = await checkFolderOwnership(req.user.userId, meta.folderId, spaceType);
      if (!owned) {
        removeChunkSession(uploadId);
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const groupMaxSizeMb = req.user ? req.user.groupUploadMaxSizeMb : undefined;
      const groupMaxFileCount = req.user ? req.user.groupUploadMaxFileCount : undefined;
      const runtimeGroupOptions = {};
      if (groupMaxSizeMb !== undefined) runtimeGroupOptions.groupMaxSizeMb = groupMaxSizeMb;
      if (groupMaxFileCount !== undefined) runtimeGroupOptions.groupMaxFileCount = groupMaxFileCount;
      let uploadRuntimeOptions = getUploadRuntimeOptions(DEFAULT_SETTINGS, runtimeGroupOptions);
      let uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
      try {
        const settings = await readSettings();
        uploadRuntimeOptions = getUploadRuntimeOptions(settings, runtimeGroupOptions);
        uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(settings);
      } catch (e) {}
      const limitError = getUploadLimitError(
        { size: Number(meta.fileSize || 0), originalname: String(meta.fileName || ""), mimetype: String(meta.mimeType || "") },
        uploadRuntimeOptions
      );
      if (limitError) {
        removeChunkSession(uploadId);
        res.status(413).json({ message: limitError });
        return;
      }
      const formatError = getUploadFormatError({ originalname: meta.fileName, mimetype: meta.mimeType }, uploadCategoryRuntimeOptions);
      if (formatError) {
        removeChunkSession(uploadId);
        res.status(400).json({ message: formatError });
        return;
      }
      const quota = await resolveEffectiveQuotaForUser(req.user.userId);
      if (quota !== -1) {
        const [usageRows] = await pool.query(
          "SELECT IFNULL(SUM(size), 0) AS totalSize FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL",
          [req.user.userId, spaceType]
        );
        const usedSize = usageRows.length > 0 ? Number(usageRows[0].totalSize || 0) : 0;
        if (usedSize + Number(meta.fileSize || 0) > quota) {
          removeChunkSession(uploadId);
          res.status(413).json({ message: "超出空间配额，无法上传" });
          return;
        }
      }
      const targetRelativeDir = getUploadStorageDir(req.user);
      const selectedStorage = pickWritableStorageRoot(spaceType, Number(meta.fileSize || 0));
      if (!selectedStorage) {
        removeChunkSession(uploadId);
        res.status(507).json({ message: getStorageReserveErrorMessage() });
        return;
      }
      
      if (!hasMergedFile) {
        // 正常流程：合并分片
        const targetRootDir = selectedStorage.rootDir || resolveStorageRootDir(spaceType);
        const targetDir = path.join(targetRootDir, targetRelativeDir);
        fs.mkdirSync(targetDir, { recursive: true });
        const normalizedName = normalizeUploadName(meta.fileName || "file");
        const finalStorageName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeFileName(normalizedName)}`;
        finalFilePath = path.join(targetDir, finalStorageName);
        try {
          fs.renameSync(dataPath, finalFilePath);
        } catch (renameErr) {
          if (renameErr.code === "EXDEV") {
            fs.copyFileSync(dataPath, finalFilePath);
            fs.unlinkSync(dataPath);
          } else {
            throw renameErr;
          }
        }
      } else {
        // 冲突重试：直接使用已合并的文件
        finalFilePath = mergedFilePath;
      }
      const storageName = resolveStorageNameFromPath(finalFilePath, null, selectedStorage.rootDir || resolveStorageRootDir(spaceType), selectedStorage.diskId);
      const thumbnailDataUrl = String(req.body && req.body.thumbnailDataUrl ? req.body.thumbnailDataUrl : "");
      const resolvedFileCategory = resolveUploadCategory({ originalname: meta.fileName, mimetype: meta.mimeType }, uploadCategoryRuntimeOptions);
      const thumbnailStorageName = resolvedFileCategory === "image"
        ? writeThumbnailFromDataUrl(thumbnailDataUrl, storageName, spaceType)
        : "";
      const fileCategory = normalizeFileCategoryKey(resolveStoredFileCategory(meta.fileName, meta.mimeType, uploadCategoryRuntimeOptions));
      const folderCache = new Map();
      const targetFolderId = await resolveFolderByRelativePath(req.user.userId, meta.folderId, meta.relativePath, folderCache, spaceType);
      const finalOriginalName = safeFileName(meta.relativePath ? String(meta.relativePath).split("/").pop() : meta.fileName);
      
      // 计算文件MD5
      const fileMd5 = await new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        const stream = fs.createReadStream(finalFilePath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
      });
      
      // 检查是否存在相同MD5的文件（用于秒传，跨用户查找）
      const [existingMd5Files] = await pool.query(
        "SELECT id, original_name AS originalName, storage_name AS storageName, folder_id AS folderId FROM files WHERE md5 = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [fileMd5, spaceType]
      );
      
      const hasExistingFile = existingMd5Files.length > 0;
      const existingMd5File = hasExistingFile ? existingMd5Files[0] : null;
      
      // 处理上传策略
      const uploadStrategy = String(req.body && req.body.uploadStrategy ? req.body.uploadStrategy : "cancel").trim().toLowerCase();
      let actualOriginalName = finalOriginalName;
      let conflictResolved = false;
      let instantUpload = false;
      let instantFileId = null;
      const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
      
      const duplicated = await hasEntryNameConflict(req.user.userId, targetFolderId, finalOriginalName, undefined, spaceType);
      
      // 秒传逻辑：如果存在相同MD5的文件
      if (hasExistingFile) {
        if (!duplicated) {
          // 没有文件名冲突，可以秒传
          instantUpload = true;
          instantFileId = existingMd5File.id;
          // 删除刚移动的文件，复用已有文件
          try {
            fs.unlinkSync(finalFilePath);
          } catch (e) {}
        } else {
          // 有文件名冲突
          if (uploadStrategy === "cancel") {
            // 保留已合并的文件和分片会话，在元数据中记录文件路径，让前端重试时可以直接使用
            const meta = readChunkMeta(uploadId);
            if (meta) {
              meta.mergedFilePath = finalFilePath;
              writeChunkMeta(uploadId, meta);
            }
            res.status(409).json({ 
              message: "当前目录已经存在同名的文件或目录",
              conflict: true,
              fileName: finalOriginalName
            });
            return;
          } else if (uploadStrategy === "auto_rename") {
            // 获取当前目录中已有的文件名
            const [nameRows] = await pool.query(
              "SELECT original_name AS originalName FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND deleted_at IS NULL",
              [req.user.userId, normalizedSpaceType, targetFolderId]
            );
            const usedNameSet = new Set(nameRows.map((item) => safeFileName(item.originalName || "")).filter(Boolean));
            actualOriginalName = resolveUniqueName(finalOriginalName, usedNameSet);
            conflictResolved = true;
            // 重命名后仍然可以秒传
            instantUpload = true;
            instantFileId = existingMd5File.id;
            // 删除刚移动的文件
            try {
              fs.unlinkSync(finalFilePath);
            } catch (e) {}
          } else if (uploadStrategy === "overwrite") {
            // 先删除同名的文件（但保留相同MD5的那个文件记录）
            const [nameRows] = await pool.query(
              "SELECT id FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL",
              [req.user.userId, normalizedSpaceType, targetFolderId, finalOriginalName]
            );
            for (const row of nameRows) {
              if (row.id !== existingMd5File.id) {
                await pool.query("UPDATE files SET deleted_at = NOW() WHERE id = ?", [row.id]);
              }
            }
            conflictResolved = true;
            instantUpload = true;
            instantFileId = existingMd5File.id;
            // 删除刚移动的文件
            try {
              fs.unlinkSync(finalFilePath);
            } catch (e) {}
          } else {
            // 无效策略，默认为取消
            try {
              fs.unlinkSync(finalFilePath);
            } catch (e) {}
            removeChunkSession(uploadId);
            res.status(400).json({ message: "无效的上传策略" });
            return;
          }
        }
      } else if (duplicated) {
        // 没有相同MD5的文件，但有文件名冲突
        if (uploadStrategy === "cancel") {
          // 保留已合并的文件和分片会话，在元数据中记录文件路径，让前端重试时可以直接使用
          const meta = readChunkMeta(uploadId);
          if (meta) {
            meta.mergedFilePath = finalFilePath;
            writeChunkMeta(uploadId, meta);
          }
          res.status(409).json({ 
            message: "当前目录已经存在同名的文件或目录",
            conflict: true,
            fileName: finalOriginalName
          });
          return;
        } else if (uploadStrategy === "auto_rename") {
          const [nameRows] = await pool.query(
            "SELECT original_name AS originalName FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND deleted_at IS NULL",
            [req.user.userId, normalizedSpaceType, targetFolderId]
          );
          const usedNameSet = new Set(nameRows.map((item) => safeFileName(item.originalName || "")).filter(Boolean));
          actualOriginalName = resolveUniqueName(finalOriginalName, usedNameSet);
          conflictResolved = true;
        } else if (uploadStrategy === "overwrite") {
          await pool.query(
            "UPDATE files SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL",
            [req.user.userId, normalizedSpaceType, targetFolderId, finalOriginalName]
          );
          conflictResolved = true;
        } else {
          try {
            fs.unlinkSync(finalFilePath);
          } catch (e) {}
          removeChunkSession(uploadId);
          res.status(400).json({ message: "无效的上传策略" });
          return;
        }
      }
      
      let insertResult;
      if (instantUpload && instantFileId) {
        // 秒传成功：复用已有物理文件，为当前用户创建独立的数据库记录
        const [existingFileRows] = await pool.query(
          "SELECT storage_name FROM files WHERE id = ?",
          [instantFileId]
        );
        const existingStorageName = existingFileRows.length > 0 ? existingFileRows[0].storage_name : storageName;
        
        const [newInsertResult] = await pool.query(
          "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type, md5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [req.user.userId, spaceType, targetFolderId, actualOriginalName, existingStorageName, thumbnailStorageName || null, fileCategory, Number(meta.fileSize || 0), String(meta.mimeType || "application/octet-stream"), fileMd5]
        );
        
        // 记录文件上传操作
        await logFileOperation(pool, {
          operationType: 'upload',
          fileId: newInsertResult.insertId,
          folderId: targetFolderId,
          fileName: actualOriginalName,
          fileSize: Number(meta.fileSize || 0),
          fileCategory: fileCategory,
          userId: req.user.userId,
          ip: req.ip
        });
        
        removeChunkSession(uploadId);
        res.json({ 
          message: "上传成功", 
          total: 1,
          fileName: actualOriginalName,
          fileId: newInsertResult.insertId,
          fileCategory: fileCategory,
          renamed: false,
          instant: true
        });
        return;
      }
      
      const [insertResultObj] = await pool.query(
        "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type, md5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [req.user.userId, spaceType, targetFolderId, actualOriginalName, storageName, thumbnailStorageName || null, fileCategory, Number(meta.fileSize || 0), String(meta.mimeType || "application/octet-stream"), fileMd5]
      );
      insertResult = insertResultObj;
      
      // 记录文件上传操作
      await logFileOperation(pool, {
        operationType: 'upload',
        fileId: insertResult.insertId,
        folderId: targetFolderId,
        fileName: actualOriginalName,
        fileSize: Number(meta.fileSize || 0),
        fileCategory: fileCategory,
        userId: req.user.userId,
        ip: req.ip
      });
      
      // 异步生成视频缩略图
      if (fileCategory === "video" && !thumbnailStorageName) {
        const fileId = insertResult.insertId;
        const videoFilePath = finalFilePath;
        setImmediate(async () => {
          try {
            const videoThumbName = await generateVideoThumbnail(videoFilePath, storageName, spaceType);
            if (videoThumbName) {
              await pool.query("UPDATE files SET thumbnail_storage_name = ? WHERE id = ?", [videoThumbName, fileId]);
            }
          } catch (e) {}
        });
      }
      
      removeChunkSession(uploadId);
      res.json({ 
        message: "上传成功", 
        total: 1,
        fileName: actualOriginalName,
        fileId: insertResult.insertId,
        fileCategory: fileCategory,
        renamed: duplicated && uploadStrategy === "auto_rename"
      });
    } catch (error) {
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        try {
          fs.unlinkSync(finalFilePath);
        } catch (e) {}
      }
      removeChunkSession(uploadId);
      sendDbError(res, error);
    }
  });

  app.post("/api/upload", authRequired, requireFilePermission("upload"), uploadArray("files"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const folderId = normalizeFolderId(req.body.folderId);
    if (folderId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      res.status(400).json({ message: "没有收到文件" });
      return;
    }
    try {
      const owned = await checkFolderOwnership(req.user.userId, folderId, spaceType);
      if (!owned) {
        files.forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {}
        });
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const uploadRuntimeOptions = req.uploadRuntimeOptions || getUploadRuntimeOptions(DEFAULT_SETTINGS);
      const uploadCategoryRuntimeOptions = req.uploadCategoryRuntimeOptions || getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
      const uploadBatchTotalRaw = Math.floor(Number(req.body && req.body.uploadBatchTotal));
      const uploadBatchTotal = Number.isFinite(uploadBatchTotalRaw) && uploadBatchTotalRaw > 0 ? uploadBatchTotalRaw : 1;
      if (uploadRuntimeOptions.maxUploadFileCount > 0 && uploadBatchTotal > uploadRuntimeOptions.maxUploadFileCount) {
        files.forEach((item) => {
          try {
            fs.unlinkSync(item.path);
          } catch (e) {}
        });
        res.status(413).json({ message: `单次最多上传 ${uploadRuntimeOptions.maxUploadFileCount} 个文件` });
        return;
      }
      for (const file of files) {
        const limitError = getUploadLimitError(file, uploadRuntimeOptions);
        if (limitError) {
          files.forEach((item) => {
            try {
              fs.unlinkSync(item.path);
            } catch (e) {}
          });
          res.status(413).json({ message: limitError });
          return;
        }
        const formatError = getUploadFormatError(file, uploadCategoryRuntimeOptions);
        if (formatError) {
          files.forEach((item) => {
            try {
              fs.unlinkSync(item.path);
            } catch (e) {}
          });
          res.status(400).json({ message: formatError });
          return;
        }
      }
      const incomingSize = files.reduce((total, file) => total + Math.max(0, Number(file.size || 0)), 0);
      const quota = await resolveEffectiveQuotaForUser(req.user.userId);
      if (quota !== -1) {
        const [usageRows] = await pool.query(
          "SELECT IFNULL(SUM(size), 0) AS totalSize FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL",
          [req.user.userId, spaceType]
        );
        const usedSize = usageRows.length > 0 ? Number(usageRows[0].totalSize || 0) : 0;
        if (usedSize + incomingSize > quota) {
          files.forEach((item) => {
            try {
              fs.unlinkSync(item.path);
            } catch (e) {}
          });
          res.status(413).json({ message: "超出空间配额，无法上传" });
          return;
        }
      }
      const rawRelativePaths = req.body.relativePaths;
      const relativePaths = Array.isArray(rawRelativePaths) ? rawRelativePaths : rawRelativePaths !== undefined ? [rawRelativePaths] : [];
      const rawThumbnailDataUrls = req.body.thumbnailDataUrls;
      const thumbnailDataUrls = Array.isArray(rawThumbnailDataUrls) ? rawThumbnailDataUrls : rawThumbnailDataUrls !== undefined ? [rawThumbnailDataUrls] : [];
      
      // 处理上传策略
      const uploadStrategy = String(req.body && req.body.uploadStrategy ? req.body.uploadStrategy : "cancel").trim().toLowerCase();
      const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
      
      const folderCache = new Map();
      const preparedUploads = [];
      const batchNameSet = new Set();
      const conflictFiles = [];
      
      for (let index = 0; index < files.length; index += 1) {
        const currentFile = files[index];
        const relativePath = normalizeRelativePath(relativePaths[index] || "");
        const fileNameFromPath = relativePath ? relativePath.split("/").pop() : "";
        const originalName = fileNameFromPath ? safeFileName(fileNameFromPath) : safeFileName(normalizeUploadName(currentFile.originalname));
        const targetFolderId = await resolveFolderByRelativePath(req.user.userId, folderId, relativePath, folderCache, spaceType);
        const batchNameKey = `${targetFolderId === null ? "null" : String(targetFolderId)}::${originalName}`;
        
        if (batchNameSet.has(batchNameKey)) {
          files.forEach((item) => {
            try {
              fs.unlinkSync(item.path);
            } catch (e) {}
          });
          res.status(409).json({ 
            message: "当前目录已经存在同名的文件或目录",
            conflict: true,
            fileName: originalName
          });
          return;
        }
        batchNameSet.add(batchNameKey);
        
        const duplicated = await hasEntryNameConflict(req.user.userId, targetFolderId, originalName, undefined, spaceType);
        
        if (duplicated) {
          // 有冲突时，自动重命名并上传成功，返回冲突标记让前端弹出选择
          conflictFiles.push({ index, originalName, targetFolderId });
        }
        preparedUploads.push({ currentFile, originalName, targetFolderId, thumbnailDataUrl: thumbnailDataUrls[index] || "" });
      }
      
      // 处理有冲突的文件
      const uploadResults = [];
      for (const item of preparedUploads) {
        let actualOriginalName = item.originalName;
        const conflictItem = conflictFiles.find(cf => cf.index === preparedUploads.indexOf(item));
        
        if (conflictItem) {
          // 获取当前目录中已有的文件名
          const [nameRows] = await pool.query(
            "SELECT original_name AS originalName FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND deleted_at IS NULL",
            [req.user.userId, normalizedSpaceType, item.targetFolderId]
          );
          const usedNameSet = new Set(nameRows.map((row) => safeFileName(row.originalName || "")).filter(Boolean));
          // 添加已准备上传的文件名到集合中，避免重命名冲突
          preparedUploads.forEach((pi, idx) => {
            if (idx < preparedUploads.indexOf(item)) {
              usedNameSet.add(pi.originalName);
            }
          });
          actualOriginalName = resolveUniqueName(item.originalName, usedNameSet);
          
          // 如果是覆盖策略，先删除同名文件
          if (uploadStrategy === "overwrite") {
            await pool.query(
              "UPDATE files SET deleted_at = NOW() WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL",
              [req.user.userId, normalizedSpaceType, item.targetFolderId, item.originalName]
            );
          }
        }
        
        const currentRootDir = req.uploadStorageRootDir || resolveStorageRootDir(spaceType);
        const storageName = resolveStorageNameFromPath(item.currentFile.path, item.currentFile.filename, currentRootDir, req.uploadDiskId || "");
        const resolvedFileCategory = resolveUploadCategory(item.currentFile, uploadCategoryRuntimeOptions);
        const thumbnailStorageName = resolvedFileCategory === "image" ? writeThumbnailFromDataUrl(item.thumbnailDataUrl, storageName, spaceType) : "";
        const fileCategory = normalizeFileCategoryKey(resolveStoredFileCategory(actualOriginalName, item.currentFile.mimetype, uploadCategoryRuntimeOptions));
        
        // 计算文件MD5
        const fileMd5 = await new Promise((resolve, reject) => {
          const hash = crypto.createHash("md5");
          const stream = fs.createReadStream(item.currentFile.path);
          stream.on("data", (chunk) => hash.update(chunk));
          stream.on("end", () => resolve(hash.digest("hex")));
          stream.on("error", reject);
        });
        
        // 检查是否存在相同MD5的文件（用于秒传，跨用户查找）
        const [existingMd5Files] = await pool.query(
          "SELECT id, original_name AS originalName, storage_name AS storageName, folder_id AS folderId FROM files WHERE md5 = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
          [fileMd5, spaceType]
        );
        
        const hasExistingFile = existingMd5Files.length > 0;
        const existingMd5File = hasExistingFile ? existingMd5Files[0] : null;
        let instantUpload = false;
        let instantFileId = null;
        
        // 秒传逻辑：只要MD5相同就秒传，不管是否有文件名冲突
        if (hasExistingFile) {
          instantUpload = true;
          instantFileId = existingMd5File.id;
          // 删除刚上传的临时文件，复用已有文件
          try {
            fs.unlinkSync(item.currentFile.path);
          } catch (e) {}
          
          // 如果有文件名冲突，需要处理
          if (conflictItem) {
            if (uploadStrategy === "overwrite") {
              // 覆盖模式下，删除同名文件
              const [nameRows] = await pool.query(
                "SELECT id FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL",
                [req.user.userId, normalizedSpaceType, item.targetFolderId, actualOriginalName]
              );
              for (const row of nameRows) {
                if (row.id !== existingMd5File.id) {
                  await pool.query("UPDATE files SET deleted_at = NOW() WHERE id = ?", [row.id]);
                }
              }
            }
          }
        }
        
        if (instantUpload && instantFileId) {
          // 秒传成功：复用已有物理文件，为当前用户创建独立的数据库记录
          const [existingFileRows] = await pool.query(
            "SELECT storage_name FROM files WHERE id = ?",
            [instantFileId]
          );
          const existingStorageName = existingFileRows.length > 0 ? existingFileRows[0].storage_name : storageName;
          
          const [newInsertResult] = await pool.query(
            "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type, md5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [req.user.userId, spaceType, item.targetFolderId, actualOriginalName, existingStorageName, thumbnailStorageName || null, fileCategory, item.currentFile.size, item.currentFile.mimetype, fileMd5]
          );
          
          // 记录文件上传操作
          await logFileOperation(pool, {
            operationType: 'upload',
            fileId: newInsertResult.insertId,
            folderId: item.targetFolderId,
            fileName: actualOriginalName,
            fileSize: item.currentFile.size,
            fileCategory: fileCategory,
            userId: req.user.userId,
            ip: req.ip
          });
          
          uploadResults.push({
            originalName: item.originalName,
            actualName: actualOriginalName,
            fileId: newInsertResult.insertId,
            fileCategory: fileCategory,
            renamed: false,
            instant: true
          });
          continue;
        }
        
        const [insertResult] = await pool.query(
          "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type, md5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [req.user.userId, spaceType, item.targetFolderId, actualOriginalName, storageName, thumbnailStorageName || null, fileCategory, item.currentFile.size, item.currentFile.mimetype, fileMd5]
        );
        
        // 记录文件上传操作
        await logFileOperation(pool, {
          operationType: 'upload',
          fileId: insertResult.insertId,
          folderId: item.targetFolderId,
          fileName: actualOriginalName,
          fileSize: item.currentFile.size,
          fileCategory: fileCategory,
          userId: req.user.userId,
          ip: req.ip
        });
        
        // 异步生成视频缩略图
        if (fileCategory === "video" && !thumbnailStorageName) {
          const fileId = insertResult.insertId;
          const videoFilePath = item.currentFile.path;
          setImmediate(async () => {
            try {
              const videoThumbName = await generateVideoThumbnail(videoFilePath, storageName, spaceType);
              if (videoThumbName) {
                await pool.query("UPDATE files SET thumbnail_storage_name = ? WHERE id = ?", [videoThumbName, fileId]);
              }
            } catch (e) {}
          });
        }
        
        uploadResults.push({
          originalName: item.originalName,
          actualName: actualOriginalName,
          fileId: insertResult.insertId,
          fileCategory: fileCategory,
          renamed: Boolean(conflictItem),
          conflict: Boolean(conflictItem)
        });
      }
      
      // 清理临时文件（已通过 storageName 关联，无需删除）
      res.json({ 
        message: "上传成功", 
        total: files.length,
        results: uploadResults
      });
    } catch (error) {
      files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {}
      });
      sendDbError(res, error);
    }
  });

  app.patch("/api/files/:id", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    const name = req.body.name === undefined ? undefined : String(req.body.name || "").trim();
    const folderId = req.body.folderId === undefined ? undefined : normalizeFolderId(req.body.folderId);
    if (!fileId) {
      res.status(400).json({ message: "文件ID不合法" });
      return;
    }
    if (name !== undefined && !name) {
      res.status(400).json({ message: "文件名不能为空" });
      return;
    }
    if (folderId === undefined && req.body.folderId !== undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    if (name !== undefined && !hasFilePermission(req, "rename")) {
      res.status(403).json({ message: "无权执行该操作" });
      return;
    }
    if (folderId !== undefined && !hasFilePermission(req, "move")) {
      res.status(403).json({ message: "无权执行该操作" });
      return;
    }
    try {
      const [rows] = await pool.query("SELECT id, original_name AS originalName, folder_id AS folderId FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
        fileId,
        req.user.userId,
        spaceType
      ]);
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      if (folderId !== undefined) {
        const owned = await checkFolderOwnership(req.user.userId, folderId, spaceType);
        if (!owned) {
          res.status(404).json({ message: "目标目录不存在" });
          return;
        }
      }
      const nextFileName = name !== undefined ? safeFileName(name) : String(rows[0].originalName || "");
      if (name !== undefined) {
        let settings = DEFAULT_SETTINGS;
        try {
          settings = await readSettings();
        } catch (_error) {}
        if (!settings.file.renameCanModifyExt) {
          const currentExt = getFileExtension(rows[0].originalName);
          const nextExt = getFileExtension(nextFileName);
          if (currentExt !== nextExt) {
            res.status(400).json({ message: "当前配置不允许通过重命名修改文件后缀名" });
            return;
          }
        }
      }
      const nextFolderId = folderId !== undefined ? folderId : normalizeFolderId(rows[0].folderId);
      const duplicated = await hasEntryNameConflict(req.user.userId, nextFolderId, nextFileName, { excludeFileId: fileId }, spaceType);
      if (duplicated) {
        res.status(409).json({ message: "当前目录已经存在同名的文件或目录" });
        return;
      }
      const fields = [];
      const params = [];
      if (name !== undefined) {
        fields.push("original_name = ?");
        params.push(safeFileName(name));
      }
      if (folderId !== undefined) {
        fields.push("folder_id = ?");
        params.push(folderId);
      }
      if (fields.length === 0) {
        res.status(400).json({ message: "没有可更新内容" });
        return;
      }
      params.push(fileId, req.user.userId, spaceType);
      await pool.query(`UPDATE files SET ${fields.join(", ")} WHERE id = ? AND user_id = ? AND space_type = ?`, params);
      res.json({ message: "文件更新成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/files/:id", authRequired, requireFilePermission("delete"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    if (!fileId) {
      res.status(400).json({ message: "文件ID不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT id, original_name AS originalName, size, folder_id AS folderId, file_category AS fileCategory FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      
      // 记录文件删除操作
      await logFileOperation(pool, {
        operationType: 'delete',
        fileId: fileId,
        folderId: rows[0].folderId,
        fileName: rows[0].originalName,
        fileSize: rows[0].size,
        fileCategory: rows[0].fileCategory,
        userId: req.user.userId,
        ip: req.ip
      });
      
      await pool.query("UPDATE files SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND space_type = ?", [fileId, req.user.userId, spaceType]);
      res.json({ message: "已移入回收站" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  // 秒传检查接口
  app.post("/api/upload/check-md5", authRequired, requireFilePermission("upload"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const md5 = String(req.body && req.body.md5 ? req.body.md5 : "").trim().toLowerCase();
    const folderId = normalizeFolderId(req.body && req.body.folderId);
    const fileName = String(req.body && req.body.fileName ? req.body.fileName : "").trim();
    
    if (!md5 || md5.length !== 32 || !/^[a-f0-9]{32}$/.test(md5)) {
      res.status(400).json({ message: "MD5格式不合法" });
      return;
    }
    
    if (folderId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    
    if (!fileName) {
      res.status(400).json({ message: "文件名不能为空" });
      return;
    }
    
    try {
      const owned = await checkFolderOwnership(req.user.userId, folderId, spaceType);
      if (!owned) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      
      // 查询是否存在相同MD5且未删除的文件（跨用户查找）
      const [existingFiles] = await pool.query(
        "SELECT id, user_id AS userId, original_name AS originalName, storage_name AS storageName, size, file_category AS fileCategory, folder_id AS folderId FROM files WHERE md5 = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [md5, spaceType]
      );
      
      if (existingFiles.length === 0) {
        res.json({ exists: false, message: "未找到相同文件，需要上传" });
        return;
      }
      
      const existingFile = existingFiles[0];
      const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
      
      // 检查目标目录是否已有同名文件
      const [nameRows] = await pool.query(
        "SELECT id FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL LIMIT 1",
        [req.user.userId, normalizedSpaceType, folderId, fileName]
      );
      
      const nameConflict = nameRows.length > 0;
      
      // 只要有MD5相同的文件就返回可以秒传，后端会自动处理文件名冲突
      res.json({ 
        exists: true, 
        instant: true, 
        fileId: existingFile.id,
        fileName: existingFile.originalName,
        size: existingFile.size,
        fileCategory: existingFile.fileCategory,
        targetFileName: fileName,
        conflict: nameConflict,
        message: nameConflict ? "存在同名文件，将自动重命名" : "秒传成功"
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  // 秒传创建接口：基于已有MD5创建新的文件记录
  app.post("/api/upload/instant", authRequired, requireFilePermission("upload"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const md5 = String(req.body && req.body.md5 ? req.body.md5 : "").trim().toLowerCase();
    const folderId = normalizeFolderId(req.body && req.body.folderId);
    const fileName = String(req.body && req.body.fileName ? req.body.fileName : "").trim();
    const fileSize = Number(req.body && req.body.fileSize ? req.body.fileSize : 0);
    const mimeType = String(req.body && req.body.mimeType ? req.body.mimeType : "application/octet-stream");
    const existingFileId = Number(req.body && req.body.existingFileId ? req.body.existingFileId : 0);
    
    if (!md5 || md5.length !== 32 || !/^[a-f0-9]{32}$/.test(md5)) {
      res.status(400).json({ message: "MD5格式不合法" });
      return;
    }
    
    if (folderId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    
    if (!fileName) {
      res.status(400).json({ message: "文件名不能为空" });
      return;
    }
    
    if (!existingFileId) {
      res.status(400).json({ message: "已有文件ID不合法" });
      return;
    }
    
    try {
      const owned = await checkFolderOwnership(req.user.userId, folderId, spaceType);
      if (!owned) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      
      // 获取已有文件的storage_name（跨用户查找）
      const [existingFileRows] = await pool.query(
        "SELECT storage_name, thumbnail_storage_name, file_category FROM files WHERE id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [existingFileId, spaceType]
      );
      
      if (existingFileRows.length === 0) {
        res.status(404).json({ message: "已有文件不存在" });
        return;
      }
      
      const existingFile = existingFileRows[0];
      const fileCategory = normalizeFileCategoryKey(existingFile.file_category || "other");
      const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
      
      // 检查目标目录是否已有同名文件
      const [nameRows] = await pool.query(
        "SELECT id FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND original_name = ? AND deleted_at IS NULL LIMIT 1",
        [req.user.userId, normalizedSpaceType, folderId, fileName]
      );
      
      let actualFileName = fileName;
      if (nameRows.length > 0) {
        // 有文件名冲突，自动重命名
        const [allNameRows] = await pool.query(
          "SELECT original_name AS originalName FROM files WHERE user_id = ? AND space_type = ? AND folder_id <=> ? AND deleted_at IS NULL",
          [req.user.userId, normalizedSpaceType, folderId]
        );
        const usedNameSet = new Set(allNameRows.map((item) => safeFileName(item.originalName || "")).filter(Boolean));
        actualFileName = resolveUniqueName(fileName, usedNameSet);
      }
      
      // 创建新的文件记录，复用已有物理文件
      const [insertResult] = await pool.query(
        "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type, md5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [req.user.userId, spaceType, folderId, actualFileName, existingFile.storage_name, existingFile.thumbnail_storage_name || null, fileCategory, fileSize, mimeType, md5]
      );
      
      // 记录文件上传操作
      await logFileOperation(pool, {
        operationType: 'upload',
        fileId: insertResult.insertId,
        folderId: folderId,
        fileName: fileName,
        fileSize: fileSize,
        fileCategory: fileCategory,
        userId: req.user.userId,
        ip: req.ip
      });
      
      res.json({ 
        message: "秒传成功", 
        fileId: insertResult.insertId,
        fileName: fileName,
        fileCategory: fileCategory,
        instant: true
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

};
