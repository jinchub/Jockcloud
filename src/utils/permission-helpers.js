const { ALL_FILE_PERMISSIONS, FILE_PERMISSION_SET } = require("./constants");

const parsePermissionList = (raw, { fallbackToAll = true } = {}) => {
  if (raw === null || raw === undefined || raw === "") {
    return fallbackToAll ? ALL_FILE_PERMISSIONS.slice() : [];
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return fallbackToAll ? ALL_FILE_PERMISSIONS.slice() : [];
    return parsed.filter((item) => FILE_PERMISSION_SET.has(String(item)));
  } catch (error) {
    return fallbackToAll ? ALL_FILE_PERMISSIONS.slice() : [];
  }
};

const normalizeIdList = (value) => {
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

const hasExplicitPermissionConfig = (raw) => raw !== null && raw !== undefined && raw !== "";

const getEffectivePermissions = (userPermissionRaw, groupPermissions = [], groupIds = []) => {
  const mergedGroupPermissions = new Set();
  groupPermissions.forEach((permissions) => {
    parsePermissionList(permissions, { fallbackToAll: false }).forEach((permission) => {
      mergedGroupPermissions.add(permission);
    });
  });
  
  let finalPermissions;
  let source;
  
  if (mergedGroupPermissions.size > 0) {
    finalPermissions = Array.from(mergedGroupPermissions);
    source = "group";
  } else {
    finalPermissions = ALL_FILE_PERMISSIONS.slice();
    source = "default";
  }
  
  return {
    permissions: finalPermissions,
    source
  };
};

const hasFilePermission = (req, permission) => {
  if (!FILE_PERMISSION_SET.has(permission)) return true;
  if (!req || !req.user) return false;
  const permissions = Array.isArray(req.user.permissions)
    ? req.user.permissions
    : parsePermissionList(req.user.permissions);
  return permissions.includes(permission);
};

const requireFilePermission = (permission) => (req, res, next) => {
  if (hasFilePermission(req, permission)) {
    next();
    return;
  }
  res.status(403).json({ message: "无权执行该操作" });
};

module.exports = {
  parsePermissionList,
  normalizeIdList,
  hasExplicitPermissionConfig,
  getEffectivePermissions,
  hasFilePermission,
  requireFilePermission
};
