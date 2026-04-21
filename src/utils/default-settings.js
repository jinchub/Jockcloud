const { DEFAULT_UPLOAD_CATEGORY_RULES, DEFAULT_LOGIN_SESSION_MINUTES, DEFAULT_MAX_UPLOAD_FILE_SIZE_MB, DEFAULT_AVATAR_UPLOAD_SIZE_MB, DEFAULT_AVATAR_UPLOAD_FORMATS, DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB, DEFAULT_PREVIEW_CONFIG } = require("./constants");

const DEFAULT_SETTINGS = {
  system: {
    maxUploadSizeMb: 10240,
    maxUploadFileCount: 100,
    maxConcurrentUploadCount: 3,
    chunkUploadThresholdMb: DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB,
    uploadCategoryRules: JSON.parse(JSON.stringify(DEFAULT_UPLOAD_CATEGORY_RULES)),
    avatarUploadSizeMb: DEFAULT_AVATAR_UPLOAD_SIZE_MB,
    avatarUploadFormats: DEFAULT_AVATAR_UPLOAD_FORMATS.slice(),
    siteTitle: "JockCloud",
    loginTitle: "JockCloud",
    siteDescription: "私人云存储，一键到云端，高效安全快速",
    rateLimit: {
      enabled: true,
      windowSeconds: 60,
      maxRequests: 100
    },
    previewConfig: {
      imageExts: DEFAULT_PREVIEW_CONFIG.imageExts,
      videoExts: DEFAULT_PREVIEW_CONFIG.videoExts,
      audioExts: DEFAULT_PREVIEW_CONFIG.audioExts,
      textExts: DEFAULT_PREVIEW_CONFIG.textExts,
      docExts: DEFAULT_PREVIEW_CONFIG.docExts
    }
  },
  login: {
    loginCaptchaEnabled: false,
    smsLoginEnabled: false,
    loginSessionMinutes: DEFAULT_LOGIN_SESSION_MINUTES,
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
    globalSpeedLimit: { value: 100, unit: 'MB/s' },
    globalSpeedLimitMb: 100,
    groupSpeedLimits: {},
    shareSpeedLimit: { value: 100, unit: 'MB/s' }
  }
};

module.exports = DEFAULT_SETTINGS;
