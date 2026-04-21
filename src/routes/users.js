module.exports = (app, deps) => {
  const {
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
    resolveAbsoluteStoragePath,
    fs,
    normalizeUserGroupUploadMaxSizeMb,
    normalizeUserGroupUploadMaxFileCount,
    convertUserGroupUploadSizeMbToGb,
    convertUserGroupUploadSizeGbToMb
  } = deps;

  // --- User Management APIs ---

  app.get("/api/users", authRequired, adminRequired, async (req, res) => {
    try {
      const { search } = req.query;
      let whereClause = "";
      let params = [];
      
      // 如果有搜索参数，添加 WHERE 条件
      if (search && search.trim()) {
        whereClause = " WHERE (u.username LIKE ? OR u.name LIKE ?)";
        const searchTerm = `%${search.trim()}%`;
        params = [searchTerm, searchTerm];
      }
      
      const [users] = await pool.query(`
      SELECT u.id, u.username, u.name, u.phone, u.quota_bytes AS quota, u.permissions, u.role, u.avatar, u.created_at,
      (SELECT IFNULL(SUM(size), 0) FROM files f WHERE f.user_id = u.id AND f.deleted_at IS NULL) AS used,
      (SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.deleted_at IS NULL) AS fileCount
      FROM users u${whereClause}
      ORDER BY u.created_at DESC
    `, params);
      const groupContextMap = await loadUserGroupContextMap(users.map((item) => item.id));
      const result = users.map((u) => {
        const groupContext = groupContextMap.get(Number(u.id)) || { groupIds: [], groupNames: [], groupPermissions: [], groupQuotas: [] };
        const effectivePermissionResult = getEffectivePermissions(u.permissions, groupContext.groupPermissions, groupContext.groupIds);
        
        // 计算有效配额：用户配额优先，否则使用用户组配额
        let effectiveQuota = Number(u.quota);
        if (effectiveQuota === -1 && groupContext.groupQuotas && groupContext.groupQuotas.length > 0) {
          // 用户未设置配额时，使用用户组的最小配额
          let minQuota = null;
          let hasUnlimited = false;
          groupContext.groupQuotas.forEach((gq) => {
            const quota = Number(gq.quotaBytes || -1);
            if (quota === -1) {
              hasUnlimited = true;
              return;
            }
            if (quota > 0 && (minQuota === null || quota < minQuota)) {
              minQuota = quota;
            }
          });
          if (minQuota !== null) {
            effectiveQuota = minQuota;
          } else if (hasUnlimited) {
            effectiveQuota = -1;
          }
        }
        
        return {
          ...u,
          permissions: parsePermissionList(u.permissions, { fallbackToAll: false }),
          effectivePermissions: effectivePermissionResult.permissions,
          permissionSource: effectivePermissionResult.source,
          groupIds: groupContext.groupIds,
          groupNames: groupContext.groupNames,
          quota: Number(u.quota),
          effectiveQuota: effectiveQuota,
          used: Number(u.used),
          fileCount: Number(u.fileCount)
        };
      });
      res.json(result);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/users", authRequired, adminRequired, async (req, res) => {
    const { username, password, name, phone, quota, permissions, role, avatar, groupIds } = req.body;
    if (!username || !password) {
      res.status(400).json({ message: "用户名和密码不能为空" });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: "密码至少 6 位" });
      return;
    }
    // 验证配额值：-1 表示不限制，其他值必须大于 0
    if (quota !== undefined && quota !== null && Number(quota) !== -1 && Number(quota) <= 0) {
      res.status(400).json({ message: "空间配额必须大于 0 或设置为 -1（不限制）" });
      return;
    }
    const normalizedGroupIds = normalizeIdList(groupIds);
    const normalizedPermissions = permissions === undefined
      ? null
      : permissions === null
        ? null
        : JSON.stringify(parsePermissionList(permissions, { fallbackToAll: false }));
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [existing] = await connection.query("SELECT id FROM users WHERE username = ?", [username]);
      if (existing.length > 0) {
        await connection.rollback();
        res.status(400).json({ message: "用户名已存在" });
        return;
      }
      if (normalizedGroupIds.length > 0) {
        const placeholders = normalizedGroupIds.map(() => "?").join(", ");
        const [groupRows] = await connection.query(`SELECT id FROM user_groups WHERE id IN (${placeholders})`, normalizedGroupIds);
        if (groupRows.length !== normalizedGroupIds.length) {
          await connection.rollback();
          res.status(400).json({ message: "用户组不存在" });
          return;
        }
      }
      const [insertResult] = await connection.query(
        "INSERT INTO users (username, password_hash, name, phone, quota_bytes, permissions, role, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          username,
          await hashPassword(password),
          name || null,
          phone || null,
          quota || -1,
          normalizedPermissions,
          role || "user",
          avatar || null
        ]
      );
      const userId = Number(insertResult.insertId);
      if (normalizedGroupIds.length > 0) {
        await insertUserGroupMembers(connection, userId, normalizedGroupIds);
      }
      await connection.commit();
      res.json({ message: "用户创建成功" });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  app.put("/api/users/:id", authRequired, adminRequired, async (req, res) => {
    const userId = Number(req.params.id);
    const { password, name, phone, quota, permissions, role, avatar, groupIds } = req.body;

    if (!userId) return res.status(400).json({ message: "ID 不合法" });

    // Protect default admin user (ID 1)
    if (userId === 1 && role !== undefined && role !== "admin") {
      return res.status(400).json({ message: "不能更改默认管理员的角色" });
    }
    if (password !== undefined && password !== "" && String(password).length < 6) {
      return res.status(400).json({ message: "密码至少 6 位" });
    }
    // 验证配额值：-1 表示不限制，其他值必须大于 0
    if (quota !== undefined && quota !== null && Number(quota) !== -1 && Number(quota) <= 0) {
      return res.status(400).json({ message: "空间配额必须大于 0 或设置为 -1（不限制）" });
    }

    const normalizedGroupIds = groupIds === undefined ? undefined : normalizeIdList(groupIds);
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const updates = [];
      const params = [];

      if (password) {
        updates.push("password_hash = ?");
        params.push(await hashPassword(password));
      }
      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }
      if (phone !== undefined) {
        updates.push("phone = ?");
        params.push(phone);
      }
      if (quota !== undefined) {
        updates.push("quota_bytes = ?");
        params.push(quota);
      }
      if (permissions !== undefined) {
        updates.push("permissions = ?");
        params.push(permissions === null ? null : JSON.stringify(parsePermissionList(permissions, { fallbackToAll: false })));
      }
      if (role !== undefined) {
        updates.push("role = ?");
        params.push(role);
      }
      if (avatar !== undefined) {
        updates.push("avatar = ?");
        params.push(avatar);
      }
      if (normalizedGroupIds !== undefined && normalizedGroupIds.length > 0) {
        const placeholders = normalizedGroupIds.map(() => "?").join(", ");
        const [groupRows] = await connection.query(`SELECT id FROM user_groups WHERE id IN (${placeholders})`, normalizedGroupIds);
        if (groupRows.length !== normalizedGroupIds.length) {
          await connection.rollback();
          return res.status(400).json({ message: "用户组不存在" });
        }
      }

      if (updates.length > 0) {
        params.push(userId);
        await connection.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
      }
      if (normalizedGroupIds !== undefined) {
        await connection.query("DELETE FROM user_group_members WHERE user_id = ?", [userId]);
        if (normalizedGroupIds.length > 0) {
          await insertUserGroupMembers(connection, userId, normalizedGroupIds);
        }
      }
      if (updates.length === 0 && normalizedGroupIds === undefined) {
        await connection.rollback();
        return res.json({ message: "无变更" });
      }

      await connection.commit();
      res.json({ message: "更新成功" });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  app.delete("/api/users/:id", authRequired, adminRequired, async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ message: "ID不合法" });

    if (userId === 1) {
      return res.status(400).json({ message: "不能删除默认管理员账号" });
    }

    try {
      const [files] = await pool.query("SELECT storage_name, thumbnail_storage_name, space_type FROM files WHERE user_id = ? AND deleted_at IS NULL", [userId]);
      await pool.query("DELETE FROM files WHERE user_id = ? AND deleted_at IS NULL", [userId]);
      await pool.query("DELETE FROM folders WHERE user_id = ? AND deleted_at IS NULL", [userId]);
      await pool.query("DELETE FROM shares WHERE user_id = ?", [userId]);
      await pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
      await pool.query("DELETE FROM user_group_members WHERE user_id = ?", [userId]);
      await pool.query("DELETE FROM users WHERE id = ?", [userId]);

      files.forEach((f) => {
        try {
          const targetPath = resolveAbsoluteStoragePath(f.storage_name, f.space_type);
          if (targetPath) fs.unlinkSync(targetPath);
          if (f.thumbnail_storage_name) {
            const thumbnailPath = resolveAbsoluteStoragePath(f.thumbnail_storage_name, f.space_type);
            if (thumbnailPath && fs.existsSync(thumbnailPath)) {
              fs.unlinkSync(thumbnailPath);
            }
          }
        } catch (e) {}
      });

      res.json({ message: "用户已删除" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/user-groups", authRequired, adminRequired, async (_req, res) => {
    try {
      const [groups] = await pool.query(`
      SELECT g.id, g.name, g.permissions, g.created_at,
      g.max_upload_size_mb AS maxUploadSizeMb,
      g.max_upload_file_count AS maxUploadFileCount,
      g.quota_bytes AS quotaBytes,
      (SELECT COUNT(*) FROM user_group_members m WHERE m.group_id = g.id) AS memberCount
      FROM user_groups g
      ORDER BY g.id ASC
    `);
      res.json(
        groups.map((group) => ({
          id: Number(group.id),
          name: group.name,
          permissions: parsePermissionList(group.permissions, { fallbackToAll: false }),
          maxUploadSizeMb: normalizeUserGroupUploadMaxSizeMb(group.maxUploadSizeMb),
          maxUploadSizeGb: convertUserGroupUploadSizeMbToGb(group.maxUploadSizeMb),
          maxUploadFileCount: normalizeUserGroupUploadMaxFileCount(group.maxUploadFileCount),
          quotaBytes: Number(group.quotaBytes || -1),
          memberCount: Number(group.memberCount || 0)
        }))
      );
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/user-groups", authRequired, adminRequired, async (req, res) => {
    const name = String(req.body && req.body.name || "").trim();
    const permissions = parsePermissionList(req.body && req.body.permissions, { fallbackToAll: false });
    const maxUploadSizeMb = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadSizeGb")
      ? convertUserGroupUploadSizeGbToMb(req.body.maxUploadSizeGb)
      : normalizeUserGroupUploadMaxSizeMb(req.body && req.body.maxUploadSizeMb);
    const maxUploadFileCount = normalizeUserGroupUploadMaxFileCount(req.body && req.body.maxUploadFileCount);
    const quotaBytes = req.body && req.body.quotaBytes !== undefined ? Number(req.body.quotaBytes) : -1;
    if (!name) {
      res.status(400).json({ message: "用户组名称不能为空" });
      return;
    }
    try {
      const [existing] = await pool.query("SELECT id FROM user_groups WHERE name = ? LIMIT 1", [name]);
      if (existing.length > 0) {
        res.status(400).json({ message: "用户组名称已存在" });
        return;
      }
      await pool.query(
        "INSERT INTO user_groups (name, permissions, max_upload_size_mb, max_upload_file_count, quota_bytes) VALUES (?, ?, ?, ?, ?)",
        [name, JSON.stringify(permissions), maxUploadSizeMb, maxUploadFileCount, quotaBytes]
      );
      res.json({ message: "用户组创建成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/user-groups/:id", authRequired, adminRequired, async (req, res) => {
    const groupId = Number(req.params.id);
    if (!groupId) {
      res.status(400).json({ message: "用户组 ID 不合法" });
      return;
    }
    const name = req.body && req.body.name !== undefined ? String(req.body.name || "").trim() : undefined;
    const permissions = req.body && req.body.permissions !== undefined
      ? parsePermissionList(req.body.permissions, { fallbackToAll: false })
      : undefined;
    const hasMaxUploadSizeMb = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadSizeMb");
    const hasMaxUploadSizeGb = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadSizeGb");
    const hasMaxUploadFileCount = req.body && Object.prototype.hasOwnProperty.call(req.body, "maxUploadFileCount");
    const hasQuotaBytes = req.body && Object.prototype.hasOwnProperty.call(req.body, "quotaBytes");
    const maxUploadSizeMb = hasMaxUploadSizeGb
      ? convertUserGroupUploadSizeGbToMb(req.body.maxUploadSizeGb)
      : hasMaxUploadSizeMb
        ? normalizeUserGroupUploadMaxSizeMb(req.body.maxUploadSizeMb)
        : undefined;
    const maxUploadFileCount = hasMaxUploadFileCount
      ? normalizeUserGroupUploadMaxFileCount(req.body.maxUploadFileCount)
      : undefined;
    const quotaBytes = hasQuotaBytes ? Number(req.body.quotaBytes) : undefined;
    if (name !== undefined && !name) {
      res.status(400).json({ message: "用户组名称不能为空" });
      return;
    }
    try {
      if (name !== undefined) {
        const [existing] = await pool.query("SELECT id FROM user_groups WHERE name = ? AND id <> ? LIMIT 1", [name, groupId]);
        if (existing.length > 0) {
          res.status(400).json({ message: "用户组名称已存在" });
          return;
        }
      }
      const updates = [];
      const params = [];
      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }
      if (permissions !== undefined) {
        updates.push("permissions = ?");
        params.push(JSON.stringify(permissions));
      }
      if (maxUploadSizeMb !== undefined) {
        updates.push("max_upload_size_mb = ?");
        params.push(maxUploadSizeMb);
      }
      if (maxUploadFileCount !== undefined) {
        updates.push("max_upload_file_count = ?");
        params.push(maxUploadFileCount);
      }
      if (quotaBytes !== undefined) {
        updates.push("quota_bytes = ?");
        params.push(quotaBytes);
      }
      if (updates.length === 0) {
        res.json({ message: "无变更" });
        return;
      }
      params.push(groupId);
      const [result] = await pool.query(`UPDATE user_groups SET ${updates.join(", ")} WHERE id = ?`, params);
      if (!result.affectedRows) {
        res.status(404).json({ message: "用户组不存在" });
        return;
      }
      res.json({ message: "用户组更新成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.delete("/api/user-groups/:id", authRequired, adminRequired, async (req, res) => {
    const groupId = Number(req.params.id);
    if (!groupId) {
      res.status(400).json({ message: "用户组ID不合法" });
      return;
    }
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query("DELETE FROM user_group_members WHERE group_id = ?", [groupId]);
      const [result] = await connection.query("DELETE FROM user_groups WHERE id = ?", [groupId]);
      if (!result.affectedRows) {
        await connection.rollback();
        res.status(404).json({ message: "用户组不存在" });
        return;
      }
      await connection.commit();
      res.json({ message: "用户组删除成功" });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (e) {}
      }
      sendDbError(res, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
};
