const DEFAULT_SETTINGS = require("./default-settings");
const {
  DEFAULT_MAX_UPLOAD_FILE_SIZE_MB,
  DEFAULT_AVATAR_UPLOAD_SIZE_MB,
  DEFAULT_AVATAR_UPLOAD_FORMATS,
  MENU_PERMISSION_KEYS,
  VIEW_MODE_OPTIONS,
  GRID_SIZE_OPTIONS,
  FILE_CATEGORY_OPTIONS,
  FILE_UPLOAD_CATEGORY_KEYS,
  AVATAR_FORMAT_MIME_MAP,
  DEFAULT_UPLOAD_CATEGORY_RULES
} = require("./constants");

const toNumber = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
};

const normalizeViewMode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return VIEW_MODE_OPTIONS.has(normalized) ? normalized : "list";
};

const normalizeGridSize = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return GRID_SIZE_OPTIONS.has(normalized) ? normalized : "medium";
};

const normalizeVisibleCategories = (value) => {
  let rawList = value;
  if (typeof rawList === "string") {
    try {
      rawList = JSON.parse(rawList);
    } catch (error) {
      rawList = [];
    }
  }
  if (!Array.isArray(rawList)) return FILE_CATEGORY_OPTIONS.slice();
  const dedup = [];
  const seen = new Set();
  rawList.forEach((item) => {
    const key = String(item || "").trim().toLowerCase();
    if (!FILE_CATEGORY_OPTIONS.includes(key) || seen.has(key)) return;
    seen.add(key);
    dedup.push(key);
  });
  return dedup;
};

const normalizeMenuIdList = (value) => {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  value.forEach((item) => {
    const id = Math.floor(Number(item));
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
};

const normalizeMenuPermissionEntry = (value) => {
  if (Array.isArray(value)) {
    return { users: normalizeMenuIdList(value), groups: [] };
  }
  if (!value || typeof value !== "object") {
    return { users: [], groups: [] };
  }
  return {
    users: normalizeMenuIdList(value.users),
    groups: normalizeMenuIdList(value.groups)
  };
};

const normalizeMenuMobileVisibleEntry = (value, fallback = true) => {
  if (value === undefined || value === null) return Boolean(fallback);
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return Boolean(value);
};

const normalizeAvatarUploadFormats = (value) => {
  const rawList = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,，\s]+/g)
      .filter(Boolean);
  const result = [];
  const seen = new Set();
  rawList.forEach((item) => {
    let ext = String(item || "").trim().toLowerCase().replace(/^\./, "");
    if (ext === "jpeg") ext = "jpg";
    if (!ext || !AVATAR_FORMAT_MIME_MAP[ext] || seen.has(ext)) return;
    seen.add(ext);
    result.push(ext);
  });
  if (result.length === 0) return DEFAULT_AVATAR_UPLOAD_FORMATS.slice();
  return result;
};

const getAvatarUploadRuntimeOptions = (settings = DEFAULT_SETTINGS) => {
  const system = settings && settings.system && typeof settings.system === "object" ? settings.system : {};
  const maxSizeMb = Math.max(1, Math.min(100, Math.floor(toNumber(system.avatarUploadSizeMb, DEFAULT_AVATAR_UPLOAD_SIZE_MB))));
  const formats = normalizeAvatarUploadFormats(system.avatarUploadFormats);
  const allowedMimes = new Set();
  formats.forEach((format) => {
    const mimes = AVATAR_FORMAT_MIME_MAP[format] || [];
    mimes.forEach((mime) => allowedMimes.add(mime));
  });
  return {
    maxSizeMb,
    maxSizeBytes: maxSizeMb * 1024 * 1024,
    formats,
    allowedMimes
  };
};

const normalizeUploadRuleFormats = (value, fallbackFormats = []) => {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,，\s]+/g)
      .filter(Boolean);
  const result = [];
  const seen = new Set();
  source.forEach((item) => {
    const ext = String(item || "").trim().toLowerCase().replace(/^\./, "");
    if (!ext || !/^[a-z0-9]+$/.test(ext) || seen.has(ext)) return;
    seen.add(ext);
    result.push(ext);
  });
  if (result.length === 0) return fallbackFormats.slice();
  return result;
};

const normalizeUploadCategoryRules = (value, globalMaxSizeMb) => {
  const rules = value && typeof value === "object" ? value : {};
  const fallbackGlobalMaxSizeMb = Math.max(1, Math.min(102400, Math.floor(toNumber(globalMaxSizeMb, DEFAULT_SETTINGS.system.maxUploadSizeMb))));
  return FILE_UPLOAD_CATEGORY_KEYS.reduce((acc, key) => {
    const fallback = DEFAULT_UPLOAD_CATEGORY_RULES[key] || { formats: [], maxSizeMb: globalMaxSizeMb };
    const current = rules[key] && typeof rules[key] === "object" ? rules[key] : {};
    acc[key] = {
      formats: normalizeUploadRuleFormats(current.formats, fallback.formats),
      maxSizeMb: Math.max(1, Math.min(102400, Math.floor(toNumber(current.maxSizeMb, fallbackGlobalMaxSizeMb))))
    };
    return acc;
  }, {});
};

