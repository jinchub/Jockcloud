const express = require("express");
const compression = require("compression");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { spawn } = require("child_process");
const archiver = require("archiver");
const multer = require("multer");

const COS = require("cos-nodejs-sdk-v5");
const qiniu = require("qiniu");
const OSS = require("ali-oss");
const Dypnsapi = require("@alicloud/dypnsapi20170525");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const Throttle = require('stream-throttle').Throttle;
const { createRateLimitMiddleware } = require("./middlewares/rate-limit");
const { createAuthMiddlewares } = require("./middlewares/auth");
const { createErrorHandler } = require("./middlewares/error-handler");
const { startRecycleCleanupJob } = require("./jobs/recycle-cleanup.job");
const { startRuntimeCleanupJobs } = require("./jobs/runtime-cleanup.job");
const { startSyncSchedulerJob } = require("./jobs/sync-scheduler.job");
const { createUploadMiddlewares } = require("./services/upload-middlewares");
const { createSyncRunner } = require("./services/sync-runner");
const { createSyncHelpers } = require("./services/sync-helpers");
const { createFolderResolver } = require("./services/folder-resolver");
const { createAuthRuntime } = require("./services/auth-runtime");
const { createArchiveRuntime } = require("./services/archive-runtime");
const { createChunkSessionRuntime } = require("./services/chunk-session-runtime");
const { createDownloadRuntime } = require("./services/download-runtime");
const { createMonitorRuntime } = require("./services/monitor-runtime");
const { createEntryRecycleRuntime } = require("./services/entry-recycle-runtime");
const { createSyncService } = require("./services/sync-service");
const { registerAllRoutes } = require("./routes/register-all-routes");

const utils = require("./utils");
const {
  ROOT_DIR,
  ENV_FILE,
  PUBLIC_DIR,
  UPLOAD_DIR,
  HIDDEN_UPLOAD_DIR,
  SESSION_COOKIE,
  DEFAULT_LOGIN_SESSION_MINUTES,
  CAPTCHA_EXPIRE_MS,
  SMS_CODE_EXPIRE_MS,
  SMS_SEND_INTERVAL_MS,
  RECYCLE_RETENTION_DAYS,
  RECYCLE_CLEANUP_INTERVAL_MS,
  LOG_DIR,
  APP_LOG_FILE,
  ERROR_LOG_FILE,
  LOG_MAX_STRING_LENGTH,
  LOG_MAX_OBJECT_KEYS,
  LOG_MAX_ARRAY_ITEMS,
  LOG_MAX_DEPTH,
  DEFAULT_MAX_UPLOAD_FILE_SIZE_MB,
  AVATAR_MAX_UPLOAD_FILE_SIZE_BYTES,
  DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB,
  DEFAULT_UPLOAD_CHUNK_SIZE_BYTES,
  MAX_UPLOAD_CHUNK_SIZE_BYTES,
  CHUNK_SESSION_EXPIRE_MS,
  CHUNK_SESSION_CLEANUP_INTERVAL_MS,
  PREVIEW_MEDIA_STREAM_CHUNK_BYTES,
  SYNC_SCHEDULER_CRON,
  AVATAR_ROOT_DIR,
  CHUNK_UPLOAD_ROOT_DIR,
  DEFAULT_AVATAR_UPLOAD_SIZE_MB,
  DEFAULT_AVATAR_UPLOAD_FORMATS,
  FILE_UPLOAD_CATEGORY_KEYS,
  FILE_UPLOAD_CATEGORY_LABELS,
  DEFAULT_UPLOAD_CATEGORY_RULES,
  THUMBNAIL_IMAGE_MIME_SET,
  THUMBNAIL_MIME_TO_EXT_MAP,
  THUMBNAIL_MAX_DATA_URL_LENGTH,
  AVATAR_FORMAT_MIME_MAP,
  MENU_PERMISSION_KEYS,
  VIEW_MODE_OPTIONS,
  GRID_SIZE_OPTIONS,
  FILE_CATEGORY_OPTIONS,
  LOGIN_PASSWORD_RSA_OAEP_HASH,
  ARCHIVE_SUPPORTED_TYPE_SET,
  ALL_FILE_PERMISSIONS,
  FILE_PERMISSION_SET,
  ALLOWED_UPLOAD_TASK_STATUS,
  ALLOWED_SYNC_TASK_STATUS,
  SETTINGS_GLOBAL_KEY,
  DEFAULT_SETTINGS,
  loadEnvFile,
  requireEnv,
  getDbConfig,
  safeJsonStringify,
  writeLogLine,
  logInfo,
  logError,
  summarizeForLog,
  setCaptchaStore,
  setSmsCodeStore,
  setSmsIpRateStore,
  createCaptchaCode,
  cleanupRuntimeAuthData,
  generateCaptcha,
  verifyCaptcha,
  normalizePhone,
  hashPassword,
  verifyPassword,
  makeToken,
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
  resolveStorageNameFromPath,
  parsePermissionList,
  normalizeIdList,
  hasExplicitPermissionConfig,
  getEffectivePermissions,
  hasFilePermission,
  requireFilePermission,
  toNumber,
  normalizeViewMode,
  normalizeGridSize,
  normalizeVisibleCategories,
  normalizeMenuIdList,
  normalizeMenuPermissionEntry,
  normalizeMenuMobileVisibleEntry,
  normalizeAvatarUploadFormats,
  getAvatarUploadRuntimeOptions,
  normalizeUploadRuleFormats,
  normalizeUploadCategoryRules,
  normalizeGlobalUploadMaxSizeMb,
  normalizeUploadFileCount,
  normalizeConcurrentUploadCount,
  normalizeChunkUploadThresholdMb,
  normalizeUserGroupUploadMaxSizeMb,
  normalizeUserGroupUploadMaxFileCount,
  normalizeUserGroupUploadMaxSizeGb,
  convertUserGroupUploadSizeGbToMb,
  convertUserGroupUploadSizeMbToGb,
  getUploadFileExt,
  buildUploadCategoryExtMap,
  getUploadCategoryRuntimeOptions,
  resolveUploadCategory,
  normalizeFileCategoryKey,
  resolveStoredFileCategory,
  getUploadFormatError,
  getUploadRuntimeOptions,
  getUploadLimitError,
  mergeUploadCategoryRulesByKey,
  mergeSettingsPayload,
  getAllowedMenusForUser,
  getMobileVisibleMenus,
  ensureSettingsTable,
  ensureSettingsDefaultRow,
  readSettings,
  writeSettings,
  setSettingsDbPool,
  setNormalizeSettingsFunction,
  setMountHelpersPool,
  parseMountConfig,
  normalizeCosRegion,
  normalizeQiniuRegion,
  normalizeOssRegion,
  resolveQiniuZone,
  normalizeObjectKey,
  encodeCosKey,
  getMountById,
  createCosClientByMount,
  createQiniuClientByMount,
  createOssClientByMount,
  cosRequest,
  qiniuBucketRequest,
  qiniuUploadRequest,
  ensureObjectMount,
  normalizeUploadTaskStatus,
  normalizeUploadTaskItem,
  normalizeTransferTaskType,
  normalizeSyncTaskStatus,
  normalizeSyncTaskType,
  normalizeSyncDirection,
  normalizeSyncScheduleUnit,
  normalizeSyncScheduleTime,
  normalizeSyncScheduleDateType,
  normalizeSyncScheduleDateValue,
  normalizeSyncScheduleAt,
  normalizeSyncEmptyDirMode,
  normalizeSyncFileUpdateRule,
  normalizeSyncDeleteRule,
  normalizeSyncTaskItem,
  getSyncDirectionText,
  getSyncScheduleIntervalMs,
  getSyncTaskNextRunAt,
  formatSyncDetailTime,
  formatSyncItemsLine,
  syncTaskLockKey,
  normalizeSyncLocalDirPath,
  resolveTransferTaskTypeByRequest,
  getTransferTaskText,
  logFileOperation
} = require("./utils");
loadEnvFile();

