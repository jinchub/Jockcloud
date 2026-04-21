const {
  DEFAULT_SETTINGS,
  MENU_PERMISSION_KEYS,
  FILE_UPLOAD_CATEGORY_KEYS,
  SETTINGS_GLOBAL_KEY
} = require("./constants");

const {
  normalizeMenuPermissionEntry,
  normalizeMenuMobileVisibleEntry
} = require("./settings-helpers");

const { normalizeIdList } = require("./permission-helpers");


let poolInstance = null;
let normalizeSettingsFunction = null;

const setSettingsDbPool = (pool) => {
  poolInstance = pool;
};

const setNormalizeSettingsFunction = (fn) => {
  normalizeSettingsFunction = fn;
};

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const flattenSettingEntries = (value, prefix = "", entries = []) => {
  if (!isPlainObject(value)) return entries;
  Object.keys(value).forEach((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const current = value[key];
    if (isPlainObject(current)) {
      flattenSettingEntries(current, path, entries);
      return;
    }
    entries.push([path, JSON.stringify(current)]);
  });
  return entries;
};

const setByPath = (target, path, value) => {
  const parts = String(path || "").split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
};

const parseSettingRowValue = (rawValue) => {
  try {
    return JSON.parse(String(rawValue || "null"));
  } catch (error) {
    return String(rawValue || "");
  }
};

const buildSettingsFromRows = (rows = []) => {
  const payload = {};
  rows.forEach((row) => {
    const key = String(row.configKey || "").trim();
    if (!key || key === SETTINGS_GLOBAL_KEY) return;
    setByPath(payload, key, parseSettingRowValue(row.configValue));
  });
  return payload;
};

const mergeUploadCategoryRulesByKey = (baseRules, nextRules) => {
  const base = baseRules && typeof baseRules === "object" ? baseRules : {};
  const next = nextRules && typeof nextRules === "object" ? nextRules : {};
  return FILE_UPLOAD_CATEGORY_KEYS.reduce((acc, key) => {
    const baseItem = base[key] && typeof base[key] === "object" ? base[key] : {};
    const nextItem = next[key] && typeof next[key] === "object" ? next[key] : {};
    acc[key] = {
      ...baseItem,
      ...nextItem
    };
    return acc;
  }, {});
};

const mergeSettingsPayload = (currentSettings, patch) => {
  const current = currentSettings && typeof currentSettings === "object" ? currentSettings : DEFAULT_SETTINGS;
  const nextPatch = patch && typeof patch === "object" ? patch : {};
  const currentSystem = current.system && typeof current.system === "object" ? current.system : {};
  const patchSystem = nextPatch.system && typeof nextPatch.system === "object" ? nextPatch.system : {};
  const currentLogin = current.login && typeof current.login === "object" ? current.login : {};
  const patchLogin = nextPatch.login && typeof nextPatch.login === "object" ? nextPatch.login : {};
  const currentSmsConfig = currentLogin.smsConfig && typeof currentLogin.smsConfig === "object" ? currentLogin.smsConfig : {};
  const patchSmsConfig = patchLogin.smsConfig && typeof patchLogin.smsConfig === "object" ? patchLogin.smsConfig : {};
  const currentMenu = current.menu && typeof current.menu === "object" ? current.menu : {};
  const patchMenu = nextPatch.menu && typeof nextPatch.menu === "object" ? nextPatch.menu : {};
  const currentMenuPermissions = currentMenu.permissions && typeof currentMenu.permissions === "object" ? currentMenu.permissions : {};
  const patchMenuPermissions = patchMenu.permissions && typeof patchMenu.permissions === "object" ? patchMenu.permissions : {};
  const currentMenuMobileVisibility = currentMenu.mobileVisibility && typeof currentMenu.mobileVisibility === "object" ? currentMenu.mobileVisibility : {};
  const patchMenuMobileVisibility = patchMenu.mobileVisibility && typeof patchMenu.mobileVisibility === "object" ? patchMenu.mobileVisibility : {};
  const currentPreviewConfig = currentSystem.previewConfig && typeof currentSystem.previewConfig === "object" ? currentSystem.previewConfig : {};
  const patchPreviewConfig = patchSystem.previewConfig && typeof patchSystem.previewConfig === "object" ? patchSystem.previewConfig : {};
  const currentDownload = current.download && typeof current.download === "object" ? current.download : {};
  const patchDownload = nextPatch.download && typeof nextPatch.download === "object" ? nextPatch.download : {};
  const currentGroupSpeedLimits = currentDownload.groupSpeedLimits && typeof currentDownload.groupSpeedLimits === "object" ? currentDownload.groupSpeedLimits : {};
  const patchGroupSpeedLimits = patchDownload.groupSpeedLimits && typeof patchDownload.groupSpeedLimits === "object" ? patchDownload.groupSpeedLimits : {};
  return {
    ...current,
    ...nextPatch,
    system: {
      ...currentSystem,
      ...patchSystem,
      uploadCategoryRules: mergeUploadCategoryRulesByKey(currentSystem.uploadCategoryRules, patchSystem.uploadCategoryRules),
      previewConfig: {
        ...currentPreviewConfig,
        ...patchPreviewConfig
      }
    },
    login: {
      ...currentLogin,
      ...patchLogin,
      smsConfig: {
        ...currentSmsConfig,
        ...patchSmsConfig
      }
    },
    menu: {
      ...currentMenu,
      ...patchMenu,
      permissions: {
        ...currentMenuPermissions,
        ...patchMenuPermissions
      },
      mobileVisibility: {
        ...currentMenuMobileVisibility,
        ...patchMenuMobileVisibility
      }
    },
    download: {
      ...currentDownload,
      ...patchDownload,
      groupSpeedLimits: {
        ...currentGroupSpeedLimits,
        ...patchGroupSpeedLimits
      }
    }
  };
};

