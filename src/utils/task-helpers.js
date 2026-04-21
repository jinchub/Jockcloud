const {
  ALLOWED_UPLOAD_TASK_STATUS,
  ALLOWED_SYNC_TASK_STATUS
} = require("./constants");

const { safeFileName } = require("./file-helpers");

const normalizeUploadTaskStatus = (value) => {
  const status = String(value || "").trim();
  if (ALLOWED_UPLOAD_TASK_STATUS.has(status)) {
    return status;
  }
  return "failed";
};

const normalizeUploadTaskItem = (task) => {
  if (!task || typeof task !== "object") return null;
  const id = String(task.id || "").trim();
  const name = String(task.name || "").trim();
  if (!id || !name) return null;
  const size = Number(task.size || 0);
  const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
  const startedAtDate = task.startedAt ? new Date(task.startedAt) : new Date();
  const startedAt = Number.isNaN(startedAtDate.getTime()) ? new Date() : startedAtDate;
  return {
    id,
    name: safeFileName(name),
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : 0,
    startedAt,
    targetPath: String(task.targetPath || "/"),
    sourcePath: String(task.sourcePath || ""),
    progress: Number.isFinite(progress) ? Math.floor(progress) : 0,
    status: normalizeUploadTaskStatus(task.status)
  };
};

const normalizeTransferTaskType = (value) => {
  const taskType = String(value || "").trim().toLowerCase();
  if (taskType === "download") {
    return "download";
  }
  return "upload";
};

const normalizeSyncTaskStatus = (value) => {
  const status = String(value || "").trim();
  if (ALLOWED_SYNC_TASK_STATUS.has(status)) {
    return status;
  }
  return "idle";
};

const normalizeSyncTaskType = (value) => {
  return String(value || "").trim() === "schedule" ? "schedule" : "once";
};

const normalizeSyncDirection = (value) => {
  const direction = String(value || "").trim();
  if (direction === "remote_to_local" || direction === "bidirectional") {
    return direction;
  }
  return "local_to_remote";
};

const normalizeSyncScheduleUnit = (value) => {
  const unit = String(value || "").trim();
  if (unit === "hour" || unit === "day" || unit === "week" || unit === "month" || unit === "time_point") {
    return unit;
  }
  return "minute";
};

const normalizeSyncScheduleTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const matched = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (matched) return `${matched[1]}:${matched[2]}`;
  const date = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const normalizeSyncScheduleDateType = (value) => {
  const dateType = String(value || "").trim();
  if (dateType === "weekly" || dateType === "monthly") {
    return dateType;
  }
  return "daily";
};

const normalizeSyncScheduleDateValue = (value, dateType = "daily") => {
  if (dateType === "weekly") {
    return Math.max(1, Math.min(7, Math.floor(Number(value || 1))));
  }
  if (dateType === "monthly") {
    return Math.max(1, Math.min(31, Math.floor(Number(value || 1))));
  }
  return 1;
};

const normalizeSyncScheduleAt = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeSyncEmptyDirMode = (value) => {
  return String(value || "").trim() === "1" || value === true ? 1 : 0;
};

const normalizeSyncFileUpdateRule = (value) => {
  const rule = String(value || "").trim();
  if (rule === "new_only" || rule === "modified_only") {
    return rule;
  }
  return "all";
};

const normalizeSyncDeleteRule = (value) => {
  const rule = String(value || "").trim();
  if (rule === "sync_delete" || rule === "mirror") {
    return rule;
  }
  return "keep";
};

const normalizeSyncTaskItem = (task) => {
  if (!task || typeof task !== "object") return null;
  const id = String(task.id || "").trim();
  const name = String(task.name || "").trim();
  if (!id || !name) return null;
  const type = normalizeSyncTaskType(task.type);
  const scheduleValue = Math.max(1, Math.floor(Number(task.scheduleValue || 1)));
  const createdAtDate = task.createdAt ? new Date(task.createdAt) : new Date();
  const lastRunAtDate = task.lastRunAt ? new Date(task.lastRunAt) : null;
  const nextRunAtDate = task.nextRunAt ? new Date(task.nextRunAt) : null;
  const detailAtDate = task.detailAt ? new Date(task.detailAt) : null;
  return {
    id,
    name: safeFileName(name),
    localDir: String(task.localDir || "/").slice(0, 512),
    remoteMountId: String(task.remoteMountId || "").trim(),
    remoteMountName: String(task.remoteMountName || "").slice(0, 255),
    remoteDir: String(task.remoteDir || "/").slice(0, 512),
    direction: normalizeSyncDirection(task.direction),
    type,
    scheduleValue: Number.isFinite(scheduleValue) ? scheduleValue : 1,
    scheduleUnit: normalizeSyncScheduleUnit(task.scheduleUnit),
    scheduleTime: normalizeSyncScheduleTime(task.scheduleTime),
    scheduleAt: normalizeSyncScheduleAt(task.scheduleAt || task.scheduleDateTime || task.scheduleTime),
    scheduleDateType: normalizeSyncScheduleDateType(task.scheduleDateType),
    scheduleDateValue: normalizeSyncScheduleDateValue(task.scheduleDateValue, task.scheduleDateType),
    syncEmptyDir: normalizeSyncEmptyDirMode(task.syncEmptyDir),
    fileUpdateRule: normalizeSyncFileUpdateRule(task.fileUpdateRule),
    deleteRule: normalizeSyncDeleteRule(task.deleteRule),
    status: normalizeSyncTaskStatus(task.status),
    detail: String(task.detail || "").slice(0, 12000),
    detailStatus: normalizeSyncTaskStatus(task.detailStatus || task.status),
    detailAt: detailAtDate && !Number.isNaN(detailAtDate.getTime()) ? detailAtDate : new Date(),
    createdAt: Number.isNaN(createdAtDate.getTime()) ? new Date() : createdAtDate,
    lastRunAt: lastRunAtDate && !Number.isNaN(lastRunAtDate.getTime()) ? lastRunAtDate : null,
    nextRunAt: nextRunAtDate && !Number.isNaN(nextRunAtDate.getTime()) ? nextRunAtDate : null
  };
};

