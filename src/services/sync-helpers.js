const createSyncHelpers = ({
  pool,
  normalizeSyncLocalDirPath,
  normalizeObjectKey,
  createCosClientByMount,
  createQiniuClientByMount,
  createOssClientByMount,
  cosRequest,
  qiniuBucketRequest,
  qiniuUploadRequest,
  qiniu,
  fetch,
  Buffer,
  fs,
  path
}) => {
  const appendSyncTaskHistoryLog = async (db, userId, taskId, message, status, detailAt) => {
    const detailMessage = String(message || "").trim();
    if (!detailMessage) return "";
    const [rows] = await db.query(
      "SELECT detail_message AS detailMessage FROM sync_task_details WHERE user_id = ? AND task_id = ? LIMIT 1",
      [userId, taskId]
    );
    const current = rows.length > 0 ? String(rows[0].detailMessage || "") : "";
    const mergedLines = `${current}${current ? "\n" : ""}${detailMessage}`
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(-100);
    const mergedText = mergedLines.join("\n").slice(-12000);
    await db.query(
      `INSERT INTO sync_task_details (user_id, task_id, detail_message, detail_status, detail_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE detail_message = VALUES(detail_message), detail_status = VALUES(detail_status), detail_at = VALUES(detail_at)`,
      [userId, taskId, mergedText, status, detailAt]
    );
    return mergedText;
  };

  const resolveSyncFolderIdByPath = async (db, userId, spaceType, fullPath) => {
    const normalizedPath = normalizeSyncLocalDirPath(fullPath);
    if (normalizedPath === "/") {
      return { exists: true, normalizedPath, folderId: null };
    }
    const parts = normalizedPath.split("/").filter(Boolean);
    let currentFolderId = null;
    for (let i = 0; i < parts.length; i++) {
      const folderName = parts[i];
      const [rows] = await db.query(
        "SELECT id FROM folders WHERE user_id = ? AND space_type = ? AND parent_id <=> ? AND name = ? AND deleted_at IS NULL LIMIT 1",
        [userId, spaceType, currentFolderId, folderName]
      );
      if (rows.length === 0) {
        return { exists: false, normalizedPath, folderId: null };
      }
      currentFolderId = rows[0].id;
    }
    return { exists: true, normalizedPath, folderId: currentFolderId };
  };

  const buildSyncFolderPathMap = async (db, userId, spaceType = "normal") => {
    const idToPath = new Map();
    const [rows] = await db.query(
      "SELECT id, name, parent_id FROM folders WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL",
      [userId, spaceType]
    );
    
    const idToName = new Map();
    const idToParent = new Map();
    for (const row of rows) {
      idToName.set(row.id, row.name);
      idToParent.set(row.id, row.parent_id);
    }
    
    const buildPath = (folderId) => {
      if (folderId === null) return "/";
      if (idToPath.has(folderId)) return idToPath.get(folderId);
      
      const parentId = idToParent.get(folderId);
      const name = idToName.get(folderId);
      const parentPath = buildPath(parentId);
      const fullPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
      idToPath.set(folderId, fullPath);
      return fullPath;
    };
    
    for (const row of rows) {
      buildPath(row.id);
    }
    
    return idToPath;
  };

  const collectDescendantFolderIds = async (db, folderId) => {
    const result = new Set();
    const queue = [folderId];
    while (queue.length > 0) {
      const currentId = queue.pop();
      const [rows] = await db.query("SELECT id FROM folders WHERE parent_id = ? AND deleted_at IS NULL", [currentId]);
      for (const row of rows) {
        if (!result.has(row.id)) {
          result.add(row.id);
          queue.push(row.id);
        }
      }
    }
    return result;
  };

  const parseSyncRemoteTimeMs = (timeValue) => {
    if (!timeValue) return 0;
    const date = new Date(timeValue);
    if (Number.isNaN(date.getTime())) return 0;
    return date.getTime();
  };

  const uploadObjectByMount = async (mount, key, fileBuffer) => {
    const normalizedKey = normalizeObjectKey(key || "");
    if (!normalizedKey) throw new Error("无效的对象键");
    if (String(mount.type || "") === "tencent") {
      const cosInfo = createCosClientByMount(mount);
      if (cosInfo.error) throw new Error(cosInfo.error);
      await cosRequest(cosInfo.client, "putObject", {
        Bucket: cosInfo.bucket,
        Region: cosInfo.region,
        Key: normalizedKey,
        Body: fileBuffer
      });
      return;
    }
    if (String(mount.type || "") === "qiniu") {
      const qiniuInfo = createQiniuClientByMount(mount);
      if (qiniuInfo.error) throw new Error(qiniuInfo.error);
      const uploadToken = qiniuInfo.mac.signToken(qiniuInfo.uploadToken);
      await qiniuUploadRequest(qiniuInfo.client, uploadToken, normalizedKey, fileBuffer);
      return;
    }
    const ossInfo = createOssClientByMount(mount);
    if (ossInfo.error) throw new Error(ossInfo.error);
    await ossInfo.client.put(normalizedKey, fileBuffer);
  };

  const createRemoteFolderMarkerByMount = async (mount, key) => {
    const normalizedKey = normalizeObjectKey(key || "");
    if (!normalizedKey) throw new Error("无效的对象键");
    const folderMarkerKey = normalizedKey.endsWith("/") ? normalizedKey : `${normalizedKey}/`;
    const emptyBuffer = Buffer.from("");
    if (String(mount.type || "") === "tencent") {
      const cosInfo = createCosClientByMount(mount);
      if (cosInfo.error) throw new Error(cosInfo.error);
      await cosRequest(cosInfo.client, "putObject", {
        Bucket: cosInfo.bucket,
        Region: cosInfo.region,
        Key: folderMarkerKey,
        Body: emptyBuffer
      });
      return;
    }
    if (String(mount.type || "") === "qiniu") {
      const qiniuInfo = createQiniuClientByMount(mount);
      if (qiniuInfo.error) throw new Error(qiniuInfo.error);
      const uploadToken = qiniuInfo.mac.signToken(qiniuInfo.uploadToken);
      await qiniuUploadRequest(qiniuInfo.client, uploadToken, folderMarkerKey, emptyBuffer);
      return;
    }
    const ossInfo = createOssClientByMount(mount);
    if (ossInfo.error) throw new Error(ossInfo.error);
    await ossInfo.client.put(folderMarkerKey, emptyBuffer);
  };

  const listRemoteObjectsByMount = async (mount, prefix = "") => {
    const normalizedPrefix = normalizeObjectKey(prefix || "");
    const objects = [];
    if (String(mount.type || "") === "tencent") {
      const cosInfo = createCosClientByMount(mount);
      if (cosInfo.error) throw new Error(cosInfo.error);
      let continuationToken = "";
      do {
        const params = {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Prefix: normalizedPrefix,
          Delimiter: ""
        };
        if (continuationToken) {
          params.ContinuationToken = continuationToken;
        }
        const data = await cosRequest(cosInfo.client, "getBucket", params);
        const contents = data.Contents || [];
        for (const item of contents) {
          if (String(item.Key || "").endsWith("/")) continue;
          objects.push({
            key: String(item.Key || ""),
            size: Number(item.Size || 0),
            lastModified: String(item.LastModified || ""),
            lastModifiedMs: parseSyncRemoteTimeMs(item.LastModified)
          });
        }
        continuationToken = data && data.isTruncated ? String(data.nextContinuationToken || "") : "";
      } while (continuationToken);
      return objects;
    }
    if (String(mount.type || "") === "qiniu") {
      const qiniuInfo = createQiniuClientByMount(mount);
      if (qiniuInfo.error) throw new Error(qiniuInfo.error);
      let marker = "";
      do {
        const params = { prefix: normalizedPrefix, limit: 1000, marker };
        const data = await qiniuBucketRequest(qiniuInfo.bucketManager, "listFiles", qiniuInfo.bucket, params);
        const items = data.items || [];
        for (const item of items) {
          if (String(item.key || "").endsWith("/")) continue;
          objects.push({
            key: String(item.key || ""),
            size: Number(item.fsize || 0),
            lastModified: String(item.putTime || ""),
            lastModifiedMs: parseSyncRemoteTimeMs(item.putTime)
          });
        }
        marker = data && data.marker ? String(data.marker || "") : "";
      } while (marker);
      return objects;
    }
    const ossInfo = createOssClientByMount(mount);
    if (ossInfo.error) throw new Error(ossInfo.error);
    let nextMarker = "";
    do {
      const result = await ossInfo.client.list({
        prefix: normalizedPrefix,
        marker: nextMarker,
        maxKeys: 1000
      });
      const objs = result.objects || [];
      for (const obj of objs) {
        if (String(obj.name || "").endsWith("/")) continue;
        objects.push({
          key: String(obj.name || ""),
          size: Number(obj.size || 0),
          lastModified: String(obj.lastModified || ""),
          lastModifiedMs: parseSyncRemoteTimeMs(obj.lastModified)
        });
      }
      nextMarker = result.nextMarker || "";
    } while (nextMarker);
    return objects;
  };

  const deleteRemoteObjectByMount = async (mount, key) => {
    const normalizedKey = normalizeObjectKey(key || "");
    if (!normalizedKey) return;
    if (String(mount.type || "") === "tencent") {
      const cosInfo = createCosClientByMount(mount);
      if (cosInfo.error) throw new Error(cosInfo.error);
      await cosRequest(cosInfo.client, "deleteObject", {
        Bucket: cosInfo.bucket,
        Region: cosInfo.region,
        Key: normalizedKey
      });
      return;
    }
    if (String(mount.type || "") === "qiniu") {
      const qiniuInfo = createQiniuClientByMount(mount);
      if (qiniuInfo.error) throw new Error(qiniuInfo.error);
      await qiniuBucketRequest(qiniuInfo.bucketManager, "delete", qiniuInfo.bucket, normalizedKey);
      return;
    }
    const ossInfo = createOssClientByMount(mount);
    if (ossInfo.error) throw new Error(ossInfo.error);
    await ossInfo.client.delete(normalizedKey);
  };

  const downloadObjectByMount = async (mount, key, targetPath) => {
    const normalizedKey = normalizeObjectKey(key || "");
    if (!normalizedKey) throw new Error("无效的对象键");
    if (String(mount.type || "") === "tencent") {
      const cosInfo = createCosClientByMount(mount);
      if (cosInfo.error) throw new Error(cosInfo.error);
      if (targetPath) {
        console.log(`[getObjectStream开始] key=${normalizedKey}`);
        return new Promise((resolve, reject) => {
          const stream = cosInfo.client.getObjectStream({
            Bucket: cosInfo.bucket,
            Region: cosInfo.region,
            Key: normalizedKey
          });
          console.log(`[getObjectStream获取成功] key=${normalizedKey}`);
          const writeStream = fs.createWriteStream(targetPath);
          stream.on("error", (err) => {
            console.log(`[getObjectStream错误] key=${normalizedKey}, error=${err.message}`);
            reject(new Error(`下载失败：${err.message}`));
          });
          stream.pipe(writeStream);
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
        });
      }
      const data = await cosRequest(cosInfo.client, "getObject", {
        Bucket: cosInfo.bucket,
        Region: cosInfo.region,
        Key: normalizedKey
      });
      return data.Body;
    }
    if (String(mount.type || "") === "qiniu") {
      const qiniuInfo = createQiniuClientByMount(mount);
      if (qiniuInfo.error) throw new Error(qiniuInfo.error);
      const privateUrl = qiniuInfo.mac.signDownloadUrl(`http://${qiniuInfo.bucket}.qiniudn.com/${encodeURIComponent(normalizedKey)}`);
      const response = await fetch(privateUrl);
      if (!response.ok) throw new Error(`下载失败：${response.statusText}`);
      if (targetPath) {
        const writeStream = fs.createWriteStream(targetPath);
        const readableStream = response.body;
        if (!readableStream) {
          throw new Error("响应流不可用");
        }
        const reader = readableStream.getReader();
        return new Promise((resolve, reject) => {
          writeStream.on("finish", () => resolve());
          writeStream.on("error", (err) => reject(err));
          pump();
          async function pump() {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const canContinue = writeStream.write(value);
                if (!canContinue) {
                  await new Promise((resolveDrain) => {
                    writeStream.once("drain", resolveDrain);
                  });
                }
              }
              writeStream.end();
            } catch (err) {
              writeStream.destroy(err);
              reject(err);
            }
          }
        });
      }
      return Buffer.from(await response.arrayBuffer());
    }
    const ossInfo = createOssClientByMount(mount);
    if (ossInfo.error) throw new Error(ossInfo.error);
    if (targetPath) {
      const result = await ossInfo.client.getStream(normalizedKey);
      const writeStream = fs.createWriteStream(targetPath);
      result.stream.pipe(writeStream);
      return new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
    }
    const result = await ossInfo.client.get(normalizedKey);
    return result.content;
  };

  return {
    appendSyncTaskHistoryLog,
    resolveSyncFolderIdByPath,
    buildSyncFolderPathMap,
    uploadObjectByMount,
    createRemoteFolderMarkerByMount,
    parseSyncRemoteTimeMs,
    listRemoteObjectsByMount,
    deleteRemoteObjectByMount,
    downloadObjectByMount
  };
};

module.exports = {
  createSyncHelpers
};