const getAllowedMenusForUser = (settings, user, normalizeIdListFn = normalizeIdList) => {
  if (user && user.role === "admin") return MENU_PERMISSION_KEYS.slice();
  const userId = Math.floor(Number((user && (user.userId || user.id)) || 0));
  const groupIdSet = new Set(normalizeIdListFn(user && user.groupIds));
  const menu = settings && settings.menu && typeof settings.menu === "object" ? settings.menu : {};
  const permissions = menu.permissions && typeof menu.permissions === "object" ? menu.permissions : {};
  return MENU_PERMISSION_KEYS.filter((key) => {
    if (key === "files" || key === "transfer") return true;
    const entry = normalizeMenuPermissionEntry(permissions[key]);
    const userAllowed = userId > 0 && entry.users.includes(userId);
    const groupAllowed = entry.groups.some((groupId) => groupIdSet.has(groupId));
    return userAllowed || groupAllowed;
  });
};

const getMobileVisibleMenus = (settings) => {
  const menu = settings && settings.menu && typeof settings.menu === "object" ? settings.menu : {};
  const mobileVisibility = menu.mobileVisibility && typeof menu.mobileVisibility === "object" ? menu.mobileVisibility : {};
  return MENU_PERMISSION_KEYS.filter((key) => normalizeMenuMobileVisibleEntry(mobileVisibility[key], true));
};

const ensureSettingsTable = async () => {
  if (!poolInstance) {
    throw new Error("Pool not set. Call setPool() first.");
  }
  await poolInstance.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY AUTO_INCREMENT,
      config_key VARCHAR(64) NOT NULL UNIQUE,
      config_value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};

const ensureSettingsDefaultRow = async () => {
  if (!poolInstance || !normalizeSettingsFunction) {
    throw new Error("Pool or normalizeSettingsFunction not set. Call setPool() and setNormalizeSettingsFunction() first.");
  }
  const [rows] = await poolInstance.query(
    "SELECT config_key AS configKey, config_value AS configValue FROM settings"
  );
  if (rows.length === 0) {
    await writeSettings(DEFAULT_SETTINGS);
    return;
  }
  const independentRows = rows.filter((row) => String(row.configKey || "") !== SETTINGS_GLOBAL_KEY);
  if (independentRows.length > 0) {
    await writeSettings(buildSettingsFromRows(independentRows));
    return;
  }
  const globalRow = rows.find((row) => String(row.configKey || "") === SETTINGS_GLOBAL_KEY);
  let source = DEFAULT_SETTINGS;
  if (globalRow) {
    try {
      source = JSON.parse(String(globalRow.configValue || "{}"));
    } catch (error) {
      source = DEFAULT_SETTINGS;
    }
  }
  await writeSettings(source);
};

const readSettings = async () => {
  if (!poolInstance || !normalizeSettingsFunction) {
    throw new Error("Pool or normalizeSettingsFunction not set. Call setPool() and setNormalizeSettingsFunction() first.");
  }
  const [rows] = await poolInstance.query(
    "SELECT config_key AS configKey, config_value AS configValue FROM settings"
  );
  if (rows.length === 0) {
    return normalizeSettingsFunction(DEFAULT_SETTINGS);
  }
  const independentRows = rows.filter((row) => String(row.configKey || "") !== SETTINGS_GLOBAL_KEY);
  if (independentRows.length > 0) {
    return normalizeSettingsFunction(buildSettingsFromRows(independentRows));
  }
  const globalRow = rows.find((row) => String(row.configKey || "") === SETTINGS_GLOBAL_KEY);
  if (!globalRow) return normalizeSettingsFunction(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(String(globalRow.configValue || "{}"));
    return normalizeSettingsFunction(parsed);
  } catch (error) {
    return normalizeSettingsFunction(DEFAULT_SETTINGS);
  }
};

const writeSettings = async (payload) => {
  if (!poolInstance || !normalizeSettingsFunction) {
    throw new Error("Pool or normalizeSettingsFunction not set. Call setPool() and setNormalizeSettingsFunction() first.");
  }
  const next = normalizeSettingsFunction(payload);
  const entries = flattenSettingEntries(next);
  if (entries.length > 0) {
    const placeholders = entries.map(() => "(?, ?)").join(", ");
    const values = entries.flat();
    await poolInstance.query(
      `INSERT INTO settings (config_key, config_value)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      values
    );
    const keys = entries.map((item) => item[0]);
    const keyPlaceholders = keys.map(() => "?").join(", ");
    await poolInstance.query(
      `DELETE FROM settings
       WHERE config_key = ?
          OR config_key NOT IN (${keyPlaceholders})`,
      [SETTINGS_GLOBAL_KEY, ...keys]
    );
  }
  return next;
};

module.exports = {
  setSettingsDbPool,
  setNormalizeSettingsFunction,
  isPlainObject,
  flattenSettingEntries,
  setByPath,
  parseSettingRowValue,
  buildSettingsFromRows,
  mergeUploadCategoryRulesByKey,
  mergeSettingsPayload,
  getAllowedMenusForUser,
  getMobileVisibleMenus,
  ensureSettingsTable,
  ensureSettingsDefaultRow,
  readSettings,
  writeSettings
};