const getSyncDirectionText = (direction) => {
  if (direction === "remote_to_local") return "远端同步本地";
  if (direction === "bidirectional") return "双向同步";
  return "本地同步远端";
};

const getSyncScheduleIntervalMs = (task) => {
  const value = Math.max(1, Number(task.scheduleValue || 1));
  if (task.scheduleUnit === "month") return value * 30 * 24 * 60 * 60 * 1000;
  if (task.scheduleUnit === "week") return value * 7 * 24 * 60 * 60 * 1000;
  if (task.scheduleUnit === "day") return value * 24 * 60 * 60 * 1000;
  if (task.scheduleUnit === "hour") return value * 60 * 60 * 1000;
  return value * 60 * 1000;
};

const getSyncTaskNextRunAt = (task, fromInput = new Date()) => {
  if (!task || normalizeSyncTaskType(task.type) !== "schedule") return null;
  const baseDate = fromInput instanceof Date ? new Date(fromInput.getTime()) : new Date(fromInput);
  const baseTime = Number.isNaN(baseDate.getTime()) ? Date.now() : baseDate.getTime();
  if (normalizeSyncScheduleUnit(task.scheduleUnit) === "time_point") {
    const scheduleAt = normalizeSyncScheduleAt(task.scheduleAt || task.scheduleDateTime || task.scheduleTime);
    if (!scheduleAt) return null;
    if (scheduleAt.getTime() <= baseTime) return null;
    return scheduleAt;
  }
  return new Date(baseTime + getSyncScheduleIntervalMs(task));
};

const formatSyncDetailTime = (dateInput) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16).replace("T", " ");
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatSyncItemsLine = (label, items, limit = 10) => {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return "";
  const shown = list.slice(0, Math.max(1, limit));
  const moreCount = list.length - shown.length;
  return `${label}：${shown.join("、")}${moreCount > 0 ? ` 等${moreCount}项` : ""}`;
};

const syncTaskLockKey = (userId, taskId) => `${Number(userId) || 0}:${String(taskId || "")}`;

const normalizeSyncLocalDirPath = (value) => {
  const parts = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((item) => String(item || "").trim())
    .filter((item) => item && item !== "." && item !== "..");
  if (!parts.length) return "/";
  return `/${parts.join("/")}`;
};

const resolveTransferTaskTypeByRequest = (req) => {
  if (req && req.query && req.query.taskType !== undefined) {
    return normalizeTransferTaskType(req.query.taskType);
  }
  if (req && req.body && req.body.taskType !== undefined) {
    return normalizeTransferTaskType(req.body.taskType);
  }
  return "upload";
};

const getTransferTaskText = (taskType) => {
  return normalizeTransferTaskType(taskType) === "download" ? "下载任务" : "上传任务";
};

module.exports = {
  normalizeUploadTaskStatus,
  normalizeUploadTaskItem,
  normalizeTransferTaskType,
  normalizeSyncTaskStatus,
  normalizeSyncTaskType,
  normalizeSyncDirection,
  normalizeSyncScheduleUnit,
  normalizeSyncScheduleTime,
  normalizeSyncScheduleDateType,
  normalizeSyncScheduleDateValue,
  normalizeSyncScheduleAt,
  normalizeSyncEmptyDirMode,
  normalizeSyncFileUpdateRule,
  normalizeSyncDeleteRule,
  normalizeSyncTaskItem,
  getSyncDirectionText,
  getSyncScheduleIntervalMs,
  getSyncTaskNextRunAt,
  formatSyncDetailTime,
  formatSyncItemsLine,
  syncTaskLockKey,
  normalizeSyncLocalDirPath,
  resolveTransferTaskTypeByRequest,
  getTransferTaskText
};
