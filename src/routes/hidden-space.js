module.exports = (app, deps) => {
  const {
    authRequired,
    pool,
    sendDbError,
    hashPassword,
    verifyPassword,
    readSettings,
    isSmsConfigComplete,
    normalizePhone,
    getSmsPolicyConfig,
    smsCodeStore,
    smsIpRateStore,
    SMS_CODE_EXPIRE_MS,
    dispatchSmsCode,
    logInfo,
    logError,
    verifySmsCode
  } = deps;

  app.get("/api/hidden-space/status", authRequired, async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT hidden_space_enabled AS enabled FROM users WHERE id = ? LIMIT 1", [req.user.userId]);
      const enabled = rows.length > 0 && Number(rows[0].enabled || 0) === 1;
      res.json({ enabled });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/hidden-space/setup", authRequired, async (req, res) => {
    const password = String(req.body && req.body.password || "").trim();
    if (password.length < 4) {
      res.status(400).json({ message: "安全密码至少4位" });
      return;
    }
    try {
      const [rows] = await pool.query("SELECT hidden_space_enabled AS enabled FROM users WHERE id = ? LIMIT 1", [req.user.userId]);
      if (rows.length === 0) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }
      if (Number(rows[0].enabled || 0) === 1) {
        res.status(400).json({ message: "隐藏空间已开通" });
        return;
      }
      const passwordHash = await hashPassword(password);
      await pool.query(
        "UPDATE users SET hidden_space_enabled = 1, hidden_space_password_hash = ? WHERE id = ?",
        [passwordHash, req.user.userId]
      );
      res.json({ message: "隐藏空间开通成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/hidden-space/verify", authRequired, async (req, res) => {
    const password = String(req.body && req.body.password || "").trim();
    if (!password) {
      res.status(400).json({ message: "请输入安全密码" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT hidden_space_enabled AS enabled, hidden_space_password_hash AS passwordHash FROM users WHERE id = ? LIMIT 1",
        [req.user.userId]
      );
      if (rows.length === 0 || Number(rows[0].enabled || 0) !== 1) {
        res.status(400).json({ message: "隐藏空间未开通" });
        return;
      }
      const passwordVerified = await verifyPassword(password, rows[0].passwordHash);
      if (!passwordVerified) {
        res.status(403).json({ message: "安全密码错误" });
        return;
      }
      res.json({ message: "验证成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/hidden-space/reset-password", authRequired, async (req, res) => {
    const oldPassword = String(req.body && req.body.oldPassword || "").trim();
    const newPassword = String(req.body && req.body.newPassword || "").trim();
    if (!oldPassword) {
      res.status(400).json({ message: "请输入登录密码" });
      return;
    }
    if (newPassword.length < 4) {
      res.status(400).json({ message: "新密码至少4位" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT hidden_space_enabled AS enabled, password_hash AS loginPasswordHash FROM users WHERE id = ? LIMIT 1",
        [req.user.userId]
      );
      if (rows.length === 0 || Number(rows[0].enabled || 0) !== 1) {
        res.status(400).json({ message: "隐藏空间未开通" });
        return;
      }
      const oldPasswordVerified = await verifyPassword(oldPassword, rows[0].loginPasswordHash);
      if (!oldPasswordVerified) {
        res.status(403).json({ message: "登录密码错误" });
        return;
      }
      const newPasswordHash = await hashPassword(newPassword);
      await pool.query("UPDATE users SET hidden_space_password_hash = ? WHERE id = ? LIMIT 1", [newPasswordHash, req.user.userId]);
      res.json({ message: "隐私空间密码重置成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.post("/api/hidden-space/reset-password/send-code", authRequired, async (req, res) => {
    try {
      const settings = await readSettings();
      if (!isSmsConfigComplete(settings.login)) {
        res.status(400).json({ message: "短信配置不完整" });
        return;
      }
      const [rows] = await pool.query(
        "SELECT hidden_space_enabled AS enabled, phone FROM users WHERE id = ? LIMIT 1",
        [req.user.userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }
      if (Number(rows[0].enabled || 0) !== 1) {
        res.status(400).json({ message: "隐藏空间未开通" });
        return;
      }
      const phone = normalizePhone(rows[0].phone);
      if (!/^1\d{10}$/.test(phone)) {
        res.status(400).json({ message: "当前账号未绑定有效手机号" });
        return;
      }
      const smsPolicy = getSmsPolicyConfig(settings.login);
      const now = Date.now();
      const existing = smsCodeStore.get(phone);
      if (existing && existing.sentAt && now - existing.sentAt < smsPolicy.sendIntervalMs) {
        res.status(429).json({ message: "发送过于频繁，请稍后再试" });
        return;
      }
      const ipKey = String(req.ip || "").trim() || "unknown";
      const ipRateItem = smsIpRateStore.get(ipKey) || { windowMs: smsPolicy.ipLimitWindowMs, timestamps: [] };
      const recentTimestamps = (Array.isArray(ipRateItem.timestamps) ? ipRateItem.timestamps : []).filter((ts) => now - ts <= smsPolicy.ipLimitWindowMs);
      if (recentTimestamps.length >= smsPolicy.ipLimitMaxCount) {
        res.status(429).json({ message: "该时段请求次数过多，请稍后再试" });
        return;
      }
      recentTimestamps.push(now);
      smsIpRateStore.set(ipKey, { windowMs: smsPolicy.ipLimitWindowMs, timestamps: recentTimestamps });
      smsCodeStore.set(phone, {
        sentAt: now,
        expiresAt: now + SMS_CODE_EXPIRE_MS
      });
      const sendResult = await dispatchSmsCode({ loginSettings: settings.login, phone });
      logInfo("隐私空间重置密码短信验证码已发送", { phone, bizId: sendResult.bizId || "", sendIntervalSeconds: Math.floor(smsPolicy.sendIntervalMs / 1000) });
      res.json({ message: "验证码已发送", sendIntervalSeconds: Math.floor(smsPolicy.sendIntervalMs / 1000) });
    } catch (error) {
      if (error && error.message === "阿里云短信发送失败") {
        const smsProviderCode = error.smsProviderCode ? String(error.smsProviderCode) : "";
        const smsProviderMessage = error.smsProviderMessage ? String(error.smsProviderMessage) : "";
        logError("隐私空间重置密码短信发送失败", { userId: req.user.userId, smsProviderCode, smsProviderMessage });
        if (smsProviderCode === "biz.FREQUENCY") {
          res.status(429).json({ message: "发送过于频繁，请稍后再试" });
          return;
        }
        const detail = [smsProviderCode, smsProviderMessage].filter(Boolean).join(" ");
        res.status(502).json({ message: detail ? `阿里云短信发送失败：${detail}` : "阿里云短信发送失败" });
        return;
      }
      sendDbError(res, error);
    }
  });

  app.post("/api/hidden-space/reset-password/by-sms", authRequired, async (req, res) => {
    const code = String(req.body && req.body.code || "").trim();
    const newPassword = String(req.body && req.body.newPassword || "").trim();
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ message: "短信验证码不正确" });
      return;
    }
    if (newPassword.length < 4) {
      res.status(400).json({ message: "新密码至少4位" });
      return;
    }
    try {
      const settings = await readSettings();
      if (!isSmsConfigComplete(settings.login)) {
        res.status(400).json({ message: "短信配置不完整" });
        return;
      }
      const [rows] = await pool.query(
        "SELECT hidden_space_enabled AS enabled, phone FROM users WHERE id = ? LIMIT 1",
        [req.user.userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }
      if (Number(rows[0].enabled || 0) !== 1) {
        res.status(400).json({ message: "隐藏空间未开通" });
        return;
      }
      const phone = normalizePhone(rows[0].phone);
      if (!/^1\d{10}$/.test(phone)) {
        res.status(400).json({ message: "当前账号未绑定有效手机号" });
        return;
      }
      await verifySmsCode({ loginSettings: settings.login, phone, verifyCode: code });
      const newPasswordHash = await hashPassword(newPassword);
      await pool.query("UPDATE users SET hidden_space_password_hash = ? WHERE id = ? LIMIT 1", [newPasswordHash, req.user.userId]);
      smsCodeStore.delete(phone);
      res.json({ message: "隐私空间密码重置成功" });
    } catch (error) {
      if (error && error.message === "短信验证码校验失败") {
        const smsProviderCode = error.smsProviderCode ? String(error.smsProviderCode) : "";
        const smsProviderMessage = error.smsProviderMessage ? String(error.smsProviderMessage) : "";
        logError("隐私空间重置密码短信验证码校验失败", { userId: req.user.userId, smsProviderCode, smsProviderMessage });
        res.status(400).json({ message: "短信验证码错误或已过期" });
        return;
      }
      sendDbError(res, error);
    }
  });
};
