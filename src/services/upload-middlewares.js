const createUploadMiddlewares = ({
  multer,
  fs,
  path,
  crypto,
  resolveStorageSpaceTypeByRequest,
  getUploadStorageDir,
  resolveStorageRootDir,
  normalizeUploadName,
  safeFileName,
  getUploadRuntimeOptions,
  getUploadCategoryRuntimeOptions,
  DEFAULT_SETTINGS,
  readSettings,
  getCurrentMaxUploadFileSize,
  getAvatarUploadRuntimeOptions,
  AVATAR_MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_CHUNK_SIZE_BYTES,
  normalizeChunkUploadId,
  removeChunkSessionIfOwnedByCurrentUser
}) => {
  const userUploadConcurrencyCounter = new Map();

  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const spaceType = resolveStorageSpaceTypeByRequest(req);
      req.uploadSpaceType = spaceType;
      const targetRelativeDir = getUploadStorageDir(req.user);
      const targetDir = path.join(resolveStorageRootDir(spaceType), targetRelativeDir);
      fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
      const normalized = normalizeUploadName(file.originalname);
      const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeFileName(normalized)}`;
      cb(null, name);
    }
  });

  const uploadArray = (fieldName) => (req, res, next) => {
    const run = async () => {
      const groupMaxSizeMb = req.user ? req.user.groupUploadMaxSizeMb : undefined;
      const groupMaxFileCount = req.user ? req.user.groupUploadMaxFileCount : undefined;
      const runtimeGroupOptions = {};
      if (groupMaxSizeMb !== undefined) {
        runtimeGroupOptions.groupMaxSizeMb = groupMaxSizeMb;
      }
      if (groupMaxFileCount !== undefined) {
        runtimeGroupOptions.groupMaxFileCount = groupMaxFileCount;
      }
      let runtimeOptions = getUploadRuntimeOptions(DEFAULT_SETTINGS, runtimeGroupOptions);
      let categoryRuntimeOptions = getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
      try {
        const settings = await readSettings();
        runtimeOptions = getUploadRuntimeOptions(settings, runtimeGroupOptions);
        categoryRuntimeOptions = getUploadCategoryRuntimeOptions(settings);
      } catch (e) {}
      req.uploadRuntimeOptions = runtimeOptions;
      req.uploadCategoryRuntimeOptions = categoryRuntimeOptions;
      const userId = req && req.user ? Number(req.user.userId || req.user.id || 0) : 0;
      const concurrencyKey = userId > 0 ? `u:${userId}` : `ip:${String(req.ip || "")}`;
      const currentConcurrent = Number(userUploadConcurrencyCounter.get(concurrencyKey) || 0);
      const maxConcurrentUploadCount = Number(runtimeOptions.maxConcurrentUploadCount || 0);
      if (maxConcurrentUploadCount > 0 && currentConcurrent >= maxConcurrentUploadCount) {
        res.status(429).json({ message: `同时上传数量不能超过 ${maxConcurrentUploadCount}` });
        return;
      }
      userUploadConcurrencyCounter.set(concurrencyKey, currentConcurrent + 1);
      let counterReleased = false;
      const releaseConcurrencyCounter = () => {
        if (counterReleased) return;
        counterReleased = true;
        const current = Number(userUploadConcurrencyCounter.get(concurrencyKey) || 0);
        if (current <= 1) {
          userUploadConcurrencyCounter.delete(concurrencyKey);
          return;
        }
        userUploadConcurrencyCounter.set(concurrencyKey, current - 1);
      };
      res.once("finish", releaseConcurrencyCounter);
      res.once("close", releaseConcurrencyCounter);
      const uploadMulterOptions = { storage };
      const uploadLimits = {};
      if (runtimeOptions.maxUploadLimitBytes > 0) {
        uploadLimits.fileSize = runtimeOptions.maxUploadLimitBytes;
      }
      if (runtimeOptions.maxUploadFileCount > 0) {
        uploadLimits.files = runtimeOptions.maxUploadFileCount;
      }
      if (Object.keys(uploadLimits).length > 0) {
        uploadMulterOptions.limits = uploadLimits;
      }
      multer(uploadMulterOptions).array(fieldName)(req, res, (error) => {
        if (!error) {
          next();
          return;
        }
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          if (runtimeOptions.maxUploadLimitMb) {
            res.status(413).json({ message: `文件过大，单文件最大支持 ${runtimeOptions.maxUploadLimitMb}MB` });
            return;
          }
          res.status(413).json({ message: "文件过大" });
          return;
        }
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT") {
          res.status(413).json({ message: `单次最多上传 ${runtimeOptions.maxUploadFileCount} 个文件` });
          return;
        }
        res.status(400).json({ message: error.message || "上传请求不合法" });
      });
    };
    run();
  };

  const cosUploadSingle = (fieldName) => (req, res, next) => {
    const runtimeLimit = getCurrentMaxUploadFileSize();
    const options = { storage: multer.memoryStorage() };
    if (runtimeLimit > 0) {
      options.limits = { fileSize: runtimeLimit };
    }
    multer(options).single(fieldName)(req, res, next);
  };

  const avatarUploadSingle = (fieldName) => (req, res, next) => {
    const run = async () => {
      let options = getAvatarUploadRuntimeOptions(DEFAULT_SETTINGS);
      try {
        const settings = await readSettings();
        options = getAvatarUploadRuntimeOptions(settings);
      } catch (e) {}
      multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: options.maxSizeBytes || AVATAR_MAX_UPLOAD_FILE_SIZE_BYTES },
        fileFilter: (_req, file, cb) => {
          if (!file || !file.mimetype) {
            cb(new Error("仅支持图片文件"));
            return;
          }
          const mimetype = String(file.mimetype || "").toLowerCase();
          if (!options.allowedMimes.has(mimetype)) {
            cb(new Error(`仅支持${options.formats.join("、")}格式图片`));
            return;
          }
          cb(null, true);
        }
      }).single(fieldName)(req, res, (error) => {
        if (!error) {
          next();
          return;
        }
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ message: `头像文件不能超过${options.maxSizeMb}MB` });
          return;
        }
        res.status(400).json({ message: error.message || "头像上传失败" });
      });
    };
    run();
  };

  const chunkUploadSingle = (fieldName) => (req, res, next) => multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_CHUNK_SIZE_BYTES }
  }).single(fieldName)(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const uploadId = normalizeChunkUploadId(req && req.params ? req.params.uploadId : "");
    removeChunkSessionIfOwnedByCurrentUser(req, uploadId);
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: `分片过大，单片不能超过 ${Math.floor(MAX_UPLOAD_CHUNK_SIZE_BYTES / 1024 / 1024)}MB` });
      return;
    }
    res.status(400).json({ message: error.message || "分片上传请求不合法" });
  });

  return {
    uploadArray,
    cosUploadSingle,
    avatarUploadSingle,
    chunkUploadSingle
  };
};

module.exports = {
  createUploadMiddlewares
};
