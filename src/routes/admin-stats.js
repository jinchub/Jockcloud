const os = require("os");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const NFS_AUTO_MOUNT_BASE_DIR = path.join(process.cwd(), ".jockcloud-nfs-mounts");
const RAW_NFS_REMOTE_PATH_PATTERN = /^(?![a-zA-Z]:[\\/])[^\\/:]+:\/.+/;

const normalizeDiskStats = (item, fallbackMount = "") => {
  const totalBytes = Math.max(0, Number(item && item.totalBytes || item && item.total || 0));
  const freeBytes = Math.max(0, Number(item && item.freeBytes || item && item.free || 0));
  const usedBytes = totalBytes > 0
    ? Math.max(0, totalBytes - freeBytes)
    : Math.max(0, Number(item && item.usedBytes || item && item.used || 0));
  return {
    mount: String(item && item.mount || fallbackMount || "").trim(),
    label: String(item && item.label || item && item.name || fallbackMount || "").trim(),
    totalBytes,
    usedBytes,
    freeBytes
  };
};

const normalizeDiskId = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
const buildDiskIdFromMount = (mount) => {
  const normalized = normalizeDiskId(String(mount || "").replace(/[:\\\/]+/g, "-"));
  return normalized || "program-disk";
};
const buildNfsDiskId = (storagePath) => {
  const rawPath = String(storagePath || "").trim();
  const normalizedSource = RAW_NFS_REMOTE_PATH_PATTERN.test(rawPath) ? rawPath : path.resolve(rawPath);
  const normalized = normalizeDiskId(`nfs-${normalizedSource.replace(/[:\\\/]+/g, "-")}`);
  return normalized || `nfs-${Date.now()}`;
};
const isRawNfsRemotePath = (value) => RAW_NFS_REMOTE_PATH_PATTERN.test(String(value || "").trim());
const shellQuote = (value) => `'${String(value || "").replace(/'/g, `'\\''`)}'`;
const isWindowsUncPath = (value) => /^\\\\[^\\]+\\[^\\]+/.test(String(value || "").trim());
const getNfsAutoMountPath = (diskId) => path.join(NFS_AUTO_MOUNT_BASE_DIR, String(diskId || "nfs"));
const isMountedPath = (targetPath) => {
  if (os.platform() === "win32") return true;
  try {
    execSync(`mountpoint -q ${shellQuote(targetPath)}`, { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
};
const ensureAutoMountedNfsPath = ({ remotePath, mountPath }) => {
  if (os.platform() === "win32") {
    return { error: "Windows 暂不支持程序自动挂载原始 NFS 地址，请使用已挂载网络路径" };
  }
  try {
    fs.mkdirSync(mountPath, { recursive: true });
    const alreadyMounted = isMountedPath(mountPath);
    if (!alreadyMounted) {
      execSync(`mount -t nfs ${shellQuote(remotePath)} ${shellQuote(mountPath)}`, {
        stdio: "ignore",
        maxBuffer: 1024 * 1024
      });
    }
    return {
      error: "",
      mounted: true,
      newlyMounted: !alreadyMounted,
      mountPath
    };
  } catch (error) {
    return { error: "原始 NFS 远程路径自动挂载失败，请确认服务器已安装 NFS 客户端且当前进程有挂载权限" };
  }
};
const unmountAutoMountedNfsPath = (mountPath) => {
  if (os.platform() === "win32") return;
  try {
    execSync(`umount ${shellQuote(mountPath)}`, { stdio: "ignore", maxBuffer: 1024 * 1024 });
  } catch (error) {}
};
const execWindowsPowerShellJson = (script, fallback = "null") => {
  const wrappedScript = [
    "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$OutputEncoding = [System.Text.Encoding]::UTF8",
    script
  ].join("; ");
  const output = execSync(`powershell -NoProfile -Command "${wrappedScript}"`, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(String(output || fallback));
};

const getStorageStatsByPath = (storageRootDir) => {
  try {
    const resolvedRoot = path.resolve(storageRootDir || process.cwd());
    if (os.platform() === "win32") {
      const driveName = path.parse(resolvedRoot).root.replace(/[:\\\/]/g, "");
      if (!driveName) return null;
      const payload = execWindowsPowerShellJson(
        `Get-PSDrive -Name '${driveName}' -PSProvider FileSystem | Select-Object Name, Used, Free | ConvertTo-Json -Compress`,
        "null"
      );
      if (!payload) return null;
      return normalizeDiskStats({
        mount: `${payload.Name}:\\`,
        label: payload.Name,
        totalBytes: Number(payload.Used || 0) + Number(payload.Free || 0),
        freeBytes: Number(payload.Free || 0)
      }, `${driveName}:\\`);
    }
    const output = execSync(`df -k "${resolvedRoot.replace(/"/g, '\\"')}" | tail -1`, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const parts = String(output || "").trim().split(/\s+/);
    if (parts.length < 6) return null;
    return normalizeDiskStats({
      mount: parts[5],
      label: parts[0],
      totalBytes: Number(parts[1] || 0) * 1024,
      usedBytes: Number(parts[2] || 0) * 1024,
      freeBytes: Number(parts[3] || 0) * 1024
    }, parts[5]);
  } catch (error) {
    return null;
  }
};

