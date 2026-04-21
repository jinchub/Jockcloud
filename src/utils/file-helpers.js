const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { UPLOAD_DIR, HIDDEN_UPLOAD_DIR, THUMBNAIL_MAX_DATA_URL_LENGTH, THUMBNAIL_IMAGE_MIME_SET, THUMBNAIL_MIME_TO_EXT_MAP } = require("./constants");

const safeFileName = (name) => String(name || "")
  .replace(/[\u0000-\u001f\u007f]/g, "")
  .replace(/[\\/:*?"<>|]/g, "_")
  .trim();

const normalizeUploadName = (name) => {
  const raw = String(name || "");
  if (!raw) return "";
  if (!/[\u0080-\u00ff]/.test(raw)) {
    return raw;
  }
  try {
    const decoded = Buffer.from(raw, "latin1").toString("utf8");
    if (!decoded) return raw;
    if (decoded.includes("�")) return raw;
    if (/[\u0000-\u001f\u007f]/.test(decoded)) return raw;
    return decoded;
  } catch (e) {
    return raw;
  }
};

const normalizeRelativePath = (value) => {
  const normalized = String(value || "").replace(/\\/g, "/").trim();
  if (!normalized) return "";
  return normalized
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
};

const isZipFileName = (name) => {
  const normalizedName = String(name || "").trim().toLowerCase();
  return normalizedName.endsWith(".zip");
};

const detectArchiveType = (name, mimeType = "") => {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  if (normalizedName.endsWith(".tar.gz") || normalizedName.endsWith(".tgz")) return "tgz";
  if (normalizedName.endsWith(".tar.bz2") || normalizedName.endsWith(".tbz2") || normalizedName.endsWith(".tbz")) return "tbz2";
  if (normalizedName.endsWith(".tar.xz") || normalizedName.endsWith(".txz")) return "txz";
  if (normalizedName.endsWith(".zip")) return "zip";
  if (normalizedName.endsWith(".tar")) return "tar";
  if (normalizedName.endsWith(".gz")) return "gz";
  if (normalizedName.endsWith(".bz2")) return "bz2";
  if (normalizedName.endsWith(".xz")) return "xz";
  if (normalizedMime === "application/zip" || normalizedMime === "application/x-zip-compressed") return "zip";
  if (normalizedMime === "application/x-tar") return "tar";
  if (normalizedMime === "application/gzip" || normalizedMime === "application/x-gzip") return "gz";
  if (normalizedMime === "application/x-bzip2" || normalizedMime === "application/x-bzip") return "bz2";
  if (normalizedMime === "application/x-xz") return "xz";
  return "";
};

const normalizeStorageSpaceType = (value) => String(value || "").trim().toLowerCase() === "hidden" ? "hidden" : "normal";
const resolveStorageRootDir = (spaceType = "normal") => normalizeStorageSpaceType(spaceType) === "hidden" ? HIDDEN_UPLOAD_DIR : UPLOAD_DIR;
const resolveAbsoluteStoragePath = (storageName, spaceType = "normal") => {
  const normalizedStorageName = normalizeStorageRelativePath(storageName);
  if (!normalizedStorageName) return "";
  const rootDir = path.resolve(resolveStorageRootDir(spaceType));
  const filePath = path.resolve(rootDir, normalizedStorageName);
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    return "";
  }
  return filePath;
};

const resolveStorageSpaceTypeByRequest = (req) => {
  if (req && req.query && req.query.space !== undefined) {
    return normalizeStorageSpaceType(req.query.space);
  }
  if (req && req.body && req.body.space !== undefined) {
    return normalizeStorageSpaceType(req.body.space);
  }
  return "normal";
};

const formatStorageDate = (date = new Date()) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const normalizeStorageRelativePath = (value) => String(value || "")
  .replace(/\\/g, "/")
  .split("/")
  .filter((part) => part && part !== "." && part !== "..")
  .join("/");

const getUserStorageRoot = (user) => {
  const username = safeFileName((user && user.username) || "user");
  const userId = Number((user && user.userId) || 0) || 0;
  return `${username}-${userId}`;
};

const getUploadStorageDir = (user) => `${getUserStorageRoot(user)}/${formatStorageDate()}`;
const getAvatarStorageDir = (user) => `avatar/${getUserStorageRoot(user)}`;

const makeStorageName = (originalName, relativeDir = "") => {
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeFileName(originalName)}`;
  const normalizedDir = normalizeStorageRelativePath(relativeDir);
  return normalizedDir ? `${normalizedDir}/${fileName}` : fileName;
};

const makeThumbnailStorageName = (baseStorageName, ext = "webp") => {
  const normalizedBaseStorageName = normalizeStorageRelativePath(baseStorageName);
  const baseDir = path.posix.dirname(normalizedBaseStorageName);
  const baseName = path.posix.basename(normalizedBaseStorageName, path.posix.extname(normalizedBaseStorageName));
  const thumbFileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeFileName(baseName || "thumb")}.thumb.${safeFileName(ext || "webp")}`;
  return baseDir && baseDir !== "." ? `${baseDir}/${thumbFileName}` : thumbFileName;
};

const parseThumbnailDataUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw.length > THUMBNAIL_MAX_DATA_URL_LENGTH) return null;
  const matched = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(raw);
  if (!matched) return null;
  const mimeType = String(matched[1] || "").toLowerCase();
  if (!THUMBNAIL_IMAGE_MIME_SET.has(mimeType)) return null;
  const ext = THUMBNAIL_MIME_TO_EXT_MAP[mimeType];
  if (!ext) return null;
  const base64Body = String(matched[2] || "").replace(/\s+/g, "");
  if (!base64Body) return null;
  const buffer = Buffer.from(base64Body, "base64");
  if (!buffer || buffer.length === 0) return null;
  return { buffer, mimeType, ext };
};

const writeThumbnailFromDataUrl = (dataUrl, baseStorageName, spaceType = "normal") => {
  const parsed = parseThumbnailDataUrl(dataUrl);
  if (!parsed) return "";
  const thumbnailStorageName = makeThumbnailStorageName(baseStorageName, parsed.ext);
  const thumbnailPath = resolveAbsoluteStoragePath(thumbnailStorageName, spaceType);
  if (!thumbnailPath) return "";
  fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true });
  fs.writeFileSync(thumbnailPath, parsed.buffer);
  return thumbnailStorageName;
};

const inferImageMimeTypeFromStorageName = (storageName, fallback = "application/octet-stream") => {
  const ext = path.extname(String(storageName || "").toLowerCase()).replace(/^\./, "");
  if (ext === "jpg" || ext === "jpeg" || ext === "jfif") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "apng") return "image/apng";
  if (ext === "avif") return "image/avif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  if (ext === "gif") return "image/gif";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  if (ext === "ico") return "image/x-icon";
  if (ext === "svg") return "image/svg+xml";
  return fallback;
};

const inferMimeTypeByFileName = (fileName, fallback = "application/octet-stream") => {
  const ext = path.extname(String(fileName || "").toLowerCase()).replace(/^\./, "");
  if (ext === "jpg" || ext === "jpeg" || ext === "jfif") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "apng") return "image/apng";
  if (ext === "avif") return "image/avif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  if (ext === "gif") return "image/gif";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  if (ext === "ico") return "image/x-icon";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "txt") return "text/plain; charset=utf-8";
  if (ext === "json") return "application/json; charset=utf-8";
  if (ext === "xml") return "application/xml; charset=utf-8";
  if (ext === "pdf") return "application/pdf";
  if (ext === "zip") return "application/zip";
  return fallback;
};

const writeExtractedThumbnailFromSource = (sourcePath, baseStorageName, mimeType, spaceType = "normal") => {
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (!normalizedMime.startsWith("image/")) return "";
  if (!sourcePath || !fs.existsSync(sourcePath)) return "";
  let thumbExt = THUMBNAIL_MIME_TO_EXT_MAP[normalizedMime] || "";
  if (!thumbExt && normalizedMime === "image/svg+xml") {
    thumbExt = "svg";
  }
  if (!thumbExt) {
    const sourceExt = path.extname(String(sourcePath || "").toLowerCase()).replace(/^\./, "");
    thumbExt = safeFileName(sourceExt || "webp");
  }
  const thumbnailStorageName = makeThumbnailStorageName(baseStorageName, thumbExt);
  const thumbnailPath = resolveAbsoluteStoragePath(thumbnailStorageName, spaceType);
  if (!thumbnailPath) return "";
  fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true });
  fs.copyFileSync(sourcePath, thumbnailPath);
  return thumbnailStorageName;
};

const resolveStorageNameFromPath = (filePath, fallbackName = "", storageRootDir = UPLOAD_DIR) => {
  const relative = normalizeStorageRelativePath(path.relative(storageRootDir, filePath));
  if (relative) return relative;
  return normalizeStorageRelativePath(fallbackName);
};

module.exports = {
  safeFileName,
  normalizeUploadName,
  normalizeRelativePath,
  isZipFileName,
  detectArchiveType,
  normalizeStorageSpaceType,
  resolveStorageRootDir,
  resolveAbsoluteStoragePath,
  resolveStorageSpaceTypeByRequest,
  formatStorageDate,
  normalizeStorageRelativePath,
  getUserStorageRoot,
  getUploadStorageDir,
  getAvatarStorageDir,
  makeStorageName,
  makeThumbnailStorageName,
  parseThumbnailDataUrl,
  writeThumbnailFromDataUrl,
  inferImageMimeTypeFromStorageName,
  inferMimeTypeByFileName,
  writeExtractedThumbnailFromSource,
  resolveStorageNameFromPath
};
