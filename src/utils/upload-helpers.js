/**
 * 上传公共逻辑模块
 * 抽取 uploads-basic.js 中重复使用的逻辑
 */

const crypto = require("crypto");

/**
 * 计算文件MD5
 */
const calculateFileMd5 = (fs, filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
};

/**
 * 检查MD5是否存在（秒传检查，跨用户查找）
 */
const checkMd5Exists = async (pool, fileMd5, spaceType) => {
  const [existingFiles] = await pool.query(
    "SELECT id, original_name AS originalName, storage_name AS storageName, folder_id AS folderId FROM files WHERE md5 = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
    [fileMd5, spaceType]
  );
  
  if (existingFiles.length === 0) return null;
  return existingFiles[0];
};

/**
 * 执行秒传：复用已有物理文件，为当前用户创建独立的数据库记录
 */
const createInstantFileRecord = async (pool, params) => {
  const {
    userId, spaceType, targetFolderId, originalName,
    existingStorageName, thumbnailStorageName, fileCategory,
    fileSize, mimeType, fileMd5
  } = params;
  
  const [insertResult] = await pool.query(
    "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type, md5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, spaceType, targetFolderId, originalName, existingStorageName, thumbnailStorageName || null, fileCategory, fileSize, mimeType, fileMd5]
  );
  
  return insertResult;
};

/**
 * 创建普通文件记录
 */
const createFileRecord = async (pool, params) => {
  const {
    userId, spaceType, targetFolderId, originalName,
    storageName, thumbnailStorageName, fileCategory,
    fileSize, mimeType, fileMd5
  } = params;
  
  const [insertResult] = await pool.query(
    "INSERT INTO files (user_id, space_type, folder_id, original_name, storage_name, thumbnail_storage_name, file_category, size, mime_type, md5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, spaceType, targetFolderId, originalName, storageName, thumbnailStorageName || null, fileCategory, fileSize, mimeType, fileMd5]
  );
  
  return insertResult;
};

/**
 * 安全删除临时文件
 */
const safeDeleteFile = (fs, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {}
};

/**
 * 异步生成视频缩略图
 */
const asyncGenerateVideoThumbnail = (params) => {
  const { fileId, videoFilePath, storageName, spaceType, pool, generateVideoThumbnail } = params;
  setImmediate(async () => {
    try {
      const videoThumbName = await generateVideoThumbnail(videoFilePath, storageName, spaceType);
      if (videoThumbName) {
        await pool.query("UPDATE files SET thumbnail_storage_name = ? WHERE id = ?", [videoThumbName, fileId]);
      }
    } catch (e) {}
  });
};

/**
 * 加载上传配置（优先使用数据库设置，失败时使用默认值）
 */
const loadUploadSettings = async (DEFAULT_SETTINGS, getUploadRuntimeOptions, getUploadCategoryRuntimeOptions, runtimeGroupOptions = {}) => {
  const { readSettings } = require("./index");
  let uploadRuntimeOptions = getUploadRuntimeOptions(DEFAULT_SETTINGS, runtimeGroupOptions);
  let uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
  try {
    const settings = await readSettings();
    uploadRuntimeOptions = getUploadRuntimeOptions(settings, runtimeGroupOptions);
    uploadCategoryRuntimeOptions = getUploadCategoryRuntimeOptions(settings);
  } catch (e) {}
  return { uploadRuntimeOptions, uploadCategoryRuntimeOptions };
};

module.exports = {
  calculateFileMd5,
  checkMd5Exists,
  createInstantFileRecord,
  createFileRecord,
  safeDeleteFile,
  asyncGenerateVideoThumbnail,
  loadUploadSettings
};