const app = express();
app.use(compression());
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const LOGIN_PASSWORD_KEY_ID = crypto.randomBytes(8).toString("hex");
const LOGIN_PASSWORD_KEY_PAIR = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(HIDDEN_UPLOAD_DIR)) {
  fs.mkdirSync(HIDDEN_UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(AVATAR_ROOT_DIR)) {
  fs.mkdirSync(AVATAR_ROOT_DIR, { recursive: true });
}
if (!fs.existsSync(CHUNK_UPLOAD_ROOT_DIR)) {
  fs.mkdirSync(CHUNK_UPLOAD_ROOT_DIR, { recursive: true });
}

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const { pool, initDatabase } = require('./db');


const captchaStore = new Map();
const smsCodeStore = new Map();
const smsIpRateStore = new Map();
const syncingTaskLocks = new Set();

setCaptchaStore(captchaStore);
setSmsCodeStore(smsCodeStore);
setSmsIpRateStore(smsIpRateStore);
setSettingsDbPool(pool);
setMountHelpersPool(pool);

const parseMaxUploadFileSize = () => {
  const valueMb = Number(process.env.MAX_UPLOAD_FILE_SIZE_MB || DEFAULT_MAX_UPLOAD_FILE_SIZE_MB);
  if (!Number.isFinite(valueMb) || valueMb <= 0) {
    return DEFAULT_MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
  }
  return Math.floor(valueMb * 1024 * 1024);
};

let currentMaxUploadFileSize = parseMaxUploadFileSize();
const getCurrentMaxUploadFileSize = () => currentMaxUploadFileSize;
const setCurrentMaxUploadFileSizeByMb = (valueMb) => {
  if (valueMb === null || Number(valueMb) === -1) {
    currentMaxUploadFileSize = 0;
    return;
  }
  const sizeMb = Number(valueMb);
  if (!Number.isFinite(sizeMb) || sizeMb <= 0) {
    currentMaxUploadFileSize = DEFAULT_MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
    return;
  }
  currentMaxUploadFileSize = Math.floor(sizeMb * 1024 * 1024);
};

const normalizeSettings = (payload = {}) => {
  const system = payload.system && typeof payload.system === "object" ? payload.system : {};
  const login = payload.login && typeof payload.login === "object" ? payload.login : {};
  const smsConfig = login.smsConfig && typeof login.smsConfig === "object" ? login.smsConfig : {};
  const menu = payload.menu && typeof payload.menu === "object" ? payload.menu : {};
  const menuPermissions = menu.permissions && typeof menu.permissions === "object" ? menu.permissions : {};
  const menuMobileVisibility = menu.mobileVisibility && typeof menu.mobileVisibility === "object" ? menu.mobileVisibility : {};
  const maxUploadSizeMb = normalizeGlobalUploadMaxSizeMb(system.maxUploadSizeMb, DEFAULT_SETTINGS.system.maxUploadSizeMb);
  const maxUploadFileCount = normalizeUploadFileCount(system.maxUploadFileCount, DEFAULT_SETTINGS.system.maxUploadFileCount);
  const maxConcurrentUploadCount = normalizeConcurrentUploadCount(system.maxConcurrentUploadCount, DEFAULT_SETTINGS.system.maxConcurrentUploadCount);
  const chunkUploadThresholdMb = normalizeChunkUploadThresholdMb(system.chunkUploadThresholdMb, DEFAULT_SETTINGS.system.chunkUploadThresholdMb);
  const normalizeRateLimit = (value) => {
    const rateLimit = value && typeof value === "object" ? value : {};
    return {
      enabled: Boolean(rateLimit.enabled),
      windowSeconds: Math.max(1, Math.min(3600, Math.floor(toNumber(rateLimit.windowSeconds, DEFAULT_SETTINGS.system.rateLimit.windowSeconds)))),
      maxRequests: Math.max(1, Math.min(10000, Math.floor(toNumber(rateLimit.maxRequests, DEFAULT_SETTINGS.system.rateLimit.maxRequests))))
    };
  };
  const normalizePreviewConfig = (value) => {
    const previewConfig = value && typeof value === "object" ? value : {};
    const normalizeExts = (exts, defaults) => {
      if (!Array.isArray(exts)) {
        // 如果是字符串，尝试解析为数组
        if (typeof exts === "string") {
          const parsed = exts.split(/[,,\s]+/g).filter((item) => item.trim().length > 0).map((item) => item.toLowerCase().trim());
          return parsed.length > 0 ? parsed : defaults.slice();
        }
        return defaults.slice();
      }
      return exts.filter((ext) => typeof ext === "string" && ext.trim().length > 0).map((ext) => ext.toLowerCase().trim()).slice(0, 200);
    };
    return {
      imageExts: normalizeExts(previewConfig.imageExts, DEFAULT_SETTINGS.system.previewConfig.imageExts),
      videoExts: normalizeExts(previewConfig.videoExts, DEFAULT_SETTINGS.system.previewConfig.videoExts),
      audioExts: normalizeExts(previewConfig.audioExts, DEFAULT_SETTINGS.system.previewConfig.audioExts),
      textExts: normalizeExts(previewConfig.textExts, DEFAULT_SETTINGS.system.previewConfig.textExts),
      docExts: normalizeExts(previewConfig.docExts, DEFAULT_SETTINGS.system.previewConfig.docExts)
    };
  };
  const normalizeDownloadConfig = (value) => {
    const download = value && typeof value === "object" ? value : {};
    // 支持新格式 { value, unit } 和旧格式
    let globalSpeedLimit;
    
    if (download.globalSpeedLimit && typeof download.globalSpeedLimit === 'object') {
      // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }，直接保存到数据库
      globalSpeedLimit = {
        value: Number(download.globalSpeedLimit.value) || 0,
        unit: download.globalSpeedLimit.unit || 'KB/s'
      };
    } else if (download.globalSpeedLimitKb !== undefined) {
      // 旧格式：globalSpeedLimitKb，转换为新格式
      const kb = Math.max(0, Math.floor(toNumber(download.globalSpeedLimitKb, 0)));
      if (kb >= 1024 && kb % 1024 === 0) {
        globalSpeedLimit = { value: kb / 1024, unit: 'MB/s' };
      } else {
        globalSpeedLimit = { value: kb, unit: 'KB/s' };
      }
    } else if (download.globalSpeedLimitMb !== undefined) {
      // 更旧格式：globalSpeedLimitMb，转换为新格式
      const mb = Math.max(0, Math.floor(toNumber(download.globalSpeedLimitMb, DEFAULT_SETTINGS.download.globalSpeedLimitMb)));
      globalSpeedLimit = { value: mb, unit: 'MB/s' };
    } else {
      // 默认值
      globalSpeedLimit = { value: DEFAULT_SETTINGS.download.globalSpeedLimitMb, unit: 'MB/s' };
    }
    
    // 处理用户组速度限制，保存带单位的格式
    const groupSpeedLimits = download.groupSpeedLimits && typeof download.groupSpeedLimits === "object" ? download.groupSpeedLimits : {};
    const normalizedGroupSpeedLimits = {};
    Object.keys(groupSpeedLimits).forEach((groupId) => {
      const speedData = groupSpeedLimits[groupId];
      if (speedData && typeof speedData === 'object') {
        // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }，直接保存
        normalizedGroupSpeedLimits[groupId] = {
          value: Number(speedData.value) || 0,
          unit: speedData.unit || 'KB/s'
        };
      } else {
        // 旧格式：纯数字，转换为新格式
        let speed = toNumber(speedData, 0);
        // 如果值小于 1024，认为是 MB，否则是 KB
        if (speed > 0 && speed < 1024) {
          normalizedGroupSpeedLimits[groupId] = { value: speed, unit: 'MB/s' };
        } else {
          // KB/s，如果能被 1024 整除则转换为 MB/s
          if (speed >= 1024 && speed % 1024 === 0) {
            normalizedGroupSpeedLimits[groupId] = { value: speed / 1024, unit: 'MB/s' };
          } else {
            normalizedGroupSpeedLimits[groupId] = { value: speed, unit: 'KB/s' };
          }
        }
      }
    });
    
    // 处理分享下载速度限制
    let shareSpeedLimit;
    if (download.shareSpeedLimit && typeof download.shareSpeedLimit === 'object') {
      // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }，直接保存到数据库
      shareSpeedLimit = {
        value: Number(download.shareSpeedLimit.value) || 0,
        unit: download.shareSpeedLimit.unit || 'KB/s'
      };
    } else if (download.shareSpeedLimitKb !== undefined) {
      // 旧格式：shareSpeedLimitKb，转换为新格式
      const kb = Math.max(0, Math.floor(toNumber(download.shareSpeedLimitKb, 0)));
      if (kb >= 1024 && kb % 1024 === 0) {
        shareSpeedLimit = { value: kb / 1024, unit: 'MB/s' };
      } else {
        shareSpeedLimit = { value: kb, unit: 'KB/s' };
      }
    } else if (download.shareSpeedLimitMb !== undefined) {
      // 更旧格式：shareSpeedLimitMb，转换为新格式
      const mb = Math.max(0, Math.floor(toNumber(download.shareSpeedLimitMb, DEFAULT_SETTINGS.download.globalSpeedLimitMb)));
      shareSpeedLimit = { value: mb, unit: 'MB/s' };
    } else {
      // 默认值
      shareSpeedLimit = { value: DEFAULT_SETTINGS.download.globalSpeedLimitMb, unit: 'MB/s' };
    }
    
    return {
      globalSpeedLimit: globalSpeedLimit,
      groupSpeedLimits: normalizedGroupSpeedLimits,
      shareSpeedLimit: shareSpeedLimit
    };
  };
  return {
    system: {
      maxUploadSizeMb,
      maxUploadFileCount,
      maxConcurrentUploadCount,
      chunkUploadThresholdMb,
      uploadCategoryRules: normalizeUploadCategoryRules(system.uploadCategoryRules, maxUploadSizeMb || DEFAULT_SETTINGS.system.maxUploadSizeMb),
      avatarUploadSizeMb: Math.max(1, Math.min(100, Math.floor(toNumber(system.avatarUploadSizeMb, DEFAULT_SETTINGS.system.avatarUploadSizeMb)))),
      avatarUploadFormats: normalizeAvatarUploadFormats(system.avatarUploadFormats),
      siteTitle: String(system.siteTitle || DEFAULT_SETTINGS.system.siteTitle).trim().slice(0, 120) || DEFAULT_SETTINGS.system.siteTitle,
      loginTitle: String(system.loginTitle || system.siteTitle || DEFAULT_SETTINGS.system.loginTitle).trim().slice(0, 120) || DEFAULT_SETTINGS.system.loginTitle,
      siteDescription: String(system.siteDescription || DEFAULT_SETTINGS.system.siteDescription).trim().slice(0, 500),
      rateLimit: normalizeRateLimit(system.rateLimit),
      previewConfig: normalizePreviewConfig(system.previewConfig)
    },
    login: {
      loginCaptchaEnabled: Boolean(login.loginCaptchaEnabled),
      smsLoginEnabled: Boolean(login.smsLoginEnabled),
      loginSessionMinutes: Math.max(1, Math.min(43200, Math.floor(toNumber(login.loginSessionMinutes, DEFAULT_SETTINGS.login.loginSessionMinutes)))),
      smsSendIntervalSeconds: Math.max(1, Math.min(3600, Math.floor(toNumber(login.smsSendIntervalSeconds, DEFAULT_SETTINGS.login.smsSendIntervalSeconds)))),
      smsIpLimitWindowMinutes: Math.max(1, Math.min(1440, Math.floor(toNumber(login.smsIpLimitWindowMinutes, DEFAULT_SETTINGS.login.smsIpLimitWindowMinutes)))),
      smsIpLimitMaxCount: Math.max(1, Math.min(10000, Math.floor(toNumber(login.smsIpLimitMaxCount, DEFAULT_SETTINGS.login.smsIpLimitMaxCount)))),
      smsConfig: {
        gatewayUrl: String(smsConfig.gatewayUrl || "").trim().slice(0, 300),
        appId: String(smsConfig.appId || "").trim().slice(0, 120),
        appSecret: String(smsConfig.appSecret || "").trim().slice(0, 200),
        signName: String(smsConfig.signName || "").trim().slice(0, 60),
        templateId: String(smsConfig.templateId || "").trim().slice(0, 120)
      }
    },
    menu: {
      permissions: MENU_PERMISSION_KEYS.reduce((acc, key) => {
        acc[key] = normalizeMenuPermissionEntry(menuPermissions[key]);
        return acc;
      }, {}),
      mobileVisibility: MENU_PERMISSION_KEYS.reduce((acc, key) => {
        acc[key] = normalizeMenuMobileVisibleEntry(menuMobileVisibility[key], DEFAULT_SETTINGS.menu.mobileVisibility[key]);
        return acc;
      }, {})
    },
    download: normalizeDownloadConfig(payload.download)
  };
};

setNormalizeSettingsFunction(normalizeSettings);



const {
  isSmsConfigComplete,
  getSmsPolicyConfig,
  dispatchSmsCode,
  verifySmsCode,
  createLoginSession,
  decryptLoginPassword,
  loadUserGroupContextMap,
  resolveGroupUploadMaxSizeMb,
  resolveGroupUploadMaxFileCount,
  insertUserGroupMembers
} = createAuthRuntime({
  Dypnsapi,
  DEFAULT_SETTINGS,
  pool,
  readSettings,
  makeToken,
  SESSION_COOKIE,
  crypto,
  LOGIN_PASSWORD_KEY_PAIR,
  LOGIN_PASSWORD_RSA_OAEP_HASH,
  Buffer,
  normalizeIdList,
  normalizeUserGroupUploadMaxSizeMb,
  normalizeUserGroupUploadMaxFileCount
});

const {
  resolveFolderByRelativePath,
  resolveFolderByRelativeDir
} = createFolderResolver({
  pool,
  normalizeStorageSpaceType,
  normalizeRelativePath,
  safeFileName
});

const {
  appendSyncTaskHistoryLog,
  resolveSyncFolderIdByPath,
  buildSyncFolderPathMap,
  uploadObjectByMount,
  createRemoteFolderMarkerByMount,
  parseSyncRemoteTimeMs,
  listRemoteObjectsByMount,
  deleteRemoteObjectByMount,
  downloadObjectByMount
} = createSyncHelpers({
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
});

const { runSyncTaskNow } = createSyncRunner({
  pool,
  syncingTaskLocks,
  syncTaskLockKey,
  getRuntimeDeps: () => ({
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
  })
});

const { runDueSyncTasks } = createSyncService({
  pool,
  runSyncTaskNow,
  logError
});





const sendDbError = (res, error) => {
  logError("数据库请求失败", {
    errorMessage: error && error.message ? error.message : "unknown",
    stack: error && error.stack ? error.stack : ""
  });
  res.status(500).json({ message: "数据库连接失败", detail: error.message });
};

const {
  middleware: rateLimitMiddleware,
  startCleanup: startRateLimitCleanup
} = createRateLimitMiddleware({
  readSettings,
  cleanupWindowMs: 60 * 1000,
  defaultWindowSeconds: 60,
  defaultMaxRequests: 100
});
startRateLimitCleanup();

const { authRequired, adminRequired } = createAuthMiddlewares({
  SESSION_COOKIE,
  pool,
  loadUserGroupContextMap,
  getEffectivePermissions,
  parsePermissionList,
  resolveGroupUploadMaxSizeMb,
  resolveGroupUploadMaxFileCount,
  sendDbError
});

const {
  isLocalhostRequest,
  getUserDownloadSpeedLimit,
  getUserGroupIds,
  createSpeedLimitedStream
} = createDownloadRuntime({
  pool,
  Throttle,
  DEFAULT_SETTINGS
});

const {
  normalizeChunkUploadId,
  normalizeChunkClientTaskId,
  getChunkSessionDir,
  getChunkDataPath,
  getChunkMarksDir,
  readChunkMeta,
  writeChunkMeta,
  removeChunkSession,
  removeChunkSessionIfOwnedByCurrentUser,
  findChunkSessionByFile,
  removeChunkSessionsByClientTaskId,
  cleanupExpiredChunkSessions
} = createChunkSessionRuntime({
  fs,
  path,
  CHUNK_UPLOAD_ROOT_DIR,
  CHUNK_SESSION_EXPIRE_MS,
  resolveStorageSpaceTypeByRequest,
  normalizeStorageSpaceType
});

const {
  uploadArray,
  cosUploadSingle,
  avatarUploadSingle,
  chunkUploadSingle
} = createUploadMiddlewares({
  multer,
  fs,
  path,
  crypto,
  resolveStorageSpaceTypeByRequest,
  getUploadStorageDir,
  resolveStorageRootDir,
  normalizeUploadName,
  safeFileName,
  getUploadRuntimeOptions,
  getUploadCategoryRuntimeOptions,
  DEFAULT_SETTINGS,
  readSettings,
  getCurrentMaxUploadFileSize,
  getAvatarUploadRuntimeOptions,
  AVATAR_MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_CHUNK_SIZE_BYTES,
  normalizeChunkUploadId,
  removeChunkSessionIfOwnedByCurrentUser
});


const normalizeFolderId = (value) => {
  if (value === null || value === undefined || value === "" || value === "null") {
    return null;
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return undefined;
  }
  return id;
};

const checkFolderOwnership = async (userId, folderId, spaceType = "normal") => {
  const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
  if (folderId === null) {
    return true;
  }
  const [rows] = await pool.query("SELECT id FROM folders WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1", [
    folderId,
    userId,
    normalizedSpaceType
  ]);
  return rows.length > 0;
};

const collectDescendantFolderIds = async (userId, rootFolderId, spaceType = "normal") => {
  const normalizedSpaceType = normalizeStorageSpaceType(spaceType);
  const allIds = [rootFolderId];
  let cursor = [rootFolderId];
  while (cursor.length > 0) {
    const placeholders = cursor.map(() => "?").join(", ");
    const [rows] = await pool.query(
      `SELECT id FROM folders WHERE user_id = ? AND space_type = ? AND parent_id IN (${placeholders})`,
      [userId, normalizedSpaceType, ...cursor]
    );
    const childIds = rows.map((item) => item.id);
    if (childIds.length === 0) {
      break;
    }
    allIds.push(...childIds);
    cursor = childIds;
  }
  return allIds;
};

const {
  runCompressArchive,
  listArchiveEntries,
  extractArchiveToDirectory,
  resolveUniqueName
} = createArchiveRuntime({
  fs,
  path,
  spawn,
  archiver,
  ARCHIVE_SUPPORTED_TYPE_SET,
  Buffer,
  safeFileName
});

const toInClause = (ids) => ids.map(() => "?").join(", ");

const {
  buildFolderLogicalPathResolver,
  hasNameConflict,
  hasEntryNameConflict,
  copyFileRecord,
  copyFolderRecursive,
  cleanupExpiredRecycleEntries
} = createEntryRecycleRuntime({
  pool,
  fs,
  path,
  normalizeStorageSpaceType,
  normalizeStorageRelativePath,
  resolveAbsoluteStoragePath,
  makeStorageName,
  normalizeFileCategoryKey,
  RECYCLE_RETENTION_DAYS
});

const refreshUploadLimitFromSettings = async () => {
  const settings = await readSettings();
  setCurrentMaxUploadFileSizeByMb(settings.system.maxUploadSizeMb);
  return settings;
};

app.use(express.json({ limit: "5mb" }));

// 应用速率限制中间件
app.use(rateLimitMiddleware);

const {
  apiMonitorStore,
  startMonitorJobs,
  monitorMiddleware
} = createMonitorRuntime({
  pool,
  crypto,
  summarizeForLog,
  logInfo,
  logError
});
startMonitorJobs();
app.use(monitorMiddleware);
app.use(express.urlencoded({ extended: true }));

// 统一的 HTML 服务函数 (读取 views 目录，处理 INCLUDE，压缩 HTML，返回 ETag)
const serveHtmlFromViews = (req, res, next, filename, isPrivate = false) => {
  const fs = require("fs");
  const path = require("path");
  const viewsDir = path.join(ROOT_DIR, "views");
  const templatePath = path.join(viewsDir, filename);

  if (fs.existsSync(templatePath)) {
    let content = fs.readFileSync(templatePath, "utf8");
    
    // 动态拼接组件
    content = content.replace(/<!--\s*INCLUDE:\s*([^\s>]+)\s*-->/g, (match, compName) => {
      const compPath = path.join(viewsDir, "components", compName);
      if (fs.existsSync(compPath)) {
        return fs.readFileSync(compPath, "utf8");
      }
      return match;
    });

    // 简单 HTML 压缩 (剔除多余空白和 HTML 注释)
    content = content
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/>\s+</g, "><")
      .replace(/\s{2,}/g, " ")
      .trim();

    // ETag 与缓存控制
    const etag = '"' + crypto.createHash("md5").update(content).digest("hex") + '"';
    const cacheControl = isPrivate ? 'private, no-cache, max-age=0, must-revalidate' : 'public, max-age=0, must-revalidate';
    
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("ETag", etag);
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    return res.send(content);
  }
  next();
};

