const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { UPLOAD_DIR, HIDDEN_UPLOAD_DIR, THUMBNAIL_MAX_DATA_URL_LENGTH, THUMBNAIL_IMAGE_MIME_SET, THUMBNAIL_MIME_TO_EXT_MAP } = require("./constants");

const STORAGE_DISK_PREFIX_SEPARATOR = "|";
const STORAGE_DISK_FREE_SPACE_RESERVE_BYTES = 2 * 1024 * 1024 * 1024;
const NFS_AUTO_MOUNT_BASE_DIR = path.join(process.cwd(), ".jockcloud-nfs-mounts");
const RAW_NFS_REMOTE_PATH_PATTERN = /^(?![a-zA-Z]:[\\/])[^\\/:]+:\/.+/;
let storageDiskConfig = {
  defaultDiskId: "",
  disks: []
};
const getStorageReserveErrorMessage = () => "云盘空间存储不足";
const isRawNfsRemotePath = (value) => RAW_NFS_REMOTE_PATH_PATTERN.test(String(value || "").trim());
const shellQuote = (value) => `'${String(value || "").replace(/'/g, `'\\''`)}'`;
const isMountedNfsPathSync = (targetPath) => {
  if (os.platform() === "win32") return true;
  try {
    execSync(`mountpoint -q ${shellQuote(targetPath)}`, { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
};
const ensureNfsMountedSync = (disk) => {
  if (!disk || String(disk.source || "") !== "nfs") return true;
  if (String(disk.mountMode || "") !== "auto") return true;
  if (os.platform() === "win32") return false;
  const remotePath = String(disk.remotePath || "").trim();
  const mountPath = path.resolve(String(disk.path || "").trim());
  if (!remotePath || !mountPath || !isRawNfsRemotePath(remotePath)) return false;
  try {
    fs.mkdirSync(mountPath, { recursive: true });
    if (isMountedNfsPathSync(mountPath)) return true;
    execSync(`mount -t nfs ${shellQuote(remotePath)} ${shellQuote(mountPath)}`, {
      stdio: "ignore",
      maxBuffer: 1024 * 1024
    });
    return isMountedNfsPathSync(mountPath);
  } catch (error) {
    return false;
  }
};

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
const normalizeStorageDiskId = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
const parseStoredStorageName = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return { diskId: "", relativePath: "" };
  const separatorIndex = raw.indexOf(STORAGE_DISK_PREFIX_SEPARATOR);
  if (separatorIndex > 0) {
    const possibleDiskId = normalizeStorageDiskId(raw.slice(0, separatorIndex));
    const relativePath = normalizeStorageRelativePath(raw.slice(separatorIndex + 1));
    if (possibleDiskId && relativePath) {
      return { diskId: possibleDiskId, relativePath };
    }
  }
  return {
    diskId: "",
    relativePath: normalizeStorageRelativePath(raw)
  };
};
const buildStoredStorageName = (relativePath, diskId = "") => {
  const normalizedRelativePath = normalizeStorageRelativePath(relativePath);
  if (!normalizedRelativePath) return "";
  const normalizedDiskId = normalizeStorageDiskId(diskId);
  return normalizedDiskId
    ? `${normalizedDiskId}${STORAGE_DISK_PREFIX_SEPARATOR}${normalizedRelativePath}`
    : normalizedRelativePath;
};
const normalizeStorageDiskList = (value) => {
  const rawList = Array.isArray(value) ? value : [];
  const result = [];
  const seen = new Set();
  rawList.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const diskId = normalizeStorageDiskId(item.id || item.diskId || `disk${index + 1}`);
    const diskPath = String(item.path || "").trim();
    if (!diskId || !diskPath || !path.isAbsolute(diskPath) || seen.has(diskId)) return;
    seen.add(diskId);
    result.push({
      id: diskId,
      name: String(item.name || item.label || diskId).trim().slice(0, 80) || diskId,
      path: path.resolve(diskPath),
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
      source: String(item.source || "").trim().toLowerCase() === "nfs" ? "nfs" : "system",
      remotePath: String(item.remotePath || "").trim(),
      mountMode: String(item.mountMode || "").trim().toLowerCase() === "auto" ? "auto" : "direct"
    });
  });
  return result;
};
const normalizeStorageDiskConfig = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const disks = normalizeStorageDiskList(source.disks);
  const enabledDisks = disks.filter((item) => item.enabled);
  const preferredDefaultId = normalizeStorageDiskId(source.defaultDiskId);
  const defaultDiskId = enabledDisks.some((item) => item.id === preferredDefaultId)
    ? preferredDefaultId
    : (enabledDisks[0] ? enabledDisks[0].id : "");
  return { defaultDiskId, disks };
};
const setStorageDiskConfig = (value) => {
  storageDiskConfig = normalizeStorageDiskConfig(value);
  storageDiskConfig.disks.forEach((item) => {
    if (String(item.source || "") === "nfs") {
      ensureNfsMountedSync(item);
      return;
    }
    try {
      fs.mkdirSync(item.path, { recursive: true });
    } catch (error) {}
  });
  return storageDiskConfig;
};
const getStorageDiskConfig = () => storageDiskConfig;
const resolveConfiguredStorageRootDir = (spaceType = "normal", diskId = "") => {
  const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
  if (normalizedSpaceType === "hidden") return HIDDEN_UPLOAD_DIR;
  const normalizedDiskId = normalizeStorageDiskId(diskId);
  const disks = storageDiskConfig && Array.isArray(storageDiskConfig.disks) ? storageDiskConfig.disks : [];
  if (normalizedDiskId) {
    const matchedDisk = disks.find((item) => item.enabled && item.id === normalizedDiskId);
    if (matchedDisk) return matchedDisk.path;
  }
  const defaultDisk = disks.find((item) => item.enabled && item.id === storageDiskConfig.defaultDiskId);
  return defaultDisk ? defaultDisk.path : UPLOAD_DIR;
};
const getPathFreeBytesSync = (targetPath) => {
  try {
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync(targetPath);
      const blockSize = Number(stats.bsize || stats.frsize || 0);
      const availableBlocks = Number(stats.bavail || stats.blocks || 0);
      const freeBytes = blockSize * availableBlocks;
      if (Number.isFinite(freeBytes) && freeBytes >= 0) return freeBytes;
    }
  } catch (error) {}
  try {
    const resolvedPath = path.resolve(targetPath || process.cwd());
    if (os.platform() === "win32") {
      const driveName = path.parse(resolvedPath).root.replace(/[:\\\/]/g, "");
      if (!driveName) return 0;
      const output = execSync(
        `powershell -Command "Get-PSDrive -Name '${driveName}' -PSProvider FileSystem | Select-Object -ExpandProperty Free"`,
        { encoding: "utf8", maxBuffer: 1024 * 1024 }
      );
      const freeBytes = Number(String(output || "").trim());
      return Number.isFinite(freeBytes) && freeBytes >= 0 ? freeBytes : 0;
    }
    const output = execSync(`df -k "${resolvedPath.replace(/"/g, '\\"')}" | tail -1`, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const parts = String(output || "").trim().split(/\s+/);
    const freeKb = Number(parts[3]);
    return Number.isFinite(freeKb) && freeKb >= 0 ? freeKb * 1024 : 0;
  } catch (error) {
    return 0;
  }
};
const pickWritableStorageRoot = (spaceType = "normal", requiredBytes = 0, preferredDiskId = "") => {
  const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
  const expectedBytes = Math.max(0, Math.floor(Number(requiredBytes) || 0));
  if (normalizedSpaceType === "hidden") {
    const freeBytes = getPathFreeBytesSync(HIDDEN_UPLOAD_DIR);
    if (freeBytes < expectedBytes + STORAGE_DISK_FREE_SPACE_RESERVE_BYTES) {
      return null;
    }
    return {
      diskId: "",
      rootDir: HIDDEN_UPLOAD_DIR,
      freeBytes
    };
  }
  const configured = normalizeStorageDiskConfig(storageDiskConfig);
  const enabledDisks = configured.disks.filter((item) => item.enabled);
  if (!enabledDisks.length) {
    const freeBytes = getPathFreeBytesSync(UPLOAD_DIR);
    if (freeBytes < expectedBytes + STORAGE_DISK_FREE_SPACE_RESERVE_BYTES) {
      return null;
    }
    return {
      diskId: "",
      rootDir: UPLOAD_DIR,
      freeBytes
    };
  }
  const orderedDisks = [];
  const pushed = new Set();
  const pushDisk = (disk) => {
    if (!disk || pushed.has(disk.id)) return;
    pushed.add(disk.id);
    orderedDisks.push(disk);
  };
  pushDisk(enabledDisks.find((item) => item.id === normalizeStorageDiskId(preferredDiskId)));
  pushDisk(enabledDisks.find((item) => item.id === configured.defaultDiskId));
  enabledDisks.forEach(pushDisk);
  for (const item of orderedDisks) {
    if (String(item.source || "") === "nfs") {
      if (!ensureNfsMountedSync(item)) {
        continue;
      }
      try {
        if (!fs.existsSync(item.path) || !fs.statSync(item.path).isDirectory()) continue;
      } catch (error) {
        continue;
      }
    }
    const freeBytes = getPathFreeBytesSync(item.path);
    if (freeBytes >= expectedBytes + STORAGE_DISK_FREE_SPACE_RESERVE_BYTES) {
      return { diskId: item.id, rootDir: item.path, freeBytes };
    }
  }
  return null;
};
const resolveAbsoluteStoragePath = (storageName, spaceType = "normal") => {
  const parsedStorage = parseStoredStorageName(storageName);
  if (!parsedStorage.relativePath) return "";
  const rootDir = path.resolve(parsedStorage.diskId
    ? resolveConfiguredStorageRootDir(spaceType, parsedStorage.diskId)
    : resolveStorageRootDir(spaceType));
  const filePath = path.resolve(rootDir, parsedStorage.relativePath);
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
  const parsedRelativeDir = parseStoredStorageName(relativeDir);
  const normalizedDir = normalizeStorageRelativePath(parsedRelativeDir.relativePath);
  const relativePath = normalizedDir ? `${normalizedDir}/${fileName}` : fileName;
  return buildStoredStorageName(relativePath, parsedRelativeDir.diskId);
};

