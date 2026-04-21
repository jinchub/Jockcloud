module.exports = (app, deps) => {
  const {
    authRequired,
    cosUploadSingle,
    pool,
    sendDbError,
    parseMountConfig,
    ensureObjectMount,
    getMountById,
    normalizeObjectKey,
    createCosClientByMount,
    createQiniuClientByMount,
    createOssClientByMount,
    cosRequest,
    qiniuBucketRequest,
    qiniuUploadRequest,
    qiniu,
    path,
    fetch,
    Buffer,
    encodeCosKey
  } = deps;

  // --- Mounts APIs ---

  app.get("/api/mounts", authRequired, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM mounts WHERE user_id = ? ORDER BY created_at DESC", [req.user.userId]);
      res.json(rows.map((item) => ({ ...item, config: parseMountConfig(item.config) })));
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/mounts", authRequired, async (req, res) => {
    const { name, type, config } = req.body;
    if (!name || !type) return res.status(400).json({ message: "参数不全" });
    try {
      await pool.query("INSERT INTO mounts (user_id, name, type, config) VALUES (?, ?, ?, ?)", [req.user.userId, name, type, JSON.stringify(config || {})]);
      res.json({ message: "挂载添加成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/mounts/:id", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    const { name, type, config } = req.body || {};
    if (!id) return res.status(400).json({ message: "挂载ID不合法" });
    if (!name || !type) return res.status(400).json({ message: "参数不全" });
    try {
      const [result] = await pool.query("UPDATE mounts SET name = ?, type = ?, config = ? WHERE id = ? AND user_id = ?", [name, type, JSON.stringify(config || {}), id, req.user.userId]);
      if (Number(result.affectedRows || 0) === 0) return res.status(404).json({ message: "挂载不存在" });
      res.json({ message: "挂载更新成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/mounts/:id/objects", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "挂载ID不合法" });
    try {
      const mount = await getMountById(id, req.user.userId);
      if (!ensureObjectMount(mount, res)) return;
      const prefix = normalizeObjectKey(req.query.prefix || "");
      const normalizedPrefix = prefix ? `${prefix}/` : "";
      const pageRaw = Math.floor(Number(req.query.page));
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const hasPageSizeQuery = req.query.pageSize !== undefined;
      const pageSizeRaw = Math.floor(Number(req.query.pageSize));
      const pageSize = hasPageSizeQuery
        ? ([50, 100, 150].includes(pageSizeRaw) ? pageSizeRaw : 50)
        : 1000;
      const sortKey = ["name", "path", "updatedAt"].includes(String(req.query.sortKey || ""))
        ? String(req.query.sortKey)
        : "name";
      const sortOrder = String(req.query.sortOrder || "").toLowerCase() === "desc" ? "desc" : "asc";
      const sortRows = (rows) => {
        return rows.sort((a, b) => {
          let left;
          let right;
          if (sortKey === "updatedAt") {
            left = a.lastModified ? new Date(a.lastModified).getTime() : 0;
            right = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          } else if (sortKey === "path") {
            left = String(a.path || a.key || a.prefix || "").toLowerCase();
            right = String(b.path || b.key || b.prefix || "").toLowerCase();
          } else {
            left = String(a.name || "").toLowerCase();
            right = String(b.name || "").toLowerCase();
          }
          if (left === right) {
            const leftType = String(a.type || "");
            const rightType = String(b.type || "");
            if (leftType === rightType) return 0;
            return leftType === "folder" ? -1 : 1;
          }
          const base = left > right ? 1 : -1;
          return sortOrder === "asc" ? base : -base;
        });
      };
      const toPagedPayload = (rows) => {
        const total = rows.length;
        const start = Math.max(0, (page - 1) * pageSize);
        const pagedRows = rows.slice(start, start + pageSize);
        return {
          total,
          page,
          pageSize,
          folders: pagedRows
            .filter((item) => item.type === "folder")
            .map((item) => ({ name: item.name, prefix: item.prefix, path: item.path || item.prefix })),
          files: pagedRows
            .filter((item) => item.type === "file")
            .map((item) => ({
              key: item.key,
              name: item.name,
              path: item.path || item.key,
              size: Number(item.size || 0),
              lastModified: item.lastModified || null
            }))
        };
      };
      const keyword = String(req.query.keyword || "").trim().toLowerCase();
      if (keyword) {
        const limitRaw = Math.floor(Number(req.query.limit));
        const searchLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 20000) : 20000;
        const matchedFoldersMap = new Map();
        const matchedFiles = [];
        const buildNameFromPath = (targetPath) => {
          const cleaned = String(targetPath || "").replace(/\/$/, "");
          const parts = cleaned.split("/").filter(Boolean);
          return parts[parts.length - 1] || "/";
        };
        const appendFolder = (folderPath) => {
          const normalizedFolderPath = String(folderPath || "");
          if (!normalizedFolderPath || matchedFoldersMap.has(normalizedFolderPath)) return;
          const name = buildNameFromPath(normalizedFolderPath);
          matchedFoldersMap.set(normalizedFolderPath, {
            name,
            prefix: normalizedFolderPath,
            path: normalizedFolderPath
          });
        };
        const appendFile = (item) => {
          const key = String(item.key || item.path || "").trim();
          if (!key) return;
          matchedFiles.push({
            key,
            name: String(item.name || buildNameFromPath(key)),
            path: key,
            size: Number(item.size || 0),
            lastModified: item.lastModified || null
          });
        };
        if (String(mount.type || "") === "tencent") {
          const cosInfo = createCosClientByMount(mount);
          if (cosInfo.error) return res.status(400).json({ message: cosInfo.error });
          let marker = "";
          let truncated = true;
          while (truncated && (matchedFiles.length + matchedFoldersMap.size) < searchLimit) {
            const data = await cosRequest(cosInfo.client, "getBucket", {
              Bucket: cosInfo.bucket,
              Region: cosInfo.region,
              Prefix: normalizedPrefix,
              MaxKeys: 1000,
              Marker: marker || undefined
            });
            const contents = Array.isArray(data.Contents) ? data.Contents : [];
            contents.forEach((item) => {
              const key = String(item.Key || "");
              if (!key || key === normalizedPrefix) return;
              if (!key.toLowerCase().includes(keyword)) return;
              if (key.endsWith("/")) {
                appendFolder(key);
                return;
              }
              appendFile({
                key,
                path: key,
                name: buildNameFromPath(key),
                size: Number(item.Size || 0),
                lastModified: item.LastModified || null
              });
            });
            truncated = String(data.IsTruncated || "false").toLowerCase() === "true";
            marker = String(data.NextMarker || "");
            if (!marker && contents.length) {
              marker = String(contents[contents.length - 1].Key || "");
            }
            if (!marker) break;
          }
        } else if (String(mount.type || "") === "qiniu") {
          const qiniuInfo = createQiniuClientByMount(mount);
          if (qiniuInfo.error) return res.status(400).json({ message: qiniuInfo.error });
          let marker = "";
          while ((matchedFiles.length + matchedFoldersMap.size) < searchLimit) {
            const data = await qiniuBucketRequest(qiniuInfo.bucketManager, "listPrefix", qiniuInfo.bucket, {
              prefix: normalizedPrefix,
              limit: 1000,
              marker: marker || undefined
            });
            const items = Array.isArray(data.items) ? data.items : [];
            items.forEach((item) => {
              const key = String(item.key || "");
              if (!key || key === normalizedPrefix) return;
              if (!key.toLowerCase().includes(keyword)) return;
              if (key.endsWith("/")) {
                appendFolder(key);
                return;
              }
              const putTime = Number(item.putTime || 0);
              appendFile({
                key,
                path: key,
                name: buildNameFromPath(key),
                size: Number(item.fsize || 0),
                lastModified: putTime > 0 ? new Date(Math.floor(putTime / 10000)).toISOString() : null
              });
            });
            marker = String(data.marker || "");
            if (!marker) break;
          }
        } else {
          const ossInfo = createOssClientByMount(mount);
          if (ossInfo.error) return res.status(400).json({ message: ossInfo.error });
          let continuationToken = "";
          let hasMore = true;
          while (hasMore && (matchedFiles.length + matchedFoldersMap.size) < searchLimit) {
            const options = {
              prefix: normalizedPrefix,
              "max-keys": 1000
            };
            if (continuationToken) {
              options["continuation-token"] = continuationToken;
            }
            const data = await ossInfo.client.listV2(options);
            const objects = Array.isArray(data.objects) ? data.objects : [];
            objects.forEach((item) => {
              const key = String(item.name || "");
              if (!key || key === normalizedPrefix) return;
              if (!key.toLowerCase().includes(keyword)) return;
              if (key.endsWith("/")) {
                appendFolder(key);
                return;
              }
              appendFile({
                key,
                path: key,
                name: buildNameFromPath(key),
                size: Number(item.size || 0),
                lastModified: item.lastModified || null
              });
            });
            hasMore = Boolean(data.isTruncated);
            continuationToken = String(data.nextContinuationToken || "");
            if (!continuationToken) hasMore = false;
          }
        }
        const rows = [
          ...Array.from(matchedFoldersMap.values()).slice(0, searchLimit).map((item) => ({
            type: "folder",
            name: item.name,
            prefix: item.prefix,
            path: item.path || item.prefix
          })),
          ...matchedFiles.slice(0, searchLimit).map((item) => ({
            type: "file",
            key: item.key,
            name: item.name,
            path: item.path || item.key,
            size: Number(item.size || 0),
            lastModified: item.lastModified || null
          }))
        ];
        sortRows(rows);
        const payload = toPagedPayload(rows);
        return res.json({
          prefix: normalizedPrefix,
          keyword,
          ...payload
        });
      }
      let folders = [];
      let files = [];
      if (String(mount.type || "") === "tencent") {
        const cosInfo = createCosClientByMount(mount);
        if (cosInfo.error) {
          res.status(400).json({ message: cosInfo.error });
          return;
        }
        const data = await cosRequest(cosInfo.client, "getBucket", {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Prefix: normalizedPrefix,
          Delimiter: "/",
          MaxKeys: 1000
        });
        folders = (Array.isArray(data.CommonPrefixes) ? data.CommonPrefixes : []).map((item) => ({
          name: String(item.Prefix || "").replace(/\/$/, "").split("/").filter(Boolean).pop() || "/",
          prefix: String(item.Prefix || ""),
          path: String(item.Prefix || "")
        }));
        files = (Array.isArray(data.Contents) ? data.Contents : [])
          .filter((item) => String(item.Key || "") !== normalizedPrefix)
          .map((item) => ({
            key: item.Key || "",
            name: String(item.Key || "").split("/").filter(Boolean).pop() || item.Key || "",
            path: item.Key || "",
            size: Number(item.Size || 0),
            lastModified: item.LastModified || null
          }));
      } else if (String(mount.type || "") === "qiniu") {
        const qiniuInfo = createQiniuClientByMount(mount);
        if (qiniuInfo.error) {
          res.status(400).json({ message: qiniuInfo.error });
          return;
        }
        const data = await qiniuBucketRequest(qiniuInfo.bucketManager, "listPrefix", qiniuInfo.bucket, {
          prefix: normalizedPrefix,
          delimiter: "/",
          limit: 1000
        });
        const commonPrefixes = Array.isArray(data.commonPrefixes) ? data.commonPrefixes : [];
        const items = Array.isArray(data.items) ? data.items : [];
        folders = commonPrefixes.map((folderPrefix) => {
          const normalizedFolderPrefix = String(folderPrefix || "");
          const trimmed = normalizedFolderPrefix.endsWith("/") ? normalizedFolderPrefix.slice(0, -1) : normalizedFolderPrefix;
          return {
            name: trimmed.split("/").filter(Boolean).pop() || trimmed || "/",
            prefix: normalizedFolderPrefix,
            path: normalizedFolderPrefix
          };
        });
        files = items
          .filter((item) => String(item.key || "") !== normalizedPrefix)
          .map((item) => {
            const putTime = Number(item.putTime || 0);
            return {
              key: String(item.key || ""),
              name: String(item.key || "").split("/").filter(Boolean).pop() || String(item.key || ""),
              path: String(item.key || ""),
              size: Number(item.fsize || 0),
              lastModified: putTime > 0 ? new Date(Math.floor(putTime / 10000)).toISOString() : null
            };
          });
      } else {
        const ossInfo = createOssClientByMount(mount);
        if (ossInfo.error) {
          res.status(400).json({ message: ossInfo.error });
          return;
        }
        const data = await ossInfo.client.listV2({
          prefix: normalizedPrefix,
          delimiter: "/",
          "max-keys": 1000
        });
        const prefixes = Array.isArray(data.prefixes) ? data.prefixes : [];
        const objects = Array.isArray(data.objects) ? data.objects : [];
        folders = prefixes.map((folderPrefix) => {
          const normalizedFolderPrefix = String(folderPrefix || "");
          const trimmed = normalizedFolderPrefix.endsWith("/") ? normalizedFolderPrefix.slice(0, -1) : normalizedFolderPrefix;
          return {
            name: trimmed.split("/").filter(Boolean).pop() || trimmed || "/",
            prefix: normalizedFolderPrefix,
            path: normalizedFolderPrefix
          };
        });
        files = objects
          .filter((item) => String(item.name || "") !== normalizedPrefix)
          .map((item) => ({
            key: String(item.name || ""),
            name: String(item.name || "").split("/").filter(Boolean).pop() || String(item.name || ""),
            path: String(item.name || ""),
            size: Number(item.size || 0),
            lastModified: item.lastModified || null
          }));
      }
      const rows = [
        ...folders.map((item) => ({
          type: "folder",
          name: String(item.name || ""),
          prefix: String(item.prefix || item.path || ""),
          path: String(item.path || item.prefix || "")
        })),
        ...files.map((item) => ({
          type: "file",
          key: String(item.key || item.path || ""),
          name: String(item.name || ""),
          path: String(item.path || item.key || ""),
          size: Number(item.size || 0),
          lastModified: item.lastModified || null
        }))
      ];
      sortRows(rows);
      const payload = toPagedPayload(rows);
      res.json({
        prefix: normalizedPrefix,
        ...payload
      });
    } catch (error) {
      res.status(500).json({ message: error.message || "获取对象列表失败" });
    }
  });

  app.post("/api/mounts/:id/objects/upload", authRequired, cosUploadSingle("file"), async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "挂载ID不合法" });
    if (!req.file) return res.status(400).json({ message: "请选择要上传的文件" });
    try {
      const mount = await getMountById(id, req.user.userId);
      if (!ensureObjectMount(mount, res)) return;
      const key = normalizeObjectKey(req.body.key || req.file.originalname);
      if (!key) return res.status(400).json({ message: "对象路径不合法" });
      if (String(mount.type || "") === "tencent") {
        const cosInfo = createCosClientByMount(mount);
        if (cosInfo.error) {
          res.status(400).json({ message: cosInfo.error });
          return;
        }
        await cosRequest(cosInfo.client, "putObject", {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Key: key,
          Body: req.file.buffer,
          ContentLength: req.file.size
        });
      } else if (String(mount.type || "") === "qiniu") {
        const qiniuInfo = createQiniuClientByMount(mount);
        if (qiniuInfo.error) {
          res.status(400).json({ message: qiniuInfo.error });
          return;
        }
        const uploadToken = new qiniu.rs.PutPolicy({ scope: `${qiniuInfo.bucket}:${key}` }).uploadToken(qiniuInfo.mac);
        await qiniuUploadRequest(qiniuInfo.formUploader, uploadToken, key, req.file.buffer, qiniuInfo.putExtra);
      } else {
        const ossInfo = createOssClientByMount(mount);
        if (ossInfo.error) {
          res.status(400).json({ message: ossInfo.error });
          return;
        }
        await ossInfo.client.put(key, req.file.buffer);
      }
      res.json({ message: "上传成功" });
    } catch (error) {
      res.status(500).json({ message: error.message || "上传失败" });
    }
  });

  app.post("/api/mounts/:id/objects/folder", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    const folderName = String(req.body && req.body.name ? req.body.name : "").trim();
    const parentPrefix = normalizeObjectKey(req.body && req.body.prefix ? req.body.prefix : "");
    if (!id) return res.status(400).json({ message: "挂载ID不合法" });
    if (!folderName) return res.status(400).json({ message: "目录名不能为空" });
    if (folderName.includes("/")) return res.status(400).json({ message: "目录名不能包含 /" });
    const folderBase = normalizeObjectKey(parentPrefix ? `${parentPrefix}/${folderName}` : folderName);
    if (!folderBase) return res.status(400).json({ message: "目录路径不合法" });
    const folderKey = `${folderBase}/`;
    try {
      const mount = await getMountById(id, req.user.userId);
      if (!ensureObjectMount(mount, res)) return;
      if (String(mount.type || "") === "tencent") {
        const cosInfo = createCosClientByMount(mount);
        if (cosInfo.error) {
          res.status(400).json({ message: cosInfo.error });
          return;
        }
        await cosRequest(cosInfo.client, "putObject", {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Key: folderKey,
          Body: Buffer.alloc(0),
          ContentLength: 0
        });
      } else if (String(mount.type || "") === "qiniu") {
        const qiniuInfo = createQiniuClientByMount(mount);
        if (qiniuInfo.error) {
          res.status(400).json({ message: qiniuInfo.error });
          return;
        }
        const uploadToken = new qiniu.rs.PutPolicy({ scope: `${qiniuInfo.bucket}:${folderKey}` }).uploadToken(qiniuInfo.mac);
        await qiniuUploadRequest(qiniuInfo.formUploader, uploadToken, folderKey, Buffer.alloc(0), qiniuInfo.putExtra);
      } else {
        const ossInfo = createOssClientByMount(mount);
        if (ossInfo.error) {
          res.status(400).json({ message: ossInfo.error });
          return;
        }
        await ossInfo.client.put(folderKey, Buffer.alloc(0));
      }
      res.json({ message: "目录创建成功", key: folderKey });
    } catch (error) {
      res.status(500).json({ message: error.message || "目录创建失败" });
    }
  });

  app.get("/api/mounts/:id/objects/download", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    const key = normalizeObjectKey(req.query.key || "");
    if (!id) return res.status(400).json({ message: "挂载ID不合法" });
    if (!key) return res.status(400).json({ message: "对象路径不合法" });
    try {
      const mount = await getMountById(id, req.user.userId);
      const fileName = path.basename(key);
      if (!ensureObjectMount(mount, res)) return;
      if (String(mount.type || "") === "tencent") {
        const cosInfo = createCosClientByMount(mount);
        if (cosInfo.error) {
          res.status(400).json({ message: cosInfo.error });
          return;
        }
        const data = await cosRequest(cosInfo.client, "getObject", {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Key: key
        });
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.setHeader("Content-Type", data.headers && data.headers["content-type"] ? data.headers["content-type"] : "application/octet-stream");
        res.send(data.Body);
        return;
      }
      if (String(mount.type || "") === "qiniu") {
        const qiniuInfo = createQiniuClientByMount(mount);
        if (qiniuInfo.error) {
          res.status(400).json({ message: qiniuInfo.error });
          return;
        }
        if (!qiniuInfo.downloadDomain) {
          res.status(400).json({ message: "七牛下载需要配置 domain 或 downloadDomain" });
          return;
        }
        const domain = /^https?:\/\//i.test(qiniuInfo.downloadDomain)
          ? qiniuInfo.downloadDomain
          : `https://${qiniuInfo.downloadDomain}`;
        const downloadUrl = qiniuInfo.bucketManager.privateDownloadUrl(domain, key, Math.floor(Date.now() / 1000) + 3600);
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`下载失败(${response.status})`);
        }
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const dataBuffer = Buffer.from(await response.arrayBuffer());
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.setHeader("Content-Type", contentType);
        res.send(dataBuffer);
        return;
      }
      const ossInfo = createOssClientByMount(mount);
      if (ossInfo.error) {
        res.status(400).json({ message: ossInfo.error });
        return;
      }
      const data = await ossInfo.client.get(key);
      const contentType = data && data.res && data.res.headers && data.res.headers["content-type"]
        ? data.res.headers["content-type"]
        : "application/octet-stream";
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader("Content-Type", contentType);
      res.send(data && data.content !== undefined ? data.content : Buffer.alloc(0));
    } catch (error) {
      res.status(500).json({ message: error.message || "下载失败" });
    }
  });

  app.put("/api/mounts/:id/objects/rename", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    const rawFromKey = String(req.body && req.body.fromKey ? req.body.fromKey : "");
    const rawToKey = String(req.body && req.body.toKey ? req.body.toKey : "");
    const normalizedFromKey = normalizeObjectKey(rawFromKey);
    const normalizedToKey = normalizeObjectKey(rawToKey);
    const fromKey = /\/\s*$/.test(rawFromKey) ? `${normalizedFromKey}/` : normalizedFromKey;
    const toKey = /\/\s*$/.test(rawToKey) ? `${normalizedToKey}/` : normalizedToKey;
    if (!id) return res.status(400).json({ message: "挂载ID不合法" });
    if (!fromKey || !toKey) return res.status(400).json({ message: "对象路径不合法" });
    try {
      const mount = await getMountById(id, req.user.userId);
      if (!ensureObjectMount(mount, res)) return;
      if (String(mount.type || "") === "tencent") {
        const cosInfo = createCosClientByMount(mount);
        if (cosInfo.error) {
          res.status(400).json({ message: cosInfo.error });
          return;
        }
        await cosRequest(cosInfo.client, "putObjectCopy", {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Key: toKey,
          CopySource: `${cosInfo.bucket}.cos.${cosInfo.region}.myqcloud.com/${encodeCosKey(fromKey)}`
        });
        await cosRequest(cosInfo.client, "deleteObject", {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Key: fromKey
        });
      } else if (String(mount.type || "") === "qiniu") {
        const qiniuInfo = createQiniuClientByMount(mount);
        if (qiniuInfo.error) {
          res.status(400).json({ message: qiniuInfo.error });
          return;
        }
        await qiniuBucketRequest(qiniuInfo.bucketManager, "move", qiniuInfo.bucket, fromKey, qiniuInfo.bucket, toKey, { force: true });
      } else {
        const ossInfo = createOssClientByMount(mount);
        if (ossInfo.error) {
          res.status(400).json({ message: ossInfo.error });
          return;
        }
        const isDirectory = fromKey.endsWith("/");
        if (isDirectory) {
          let continuationToken = "";
          let hasMore = true;
          while (hasMore) {
            const options = {
              prefix: fromKey,
              "max-keys": 1000
            };
            if (continuationToken) {
              options["continuation-token"] = continuationToken;
            }
            const data = await ossInfo.client.listV2(options);
            const objects = Array.isArray(data.objects) ? data.objects : [];
            for (const obj of objects) {
              const oldKey = obj.name;
              const newKey = oldKey.replace(fromKey, toKey);
              await ossInfo.client.copy(newKey, oldKey);
              await ossInfo.client.delete(oldKey);
            }
            hasMore = Boolean(data.isTruncated);
            continuationToken = String(data.nextContinuationToken || "");
            if (!continuationToken) hasMore = false;
          }
        } else {
          await ossInfo.client.copy(toKey, fromKey);
          await ossInfo.client.delete(fromKey);
        }
      }
      res.json({ message: "重命名成功" });
    } catch (error) {
      res.status(500).json({ message: error.message || "重命名失败" });
    }
  });

  app.delete("/api/mounts/:id/objects", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    const rawKey = String(req.query.key || "");
    const normalizedKey = normalizeObjectKey(rawKey);
    const key = /\/\s*$/.test(rawKey) ? `${normalizedKey}/` : normalizedKey;
    if (!id) return res.status(400).json({ message: "挂载ID不合法" });
    if (!key) return res.status(400).json({ message: "对象路径不合法" });
    try {
      const mount = await getMountById(id, req.user.userId);
      if (!ensureObjectMount(mount, res)) return;
      if (String(mount.type || "") === "tencent") {
        const cosInfo = createCosClientByMount(mount);
        if (cosInfo.error) {
          res.status(400).json({ message: cosInfo.error });
          return;
        }
        await cosRequest(cosInfo.client, "deleteObject", {
          Bucket: cosInfo.bucket,
          Region: cosInfo.region,
          Key: key
        });
      } else if (String(mount.type || "") === "qiniu") {
        const qiniuInfo = createQiniuClientByMount(mount);
        if (qiniuInfo.error) {
          res.status(400).json({ message: qiniuInfo.error });
          return;
        }
        await qiniuBucketRequest(qiniuInfo.bucketManager, "delete", qiniuInfo.bucket, key);
      } else {
        const ossInfo = createOssClientByMount(mount);
        if (ossInfo.error) {
          res.status(400).json({ message: ossInfo.error });
          return;
        }
        const isDirectory = key.endsWith("/");
        if (isDirectory) {
          let continuationToken = "";
          let hasMore = true;
          while (hasMore) {
            const options = {
              prefix: key,
              "max-keys": 1000
            };
            if (continuationToken) {
              options["continuation-token"] = continuationToken;
            }
            const data = await ossInfo.client.listV2(options);
            const objects = Array.isArray(data.objects) ? data.objects : [];
            for (const obj of objects) {
              await ossInfo.client.delete(obj.name);
            }
            hasMore = Boolean(data.isTruncated);
            continuationToken = String(data.nextContinuationToken || "");
            if (!continuationToken) hasMore = false;
          }
        } else {
          await ossInfo.client.delete(key);
        }
      }
      res.json({ message: "删除成功" });
    } catch (error) {
      res.status(500).json({ message: error.message || "删除失败" });
    }
  });

  app.delete("/api/mounts/:id", authRequired, async (req, res) => {
    try {
      const [result] = await pool.query("DELETE FROM mounts WHERE id = ? AND user_id = ?", [req.params.id, req.user.userId]);
      if (Number(result.affectedRows || 0) === 0) return res.status(404).json({ message: "挂载不存在" });
      res.json({ message: "挂载已删除" });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