app.get("/drive.html", async (req, res, next) => {
  // 1. 路由拦截与权限控制
  const cookies = req.headers.cookie || "";
  const tokenMatch = cookies.match(new RegExp(`(^| )${SESSION_COOKIE}=([^;]+)`));
  const token = tokenMatch ? decodeURIComponent(tokenMatch[2]) : null;
  
  if (!token) {
    return res.redirect("/"); // 未登录直接重定向到首页
  }

  try {
    const [rows] = await pool.query(
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > NOW() LIMIT 1",
      [token]
    );
    if (rows.length === 0) {
      return res.redirect("/"); // Token无效或过期，重定向到首页
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    return res.redirect("/");
  }

  // 2. 动态拼接与渲染
  serveHtmlFromViews(req, res, next, "drive.html", true);
});

// 通用 HTML 静态文件拦截器 (为所有 .html 和 / 代理到 views 目录)
app.use((req, res, next) => {
  if (req.method === "GET") {
    let filename = "";
    if (req.path === "/") {
      filename = "index.html";
    } else if (req.path.endsWith(".html")) {
      filename = req.path.substring(1);
    }

    if (filename && !filename.includes("..")) {
      return serveHtmlFromViews(req, res, next, filename, false);
    }
  }
  next();
});

// JIT (Just-In-Time) 动态编译 JS 拦截器
// 每次请求 JS 时，检查 views/js 下的源码是否比 public/js 下的压缩包更新。如果是，则实时重新压缩并覆盖，然后交给静态服务。
app.use((req, res, next) => {
  if (req.method === "GET" && req.path.startsWith("/js/") && req.path.endsWith(".js")) {
    const filename = req.path.substring(4); // 去除 /js/
    if (filename && !filename.includes("..")) {
      const srcPath = path.join(ROOT_DIR, "views", "js", filename);
      const destPath = path.join(PUBLIC_DIR, "js", filename);

      if (fs.existsSync(srcPath)) {
        let needsBuild = false;
        if (!fs.existsSync(destPath)) {
          needsBuild = true;
        } else {
          const srcStat = fs.statSync(srcPath);
          const destStat = fs.statSync(destPath);
          // 如果源码修改时间比压缩包新，说明开发者刚刚保存了文件
          if (srcStat.mtimeMs > destStat.mtimeMs) {
            needsBuild = true;
          }
        }

        if (needsBuild) {
          const uglifyJS = require("uglify-js");
          const content = fs.readFileSync(srcPath, "utf8");
          const minified = uglifyJS.minify(content, {
            compress: { passes: 1 },
            output: { comments: false }
          });
          const finalCode = minified.error ? content : minified.code;
          if (minified.error) {
            console.warn("[JIT Build Error] UglifyJS error on", filename, minified.error);
          }
          if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
          }
          fs.writeFileSync(destPath, finalCode, "utf8");
          logInfo("JIT 动态编译完成", { file: filename });
        }
      }
    }
  }
  next(); // 编译完物理文件后，放行给下方的 express.static 处理
});

