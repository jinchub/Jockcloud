const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

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
    normalizeUserGroupUploadMaxSizeMb,
    normalizeUserGroupUploadMaxFileCount,
    convertUserGroupUploadSizeMbToGb,
    convertUserGroupUploadSizeGbToMb,
    getStorageDiskConfig
  } = deps;
  const HIDDEN_SPACE_DISK_TOKEN = "__hidden__";
  const STORAGE_DISK_PREFIX_SEPARATOR = "|";

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
  const moveFileToPath = (sourcePath, targetPath) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  };
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
      SELECT u.id, u.username, u.name, u.phone, u.quota_bytes AS quota, u.permissions, u.role, u.avatar, u.created_at,
      (SELECT IFNULL(SUM(size), 0) FROM files f WHERE f.user_id = u.id AND f.deleted_at IS NULL) AS used,
      (SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.deleted_at IS NULL) AS fileCount
      FROM users u${whereClause}
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
          getStorageDiskMountPath(item, programStorageMount) || "默认盘"
        ])
      );
      if (programStorageDiskId) {
        storageDiskLabelMap.set(programStorageDiskId, programStorageMount || storageDiskLabelMap.get(programStorageDiskId) || "默认盘");
      }
      storageDiskLabelMap.set(
        "",
        defaultStorageDisk
          ? getStorageDiskMountPath(defaultStorageDisk, programStorageMount)
          : (programStorageMount || "默认盘")
      );
      storageDiskLabelMap.set(HIDDEN_SPACE_DISK_TOKEN, "私密空间");
      const userIds = users.map((item) => Number(item.id)).filter((item) => item > 0);
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
        
        // 计算有效配额：用户配额优先，否则使用用户组配额
        let effectiveQuota = Number(u.quota);
        if (effectiveQuota === -1 && groupContext.groupQuotas && groupContext.groupQuotas.length > 0) {
          // 用户未设置配额时，使用用户组的最小配额
          let minQuota = null;
          let hasUnlimited = false;
          groupContext.groupQuotas.forEach((gq) => {
            const quota = Number(gq.quotaBytes || -1);
            if (quota === -1) {
              hasUnlimited = true;
              return;
            }
            if (quota > 0 && (minQuota === null || quota < minQuota)) {
              minQuota = quota;
            }
          });
          if (minQuota !== null) {
            effectiveQuota = minQuota;
          } else if (hasUnlimited) {
            effectiveQuota = -1;
          }
        }
        
        return {
          ...u,
          permissions: parsePermissionList(u.permissions, { fallbackToAll: false }),
          effectivePermissions: effectivePermissionResult.permissions,
          permissionSource: effectivePermissionResult.source,
          groupIds: groupContext.groupIds,
          groupNames: groupContext.groupNames,
          quota: Number(u.quota),
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

  app.put("/api/users/:id/storage-disk", authRequired, adminRequired, async (req, res) => {
    const userId = Number(req.params.id);
    const targetMountPath = String(req.body && req.body.targetMountPath || "").trim();
    if (!userId) {
      return res.status(400).json({ message: "用户 ID 不合法" });
    }
    if (!targetMountPath) {
      return res.status(400).json({ message: "请选择目标挂载点" });
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
    const targetDisk = storageDisks.find((item) => {
      if (!item || item.enabled === false) return false;
      return normalizeStorageMountKey(getStorageDiskMountPath(item, programStorageMount)) === targetMountKey;
    });
    if (!targetDisk || !targetDisk.path) {
      return res.status(400).json({ message: "目标挂载点不存在或未启用" });
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
        if (row.thumbnailStorageName) {
          const parsedThumbnail = parseStoredStorageNameLocal(row.thumbnailStorageName);
          if (parsedThumbnail.relativePath) {
            const resolvedThumbnailSource = resolveAbsoluteStoragePath(row.thumbnailStorageName, "normal");
            if (resolvedThumbnailSource && fs.existsSync(resolvedThumbnailSource)) {
              sourceThumbnailPath = resolvedThumbnailSource;
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
          sourcePath,
          targetPath,
          nextStorageName,
          sourceThumbnailPath,
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

      let connection;
      const movedFiles = [];
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        for (const plan of movePlans) {
          moveFileToPath(plan.sourcePath, plan.targetPath);
          movedFiles.push({ sourcePath: plan.sourcePath, targetPath: plan.targetPath });
          if (plan.sourceThumbnailPath && plan.targetThumbnailPath) {
            moveFileToPath(plan.sourceThumbnailPath, plan.targetThumbnailPath);
            movedFiles.push({ sourcePath: plan.sourceThumbnailPath, targetPath: plan.targetThumbnailPath });
          }
          await connection.query(
            "UPDATE files SET storage_name = ?, thumbnail_storage_name = ? WHERE id = ?",
            [plan.nextStorageName, plan.nextThumbnailStorageName, plan.id]
          );
        }
        await connection.commit();
      } catch (error) {
        if (connection) {
          try {
            await connection.rollback();
          } catch (e) {}
        }
        rollbackMovedFiles(movedFiles);
        throw error;
      } finally {
        if (connection) {
          connection.release();
        }
      }

      res.json({
        message: `已将 ${movePlans.length} 个文件迁移到 ${getStorageDiskMountPath(targetDisk, programStorageMount) || targetMountPath}`,
        movedCount: movePlans.length
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/users", authRequired, adminRequired, async (req, res) => {
    const { username, password, name, phone, quota, permissions, role, avatar, groupIds } = req.body;
    if (!username || !password) {
      res.status(400).json({ message: "用户名和密码不能为空" });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: "密码至少 6 位" });
      return;
    }
    // 验证配额值：-1 表示不限制，其他值必须大于 0
    if (quota !== undefined && quota !== null && Number(quota) !== -1 && Number(quota) <= 0) {
      res.status(400).json({ message: "空间配额必须大于 0 或设置为 -1（不限制）" });
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
      const quotaError = await validateQuotaLimit(connection, quota);
      if (quotaError) {
        await connection.rollback();
        res.status(400).json({ message: quotaError });
        return;
      }
      const [insertResult] = await connection.query(
        "INSERT INTO users (username, password_hash, name, phone, quota_bytes, permissions, role, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          username,
          await hashPassword(password),
          name || null,
          phone || null,
          quota || -1,
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
    const { password, name, phone, quota, permissions, role, avatar, groupIds } = req.body;

    if (!userId) return res.status(400).json({ message: "ID 不合法" });

    // Protect default admin user (ID 1)
    if (userId === 1 && role !== undefined && role !== "admin") {
      return res.status(400).json({ message: "不能更改默认管理员的角色" });
    }
    if (password !== undefined && password !== "" && String(password).length < 6) {
      return res.status(400).json({ message: "密码至少 6 位" });
    }
    // 验证配额值：-1 表示不限制，其他值必须大于 0
    if (quota !== undefined && quota !== null && Number(quota) !== -1 && Number(quota) <= 0) {
      return res.status(400).json({ message: "空间配额必须大于 0 或设置为 -1（不限制）" });
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
      if (quota !== undefined) {
        updates.push("quota_bytes = ?");
        params.push(quota);
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
      if (quota !== undefined) {
        const quotaError = await validateQuotaLimit(connection, quota, userId);
        if (quotaError) {
          await connection.rollback();
          return res.status(400).json({ message: quotaError });
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
};