const normalizeGlobalUploadMaxSizeMb = (value, fallback = DEFAULT_SETTINGS.system.maxUploadSizeMb) => {
  const fallbackNumeric = Math.floor(Number(fallback));
  const fallbackSize = fallbackNumeric === -1
    ? -1
    : Math.max(1, Math.min(102400, Math.floor(toNumber(fallback, DEFAULT_SETTINGS.system.maxUploadSizeMb))));
  if (value === null) return -1;
  if (value === undefined || value === "") return fallbackSize;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return fallbackSize;
  if (numeric === -1) return -1;
  if (numeric <= 0) return fallbackSize;
  return Math.max(1, Math.min(102400, numeric));
};

const normalizeUploadFileCount = (value, fallback = DEFAULT_SETTINGS.system.maxUploadFileCount) => {
  const fallbackCount = Math.max(1, Math.min(1000, Math.floor(toNumber(fallback, DEFAULT_SETTINGS.system.maxUploadFileCount))));
  if (value === undefined || value === null || value === "") return fallbackCount;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackCount;
  return Math.max(1, Math.min(1000, numeric));
};

const normalizeConcurrentUploadCount = (value, fallback = DEFAULT_SETTINGS.system.maxConcurrentUploadCount) => {
  const fallbackCount = Math.max(1, Math.min(20, Math.floor(toNumber(fallback, DEFAULT_SETTINGS.system.maxConcurrentUploadCount))));
  if (value === undefined || value === null || value === "") return fallbackCount;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackCount;
  return Math.max(1, Math.min(20, numeric));
};

const normalizeChunkUploadThresholdMb = (value, fallback = DEFAULT_SETTINGS.system.chunkUploadThresholdMb) => {
  const fallbackThreshold = Math.max(1, Math.min(102400, Math.floor(toNumber(fallback, DEFAULT_SETTINGS.system.chunkUploadThresholdMb))));
  if (value === undefined || value === null || value === "") return fallbackThreshold;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackThreshold;
  return Math.max(1, Math.min(102400, numeric));
};

const normalizeUserGroupUploadMaxSizeMb = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return -1;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return -1;
  if (numeric === -1) return -1;
  if (numeric <= 0) return -1;
  return Math.max(1, Math.min(102400, numeric));
};

const normalizeUserGroupUploadMaxFileCount = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return -1;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return -1;
  if (numeric === -1) return -1;
  if (numeric <= 0) return -1;
  return Math.max(1, Math.min(1000, numeric));
};

const normalizeUserGroupUploadMaxSizeGb = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return -1;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return -1;
  if (numeric === -1) return -1;
  if (numeric <= 0) return -1;
  return Math.max(1, Math.min(100, numeric));
};

const convertUserGroupUploadSizeGbToMb = (value) => {
  const gb = normalizeUserGroupUploadMaxSizeGb(value);
  if (gb === undefined) return undefined;
  if (gb === -1) return -1;
  return gb * 1024;
};

const convertUserGroupUploadSizeMbToGb = (value) => {
  const mb = normalizeUserGroupUploadMaxSizeMb(value);
  if (mb === undefined) return undefined;
  if (mb === -1) return -1;
  return Math.max(1, Math.floor(mb / 1024));
};

const getUploadFileExt = (fileName) => {
  const name = String(fileName || "").trim().toLowerCase();
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= -1 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1);
};

const buildUploadCategoryExtMap = (rules = {}) => {
  const extCategoryMap = new Map();
  FILE_UPLOAD_CATEGORY_KEYS.forEach((key) => {
    if (key === "other") return;
    const item = rules[key] && typeof rules[key] === "object" ? rules[key] : {};
    const formats = Array.isArray(item.formats) ? item.formats : [];
    formats.forEach((format) => {
      const ext = String(format || "").trim().toLowerCase().replace(/^\./, "");
      if (!ext || !/^[a-z0-9]+$/.test(ext) || extCategoryMap.has(ext)) return;
      extCategoryMap.set(ext, key);
    });
  });
  return extCategoryMap;
};

const getUploadCategoryRuntimeOptions = (settings = DEFAULT_SETTINGS) => {
  const system = settings && settings.system && typeof settings.system === "object" ? settings.system : {};
  const globalMaxSizeMb = normalizeGlobalUploadMaxSizeMb(system.maxUploadSizeMb, DEFAULT_SETTINGS.system.maxUploadSizeMb);
  const rules = normalizeUploadCategoryRules(system.uploadCategoryRules, globalMaxSizeMb || DEFAULT_SETTINGS.system.maxUploadSizeMb);
  return {
    rules,
    extCategoryMap: buildUploadCategoryExtMap(rules)
  };
};

const resolveUploadCategory = (file, categoryRuntimeOptions = null) => {
  const runtimeOptions = categoryRuntimeOptions || getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
  const ext = getUploadFileExt(file && file.originalname ? file.originalname : "");
  const extCategoryMap = runtimeOptions && runtimeOptions.extCategoryMap instanceof Map
    ? runtimeOptions.extCategoryMap
    : null;
  if (ext && extCategoryMap && extCategoryMap.has(ext)) {
    return extCategoryMap.get(ext);
  }
  return "other";
};