app.use(express.static(PUBLIC_DIR));
app.use("/fontawesome", express.static(path.join(ROOT_DIR, "node_modules/@fortawesome/fontawesome-free")));
app.use("/monaco-editor@0.52.2", express.static(path.join(ROOT_DIR, "node_modules/monaco-editor")));
app.use("/monaco-editor", express.static(path.join(ROOT_DIR, "node_modules/monaco-editor/min")));
app.use("/chart.js", express.static(path.join(ROOT_DIR, "node_modules/chart.js/dist")));
app.use("/uploads", express.static(UPLOAD_DIR));

registerAllRoutes(app, {
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
  verifyPassword,
  resolveAbsoluteStoragePath,
  fs,
  normalizeUserGroupUploadMaxSizeMb,
  normalizeUserGroupUploadMaxFileCount,
  convertUserGroupUploadSizeMbToGb,
  convertUserGroupUploadSizeGbToMb,
  cosUploadSingle,
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
  encodeCosKey,
  readSettings,
  verifyCaptcha,
  createLoginSession,
  generateCaptcha,
  normalizePhone,
  isSmsConfigComplete,
  getSmsPolicyConfig,
  smsCodeStore,
  smsIpRateStore,
  SMS_CODE_EXPIRE_MS,
  dispatchSmsCode,
  logInfo,
  logError,
  verifySmsCode,
  SESSION_COOKIE,
  decryptLoginPassword,
  LOGIN_PASSWORD_KEY_ID,
  LOGIN_PASSWORD_KEY_PAIR,
  requireFilePermission,
  resolveStorageSpaceTypeByRequest,
  normalizeFolderId,
  checkFolderOwnership,
  hasNameConflict,
  hasEntryNameConflict,
  hasFilePermission,
  collectDescendantFolderIds,
  toInClause,
  chunkUploadSingle,
  uploadArray,
  normalizeChunkClientTaskId,
  normalizeRelativePath,
  safeFileName,
  normalizeUploadName,
  MAX_UPLOAD_CHUNK_SIZE_BYTES,
  getUploadRuntimeOptions,
  DEFAULT_SETTINGS,
  getUploadCategoryRuntimeOptions,
  getUploadLimitError,
  getUploadFormatError,
  findChunkSessionByFile,
  getChunkMarksDir,
  removeChunkSessionsByClientTaskId,
  crypto,
  getChunkSessionDir,
  getChunkDataPath,
  writeChunkMeta,
  removeChunkSession,
  normalizeChunkUploadId,
  readChunkMeta,
  normalizeStorageSpaceType,
  getUploadStorageDir,
  resolveStorageRootDir,
  resolveStorageNameFromPath,
  resolveUploadCategory,
  writeThumbnailFromDataUrl,
  normalizeFileCategoryKey,
  resolveStoredFileCategory,
  resolveFolderByRelativePath,
  resolveUniqueName,
  logFileOperation,
  detectArchiveType,
  ARCHIVE_SUPPORTED_TYPE_SET,
  listArchiveEntries,
  resolveFolderByRelativeDir,
  os,
  extractArchiveToDirectory,
  inferMimeTypeByFileName,
  inferImageMimeTypeFromStorageName,
  mammoth,
  xlsx,
  writeExtractedThumbnailFromSource,
  runCompressArchive,
  Throttle,
  getUserDownloadSpeedLimit,
  createSpeedLimitedStream,
  resolveTransferTaskTypeByRequest,
  getTransferTaskText,
  normalizeUploadTaskItem,
  normalizeUploadTaskStatus,
  normalizeSyncDirection,
  normalizeSyncTaskType,
  normalizeSyncScheduleUnit,
  normalizeSyncScheduleTime,
  normalizeSyncScheduleAt,
  normalizeSyncScheduleDateType,
  normalizeSyncScheduleDateValue,
  normalizeSyncEmptyDirMode,
  normalizeSyncFileUpdateRule,
  normalizeSyncDeleteRule,
  normalizeSyncTaskStatus,
  normalizeSyncTaskItem,
  getSyncTaskNextRunAt,
  formatSyncDetailTime,
  appendSyncTaskHistoryLog,
  runSyncTaskNow,
  mergeSettingsPayload,
  normalizeSettings,
  writeSettings,
  setCurrentMaxUploadFileSizeByMb,
  getAllowedMenusForUser,
  getMobileVisibleMenus,
  MENU_PERMISSION_KEYS,
  normalizeViewMode,
  normalizeGridSize,
  normalizeVisibleCategories,
  resolveGroupUploadMaxSizeMb,
  resolveGroupUploadMaxFileCount,
  avatarUploadSingle,
  UPLOAD_DIR,
  getAvatarStorageDir,
  normalizeStorageRelativePath,
  apiMonitorStore,
  PREVIEW_MEDIA_STREAM_CHUNK_BYTES,
  copyFileRecord,
  copyFolderRecursive,
  cleanupExpiredRecycleEntries,
  buildFolderLogicalPathResolver
});

