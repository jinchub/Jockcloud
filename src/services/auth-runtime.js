const createAuthRuntime = ({
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
}) => {
  const getSmsRuntimeConfig = (loginSettings = {}) => {
    const smsConfig = loginSettings.smsConfig && typeof loginSettings.smsConfig === "object" ? loginSettings.smsConfig : {};
    const accessKeyId = String(smsConfig.appId || process.env.DYPNS_ACCESS_KEY_ID || process.env.DYSMS_ACCESS_KEY_ID || "").trim();
    const accessKeySecret = String(smsConfig.appSecret || process.env.DYPNS_ACCESS_KEY_SECRET || process.env.DYSMS_ACCESS_KEY_SECRET || "").trim();
    const signName = String(smsConfig.signName || process.env.DYSMS_SIGN_NAME || "").trim();
    const templateCode = String(smsConfig.templateId || process.env.DYSMS_TEMPLATE_ID || "").trim();
    const gatewayOrRegion = String(smsConfig.gatewayUrl || process.env.DYSMS_REGION || "").trim();
    return {
      accessKeyId,
      accessKeySecret,
      signName,
      templateCode,
      gatewayOrRegion
    };
  };

  const isSmsConfigComplete = (loginSettings = {}) => {
    const runtime = getSmsRuntimeConfig(loginSettings);
    return Boolean(
      runtime.accessKeyId &&
      runtime.accessKeySecret &&
      runtime.signName &&
      runtime.templateCode
    );
  };

  const getSmsPolicyConfig = (loginSettings = {}) => {
    const sendIntervalSeconds = Math.max(1, Math.min(3600, Math.floor(Number(loginSettings.smsSendIntervalSeconds) || DEFAULT_SETTINGS.login.smsSendIntervalSeconds)));
    const ipLimitWindowMinutes = Math.max(1, Math.min(1440, Math.floor(Number(loginSettings.smsIpLimitWindowMinutes) || DEFAULT_SETTINGS.login.smsIpLimitWindowMinutes)));
    const ipLimitMaxCount = Math.max(1, Math.min(10000, Math.floor(Number(loginSettings.smsIpLimitMaxCount) || DEFAULT_SETTINGS.login.smsIpLimitMaxCount)));
    return {
      sendIntervalMs: sendIntervalSeconds * 1000,
      ipLimitWindowMs: ipLimitWindowMinutes * 60 * 1000,
      ipLimitMaxCount
    };
  };

  const dispatchSmsCode = async ({ loginSettings, phone }) => {
    const runtime = getSmsRuntimeConfig(loginSettings);
    const smsPolicy = getSmsPolicyConfig(loginSettings);
    const gatewayOrRegion = runtime.gatewayOrRegion;
    const accessKeyId = runtime.accessKeyId;
    const accessKeySecret = runtime.accessKeySecret;
    const signName = runtime.signName;
    const templateCode = runtime.templateCode;
    if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
      throw new Error("短信配置不完整");
    }
    const config = {
      accessKeyId,
      accessKeySecret,
      regionId: "cn-hangzhou"
    };
    if (gatewayOrRegion) {
      if (gatewayOrRegion.includes(".")) {
        config.endpoint = gatewayOrRegion;
      } else {
        config.regionId = gatewayOrRegion;
      }
    }
    const client = new Dypnsapi.default(config);
    const request = new Dypnsapi.SendSmsVerifyCodeRequest({
      phoneNumber: phone,
      countryCode: "86",
      signName,
      templateCode,
      templateParam: JSON.stringify({ code: "##code##", min: "5" }),
      codeLength: 6,
      validTime: 300,
      interval: Math.max(1, Math.floor(smsPolicy.sendIntervalMs / 1000))
    });
    try {
      const response = await client.sendSmsVerifyCode(request);
      const resultCode = response && response.body ? String(response.body.code || "") : "";
      const resultMessage = response && response.body ? String(response.body.message || "") : "";
      if (resultCode !== "OK") {
        const error = new Error("阿里云短信发送失败");
        error.smsProviderCode = resultCode;
        error.smsProviderMessage = resultMessage;
        throw error;
      }
      return {
        bizId: response && response.body && response.body.model ? String(response.body.model.bizId || "") : ""
      };
    } catch (err) {
      const error = new Error("阿里云短信发送失败");
      error.smsProviderCode = String(err && (err.smsProviderCode || err.code) ? (err.smsProviderCode || err.code) : "");
      error.smsProviderMessage = String(err && (err.smsProviderMessage || err.message) ? (err.smsProviderMessage || err.message) : "");
      throw error;
    }
  };

  const verifySmsCode = async ({ loginSettings, phone, verifyCode }) => {
    const runtime = getSmsRuntimeConfig(loginSettings);
    const gatewayOrRegion = runtime.gatewayOrRegion;
    const accessKeyId = runtime.accessKeyId;
    const accessKeySecret = runtime.accessKeySecret;
    if (!accessKeyId || !accessKeySecret) {
      throw new Error("短信配置不完整");
    }
    const config = {
      accessKeyId,
      accessKeySecret,
      regionId: "cn-hangzhou"
    };
    if (gatewayOrRegion) {
      if (gatewayOrRegion.includes(".")) {
        config.endpoint = gatewayOrRegion;
      } else {
        config.regionId = gatewayOrRegion;
      }
    }
    const client = new Dypnsapi.default(config);
    const request = new Dypnsapi.CheckSmsVerifyCodeRequest({
      phoneNumber: phone,
      countryCode: "86",
      verifyCode
    });
    try {
      const response = await client.checkSmsVerifyCode(request);
      const resultCode = response && response.body ? String(response.body.code || "") : "";
      const resultMessage = response && response.body ? String(response.body.message || "") : "";
      const verifyResult = response && response.body && response.body.model ? String(response.body.model.verifyResult || "") : "";
      const verifyOk = /^(PASS|OK|SUCCESS|TRUE|VALID)$/i.test(verifyResult);
      if (resultCode !== "OK" || !(verifyOk || verifyResult === "")) {
        const error = new Error("短信验证码校验失败");
        error.smsProviderCode = resultCode;
        error.smsProviderMessage = resultMessage || verifyResult;
        throw error;
      }
    } catch (err) {
      const error = new Error("短信验证码校验失败");
      error.smsProviderCode = String(err && (err.smsProviderCode || err.code) ? (err.smsProviderCode || err.code) : "");
      error.smsProviderMessage = String(err && (err.smsProviderMessage || err.message) ? (err.smsProviderMessage || err.message) : "");
      throw error;
    }
  };

  const createLoginSession = async (userId, res) => {
    const settings = await readSettings();
    const loginSessionMinutes = settings.login.loginSessionMinutes;
    await pool.query("DELETE FROM sessions WHERE expires_at <= NOW()");
    const token = makeToken();
    await pool.query(
      "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
      [userId, token, loginSessionMinutes]
    );
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${loginSessionMinutes * 60}`
    );
    return loginSessionMinutes;
  };

  const decryptLoginPassword = (encryptedPassword) => {
    const encryptedBase64 = String(encryptedPassword || "").trim();
    if (!encryptedBase64) {
      throw new Error("密码加密数据不能为空");
    }
    
    try {
      const decrypted = crypto.privateDecrypt(
        {
          key: LOGIN_PASSWORD_KEY_PAIR.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: LOGIN_PASSWORD_RSA_OAEP_HASH
        },
        Buffer.from(encryptedBase64, "base64")
      );
      return decrypted.toString("utf8");
    } catch (_oaepError) {
      try {
        const decryptedBuffer = crypto.privateDecrypt(
          {
            key: LOGIN_PASSWORD_KEY_PAIR.privateKey,
            padding: crypto.constants.RSA_NO_PADDING
          },
          Buffer.from(encryptedBase64, "base64")
        );
        
        const decrypted = removePKCS1Padding(decryptedBuffer);
        return decrypted.toString("utf8");
      } catch (_noPaddingError) {
        throw new Error("密码解密失败");
      }
    }
  };

  const removePKCS1Padding = (buffer) => {
    let i = 0;
    if (buffer[0] === 0x00 || buffer[0] === 0x02) {
      i = 1;
    }
    while (i < buffer.length && buffer[i] !== 0x00) {
      i++;
    }
    i++;
    return buffer.slice(i);
  };

  const loadUserGroupContextMap = async (userIds) => {
    const normalizedUserIds = normalizeIdList(userIds);
    const contextMap = new Map();
    if (normalizedUserIds.length === 0) return contextMap;
    const placeholders = normalizedUserIds.map(() => "?").join(", ");
    const [rows] = await pool.query(
      `
      SELECT m.user_id AS userId, g.id AS groupId, g.name AS groupName, g.permissions
      , g.max_upload_size_mb AS maxUploadSizeMb
      , g.max_upload_file_count AS maxUploadFileCount
      , g.quota_bytes AS quotaBytes
      FROM user_group_members m
      JOIN user_groups g ON g.id = m.group_id
      WHERE m.user_id IN (${placeholders})
      ORDER BY g.id ASC
    `,
      normalizedUserIds
    );
    rows.forEach((row) => {
      const userId = Number(row.userId);
      if (!contextMap.has(userId)) {
        contextMap.set(userId, {
          groupIds: [],
          groupNames: [],
          groupPermissions: [],
          groupUploadLimits: [],
          groupUploadCountLimits: [],
          groupQuotas: []
        });
      }
      const context = contextMap.get(userId);
      context.groupIds.push(Number(row.groupId));
      context.groupNames.push(String(row.groupName || "").trim());
      context.groupPermissions.push(row.permissions);
      context.groupUploadLimits.push({
        groupId: Number(row.groupId),
        groupName: String(row.groupName || "").trim(),
        maxSizeMb: row.maxUploadSizeMb
      });
      context.groupUploadCountLimits.push({
        groupId: Number(row.groupId),
        groupName: String(row.groupName || "").trim(),
        maxFileCount: row.maxUploadFileCount
      });
      context.groupQuotas.push({
        groupId: Number(row.groupId),
        groupName: String(row.groupName || "").trim(),
        quotaBytes: Number(row.quotaBytes || -1)
      });
    });
    return contextMap;
  };

  const resolveGroupUploadMaxSizeMb = (groupUploadLimits) => {
    if (!Array.isArray(groupUploadLimits) || groupUploadLimits.length === 0) return undefined;
    let minSize = null;
    let hasUnlimited = false;
    groupUploadLimits.forEach((item) => {
      const currentSize = normalizeUserGroupUploadMaxSizeMb(item && item.maxSizeMb);
      if (currentSize === -1) {
        hasUnlimited = true;
        return;
      }
      if (!currentSize || currentSize <= 0) return;
      if (minSize === null || currentSize < minSize) {
        minSize = currentSize;
      }
    });
    if (minSize !== null) return minSize;
    return hasUnlimited ? -1 : undefined;
  };

  const resolveGroupUploadMaxFileCount = (groupUploadCountLimits) => {
    if (!Array.isArray(groupUploadCountLimits) || groupUploadCountLimits.length === 0) return undefined;
    let minCount = null;
    let hasUnlimited = false;
    groupUploadCountLimits.forEach((item) => {
      const currentCount = normalizeUserGroupUploadMaxFileCount(item && item.maxFileCount);
      if (currentCount === -1) {
        hasUnlimited = true;
        return;
      }
      if (!currentCount || currentCount <= 0) return;
      if (minCount === null || currentCount < minCount) {
        minCount = currentCount;
      }
    });
    if (minCount !== null) return minCount;
    return hasUnlimited ? -1 : undefined;
  };

  const resolveGroupQuota = (userQuota, groupQuotas) => {
    if (!Array.isArray(groupQuotas) || groupQuotas.length === 0) {
      return userQuota !== undefined ? userQuota : -1;
    }
    
    // 如果用户自己设置了配额（不是 -1），优先使用用户配额
    if (userQuota !== undefined && userQuota !== -1) {
      return userQuota;
    }
    
    // 否则使用用户组的最小配额
    let minQuota = null;
    let hasUnlimited = false;
    
    groupQuotas.forEach((item) => {
      const currentQuota = Number(item && item.quotaBytes || -1);
      if (currentQuota === -1) {
        hasUnlimited = true;
        return;
      }
      if (!currentQuota || currentQuota <= 0) return;
      if (minQuota === null || currentQuota < minQuota) {
        minQuota = currentQuota;
      }
    });
    
    if (minQuota !== null) return minQuota;
    return hasUnlimited ? -1 : -1; // 默认返回 -1（无限制）
  };

  const insertUserGroupMembers = async (connection, userId, groupIds) => {
    const normalizedGroupIds = normalizeIdList(groupIds);
    if (normalizedGroupIds.length === 0) return;
    const placeholders = normalizedGroupIds.map(() => "(?, ?)").join(", ");
    const params = [];
    normalizedGroupIds.forEach((groupId) => {
      params.push(userId, groupId);
    });
    await connection.query(
      `INSERT INTO user_group_members (user_id, group_id) VALUES ${placeholders}`,
      params
    );
  };

  return {
    getSmsRuntimeConfig,
    isSmsConfigComplete,
    getSmsPolicyConfig,
    dispatchSmsCode,
    verifySmsCode,
    createLoginSession,
    decryptLoginPassword,
    loadUserGroupContextMap,
    resolveGroupUploadMaxSizeMb,
    resolveGroupUploadMaxFileCount,
    resolveGroupQuota,
    insertUserGroupMembers
  };
};

module.exports = {
  createAuthRuntime
};
