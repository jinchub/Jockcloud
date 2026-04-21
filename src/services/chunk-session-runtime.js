const createChunkSessionRuntime = ({
  fs,
  path,
  CHUNK_UPLOAD_ROOT_DIR,
  CHUNK_SESSION_EXPIRE_MS,
  resolveStorageSpaceTypeByRequest,
  normalizeStorageSpaceType
}) => {
  const normalizeChunkUploadId = (value) => {
    const normalized = String(value || "").trim();
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(normalized)) return "";
    return normalized;
  };

  const normalizeChunkClientTaskId = (value) => {
    const normalized = String(value || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(normalized)) return "";
    return normalized;
  };

  const getChunkSessionDir = (uploadId) => path.join(CHUNK_UPLOAD_ROOT_DIR, uploadId);
  const getChunkMetaPath = (uploadId) => path.join(getChunkSessionDir(uploadId), "meta.json");
  const getChunkDataPath = (uploadId) => path.join(getChunkSessionDir(uploadId), "payload.bin");
  const getChunkMarksDir = (uploadId) => path.join(getChunkSessionDir(uploadId), "marks");

  const readChunkMeta = (uploadId) => {
    const metaPath = getChunkMetaPath(uploadId);
    if (!fs.existsSync(metaPath)) return null;
    try {
      const raw = fs.readFileSync(metaPath, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  const writeChunkMeta = (uploadId, payload) => {
    const uploadMetaPath = getChunkMetaPath(uploadId);
    fs.writeFileSync(uploadMetaPath, JSON.stringify(payload), "utf8");
  };

  const removeChunkSession = (uploadId) => {
    const sessionDir = getChunkSessionDir(uploadId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  };

  const removeChunkSessionIfOwnedByCurrentUser = (req, uploadId) => {
    if (!req || !req.user || !uploadId) return;
    const meta = readChunkMeta(uploadId);
    if (!meta) return;
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    if (Number(meta.userId) !== Number(req.user.userId) || normalizeStorageSpaceType(meta.spaceType) !== spaceType) {
      return;
    }
    removeChunkSession(uploadId);
  };

  const findChunkSessionByFile = ({ userId, spaceType, fileName, fileSize }) => {
    if (!fs.existsSync(CHUNK_UPLOAD_ROOT_DIR)) return null;
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const items = fs.readdirSync(CHUNK_UPLOAD_ROOT_DIR, { withFileTypes: true });
    for (const item of items) {
      if (!item || !item.isDirectory()) continue;
      const uploadId = normalizeChunkUploadId(item.name);
      if (!uploadId) continue;
      const meta = readChunkMeta(uploadId);
      if (!meta) continue;
      if (Number(meta.userId) !== Number(userId)) continue;
      if (normalizeStorageSpaceType(meta.spaceType) !== normalizedSpaceType) continue;
      if (meta.fileName !== fileName || Number(meta.fileSize) !== Number(fileSize)) continue;
      return meta;
    }
    return null;
  };

  const removeChunkSessionsByClientTaskId = ({ userId, spaceType, clientTaskId }) => {
    if (!fs.existsSync(CHUNK_UPLOAD_ROOT_DIR)) return;
    const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
    const items = fs.readdirSync(CHUNK_UPLOAD_ROOT_DIR, { withFileTypes: true });
    items.forEach((item) => {
      if (!item || !item.isDirectory()) return;
      const uploadId = normalizeChunkUploadId(item.name);
      if (!uploadId) return;
      const meta = readChunkMeta(uploadId);
      if (!meta) return;
      if (Number(meta.userId) !== Number(userId)) return;
      if (normalizeStorageSpaceType(meta.spaceType) !== normalizedSpaceType) return;
      if (normalizeChunkClientTaskId(meta.clientTaskId) !== clientTaskId) return;
      removeChunkSession(uploadId);
    });
  };

  const cleanupExpiredChunkSessions = () => {
    if (!fs.existsSync(CHUNK_UPLOAD_ROOT_DIR)) return;
    const now = Date.now();
    const items = fs.readdirSync(CHUNK_UPLOAD_ROOT_DIR, { withFileTypes: true });
    items.forEach((item) => {
      if (!item || !item.isDirectory()) return;
      const uploadId = normalizeChunkUploadId(item.name);
      if (!uploadId) {
        const unknownDirPath = path.join(CHUNK_UPLOAD_ROOT_DIR, item.name);
        try {
          fs.rmSync(unknownDirPath, { recursive: true, force: true });
        } catch (e) {}
        return;
      }
      const meta = readChunkMeta(uploadId);
      if (!meta) {
        removeChunkSession(uploadId);
        return;
      }
      const updatedAt = Number(meta.updatedAt || meta.createdAt || 0);
      if (!Number.isFinite(updatedAt) || updatedAt <= 0 || now - updatedAt > CHUNK_SESSION_EXPIRE_MS) {
        removeChunkSession(uploadId);
      }
    });
  };

  return {
    normalizeChunkUploadId,
    normalizeChunkClientTaskId,
    getChunkSessionDir,
    getChunkMetaPath,
    getChunkDataPath,
    getChunkMarksDir,
    readChunkMeta,
    writeChunkMeta,
    removeChunkSession,
    removeChunkSessionIfOwnedByCurrentUser,
    findChunkSessionByFile,
    removeChunkSessionsByClientTaskId,
    cleanupExpiredChunkSessions
  };
};

module.exports = {
  createChunkSessionRuntime
};