const listSystemDisks = () => {
  try {
    if (os.platform() === "win32") {
      const payload = execWindowsPowerShellJson(
        'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, VolumeName, Size, FreeSpace | ConvertTo-Json -Compress',
        "[]"
      );
      const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
      return rows.map((item) => normalizeDiskStats({
        mount: `${String(item.DeviceID || "").replace(/\\$/, "")}\\`,
        label: item.VolumeName || item.DeviceID,
        totalBytes: Number(item.Size || 0),
        freeBytes: Number(item.FreeSpace || 0)
      })).filter((item) => item.mount);
    }
    const output = execSync("df -kP", { encoding: "utf8", maxBuffer: 1024 * 1024 });
    return String(output || "")
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 6)
      .filter((parts) => !["tmpfs", "devtmpfs", "overlay", "squashfs"].includes(String(parts[0] || "").toLowerCase()))
      .map((parts) => normalizeDiskStats({
        mount: parts[5],
        label: parts[0],
        totalBytes: Number(parts[1] || 0) * 1024,
        usedBytes: Number(parts[2] || 0) * 1024,
        freeBytes: Number(parts[3] || 0) * 1024
      }))
      .filter((item) => item.mount);
  } catch (error) {
    return [];
  }
};

const findSystemDiskByPath = (systemDisks, targetPath) => {
  const resolvedTarget = path.resolve(targetPath || "");
  if (!resolvedTarget) return null;
  if (os.platform() === "win32") {
    const root = path.parse(resolvedTarget).root.toLowerCase();
    return systemDisks.find((item) => String(item.mount || "").toLowerCase() === root) || null;
  }
  const normalizedTarget = resolvedTarget.endsWith(path.sep) ? resolvedTarget : `${resolvedTarget}${path.sep}`;
  const matched = systemDisks
    .filter((item) => {
      const mount = String(item.mount || "").trim();
      if (!mount) return false;
      if (mount === "/") return true;
      return normalizedTarget === `${mount}${path.sep}` || normalizedTarget.startsWith(`${mount}${path.sep}`);
    })
    .sort((left, right) => String(right.mount || "").length - String(left.mount || "").length);
  return matched[0] || null;
};

