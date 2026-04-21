module.exports = (app, deps) => {
  const {
    authRequired,
    pool,
    sendDbError,
    loadUserGroupContextMap,
    getEffectivePermissions,
    parsePermissionList,
    resolveGroupUploadMaxSizeMb,
    resolveGroupUploadMaxFileCount,
    readSettings,
    getAllowedMenusForUser,
    getMobileVisibleMenus,
    MENU_PERMISSION_KEYS,
    normalizeViewMode,
    normalizeGridSize,
    normalizeVisibleCategories,
    normalizeUserGroupUploadMaxSizeMb,
    normalizeUserGroupUploadMaxFileCount,
    normalizePhone,
    hashPassword,
    avatarUploadSingle,
    path,
    UPLOAD_DIR,
    crypto,
    fs,
    getAvatarStorageDir,
    normalizeStorageRelativePath
  } = deps;

  app.get("/api/auth/me", authRequired, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT id, username, name, phone, permissions, role, avatar, view_mode AS viewMode, grid_size AS gridSize, visible_categories AS visibleCategories FROM users WHERE id = ?", [req.user.userId]);
      if (rows.length > 0) {
        const row = rows[0];
        const groupContextMap = await loadUserGroupContextMap([req.user.userId]);
        const groupContext = groupContextMap.get(Number(req.user.userId)) || { groupIds: [], groupNames: [], groupPermissions: [], groupUploadLimits: [], groupUploadCountLimits: [] };
        const effectivePermissions = getEffectivePermissions(row.permissions, groupContext.groupPermissions, groupContext.groupIds);
        const groupUploadMaxSizeMb = resolveGroupUploadMaxSizeMb(groupContext.groupUploadLimits);
        const groupUploadMaxFileCount = resolveGroupUploadMaxFileCount(groupContext.groupUploadCountLimits);
        req.user = {
          ...req.user,
          ...row,
          permissions: effectivePermissions.permissions,
          userPermissions: parsePermissionList(row.permissions, { fallbackToAll: false }),
          permissionSource: effectivePermissions.source,
          groupIds: groupContext.groupIds,
          groupNames: groupContext.groupNames,
          groupUploadMaxSizeMb,
          groupUploadMaxFileCount
        };
      }
    } catch(e) {}
    let allowedMenus = MENU_PERMISSION_KEYS.slice();
    let mobileVisibleMenus = MENU_PERMISSION_KEYS.slice();
    try {
      const settings = await readSettings();
      allowedMenus = getAllowedMenusForUser(settings, req.user);
      mobileVisibleMenus = getMobileVisibleMenus(settings);
    } catch (e) {}
    res.json({ 
      id: req.user.userId, 
      username: req.user.username,
      name: req.user.name,
      phone: req.user.phone || "",
      role: req.user.role || "user",
      avatar: req.user.avatar || "",
      viewMode: normalizeViewMode(req.user.viewMode),
      gridSize: normalizeGridSize(req.user.gridSize),
      visibleCategories: normalizeVisibleCategories(req.user.visibleCategories),
      timelineEnabled: req.user.viewMode === "timeline",
      permissions: Array.isArray(req.user.permissions) ? req.user.permissions : parsePermissionList(req.user.permissions),
      userPermissions: Array.isArray(req.user.userPermissions) ? req.user.userPermissions : [],
      permissionSource: req.user.permissionSource || "default",
      groupIds: Array.isArray(req.user.groupIds) ? req.user.groupIds : [],
      groupNames: Array.isArray(req.user.groupNames) ? req.user.groupNames : [],
      groupUploadMaxSizeMb: normalizeUserGroupUploadMaxSizeMb(req.user.groupUploadMaxSizeMb),
      groupUploadMaxFileCount: normalizeUserGroupUploadMaxFileCount(req.user.groupUploadMaxFileCount),
      allowedMenus,
      mobileVisibleMenus
    });
  });

  app.put("/api/auth/view-preference", authRequired, async (req, res) => {
    const viewMode = normalizeViewMode(req.body && req.body.viewMode);
    const gridSize = normalizeGridSize(req.body && req.body.gridSize);
    try {
      await pool.query("UPDATE users SET view_mode = ?, grid_size = ? WHERE id = ?", [viewMode, gridSize, req.user.userId]);
      res.json({ message: "视图偏好已保存", viewMode, gridSize });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/auth/category-visibility", authRequired, async (req, res) => {
    const visibleCategories = normalizeVisibleCategories(req.body && req.body.visibleCategories);
    try {
      await pool.query("UPDATE users SET visible_categories = ? WHERE id = ?", [JSON.stringify(visibleCategories), req.user.userId]);
      res.json({ message: "分类显示偏好已保存", visibleCategories });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/auth/timeline-preference", authRequired, async (req, res) => {
    const timelineEnabled = req.body && req.body.timelineEnabled !== undefined ? Boolean(req.body.timelineEnabled) : true;
    try {
      const viewMode = timelineEnabled ? "timeline" : "list";
      await pool.query("UPDATE users SET view_mode = ? WHERE id = ?", [viewMode, req.user.userId]);
      res.json({ message: "时光轴模式偏好已保存", timelineEnabled });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/auth/profile", authRequired, async (req, res) => {
    const name = req.body && req.body.name !== undefined ? String(req.body.name || "").trim() : undefined;
    const avatar = req.body && req.body.avatar !== undefined ? String(req.body.avatar || "").trim() : undefined;
    const password = req.body && req.body.password !== undefined ? String(req.body.password || "") : undefined;
    const phoneRaw = req.body && req.body.phone !== undefined ? String(req.body.phone || "") : undefined;
    let phone;
    if (phoneRaw !== undefined) {
      if (phoneRaw.trim() === "") {
        phone = null;
      } else {
        phone = normalizePhone(phoneRaw);
        if (!/^1\d{10}$/.test(phone)) {
          res.status(400).json({ message: "手机号格式不正确" });
          return;
        }
      }
    }
    if (password !== undefined && password !== "" && String(password).length < 6) {
      res.status(400).json({ message: "密码至少6位" });
      return;
    }

    try {
      const updates = [];
      const params = [];
      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name || null);
      }
      if (phoneRaw !== undefined) {
        updates.push("phone = ?");
        params.push(phone);
      }
      if (avatar !== undefined) {
        updates.push("avatar = ?");
        params.push(avatar || null);
      }
      if (password !== undefined && password !== "") {
        updates.push("password_hash = ?");
        const passwordHash = await hashPassword(password);
        params.push(passwordHash);
      }
      if (updates.length === 0) {
        res.json({ message: "无变更" });
        return;
      }
      params.push(req.user.userId);
      await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
      res.json({ message: "更新成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/auth/avatar", authRequired, avatarUploadSingle("avatar"), async (req, res) => {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ message: "请选择头像图片" });
      return;
    }
    const mimeToExtMap = {
      "image/jpeg": ".jpg",
      "image/pjpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/bmp": ".bmp",
      "image/x-ms-bmp": ".bmp",
      "image/gif": ".gif"
    };
    const ext = mimeToExtMap[String(req.file.mimetype || "").toLowerCase()] || ".png";
    const avatarRelativeDir = getAvatarStorageDir(req.user);
    const avatarDir = path.join(UPLOAD_DIR, avatarRelativeDir);
    const avatarFileName = `avatar-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    const avatarRelativePath = normalizeStorageRelativePath(path.posix.join(avatarRelativeDir, avatarFileName));
    const avatarAbsolutePath = path.join(UPLOAD_DIR, avatarRelativePath);
    try {
      fs.mkdirSync(avatarDir, { recursive: true });
      fs.writeFileSync(avatarAbsolutePath, req.file.buffer);
      const [rows] = await pool.query("SELECT avatar FROM users WHERE id = ? LIMIT 1", [req.user.userId]);
      const oldAvatar = rows.length > 0 ? String(rows[0].avatar || "") : "";
      await pool.query("UPDATE users SET avatar = ? WHERE id = ?", [`/uploads/${avatarRelativePath}`, req.user.userId]);
      if (oldAvatar.startsWith("/uploads/avatar/")) {
        const oldRelativePath = normalizeStorageRelativePath(oldAvatar.replace(/^\/?uploads\/?/, ""));
        if (oldRelativePath && oldRelativePath !== avatarRelativePath) {
          const oldAbsolutePath = path.join(UPLOAD_DIR, oldRelativePath);
          if (fs.existsSync(oldAbsolutePath)) {
            fs.unlinkSync(oldAbsolutePath);
          }
        }
      }
      res.json({ message: "头像更新成功", avatar: `/uploads/${avatarRelativePath}` });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