const buildJsFiles = () => {
  const viewsJsDir = path.join(ROOT_DIR, "views", "js");
  const publicJsDir = path.join(PUBLIC_DIR, "js");
  if (!fs.existsSync(publicJsDir)) {
    fs.mkdirSync(publicJsDir, { recursive: true });
  }
  if (fs.existsSync(viewsJsDir)) {
    const uglifyJS = require("uglify-js");
    const files = fs.readdirSync(viewsJsDir);
    let count = 0;
    for (const f of files) {
      if (f.endsWith(".js")) {
        const content = fs.readFileSync(path.join(viewsJsDir, f), "utf8");
        const minified = uglifyJS.minify(content, {
          compress: { passes: 1 },
          output: { comments: false }
        });
        const finalCode = minified.error ? content : minified.code;
        if (minified.error) {
          console.warn("UglifyJS error on", f, minified.error);
        }
        fs.writeFileSync(path.join(publicJsDir, f), finalCode, "utf8");
        count++;
      }
    }
    logInfo("JS 构建完成", { fileCount: count, targetDir: publicJsDir });
  }
};

app.use(createErrorHandler({ multer, getCurrentMaxUploadFileSize }));

const start = async () => {
  try {
    buildJsFiles();
    await initDatabase();
    await refreshUploadLimitFromSettings();
    await cleanupExpiredRecycleEntries();
    cleanupExpiredChunkSessions();
    cleanupRuntimeAuthData();
    startRecycleCleanupJob({
      cleanupExpiredRecycleEntries,
      logError,
      intervalMs: RECYCLE_CLEANUP_INTERVAL_MS
    });
    startRuntimeCleanupJobs({
      cleanupRuntimeAuthData,
      cleanupExpiredChunkSessions,
      chunkCleanupIntervalMs: CHUNK_SESSION_CLEANUP_INTERVAL_MS
    });
    startSyncSchedulerJob({
      cronExpression: SYNC_SCHEDULER_CRON,
      runDueSyncTasks,
      logError
    });
    runDueSyncTasks().catch((error) => {
      logError("启动后同步任务预执行失败", {
        errorMessage: error && error.message ? error.message : "unknown",
        stack: error && error.stack ? error.stack : ""
      });
    });
    app.listen(PORT, HOST, () => {
      logInfo("服务启动成功", { port: PORT, url: `http://${HOST}:${PORT}` });
    });
  } catch (error) {
    logError("服务启动失败", {
      errorMessage: error && error.message ? error.message : "unknown",
      stack: error && error.stack ? error.stack : ""
    });
    process.exit(1);
  }
};

module.exports = {
  start,
  logError
};
