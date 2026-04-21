const constants = require("./constants");
const defaultSettings = require("./default-settings");
const config = require("./config");
const logger = require("./logger");
const cryptoUtils = require("./crypto");
const fileHelpers = require("./file-helpers");
const permissionHelpers = require("./permission-helpers");
const settingsHelpers = require("./settings-helpers");
const settingsDb = require("./settings-db");
const mountHelpers = require("./mount-helpers");
const taskHelpers = require("./task-helpers");
const fileMonitorHelpers = require("./file-monitor-helpers");

module.exports = {
  ...constants,
  DEFAULT_SETTINGS: defaultSettings,
  ...config,
  ...logger,
  ...cryptoUtils,
  ...fileHelpers,
  ...permissionHelpers,
  ...settingsHelpers,
  ...settingsDb,
  ...mountHelpers,
  ...taskHelpers,
  ...fileMonitorHelpers
};
