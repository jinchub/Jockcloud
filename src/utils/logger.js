const fs = require("fs");
const { APP_LOG_FILE, ERROR_LOG_FILE, LOG_MAX_STRING_LENGTH, LOG_MAX_OBJECT_KEYS, LOG_MAX_ARRAY_ITEMS, LOG_MAX_DEPTH } = require("./constants");

const originalConsole = {
  log: console.log.bind(console),
  info: typeof console.info === "function" ? console.info.bind(console) : console.log.bind(console),
  warn: typeof console.warn === "function" ? console.warn.bind(console) : console.log.bind(console),
  error: console.error.bind(console)
};

const LOG_LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

let currentLogLevel = null;
let consolePatched = false;

const normalizeLogLevel = (value) => {
  const level = String(value || "").trim().toLowerCase();
  if (level === "debug" || level === "info" || level === "warn" || level === "error" || level === "silent") {
    return level;
  }
  if (level === "none" || level === "off") {
    return "silent";
  }
  return "info";
};

const getLogLevel = () => {
  if (currentLogLevel) return currentLogLevel;
  return normalizeLogLevel(process.env.LOG_LEVEL);
};

const setLogLevel = (level) => {
  currentLogLevel = normalizeLogLevel(level);
  return currentLogLevel;
};

const isLogLevelEnabled = (level) => {
  const targetPriority = LOG_LEVEL_PRIORITY[normalizeLogLevel(level)];
  const currentPriority = LOG_LEVEL_PRIORITY[getLogLevel()];
  return targetPriority >= currentPriority;
};

const installConsoleLogLevel = () => {
  if (consolePatched) return;
  consolePatched = true;
  console.log = (...args) => {
    if (isLogLevelEnabled("info")) {
      originalConsole.log(...args);
    }
  };
  console.info = (...args) => {
    if (isLogLevelEnabled("info")) {
      originalConsole.info(...args);
    }
  };
  console.warn = (...args) => {
    if (isLogLevelEnabled("warn")) {
      originalConsole.warn(...args);
    }
  };
  console.error = (...args) => {
    if (isLogLevelEnabled("error")) {
      originalConsole.error(...args);
    }
  };
};

const safeJsonStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      message: "日志序列化失败",
      errorMessage: error.message
    });
  }
};

const writeLogLine = (level, message, meta = {}) => {
  const normalizedLevel = normalizeLogLevel(level);
  if (!isLogLevelEnabled(normalizedLevel)) {
    return;
  }
  const time = new Date().toISOString();
  const data = { time, level: normalizedLevel, message, ...meta };
  const line = `${safeJsonStringify(data)}\n`;
  const filePath = normalizedLevel === "error" ? ERROR_LOG_FILE : APP_LOG_FILE;
  try {
    if (normalizedLevel === "error") {
      fs.appendFileSync(filePath, line);
    } else {
      fs.appendFile(filePath, line, () => {});
    }
  } catch (error) {
    originalConsole.error(`[${time}] [ERROR] 日志写入失败`, error.message);
  }
  const detail = Object.keys(meta || {}).length > 0 ? ` ${safeJsonStringify(meta)}` : "";
  if (normalizedLevel === "error") {
    originalConsole.error(`[${time}] [${normalizedLevel.toUpperCase()}] ${message}${detail}`);
    return;
  }
  originalConsole.log(`[${time}] [${normalizedLevel.toUpperCase()}] ${message}${detail}`);
};

const logInfo = (message, meta = {}) => {
  writeLogLine("info", message, meta);
};

const logError = (message, meta = {}) => {
  writeLogLine("error", message, meta);
};

const summarizeForLog = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth >= LOG_MAX_DEPTH) return "[DepthLimited]";
  if (typeof value === "string") {
    if (value.length <= LOG_MAX_STRING_LENGTH) return value;
    return `${value.slice(0, LOG_MAX_STRING_LENGTH)}...[Truncated:${value.length}]`;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Buffer.isBuffer(value)) return `[Buffer:${value.length}]`;
  if (Array.isArray(value)) {
    const items = value.slice(0, LOG_MAX_ARRAY_ITEMS).map((item) => summarizeForLog(item, depth + 1));
    if (value.length > LOG_MAX_ARRAY_ITEMS) {
      items.push(`[MoreItems:${value.length - LOG_MAX_ARRAY_ITEMS}]`);
    }
    return items;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const keys = Object.keys(value);
    const result = {};
    keys.slice(0, LOG_MAX_OBJECT_KEYS).forEach((key) => {
      result[key] = summarizeForLog(value[key], depth + 1);
    });
    if (keys.length > LOG_MAX_OBJECT_KEYS) {
      result.__moreKeys = keys.length - LOG_MAX_OBJECT_KEYS;
    }
    return result;
  }
  return String(value);
};

module.exports = {
  normalizeLogLevel,
  getLogLevel,
  setLogLevel,
  isLogLevelEnabled,
  installConsoleLogLevel,
  safeJsonStringify,
  writeLogLine,
  logInfo,
  logError,
  summarizeForLog
};
