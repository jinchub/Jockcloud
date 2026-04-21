const fs = require("fs");
const { APP_LOG_FILE, ERROR_LOG_FILE, LOG_MAX_STRING_LENGTH, LOG_MAX_OBJECT_KEYS, LOG_MAX_ARRAY_ITEMS, LOG_MAX_DEPTH } = require("./constants");

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
  const time = new Date().toISOString();
  const data = { time, level, message, ...meta };
  const line = `${safeJsonStringify(data)}\n`;
  const filePath = level === "error" ? ERROR_LOG_FILE : APP_LOG_FILE;
  try {
    if (level === "error") {
      fs.appendFileSync(filePath, line);
    } else {
      fs.appendFile(filePath, line, () => {});
    }
  } catch (error) {
    console.error(`[${time}] [ERROR] 日志写入失败`, error.message);
  }
  const detail = Object.keys(meta || {}).length > 0 ? ` ${safeJsonStringify(meta)}` : "";
  if (level === "error") {
    console.error(`[${time}] [${level.toUpperCase()}] ${message}${detail}`);
    return;
  }
  console.log(`[${time}] [${level.toUpperCase()}] ${message}${detail}`);
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
  safeJsonStringify,
  writeLogLine,
  logInfo,
  logError,
  summarizeForLog
};