const buildStorageDiskPayload = (storageConfig, systemDisks, programStorageRoot) => {
  const config = storageConfig && typeof storageConfig === "object" ? storageConfig : { defaultDiskId: "", disks: [] };
  const diskList = Array.isArray(config.disks) ? config.disks : [];
  const programDisk = findSystemDiskByPath(systemDisks, programStorageRoot);
  const programDiskId = programDisk ? buildDiskIdFromMount(programDisk.mount) : "";
  const systemDiskIds = new Set(systemDisks.map((item) => buildDiskIdFromMount(item.mount)));
  const savedMap = new Map(
    diskList.map((item) => [String(item.id || ""), item && typeof item === "object" ? item : {}])
  );
  const systemStorageDisks = systemDisks.map((item) => {
    const diskId = buildDiskIdFromMount(item.mount);
    const savedItem = savedMap.get(diskId) || {};
    const isProgramDisk = diskId === programDiskId;
    const storagePath = isProgramDisk
      ? programStorageRoot
      : path.join(item.mount, path.basename(programStorageRoot));
    return {
      id: diskId,
      name: String(item.label || item.mount || diskId),
      mount: item.mount,
      path: storagePath,
      enabled: savedItem.enabled === undefined ? isProgramDisk : Boolean(savedItem.enabled),
      source: "system",
      isProgramDisk,
      systemDiskMount: item.mount,
      totalBytes: item.totalBytes,
      usedBytes: item.usedBytes,
      freeBytes: item.freeBytes
    };
  });
  const nfsStorageDisks = diskList
    .filter((item) => String(item && item.source || "").trim().toLowerCase() === "nfs" || !systemDiskIds.has(String(item && item.id || "")))
    .map((item) => {
      const resolvedPath = path.resolve(String(item.path || "").trim());
      const matchedSystemDisk = findSystemDiskByPath(systemDisks, resolvedPath) || getStorageStatsByPath(resolvedPath);
      return {
        id: String(item.id || buildNfsDiskId(resolvedPath)),
        name: String(item.name || path.basename(resolvedPath) || resolvedPath),
        mount: String(item.remotePath || (matchedSystemDisk ? matchedSystemDisk.mount : resolvedPath)),
        path: resolvedPath,
        enabled: item.enabled === undefined ? true : Boolean(item.enabled),
        source: "nfs",
        remotePath: String(item.remotePath || resolvedPath),
        mountMode: String(item.mountMode || "").trim().toLowerCase() === "auto" ? "auto" : "direct",
        isProgramDisk: false,
        systemDiskMount: String(item.mountMode || "").trim().toLowerCase() === "auto"
          ? resolvedPath
          : (matchedSystemDisk ? matchedSystemDisk.mount : resolvedPath),
        totalBytes: matchedSystemDisk ? matchedSystemDisk.totalBytes : 0,
        usedBytes: matchedSystemDisk ? matchedSystemDisk.usedBytes : 0,
        freeBytes: matchedSystemDisk ? matchedSystemDisk.freeBytes : 0
      };
    });
  const disks = [...systemStorageDisks, ...nfsStorageDisks];
  const enabledDisks = disks.filter((item) => item.enabled);
  const preferredDefaultId = String(config.defaultDiskId || "");
  const defaultDiskId = enabledDisks.some((item) => item.id === preferredDefaultId)
    ? preferredDefaultId
    : (enabledDisks.find((item) => item.id === programDiskId) || enabledDisks[0] || { id: programDiskId }).id || "";
  return {
    programDiskId,
    defaultDiskId,
    disks
  };
};

const getEnabledStorageStatsSummary = (storageConfig, fallbackPath) => {
  const diskList = Array.isArray(storageConfig && storageConfig.disks) ? storageConfig.disks : [];
  const enabledPaths = diskList
    .filter((item) => item && item.enabled !== false && item.path)
    .map((item) => String(item.path));
  const statsMap = new Map();
  (enabledPaths.length ? enabledPaths : [fallbackPath]).forEach((storagePath) => {
    const stats = getStorageStatsByPath(storagePath);
    if (!stats || !stats.mount || statsMap.has(stats.mount)) return;
    statsMap.set(stats.mount, stats);
  });
  if (!statsMap.size) return null;
  return Array.from(statsMap.values()).reduce((summary, item) => ({
    totalBytes: summary.totalBytes + Math.max(0, Number(item.totalBytes || 0)),
    usedBytes: summary.usedBytes + Math.max(0, Number(item.usedBytes || 0)),
    freeBytes: summary.freeBytes + Math.max(0, Number(item.freeBytes || 0))
  }), {
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0
  });
};

const hasStoredFilesOnDisk = async (pool, diskId, programDiskId) => {
  const normalizedDiskId = String(diskId || "").trim();
  if (!normalizedDiskId) return false;
  let sql = "SELECT COUNT(*) AS total FROM files WHERE space_type = 'normal' AND deleted_at IS NULL AND ";
  const params = [];
  if (normalizedDiskId === String(programDiskId || "").trim()) {
    sql += "(storage_name LIKE ? OR storage_name NOT LIKE ?)";
    params.push(`${normalizedDiskId}|%`, `%|%`);
  } else {
    sql += "storage_name LIKE ?";
    params.push(`${normalizedDiskId}|%`);
  }
  const [rows] = await pool.query(sql, params);
  return Number(rows && rows[0] && rows[0].total || 0) > 0;
};

const enrichStorageDisksWithDataFlags = async (pool, storageConfig) => {
  const disks = Array.isArray(storageConfig && storageConfig.disks) ? storageConfig.disks : [];
  const enrichedDisks = [];
  let defaultDiskLocked = false;
  for (const item of disks) {
    const hasData = await hasStoredFilesOnDisk(pool, item.id, storageConfig.programDiskId);
    if (item.id === storageConfig.defaultDiskId) {
      defaultDiskLocked = hasData;
    }
    enrichedDisks.push({
      ...item,
      hasData
    });
  }
  return {
    ...storageConfig,
    defaultDiskLocked,
    disks: enrichedDisks
  };
};

