const parseCookies = (req) => {
  const header = (req && req.headers && req.headers.cookie) || "";
  const pairs = header.split(";").map((part) => part.trim()).filter(Boolean);
  const result = {};
  pairs.forEach((pair) => {
    const index = pair.indexOf("=");
    if (index > 0) {
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      result[key] = decodeURIComponent(value);
    }
  });
  return result;
};

const createAuthMiddlewares = ({
  SESSION_COOKIE,
  pool,
  loadUserGroupContextMap,
  getEffectivePermissions,
  parsePermissionList,
  resolveGroupUploadMaxSizeMb,
  resolveGroupUploadMaxFileCount,
  sendDbError
}) => {
  const authRequired = async (req, res, next) => {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) {
      res.status(401).json({ message: "未登录" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT s.id, s.user_id AS userId, u.username, u.permissions, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > NOW() LIMIT 1",
        [token]
      );
      if (rows.length === 0) {
        res.status(401).json({ message: "登录已过期" });
        return;
      }
      const row = rows[0];
      const groupContextMap = await loadUserGroupContextMap([row.userId]);
      const groupContext = groupContextMap.get(Number(row.userId)) || {
        groupIds: [],
        groupNames: [],
        groupPermissions: [],
        groupUploadLimits: [],
        groupUploadCountLimits: []
      };
      const effectivePermissions = getEffectivePermissions(row.permissions, groupContext.groupPermissions, groupContext.groupIds);
      const groupUploadMaxSizeMb = resolveGroupUploadMaxSizeMb(groupContext.groupUploadLimits);
      const groupUploadMaxFileCount = resolveGroupUploadMaxFileCount(groupContext.groupUploadCountLimits);
      req.sessionToken = token;
      req.user = {
        ...row,
        permissions: effectivePermissions.permissions,
        userPermissions: parsePermissionList(row.permissions, { fallbackToAll: false }),
        permissionSource: effectivePermissions.source,
        groupIds: groupContext.groupIds,
        groupNames: groupContext.groupNames,
        groupUploadMaxSizeMb,
        groupUploadMaxFileCount
      };

      try {
        await pool.query(
          "UPDATE users SET updated_at = NOW() WHERE id = ?",
          [row.userId]
        );
      } catch (updateError) {
        console.error("Failed to update user activity time:", updateError);
      }

      next();
    } catch (error) {
      sendDbError(res, error);
    }
  };

  const adminRequired = async (req, res, next) => {
    if (req.user.role === "admin") {
      next();
      return;
    }
    res.status(403).json({ message: "无权访问" });
  };

  return {
    authRequired,
    adminRequired
  };
};

module.exports = {
  createAuthMiddlewares
};
