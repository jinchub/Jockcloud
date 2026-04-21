const createSyncRunner = ({
  pool,
  syncingTaskLocks,
  syncTaskLockKey,
  getRuntimeDeps
}) => {
  const runSyncTaskNow = async (userId, taskId, trigger = "manual", onLog) => {
    console.log(`[runSyncTaskNow开始] userId=${userId}, taskId=${taskId}, trigger=${trigger}`);
    const {
      normalizeSyncDirection,
      normalizeSyncTaskType,
      normalizeSyncScheduleUnit,
      normalizeSyncScheduleTime,
      normalizeSyncScheduleAt,
      normalizeSyncScheduleDateType,
      normalizeSyncScheduleDateValue,
      normalizeSyncEmptyDirMode,
      normalizeSyncFileUpdateRule,
      parseSyncRemoteTimeMs,
      normalizeSyncDeleteRule,
      normalizeSyncTaskStatus,
      getSyncDirectionText,
      getSyncTaskNextRunAt,
      formatSyncDetailTime,
      appendSyncTaskHistoryLog,
      parseMountConfig,
      resolveSyncFolderIdByPath,
      collectDescendantFolderIds,
      buildSyncFolderPathMap,
      normalizeSyncLocalDirPath,
      normalizeObjectKey,
      listRemoteObjectsByMount,
      resolveAbsoluteStoragePath,
      normalizeStorageRelativePath,
      fs,
      uploadObjectByMount,
      createRemoteFolderMarkerByMount,
      deleteRemoteObjectByMount,
      formatSyncItemsLine,
      downloadObjectByMount,
      safeFileName,
      getUploadStorageDir,
      path,
      resolveStorageRootDir,
      crypto,
      resolveStorageNameFromPath,
      resolveFolderByRelativeDir,
      inferMimeTypeByFileName,
      normalizeFileCategoryKey,
      resolveStoredFileCategory
    } = getRuntimeDeps();

    const normalizedUserId = Number(userId);
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedUserId || !normalizedTaskId) {
      return { ok: false, skipped: true, reason: "invalid_task" };
    }
    const lockKey = syncTaskLockKey(normalizedUserId, normalizedTaskId);
    if (syncingTaskLocks.has(lockKey)) {
      return { ok: false, skipped: true, reason: "locked" };
    }
    syncingTaskLocks.add(lockKey);
    console.log(`[runSyncTaskNow获取任务] userId=${normalizedUserId}, taskId=${normalizedTaskId}`);
    try {
      const [rows] = await pool.query(
        `SELECT task_id AS id, name, local_dir AS localDir, remote_mount_id AS remoteMountId, remote_mount_name AS remoteMountName,
                remote_dir AS remoteDir, sync_direction AS direction, task_type AS type, schedule_value AS scheduleValue,
                schedule_unit AS scheduleUnit, schedule_time AS scheduleTime, schedule_at AS scheduleAt,
                schedule_date_type AS scheduleDateType, schedule_date_value AS scheduleDateValue,
                sync_empty_dir AS syncEmptyDir, file_update_rule AS fileUpdateRule,
                last_run_at AS lastRunAt,
                delete_rule AS deleteRule, status
         FROM sync_tasks
         WHERE user_id = ? AND task_id = ?
         LIMIT 1`,
        [normalizedUserId, normalizedTaskId]
      );
      if (rows.length === 0) {
        return { ok: false, skipped: true, reason: "not_found" };
      }
      const task = {
        ...rows[0],
        id: String(rows[0].id || ""),
        name: String(rows[0].name || ""),
        localDir: String(rows[0].localDir || "/"),
        remoteMountId: String(rows[0].remoteMountId || ""),
        remoteDir: String(rows[0].remoteDir || "/"),
        direction: normalizeSyncDirection(rows[0].direction),
        type: normalizeSyncTaskType(rows[0].type),
        scheduleValue: Math.max(1, Number(rows[0].scheduleValue || 1)),
        scheduleUnit: normalizeSyncScheduleUnit(rows[0].scheduleUnit),
        scheduleTime: normalizeSyncScheduleTime(rows[0].scheduleTime),
        scheduleAt: normalizeSyncScheduleAt(rows[0].scheduleAt),
        scheduleDateType: normalizeSyncScheduleDateType(rows[0].scheduleDateType),
        scheduleDateValue: normalizeSyncScheduleDateValue(rows[0].scheduleDateValue, rows[0].scheduleDateType),
        syncEmptyDir: normalizeSyncEmptyDirMode(rows[0].syncEmptyDir),
        fileUpdateRule: normalizeSyncFileUpdateRule(rows[0].fileUpdateRule),
        lastRunAtMs: parseSyncRemoteTimeMs(rows[0].lastRunAt),
        deleteRule: normalizeSyncDeleteRule(rows[0].deleteRule),
        status: normalizeSyncTaskStatus(rows[0].status)
      };
      
      // 获取用户信息
      const [userRows] = await pool.query(
        "SELECT id, username FROM users WHERE id = ? LIMIT 1",
        [normalizedUserId]
      );
      const user = userRows.length > 0 ? { userId: userRows[0].id, username: userRows[0].username } : { userId: normalizedUserId };
      console.log(`[runSyncTaskNow获取挂载] userId=${normalizedUserId}, taskId=${normalizedTaskId}, remoteMountId=${task.remoteMountId}`);
      if (trigger === "schedule" && (task.type !== "schedule" || task.status !== "running")) {
        return { ok: false, skipped: true, reason: "not_running" };
      }
      const [mountRows] = await pool.query(
        "SELECT * FROM mounts WHERE user_id = ? AND id = ? LIMIT 1",
        [normalizedUserId, Number(task.remoteMountId) || 0]
      );
      const now = new Date();
      const directionText = getSyncDirectionText(task.direction);
      const isTimePointSchedule = task.type === "schedule" && task.scheduleUnit === "time_point";
      console.log(`[runSyncTaskNow获取文件列表] userId=${normalizedUserId}, taskId=${normalizedTaskId}, direction=${task.direction}`);
      if (mountRows.length === 0) {
        const failureNextRunAt = task.type === "schedule" && task.status === "running"
          ? (isTimePointSchedule ? null : getSyncTaskNextRunAt(task, now))
          : null;
        const failureStatus = task.type === "schedule" && task.status === "running"
          ? (isTimePointSchedule ? "error" : "running")
          : "error";
        const detailMessage = `[${formatSyncDetailTime(now)}] 同步失败：未找到远程挂载，请重新编辑任务`;
        await pool.query(
          "UPDATE sync_tasks SET status = ?, last_run_at = ?, next_run_at = ? WHERE user_id = ? AND task_id = ?",
          [failureStatus, now, failureNextRunAt, normalizedUserId, normalizedTaskId]
        );
        await appendSyncTaskHistoryLog(pool, normalizedUserId, normalizedTaskId, detailMessage, "error", now);
        return { ok: false, message: "远程挂载不存在" };
      }
      const mount = { ...mountRows[0], config: parseMountConfig(mountRows[0].config) };
      const fileUpdateRule = normalizeSyncFileUpdateRule(task.fileUpdateRule);
      const isFirstSyncRun = !Number(task.lastRunAtMs || 0);
      const deleteRule = normalizeSyncDeleteRule(task.deleteRule);
      
      let totalSuccessCount = 0;
      let totalDeletedCount = 0;
      let totalSyncedFolderCount = 0;
      const totalFailedItems = [];
      const totalSyncedItemPaths = [];

      const runLocalToRemote = async () => {
        const localResolved = await resolveSyncFolderIdByPath(pool, normalizedUserId, "normal", task.localDir);
        if (!localResolved.exists) {
          const failureNextRunAt = task.type === "schedule" && task.status === "running"
            ? (isTimePointSchedule ? null : getSyncTaskNextRunAt(task, now))
            : null;
          const failureStatus = task.type === "schedule" && task.status === "running"
            ? (isTimePointSchedule ? "error" : "running")
            : "error";
          const detailMessage = `[${formatSyncDetailTime(now)}] 同步失败：本地目录不存在 ${localResolved.normalizedPath}`;
          await pool.query(
            "UPDATE sync_tasks SET status = ?, last_run_at = ?, next_run_at = ? WHERE user_id = ? AND task_id = ?",
            [failureStatus, now, failureNextRunAt, normalizedUserId, normalizedTaskId]
          );
          await appendSyncTaskHistoryLog(pool, normalizedUserId, normalizedTaskId, detailMessage, "error", now);
          return { ok: false, message: "本地目录不存在" };
        }
        let targetFolderIds = [];
        if (localResolved.folderId === null) {
          const [folderRows] = await pool.query("SELECT id FROM folders WHERE user_id = ? AND deleted_at IS NULL", [normalizedUserId]);
          targetFolderIds = folderRows.map((item) => Number(item.id || 0)).filter(Boolean);
        } else {
          targetFolderIds = await collectDescendantFolderIds(normalizedUserId, localResolved.folderId);
        }
        const fileClauses = ["user_id = ?", "deleted_at IS NULL"];
        const fileParams = [normalizedUserId];
        if (localResolved.folderId !== null) {
          if (!targetFolderIds.length) {
            targetFolderIds = [localResolved.folderId];
          }
          fileClauses.push(`folder_id IN (${targetFolderIds.map(() => "?").join(",")})`);
          fileParams.push(...targetFolderIds);
        }
        const [fileRows] = await pool.query(
          `SELECT id, folder_id AS folderId, original_name AS originalName, storage_name AS storageName, space_type AS spaceType, size, updated_at AS updatedAt
           FROM files
           WHERE ${fileClauses.join(" AND ")}`,
          fileParams
        );
        const folderPathMap = await buildSyncFolderPathMap(pool, normalizedUserId, "normal");
        const localBasePath = normalizeSyncLocalDirPath(task.localDir);
        const remoteBaseKey = normalizeObjectKey(task.remoteDir || "");
        const remoteObjects = await listRemoteObjectsByMount(mount, remoteBaseKey);
        const remoteObjectMap = new Map(remoteObjects.map((item) => [String(item.key || ""), item]));
        let successCount = 0;
        let deletedCount = 0;
        let syncedFolderCount = 0;
        const failedItems = [];
        const syncedItemPaths = [];
        const sourceObjectKeys = new Set();
        for (const file of fileRows) {
          const folderPath = folderPathMap.get(file.folderId) || "/";
          const absoluteFilePath = folderPath === "/"
            ? `/${file.originalName}`
            : `${folderPath}/${file.originalName}`;
          let relativeFilePath = "";
          if (localBasePath === "/") {
            relativeFilePath = absoluteFilePath.replace(/^\/+/, "");
          } else if (absoluteFilePath === localBasePath) {
            relativeFilePath = String(file.originalName || "");
          } else if (absoluteFilePath.startsWith(`${localBasePath}/`)) {
            relativeFilePath = absoluteFilePath.slice(localBasePath.length + 1);
          }
          const normalizedRelativePath = normalizeObjectKey(relativeFilePath);
          if (!normalizedRelativePath) {
            continue;
          }
          const targetKey = normalizeObjectKey(remoteBaseKey ? `${remoteBaseKey}/${normalizedRelativePath}` : normalizedRelativePath);
          if (!targetKey) {
            continue;
          }
          sourceObjectKeys.add(targetKey);
          const remoteMeta = remoteObjectMap.get(targetKey);
          const localUpdatedMs = parseSyncRemoteTimeMs(file.updatedAt);
          const shouldUpload = fileUpdateRule === "all"
            || !remoteMeta
            || (fileUpdateRule === "modified_only" && (isFirstSyncRun || localUpdatedMs > Number(remoteMeta.lastModifiedMs || 0)));
          if (!shouldUpload) {
            continue;
          }
          const storageName = normalizeStorageRelativePath(file.storageName);
          const localFilePath = resolveAbsoluteStoragePath(storageName, file.spaceType);
          if (!storageName || !fs.existsSync(localFilePath)) {
            failedItems.push(`${file.originalName}: 本地文件不存在`);
            continue;
          }
          try {
            const fileBuffer = fs.readFileSync(localFilePath);
            await uploadObjectByMount(mount, targetKey, fileBuffer, file.size);
            successCount += 1;
            syncedItemPaths.push(`/${normalizedRelativePath}`);
            if (onLog) {
              onLog(taskId, `[${formatSyncDetailTime(new Date())}] 上传成功：${normalizedRelativePath}`);
            }
          } catch (error) {
            failedItems.push(`${file.originalName}: ${error && error.message ? error.message : "上传失败"}`);
            if (onLog) {
              onLog(taskId, `[${formatSyncDetailTime(new Date())}] 上传失败：${normalizedRelativePath} - ${error.message}`);
            }
          }
        }
        if (task.syncEmptyDir === 1) {
          const folderMarkerKeys = new Set();
          const baseFolderKey = normalizeObjectKey(remoteBaseKey || normalizeSyncLocalDirPath(task.localDir).replace(/^\/+/, ""));
          if (baseFolderKey) {
            folderMarkerKeys.add(`${baseFolderKey}/`);
          }
          targetFolderIds.forEach((folderId) => {
            const folderPath = folderPathMap.get(folderId) || "/";
            if (!folderPath || folderPath === "/" || !folderPath.startsWith(localBasePath)) return;
            const relativeFolderPath = localBasePath === "/" ? folderPath.slice(1) : folderPath.slice(localBasePath.length + 1);
            const normalizedRelativeFolder = normalizeObjectKey(relativeFolderPath);
            if (!normalizedRelativeFolder) return;
            const markerKey = normalizeObjectKey(remoteBaseKey ? `${remoteBaseKey}/${normalizedRelativeFolder}` : normalizedRelativeFolder);
            if (markerKey) {
              folderMarkerKeys.add(`${markerKey}/`);
            }
          });
          for (const markerKey of folderMarkerKeys) {
            sourceObjectKeys.add(markerKey);
            if (remoteObjectMap.has(markerKey)) {
              continue;
            }
            try {
              await createRemoteFolderMarkerByMount(mount, markerKey);
              syncedFolderCount += 1;
              syncedItemPaths.push(`/${markerKey}`);
            } catch (error) {
              failedItems.push(`空目录: ${error && error.message ? error.message : "同步失败"}`);
            }
          }
        }
        if (deleteRule === "sync_delete" || deleteRule === "mirror") {
          for (const remoteItem of remoteObjects) {
            const remoteKey = String(remoteItem.key || "");
            if (!remoteKey || sourceObjectKeys.has(remoteKey)) continue;
            try {
              await deleteRemoteObjectByMount(mount, remoteKey);
              deletedCount += 1;
            } catch (error) {
              failedItems.push(`删除 ${remoteKey}: ${error && error.message ? error.message : "删除失败"}`);
            }
          }
        }
        return { ok: true, successCount, deletedCount, syncedFolderCount, failedItems, syncedItemPaths };
      };

      const runRemoteToLocal = async () => {
        console.log(`[runRemoteToLocal开始] userId=${normalizedUserId}, taskId=${normalizedTaskId}`);
        const localResolved = await resolveSyncFolderIdByPath(pool, normalizedUserId, "normal", task.localDir);
        console.log(`[runRemoteToLocal获取挂载] userId=${normalizedUserId}, taskId=${normalizedTaskId}`);
        const folderPathMap = await buildSyncFolderPathMap(pool, normalizedUserId, "normal");
        const localBasePath = normalizeSyncLocalDirPath(task.localDir);
        const remoteBaseKey = normalizeObjectKey(task.remoteDir || "");
        const remoteObjects = await listRemoteObjectsByMount(mount, remoteBaseKey);
        console.log(`[runRemoteToLocal获取远程对象] userId=${normalizedUserId}, taskId=${normalizedTaskId}, count=${remoteObjects.length}`);
        console.log(`[runRemoteToLocal获取本地文件] userId=${normalizedUserId}, taskId=${normalizedTaskId}`);
        const [localFileRows] = await pool.query(
          `SELECT id, folder_id AS folderId, original_name AS originalName, storage_name AS storageName, space_type AS spaceType, size, updated_at AS updatedAt
           FROM files
           WHERE user_id = ? AND deleted_at IS NULL`,
          [normalizedUserId]
        );
        console.log(`[runRemoteToLocal构建本地文件Map] userId=${normalizedUserId}, taskId=${normalizedTaskId}, count=${localFileRows.length}`);
        const localFileMap = new Map();
        for (const file of localFileRows) {
          const folderPath = folderPathMap.get(file.folderId) || "/";
          const absoluteFilePath = folderPath === "/"
            ? `/${file.originalName}`
            : `${folderPath}/${file.originalName}`;
          let relativeFilePath = "";
          if (localBasePath === "/") {
            relativeFilePath = absoluteFilePath.replace(/^\/+/, "");
          } else if (absoluteFilePath === localBasePath) {
            relativeFilePath = String(file.originalName || "");
          } else if (absoluteFilePath.startsWith(`${localBasePath}/`)) {
            relativeFilePath = absoluteFilePath.slice(localBasePath.length + 1);
          }
          if (relativeFilePath) {
            localFileMap.set(normalizeObjectKey(relativeFilePath), file);
          }
        }
        console.log(`[runRemoteToLocal处理远程文件] userId=${normalizedUserId}, taskId=${normalizedTaskId}`);
        let successCount = 0;
        let deletedCount = 0;
        let syncedFolderCount = 0;
        const failedItems = [];
        const syncedItemPaths = [];
        const folderCache = new Map();
        const sourceObjectKeys = new Set();
        const spaceType = "normal";
        console.log(`[runRemoteToLocal开始下载] userId=${normalizedUserId}, taskId=${normalizedTaskId}, remoteCount=${remoteObjects.length}`);
        for (const remoteItem of remoteObjects) {
          const remoteKey = String(remoteItem.key || "");
          if (!remoteKey) continue;
          if (remoteKey.endsWith("/")) {
            continue;
          }
          let relativePath = "";
          if (remoteBaseKey) {
            if (!remoteKey.startsWith(`${remoteBaseKey}/`)) continue;
            relativePath = remoteKey.slice(remoteBaseKey.length + 1);
          } else {
            relativePath = remoteKey;
          }
          const normalizedRelativePath = normalizeObjectKey(relativePath);
          if (!normalizedRelativePath) continue;
          sourceObjectKeys.add(normalizedRelativePath);
          const localFile = localFileMap.get(normalizedRelativePath);
          const localUpdatedMs = localFile ? parseSyncRemoteTimeMs(localFile.updatedAt) : 0;
          const shouldDownload = fileUpdateRule === "all"
            || !localFile
            || (fileUpdateRule === "modified_only" && (isFirstSyncRun || Number(remoteItem.lastModifiedMs || 0) > localUpdatedMs));
          if (!shouldDownload) {
            continue;
          }
          try {
            const fileName = safeFileName(normalizedRelativePath.split("/").pop() || "file");
            if (!fileName) continue;
            console.log(`[runRemoteToLocal下载文件] userId=${normalizedUserId}, taskId=${normalizedTaskId}, file=${normalizedRelativePath}`);
            const targetDir = getUploadStorageDir(user);
            const storageDir = path.join(resolveStorageRootDir(spaceType), targetDir);
            const relativeDir = normalizedRelativePath.split("/").slice(0, -1).join("/");
            // 确保上传目录存在
            fs.mkdirSync(storageDir, { recursive: true });
            // 生成唯一的文件名，避免冲突
            const uniqueFileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${fileName}`;
            const targetPathOnDisk = path.join(storageDir, uniqueFileName);
            await downloadObjectByMount(mount, remoteKey, targetPathOnDisk);
            console.log(`[runRemoteToLocal下载成功] userId=${normalizedUserId}, taskId=${normalizedTaskId}, file=${normalizedRelativePath}`);
            const storageName = resolveStorageNameFromPath(targetPathOnDisk, uniqueFileName, resolveStorageRootDir(spaceType));
            console.log(`[runRemoteToLocal下载成功后] userId=${normalizedUserId}, taskId=${normalizedTaskId}, storageName=${storageName}`);
            let entryFolderId = null;
            if (localResolved.exists && localResolved.folderId !== null) {
              entryFolderId = await resolveFolderByRelativeDir(normalizedUserId, localResolved.folderId, relativeDir, folderCache, spaceType);
            } else {
              entryFolderId = await resolveFolderByRelativeDir(normalizedUserId, null, relativeDir, folderCache, spaceType);
            }
            const stat = fs.statSync(targetPathOnDisk);
            const fileSize = stat.size;
            const mimeType = inferMimeTypeByFileName(fileName, "application/octet-stream");
            const fileCategory = normalizeFileCategoryKey(resolveStoredFileCategory(fileName, mimeType, null));
            const thumbnailStorageName = "";
            if (localFile) {
              await pool.query(
                "UPDATE files SET storage_name = ?, size = ?, updated_at = NOW() WHERE id = ?",
                [storageName, fileSize, localFile.id]
              );
            } else {
              await pool.query(
                "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [normalizedUserId, spaceType, entryFolderId, fileName, storageName, thumbnailStorageName || null, fileCategory, fileSize, mimeType]
              );
            }
            successCount += 1;
            syncedItemPaths.push(`/${normalizedRelativePath}`);
            if (onLog) {
              onLog(taskId, `[${formatSyncDetailTime(new Date())}] 下载成功：${normalizedRelativePath}`);
            }
          } catch (error) {
            failedItems.push(`${normalizedRelativePath}: ${error && error.message ? error.message : "下载失败"}`);
            if (onLog) {
              onLog(taskId, `[${formatSyncDetailTime(new Date())}] 下载失败：${normalizedRelativePath} - ${error.message}`);
            }
          }
        }
        if (deleteRule === "sync_delete" || deleteRule === "mirror") {
          for (const [relativePath, localFile] of localFileMap) {
            if (!relativePath || sourceObjectKeys.has(relativePath)) continue;
            try {
              await pool.query(
                "UPDATE files SET deleted_at = NOW() WHERE id = ?",
                [localFile.id]
              );
              deletedCount += 1;
              if (onLog) {
                onLog(taskId, `[${formatSyncDetailTime(new Date())}] 删除：${relativePath}`);
              }
            } catch (error) {
              failedItems.push(`删除 ${relativePath}: ${error && error.message ? error.message : "删除失败"}`);
              if (onLog) {
                onLog(taskId, `[${formatSyncDetailTime(new Date())}] 删除失败：${relativePath} - ${error.message}`);
              }
            }
          }
        }
        return { ok: true, successCount, deletedCount, syncedFolderCount, failedItems, syncedItemPaths };
      };

      const directionsToRun = [];
      if (task.direction === "local_to_remote" || task.direction === "bidirectional") {
        directionsToRun.push(runLocalToRemote);
      }
      if (task.direction === "remote_to_local" || task.direction === "bidirectional") {
        directionsToRun.push(runRemoteToLocal);
      }

      for (const runDirection of directionsToRun) {
        const result = await runDirection();
        if (!result.ok) {
          return result;
        }
        totalSuccessCount += result.successCount;
        totalDeletedCount += result.deletedCount;
        totalSyncedFolderCount += result.syncedFolderCount;
        totalFailedItems.push(...result.failedItems);
        totalSyncedItemPaths.push(...result.syncedItemPaths);
      }

      if (totalSuccessCount + totalSyncedFolderCount + totalDeletedCount <= 0 && totalFailedItems.length > 0) {
        const failureNextRunAt = task.type === "schedule" && task.status === "running"
          ? (isTimePointSchedule ? null : getSyncTaskNextRunAt(task, now))
          : null;
        const failureStatus = task.type === "schedule" && task.status === "running"
          ? (isTimePointSchedule ? "error" : "running")
          : "error";
        const reasonText = totalFailedItems.slice(0, 2).join("；");
        const detailMessage = `[${formatSyncDetailTime(now)}] 同步失败：${reasonText}`;
        await pool.query(
          "UPDATE sync_tasks SET status = ?, last_run_at = ?, next_run_at = ? WHERE user_id = ? AND task_id = ?",
          [failureStatus, now, failureNextRunAt, normalizedUserId, normalizedTaskId]
        );
        await appendSyncTaskHistoryLog(pool, normalizedUserId, normalizedTaskId, detailMessage, "error", now);
        return { ok: false, message: "没有成功同步任何文件" };
      }
      const failedSuffix = totalFailedItems.length > 0 ? `，失败 ${totalFailedItems.length} 项` : "";
      const syncedTotalCount = totalSuccessCount + totalSyncedFolderCount + totalDeletedCount;
      const detailLines = [`[${formatSyncDetailTime(now)}] ${directionText}成功，已处理 ${syncedTotalCount} 项${failedSuffix}`];
      if (totalDeletedCount > 0) {
        detailLines.push(`删除项：${totalDeletedCount} 项`);
      }
      const syncedLine = formatSyncItemsLine("同步项", totalSyncedItemPaths, 12);
      if (syncedLine) {
        detailLines.push(syncedLine);
      }
      const failedLine = formatSyncItemsLine("失败项", totalFailedItems, 8);
      if (failedLine) {
        detailLines.push(failedLine);
      }
      const detailMessage = detailLines.join("\n");
      const isScheduleRunning = task.type === "schedule" && task.status === "running";
      const nextRunAt = isScheduleRunning ? (isTimePointSchedule ? null : getSyncTaskNextRunAt(task, now)) : null;
      const nextStatus = task.type === "once"
        ? "success"
        : (isScheduleRunning ? (isTimePointSchedule ? "success" : "running") : normalizeSyncTaskStatus(task.status));
      await pool.query(
        "UPDATE sync_tasks SET status = ?, last_run_at = ?, next_run_at = ? WHERE user_id = ? AND task_id = ?",
        [nextStatus, now, nextRunAt, normalizedUserId, normalizedTaskId]
      );
      await appendSyncTaskHistoryLog(pool, normalizedUserId, normalizedTaskId, detailMessage, "success", now);
      console.log(`[runSyncTaskNow成功] userId=${normalizedUserId}, taskId=${normalizedTaskId}`);
      return { ok: true, message: "执行成功" };
    } catch (error) {
      console.error(`[同步任务错误] userId=${normalizedUserId}, taskId=${normalizedTaskId}`, error);
      console.log(`[runSyncTaskNow失败] userId=${normalizedUserId}, taskId=${normalizedTaskId}, error=${error.message}`);
      try {
        const now = new Date();
        await pool.query(
          "UPDATE sync_tasks SET status = ?, last_run_at = ?, next_run_at = ? WHERE user_id = ? AND task_id = ?",
          ["error", now, null, normalizedUserId, normalizedTaskId]
        );
        await appendSyncTaskHistoryLog(pool, normalizedUserId, normalizedTaskId, `[${formatSyncDetailTime(now)}] 同步异常：${error.message}`, "error", now);
      } catch (logError) {
        console.error(`[同步任务错误日志] userId=${normalizedUserId}, taskId=${normalizedTaskId}`, logError);
      }
      throw error;
    } finally {
      syncingTaskLocks.delete(lockKey);
    }
  };

  return {
    runSyncTaskNow
  };
};

module.exports = {
  createSyncRunner
};
