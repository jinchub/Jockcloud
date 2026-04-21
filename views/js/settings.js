(function () {
  const MENU_ITEMS = [
    { key: "system", title: "系统配置", desc: "管理系统级基础配置", icon: "fa-solid fa-sliders" },
    { key: "upload", title: "上传配置", desc: "管理上传大小、分类格式与生效顺序", icon: "fa-solid fa-cloud-arrow-up" },
    { key: "download", title: "下载配置", desc: "管理下载速度限制与用户组绑定", icon: "fa-solid fa-download" },
    { key: "login", title: "登录配置", desc: "管理登录相关策略配置", icon: "fa-solid fa-right-to-bracket" },
    { key: "menu", title: "菜单配置", desc: "配置每个菜单可访问的用户", icon: "fa-solid fa-bars" },
    { key: "preview", title: "预览配置", desc: "配置文件预览支持的文件格式", icon: "fa-solid fa-eye" }
  ];
  const SETTINGS_MENU_KEYS = MENU_ITEMS.map((item) => item.key);
  const SETTINGS_MENU_KEY_SET = new Set(SETTINGS_MENU_KEYS);
  const APP_MENU_ITEMS = [
    { key: "files", title: "文件" },
    { key: "transfer", title: "传输" },
    { key: "users", title: "用户" },
    { key: "permissions", title: "权限" },
    { key: "quota", title: "空间" },
    { key: "mounts", title: "挂载" },
    { key: "sync", title: "同步" },
    { key: "monitor", title: "监控" },
    { key: "settings", title: "设置" }
  ];
  const UPLOAD_CATEGORY_ITEMS = [
    { key: "image", title: "图片" },
    { key: "video", title: "视频" },
    { key: "audio", title: "音频" },
    { key: "doc", title: "文档" },
    { key: "text", title: "文本" },
    { key: "archive", title: "压缩包" },
    { key: "program", title: "程序包" },
    { key: "other", title: "其他" }
  ];
  const DEFAULT_UPLOAD_CATEGORY_RULES = {
    image: { formats: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "svg", "tif", "tiff"], maxSizeMb: 10240 },
    video: { formats: ["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "m4v"], maxSizeMb: 10240 },
    audio: { formats: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "amr"], maxSizeMb: 10240 },
    doc: { formats: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "wps", "et", "dps", "epub", "mobi", "azw3", "html", "htm", "xml", "md", "tif", "tiff"], maxSizeMb: 10240 },
    text: { formats: ["txt", "md", "markdown", "log", "ini", "conf", "cfg", "yaml", "yml", "json", "xml", "csv", "tsv", "srt", "ass", "ssa", "vtt", "rtf", "tex"], maxSizeMb: 10240 },
    archive: { formats: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "cab", "iso"], maxSizeMb: 10240 },
    program: { formats: ["exe", "msi", "apk", "dmg", "pkg", "deb", "rpm", "appimage", "ipa"], maxSizeMb: 10240 },
    other: { formats: [], maxSizeMb: 10240 }
  };

  const DEFAULT_SETTINGS = {
    system: {
      maxUploadSizeMb: 10240,
      maxUploadFileCount: 100,
      maxConcurrentUploadCount: 3,
      chunkUploadThresholdMb: 200,
      uploadCategoryRules: JSON.parse(JSON.stringify(DEFAULT_UPLOAD_CATEGORY_RULES)),
      avatarUploadSizeMb: 4,
      avatarUploadFormats: ["jpg", "png", "webp", "bmp"],
      siteTitle: "JockCloud",
      loginTitle: "JockCloud",
      siteDescription: "私人云存储，一键到云端，高效安全快速",
      rateLimit: {
        enabled: true,
        windowSeconds: 60,
        maxRequests: 100
      },
      previewConfig: {
        imageExts: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff", "ico", "avif", "apng", "jfif", "heic", "heif"],
        videoExts: ["mp4", "webm", "ogg", "ogv", "mov", "m4v", "mkv", "avi", "wmv", "flv", "3gp", "mpeg", "mpg", "ts", "m2ts"],
        audioExts: ["mp3", "wav", "flac", "aac", "ogg", "oga", "m4a", "amr", "opus", "wma"],
        textExts: ["txt", "md", "markdown", "log", "ini", "conf", "cfg", "yaml", "yml", "json", "xml", "csv", "tsv", "srt", "ass", "ssa", "vtt", "rtf", "tex", "js", "ts", "jsx", "tsx", "py", "java", "c", "cc", "cpp", "h", "hpp", "cs", "go", "rs", "php", "rb", "swift", "kt", "kts", "sql", "sh", "bash", "zsh", "ps1", "bat", "cmd", "vue", "css", "scss", "sass", "less", "html", "htm", "xhtml", "toml", "env", "gitignore", "dockerfile", "makefile", "gradle", "properties", "lock"],
        docExts: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "wps", "et", "dps", "epub", "mobi", "azw3", "ibooks", "ps", "eps"]
      }
    },
    login: {
      loginCaptchaEnabled: false,
      smsLoginEnabled: false,
      loginSessionMinutes: 10080,
      smsSendIntervalSeconds: 60,
      smsIpLimitWindowMinutes: 10,
      smsIpLimitMaxCount: 10,
      smsConfig: {
        gatewayUrl: "",
        appId: "",
        appSecret: "",
        signName: "",
        templateId: ""
      }
    },
    menu: {
      permissions: {
        files: { users: [], groups: [] },
        transfer: { users: [], groups: [] },
        users: { users: [], groups: [] },
        permissions: { users: [], groups: [] },
        quota: { users: [], groups: [] },
        mounts: { users: [], groups: [] },
        sync: { users: [], groups: [] },
        monitor: { users: [], groups: [] },
        settings: { users: [], groups: [] }
      },
      mobileVisibility: {
        files: true,
        transfer: true,
        users: true,
        permissions: true,
        quota: true,
        mounts: true,
        sync: true,
        monitor: true,
        settings: true
      }
    },
    download: {
      globalSpeedLimitMb: 100,
      groupSpeedLimits: {},
      shareSpeedLimit: { value: 100, unit: 'MB/s' }
    }
  };

  const toNumber = (value, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return num;
  };

  const normalizeAvatarFormats = (value) => {
    const allowed = new Set(["jpg", "png", "webp", "bmp", "gif"]);
    const source = Array.isArray(value)
      ? value
      : String(value || "")
        .split(/[,，\s]+/g)
        .filter(Boolean);
    const result = [];
    const seen = new Set();
    source.forEach((item) => {
      let ext = String(item || "").trim().toLowerCase().replace(/^\./, "");
      if (ext === "jpeg") ext = "jpg";
      if (!ext || !allowed.has(ext) || seen.has(ext)) return;
      seen.add(ext);
      result.push(ext);
    });
    return result.length > 0 ? result : DEFAULT_SETTINGS.system.avatarUploadFormats.slice();
  };

  const normalizeUploadFormats = (value, fallbackFormats = []) => {
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
    return result.length > 0 ? result : fallbackFormats.slice();
  };

  const normalizeUploadCategoryRules = (value, globalMaxUploadSizeMb) => {
    const source = value && typeof value === "object" ? value : {};
    const fallbackGlobalMaxSizeMb = Math.max(1, Math.min(102400, Math.floor(toNumber(globalMaxUploadSizeMb, DEFAULT_SETTINGS.system.maxUploadSizeMb))));
    return UPLOAD_CATEGORY_ITEMS.reduce((acc, item) => {
      const fallback = DEFAULT_UPLOAD_CATEGORY_RULES[item.key] || { formats: [], maxSizeMb: globalMaxUploadSizeMb };
      const current = source[item.key] && typeof source[item.key] === "object" ? source[item.key] : {};
      acc[item.key] = {
        formats: normalizeUploadFormats(current.formats, fallback.formats),
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

  const normalizeSettings = (value = {}) => {
    const system = value.system && typeof value.system === "object" ? value.system : {};
    const login = value.login && typeof value.login === "object" ? value.login : {};
    const smsConfig = login.smsConfig && typeof login.smsConfig === "object" ? login.smsConfig : {};
    const menu = value.menu && typeof value.menu === "object" ? value.menu : {};
    const menuPermissions = menu.permissions && typeof menu.permissions === "object" ? menu.permissions : {};
    const menuMobileVisibility = menu.mobileVisibility && typeof menu.mobileVisibility === "object" ? menu.mobileVisibility : {};
    const maxUploadSizeMb = normalizeGlobalUploadMaxSizeMb(system.maxUploadSizeMb, DEFAULT_SETTINGS.system.maxUploadSizeMb);
    const maxUploadFileCount = normalizeUploadFileCount(system.maxUploadFileCount, DEFAULT_SETTINGS.system.maxUploadFileCount);
    const maxConcurrentUploadCount = normalizeConcurrentUploadCount(system.maxConcurrentUploadCount, DEFAULT_SETTINGS.system.maxConcurrentUploadCount);
    const chunkUploadThresholdMb = normalizeChunkUploadThresholdMb(system.chunkUploadThresholdMb, DEFAULT_SETTINGS.system.chunkUploadThresholdMb);
    const normalizeIdList = (source) => {
      if (!Array.isArray(source)) return [];
      const dedup = [];
      const seen = new Set();
      source.forEach((item) => {
        const id = Math.floor(Number(item));
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
        seen.add(id);
        dedup.push(id);
      });
      return dedup;
    };
    const normalizeMenuPermissionEntry = (value) => {
      if (Array.isArray(value)) {
        return { users: normalizeIdList(value), groups: [] };
      }
      if (!value || typeof value !== "object") {
        return { users: [], groups: [] };
      }
      return {
        users: normalizeIdList(value.users),
        groups: normalizeIdList(value.groups)
      };
    };
    const normalizeRateLimit = (value) => {
      const rateLimit = value && typeof value === "object" ? value : {};
      return {
        enabled: Boolean(rateLimit.enabled),
        windowSeconds: Math.max(1, Math.min(3600, Math.floor(toNumber(rateLimit.windowSeconds, DEFAULT_SETTINGS.system.rateLimit.windowSeconds)))),
        maxRequests: Math.max(1, Math.min(10000, Math.floor(toNumber(rateLimit.maxRequests, DEFAULT_SETTINGS.system.rateLimit.maxRequests))))
      };
    };
    const normalizePreviewConfig = (value) => {
      const previewConfig = value && typeof value === "object" ? value : {};
      const normalizeExts = (exts, defaults) => {
        if (!Array.isArray(exts)) return defaults.slice();
        return exts.filter((ext) => typeof ext === "string" && ext.trim().length > 0).map((ext) => ext.toLowerCase().trim()).slice(0, 200);
      };
      return {
        imageExts: normalizeExts(previewConfig.imageExts, DEFAULT_SETTINGS.system.previewConfig.imageExts),
        videoExts: normalizeExts(previewConfig.videoExts, DEFAULT_SETTINGS.system.previewConfig.videoExts),
        audioExts: normalizeExts(previewConfig.audioExts, DEFAULT_SETTINGS.system.previewConfig.audioExts),
        textExts: normalizeExts(previewConfig.textExts, DEFAULT_SETTINGS.system.previewConfig.textExts),
        docExts: normalizeExts(previewConfig.docExts, DEFAULT_SETTINGS.system.previewConfig.docExts)
      };
    };
    const normalizeDownloadConfig = (value) => {
      const download = value && typeof value === "object" ? value : {};
      // 支持新格式的 globalSpeedLimit { value, unit } 和旧格式的 globalSpeedLimitKb
      let globalSpeedLimitKb = 0;
      if (download.globalSpeedLimit && typeof download.globalSpeedLimit === 'object') {
        // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
        const speedValue = Number(download.globalSpeedLimit.value) || 0;
        const speedUnit = download.globalSpeedLimit.unit || 'KB/s';
        globalSpeedLimitKb = speedUnit === 'MB/s' ? speedValue * 1024 : speedValue;
      } else if (download.globalSpeedLimitKb !== undefined) {
        // 旧格式：globalSpeedLimitKb
        globalSpeedLimitKb = Math.max(0, Math.floor(toNumber(download.globalSpeedLimitKb, 0)));
      } else if (download.globalSpeedLimitMb !== undefined) {
        // 更旧的格式：globalSpeedLimitMb
        globalSpeedLimitKb = Math.max(0, Math.floor(toNumber(download.globalSpeedLimitMb, 0)) * 1024);
      } else {
        globalSpeedLimitKb = DEFAULT_SETTINGS.download.globalSpeedLimitMb * 1024;
      }
      
      // 处理用户组速度限制，支持新格式（对象）和旧格式（数字）
      const groupSpeedLimits = download.groupSpeedLimits && typeof download.groupSpeedLimits === "object" ? download.groupSpeedLimits : {};
      const normalizedGroupSpeedLimits = {};
      Object.keys(groupSpeedLimits).forEach((groupId) => {
        const speedData = groupSpeedLimits[groupId];
        let speedKb;
        if (speedData && typeof speedData === 'object') {
          // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
          const speedValue = Number(speedData.value) || 0;
          const speedUnit = speedData.unit || 'KB/s';
          speedKb = speedUnit === 'MB/s' ? speedValue * 1024 : speedValue;
        } else {
          // 旧格式：纯数字（KB/s）
          let speed = toNumber(speedData, 0);
          // 如果值小于 1024，认为是 MB，转换为 KB
          if (speed > 0 && speed < 1024) {
            speed = Math.floor(speed * 1024);
          }
          speedKb = speed;
        }
        if (speedKb > 0) {
          normalizedGroupSpeedLimits[groupId] = Math.max(1, Math.min(10485760, Math.floor(speedKb)));
        }
      });
      // 处理分享下载速度限制，支持新格式（对象）和旧格式（数字）
      let shareSpeedLimit;
      if (download.shareSpeedLimit && typeof download.shareSpeedLimit === 'object') {
        // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
        shareSpeedLimit = {
          value: Number(download.shareSpeedLimit.value) || 0,
          unit: download.shareSpeedLimit.unit || 'KB/s'
        };
      } else if (download.shareSpeedLimitKb !== undefined) {
        // 旧格式：shareSpeedLimitKb
        const shareSpeedLimitKb = Math.max(0, Math.floor(toNumber(download.shareSpeedLimitKb, 0)));
        if (shareSpeedLimitKb >= 1024 && shareSpeedLimitKb % 1024 === 0) {
          shareSpeedLimit = { value: shareSpeedLimitKb / 1024, unit: 'MB/s' };
        } else {
          shareSpeedLimit = { value: shareSpeedLimitKb, unit: 'KB/s' };
        }
      } else if (download.shareSpeedLimitMb !== undefined) {
        // 更旧格式：shareSpeedLimitMb
        const shareSpeedLimitMb = Math.max(0, Math.floor(toNumber(download.shareSpeedLimitMb, DEFAULT_SETTINGS.download.globalSpeedLimitMb)));
        shareSpeedLimit = { value: shareSpeedLimitMb, unit: 'MB/s' };
      } else {
        // 默认值
        shareSpeedLimit = { value: DEFAULT_SETTINGS.download.globalSpeedLimitMb, unit: 'MB/s' };
      }
      
      return {
        globalSpeedLimitKb: globalSpeedLimitKb,
        groupSpeedLimits: normalizedGroupSpeedLimits,
        shareSpeedLimit: shareSpeedLimit
      };
    };
    return {
      system: {
        maxUploadSizeMb,
        maxUploadFileCount,
        maxConcurrentUploadCount,
        chunkUploadThresholdMb,
        uploadCategoryRules: normalizeUploadCategoryRules(system.uploadCategoryRules, maxUploadSizeMb || DEFAULT_SETTINGS.system.maxUploadSizeMb),
        avatarUploadSizeMb: Math.max(1, Math.min(100, Math.floor(toNumber(system.avatarUploadSizeMb, DEFAULT_SETTINGS.system.avatarUploadSizeMb)))),
        avatarUploadFormats: normalizeAvatarFormats(system.avatarUploadFormats),
        siteTitle: String(system.siteTitle || DEFAULT_SETTINGS.system.siteTitle).trim().slice(0, 120) || DEFAULT_SETTINGS.system.siteTitle,
        loginTitle: String(system.loginTitle || system.siteTitle || DEFAULT_SETTINGS.system.loginTitle).trim().slice(0, 120) || DEFAULT_SETTINGS.system.loginTitle,
        siteDescription: String(system.siteDescription || DEFAULT_SETTINGS.system.siteDescription).trim().slice(0, 500),
        rateLimit: normalizeRateLimit(system.rateLimit),
        previewConfig: normalizePreviewConfig(system.previewConfig)
      },
      login: {
        loginCaptchaEnabled: Boolean(login.loginCaptchaEnabled),
        smsLoginEnabled: Boolean(login.smsLoginEnabled),
        loginSessionMinutes: Math.max(1, Math.min(43200, Math.floor(toNumber(login.loginSessionMinutes, DEFAULT_SETTINGS.login.loginSessionMinutes)))),
        smsSendIntervalSeconds: Math.max(1, Math.min(3600, Math.floor(toNumber(login.smsSendIntervalSeconds, DEFAULT_SETTINGS.login.smsSendIntervalSeconds)))),
        smsIpLimitWindowMinutes: Math.max(1, Math.min(1440, Math.floor(toNumber(login.smsIpLimitWindowMinutes, DEFAULT_SETTINGS.login.smsIpLimitWindowMinutes)))),
        smsIpLimitMaxCount: Math.max(1, Math.min(10000, Math.floor(toNumber(login.smsIpLimitMaxCount, DEFAULT_SETTINGS.login.smsIpLimitMaxCount)))),
        smsConfig: {
          gatewayUrl: String(smsConfig.gatewayUrl || "").trim().slice(0, 300),
          appId: String(smsConfig.appId || "").trim().slice(0, 120),
          appSecret: String(smsConfig.appSecret || "").trim().slice(0, 200),
          signName: String(smsConfig.signName || "").trim().slice(0, 60),
          templateId: String(smsConfig.templateId || "").trim().slice(0, 120)
        }
      },
      menu: {
        permissions: APP_MENU_ITEMS.reduce((acc, item) => {
          acc[item.key] = normalizeMenuPermissionEntry(menuPermissions[item.key]);
          return acc;
        }, {}),
        mobileVisibility: APP_MENU_ITEMS.reduce((acc, item) => {
          const fallback = DEFAULT_SETTINGS.menu.mobileVisibility[item.key];
          acc[item.key] = menuMobileVisibility[item.key] === undefined ? Boolean(fallback) : Boolean(menuMobileVisibility[item.key]);
          return acc;
        }, {})
      },
      download: normalizeDownloadConfig(value.download)
    };
  };

  window.createSettingsManager = ({ request, escapeHtml }) => {
    const settingsSidebar = document.getElementById("settingsSidebar");
    const settingsAsideList = document.getElementById("settingsAsideList");
    const toggleSettingsSidebarBtn = document.getElementById("toggleSettingsSidebarBtn");
    const settingsPanelTitle = document.getElementById("settingsPanelTitle");
    const settingsPanelMeta = document.getElementById("settingsPanelMeta");
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const systemSettingsForm = document.getElementById("systemSettingsForm");
    const uploadSettingsForm = document.getElementById("uploadSettingsForm");
    const loginSettingsForm = document.getElementById("loginSettingsForm");
    const settingsMaxUploadSize = document.getElementById("settingsMaxUploadSize");
    const settingsMaxUploadFileCount = document.getElementById("settingsMaxUploadFileCount");
    const settingsMaxConcurrentUploadCount = document.getElementById("settingsMaxConcurrentUploadCount");
    const settingsChunkUploadThresholdMb = document.getElementById("settingsChunkUploadThresholdMb");
    const settingsMaxUploadUnlimited = document.getElementById("settingsMaxUploadUnlimited");
    const settingsUploadFormatsImage = document.getElementById("settingsUploadFormatsImage");
    const settingsUploadFormatsVideo = document.getElementById("settingsUploadFormatsVideo");
    const settingsUploadFormatsAudio = document.getElementById("settingsUploadFormatsAudio");
    const settingsUploadFormatsDoc = document.getElementById("settingsUploadFormatsDoc");
    const settingsUploadFormatsText = document.getElementById("settingsUploadFormatsText");
    const settingsUploadFormatsArchive = document.getElementById("settingsUploadFormatsArchive");
    const settingsUploadFormatsProgram = document.getElementById("settingsUploadFormatsProgram");
    const settingsUploadFormatsOther = document.getElementById("settingsUploadFormatsOther");
    const settingsAvatarUploadFormats = document.getElementById("settingsAvatarUploadFormats");
    const settingsAvatarUploadSize = document.getElementById("settingsAvatarUploadSize");
    const settingsSiteTitle = document.getElementById("settingsSiteTitle");
    const settingsLoginTitle = document.getElementById("settingsLoginTitle");
    const settingsSiteDescription = document.getElementById("settingsSiteDescription");
    const settingsRateLimitEnabled = document.getElementById("settingsRateLimitEnabled");
    const settingsRateLimitWindowMs = document.getElementById("settingsRateLimitWindowMs");
    const settingsRateLimitMaxRequests = document.getElementById("settingsRateLimitMaxRequests");
    const settingsPreviewImageExts = document.getElementById("settingsPreviewImageExts");
    const settingsPreviewVideoExts = document.getElementById("settingsPreviewVideoExts");
    const settingsPreviewAudioExts = document.getElementById("settingsPreviewAudioExts");
    const settingsPreviewTextExts = document.getElementById("settingsPreviewTextExts");
    const settingsPreviewDocExts = document.getElementById("settingsPreviewDocExts");
    const settingsLoginCaptchaEnabled = document.getElementById("settingsLoginCaptchaEnabled");
    const settingsSmsLoginEnabled = document.getElementById("settingsSmsLoginEnabled");
    const settingsLoginSessionMinutes = document.getElementById("settingsLoginSessionMinutes");
    const smsEnvConfigTip = document.getElementById("smsEnvConfigTip");
    const settingsSmsSendIntervalSeconds = document.getElementById("settingsSmsSendIntervalSeconds");
    const settingsSmsIpLimitWindowMinutes = document.getElementById("settingsSmsIpLimitWindowMinutes");
    const settingsSmsIpLimitMaxCount = document.getElementById("settingsSmsIpLimitMaxCount");
    const smsSendIntervalRow = document.getElementById("smsSendIntervalRow");
    const smsIpLimitWindowRow = document.getElementById("smsIpLimitWindowRow");
    const smsIpLimitCountRow = document.getElementById("smsIpLimitCountRow");
    const previewSettingsForm = document.getElementById("previewSettingsForm");
    const menuSettingsForm = document.getElementById("menuSettingsForm");
    const downloadSettingsForm = document.getElementById("downloadSettingsForm");
    const settingsDownloadGlobalSpeedLimit = document.getElementById("settingsDownloadGlobalSpeedLimit");
    const settingsDownloadGlobalSpeedUnit = document.getElementById("settingsDownloadGlobalSpeedUnit");
    const settingsDownloadShareSpeedLimit = document.getElementById("settingsDownloadShareSpeedLimit");
    const settingsDownloadShareSpeedUnit = document.getElementById("settingsDownloadShareSpeedUnit");
    const downloadGroupSpeedLimitsList = document.getElementById("downloadGroupSpeedLimitsList");
    const settingsMenuPermissionsList = document.getElementById("settingsMenuPermissionsList");
    const settingsMenuUserEmptyTip = document.getElementById("settingsMenuUserEmptyTip");
    const uploadRuleInputs = {
      image: { formats: settingsUploadFormatsImage },
      video: { formats: settingsUploadFormatsVideo },
      audio: { formats: settingsUploadFormatsAudio },
      doc: { formats: settingsUploadFormatsDoc },
      text: { formats: settingsUploadFormatsText },
      archive: { formats: settingsUploadFormatsArchive },
      program: { formats: settingsUploadFormatsProgram },
      other: { formats: settingsUploadFormatsOther }
    };
    const hasUploadRuleInputs = UPLOAD_CATEGORY_ITEMS.every((item) => {
      const current = uploadRuleInputs[item.key];
      return current && current.formats;
    });
    if (!settingsSidebar || !settingsAsideList || !toggleSettingsSidebarBtn || !settingsPanelTitle || !settingsPanelMeta || !saveSettingsBtn || !systemSettingsForm || !uploadSettingsForm || !loginSettingsForm || !settingsMaxUploadSize || !settingsMaxUploadFileCount || !settingsMaxConcurrentUploadCount || !settingsChunkUploadThresholdMb || !settingsMaxUploadUnlimited || !hasUploadRuleInputs || !settingsAvatarUploadFormats || !settingsAvatarUploadSize || !settingsSiteTitle || !settingsLoginTitle || !settingsSiteDescription || !settingsLoginCaptchaEnabled || !settingsSmsLoginEnabled || !settingsLoginSessionMinutes || !smsEnvConfigTip || !settingsSmsSendIntervalSeconds || !settingsSmsIpLimitWindowMinutes || !settingsSmsIpLimitMaxCount || !smsSendIntervalRow || !smsIpLimitWindowRow || !smsIpLimitCountRow || !menuSettingsForm || !downloadSettingsForm || !settingsDownloadGlobalSpeedLimit || !settingsDownloadGlobalSpeedUnit || !settingsDownloadShareSpeedLimit || !settingsDownloadShareSpeedUnit || !downloadGroupSpeedLimitsList || !settingsMenuPermissionsList || !settingsMenuUserEmptyTip || !settingsPreviewImageExts || !settingsPreviewVideoExts || !settingsPreviewAudioExts || !settingsPreviewTextExts || !settingsPreviewDocExts) {
      return {
        onEnterView: async () => {}
      };
    }

    const runtime = {
      activeMenu: "system",
      settings: normalizeSettings(DEFAULT_SETTINGS),
      loaded: false,
      noticeModal: null,
      menuAuthModal: null,
      smsEnvConfigured: false,
      menuUsers: [],
      menuGroups: [],
      menuAddDraft: null
    };

    const normalizeSettingsMenuKey = (value, fallback = "system") => {
      const key = String(value || "").trim();
      if (SETTINGS_MENU_KEY_SET.has(key)) return key;
      return fallback;
    };

    const syncSettingsMenuRoute = (replace = false) => {
      const params = new URLSearchParams(window.location.search);
      params.set("main", "settings");
      params.set("settingsMenu", runtime.activeMenu);
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    };

    const normalizeIdList = (source) => {
      if (!Array.isArray(source)) return [];
      const dedup = [];
      const seen = new Set();
      source.forEach((item) => {
        const id = Math.floor(Number(item));
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
        seen.add(id);
        dedup.push(id);
      });
      return dedup;
    };

    const ensurePermissionEntry = (menuKey) => {
      const source = runtime.settings && runtime.settings.menu && runtime.settings.menu.permissions
        ? runtime.settings.menu.permissions[menuKey]
        : null;
      let nextValue;
      if (Array.isArray(source)) {
        nextValue = { users: normalizeIdList(source), groups: [] };
      } else if (source && typeof source === "object") {
        nextValue = {
          users: normalizeIdList(source.users),
          groups: normalizeIdList(source.groups)
        };
      } else {
        nextValue = { users: [], groups: [] };
      }
      runtime.settings.menu.permissions[menuKey] = nextValue;
      return nextValue;
    };

    const ensureMenuMobileVisible = (menuKey) => {
      const source = runtime.settings && runtime.settings.menu && runtime.settings.menu.mobileVisibility
        ? runtime.settings.menu.mobileVisibility[menuKey]
        : undefined;
      const fallback = DEFAULT_SETTINGS.menu.mobileVisibility[menuKey];
      const nextValue = source === undefined ? Boolean(fallback) : Boolean(source);
      runtime.settings.menu.mobileVisibility[menuKey] = nextValue;
      return nextValue;
    };

    const getMenuTargetLabel = (targetType, targetId) => {
      if (targetType === "group") {
        const matchedGroup = runtime.menuGroups.find((group) => Number(group.id || 0) === Number(targetId));
        return matchedGroup ? `用户组：${matchedGroup.name || `用户组${String(targetId)}`}` : "";
      }
      const matchedUser = runtime.menuUsers.find((user) => Number(user.id || 0) === Number(targetId));
      return matchedUser ? `用户：${matchedUser.username || `用户${String(targetId)}`}` : "";
    };

    const getMenuAvailableTargets = (menuKey, targetType, keyword = "") => {
      const entry = ensurePermissionEntry(menuKey);
      const keywordLower = String(keyword || "").trim().toLowerCase();
      if (targetType === "group") {
        const selectedGroupIds = new Set(entry.groups);
        const list = runtime.menuGroups.filter((group) => !selectedGroupIds.has(Number(group.id || 0)));
        if (!keywordLower) return list;
        return list.filter((group) => {
          const name = String(group.name || "").toLowerCase();
          const idText = String(group.id || "");
          return name.includes(keywordLower) || idText.includes(keywordLower);
        });
      }
      const selectedUserIds = new Set(entry.users);
      const list = runtime.menuUsers.filter((user) => !selectedUserIds.has(Number(user.id || 0)));
      if (!keywordLower) return list;
      return list.filter((user) => {
        const name = String(user.username || "").toLowerCase();
        const idText = String(user.id || "");
        return name.includes(keywordLower) || idText.includes(keywordLower);
      });
    };

    const ensureMenuAuthModal = () => {
      if (runtime.menuAuthModal) return runtime.menuAuthModal;
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.style.display = "none";
      overlay.innerHTML = `
        <div class="settings-menu-auth-modal">
          <div class="settings-menu-auth-header">
            <div id="settingsMenuAuthTitle"></div>
            <button type="button" class="settings-menu-auth-close" data-action="menu-auth-cancel"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="settings-menu-auth-body">
            <div class="settings-menu-auth-row">
              <label for="settingsMenuAuthType">授权类型</label>
              <select id="settingsMenuAuthType" class="settings-menu-auth-type"></select>
            </div>
            <input type="text" class="settings-menu-auth-search" id="settingsMenuAuthSearch" placeholder="搜索用户名/ID" />
            <div class="settings-menu-auth-row">
              <label for="settingsMenuAuthTarget">授权对象</label>
              <select id="settingsMenuAuthTarget" class="settings-menu-auth-target"></select>
            </div>
            <div class="settings-menu-auth-row">
              <label>已授权</label>
              <div id="settingsMenuAuthGranted" class="settings-menu-auth-granted"></div>
            </div>
          </div>
          <div class="settings-menu-auth-actions">
            <button type="button" class="settings-menu-auth-btn" data-action="menu-auth-cancel">取消</button>
            <button type="button" class="settings-menu-auth-btn primary" data-action="menu-auth-confirm">添加</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      runtime.menuAuthModal = overlay;
      return overlay;
    };

    const closeMenuAuthModal = () => {
      if (!runtime.menuAuthModal) return;
      runtime.menuAuthModal.style.display = "none";
      runtime.menuAddDraft = null;
    };

    const renderMenuAuthModal = () => {
      const modal = ensureMenuAuthModal();
      if (!runtime.menuAddDraft) {
        closeMenuAuthModal();
        return;
      }
      const titleEl = modal.querySelector("#settingsMenuAuthTitle");
      const searchInput = modal.querySelector("#settingsMenuAuthSearch");
      const typeSelect = modal.querySelector("#settingsMenuAuthType");
      const targetSelect = modal.querySelector("#settingsMenuAuthTarget");
      const grantedBox = modal.querySelector("#settingsMenuAuthGranted");
      const draft = runtime.menuAddDraft;
      const targetType = draft.targetType === "group" ? "group" : "user";
      const currentMenu = APP_MENU_ITEMS.find((item) => item.key === draft.menuKey);
      if (titleEl) {
        titleEl.textContent = `添加授权 - ${currentMenu ? currentMenu.title : "菜单"}`;
      }
      const allUserCandidates = getMenuAvailableTargets(draft.menuKey, "user");
      const allGroupCandidates = getMenuAvailableTargets(draft.menuKey, "group");
      if (typeSelect) {
        typeSelect.innerHTML = `
          <option value="user" ${(targetType === "user" ? "selected" : "")} ${allUserCandidates.length > 0 ? "" : "disabled"}>用户</option>
          <option value="group" ${(targetType === "group" ? "selected" : "")} ${allGroupCandidates.length > 0 ? "" : "disabled"}>用户组</option>
        `;
      }
      const placeholder = targetType === "group" ? "搜索用户组名称/ID" : "搜索用户名/ID";
      if (searchInput) {
        searchInput.placeholder = placeholder;
        if (searchInput.value !== String(draft.keyword || "")) {
          searchInput.value = String(draft.keyword || "");
        }
      }
      const availableList = getMenuAvailableTargets(draft.menuKey, targetType, draft.keyword);
      const selectedTargetId = Number(draft.targetId || 0);
      const finalTargetId = availableList.some((item) => Number(item.id || 0) === selectedTargetId)
        ? selectedTargetId
        : Number((availableList[0] && availableList[0].id) || 0);
      runtime.menuAddDraft.targetId = finalTargetId;
      if (targetSelect) {
        targetSelect.innerHTML = availableList.length > 0
          ? availableList.map((item) => {
            const id = Number(item.id || 0);
            const name = targetType === "group"
              ? String(item.name || `用户组${String(id)}`)
              : String(item.username || `用户${String(id)}`);
            return `<option value="${escapeHtml(String(id))}" ${id === finalTargetId ? "selected" : ""}>${escapeHtml(name)} (ID:${escapeHtml(String(id))})</option>`;
          }).join("")
          : '<option value="">暂无可选项</option>';
        targetSelect.disabled = availableList.length === 0;
      }
      if (grantedBox) {
        const entry = ensurePermissionEntry(draft.menuKey);
        const grantedList = targetType === "group"
          ? entry.groups.map((id) => {
            const matched = runtime.menuGroups.find((group) => Number(group.id || 0) === Number(id));
            if (!matched) return "";
            return `<span class="settings-menu-auth-granted-item">${escapeHtml(matched.name || `用户组${String(id)}`)} (ID:${escapeHtml(String(id))})</span>`;
          }).filter(Boolean)
          : entry.users.map((id) => {
            const matched = runtime.menuUsers.find((user) => Number(user.id || 0) === Number(id));
            if (!matched) return "";
            return `<span class="settings-menu-auth-granted-item">${escapeHtml(matched.username || `用户${String(id)}`)} (ID:${escapeHtml(String(id))})</span>`;
          }).filter(Boolean);
        grantedBox.innerHTML = grantedList.length > 0
          ? grantedList.join("")
          : '<span class="settings-menu-auth-granted-empty">暂无已授权对象</span>';
      }
      const confirmBtn = modal.querySelector('[data-action="menu-auth-confirm"]');
      if (confirmBtn) {
        confirmBtn.disabled = availableList.length === 0;
      }
      modal.style.display = "flex";
    };

    const openMenuAuthModal = (menuKey) => {
      const userCandidates = getMenuAvailableTargets(menuKey, "user");
      const groupCandidates = getMenuAvailableTargets(menuKey, "group");
      if (userCandidates.length === 0 && groupCandidates.length === 0) return;
      const targetType = userCandidates.length > 0 ? "user" : "group";
      const firstId = Number((targetType === "user" ? userCandidates[0] : groupCandidates[0]).id || 0);
      runtime.menuAddDraft = {
        menuKey,
        targetType,
        targetId: firstId,
        keyword: ""
      };
      renderMenuAuthModal();
    };

    const ensureNoticeModal = () => {
      if (runtime.noticeModal) return runtime.noticeModal;
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.style.display = "none";
      overlay.innerHTML = `
        <div class="delete-confirm-modal">
          <div class="delete-confirm-header">
            <span id="settingsNoticeTitle"></span>
            <button type="button" class="delete-confirm-close" id="settingsNoticeCloseBtn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="delete-confirm-body">
            <div class="delete-confirm-icon" id="settingsNoticeIcon"><i class="fa-solid fa-circle-info"></i></div>
            <div class="delete-confirm-message" id="settingsNoticeMessage"></div>
          </div>
          <div class="delete-confirm-actions">
            <button type="button" class="delete-confirm-btn confirm" id="settingsNoticeOkBtn">知道了</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      runtime.noticeModal = overlay;
      return overlay;
    };

    const showNotice = ({ title, message, isError = false }) => new Promise((resolve) => {
      const modal = ensureNoticeModal();
      const titleEl = modal.querySelector("#settingsNoticeTitle");
      const messageEl = modal.querySelector("#settingsNoticeMessage");
      const iconEl = modal.querySelector("#settingsNoticeIcon");
      const closeBtn = modal.querySelector("#settingsNoticeCloseBtn");
      const okBtn = modal.querySelector("#settingsNoticeOkBtn");
      titleEl.textContent = title || "提示";
      messageEl.textContent = message || "";
      iconEl.innerHTML = isError ? '<i class="fa-solid fa-circle-xmark"></i>' : '<i class="fa-solid fa-circle-check"></i>';
      iconEl.style.background = isError ? "#fff2f0" : "#f6ffed";
      iconEl.style.color = isError ? "#f53f3f" : "#00b42a";
      modal.style.display = "flex";
      const close = () => {
        modal.style.display = "none";
        closeBtn.removeEventListener("click", close);
        okBtn.removeEventListener("click", close);
        modal.removeEventListener("click", closeByMask);
        resolve();
      };
      const closeByMask = (event) => {
        if (event.target === modal) close();
      };
      closeBtn.addEventListener("click", close);
      okBtn.addEventListener("click", close);
      modal.addEventListener("click", closeByMask);
    });

    const updateSmsEnvConfigTip = (enabled) => {
      smsEnvConfigTip.style.display = enabled ? "block" : "none";
      smsEnvConfigTip.classList.toggle("success", runtime.smsEnvConfigured);
      smsEnvConfigTip.textContent = runtime.smsEnvConfigured
        ? "短信环境变量已配置，可正常使用短信登录"
        : "已启用短信登录，请先在 .env 中配置短信环境变量";
    };

    const renderMenuPermissions = () => {
      const users = runtime.menuUsers.slice().sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
      const groups = runtime.menuGroups.slice().sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
      const userIdSet = new Set(users.map((user) => Number(user.id || 0)).filter((id) => Number.isFinite(id) && id > 0));
      const groupIdSet = new Set(groups.map((group) => Number(group.id || 0)).filter((id) => Number.isFinite(id) && id > 0));
      const permissions = runtime.settings.menu.permissions;
      settingsMenuUserEmptyTip.style.display = users.length === 0 && groups.length === 0 ? "block" : "none";
      settingsMenuPermissionsList.innerHTML = APP_MENU_ITEMS.map((menuItem) => {
        const isFixed = menuItem.key === "files" || menuItem.key === "transfer";
        const permissionEntry = ensurePermissionEntry(menuItem.key);
        const mobileVisible = ensureMenuMobileVisible(menuItem.key);
        const selectedUsers = isFixed
          ? []
          : permissionEntry.users.filter((id) => userIdSet.has(id));
        const selectedGroups = isFixed
          ? []
          : permissionEntry.groups.filter((id) => groupIdSet.has(id));
        const selectedUserChips = selectedUsers.length > 0
          ? selectedUsers.map((id) => {
            const matched = users.find((user) => Number(user.id || 0) === id);
            if (!matched) return "";
            return `
              <span class="settings-user-chip">
                <span>${escapeHtml(matched.username || `用户${String(id)}`)}</span>
                ${isFixed ? "" : `<button type="button" class="settings-user-chip-remove" data-action="remove-user" data-menu-key="${escapeHtml(menuItem.key)}" data-user-id="${escapeHtml(String(id))}" aria-label="移除用户"><i class="fa-solid fa-xmark"></i></button>`}
              </span>
            `;
          }).filter(Boolean).join("")
          : "";
        const selectedGroupChips = selectedGroups.length > 0
          ? selectedGroups.map((id) => {
            const matched = groups.find((group) => Number(group.id || 0) === id);
            if (!matched) return "";
            return `
              <span class="settings-user-chip settings-group-chip">
                <span>${escapeHtml(matched.name || `用户组${String(id)}`)}</span>
                <button type="button" class="settings-user-chip-remove" data-action="remove-group" data-menu-key="${escapeHtml(menuItem.key)}" data-group-id="${escapeHtml(String(id))}" aria-label="移除用户组"><i class="fa-solid fa-xmark"></i></button>
              </span>
            `;
          }).filter(Boolean).join("")
          : "";
        const selectedChips = isFixed
          ? ""
          : selectedUserChips || selectedGroupChips
            ? `${selectedUserChips}${selectedGroupChips}`
            : '<span class="settings-menu-empty">未添加授权</span>';
        const canAddTarget = getMenuAvailableTargets(menuItem.key, "user").length > 0 || getMenuAvailableTargets(menuItem.key, "group").length > 0;
        const addAction = isFixed
          ? '<span class="settings-menu-fixed-tip">全员可用</span>'
            : `
              <button type="button" class="settings-menu-add-btn" data-action="show-add-user" data-menu-key="${escapeHtml(menuItem.key)}" ${canAddTarget ? "" : "disabled"}>
                <i class="fa-solid fa-plus"></i>
              </button>
            `;
        return `
          <div class="settings-menu-permission-row" data-menu-key="${escapeHtml(menuItem.key)}">
            <div class="settings-menu-permission-head">
              <div class="settings-menu-permission-title">${escapeHtml(menuItem.title)}</div>
              <div class="settings-menu-permission-action">
                <label class="settings-menu-mobile-toggle">
                  <input type="checkbox" data-action="toggle-mobile-visible" data-menu-key="${escapeHtml(menuItem.key)}" ${mobileVisible ? "checked" : ""}>
                  <span>手机显示</span>
                </label>
                ${addAction}
              </div>
            </div>
            <div class="settings-menu-permission-users">${selectedChips}</div>
          </div>
        `;
      }).join("");
    };

    const renderDownloadGroupSpeedLimits = () => {
      const groups = runtime.menuGroups;
      const groupSpeedLimits = runtime.settings.download.groupSpeedLimits || {};
      if (groups.length === 0) {
        downloadGroupSpeedLimitsList.innerHTML = '<div class="settings-form-tip">暂无用户组</div>';
        return;
      }
      downloadGroupSpeedLimitsList.innerHTML = `
        <div class="download-group-speed-grid">
          ${groups.map((group) => {
            const speedData = groupSpeedLimits[String(group.id)];
            // 支持旧格式（纯数字）和新格式（对象）
            let speedValue, speedUnit;
            if (speedData && typeof speedData === 'object') {
              // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
              speedValue = speedData.value || 0;
              speedUnit = speedData.unit || 'KB/s';
            } else {
              // 旧格式：纯数字（KB/s）
              const speedLimitKb = speedData || 0;
              if (speedLimitKb > 0 && speedLimitKb % 1024 === 0 && speedLimitKb / 1024 >= 1) {
                speedUnit = 'MB/s';
                speedValue = speedLimitKb / 1024;
              } else {
                speedUnit = 'KB/s';
                speedValue = speedLimitKb;
              }
            }
            return `
              <div class="download-group-speed-item">
                <label>${escapeHtml(group.name)}</label>
                <div class="download-group-speed-input-wrapper">
                  <input type="number" class="download-group-speed-input" data-group-id="${escapeHtml(String(group.id))}" min="0" max="10485760" placeholder="0 表示不限制" value="${speedValue !== undefined && speedValue !== null ? String(speedValue) : ""}" />
                  <select class="download-group-speed-unit-select" data-group-id="${escapeHtml(String(group.id))}" style="width: 80px; margin-left: 4px;">
                    <option value="KB/s" ${speedUnit === 'KB/s' ? 'selected' : ''}>KB/s</option>
                    <option value="MB/s" ${speedUnit === 'MB/s' ? 'selected' : ''}>MB/s</option>
                  </select>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    const updateMaxUploadUnlimitedUi = () => {
      const unlimited = settingsMaxUploadUnlimited.checked;
      settingsMaxUploadSize.disabled = unlimited;
      if (unlimited) {
        settingsMaxUploadSize.value = "";
      } else if (!String(settingsMaxUploadSize.value || "").trim()) {
        settingsMaxUploadSize.value = String(DEFAULT_SETTINGS.system.maxUploadSizeMb);
      }
    };

    const setFormValues = () => {
      const maxUploadSizeMb = runtime.settings.system.maxUploadSizeMb;
      if (Number.isFinite(Number(maxUploadSizeMb)) && Number(maxUploadSizeMb) > 0) {
        settingsMaxUploadUnlimited.checked = false;
        settingsMaxUploadSize.value = String(Math.floor(Number(maxUploadSizeMb)));
      } else {
        settingsMaxUploadUnlimited.checked = true;
        settingsMaxUploadSize.value = "";
      }
      updateMaxUploadUnlimitedUi();
      settingsMaxUploadFileCount.value = String(runtime.settings.system.maxUploadFileCount);
      settingsMaxConcurrentUploadCount.value = String(runtime.settings.system.maxConcurrentUploadCount);
      settingsChunkUploadThresholdMb.value = String(runtime.settings.system.chunkUploadThresholdMb);
      UPLOAD_CATEGORY_ITEMS.forEach((item) => {
        const current = uploadRuleInputs[item.key];
        const rule = runtime.settings.system.uploadCategoryRules[item.key];
        current.formats.value = Array.isArray(rule.formats) ? rule.formats.join(",") : "";
      });
      settingsAvatarUploadSize.value = String(runtime.settings.system.avatarUploadSizeMb);
      settingsAvatarUploadFormats.value = runtime.settings.system.avatarUploadFormats.join(",");
      settingsSiteTitle.value = runtime.settings.system.siteTitle;
      settingsLoginTitle.value = runtime.settings.system.loginTitle;
      settingsSiteDescription.value = runtime.settings.system.siteDescription;
      settingsRateLimitEnabled.checked = runtime.settings.system.rateLimit.enabled;
      settingsRateLimitWindowMs.value = String(Math.floor(runtime.settings.system.rateLimit.windowSeconds));
      settingsRateLimitMaxRequests.value = String(runtime.settings.system.rateLimit.maxRequests);
      settingsPreviewImageExts.value = runtime.settings.system.previewConfig.imageExts.join(",");
      settingsPreviewVideoExts.value = runtime.settings.system.previewConfig.videoExts.join(",");
      settingsPreviewAudioExts.value = runtime.settings.system.previewConfig.audioExts.join(",");
      settingsPreviewTextExts.value = runtime.settings.system.previewConfig.textExts.join(",");
      settingsPreviewDocExts.value = runtime.settings.system.previewConfig.docExts.join(",");
      settingsLoginCaptchaEnabled.checked = runtime.settings.login.loginCaptchaEnabled;
      settingsSmsLoginEnabled.checked = runtime.settings.login.smsLoginEnabled;
      settingsLoginSessionMinutes.value = String(runtime.settings.login.loginSessionMinutes);
      settingsSmsSendIntervalSeconds.value = String(runtime.settings.login.smsSendIntervalSeconds);
      settingsSmsIpLimitWindowMinutes.value = String(runtime.settings.login.smsIpLimitWindowMinutes);
      settingsSmsIpLimitMaxCount.value = String(runtime.settings.login.smsIpLimitMaxCount);
      const enabled = runtime.settings.login.smsLoginEnabled;
      updateSmsEnvConfigTip(enabled);
      smsSendIntervalRow.style.display = enabled ? "flex" : "none";
      smsIpLimitWindowRow.style.display = enabled ? "flex" : "none";
      smsIpLimitCountRow.style.display = enabled ? "flex" : "none";
      // 读取全局速度限制，支持新格式和旧格式
      let globalSpeedValue, globalSpeedUnit;
      if (runtime.settings.download.globalSpeedLimit) {
        // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
        globalSpeedValue = runtime.settings.download.globalSpeedLimit.value || 0;
        globalSpeedUnit = runtime.settings.download.globalSpeedLimit.unit || 'KB/s';
      } else if (runtime.settings.download.globalSpeedLimitKb !== undefined) {
        // 旧格式：globalSpeedLimitKb (KB/s)
        const globalSpeedLimitKb = runtime.settings.download.globalSpeedLimitKb || 0;
        if (globalSpeedLimitKb >= 1024 && globalSpeedLimitKb % 1024 === 0) {
          globalSpeedValue = globalSpeedLimitKb / 1024;
          globalSpeedUnit = 'MB/s';
        } else {
          globalSpeedValue = globalSpeedLimitKb;
          globalSpeedUnit = 'KB/s';
        }
      } else {
        // 默认值
        globalSpeedValue = 100;
        globalSpeedUnit = 'MB/s';
      }
      settingsDownloadGlobalSpeedLimit.value = String(globalSpeedValue);
      settingsDownloadGlobalSpeedUnit.value = globalSpeedUnit;
      
      // 读取分享下载速度限制，支持新格式和旧格式
      let shareSpeedValue, shareSpeedUnit;
      if (runtime.settings.download.shareSpeedLimit) {
        // 新格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
        shareSpeedValue = runtime.settings.download.shareSpeedLimit.value || 0;
        shareSpeedUnit = runtime.settings.download.shareSpeedLimit.unit || 'KB/s';
      } else if (runtime.settings.download.shareSpeedLimitKb !== undefined) {
        // 旧格式：shareSpeedLimitKb (KB/s)
        const shareSpeedLimitKb = runtime.settings.download.shareSpeedLimitKb || 0;
        if (shareSpeedLimitKb >= 1024 && shareSpeedLimitKb % 1024 === 0) {
          shareSpeedValue = shareSpeedLimitKb / 1024;
          shareSpeedUnit = 'MB/s';
        } else {
          shareSpeedValue = shareSpeedLimitKb;
          shareSpeedUnit = 'KB/s';
        }
      } else {
        // 默认值
        shareSpeedValue = 100;
        shareSpeedUnit = 'MB/s';
      }
      settingsDownloadShareSpeedLimit.value = String(shareSpeedValue);
      settingsDownloadShareSpeedUnit.value = shareSpeedUnit;
      
      renderDownloadGroupSpeedLimits();
      renderMenuPermissions();
    };

    const readMenuPermissions = () => {
      const allUserIds = runtime.menuUsers.map((user) => Number(user.id || 0)).filter((id) => Number.isFinite(id) && id > 0);
      const allUserIdSet = new Set(allUserIds);
      const allGroupIds = runtime.menuGroups.map((group) => Number(group.id || 0)).filter((id) => Number.isFinite(id) && id > 0);
      const allGroupIdSet = new Set(allGroupIds);
      const usersByMenu = APP_MENU_ITEMS.reduce((acc, item) => {
        const entry = ensurePermissionEntry(item.key);
        if (item.key === "files" || item.key === "transfer") {
          acc[item.key] = { users: allUserIds.slice(), groups: [] };
          return acc;
        }
        const userDedup = [];
        const userSeen = new Set();
        entry.users.forEach((itemId) => {
          const id = Math.floor(Number(itemId));
          if (!Number.isFinite(id) || id <= 0 || !allUserIdSet.has(id) || userSeen.has(id)) return;
          userSeen.add(id);
          userDedup.push(id);
        });
        const groupDedup = [];
        const groupSeen = new Set();
        entry.groups.forEach((itemId) => {
          const id = Math.floor(Number(itemId));
          if (!Number.isFinite(id) || id <= 0 || !allGroupIdSet.has(id) || groupSeen.has(id)) return;
          groupSeen.add(id);
          groupDedup.push(id);
        });
        acc[item.key] = { users: userDedup, groups: groupDedup };
        return acc;
      }, {});
      return usersByMenu;
    };

    const readMenuMobileVisibility = () => {
      return APP_MENU_ITEMS.reduce((acc, item) => {
        acc[item.key] = ensureMenuMobileVisible(item.key);
        return acc;
      }, {});
    };

    const readActiveMenuPayload = () => {
      if (runtime.activeMenu === "system") {
        return {
          system: {
            siteTitle: settingsSiteTitle.value,
            loginTitle: settingsLoginTitle.value,
            siteDescription: settingsSiteDescription.value,
            rateLimit: {
              enabled: settingsRateLimitEnabled.checked,
              windowSeconds: settingsRateLimitWindowMs.value,
              maxRequests: settingsRateLimitMaxRequests.value
            }
          }
        };
      }
      if (runtime.activeMenu === "upload") {
        return {
          system: {
            maxUploadSizeMb: settingsMaxUploadUnlimited.checked ? -1 : settingsMaxUploadSize.value,
            maxUploadFileCount: settingsMaxUploadFileCount.value,
            maxConcurrentUploadCount: settingsMaxConcurrentUploadCount.value,
            chunkUploadThresholdMb: settingsChunkUploadThresholdMb.value,
            uploadCategoryRules: UPLOAD_CATEGORY_ITEMS.reduce((acc, item) => {
              const current = uploadRuleInputs[item.key];
              acc[item.key] = {
                formats: current.formats.value
              };
              return acc;
            }, {}),
            avatarUploadSizeMb: settingsAvatarUploadSize.value,
            avatarUploadFormats: settingsAvatarUploadFormats.value
          }
        };
      }
      if (runtime.activeMenu === "login") {
        return {
          login: {
            loginCaptchaEnabled: settingsLoginCaptchaEnabled.checked,
            smsLoginEnabled: settingsSmsLoginEnabled.checked,
            loginSessionMinutes: settingsLoginSessionMinutes.value,
            smsSendIntervalSeconds: settingsSmsSendIntervalSeconds.value,
            smsIpLimitWindowMinutes: settingsSmsIpLimitWindowMinutes.value,
            smsIpLimitMaxCount: settingsSmsIpLimitMaxCount.value
          }
        };
      }
      if (runtime.activeMenu === "preview") {
        return {
          system: {
            previewConfig: {
              imageExts: settingsPreviewImageExts.value,
              videoExts: settingsPreviewVideoExts.value,
              audioExts: settingsPreviewAudioExts.value,
              textExts: settingsPreviewTextExts.value,
              docExts: settingsPreviewDocExts.value
            }
          }
        };
      }
      if (runtime.activeMenu === "download") {
        const groupSpeedLimits = {};
        const speedInputs = downloadGroupSpeedLimitsList.querySelectorAll(".download-group-speed-input");
        const speedUnitSelects = downloadGroupSpeedLimitsList.querySelectorAll(".download-group-speed-unit-select");
        
        // 构建一个 map 来存储每个用户组的值和单位
        const groupSpeedMap = {};
        speedInputs.forEach((input) => {
          const groupId = input.dataset.groupId;
          const value = input.value.trim();
          const speed = value ? Math.max(0, Math.min(10485760, Number(value))) : 0;
          if (speed > 0 || speed === 0) {
            groupSpeedMap[groupId] = { value: speed };
          }
        });
        
        // 添加单位信息，保存为对象格式
        speedUnitSelects.forEach((select) => {
          const groupId = select.dataset.groupId;
          const unit = select.value;
          if (groupSpeedMap[groupId] !== undefined) {
            // 保存为对象格式：{ value: 数值，unit: 'KB/s' | 'MB/s' }
            groupSpeedLimits[groupId] = {
              value: groupSpeedMap[groupId].value,
              unit: unit
            };
          }
        });
        
        // 获取全局速度限制
        const globalSpeedValue = Number(settingsDownloadGlobalSpeedLimit.value) || 0;
        const globalSpeedUnit = settingsDownloadGlobalSpeedUnit.value;
        
        // 获取分享下载速度限制
        const shareSpeedValue = Number(settingsDownloadShareSpeedLimit.value) || 0;
        const shareSpeedUnit = settingsDownloadShareSpeedUnit.value;
        
        return {
          download: {
            globalSpeedLimit: {
              value: globalSpeedValue,
              unit: globalSpeedUnit
            },
            shareSpeedLimit: {
              value: shareSpeedValue,
              unit: shareSpeedUnit
            },
            groupSpeedLimits
          }
        };
      }
      return {
        menu: {
          permissions: readMenuPermissions(),
          mobileVisibility: readMenuMobileVisibility()
        }
      };
    };

    const renderMenu = () => {
      settingsAsideList.innerHTML = MENU_ITEMS.map((item) => `
        <button type="button" class="settings-menu-item ${runtime.activeMenu === item.key ? "active" : ""}" data-settings-menu="${escapeHtml(item.key)}">
          <i class="${escapeHtml(item.icon)}"></i>
          <span>${escapeHtml(item.title)}</span>
        </button>
      `).join("");
    };

    const renderPanel = () => {
      const current = MENU_ITEMS.find((item) => item.key === runtime.activeMenu) || MENU_ITEMS[0];
      settingsPanelTitle.textContent = current.title;
      settingsPanelMeta.textContent = current.desc;
      systemSettingsForm.style.display = runtime.activeMenu === "system" ? "block" : "none";
      uploadSettingsForm.style.display = runtime.activeMenu === "upload" ? "grid" : "none";
      downloadSettingsForm.style.display = runtime.activeMenu === "download" ? "block" : "none";
      loginSettingsForm.style.display = runtime.activeMenu === "login" ? "block" : "none";
      menuSettingsForm.style.display = runtime.activeMenu === "menu" ? "block" : "none";
      previewSettingsForm.style.display = runtime.activeMenu === "preview" ? "block" : "none";
      renderMenu();
    };

    const loadSettings = async () => {
      const res = await request("/api/settings");
      if (!res.ok) {
        throw new Error("配置加载失败");
      }
      const data = await res.json();
      runtime.smsEnvConfigured = Boolean(data && data.login && data.login.smsEnvConfigured);
      runtime.settings = normalizeSettings(data);
      runtime.loaded = true;
      document.title = runtime.settings.system.siteTitle || DEFAULT_SETTINGS.system.siteTitle;
    };

    const loadMenuUsers = async () => {
      const res = await request("/api/users");
      if (!res.ok) {
        throw new Error("用户列表加载失败");
      }
      const users = await res.json();
      runtime.menuUsers = Array.isArray(users)
        ? users.map((item) => ({
            id: Math.floor(Number(item.id || 0)),
            username: String(item.username || "").trim(),
            role: String(item.role || "user")
          })).filter((item) => Number.isFinite(item.id) && item.id > 0 && item.role !== "admin")
            .map((item) => ({ id: item.id, username: item.username }))
        : [];
    };

    const loadMenuGroups = async () => {
      const res = await request("/api/user-groups");
      if (!res.ok) {
        throw new Error("用户组列表加载失败");
      }
      const groups = await res.json();
      runtime.menuGroups = Array.isArray(groups)
        ? groups.map((item) => ({
            id: Math.floor(Number(item.id || 0)),
            name: String(item.name || "").trim()
          })).filter((item) => Number.isFinite(item.id) && item.id > 0)
        : [];
    };

    const saveSettings = async () => {
      const nextSettings = readActiveMenuPayload();
      const res = await request("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings)
      });
      if (!res.ok) {
        const message = await res.json().then((d) => d.message).catch(() => "保存失败");
        throw new Error(message || "保存失败");
      }
      // 保存成功后，重新从后端加载完整配置
      await loadSettings();
      // 刷新用户信息以更新 mobileVisibleMenus 缓存
      await loadUserInfo();
      setFormValues();
    };

    settingsAsideList.addEventListener("click", (event) => {
      const target = event.target.closest("[data-settings-menu]");
      if (!target) return;
      runtime.activeMenu = normalizeSettingsMenuKey(target.dataset.settingsMenu, runtime.activeMenu);
      renderPanel();
      syncSettingsMenuRoute();
    });

    toggleSettingsSidebarBtn.addEventListener("click", () => {
      settingsSidebar.classList.toggle("collapsed");
      const icon = toggleSettingsSidebarBtn.querySelector("i");
      if (icon) {
        icon.className = settingsSidebar.classList.contains("collapsed") ? "fa-solid fa-angles-right" : "fa-solid fa-angles-left";
      }
    });

    settingsMaxUploadUnlimited.addEventListener("change", () => {
      updateMaxUploadUnlimitedUi();
    });

    settingsSmsLoginEnabled.addEventListener("change", () => {
      const enabled = settingsSmsLoginEnabled.checked;
      updateSmsEnvConfigTip(enabled);
      smsSendIntervalRow.style.display = enabled ? "flex" : "none";
      smsIpLimitWindowRow.style.display = enabled ? "flex" : "none";
      smsIpLimitCountRow.style.display = enabled ? "flex" : "none";
      if (enabled && !runtime.smsEnvConfigured) {
        showNotice({ title: "提示", message: "请先在 .env 中配置短信环境变量" });
      }
    });

    settingsMenuPermissionsList.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action][data-menu-key]");
      if (!actionTarget) return;
      const action = String(actionTarget.dataset.action || "");
      const menuKey = String(actionTarget.dataset.menuKey || "");
      if (!action || !menuKey || !runtime.settings.menu.permissions[menuKey] || menuKey === "files" && action !== "show-add-user") return;
      if (action === "show-add-user") {
        openMenuAuthModal(menuKey);
        return;
      }
      if (action === "toggle-mobile-visible") {
        const checked = actionTarget instanceof HTMLInputElement ? actionTarget.checked : actionTarget.getAttribute("aria-checked") === "true";
        runtime.settings.menu.mobileVisibility[menuKey] = Boolean(checked);
        return;
      }
      if (action === "remove-user") {
        const userId = Math.floor(Number(actionTarget.dataset.userId || 0));
        if (!Number.isFinite(userId) || userId <= 0) return;
        const entry = ensurePermissionEntry(menuKey);
        entry.users = entry.users.filter((id) => Number(id) !== userId);
        if (runtime.menuAddDraft && runtime.menuAddDraft.menuKey === menuKey) {
          const userCandidates = getMenuAvailableTargets(menuKey, "user", runtime.menuAddDraft.keyword);
          if (runtime.menuAddDraft.targetType === "user") {
            runtime.menuAddDraft.targetId = Number((userCandidates[0] && userCandidates[0].id) || 0);
          }
          renderMenuAuthModal();
        }
        renderMenuPermissions();
        return;
      }
      if (action === "remove-group") {
        const groupId = Math.floor(Number(actionTarget.dataset.groupId || 0));
        if (!Number.isFinite(groupId) || groupId <= 0) return;
        const entry = ensurePermissionEntry(menuKey);
        entry.groups = entry.groups.filter((id) => Number(id) !== groupId);
        if (runtime.menuAddDraft && runtime.menuAddDraft.menuKey === menuKey) {
          const groupCandidates = getMenuAvailableTargets(menuKey, "group", runtime.menuAddDraft.keyword);
          if (runtime.menuAddDraft.targetType === "group") {
            runtime.menuAddDraft.targetId = Number((groupCandidates[0] && groupCandidates[0].id) || 0);
          }
          renderMenuAuthModal();
        }
        renderMenuPermissions();
      }
    });

    document.body.addEventListener("click", (event) => {
      const modal = runtime.menuAuthModal;
      if (!modal || modal.style.display !== "flex") return;
      if (event.target === modal) {
        closeMenuAuthModal();
        return;
      }
      const actionTarget = event.target.closest("[data-action]");
      if (actionTarget) {
        const action = String(actionTarget.dataset.action || "");
        if (action === "menu-auth-cancel") {
          closeMenuAuthModal();
          return;
        }
        if (action === "menu-auth-confirm") {
          if (!runtime.menuAddDraft) return;
          const { menuKey, targetType } = runtime.menuAddDraft;
          const targetId = Math.floor(Number(runtime.menuAddDraft.targetId || 0));
          if (!menuKey || !targetType || !Number.isFinite(targetId) || targetId <= 0) return;
          const entry = ensurePermissionEntry(menuKey);
          if (targetType === "group") {
            if (!entry.groups.includes(targetId)) {
              entry.groups = entry.groups.concat([targetId]);
            }
          } else if (!entry.users.includes(targetId)) {
            entry.users = entry.users.concat([targetId]);
          }
          const label = getMenuTargetLabel(targetType, targetId);
          closeMenuAuthModal();
          renderMenuPermissions();
          showNotice({ title: "添加成功", message: label ? `${label} 已授权` : "授权已添加" });
          return;
        }
      }
    });

    document.body.addEventListener("input", (event) => {
      const searchInput = event.target.closest("#settingsMenuAuthSearch");
      if (!searchInput || !runtime.menuAddDraft) return;
      const keyword = String(searchInput.value || "");
      const matchedList = getMenuAvailableTargets(runtime.menuAddDraft.menuKey, runtime.menuAddDraft.targetType, keyword);
      runtime.menuAddDraft.keyword = keyword;
      runtime.menuAddDraft.targetId = Number((matchedList[0] && matchedList[0].id) || 0);
      renderMenuAuthModal();
    });

    document.body.addEventListener("change", (event) => {
      const typeSelect = event.target.closest("#settingsMenuAuthType");
      if (typeSelect && runtime.menuAddDraft) {
        const nextType = String(typeSelect.value || "");
        if (nextType !== "user" && nextType !== "group") return;
        const nextCandidates = getMenuAvailableTargets(runtime.menuAddDraft.menuKey, nextType);
        runtime.menuAddDraft.targetType = nextType;
        runtime.menuAddDraft.keyword = "";
        runtime.menuAddDraft.targetId = Number((nextCandidates[0] && nextCandidates[0].id) || 0);
        renderMenuAuthModal();
        return;
      }
      const targetSelect = event.target.closest("#settingsMenuAuthTarget");
      if (!targetSelect || !runtime.menuAddDraft) return;
      const targetId = Math.floor(Number(targetSelect.value || 0));
      if (!Number.isFinite(targetId) || targetId <= 0) return;
      runtime.menuAddDraft.targetId = targetId;
    });

    saveSettingsBtn.addEventListener("click", async () => {
      saveSettingsBtn.disabled = true;
      try {
        await saveSettings();
        await showNotice({ title: "保存成功", message: "设置已保存" });
      } catch (error) {
        await showNotice({ title: "保存失败", message: error.message || "设置保存失败", isError: true });
      } finally {
        saveSettingsBtn.disabled = false;
      }
    });

    return {
      onEnterView: async (options = {}) => {
        const params = new URLSearchParams(window.location.search);
        const rawMenu = options.menu !== undefined ? options.menu : params.get("settingsMenu");
        const defaultMenu = MENU_ITEMS[0] ? MENU_ITEMS[0].key : "system";
        runtime.activeMenu = normalizeSettingsMenuKey(rawMenu, defaultMenu);
        renderPanel();
        try {
          await loadSettings();
        } catch (error) {
          if (!runtime.loaded) {
            runtime.settings = normalizeSettings(DEFAULT_SETTINGS);
          }
        }
        try {
          await loadMenuUsers();
        } catch (error) {
          runtime.menuUsers = [];
        }
        try {
          await loadMenuGroups();
        } catch (error) {
          runtime.menuGroups = [];
        }
        setFormValues();
        syncSettingsMenuRoute(true);
      }
    };
  };
})();