const makeThumbnailStorageName = (baseStorageName, ext = "webp") => {
  const parsedStorageName = parseStoredStorageName(baseStorageName);
  const normalizedBaseStorageName = normalizeStorageRelativePath(parsedStorageName.relativePath);
  const baseDir = path.posix.dirname(normalizedBaseStorageName);
  const baseName = path.posix.basename(normalizedBaseStorageName, path.posix.extname(normalizedBaseStorageName));
  const thumbFileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeFileName(baseName || "thumb")}.thumb.${safeFileName(ext || "webp")}`;
  const relativePath = baseDir && baseDir !== "." ? `${baseDir}/${thumbFileName}` : thumbFileName;
  return buildStoredStorageName(relativePath, parsedStorageName.diskId);
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

const generateVideoThumbnail = async (videoPath, baseStorageName, spaceType = "normal") => {
  if (!videoPath || !fs.existsSync(videoPath)) return "";
  
  // 优先使用系统 PATH 中的 ffmpeg，其次使用 ffmpeg-static
  let ffmpegPath;
  try {
    const whichCmd = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const rawPath = execSync(whichCmd, { encoding: "utf-8" }).trim().split("\n")[0].trim();
    // Windows 下 where 命令可能返回带引号的路径，需要清理
    ffmpegPath = rawPath.replace(/^["']|["']$/g, "");
  } catch (e) {
    try {
      ffmpegPath = require("ffmpeg-static");
    } catch (e2) {
      console.log("[video-thumb] 未找到 ffmpeg，视频缩略图生成已跳过");
      return "";
    }
  }
  
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    console.log("[video-thumb] ffmpeg 路径无效:", ffmpegPath);
    return "";
  }
  
  let ffmpeg;
  try {
    ffmpeg = require("fluent-ffmpeg");
    ffmpeg.setFfmpegPath(ffmpegPath);
  } catch (e) {
    console.log("[video-thumb] fluent-ffmpeg 加载失败:", e && e.message ? e.message : e);
    return "";
  }
  
  const parsedStorageName = parseStoredStorageName(baseStorageName);
  const normalizedBasePath = normalizeStorageRelativePath(parsedStorageName.relativePath);
  const baseDir = path.posix.dirname(normalizedBasePath);
  const thumbFileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.jpg`;
  const relativeThumbPath = baseDir && baseDir !== "." ? `videothumb/${baseDir}/${thumbFileName}` : `videothumb/${thumbFileName}`;
  const thumbnailStorageName = buildStoredStorageName(relativeThumbPath, parsedStorageName.diskId);
  const thumbnailPath = resolveAbsoluteStoragePath(thumbnailStorageName, spaceType);
  if (!thumbnailPath) return "";
  fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true });
  
  console.log("[video-thumb] 开始生成缩略图:", videoPath);
  return new Promise((resolve) => {
    ffmpeg(videoPath)
      .inputOptions(["-ss", "1"])
      .outputOptions(["-vframes", "1", "-f", "image2", "-vf", "scale=320:-1"])
      .output(thumbnailPath)
      .on("end", () => {
        if (fs.existsSync(thumbnailPath)) {
          console.log("[video-thumb] 缩略图生成成功:", thumbnailStorageName);
          resolve(thumbnailStorageName);
        } else {
          console.log("[video-thumb] 缩略图文件未生成");
          resolve("");
        }
      })
      .on("error", (err) => {
        console.log("[video-thumb] ffmpeg 错误:", err && err.message ? err.message : err);
        try { if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath); } catch (e) {}
        resolve("");
      })
      .run();
  });
};

const resolveStorageNameFromPath = (filePath, fallbackName = "", storageRootDir = UPLOAD_DIR, diskId = "") => {
  const relative = normalizeStorageRelativePath(path.relative(storageRootDir, filePath));
  if (relative) return buildStoredStorageName(relative, diskId);
  return buildStoredStorageName(fallbackName, diskId);
};

module.exports = {
  safeFileName,
  normalizeUploadName,
  normalizeRelativePath,
  isZipFileName,
  detectArchiveType,
  normalizeStorageSpaceType,
  resolveStorageRootDir,
  normalizeStorageDiskId,
  parseStoredStorageName,
  buildStoredStorageName,
  normalizeStorageDiskConfig,
  setStorageDiskConfig,
  getStorageDiskConfig,
  resolveConfiguredStorageRootDir,
  getPathFreeBytesSync,
  getStorageReserveErrorMessage,
  pickWritableStorageRoot,
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
  generateVideoThumbnail,
  resolveStorageNameFromPath
};
