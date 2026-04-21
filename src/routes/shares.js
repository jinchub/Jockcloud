const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const SHARE_CODE_MIN_LENGTH = 8;
const SHARE_CODE_MAX_LENGTH = 32;
const shareAccessStore = new Map();
const SHARE_ACCESS_TOKEN_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = (app, deps) => {
  const {
    authRequired,
    requireFilePermission,
    pool,
    sendDbError,
    resolveStorageSpaceTypeByRequest,
    normalizeFolderId,
    hasFilePermission,
    normalizeStorageSpaceType,
    collectDescendantFolderIds,
    hashPassword,
    verifyPassword,
    readSettings,
    resolveAbsoluteStoragePath,
    fs,
    path,
    os,
    runCompressArchive,
    safeFileName,
    crypto,
    Throttle,
    getUserDownloadSpeedLimit,
    createSpeedLimitedStream,
    logFileOperation,
    normalizeFileCategoryKey,
    resolveStoredFileCategory,
    getUploadCategoryRuntimeOptions,
    DEFAULT_SETTINGS
  } = deps;

  const makeToken = () => crypto.randomBytes(32).toString("hex");

  const randomFromAlphabet = (length) => {
    const size = Math.max(1, Math.floor(Number(length) || 0));
    const chars = [];
    for (let i = 0; i < size; i += 1) {
      const index = crypto.randomInt(0, SHARE_CODE_ALPHABET.length);
      chars.push(SHARE_CODE_ALPHABET[index]);
    }
    return chars.join("");
  };

  const normalizeShareCode = (value) => {
    const normalized = String(value || "").trim();
    if (!/^[A-Za-z0-9]+$/.test(normalized)) return "";
    if (normalized.length < SHARE_CODE_MIN_LENGTH || normalized.length > SHARE_CODE_MAX_LENGTH) return "";
    return normalized;
  };

  const normalizeShareAccessCode = (value) => {
    const code = String(value || "").trim();
    if (!code) return "";
    if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return "";
    return code;
  };

  const normalizeShareExpireType = (value) => {
    const expireType = String(value || "").trim().toLowerCase();
    if (["1d", "3d", "7d", "1m", "1y", "forever"].includes(expireType)) {
      return expireType;
    }
    return "7d";
  };

  const calculateShareExpiresAt = (expireType) => {
    const normalized = normalizeShareExpireType(expireType);
    const now = Date.now();
    if (normalized === "forever") return null;
    if (normalized === "1d") return new Date(now + 24 * 60 * 60 * 1000);
    if (normalized === "3d") return new Date(now + 3 * 24 * 60 * 60 * 1000);
    if (normalized === "1m") return new Date(now + 30 * 24 * 60 * 60 * 1000);
    if (normalized === "1y") return new Date(now + 365 * 24 * 60 * 60 * 1000);
    return new Date(now + 7 * 24 * 60 * 60 * 1000);
  };

  const formatShareExpireLabel = (expiresAt) => {
    if (!expiresAt) return "永久";
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return "未知";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}`;
  };

  const isShareLinkExpired = (shareRow) => {
    if (!shareRow) return true;
    if (Number(shareRow.isCanceled || 0) === 1) return true;
    if (!shareRow.expiresAt) return false;
    const expireTime = new Date(shareRow.expiresAt).getTime();
    if (Number.isNaN(expireTime)) return true;
    return expireTime <= Date.now();
  };

  const cleanupExpiredShareAccessToken = () => {
    const now = Date.now();
    for (const [token, info] of shareAccessStore.entries()) {
      if (!info || !info.expiresAt || info.expiresAt <= now) {
        shareAccessStore.delete(token);
      }
    }
  };

  const createShareAccessToken = (shareId) => {
    cleanupExpiredShareAccessToken();
    const token = makeToken();
    shareAccessStore.set(token, {
      shareId: Number(shareId) || 0,
      expiresAt: Date.now() + SHARE_ACCESS_TOKEN_EXPIRE_MS
    });
    return token;
  };

  const parseShareAccessToken = (req) => {
    if (req && req.headers && req.headers["x-share-token"]) {
      return String(req.headers["x-share-token"] || "").trim();
    }
    if (req && req.query && req.query.token) {
      return String(req.query.token || "").trim();
    }
    return "";
  };

  const verifyShareAccessToken = (shareId, token) => {
    if (!token) return false;
    cleanupExpiredShareAccessToken();
    const data = shareAccessStore.get(token);
    if (!data) return false;
    if (Number(data.shareId || 0) !== Number(shareId || 0)) return false;
    if (Number(data.expiresAt || 0) <= Date.now()) {
      shareAccessStore.delete(token);
      return false;
    }
    return true;
  };

  const getShareByCode = async (shareCode) => {
    const [rows] = await pool.query(
      `SELECT id, user_id AS userId, space_type AS spaceType, entry_type AS entryType, entry_id AS entryId
        , share_code AS shareCode, password_hash AS passwordHash, expires_at AS expiresAt
        , access_code AS accessCode, visit_count AS visitCount, download_count AS downloadCount
        , is_canceled AS isCanceled, created_at AS createdAt, updated_at AS updatedAt
       FROM shares
       WHERE share_code = ?
       LIMIT 1`,
      [shareCode]
    );
    if (!rows.length) return null;
    return rows[0];
  };

  const getShareEntryDetail = async (shareRow) => {
    if (!shareRow) return null;
    const spaceType = normalizeStorageSpaceType(shareRow.spaceType);
    const userId = Number(shareRow.userId) || 0;
    const entryId = Number(shareRow.entryId) || 0;
    if (shareRow.entryType === "file") {
      const [rows] = await pool.query(
        `SELECT id, original_name AS name, folder_id AS parentId, size, mime_type AS mimeType
          , storage_name AS storageName, created_at AS createdAt, updated_at AS updatedAt
         FROM files
         WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL
         LIMIT 1`,
        [entryId, userId, spaceType]
      );
      if (!rows.length) return null;
      return { ...rows[0], type: "file" };
    }
    const [rows] = await pool.query(
      `SELECT id, name, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt
       FROM folders
       WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL
       LIMIT 1`,
      [entryId, userId, spaceType]
    );
    if (!rows.length) return null;
    return { ...rows[0], type: "folder" };
  };

  const isFolderInsideShareRoot = async (shareRow, folderId) => {
    const targetFolderId = Number(folderId) || 0;
    if (!targetFolderId) return false;
    if (!shareRow || shareRow.entryType !== "folder") return false;
    const rootFolderId = Number(shareRow.entryId) || 0;
    if (targetFolderId === rootFolderId) return true;
    const spaceType = normalizeStorageSpaceType(shareRow.spaceType);
    const userId = Number(shareRow.userId) || 0;
    let currentFolderId = targetFolderId;
    const visited = new Set();
    while (currentFolderId) {
      if (currentFolderId === rootFolderId) return true;
      if (visited.has(currentFolderId)) return false;
      visited.add(currentFolderId);
      const [rows] = await pool.query(
        "SELECT parent_id AS parentId FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [currentFolderId, userId, spaceType]
      );
      if (!rows.length) return false;
      currentFolderId = rows[0].parentId ? Number(rows[0].parentId) : 0;
    }
    return false;
  };

  const canAccessShareFile = async (shareRow, fileId) => {
    const targetFileId = Number(fileId) || 0;
    if (!targetFileId || !shareRow) return null;
    const spaceType = normalizeStorageSpaceType(shareRow.spaceType);
    const userId = Number(shareRow.userId) || 0;
    const [rows] = await pool.query(
      `SELECT id, original_name AS originalName, storage_name AS storageName, folder_id AS folderId
        , size, mime_type AS mimeType
       FROM files
       WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL
       LIMIT 1`,
      [targetFileId, userId, spaceType]
    );
    if (!rows.length) return null;
    const fileRow = rows[0];
    if (shareRow.entryType === "file") {
      return Number(shareRow.entryId) === targetFileId ? fileRow : null;
    }
    const folderId = fileRow.folderId === null || fileRow.folderId === undefined ? null : Number(fileRow.folderId);
    if (folderId === null) return null;
    const inside = await isFolderInsideShareRoot(shareRow, folderId);
    return inside ? fileRow : null;
  };

  const collectShareFolderDownloadItems = async (shareRow, targetFolderId) => {
    const folderId = Number(targetFolderId) || 0;
    if (!folderId || !shareRow || shareRow.entryType !== "folder") {
      return null;
    }
    const inside = await isFolderInsideShareRoot(shareRow, folderId);
    if (!inside) return null;
    const spaceType = normalizeStorageSpaceType(shareRow.spaceType);
    const userId = Number(shareRow.userId) || 0;
    const folderIds = await collectDescendantFolderIds(userId, folderId, spaceType);
    if (!folderIds.length) return null;
    const folderClause = folderIds.map(() => "?").join(", ");
    const [folderRows] = await pool.query(
      `SELECT id, name, parent_id AS parentId
       FROM folders
       WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND id IN (${folderClause})`,
      [userId, spaceType, ...folderIds]
    );
    const [fileRows] = await pool.query(
      `SELECT id, folder_id AS folderId, original_name AS originalName, storage_name AS storageName
       FROM files
       WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND folder_id IN (${folderClause})`,
      [userId, spaceType, ...folderIds]
    );
    return { folderRows, fileRows };
  };

  const getShareDownloadSpeedLimit = (settings) => {
    if (!settings || !settings.download) {
      return 102400;
    }
    
    if (settings.download.shareSpeedLimit) {
      const speedLimit = settings.download.shareSpeedLimit;
      if (speedLimit.unit === 'MB/s') {
        return (speedLimit.value || 0) * 1024;
      }
      return speedLimit.value || 0;
    }
    
    if (settings.download.shareSpeedLimitKb !== undefined) {
      return settings.download.shareSpeedLimitKb;
    }
    return (settings.download.shareSpeedLimitMb ? settings.download.shareSpeedLimitMb * 1024 : 102400);
  };

  app.get("/s/:shareCode", async (req, res) => {
    const fs = require("fs");
    const crypto = require("crypto");
    const viewsDir = path.join(__dirname, "../../views");
    const templatePath = path.join(viewsDir, "share.html");
    
    if (fs.existsSync(templatePath)) {
      let content = fs.readFileSync(templatePath, "utf8");
      
      content = content.replace(/<!--\s*INCLUDE:\s*([^\s>]+)\s*-->/g, (match, compName) => {
        const compPath = path.join(viewsDir, "components", compName);
        if (fs.existsSync(compPath)) {
          return fs.readFileSync(compPath, "utf8");
        }
        return match;
      });

      content = content
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/>\s+</g, "><")
        .replace(/\s{2,}/g, " ")
        .trim();

      const etag = '"' + crypto.createHash("md5").update(content).digest("hex") + '"';
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("ETag", etag);
      res.setHeader("Content-Type", "text/html; charset=utf-8");

      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }
      return res.send(content);
    }
    res.status(404).send("Share page not found");
  });

  app.post("/api/shares", authRequired, async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    if (!hasFilePermission(req, "download")) {
      res.status(403).json({ message: "无权执行该操作" });
      return;
    }
    const entryType = String(req.body && req.body.entryType || "").trim();
    const entryId = normalizeFolderId(req.body && req.body.entryId);
    const expireType = normalizeShareExpireType(req.body && req.body.expireType);
    const codeMode = String(req.body && req.body.codeMode || "none").trim().toLowerCase();
    const customAccessCode = normalizeShareAccessCode(req.body && req.body.accessCode);
    if (!["file", "folder"].includes(entryType)) {
      res.status(400).json({ message: "分享类型不合法" });
      return;
    }
    if (!entryId) {
      res.status(400).json({ message: "分享对象不合法" });
      return;
    }
    if (!["none", "random", "custom"].includes(codeMode)) {
      res.status(400).json({ message: "提取码类型不合法" });
      return;
    }
    if (codeMode === "custom" && !customAccessCode) {
      res.status(400).json({ message: "自定义提取码格式不合法，仅支持4-12位字母数字" });
      return;
    }
    try {
      const existsSql = entryType === "file"
        ? "SELECT id, original_name AS name FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1"
        : "SELECT id, name FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1";
      const [entryRows] = await pool.query(existsSql, [entryId, req.user.userId, spaceType]);
      if (!entryRows.length) {
        res.status(404).json({ message: "分享对象不存在" });
        return;
      }
      let shareCode = "";
      for (let i = 0; i < 10; i += 1) {
        const candidate = randomFromAlphabet(10);
        const [shareRows] = await pool.query("SELECT id FROM shares WHERE share_code = ? LIMIT 1", [candidate]);
        if (!shareRows.length) {
          shareCode = candidate;
          break;
        }
      }
      if (!shareCode) {
        res.status(500).json({ message: "生成分享链接失败，请重试" });
        return;
      }
      let accessCode = "";
      if (codeMode === "random") {
        accessCode = randomFromAlphabet(4);
      } else if (codeMode === "custom") {
        accessCode = customAccessCode;
      }
      const passwordHash = accessCode ? await hashPassword(accessCode) : null;
      const expiresAt = calculateShareExpiresAt(expireType);
      await pool.query(
        `INSERT INTO shares (user_id, space_type, entry_type, entry_id, share_code, password_hash, access_code, expires_at, is_canceled, visit_count, download_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
        [req.user.userId, spaceType, entryType, entryId, shareCode, passwordHash, accessCode || null, expiresAt]
      );
      const protocol = req.headers["x-forwarded-proto"] ? String(req.headers["x-forwarded-proto"]).split(",")[0].trim() : req.protocol;
      const host = req.get("host");
      const shareUrl = `${protocol}://${host}/s/${shareCode}`;
      res.json({
        message: "分享链接已生成",
        shareCode,
        shareUrl,
        accessCode: accessCode || "",
        expireType,
        expiresAt,
        expireLabel: formatShareExpireLabel(expiresAt),
        entryType,
        entryName: entryRows[0].name
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/shares", authRequired, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, user_id AS userId, space_type AS spaceType, entry_type AS entryType, entry_id AS entryId
          , share_code AS shareCode, access_code AS accessCode, visit_count AS visitCount, download_count AS downloadCount
          , expires_at AS expiresAt, is_canceled AS isCanceled, created_at AS createdAt
         FROM shares
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.user.userId]
      );
      const result = [];
      for (const item of rows) {
        const entryDetail = await getShareEntryDetail(item);
        const isExpired = isShareLinkExpired(item) || !entryDetail;
        result.push({
          shareCode: item.shareCode,
          entryType: item.entryType,
          entryName: entryDetail ? (entryDetail.name || entryDetail.originalName || "") : "分享内容不存在",
          visitCount: Number(item.visitCount || 0),
          downloadCount: Number(item.downloadCount || 0),
          expiresAt: item.expiresAt,
          expireLabel: formatShareExpireLabel(item.expiresAt),
          isExpired,
          isCanceled: Number(item.isCanceled || 0) === 1,
          hasAccessCode: !!item.accessCode
        });
      }
      res.json(result);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/shares/:shareCode/access-code", authRequired, async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    if (!shareCode) {
      res.status(400).json({ message: "分享码不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT access_code AS accessCode FROM shares WHERE share_code = ? AND user_id = ? LIMIT 1",
        [shareCode, req.user.userId]
      );
      if (!rows.length) {
        res.status(404).json({ message: "分享不存在" });
        return;
      }
      res.json({ accessCode: rows[0].accessCode || "" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/shares/:shareCode", authRequired, async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    if (!shareCode) {
      res.status(400).json({ message: "分享码不合法" });
      return;
    }
    try {
      const [result] = await pool.query("DELETE FROM shares WHERE share_code = ? AND user_id = ?", [shareCode, req.user.userId]);
      if (Number(result.affectedRows || 0) === 0) {
        res.status(404).json({ message: "分享不存在" });
        return;
      }
      res.json({ message: "已取消分享" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/share/:shareCode/verify", async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    if (!shareCode) {
      res.status(400).json({ message: "分享码不合法" });
      return;
    }
    const inputCode = normalizeShareAccessCode(req.body && req.body.accessCode);
    if (!inputCode) {
      res.status(400).json({ message: "提取码格式不合法" });
      return;
    }
    try {
      const shareRow = await getShareByCode(shareCode);
      if (!shareRow || isShareLinkExpired(shareRow)) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      const entryDetail = await getShareEntryDetail(shareRow);
      if (!entryDetail) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      if (!shareRow.passwordHash) {
        res.status(401).json({ message: "提取码错误" });
        return;
      }
      const codeVerified = await verifyPassword(inputCode, shareRow.passwordHash);
      if (!codeVerified) {
        res.status(401).json({ message: "提取码错误" });
        return;
      }
      const token = createShareAccessToken(shareRow.id);
      res.json({ message: "验证成功", token, expireLabel: formatShareExpireLabel(shareRow.expiresAt) });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/share/:shareCode", async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    if (!shareCode) {
      res.status(400).json({ message: "分享码不合法" });
      return;
    }
    try {
      const shareRow = await getShareByCode(shareCode);
      if (!shareRow || isShareLinkExpired(shareRow)) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      const entryDetail = await getShareEntryDetail(shareRow);
      if (!entryDetail) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      let shareUser = null;
      try {
        const [userRows] = await pool.query("SELECT id, username, name, avatar FROM users WHERE id = ? LIMIT 1", [shareRow.userId]);
        if (userRows.length > 0) {
          shareUser = {
            id: userRows[0].id,
            username: userRows[0].username,
            name: userRows[0].name,
            avatar: userRows[0].avatar
          };
        }
      } catch (e) {
        console.error("获取分享用户信息失败", e);
      }
      const needPassword = !!shareRow.passwordHash;
      const token = parseShareAccessToken(req);
      const verified = !needPassword || verifyShareAccessToken(shareRow.id, token);
      const payload = {
        shareCode: shareRow.shareCode,
        needPassword,
        verified,
        expireLabel: formatShareExpireLabel(shareRow.expiresAt),
        expiresAt: shareRow.expiresAt,
        isForever: !shareRow.expiresAt,
        shareUser,
        root: {
          id: entryDetail.id,
          type: entryDetail.type,
          name: entryDetail.name || entryDetail.originalName || "",
          updatedAt: entryDetail.updatedAt,
          createdAt: entryDetail.createdAt
        }
      };
      if (!verified) {
        res.json(payload);
        return;
      }
      await pool.query("UPDATE shares SET visit_count = visit_count + 1 WHERE id = ?", [shareRow.id]);
      
      // 记录分享访问操作
      let fileName = "";
      let fileId = null;
      let folderId = null;
      let fileSize = null;
      let fileCategory = null;
      
      if (entryDetail.type === "file") {
        fileName = entryDetail.name || entryDetail.originalName;
        fileId = entryDetail.id;
        fileSize = entryDetail.size;
        const settings = await readSettings();
        const uploadCategoryOptions = getUploadCategoryRuntimeOptions(settings);
        fileCategory = normalizeFileCategoryKey(resolveStoredFileCategory(fileName, entryDetail.mimeType, uploadCategoryOptions));
      } else {
        fileName = entryDetail.name || "文件夹";
        folderId = entryDetail.id;
      }
      
      await logFileOperation(pool, {
        operationType: 'share_visit',
        fileId: fileId,
        folderId: folderId,
        fileName: fileName,
        fileSize: fileSize,
        fileCategory: fileCategory,
        userId: shareRow.userId,
        ip: req.ip
      });
      if (entryDetail.type === "file") {
        payload.entries = [{
          id: entryDetail.id,
          type: "file",
          name: entryDetail.name || "",
          size: entryDetail.size || 0,
          updatedAt: entryDetail.updatedAt
        }];
        payload.currentFolderId = null;
        res.json(payload);
        return;
      }
      payload.currentFolderId = null;
      res.json(payload);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/share/:shareCode/entries", async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    if (!shareCode) {
      res.status(400).json({ message: "分享码不合法" });
      return;
    }
    const folderId = normalizeFolderId(req.query.folderId);
    if (folderId === undefined) {
      res.status(400).json({ message: "目录参数不合法" });
      return;
    }
    try {
      const shareRow = await getShareByCode(shareCode);
      if (!shareRow || isShareLinkExpired(shareRow)) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      if (shareRow.entryType !== "folder") {
        res.status(400).json({ message: "当前分享不是目录" });
        return;
      }
      const entryDetail = await getShareEntryDetail(shareRow);
      if (!entryDetail) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      if (shareRow.passwordHash && !verifyShareAccessToken(shareRow.id, parseShareAccessToken(req))) {
        res.status(401).json({ message: "请先验证提取码", code: "NEED_PASSWORD" });
        return;
      }
      const targetFolderId = folderId === null ? Number(entryDetail.id) : Number(folderId);
      const inside = await isFolderInsideShareRoot(shareRow, targetFolderId);
      if (!inside) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      const [folderRows] = await pool.query(
        `SELECT id, name, parent_id AS parentId, updated_at AS updatedAt, created_at AS createdAt, 'folder' AS type, 0 AS size
         FROM folders
         WHERE user_id = ? AND space_type = ? AND parent_id = ? AND deleted_at IS NULL`,
        [shareRow.userId, normalizeStorageSpaceType(shareRow.spaceType), targetFolderId]
      );
      const [fileRows] = await pool.query(
        `SELECT id, original_name AS name, folder_id AS parentId, updated_at AS updatedAt, created_at AS createdAt, 'file' AS type, size
         FROM files
         WHERE user_id = ? AND space_type = ? AND folder_id = ? AND deleted_at IS NULL`,
        [shareRow.userId, normalizeStorageSpaceType(shareRow.spaceType), targetFolderId]
      );
      res.json({
        entries: [...folderRows, ...fileRows],
        currentFolderId: targetFolderId,
        rootFolderId: Number(entryDetail.id),
        rootName: entryDetail.name
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/share/:shareCode/download/file/:fileId", async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    const fileId = normalizeFolderId(req.params.fileId);
    if (!shareCode || !fileId) {
      res.status(400).json({ message: "参数不合法" });
      return;
    }
    try {
      const shareRow = await getShareByCode(shareCode);
      if (!shareRow || isShareLinkExpired(shareRow)) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      if (shareRow.passwordHash && !verifyShareAccessToken(shareRow.id, parseShareAccessToken(req))) {
        res.status(401).json({ message: "请先验证提取码", code: "NEED_PASSWORD" });
        return;
      }
      const fileRow = await canAccessShareFile(shareRow, fileId);
      if (!fileRow) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const filePath = resolveAbsoluteStoragePath(fileRow.storageName, shareRow.spaceType);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ message: "文件已丢失" });
        return;
      }
      
      await pool.query("UPDATE shares SET download_count = download_count + 1 WHERE id = ?", [shareRow.id]);
      
      // 记录分享文件下载操作
      const settings = await readSettings();
      const uploadCategoryOptions = getUploadCategoryRuntimeOptions(settings);
      const fileCategory = normalizeFileCategoryKey(resolveStoredFileCategory(fileRow.originalName, fileRow.mimeType, uploadCategoryOptions));
      await logFileOperation(pool, {
        operationType: 'share_download',
        fileId: fileRow.id,
        folderId: fileRow.folderId,
        fileName: fileRow.originalName,
        fileSize: fileRow.size,
        fileCategory: fileCategory,
        userId: shareRow.userId,
        ip: req.ip
      });
      
      const speedLimitKb = getShareDownloadSpeedLimit(settings);
      
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileRow.originalName)}`);
      res.setHeader('Content-Type', fileRow.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      const readStream = fs.createReadStream(filePath);
      const outputStream = createSpeedLimitedStream(readStream, res, speedLimitKb);
      outputStream.pipe(res);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/share/:shareCode/folder/:folderId/size", async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    const folderId = normalizeFolderId(req.params.folderId);
    if (!shareCode || !folderId) {
      res.status(400).json({ message: "参数不合法" });
      return;
    }
    try {
      const shareRow = await getShareByCode(shareCode);
      if (!shareRow || isShareLinkExpired(shareRow)) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      if (shareRow.passwordHash && !verifyShareAccessToken(shareRow.id, parseShareAccessToken(req))) {
        res.status(401).json({ message: "请先验证提取码", code: "NEED_PASSWORD" });
        return;
      }
      const downloadData = await collectShareFolderDownloadItems(shareRow, folderId);
      if (!downloadData) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      
      const spaceType = normalizeStorageSpaceType(shareRow.spaceType);
      const userId = Number(shareRow.userId) || 0;
      const folderIds = await collectDescendantFolderIds(userId, folderId, spaceType);
      
      if (!folderIds.length) {
        res.json({ totalSize: 0 });
        return;
      }
      
      const folderClause = folderIds.map(() => "?").join(", ");
      const [result] = await pool.query(
        `SELECT IFNULL(SUM(size), 0) AS totalSize FROM files WHERE user_id = ? AND space_type = ? AND deleted_at IS NULL AND folder_id IN (${folderClause})`,
        [userId, spaceType, ...folderIds]
      );
      
      const totalSize = result && result[0] ? Number(result[0].totalSize || 0) : 0;
      res.json({ totalSize });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/share/:shareCode/download/folder/:folderId", async (req, res) => {
    const shareCode = normalizeShareCode(req.params.shareCode);
    const folderId = normalizeFolderId(req.params.folderId);
    if (!shareCode || !folderId) {
      res.status(400).json({ message: "参数不合法" });
      return;
    }
    try {
      const shareRow = await getShareByCode(shareCode);
      if (!shareRow || isShareLinkExpired(shareRow)) {
        res.status(410).json({ message: "分享链接已失效或取消分享了" });
        return;
      }
      if (shareRow.passwordHash && !verifyShareAccessToken(shareRow.id, parseShareAccessToken(req))) {
        res.status(401).json({ message: "请先验证提取码", code: "NEED_PASSWORD" });
        return;
      }
      const downloadData = await collectShareFolderDownloadItems(shareRow, folderId);
      if (!downloadData) {
        res.status(404).json({ message: "目录不存在" });
        return;
      }
      
      await pool.query("UPDATE shares SET download_count = download_count + 1 WHERE id = ?", [shareRow.id]);
      const folderMap = new Map();
      downloadData.folderRows.forEach((item) => {
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
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jockcloud-share-"));
      const sourceRoot = path.join(tempDir, "source");
      const archiveName = `${safeFileName(targetFolder.name || "share-folder") || "share-folder"}.zip`;
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
        for (const folderRow of downloadData.folderRows) {
          const relativePath = resolveFolderRelativePath(folderRow.id);
          const targetPath = relativePath ? path.join(sourceRoot, relativePath) : sourceRoot;
          fs.mkdirSync(targetPath, { recursive: true });
        }
        let copiedCount = 0;
        for (const fileRow of downloadData.fileRows) {
          const relativePath = resolveFolderRelativePath(fileRow.folderId);
          const targetDir = relativePath ? path.join(sourceRoot, relativePath) : sourceRoot;
          const sourcePath = resolveAbsoluteStoragePath(fileRow.storageName, shareRow.spaceType);
          if (!sourcePath || !fs.existsSync(sourcePath)) continue;
          fs.mkdirSync(targetDir, { recursive: true });
          const targetPath = path.join(targetDir, safeFileName(fileRow.originalName || `文件-${fileRow.id}`));
          fs.copyFileSync(sourcePath, targetPath);
          copiedCount += 1;
        }
        if (copiedCount === 0) {
          fs.writeFileSync(path.join(sourceRoot, "空目录.txt"), "");
        }
        await runCompressArchive(sourceRoot, archivePath);
        if (!fs.existsSync(archivePath)) {
          res.status(500).json({ message: "打包失败" });
          return;
        }
        
        const settings = await readSettings();
        const speedLimitKb = await getUserDownloadSpeedLimit(shareRow.userId, settings);
        
        const stat = fs.statSync(archivePath);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Length', stat.size);
        
        const archiveStream = fs.createReadStream(archivePath);
        const outputStream = createSpeedLimitedStream(archiveStream, res, speedLimitKb);
        outputStream.pipe(res);
        archiveStream.on("end", () => {
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
        });
      } catch (error) {
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        res.status(500).json({ message: error && error.message ? error.message : "目录打包失败" });
      }
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
