const os = require("os");
const path = require("path");
const { execSync, spawn, spawnSync } = require("child_process");

const formatBytes = (bytes) => {
  const numericBytes = Number(bytes);
  if (!Number.isFinite(numericBytes) || numericBytes < 0) return "0 B";
  if (numericBytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(numericBytes) / Math.log(1024)));
  return `${parseFloat((numericBytes / Math.pow(1024, index)).toFixed(2))} ${units[index]}`;
};

const getStorageAvailableBytes = (storageRootDir) => {
  try {
    const resolvedRoot = path.resolve(storageRootDir || process.cwd());
    if (os.platform() === "win32") {
      const driveName = path.parse(resolvedRoot).root.replace(/[:\\\/]/g, "");
      if (!driveName) return null;
      const output = execSync(
        `powershell -Command "Get-PSDrive -Name '${driveName}' -PSProvider FileSystem | Select-Object -ExpandProperty Free"`,
        { encoding: "utf8", maxBuffer: 1024 * 1024 }
      );
      const freeBytes = Number(String(output || "").trim());
      return Number.isFinite(freeBytes) && freeBytes >= 0 ? freeBytes : null;
    }
    const output = execSync(`df -k "${resolvedRoot.replace(/"/g, '\\"')}" | tail -1`, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const parts = String(output || "").trim().split(/\s+/);
    const freeKb = Number(parts[3]);
    return Number.isFinite(freeKb) && freeKb >= 0 ? freeKb * 1024 : null;
  } catch (error) {
    return null;
  }
};

const getStorageStatsByPath = (storageRootDir) => {
  try {
    const resolvedRoot = path.resolve(storageRootDir || process.cwd());
    if (os.platform() === "win32") {
      const driveName = path.parse(resolvedRoot).root.replace(/[:\\\/]/g, "");
      if (!driveName) return null;
      const output = execSync(
        `powershell -Command "Get-PSDrive -Name '${driveName}' -PSProvider FileSystem | Select-Object Name, Used, Free | ConvertTo-Json -Compress"`,
        { encoding: "utf8", maxBuffer: 1024 * 1024 }
      );
      const payload = JSON.parse(String(output || "null").trim() || "null");
      if (!payload) return null;
      return {
        key: `${String(payload.Name || driveName).toLowerCase()}:\\`,
        freeBytes: Math.max(0, Number(payload.Free || 0))
      };
    }
    const output = execSync(`df -k "${resolvedRoot.replace(/"/g, '\\"')}" | tail -1`, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const parts = String(output || "").trim().split(/\s+/);
    const freeKb = Number(parts[3]);
    const mountPath = String(parts[5] || resolvedRoot).trim() || resolvedRoot;
    const freeBytes = Number.isFinite(freeKb) && freeKb >= 0 ? freeKb * 1024 : null;
    if (!Number.isFinite(freeBytes) || freeBytes < 0) return null;
    return {
      key: mountPath,
      freeBytes
    };
  } catch (error) {
    return null;
  }
};

module.exports = (app, deps) => {
  const {
    authRequired,
    adminRequired,
    pool,
    loadUserGroupContextMap,
    getEffectivePermissions,
    parsePermissionList,
    sendDbError,
    normalizeIdList,
    insertUserGroupMembers,
    hashPassword,
    resolveStorageRootDir,
    resolveAbsoluteStoragePath,
    resolveStorageNameFromPath,
    fs,
    crypto,
    avatarUploadSingle,
    UPLOAD_DIR,
    sharp,
    normalizeUserGroupUploadMaxSizeMb,
    normalizeUserGroupUploadMaxFileCount,
    convertUserGroupUploadSizeMbToGb,
    convertUserGroupUploadSizeGbToMb,
    resolveGroupQuota,
    getStorageDiskConfig
  } = deps;
  const HIDDEN_SPACE_DISK_TOKEN = "__hidden__";
  const STORAGE_DISK_PREFIX_SEPARATOR = "|";
  let rsyncAvailabilityCache = null;

  const normalizeStorageDiskId = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
  const normalizeStorageRelativePath = (value) => String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  const parseStoredStorageNameLocal = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return { diskId: "", relativePath: "" };
    const separatorIndex = raw.indexOf(STORAGE_DISK_PREFIX_SEPARATOR);
    if (separatorIndex > 0) {
      return {
        diskId: normalizeStorageDiskId(raw.slice(0, separatorIndex)),
        relativePath: normalizeStorageRelativePath(raw.slice(separatorIndex + 1))
      };
    }
    return {
      diskId: "",
      relativePath: normalizeStorageRelativePath(raw)
    };
  };
  const buildDiskIdFromMount = (mount) => {
    const normalized = normalizeStorageDiskId(String(mount || "").replace(/[:\\\/]+/g, "-"));
    return normalized || "program-disk";
  };
  const normalizeStorageMountKey = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (trimmed === "/" || trimmed === "\\") return "/";
    return trimmed.replace(/[\\/]+$/, "").toLowerCase();
  };
  const getProgramStorageMount = (programStorageRoot) => {
    const resolvedProgramRoot = path.resolve(programStorageRoot || "");
    return path.parse(resolvedProgramRoot).root || resolvedProgramRoot || "";
  };
  const getStorageDiskMountPath = (disk, fallbackMount = "") => {
    return String(
      (disk && (disk.systemDiskMount || disk.mount || disk.path || disk.name || disk.id))
      || fallbackMount
      || ""
    );
  };
  const getStorageDiskDisplayMountPath = (disk, fallbackMount = "") => {
    if (!disk || typeof disk !== "object") return String(fallbackMount || "");
    return getStorageDiskMountPath(disk, fallbackMount);
  };
  const getStorageDiskMountKeys = (disk, fallbackMount = "") => {
    const mountKeys = new Set();
    const pushMountKey = (value) => {
      const normalizedValue = normalizeStorageMountKey(value);
      if (normalizedValue) {
        mountKeys.add(normalizedValue);
      }
    };
    const diskPath = String(disk && disk.path || "").trim();
    const diskSource = String(disk && disk.source || "").trim().toLowerCase();
    pushMountKey(getStorageDiskMountPath(disk, fallbackMount));
    pushMountKey(diskPath);
    if (diskPath) {
      const storageStats = getStorageStatsByPath(diskPath);
      if (storageStats && storageStats.key) {
        pushMountKey(storageStats.key);
      }
    }
    if (diskPath) {
      pushMountKey(path.parse(path.resolve(diskPath)).root);
    }
    if (diskSource === "nfs") {
      pushMountKey(disk && disk.remotePath);
      if (diskPath) {
        pushMountKey(path.dirname(path.resolve(diskPath)));
      }
    }
    return mountKeys;
  };
  const normalizeStorageDirPath = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    try {
      return path.resolve(trimmed).replace(/[\\\/]+$/, "").toLowerCase();
    } catch (error) {
      return "";
    }
  };
  const safeStatPath = (targetPath) => {
    try {
      return fs.statSync(targetPath);
    } catch (error) {
      return null;
    }
  };
  const applyPathTimes = (targetPath, stats) => {
    if (!targetPath || !stats) return;
    try {
      fs.utimesSync(targetPath, stats.atime, stats.mtime);
    } catch (error) {}
  };
  const getStorageRootDirFromAbsolutePath = (absolutePath, relativePath) => {
    const normalizedRelativePath = normalizeStorageRelativePath(relativePath);
    if (!absolutePath || !normalizedRelativePath) return "";
    const segments = normalizedRelativePath.split("/").filter(Boolean);
    if (!segments.length) return "";
    let currentPath = path.resolve(String(absolutePath));
    segments.forEach(() => {
      currentPath = path.dirname(currentPath);
    });
    return currentPath;
  };
  const collectDirectoryTimesFromRelativePath = (relativePath, sourceRootDir, targetRootDir, dirTimeMap) => {
    if (!dirTimeMap || !sourceRootDir || !targetRootDir) return;
    const normalizedRelativePath = normalizeStorageRelativePath(relativePath);
    if (!normalizedRelativePath) return;
    const relativeDirPath = path.posix.dirname(normalizedRelativePath);
    if (!relativeDirPath || relativeDirPath === ".") return;
    const dirSegments = relativeDirPath.split("/").filter(Boolean);
    let currentRelativeDir = "";
    dirSegments.forEach((segment) => {
      currentRelativeDir = currentRelativeDir ? `${currentRelativeDir}/${segment}` : segment;
      const targetDirPath = path.resolve(String(targetRootDir), currentRelativeDir);
      if (dirTimeMap.has(targetDirPath)) return;
      const sourceDirPath = path.resolve(String(sourceRootDir), currentRelativeDir);
      const sourceDirStats = safeStatPath(sourceDirPath);
      if (!sourceDirStats || !sourceDirStats.isDirectory()) return;
      dirTimeMap.set(targetDirPath, sourceDirStats);
    });
  };
  const applyDirectoryTimesMap = (dirTimeMap) => {
    Array.from((dirTimeMap || new Map()).entries())
      .sort((left, right) => String(right[0] || "").length - String(left[0] || "").length)
      .forEach(([targetDirPath, sourceDirStats]) => {
        applyPathTimes(targetDirPath, sourceDirStats);
      });
  };
  const moveFileToPath = (sourcePath, targetPath) => {
    const sourceStats = safeStatPath(sourcePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    applyPathTimes(targetPath, sourceStats);
    fs.unlinkSync(sourcePath);
  };
  const isRsyncAvailable = () => {
    if (rsyncAvailabilityCache !== null) return rsyncAvailabilityCache;
    if (os.platform() === "win32") {
      rsyncAvailabilityCache = false;
      return rsyncAvailabilityCache;
    }
    try {
      const result = spawnSync("rsync", ["--version"], { stdio: "ignore" });
      rsyncAvailabilityCache = result && result.status === 0;
    } catch (error) {
      rsyncAvailabilityCache = false;
    }
    return rsyncAvailabilityCache;
  };
  const moveFileToPathWithRsyncProgress = (sourcePath, targetPath, onProgress) => new Promise((resolve, reject) => {
    const sourceStats = safeStatPath(sourcePath);
    if (!sourceStats || !sourceStats.isFile()) {
      reject(new Error(`文件不存在，无法迁移：${path.basename(sourcePath || "")}`));
      return;
    }
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    } catch (error) {
      reject(error);
      return;
    }
    let finished = false;
    let stderrText = "";
    let stdoutText = "";
    let lastCopiedBytes = 0;
    const tryUpdateProgress = (chunkText) => {
      const matches = String(chunkText || "").match(/(\d[\d,]*)\s+(\d+)%/g);
      if (!matches || !matches.length) return;
      const latestMatch = matches[matches.length - 1].match(/(\d[\d,]*)\s+(\d+)%/);
      if (!latestMatch) return;
      const copiedBytes = Number(String(latestMatch[1] || "").replace(/,/g, ""));
      if (!Number.isFinite(copiedBytes) || copiedBytes < 0) return;
      lastCopiedBytes = copiedBytes;
      if (typeof onProgress === "function") {
        onProgress(copiedBytes);
      }
    };
    const child = spawn("rsync", ["-a", "--info=progress2", sourcePath, targetPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const finishWithError = (error) => {
      if (finished) return;
      finished = true;
      try {
        child.kill("SIGKILL");
      } catch (e) {}
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch (e) {}
      reject(error);
    };
    child.stdout.on("data", (chunk) => {
      const text = String(chunk || "");
      stdoutText += text;
      tryUpdateProgress(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      stderrText += text;
      tryUpdateProgress(text);
    });
    child.on("error", (error) => {
      finishWithError(error);
    });
    child.on("close", (code) => {
      if (finished) return;
      if (code !== 0) {
        finishWithError(new Error(String(stderrText || stdoutText || `rsync 退出码 ${code}`)));
        return;
      }
      finished = true;
      try {
        fs.unlinkSync(sourcePath);
        resolve(Math.max(lastCopiedBytes, Number(sourceStats.size || 0)));
      } catch (error) {
        reject(error);
      }
    });
  });
  const moveFileToPathWithProgress = (sourcePath, targetPath, onProgress) => new Promise((resolve, reject) => {
    let sourceStream = null;
    let targetStream = null;
    let settled = false;
    let copiedBytes = 0;
    const sourceStats = safeStatPath(sourcePath);
    const finishWithError = (error) => {
      if (settled) return;
      settled = true;
      try {
        if (sourceStream) sourceStream.destroy();
      } catch (e) {}
      try {
        if (targetStream) targetStream.destroy();
      } catch (e) {}
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch (e) {}
      reject(error);
    };
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      sourceStream = fs.createReadStream(sourcePath);
      targetStream = fs.createWriteStream(targetPath);
      sourceStream.on("data", (chunk) => {
        copiedBytes += Math.max(0, Number(chunk && chunk.length || 0));
        if (typeof onProgress === "function") {
          onProgress(copiedBytes);
        }
      });
      sourceStream.on("error", finishWithError);
      targetStream.on("error", finishWithError);
      targetStream.on("finish", () => {
        if (settled) return;
        settled = true;
        try {
          applyPathTimes(targetPath, sourceStats);
          fs.unlinkSync(sourcePath);
          resolve(copiedBytes);
        } catch (error) {
          reject(error);
        }
      });
      sourceStream.pipe(targetStream);
    } catch (error) {
      finishWithError(error);
    }
  });
  const rollbackMovedFiles = (movedFiles) => {
    movedFiles.slice().reverse().forEach((item) => {
      try {
        if (!item || !item.sourcePath || !item.targetPath) return;
        if (!fs.existsSync(item.targetPath)) return;
        fs.mkdirSync(path.dirname(item.sourcePath), { recursive: true });
        fs.copyFileSync(item.targetPath, item.sourcePath);
        fs.unlinkSync(item.targetPath);
      } catch (error) {}
    });
  };
  const getProgramStorageDiskId = (storageDisks, programStorageRoot) => {
    const resolvedProgramRoot = path.resolve(programStorageRoot || "");
    const matched = (Array.isArray(storageDisks) ? storageDisks : []).find((item) => {
      return path.resolve(String(item && item.path || "")) === resolvedProgramRoot;
    });
    return matched ? String(matched.id || "") : buildDiskIdFromMount(getProgramStorageMount(programStorageRoot));
  };
  const getEnabledStorageAvailableBytes = () => {
    const currentStorageConfig = typeof getStorageDiskConfig === "function"
      ? getStorageDiskConfig()
      : { defaultDiskId: "", disks: [] };
    const storageDiskPaths = Array.isArray(currentStorageConfig && currentStorageConfig.disks)
      ? currentStorageConfig.disks
        .filter((item) => item && item.enabled !== false && item.path)
        .map((item) => String(item.path))
      : [];
    const uniqueStats = new Map();
    (storageDiskPaths.length ? storageDiskPaths : [resolveStorageRootDir("normal")]).forEach((storagePath) => {
      const stats = getStorageStatsByPath(storagePath);
      if (!stats || !stats.key || uniqueStats.has(stats.key)) return;
      uniqueStats.set(stats.key, stats.freeBytes);
    });
    if (!uniqueStats.size) return null;
    return Array.from(uniqueStats.values()).reduce((total, item) => total + item, 0);
  };
  const findExistingStorageDiskByRelativePath = (relativePath, storageDisks = []) => {
    const normalizedRelativePath = normalizeStorageRelativePath(relativePath);
    if (!normalizedRelativePath) return null;
    const candidates = (Array.isArray(storageDisks) ? storageDisks : [])
      .filter((item) => item && item.enabled !== false && item.path)
      .map((item) => {
        const candidatePath = path.resolve(String(item.path), normalizedRelativePath);
        return fs.existsSync(candidatePath) ? { disk: item, absolutePath: candidatePath } : null;
      })
      .filter(Boolean);
    return candidates.length === 1 ? candidates[0] : null;
  };
  const repairUserStorageRecordsByExistingFiles = async (userId, storageDisks = []) => {
    const normalizedUserId = Number(userId) || 0;
    if (!normalizedUserId) return 0;
    const enabledStorageDisks = (Array.isArray(storageDisks) ? storageDisks : []).filter((item) => item && item.enabled !== false && item.path);
    if (!enabledStorageDisks.length) return 0;
    const [rows] = await pool.query(
      `SELECT
         id,
         storage_name AS storageName,
         thumbnail_storage_name AS thumbnailStorageName
       FROM files
       WHERE user_id = ? AND space_type = 'normal' AND deleted_at IS NULL`,
      [normalizedUserId]
    );
    let repairedCount = 0;
    for (const row of rows) {
      const parsedStorage = parseStoredStorageNameLocal(row.storageName);
      const currentAbsolutePath = resolveAbsoluteStoragePath(row.storageName, "normal");
      let nextStorageName = row.storageName;
      let nextThumbnailStorageName = row.thumbnailStorageName;
      let hasChange = false;
      if (parsedStorage.relativePath && (!currentAbsolutePath || !fs.existsSync(currentAbsolutePath))) {
        const matchedStorage = findExistingStorageDiskByRelativePath(parsedStorage.relativePath, enabledStorageDisks);
        if (matchedStorage && matchedStorage.disk) {
          nextStorageName = resolveStorageNameFromPath(
            matchedStorage.absolutePath,
            parsedStorage.relativePath,
            String(matchedStorage.disk.path),
            String(matchedStorage.disk.id || "")
          ) || row.storageName;
          hasChange = nextStorageName !== row.storageName;
        }
      }
      if (row.thumbnailStorageName) {
        const parsedThumbnail = parseStoredStorageNameLocal(row.thumbnailStorageName);
        const currentThumbnailPath = resolveAbsoluteStoragePath(row.thumbnailStorageName, "normal");
        if (parsedThumbnail.relativePath && (!currentThumbnailPath || !fs.existsSync(currentThumbnailPath))) {
          const matchedThumbnail = findExistingStorageDiskByRelativePath(parsedThumbnail.relativePath, enabledStorageDisks);
          if (matchedThumbnail && matchedThumbnail.disk) {
            nextThumbnailStorageName = resolveStorageNameFromPath(
              matchedThumbnail.absolutePath,
              parsedThumbnail.relativePath,
              String(matchedThumbnail.disk.path),
              String(matchedThumbnail.disk.id || "")
            ) || row.thumbnailStorageName;
            hasChange = hasChange || nextThumbnailStorageName !== row.thumbnailStorageName;
          }
        }
      }
      if (!hasChange) continue;
      await pool.query(
        "UPDATE files SET storage_name = ?, thumbnail_storage_name = ? WHERE id = ?",
        [nextStorageName, nextThumbnailStorageName || null, Number(row.id)]
      );
      repairedCount += 1;
    }
    return repairedCount;
  };
  const createUserStorageMigrationTaskId = (userId) => `storage-migrate-${Number(userId) || 0}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const mapUserStorageMigrationTaskRow = (row) => {
    if (!row) return null;
    return {
      userId: Number(row.userId || 0),
      taskId: String(row.taskId || ""),
      status: String(row.status || "idle"),
      progress: Number(row.progress || 0),
      movedCount: Number(row.movedCount || 0),
      totalCount: Number(row.totalCount || 0),
      movedBytes: Number(row.movedBytes || 0),
      totalBytes: Number(row.totalBytes || 0),
      targetMountPath: String(row.targetMountPath || ""),
      targetStoragePath: String(row.targetStoragePath || ""),
      message: String(row.message || ""),
      startedAt: row.startedAt || null,
      finishedAt: row.finishedAt || null,
      updatedAt: row.updatedAt || null
    };
  };
  const getUserStorageMigrationTaskState = async (userId, connection = pool) => {
    const normalizedUserId = Number(userId) || 0;
    if (!normalizedUserId) return null;
    const [rows] = await connection.query(
      `SELECT
         user_id AS userId,
         task_id AS taskId,
         status,
         progress,
         moved_count AS movedCount,
         total_count AS totalCount,
         moved_bytes AS movedBytes,
         total_bytes AS totalBytes,
         target_mount_path AS targetMountPath,
         target_storage_path AS targetStoragePath,
         message,
         started_at AS startedAt,
         finished_at AS finishedAt,
         updated_at AS updatedAt
       FROM user_storage_migration_tasks
       WHERE user_id = ?
       LIMIT 1`,
      [normalizedUserId]
    );
    return mapUserStorageMigrationTaskRow(rows[0] || null);
  };
  const setUserStorageMigrationTaskState = async (userId, patch, connection = pool) => {
    const normalizedUserId = Number(userId) || 0;
    if (!normalizedUserId) return null;
    const current = await getUserStorageMigrationTaskState(normalizedUserId, connection);
    const nextStatus = patch && patch.status !== undefined
      ? String(patch.status || "idle")
      : String(current && current.status || "idle");
    const next = {
      userId: normalizedUserId,
      taskId: String((patch && patch.taskId !== undefined ? patch.taskId : (current && current.taskId)) || ""),
      status: nextStatus,
      progress: Math.max(0, Math.min(100, Number((patch && patch.progress !== undefined ? patch.progress : (current && current.progress)) || 0))),
      movedCount: Math.max(0, Number((patch && patch.movedCount !== undefined ? patch.movedCount : (current && current.movedCount)) || 0)),
      totalCount: Math.max(0, Number((patch && patch.totalCount !== undefined ? patch.totalCount : (current && current.totalCount)) || 0)),
      movedBytes: Math.max(0, Number((patch && patch.movedBytes !== undefined ? patch.movedBytes : (current && current.movedBytes)) || 0)),
      totalBytes: Math.max(0, Number((patch && patch.totalBytes !== undefined ? patch.totalBytes : (current && current.totalBytes)) || 0)),
      targetMountPath: String((patch && patch.targetMountPath !== undefined ? patch.targetMountPath : (current && current.targetMountPath)) || ""),
      targetStoragePath: String((patch && patch.targetStoragePath !== undefined ? patch.targetStoragePath : (current && current.targetStoragePath)) || ""),
      message: String((patch && patch.message !== undefined ? patch.message : (current && current.message)) || ""),
      startedAt: patch && Object.prototype.hasOwnProperty.call(patch, "startedAt")
        ? patch.startedAt
        : (current && current.startedAt) || (nextStatus === "running" ? new Date() : null),
      finishedAt: patch && Object.prototype.hasOwnProperty.call(patch, "finishedAt")
        ? patch.finishedAt
        : (nextStatus === "completed" || nextStatus === "failed" ? new Date() : null)
    };
    await connection.query(
      `INSERT INTO user_storage_migration_tasks
        (user_id, task_id, status, progress, moved_count, total_count, moved_bytes, total_bytes, target_mount_path, target_storage_path, message, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        task_id = VALUES(task_id),
        status = VALUES(status),
        progress = VALUES(progress),
        moved_count = VALUES(moved_count),
        total_count = VALUES(total_count),
        moved_bytes = VALUES(moved_bytes),
        total_bytes = VALUES(total_bytes),
        target_mount_path = VALUES(target_mount_path),
        target_storage_path = VALUES(target_storage_path),
        message = VALUES(message),
        started_at = VALUES(started_at),
        finished_at = VALUES(finished_at)`,
      [
        next.userId,
        next.taskId,
        next.status,
        next.progress,
        next.movedCount,
        next.totalCount,
        next.movedBytes,
        next.totalBytes,
        next.targetMountPath,
        next.targetStoragePath,
        next.message,
        next.startedAt,
        next.finishedAt
      ]
    );
    return await getUserStorageMigrationTaskState(normalizedUserId, connection);
  };
  const executeUserStorageMigrationTask = async ({
    userId,
    taskId,
    movePlans,
    totalMoveBytes,
    targetDisk,
    targetMountPath,
    targetStoragePath,
    programStorageMount
  }) => {
    let connection;
    const movedFiles = [];
    const targetDirectoryTimeMap = new Map();
    let useRsyncExecutor = isRsyncAvailable();
    let rsyncUsedCount = 0;
    let nodeUsedCount = 0;
    let movedCount = 0;
    let committedBytes = 0;
    const totalBaseBytes = totalMoveBytes > 0 ? totalMoveBytes : movePlans.length;
    let lastPersistAt = 0;
    let persistChain = Promise.resolve();
    const queuePersistTaskState = (patch, force = false) => {
      const now = Date.now();
      if (!force && now - lastPersistAt < 400) {
        return persistChain;
      }
      lastPersistAt = now;
      persistChain = persistChain
        .then(() => setUserStorageMigrationTaskState(userId, patch))
        .catch(() => {});
      return persistChain;
    };
    const updateRunningProgress = (currentBytes = committedBytes, message = "", force = false) => {
      const progress = totalBaseBytes > 0
        ? Math.max(0, Math.min(99, Math.round((currentBytes / totalBaseBytes) * 100)))
        : 0;
      queuePersistTaskState({
        taskId,
        status: "running",
        progress,
        movedCount,
        totalCount: movePlans.length,
        movedBytes: Math.max(committedBytes, currentBytes),
        totalBytes: totalMoveBytes,
        targetMountPath,
        targetStoragePath,
        message: message || `正在迁移 ${movedCount}/${movePlans.length}`
      }, force);
    };
    const moveSinglePlanWithPreferredExecutor = async (plan) => {
      const executorLabel = useRsyncExecutor ? "rsync" : "node";
      updateRunningProgress(
        committedBytes,
        `正在迁移 ${movedCount + 1}/${movePlans.length}：${path.basename(plan.sourcePath)} (${executorLabel})`,
        true
      );
      if (useRsyncExecutor) {
        try {
          let currentFileCopiedBytes = 0;
          await moveFileToPathWithRsyncProgress(plan.sourcePath, plan.targetPath, (copiedBytes) => {
            currentFileCopiedBytes = Math.min(Math.max(0, Number(plan.size || 0)), Math.max(0, Number(copiedBytes || 0)));
            updateRunningProgress(
              committedBytes + currentFileCopiedBytes,
              `正在迁移 ${movedCount + 1}/${movePlans.length}：${path.basename(plan.sourcePath)} (rsync)`
            );
          });
          movedFiles.push({ sourcePath: plan.sourcePath, targetPath: plan.targetPath });
          if (plan.sourceThumbnailPath && plan.targetThumbnailPath) {
            await moveFileToPathWithRsyncProgress(plan.sourceThumbnailPath, plan.targetThumbnailPath);
            movedFiles.push({ sourcePath: plan.sourceThumbnailPath, targetPath: plan.targetThumbnailPath });
          }
          rsyncUsedCount += 1;
          return "rsync";
        } catch (error) {
          useRsyncExecutor = false;
          updateRunningProgress(
            committedBytes,
            `rsync 失败，切换 Node 迁移：${error && error.message ? error.message : "未知错误"}`,
            true
          );
        }
      }
      let currentFileCopiedBytes = 0;
      await moveFileToPathWithProgress(plan.sourcePath, plan.targetPath, (copiedBytes) => {
        currentFileCopiedBytes = Math.min(Math.max(0, Number(plan.size || 0)), Math.max(0, Number(copiedBytes || 0)));
        updateRunningProgress(
          committedBytes + currentFileCopiedBytes,
          `正在迁移 ${movedCount + 1}/${movePlans.length}：${path.basename(plan.sourcePath)} (node)`
        );
      });
      movedFiles.push({ sourcePath: plan.sourcePath, targetPath: plan.targetPath });
      if (plan.sourceThumbnailPath && plan.targetThumbnailPath) {
        await moveFileToPathWithProgress(plan.sourceThumbnailPath, plan.targetThumbnailPath);
        movedFiles.push({ sourcePath: plan.sourceThumbnailPath, targetPath: plan.targetThumbnailPath });
      }
      nodeUsedCount += 1;
      return "node";
    };
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      for (const plan of movePlans) {
        collectDirectoryTimesFromRelativePath(plan.relativePath, plan.sourceRootDir, targetDisk.path, targetDirectoryTimeMap);
        if (plan.thumbnailRelativePath && plan.thumbnailSourceRootDir) {
          collectDirectoryTimesFromRelativePath(plan.thumbnailRelativePath, plan.thumbnailSourceRootDir, targetDisk.path, targetDirectoryTimeMap);
        }
        const executorUsed = await moveSinglePlanWithPreferredExecutor(plan);
        await connection.query(
          "UPDATE files SET storage_name = ?, thumbnail_storage_name = ? WHERE id = ?",
          [plan.nextStorageName, plan.nextThumbnailStorageName, plan.id]
        );
        movedCount += 1;
        committedBytes += Math.max(0, Number(plan.size || 0));
        updateRunningProgress(committedBytes, `正在迁移 ${movedCount}/${movePlans.length} (${executorUsed})`, true);
      }
      applyDirectoryTimesMap(targetDirectoryTimeMap);
      await connection.commit();
      await queuePersistTaskState({}, true);
      const executorSummary = rsyncUsedCount > 0 && nodeUsedCount > 0
        ? "（rsync + Node 回退）"
        : rsyncUsedCount > 0
          ? "（rsync）"
          : "（Node）";
      await setUserStorageMigrationTaskState(userId, {
        taskId,
        status: "completed",
        progress: 100,
        movedCount,
        totalCount: movePlans.length,
        movedBytes: committedBytes,
        totalBytes: totalMoveBytes,
        targetMountPath,
        targetStoragePath,
        message: `已将 ${movePlans.length} 个文件迁移到 ${getStorageDiskMountPath(targetDisk, programStorageMount) || targetMountPath}${executorSummary}`
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      rollbackMovedFiles(movedFiles);
      await queuePersistTaskState({}, true);
      await setUserStorageMigrationTaskState(userId, {
        taskId,
        status: "failed",
        targetMountPath,
        targetStoragePath,
        message: error && error.message ? error.message : "迁移失败"
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  };

  const validateQuotaLimit = async (connection, quotaBytes, userId = null) => {
    const normalizedQuota = Number(quotaBytes);
    if (!Number.isFinite(normalizedQuota) || normalizedQuota <= 0 || normalizedQuota === -1) {
      return null;
    }
    const availableSpace = getEnabledStorageAvailableBytes();
    if (!Number.isFinite(availableSpace) || availableSpace < 0) {
      return null;
    }

    let currentUsed = 0;
    if (userId) {
      const [usedRows] = await connection.query(
        "SELECT IFNULL(SUM(size), 0) AS total FROM files WHERE user_id = ? AND deleted_at IS NULL",
        [userId]
      );
      currentUsed = Number(usedRows[0] && usedRows[0].total || 0);
    }

    const maxQuotaBytes = availableSpace + currentUsed;
    if (normalizedQuota > maxQuotaBytes) {
      return `空间配额不能超过服务器当前可用空间，当前最多可设置为 ${formatBytes(maxQuotaBytes)}`;
    }
    return null;
  };

  // --- User Management APIs ---

  app.get("/api/users", authRequired, adminRequired, async (req, res) => {
    try {
      const { search } = req.query;
      let whereClause = "";
      let params = [];
      
      // 如果有搜索参数，添加 WHERE 条件
      if (search && search.trim()) {
        whereClause = " WHERE (u.username LIKE ? OR u.name LIKE ?)";
        const searchTerm = `%${search.trim()}%`;
        params = [searchTerm, searchTerm];
      }
      
      const [users] = await pool.query(`
      SELECT u.id, u.username, u.name, u.phone, u.permissions, u.role, u.avatar, u.created_at,
        IFNULL(SUM(f.size), 0) AS used,
        COUNT(f.id) AS fileCount
      FROM users u
      LEFT JOIN files f ON f.user_id = u.id AND f.deleted_at IS NULL
      ${whereClause ? whereClause.replace(' WHERE ', ' WHERE ') : ''}
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `, params);
      const currentStorageConfig = typeof getStorageDiskConfig === "function"
        ? getStorageDiskConfig()
        : { defaultDiskId: "", disks: [] };
      const configuredStorageDisks = Array.isArray(currentStorageConfig && currentStorageConfig.disks)
        ? currentStorageConfig.disks
        : [];
      const programStorageRoot = resolveStorageRootDir("normal");
      const programStorageMount = getProgramStorageMount(programStorageRoot);
      const programStorageDiskId = getProgramStorageDiskId(configuredStorageDisks, programStorageRoot);
      const defaultStorageDisk = configuredStorageDisks.find((item) => item.id === currentStorageConfig.defaultDiskId)
        || configuredStorageDisks[0]
        || null;
      const storageDiskLabelMap = new Map(
        configuredStorageDisks.map((item) => [
          String(item.id || ""),
          getStorageDiskDisplayMountPath(item, programStorageMount) || "默认盘"
        ])
      );
      if (programStorageDiskId) {
        storageDiskLabelMap.set(programStorageDiskId, programStorageMount || storageDiskLabelMap.get(programStorageDiskId) || "默认盘");
      }
      storageDiskLabelMap.set(
        "",
        defaultStorageDisk
          ? getStorageDiskDisplayMountPath(defaultStorageDisk, programStorageMount)
          : (programStorageMount || "默认盘")
      );
      storageDiskLabelMap.set(HIDDEN_SPACE_DISK_TOKEN, "私密空间");
      const userIds = users.map((item) => Number(item.id)).filter((item) => item > 0);
      // 将存储记录修复移到后台异步执行，不阻塞接口响应
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => "?").join(", ");
        pool.query(
          `SELECT user_id AS userId
           FROM user_storage_migration_tasks
           WHERE user_id IN (${placeholders})
             AND status IN ('completed', 'failed', 'interrupted')
             AND target_storage_path <> ''`,
          userIds
        ).then(([migrationTaskUsers]) => {
          const taskUserIds = migrationTaskUsers
            .map((item) => Number(item.userId || 0))
            .filter((item, index, list) => item > 0 && list.indexOf(item) === index);
          // 异步执行修复，不等待完成
          taskUserIds.forEach((taskUserId) => {
            repairUserStorageRecordsByExistingFiles(taskUserId, configuredStorageDisks).catch(() => {});
          });
        }).catch(() => {});
      }
      const storageDiskMap = new Map();
      const currentNormalStorageDiskIdsMap = new Map();
      const currentNormalStorageMountsMap = new Map();
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => "?").join(", ");
        const [storageDiskRows] = await pool.query(`
          SELECT
            user_id AS userId,
            GROUP_CONCAT(
              DISTINCT CASE
                WHEN space_type = 'hidden' THEN ?
                WHEN LOCATE('|', storage_name) > 0 THEN SUBSTRING_INDEX(storage_name, '|', 1)
                ELSE ''
              END
              ORDER BY CASE
                WHEN space_type = 'hidden' THEN ?
                WHEN LOCATE('|', storage_name) > 0 THEN SUBSTRING_INDEX(storage_name, '|', 1)
                ELSE ''
              END
              SEPARATOR ','
            ) AS storageDiskIds
          FROM files
          WHERE deleted_at IS NULL AND user_id IN (${placeholders})
          GROUP BY user_id
        `, [HIDDEN_SPACE_DISK_TOKEN, HIDDEN_SPACE_DISK_TOKEN, ...userIds]);
        storageDiskRows.forEach((row) => {
          const diskIds = String(row.storageDiskIds || "")
            .split(",")
            .map((item) => item.trim())
            .filter((item, index, list) => list.indexOf(item) === index);
          const diskNames = diskIds
            .map((item) => storageDiskLabelMap.get(item) || item || storageDiskLabelMap.get(""))
            .filter(Boolean);
          storageDiskMap.set(Number(row.userId), diskNames.join(", "));
        });
        const [normalStorageDiskRows] = await pool.query(`
          SELECT
            user_id AS userId,
            GROUP_CONCAT(
              DISTINCT CASE
                WHEN LOCATE('|', storage_name) > 0 THEN SUBSTRING_INDEX(storage_name, '|', 1)
                ELSE ''
              END
              ORDER BY CASE
                WHEN LOCATE('|', storage_name) > 0 THEN SUBSTRING_INDEX(storage_name, '|', 1)
                ELSE ''
              END
              SEPARATOR ','
            ) AS storageDiskIds
          FROM files
          WHERE deleted_at IS NULL AND space_type = 'normal' AND user_id IN (${placeholders})
          GROUP BY user_id
        `, userIds);
        normalStorageDiskRows.forEach((row) => {
          const diskIds = String(row.storageDiskIds || "")
            .split(",")
            .map((item) => {
              const normalizedItem = item.trim();
              return normalizedItem || programStorageDiskId;
            })
            .filter((item, index, list) => list.indexOf(item) === index);
          currentNormalStorageDiskIdsMap.set(Number(row.userId), diskIds);
          currentNormalStorageMountsMap.set(
            Number(row.userId),
            diskIds
              .map((item) => storageDiskLabelMap.get(item) || item || storageDiskLabelMap.get(""))
              .filter((item, index, list) => item && list.indexOf(item) === index)
          );
        });
      }
      const groupContextMap = await loadUserGroupContextMap(users.map((item) => item.id));
      const result = users.map((u) => {
        const groupContext = groupContextMap.get(Number(u.id)) || { groupIds: [], groupNames: [], groupPermissions: [], groupQuotas: [] };
        const effectivePermissionResult = getEffectivePermissions(u.permissions, groupContext.groupPermissions, groupContext.groupIds);
        
        const effectiveQuota = resolveGroupQuota(undefined, groupContext.groupQuotas);
        
        return {
          ...u,
          permissions: parsePermissionList(u.permissions, { fallbackToAll: false }),
          effectivePermissions: effectivePermissionResult.permissions,
          permissionSource: effectivePermissionResult.source,
          groupIds: groupContext.groupIds,
          groupNames: groupContext.groupNames,
          effectiveQuota: effectiveQuota,
          used: Number(u.used),
          fileCount: Number(u.fileCount),
          storageDiskDisplay: storageDiskMap.get(Number(u.id)) || "-",
          currentNormalStorageDiskIds: currentNormalStorageDiskIdsMap.get(Number(u.id)) || [],
          currentNormalStorageMounts: currentNormalStorageMountsMap.get(Number(u.id)) || []
        };
      });
      res.json(result);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/users/:id/storage-disk-progress", authRequired, adminRequired, async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: "用户 ID 不合法" });
    }
    const taskState = await getUserStorageMigrationTaskState(userId);
    if (!taskState) {
      return res.json({
        userId,
        status: "idle",
        progress: 0,
        movedCount: 0,
        totalCount: 0,
        movedBytes: 0,
        totalBytes: 0,
        message: ""
      });
    }
    res.json(taskState);
  });

  app.put("/api/users/:id/storage-disk", authRequired, adminRequired, async (req, res) => {
    const userId = Number(req.params.id);
    const targetMountPath = String(req.body && req.body.targetMountPath || "").trim();
    const targetStoragePath = String(req.body && req.body.targetStoragePath || "").trim();
    if (!userId) {
      return res.status(400).json({ message: "用户 ID 不合法" });
    }
    if (!targetMountPath) {
      return res.status(400).json({ message: "请选择目标挂载点" });
    }
    if (!targetStoragePath) {
      return res.status(400).json({ message: "请选择目标存储目录" });
    }

    const currentStorageConfig = typeof getStorageDiskConfig === "function"
      ? getStorageDiskConfig()
      : { defaultDiskId: "", disks: [] };
    const storageDisks = Array.isArray(currentStorageConfig && currentStorageConfig.disks)
      ? currentStorageConfig.disks
      : [];
    const programStorageRoot = resolveStorageRootDir("normal");
    const programStorageMount = getProgramStorageMount(programStorageRoot);
    const targetMountKey = normalizeStorageMountKey(targetMountPath);
    const targetStoragePathKey = normalizeStorageDirPath(targetStoragePath);
    const currentTaskState = await getUserStorageMigrationTaskState(userId);
    if (currentTaskState && currentTaskState.status === "running") {
      return res.status(409).json({ message: "该用户已有迁移任务正在执行" });
    }
    const targetDisk = storageDisks.find((item) => {
      if (!item || item.enabled === false) return false;
      const mountMatched = getStorageDiskMountKeys(item, programStorageMount).has(targetMountKey);
      const pathMatched = normalizeStorageDirPath(item.path) === targetStoragePathKey;
      return mountMatched && pathMatched;
    });
    if (!targetDisk || !targetDisk.path) {
      return res.status(400).json({ message: "目标挂载点与存储目录不匹配，或存储盘未启用" });
    }

    const programDiskId = getProgramStorageDiskId(storageDisks, programStorageRoot);
    const storageDiskMountMap = new Map(
      storageDisks.map((item) => [String(item && item.id || ""), getStorageDiskMountPath(item, programStorageMount)])
    );
    const defaultMountPath = storageDiskMountMap.get(currentStorageConfig.defaultDiskId) || programStorageMount;

    try {
      const [fileRows] = await pool.query(
        "SELECT id, storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName, size FROM files WHERE user_id = ? AND space_type = 'normal'",
        [userId]
      );
      if (!fileRows.length) {
        return res.json({ message: "该用户没有可迁移的普通空间文件", movedCount: 0 });
      }

      const movePlans = [];
      const seenStorageNames = new Set();
      let totalMoveBytes = 0;
      for (const row of fileRows) {
        const parsedStorage = parseStoredStorageNameLocal(row.storageName);
        const relativePath = parsedStorage.relativePath;
        if (!relativePath) continue;
        const currentDiskId = parsedStorage.diskId || programDiskId;
        const currentMountPath = storageDiskMountMap.get(currentDiskId) || defaultMountPath;
        if (normalizeStorageMountKey(currentMountPath) === targetMountKey) continue;

        const sourcePath = resolveAbsoluteStoragePath(row.storageName, "normal");
        if (!sourcePath || !fs.existsSync(sourcePath)) {
          return res.status(400).json({ message: `文件 ${row.id} 不存在，无法迁移` });
        }
        const sourceRootDir = getStorageRootDirFromAbsolutePath(sourcePath, relativePath);

        const targetPath = path.resolve(String(targetDisk.path), relativePath);
        const nextStorageName = resolveStorageNameFromPath(targetPath, relativePath, String(targetDisk.path), String(targetDisk.id || ""));
        if (!nextStorageName || seenStorageNames.has(nextStorageName)) {
          return res.status(400).json({ message: "目标储存盘存在冲突文件路径，无法迁移" });
        }
        if (fs.existsSync(targetPath) && path.resolve(targetPath) !== path.resolve(sourcePath)) {
          return res.status(400).json({ message: `目标储存盘已存在文件 ${path.basename(targetPath)}` });
        }
        seenStorageNames.add(nextStorageName);

        let sourceThumbnailPath = "";
        let targetThumbnailPath = "";
        let nextThumbnailStorageName = null;
        let thumbnailRelativePath = "";
        let thumbnailSourceRootDir = "";
        if (row.thumbnailStorageName) {
          const parsedThumbnail = parseStoredStorageNameLocal(row.thumbnailStorageName);
          if (parsedThumbnail.relativePath) {
            const resolvedThumbnailSource = resolveAbsoluteStoragePath(row.thumbnailStorageName, "normal");
            if (resolvedThumbnailSource && fs.existsSync(resolvedThumbnailSource)) {
              sourceThumbnailPath = resolvedThumbnailSource;
              thumbnailRelativePath = parsedThumbnail.relativePath;
              thumbnailSourceRootDir = getStorageRootDirFromAbsolutePath(resolvedThumbnailSource, parsedThumbnail.relativePath);
              targetThumbnailPath = path.resolve(String(targetDisk.path), parsedThumbnail.relativePath);
              nextThumbnailStorageName = resolveStorageNameFromPath(
                targetThumbnailPath,
                parsedThumbnail.relativePath,
                String(targetDisk.path),
                String(targetDisk.id || "")
              );
              if (fs.existsSync(targetThumbnailPath) && path.resolve(targetThumbnailPath) !== path.resolve(sourceThumbnailPath)) {
                return res.status(400).json({ message: `目标储存盘已存在缩略图 ${path.basename(targetThumbnailPath)}` });
              }
            }
          }
        }

        totalMoveBytes += Math.max(0, Number(row.size || 0));
        movePlans.push({
          id: Number(row.id),
          size: Math.max(0, Number(row.size || 0)),
          relativePath,
          sourceRootDir,
          sourcePath,
          targetPath,
          nextStorageName,
          sourceThumbnailPath,
          thumbnailRelativePath,
          thumbnailSourceRootDir,
          targetThumbnailPath,
          nextThumbnailStorageName
        });
      }

      if (!movePlans.length) {
        return res.json({ message: "该用户普通空间文件已在目标储存盘", movedCount: 0 });
      }

      const freeBytes = getStorageAvailableBytes(String(targetDisk.path));
      if (Number.isFinite(freeBytes) && freeBytes >= 0 && freeBytes < totalMoveBytes) {
        return res.status(400).json({ message: "目标储存盘可用空间不足" });
      }
      const taskId = createUserStorageMigrationTaskId(userId);
      await setUserStorageMigrationTaskState(userId, {
        taskId,
        status: "running",
        progress: 0,
        movedCount: 0,
        totalCount: movePlans.length,
        movedBytes: 0,
        totalBytes: totalMoveBytes,
        targetMountPath,
        targetStoragePath,
        message: `正在迁移 0/${movePlans.length}`
      });
      Promise.resolve().then(() => executeUserStorageMigrationTask({
        userId,
        taskId,
        movePlans,
        totalMoveBytes,
        targetDisk,
        targetMountPath,
        targetStoragePath,
        programStorageMount
      }));
      res.status(202).json({
        started: true,
        taskId,
        progress: 0,
        message: `开始迁移，目标盘 ${getStorageDiskMountPath(targetDisk, programStorageMount) || targetMountPath}`
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/users", authRequired, adminRequired, async (req, res) => {
    const { username, password, name, phone, permissions, role, avatar, groupIds } = req.body;
    if (!username || !password) {
      res.status(400).json({ message: "用户名和密码不能为空" });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: "密码至少 6 位" });
      return;
    }
    const normalizedGroupIds = normalizeIdList(groupIds);
    const normalizedPermissions = permissions === undefined
      ? null
      : permissions === null
        ? null
        : JSON.stringify(parsePermissionList(permissions, { fallbackToAll: false }));
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [existing] = await connection.query("SELECT id FROM users WHERE username = ?", [username]);
      if (existing.length > 0) {
        await connection.rollback();
        res.status(400).json({ message: "用户名已存在" });
        return;
      }
      if (normalizedGroupIds.length > 0) {
        const placeholders = normalizedGroupIds.map(() => "?").join(", ");
        const [groupRows] = await connection.query(`SELECT id FROM user_groups WHERE id IN (${placeholders})`, normalizedGroupIds);
        if (groupRows.length !== normalizedGroupIds.length) {
          await connection.rollback();
          res.status(400).json({ message: "用户组不存在" });
          return;
        }
      }
      const [insertResult] = await connection.query(
        "INSERT INTO users (username, password_hash, name, phone, permissions, role, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          username,
          await hashPassword(password),
          name || null,
          phone || null,
          normalizedPermissions,
          role || "user",
          avatar || null
        ]
      );
      const userId = Number(insertResult.insertId);
      if (normalizedGroupIds.length > 0) {
        await insertUserGroupMembers(connection, userId, normalizedGroupIds);
      }
      await connection.commit();
      res.json({ message: "用户创建成功" });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  app.put("/api/users/:id", authRequired, adminRequired, async (req, res) => {
    const userId = Number(req.params.id);
    const { password, name, phone, permissions, role, avatar, groupIds } = req.body;

    if (!userId) return res.status(400).json({ message: "ID 不合法" });

    // Protect default admin user (ID 1)
    if (userId === 1 && role !== undefined && role !== "admin") {
      return res.status(400).json({ message: "不能更改默认管理员的角色" });
    }
    if (password !== undefined && password !== "" && String(password).length < 6) {
      return res.status(400).json({ message: "密码至少 6 位" });
    }

    const normalizedGroupIds = groupIds === undefined ? undefined : normalizeIdList(groupIds);
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const updates = [];
      const params = [];

      if (password) {
        updates.push("password_hash = ?");
        params.push(await hashPassword(password));
      }
      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }
      if (phone !== undefined) {
        updates.push("phone = ?");
        params.push(phone);
      }
      if (permissions !== undefined) {
        updates.push("permissions = ?");
        params.push(permissions === null ? null : JSON.stringify(parsePermissionList(permissions, { fallbackToAll: false })));
      }
      if (role !== undefined) {
        updates.push("role = ?");
        params.push(role);
      }
      if (avatar !== undefined) {
        updates.push("avatar = ?");
        params.push(avatar);
      }
      if (normalizedGroupIds !== undefined && normalizedGroupIds.length > 0) {
        const placeholders = normalizedGroupIds.map(() => "?").join(", ");
        const [groupRows] = await connection.query(`SELECT id FROM user_groups WHERE id IN (${placeholders})`, normalizedGroupIds);
        if (groupRows.length !== normalizedGroupIds.length) {
          await connection.rollback();
          return res.status(400).json({ message: "用户组不存在" });
        }
      }
      if (updates.length > 0) {
        params.push(userId);
        await connection.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
      }
      if (normalizedGroupIds !== undefined) {
        await connection.query("DELETE FROM user_group_members WHERE user_id = ?", [userId]);
        if (normalizedGroupIds.length > 0) {
          await insertUserGroupMembers(connection, userId, normalizedGroupIds);
        }
      }
      if (updates.length === 0 && normalizedGroupIds === undefined) {
        await connection.rollback();
        return res.json({ message: "无变更" });
      }

      await connection.commit();
      res.json({ message: "更新成功" });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  app.delete("/api/users/:id", authRequired, adminRequired, async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ message: "ID不合法" });

    if (userId === 1) {
      return res.status(400).json({ message: "不能删除默认管理员账号" });
    }

    try {
      const [files] = await pool.query("SELECT storage_name, thumbnail_storage_name, space_type FROM files WHERE user_id = ? AND deleted_at IS NULL", [userId]);
      await pool.query("DELETE FROM files WHERE user_id = ? AND deleted_at IS NULL", [userId]);
      await pool.query("DELETE FROM folders WHERE user_id = ? AND deleted_at IS NULL", [userId]);
      await pool.query("DELETE FROM shares WHERE user_id = ?", [userId]);
      await pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
      await pool.query("DELETE FROM user_group_members WHERE user_id = ?", [userId]);
      await pool.query("DELETE FROM users WHERE id = ?", [userId]);

      files.forEach((f) => {
        try {
          const targetPath = resolveAbsoluteStoragePath(f.storage_name, f.space_type);
          if (targetPath) fs.unlinkSync(targetPath);
          if (f.thumbnail_storage_name) {
            const thumbnailPath = resolveAbsoluteStoragePath(f.thumbnail_storage_name, f.space_type);
            if (thumbnailPath && fs.existsSync(thumbnailPath)) {
              fs.unlinkSync(thumbnailPath);
            }
          }
        } catch (e) {}
      });

      res.json({ message: "用户已删除" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/user-groups", authRequired, adminRequired, async (_req, res) => {
    try {
      const [groups] = await pool.query(`
      SELECT g.id, g.name, g.permissions, g.created_at,
      g.max_upload_size_mb AS maxUploadSizeMb,
      g.max_upload_file_count AS maxUploadFileCount,
      g.quota_bytes AS quotaBytes,
      (SELECT COUNT(*) FROM user_group_members m WHERE m.group_id = g.id) AS memberCount
      FROM user_groups g
      ORDER BY g.id ASC
    `);
      res.json(
        groups.map((group) => ({
          id: Number(group.id),
          name: group.name,
          permissions: parsePermissionList(group.permissions, { fallbackToAll: false }),
          maxUploadSizeMb: normalizeUserGroupUploadMaxSizeMb(group.maxUploadSizeMb),
          maxUploadSizeGb: convertUserGroupUploadSizeMbToGb(group.maxUploadSizeMb),
          maxUploadFileCount: normalizeUserGroupUploadMaxFileCount(group.maxUploadFileCount),
          quotaBytes: Number(group.quotaBytes || -1),
          memberCount: Number(group.memberCount || 0)
        }))
      );
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/user-groups", authRequired, adminRequired, async (req, res) => {
    const name = String(req.body && req.body.name || "").trim();
    const permissions = parsePermissionList(req.body && req.body.permissions, { fallbackToAll: false });
    const maxUploadSizeMb = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadSizeGb")
      ? convertUserGroupUploadSizeGbToMb(req.body.maxUploadSizeGb)
      : normalizeUserGroupUploadMaxSizeMb(req.body && req.body.maxUploadSizeMb);
    const maxUploadFileCount = normalizeUserGroupUploadMaxFileCount(req.body && req.body.maxUploadFileCount);
    const quotaBytes = req.body && req.body.quotaBytes !== undefined ? Number(req.body.quotaBytes) : -1;
    if (!name) {
      res.status(400).json({ message: "用户组名称不能为空" });
      return;
    }
    try {
      const [existing] = await pool.query("SELECT id FROM user_groups WHERE name = ? LIMIT 1", [name]);
      if (existing.length > 0) {
        res.status(400).json({ message: "用户组名称已存在" });
        return;
      }
      await pool.query(
        "INSERT INTO user_groups (name, permissions, max_upload_size_mb, max_upload_file_count, quota_bytes) VALUES (?, ?, ?, ?, ?)",
        [name, JSON.stringify(permissions), maxUploadSizeMb, maxUploadFileCount, quotaBytes]
      );
      res.json({ message: "用户组创建成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/user-groups/:id", authRequired, adminRequired, async (req, res) => {
    const groupId = Number(req.params.id);
    if (!groupId) {
      res.status(400).json({ message: "用户组 ID 不合法" });
      return;
    }
    const name = req.body && req.body.name !== undefined ? String(req.body.name || "").trim() : undefined;
    const permissions = req.body && req.body.permissions !== undefined
      ? parsePermissionList(req.body.permissions, { fallbackToAll: false })
      : undefined;
    const hasMaxUploadSizeMb = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadSizeMb");
    const hasMaxUploadSizeGb = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadSizeGb");
    const hasMaxUploadFileCount = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadFileCount");
    const hasQuotaBytes = req.body && Object.prototype.hasOwnProperty.call(req.body, "quotaBytes");
    const maxUploadSizeMb = hasMaxUploadSizeGb
      ? convertUserGroupUploadSizeGbToMb(req.body.maxUploadSizeGb)
      : hasMaxUploadSizeMb
        ? normalizeUserGroupUploadMaxSizeMb(req.body.maxUploadSizeMb)
        : undefined;
    const maxUploadFileCount = hasMaxUploadFileCount
      ? normalizeUserGroupUploadMaxFileCount(req.body.maxUploadFileCount)
      : undefined;
    const quotaBytes = hasQuotaBytes ? Number(req.body.quotaBytes) : undefined;
    if (name !== undefined && !name) {
      res.status(400).json({ message: "用户组名称不能为空" });
      return;
    }
    try {
      if (name !== undefined) {
        const [existing] = await pool.query("SELECT id FROM user_groups WHERE name = ? AND id <> ? LIMIT 1", [name, groupId]);
        if (existing.length > 0) {
          res.status(400).json({ message: "用户组名称已存在" });
          return;
        }
      }
      const updates = [];
      const params = [];
      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }
      if (permissions !== undefined) {
        updates.push("permissions = ?");
        params.push(JSON.stringify(permissions));
      }
      if (maxUploadSizeMb !== undefined) {
        updates.push("max_upload_size_mb = ?");
        params.push(maxUploadSizeMb);
      }
      if (maxUploadFileCount !== undefined) {
        updates.push("max_upload_file_count = ?");
        params.push(maxUploadFileCount);
      }
      if (quotaBytes !== undefined) {
        updates.push("quota_bytes = ?");
        params.push(quotaBytes);
      }
      if (updates.length === 0) {
        res.json({ message: "无变更" });
        return;
      }
      params.push(groupId);
      const [result] = await pool.query(`UPDATE user_groups SET ${updates.join(", ")} WHERE id = ?`, params);
      if (!result.affectedRows) {
        res.status(404).json({ message: "用户组不存在" });
        return;
      }
      res.json({ message: "用户组更新成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/user-groups/:id", authRequired, adminRequired, async (req, res) => {
    const groupId = Number(req.params.id);
    if (!groupId) {
      res.status(400).json({ message: "用户组ID不合法" });
      return;
    }
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query("DELETE FROM user_group_members WHERE group_id = ?", [groupId]);
      const [result] = await connection.query("DELETE FROM user_groups WHERE id = ?", [groupId]);
      if (!result.affectedRows) {
        await connection.rollback();
        res.status(404).json({ message: "用户组不存在" });
        return;
      }
      await connection.commit();
      res.json({ message: "用户组删除成功" });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  app.post("/api/users/avatar-upload", authRequired, adminRequired, avatarUploadSingle("avatar"), async (req, res) => {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ message: "请选择头像图片" });
      return;
    }
    const mimeToExtMap = {
      "image/jpeg": ".jpg",
      "image/pjpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/bmp": ".bmp",
      "image/x-ms-bmp": ".bmp",
      "image/gif": ".gif"
    };
    const ext = mimeToExtMap[String(req.file.mimetype || "").toLowerCase()] || ".png";
    const avatarTempDir = path.join(UPLOAD_DIR, "avatar", "temp");
    const avatarFileName = `avatar-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    const avatarRelativePath = `avatar/temp/${avatarFileName}`;
    const avatarAbsolutePath = path.join(avatarTempDir, avatarFileName);
    try {
      fs.mkdirSync(avatarTempDir, { recursive: true });
      const compressedBuffer = await sharp(req.file.buffer)
        .resize(160, 160, { fit: "inside", withoutEnlargement: true })
        .toBuffer();
      fs.writeFileSync(avatarAbsolutePath, compressedBuffer);
      res.json({ message: "头像上传成功", avatar: `/uploads/${avatarRelativePath}` });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