const normalizeFileCategoryKey = (value) => {
  const key = String(value || "").trim().toLowerCase();
  if (FILE_UPLOAD_CATEGORY_KEYS.includes(key)) return key;
  return "other";
};

const resolveStoredFileCategory = (originalName, mimeType, categoryRuntimeOptions = null) => resolveUploadCategory({
  originalname: String(originalName || ""),
  mimetype: String(mimeType || "")
}, categoryRuntimeOptions);

const getUploadFormatError = (file, categoryRuntimeOptions = null) => {
  const runtimeOptions = categoryRuntimeOptions || getUploadCategoryRuntimeOptions(DEFAULT_SETTINGS);
  const resolvedCategory = resolveUploadCategory(file, runtimeOptions);
  if (resolvedCategory !== "other") return "";
  const ext = getUploadFileExt(file && file.originalname ? file.originalname : "");
  const rules = runtimeOptions && runtimeOptions.rules && typeof runtimeOptions.rules === "object" ? runtimeOptions.rules : {};
  const otherRule = rules.other && typeof rules.other === "object" ? rules.other : {};
  const otherFormats = Array.isArray(otherRule.formats) ? otherRule.formats : [];
  if (!ext || otherFormats.length === 0) return "上传的文件格式不支持";
  if (!otherFormats.includes(ext)) return "上传的文件格式不支持";
  return "";
};

const getUploadRuntimeOptions = (settings = DEFAULT_SETTINGS, options = {}) => {
  const system = settings && settings.system && typeof settings.system === "object" ? settings.system : {};
  const hasGroupUploadRule = Object.prototype.hasOwnProperty.call(options || {}, "groupMaxSizeMb");
  const hasGroupUploadFileCountRule = Object.prototype.hasOwnProperty.call(options || {}, "groupMaxFileCount");
  const groupMaxSizeMb = hasGroupUploadRule ? normalizeUserGroupUploadMaxSizeMb(options.groupMaxSizeMb) : null;
  const groupMaxFileCount = hasGroupUploadFileCountRule ? normalizeUserGroupUploadMaxFileCount(options.groupMaxFileCount) : null;
  const globalMaxSizeMb = normalizeGlobalUploadMaxSizeMb(system.maxUploadSizeMb, DEFAULT_SETTINGS.system.maxUploadSizeMb);
  const maxUploadLimitMb = hasGroupUploadRule
    ? (groupMaxSizeMb > 0 ? groupMaxSizeMb : -1)
    : (globalMaxSizeMb > 0 ? globalMaxSizeMb : -1);
  const globalMaxUploadFileCount = normalizeUploadFileCount(system.maxUploadFileCount, DEFAULT_SETTINGS.system.maxUploadFileCount);
  const maxConcurrentUploadCount = normalizeConcurrentUploadCount(system.maxConcurrentUploadCount, DEFAULT_SETTINGS.system.maxConcurrentUploadCount);
  const chunkUploadThresholdMb = normalizeChunkUploadThresholdMb(system.chunkUploadThresholdMb, DEFAULT_SETTINGS.system.chunkUploadThresholdMb);
  const maxUploadFileCount = hasGroupUploadFileCountRule
    ? (groupMaxFileCount > 0 ? groupMaxFileCount : -1)
    : globalMaxUploadFileCount;
  return {
    hasGroupUploadRule,
    hasGroupUploadFileCountRule,
    groupMaxSizeMb,
    groupMaxFileCount,
    groupMaxSizeBytes: groupMaxSizeMb > 0 ? groupMaxSizeMb * 1024 * 1024 : 0,
    globalMaxSizeMb,
    globalMaxSizeBytes: globalMaxSizeMb > 0 ? globalMaxSizeMb * 1024 * 1024 : 0,
    globalMaxUploadFileCount,
    maxConcurrentUploadCount,
    chunkUploadThresholdMb,
    chunkUploadThresholdBytes: chunkUploadThresholdMb * 1024 * 1024,
    maxUploadFileCount,
    maxUploadLimitMb,
    maxUploadLimitBytes: maxUploadLimitMb > 0 ? maxUploadLimitMb * 1024 * 1024 : 0
  };
};

const getUploadLimitError = (file, options) => {
  if (!file || !options) return "上传文件不合法";
  if (options.hasGroupUploadRule) {
    if (options.groupMaxSizeBytes && Number(file.size || 0) > options.groupMaxSizeBytes) {
      const groupMaxSizeGb = convertUserGroupUploadSizeMbToGb(options.groupMaxSizeMb);
      if (groupMaxSizeGb) {
        return `单文件上传不能超过 ${groupMaxSizeGb}GB`;
      }
      return `单文件上传不能超过 ${options.groupMaxSizeMb}MB`;
    }
    return "";
  }
  if (options.globalMaxSizeBytes && Number(file.size || 0) > options.globalMaxSizeBytes) {
    return `单文件上传不能超过 ${options.globalMaxSizeMb}MB`;
  }
  return "";
};

module.exports = {
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
  getUploadLimitError
};