const validateNfsStoragePathAccess = (storagePath, options = {}) => {
  const rawPath = String(storagePath || "").trim();
  const keepMounted = Boolean(options.keepMounted);
  const diskId = String(options.diskId || buildNfsDiskId(rawPath)).trim();
  if (!rawPath) {
    return { error: "请输入 NFS 挂载目录" };
  }
  if (isRawNfsRemotePath(rawPath)) {
    const mountPath = getNfsAutoMountPath(diskId);
    const mountResult = ensureAutoMountedNfsPath({ remotePath: rawPath, mountPath });
    if (mountResult.error) {
      return { error: mountResult.error };
    }
    try {
      fs.accessSync(mountPath, fs.constants.R_OK | fs.constants.W_OK);
      const testFilePath = path.join(
        mountPath,
        `.jockcloud-nfs-check-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`
      );
      fs.writeFileSync(testFilePath, "ok", "utf8");
      fs.readFileSync(testFilePath, "utf8");
      fs.unlinkSync(testFilePath);
      if (!keepMounted && mountResult.newlyMounted) {
        unmountAutoMountedNfsPath(mountPath);
      }
      return {
        error: "",
        path: mountPath,
        remotePath: rawPath,
        mountMode: "auto",
        displayPath: rawPath
      };
    } catch (error) {
      if (!keepMounted && mountResult.newlyMounted) {
        unmountAutoMountedNfsPath(mountPath);
      }
      return { error: "NFS 挂载目录必须具备读、写、删权限才可以添加" };
    }
  }
  const resolvedPath = path.resolve(rawPath);
  if (!resolvedPath || (!path.isAbsolute(resolvedPath) && !isWindowsUncPath(rawPath))) {
    return { error: "NFS 挂载目录必须是绝对路径或原始 NFS 远程路径" };
  }
  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return { error: "NFS 挂载目录必须是文件夹" };
    }
    fs.accessSync(resolvedPath, fs.constants.R_OK | fs.constants.W_OK);
    const testFilePath = path.join(
      resolvedPath,
      `.jockcloud-nfs-check-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`
    );
    fs.writeFileSync(testFilePath, "ok", "utf8");
    fs.readFileSync(testFilePath, "utf8");
    fs.unlinkSync(testFilePath);
    return {
      error: "",
      path: resolvedPath,
      remotePath: rawPath,
      mountMode: "direct",
      displayPath: rawPath
    };
  } catch (error) {
    return { error: "NFS 挂载目录必须具备读、写、删权限才可以添加" };
  }
};

