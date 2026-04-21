module.exports = (app, deps) => {
  const {
    authRequired,
    adminRequired,
    sendDbError,
    readSettings,
    DEFAULT_SETTINGS,
    isSmsConfigComplete,
    mergeSettingsPayload,
    normalizeSettings,
    writeSettings,
    setCurrentMaxUploadFileSizeByMb
  } = deps;

  app.get("/api/public-settings", async (_req, res) => {
    try {
      const settings = await readSettings();
      res.json({
        system: {
          maxUploadFileCount: settings.system.maxUploadFileCount,
          maxConcurrentUploadCount: settings.system.maxConcurrentUploadCount,
          chunkUploadThresholdMb: settings.system.chunkUploadThresholdMb,
          uploadCategoryRules: settings.system.uploadCategoryRules,
          avatarUploadSizeMb: settings.system.avatarUploadSizeMb,
          avatarUploadFormats: settings.system.avatarUploadFormats,
          siteTitle: settings.system.siteTitle,
          loginTitle: settings.system.loginTitle,
          siteDescription: settings.system.siteDescription,
          previewConfig: settings.system.previewConfig
        },
        login: {
          loginCaptchaEnabled: settings.login.loginCaptchaEnabled,
          smsLoginEnabled: settings.login.smsLoginEnabled,
          loginSessionMinutes: settings.login.loginSessionMinutes,
          smsSendIntervalSeconds: settings.login.smsSendIntervalSeconds
        }
      });
    } catch (error) {
      res.json({
        system: {
          maxUploadFileCount: DEFAULT_SETTINGS.system.maxUploadFileCount,
          maxConcurrentUploadCount: DEFAULT_SETTINGS.system.maxConcurrentUploadCount,
          chunkUploadThresholdMb: DEFAULT_SETTINGS.system.chunkUploadThresholdMb,
          uploadCategoryRules: DEFAULT_SETTINGS.system.uploadCategoryRules,
          avatarUploadSizeMb: DEFAULT_SETTINGS.system.avatarUploadSizeMb,
          avatarUploadFormats: DEFAULT_SETTINGS.system.avatarUploadFormats,
          siteTitle: DEFAULT_SETTINGS.system.siteTitle,
          loginTitle: DEFAULT_SETTINGS.system.loginTitle,
          siteDescription: DEFAULT_SETTINGS.system.siteDescription,
          previewConfig: DEFAULT_SETTINGS.system.previewConfig
        },
        login: {
          loginCaptchaEnabled: DEFAULT_SETTINGS.login.loginCaptchaEnabled,
          smsLoginEnabled: DEFAULT_SETTINGS.login.smsLoginEnabled,
          loginSessionMinutes: DEFAULT_SETTINGS.login.loginSessionMinutes,
          smsSendIntervalSeconds: DEFAULT_SETTINGS.login.smsSendIntervalSeconds
        }
      });
    }
  });

  app.get("/api/settings", authRequired, adminRequired, async (_req, res) => {
    try {
      const settings = await readSettings();
      res.json({
        ...settings,
        login: {
          ...settings.login,
          smsEnvConfigured: isSmsConfigComplete(settings.login)
        }
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/settings", authRequired, adminRequired, async (req, res) => {
    try {
      const currentSettings = await readSettings();
      const mergedPayload = mergeSettingsPayload(currentSettings, req.body || {});
      const nextSettings = normalizeSettings(mergedPayload);
      if (nextSettings.login.smsLoginEnabled && !isSmsConfigComplete(nextSettings.login)) {
        res.status(400).json({ message: "请先配置环境变量" });
        return;
      }
      const saved = await writeSettings(nextSettings);
      setCurrentMaxUploadFileSizeByMb(saved.system.maxUploadSizeMb);
      res.json({ message: "设置已保存", settings: saved });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
