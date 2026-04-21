module.exports = (app, deps) => {
  const {
    authRequired,
    pool,
    readSettings,
    verifyCaptcha,
    hashPassword,
    verifyPassword,
    createLoginSession,
    sendDbError,
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
    LOGIN_PASSWORD_KEY_PAIR
  } = deps;

  app.post("/api/auth/login", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const encryptedPassword = String(req.body.encryptedPassword || "").trim();
    const passwordKeyId = String(req.body.passwordKeyId || "").trim();
    let password = "";
    if (!username) {
      res.status(400).json({ message: "用户名和密码不能为空" });
      return;
    }
    if (!encryptedPassword || !passwordKeyId || passwordKeyId !== LOGIN_PASSWORD_KEY_ID) {
      res.status(428).json({
        message: "请先使用公钥加密密码后再登录",
        requireEncryptedPassword: true,
        keyId: LOGIN_PASSWORD_KEY_ID,
        algorithm: "RSA-OAEP",
        hash: "SHA-256",
        publicKey: LOGIN_PASSWORD_KEY_PAIR.publicKey
      });
      return;
    }
    try {
      password = decryptLoginPassword(encryptedPassword);
    } catch (error) {
      res.status(400).json({ message: error.message || "密码解密失败" });
      return;
    }
    if (!username || !password) {
      res.status(400).json({ message: "用户名和密码不能为空" });
      return;
    }
    try {
      const settings = await readSettings();
      if (settings.login.loginCaptchaEnabled) {
        const captchaId = String(req.body.captchaId || "").trim();
        const captchaCode = String(req.body.captchaCode || "").trim();
        if (!verifyCaptcha(captchaId, captchaCode)) {
          res.status(400).json({ message: "验证码错误或已过期" });
          return;
        }
      }
      const [rows] = await pool.query(
        "SELECT id, username, permissions, password_hash FROM users WHERE username = ? LIMIT 1",
        [username]
      );
      if (rows.length === 0 || !(await verifyPassword(password, rows[0].password_hash))) {
        res.status(401).json({ message: "账号或密码错误" });
        return;
      }
      const loginSessionMinutes = await createLoginSession(rows[0].id, res);
      res.json({ message: "登录成功", loginSessionMinutes });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.get("/api/auth/captcha", async (_req, res) => {
    const captcha = generateCaptcha();
    res.json({
      captchaId: captcha.captchaId,
      captchaSvg: captcha.captchaSvg,
      expiresInSeconds: captcha.expiresInSeconds
    });
  });

  app.post("/api/auth/password-reset/send-code", async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    if (!/^1\d{10}$/.test(phone)) {
      res.status(400).json({ message: "手机号格式不正确" });
      return;
    }
    try {
      const settings = await readSettings();
      if (!isSmsConfigComplete(settings.login)) {
        res.status(400).json({ message: "短信配置不完整" });
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
      const [userRows] = await pool.query("SELECT id FROM users WHERE phone = ? LIMIT 2", [phone]);
      if (userRows.length === 0) {
        res.status(404).json({ message: "手机号未绑定账号" });
        return;
      }
      if (userRows.length > 1) {
        res.status(400).json({ message: "手机号绑定多个账号，请联系管理员处理" });
        return;
      }
      smsCodeStore.set(phone, {
        sentAt: now,
        expiresAt: now + SMS_CODE_EXPIRE_MS
      });
      const sendResult = await dispatchSmsCode({ loginSettings: settings.login, phone });
      logInfo("重置密码短信验证码已发送", { phone, bizId: sendResult.bizId || "", sendIntervalSeconds: Math.floor(smsPolicy.sendIntervalMs / 1000) });
      res.json({ message: "验证码已发送", sendIntervalSeconds: Math.floor(smsPolicy.sendIntervalMs / 1000) });
    } catch (error) {
      if (error && error.message === "阿里云短信发送失败") {
        const smsProviderCode = error.smsProviderCode ? String(error.smsProviderCode) : "";
        const smsProviderMessage = error.smsProviderMessage ? String(error.smsProviderMessage) : "";
        logError("重置密码短信发送失败", { phone, smsProviderCode, smsProviderMessage });
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

  app.post("/api/auth/password-reset/reset", async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.newPassword || "");
    if (!/^1\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ message: "手机号或验证码不正确" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ message: "新密码至少6位" });
      return;
    }
    try {
      const settings = await readSettings();
      if (!isSmsConfigComplete(settings.login)) {
        res.status(400).json({ message: "短信配置不完整" });
        return;
      }
      await verifySmsCode({ loginSettings: settings.login, phone, verifyCode: code });
      const [rows] = await pool.query("SELECT id FROM users WHERE phone = ? LIMIT 2", [phone]);
      if (rows.length === 0) {
        res.status(404).json({ message: "手机号未绑定账号" });
        return;
      }
      if (rows.length > 1) {
        res.status(400).json({ message: "手机号绑定多个账号，请联系管理员处理" });
        return;
      }
      await pool.query("UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1", [await hashPassword(newPassword), rows[0].id]);
      smsCodeStore.delete(phone);
      res.json({ message: "密码重置成功，请重新登录" });
    } catch (error) {
      if (error && error.message === "短信验证码校验失败") {
        const smsProviderCode = error.smsProviderCode ? String(error.smsProviderCode) : "";
        const smsProviderMessage = error.smsProviderMessage ? String(error.smsProviderMessage) : "";
        logError("重置密码短信验证码校验失败", { phone, smsProviderCode, smsProviderMessage });
        res.status(400).json({ message: "短信验证码错误或已过期" });
        return;
      }
      sendDbError(res, error);
    }
  });

  app.post("/api/auth/sms/send-code", async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    if (!/^1\d{10}$/.test(phone)) {
      res.status(400).json({ message: "手机号格式不正确" });
      return;
    }
    try {
      const settings = await readSettings();
      if (!settings.login.smsLoginEnabled) {
        res.status(403).json({ message: "短信登录未启用" });
        return;
      }
      if (settings.login.loginCaptchaEnabled) {
        const captchaId = String(req.body.captchaId || "").trim();
        const captchaCode = String(req.body.captchaCode || "").trim();
        if (!verifyCaptcha(captchaId, captchaCode)) {
          res.status(400).json({ message: "验证码错误或已过期" });
          return;
        }
      }
      if (!isSmsConfigComplete(settings.login)) {
        res.status(400).json({ message: "短信配置不完整" });
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
      const [userRows] = await pool.query("SELECT id FROM users WHERE phone = ? LIMIT 1", [phone]);
      if (userRows.length === 0) {
        res.status(404).json({ message: "手机号未绑定账号" });
        return;
      }
      smsCodeStore.set(phone, {
        sentAt: now,
        expiresAt: now + SMS_CODE_EXPIRE_MS
      });
      const sendResult = await dispatchSmsCode({ loginSettings: settings.login, phone });
      logInfo("短信验证码已发送", { phone, bizId: sendResult.bizId || "", sendIntervalSeconds: Math.floor(smsPolicy.sendIntervalMs / 1000) });
      res.json({ message: "验证码已发送", sendIntervalSeconds: Math.floor(smsPolicy.sendIntervalMs / 1000) });
    } catch (error) {
      if (error && error.message === "阿里云短信发送失败") {
        const smsProviderCode = error.smsProviderCode ? String(error.smsProviderCode) : "";
        const smsProviderMessage = error.smsProviderMessage ? String(error.smsProviderMessage) : "";
        logError("阿里云短信发送失败", { phone, smsProviderCode, smsProviderMessage });
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

  app.post("/api/auth/sms/login", async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || "").trim();
    if (!/^1\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ message: "手机号或验证码不正确" });
      return;
    }
    try {
      const settings = await readSettings();
      if (!settings.login.smsLoginEnabled) {
        res.status(403).json({ message: "短信登录未启用" });
        return;
      }
      if (!isSmsConfigComplete(settings.login)) {
        res.status(400).json({ message: "短信配置不完整" });
        return;
      }
      await verifySmsCode({ loginSettings: settings.login, phone, verifyCode: code });
      const [rows] = await pool.query("SELECT id FROM users WHERE phone = ? LIMIT 2", [phone]);
      if (rows.length === 0) {
        res.status(404).json({ message: "手机号未绑定账号" });
        return;
      }
      if (rows.length > 1) {
        res.status(400).json({ message: "手机号绑定多个账号，请联系管理员处理" });
        return;
      }
      smsCodeStore.delete(phone);
      const loginSessionMinutes = await createLoginSession(rows[0].id, res);
      res.json({ message: "登录成功", loginSessionMinutes });
    } catch (error) {
      if (error && error.message === "短信验证码校验失败") {
        const smsProviderCode = error.smsProviderCode ? String(error.smsProviderCode) : "";
        const smsProviderMessage = error.smsProviderMessage ? String(error.smsProviderMessage) : "";
        logError("短信验证码校验失败", { phone, smsProviderCode, smsProviderMessage });
        res.status(400).json({ message: "短信验证码错误或已过期" });
        return;
      }
      sendDbError(res, error);
    }
  });

  app.post("/api/auth/logout", authRequired, async (req, res) => {
    try {
      await pool.query("DELETE FROM sessions WHERE token = ?", [req.sessionToken]);
      res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
      res.json({ message: "已退出登录" });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
