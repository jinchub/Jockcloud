/**
 * 存储工具模块
 * 抽取 users.js 中的存储相关工具函数
 * 保持与原有代码相同的闭包模式，通过工厂函数接收依赖
 */

const os = require("os");
const path = require("path");
const { execSync, spawnSync, spawn } = require("child_process");

/**
 * 创建存储工具实例
 * @param {Object} deps - 依赖对象 { fs, getStorageDiskConfig, resolveStorageRootDir, resolveStorageNameFromPath, pool }
 * @returns {Object} 存储工具方法集合
 */
const createStorageHelpers = (deps) => {
  const { fs, getStorageDiskConfig, resolveStorageRootDir, resolveStorageNameFromPath, pool } = deps;

  /**
   * 格式化字节数
   */
  const formatBytes = (bytes) => {
    const numericBytes = Number(bytes);
    if (!Number.isFinite(numericBytes) || numericBytes < 0) return "0 B";
    if (numericBytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(numericBytes) / Math.log(1024)));
    return `${parseFloat((numericBytes / Math.pow(1024, index)).toFixed(2))} ${units[index]}`;
  };

  /**
   * 获取存储可用字节数
   */
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

  /**
   * 获取存储统计信息
   */
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

  /**
   * 安全获取文件状态
   */
  const safeStatPath = (targetPath) => {
    try {
      return fs.statSync(targetPath);
    } catch (error) {
      return null;
    }
  };

  /**
   * 应用文件时间戳
   */
  const applyPathTimes = (targetPath, stats) => {
    if (!targetPath || !stats) return;
    try {
      fs.utimesSync(targetPath, stats.atime, stats.mtime);
    } catch (error) {}
  };

  /**
   * 移动文件到目标路径
   */
  const moveFileToPath = (sourcePath, targetPath) => {
    const sourceStats = safeStatPath(sourcePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    applyPathTimes(targetPath, sourceStats);
    fs.unlinkSync(sourcePath);
  };

  /**
   * 检查 rsync 是否可用
   */
  let rsyncAvailabilityCache = null;
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

  /**
   * 使用 rsync 移动文件并报告进度
   */
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

  /**
   * 使用 Node.js 流移动文件并报告进度
   */
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

  /**
   * 回滚已移动的文件
   */
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

  /**
   * 收集目录时间信息
   */
  const collectDirectoryTimesFromRelativePath = (relativePath, sourceRootDir, targetRootDir, dirTimeMap) => {
    if (!dirTimeMap || !sourceRootDir || !targetRootDir) return;
    const normalizedRelativePath = String(relativePath || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");
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

  /**
   * 应用目录时间映射
   */
  const applyDirectoryTimesMap = (dirTimeMap) => {
    Array.from((dirTimeMap || new Map()).entries())
      .sort((left, right) => String(right[0] || "").length - String(left[0] || "").length)
      .forEach(([targetDirPath, sourceDirStats]) => {
        applyPathTimes(targetDirPath, sourceDirStats);
      });
  };

  /**
   * 获取已启用存储的可用字节数
   */
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

  /**
   * 验证配额限制
   */
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

  return {
    formatBytes,
    getStorageAvailableBytes,
    getStorageStatsByPath,
    safeStatPath,
    applyPathTimes,
    moveFileToPath,
    isRsyncAvailable,
    moveFileToPathWithRsyncProgress,
    moveFileToPathWithProgress,
    rollbackMovedFiles,
    collectDirectoryTimesFromRelativePath,
    applyDirectoryTimesMap,
    getEnabledStorageAvailableBytes,
    validateQuotaLimit
  };
};

module.exports = {
  createStorageHelpers
};