module.exports = (app, deps) => {
  const {
    authRequired,
    adminRequired,
    pool,
    sendDbError,
    resolveStorageRootDir,
    readSettings,
    writeSettings,
    setStorageDiskConfig,
    getStorageDiskConfig
  } = deps;

  app.get("/api/admin/stats", authRequired, adminRequired, async (req, res) => {
    try {
      const [totalUsed] = await pool.query("SELECT SUM(size) AS total FROM files WHERE deleted_at IS NULL");
      const [userCount] = await pool.query("SELECT COUNT(*) AS total FROM users");
      const currentStorageConfig = getStorageDiskConfig();
      const currentStorageRoot = resolveStorageRootDir("normal");
      const currentStats = getEnabledStorageStatsSummary(currentStorageConfig, currentStorageRoot);
      
      res.json({
        totalUsed: Number(totalUsed[0].total || 0),
        userCount: userCount[0].total,
        totalSpace: currentStats ? currentStats.totalBytes : undefined,
        availableSpace: currentStats ? currentStats.freeBytes : undefined,
        usedSpace: currentStats ? currentStats.usedBytes : undefined
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/admin/storage-disks", authRequired, adminRequired, async (_req, res) => {
    try {
      const settings = await readSettings();
      const systemDisks = listSystemDisks();
      const storageConfig = await enrichStorageDisksWithDataFlags(
        pool,
        buildStorageDiskPayload(settings.system.storageDisks, systemDisks, resolveStorageRootDir("normal"))
      );
      res.json({
        systemDisks,
        storageConfig
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/admin/storage-disks/test-nfs", authRequired, adminRequired, async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const validated = validateNfsStoragePathAccess(String(body.path || "").trim(), { keepMounted: false });
      if (validated.error) {
        return res.status(400).json({ message: validated.error });
      }
      const stats = getStorageStatsByPath(validated.path);
      res.json({
        message: "NFS 挂载目录权限测试通过",
        path: validated.displayPath,
        mountPath: validated.path,
        mountMode: validated.mountMode,
        totalBytes: stats ? stats.totalBytes : 0,
        freeBytes: stats ? stats.freeBytes : 0
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/admin/storage-disks", authRequired, adminRequired, async (req, res) => {
    try {
      const currentSettings = await readSettings();
      const systemDisks = listSystemDisks();
      const mergedConfig = await enrichStorageDisksWithDataFlags(
        pool,
        buildStorageDiskPayload(currentSettings.system.storageDisks, systemDisks, resolveStorageRootDir("normal"))
      );
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const bodyDiskMap = new Map(
        (Array.isArray(body.disks) ? body.disks : []).map((item) => [String(item && item.id || ""), item && typeof item === "object" ? item : {}])
      );
      const systemDisksToSave = mergedConfig.disks.filter((item) => item.source !== "nfs").map((item) => {
        const update = bodyDiskMap.get(item.id) || {};
        return {
          id: item.id,
          name: item.name,
          path: item.path,
          enabled: update.enabled === undefined ? item.enabled : Boolean(update.enabled),
          source: "system"
        };
      });
      const nfsDiskInputList = (Array.isArray(body.disks) ? body.disks : [])
        .filter((item) => item && typeof item === "object" && String(item.source || "").trim().toLowerCase() === "nfs");
      const nfsDisksToSave = [];
      const seenDiskIds = new Set(systemDisksToSave.map((item) => item.id));
      for (const item of nfsDiskInputList) {
        const validated = validateNfsStoragePathAccess(String(item.path || "").trim(), {
          keepMounted: true,
          diskId: buildNfsDiskId(String(item.path || "").trim())
        });
        if (validated.error) {
          return res.status(400).json({ message: validated.error });
        }
        const diskId = buildNfsDiskId(validated.remotePath || validated.path);
        if (!diskId || seenDiskIds.has(diskId)) {
          return res.status(400).json({ message: "NFS 挂载目录配置重复" });
        }
        seenDiskIds.add(diskId);
        nfsDisksToSave.push({
          id: diskId,
          name: String(item.name || path.basename(validated.remotePath || validated.path) || validated.remotePath || validated.path),
          path: validated.path,
          remotePath: validated.remotePath,
          mountMode: validated.mountMode,
          enabled: item.enabled === undefined ? true : Boolean(item.enabled),
          source: "nfs"
        });
      }
      const disks = [...systemDisksToSave, ...nfsDisksToSave];
      if (mergedConfig.defaultDiskLocked) {
        const currentDefaultDisk = disks.find((item) => item.id === mergedConfig.defaultDiskId);
        const requestedDefaultId = String(body.defaultDiskId || "");
        if (requestedDefaultId && requestedDefaultId !== mergedConfig.defaultDiskId) {
          return res.status(400).json({ message: "默认盘已有数据，不能修改默认盘" });
        }
        if (currentDefaultDisk && !currentDefaultDisk.enabled) {
          return res.status(400).json({ message: "默认盘已有数据，不能禁用默认盘" });
        }
      }
      for (const currentDisk of mergedConfig.disks) {
        if (!currentDisk.hasData) continue;
        const nextDisk = disks.find((item) => item.id === currentDisk.id);
        if (!nextDisk) {
          return res.status(400).json({ message: `存储盘 ${currentDisk.name} 已有数据，不能移除` });
        }
        if (!nextDisk.enabled) {
          return res.status(400).json({ message: `存储盘 ${currentDisk.name} 已有数据，不能禁用` });
        }
        if (String(currentDisk.source || "") === "nfs" && path.resolve(String(nextDisk.path || "")) !== path.resolve(String(currentDisk.path || ""))) {
          return res.status(400).json({ message: `存储盘 ${currentDisk.name} 已有数据，不能修改挂载目录` });
        }
      }
      const enabledDisks = disks.filter((item) => item.enabled);
      const requestedDefaultId = String(body.defaultDiskId || "");
      const defaultDiskId = enabledDisks.some((item) => item.id === requestedDefaultId)
        ? requestedDefaultId
        : (enabledDisks.find((item) => item.id === mergedConfig.programDiskId) || enabledDisks[0] || { id: mergedConfig.programDiskId }).id || "";
      const nextConfig = {
        defaultDiskId,
        disks
      };
      const saved = await writeSettings({
        ...currentSettings,
        system: {
          ...currentSettings.system,
          storageDisks: nextConfig
        }
      });
      setStorageDiskConfig(saved.system.storageDisks);
      const savedStorageConfig = await enrichStorageDisksWithDataFlags(
        pool,
        buildStorageDiskPayload(saved.system.storageDisks, systemDisks, resolveStorageRootDir("normal"))
      );
      res.json({
        message: "存储盘配置已保存",
        systemDisks,
        storageConfig: savedStorageConfig
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
