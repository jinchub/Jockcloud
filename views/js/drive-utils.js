// Utils
const formatSize = (size) => {
  if (!size || size === "0") return "-";
  const s = Number(size);
  if (s < 1024) return `${s} B`;
  if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)} KB`;
  if (s < 1024 * 1024 * 1024) return `${(s / 1024 / 1024).toFixed(1)} MB`;
  if (s < 1024 * 1024 * 1024 * 1024) return `${(s / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${(s / 1024 / 1024 / 1024 / 1024).toFixed(1)} TB`;
};

const getShareCodeMode = () => {
  const selected = document.querySelector("input[name='shareCodeMode']:checked");
  return selected ? String(selected.value || "none") : "none";
};

let latestSharePayload = null;
let selectedShareExpireType = "7d";

const resetShareModalState = () => {
  if (shareForm) {
    shareForm.reset();
  }
  selectedShareExpireType = "7d";
  if (shareExpireOptionList) {
    shareExpireOptionList.querySelectorAll(".share-expire-option").forEach((item) => {
      item.classList.toggle("active", item.dataset.expireType === selectedShareExpireType);
    });
  }
  if (shareCustomCodeInput) {
    shareCustomCodeInput.value = "";
    shareCustomCodeInput.style.display = "none";
  }
  if (shareResultBox) {
    shareResultBox.style.display = "none";
  }
  if (shareLinkText) {
    shareLinkText.textContent = "";
    shareLinkText.href = "#";
  }
  if (shareCodeText) {
    shareCodeText.textContent = "无";
  }
  if (shareExpireText) {
    shareExpireText.textContent = "";
  }
  latestSharePayload = null;
  if (generateShareBtn) {
    generateShareBtn.textContent = "生成分享链接";
    generateShareBtn.dataset.mode = "generate";
  }
};

const formatQuotaSummary = (stats) => {
  if (!stats) return "-";
  const used = Number(stats.totalSize || 0);
  const quota = Number(stats.quota || -1);
  if (quota === -1) {
    return `${formatSize(used)} / ∞`;
  }
  return `${formatSize(used)} / ${formatSize(quota)}`;
};

const getDefaultAvatarByUser = (user) => {
  const name = user && user.username ? user.username : "User";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
};

const normalizeAvatarFormatList = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,，\s]+/g)
      .filter(Boolean);
  const allowed = new Set(["jpg", "png", "webp", "bmp", "gif"]);
  const result = [];
  const seen = new Set();
  source.forEach((item) => {
    let ext = String(item || "").trim().toLowerCase().replace(/^\./, "");
    if (ext === "jpeg") ext = "jpg";
    if (!ext || !allowed.has(ext) || seen.has(ext)) return;
    seen.add(ext);
    result.push(ext);
  });
  return result.length > 0 ? result : DEFAULT_AVATAR_UPLOAD_FORMATS.slice();
};

const normalizeUploadAllowedExtSet = (rules) => {
  if (!rules || typeof rules !== "object") return null;
  const extSet = new Set();
  Object.values(rules).forEach((item) => {
    const formats = Array.isArray(item && item.formats) ? item.formats : [];
    formats.forEach((format) => {
      const ext = String(format || "").trim().toLowerCase().replace(/^\./, "");
      if (!ext || !/^[a-z0-9]+$/.test(ext)) return;
      extSet.add(ext);
    });
  });
  return extSet.size > 0 ? extSet : null;
};

const getUploadFileExtByName = (name) => {
  const normalizedName = String(name || "").trim().toLowerCase();
  const dotIndex = normalizedName.lastIndexOf(".");
  if (dotIndex <= -1 || dotIndex === normalizedName.length - 1) return "";
  return normalizedName.slice(dotIndex + 1);
};

const collectUnsupportedUploadItems = (items) => {
  if (!(state.uploadAllowedExtSet instanceof Set) || state.uploadAllowedExtSet.size === 0) return [];
  const unsupported = [];
  items.forEach((item) => {
    const file = item && item.file ? item.file : null;
    if (!file) return;
    const ext = getUploadFileExtByName(file.name);
    if (!ext || !state.uploadAllowedExtSet.has(ext)) {
      unsupported.push(item);
    }
  });
  return unsupported;
};

const showUnsupportedUploadFormatNotice = (items) => {
  if (!Array.isArray(items) || items.length === 0) return;
  const names = items.slice(0, 5).map((item) => String(item && item.file && item.file.name ? item.file.name : "").trim()).filter(Boolean);
  const suffix = items.length > names.length ? ` 等${items.length}个文件` : "";
  const detail = names.length > 0 ? `：${names.join("、")}${suffix}` : "";
  alert(`上传的文件格式不支持${detail}`);
};

const getAvatarFormatFromFile = (file) => {
  if (!file) return "";
  const mime = String(file.type || "").toLowerCase();
  if (AVATAR_MIME_FORMAT_MAP[mime]) return AVATAR_MIME_FORMAT_MAP[mime];
  const name = String(file.name || "").toLowerCase();
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return "";
  let ext = name.slice(dotIndex + 1);
  if (ext === "jpeg") ext = "jpg";
  return ext;
};

const getAvatarCropOutputConfig = () => {
  if (state.avatarUploadFormats.includes("png")) {
    return { mime: "image/png", ext: "png", supported: true };
  }
  if (state.avatarUploadFormats.includes("jpg")) {
    return { mime: "image/jpeg", ext: "jpg", supported: true };
  }
  if (state.avatarUploadFormats.includes("webp")) {
    return { mime: "image/webp", ext: "webp", supported: true };
  }
  return { mime: "image/png", ext: "png", supported: false };
};

const avatarCropState = {
  image: null,
  minScale: 1,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragOffsetX: 0,
  dragOffsetY: 0,
  useLocalFile: false
};

const getAvatarCropContext = () => {
  if (!profileAvatarCropCanvas) return null;
  return profileAvatarCropCanvas.getContext("2d");
};

const clampAvatarCropOffset = () => {
  if (!profileAvatarCropCanvas || !avatarCropState.image) return;
  const canvasWidth = profileAvatarCropCanvas.width;
  const canvasHeight = profileAvatarCropCanvas.height;
  const drawWidth = avatarCropState.image.width * avatarCropState.scale;
  const drawHeight = avatarCropState.image.height * avatarCropState.scale;
  const minOffsetX = Math.min(0, canvasWidth - drawWidth);
  const minOffsetY = Math.min(0, canvasHeight - drawHeight);
  avatarCropState.offsetX = Math.min(0, Math.max(minOffsetX, avatarCropState.offsetX));
  avatarCropState.offsetY = Math.min(0, Math.max(minOffsetY, avatarCropState.offsetY));
};

const drawAvatarCropCanvas = () => {
  const ctx = getAvatarCropContext();
  if (!ctx || !profileAvatarCropCanvas) return;
  const canvasWidth = profileAvatarCropCanvas.width;
  const canvasHeight = profileAvatarCropCanvas.height;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "#f7f8fa";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  if (!avatarCropState.image) return;
  clampAvatarCropOffset();
  const drawWidth = avatarCropState.image.width * avatarCropState.scale;
  const drawHeight = avatarCropState.image.height * avatarCropState.scale;
  ctx.drawImage(avatarCropState.image, avatarCropState.offsetX, avatarCropState.offsetY, drawWidth, drawHeight);
};

const resetAvatarCropCanvas = (imageUrl) => {
  if (!imageUrl) {
    avatarCropState.image = null;
    avatarCropState.useLocalFile = false;
    drawAvatarCropCanvas();
    return;
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    if (!profileAvatarCropCanvas) return;
    const fitScale = Math.max(profileAvatarCropCanvas.width / image.width, profileAvatarCropCanvas.height / image.height);
    avatarCropState.image = image;
    avatarCropState.minScale = fitScale;
    avatarCropState.scale = fitScale;
    avatarCropState.offsetX = (profileAvatarCropCanvas.width - image.width * fitScale) / 2;
    avatarCropState.offsetY = (profileAvatarCropCanvas.height - image.height * fitScale) / 2;
    if (profileAvatarZoomRange) {
      profileAvatarZoomRange.value = "100";
    }
    drawAvatarCropCanvas();
  };
  image.onerror = () => {
    avatarCropState.image = null;
    drawAvatarCropCanvas();
  };
  image.src = imageUrl;
};

const updateAvatarPreviewByUrl = () => {
  const next = profileAvatarUrlInput ? profileAvatarUrlInput.value.trim() : "";
  if (profileAvatarPreview) {
    profileAvatarPreview.src = next || getDefaultAvatarByUser(state.currentUser);
  }
  if (next) {
    avatarCropState.useLocalFile = false;
    resetAvatarCropCanvas(next);
  }
};

const updateAvatarUploadUiHints = () => {
  const formatText = state.avatarUploadFormats.join("/");
  if (profileAvatarUploadLabel) {
    profileAvatarUploadLabel.textContent = `本地上传 (最大${state.avatarUploadSizeMb}MB)`;
  }
  if (profileAvatarUploadTip) {
    profileAvatarUploadTip.textContent = `支持格式: ${formatText}`;
  }
};

const readLocalAvatarFile = (file) => {
  if (!file) return;
  const ext = getAvatarFormatFromFile(file);
  if (!state.avatarUploadFormats.includes(ext)) {
    alert(`仅支持${state.avatarUploadFormats.join("、")}格式图片`);
    if (profileAvatarFileInput) profileAvatarFileInput.value = "";
    return;
  }
  if (file.size > state.avatarUploadMaxSizeBytes) {
    alert(`头像文件不能超过${state.avatarUploadSizeMb}MB`);
    if (profileAvatarFileInput) profileAvatarFileInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || "");
    avatarCropState.useLocalFile = true;
    if (profileAvatarUrlInput) profileAvatarUrlInput.value = "";
    if (profileAvatarPreview) profileAvatarPreview.src = result;
    resetAvatarCropCanvas(result);
  };
  reader.readAsDataURL(file);
};

const getCroppedAvatarBlob = (mime = "image/png") => new Promise((resolve) => {
  if (!profileAvatarCropCanvas || !avatarCropState.image) {
    resolve(null);
    return;
  }
  profileAvatarCropCanvas.toBlob((blob) => resolve(blob), mime, 0.95);
});

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const d = new Date(dateString);
  const datePart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `${datePart} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const formatDateDay = (dateString) => {
  if (!dateString) return "-";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const formatRecycleAutoDeleteText = (deletedAt) => {
  if (!deletedAt) return "-";
  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) return "-";
  const deadline = deletedTime + (30 * 24 * 60 * 60 * 1000);
  const diff = deadline - Date.now();
  if (diff <= 0) return "已到期";
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const days = Math.floor(diff / dayMs);
  const hours = Math.floor((diff % dayMs) / hourMs);
  if (days > 0) {
    return `${days}天${hours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时`;
  }
  const minutes = Math.max(1, Math.ceil(diff / minuteMs));
  return `${minutes}分钟`;
};

const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
));

const truncateNameWithDots = (value, maxLength = 30) => {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  const keepLength = Math.max(1, maxLength - 3);
  return `${text.slice(0, keepLength)}···`;
};

const openFilePreview = (entry) => {
  if (!window.DrivePreview || typeof window.DrivePreview.open !== "function") return;
  window.DrivePreview.open(entry);
};

const getCurrentBasePath = () => {
  if (!state.path.length) return "/";
  return `/${state.path.map((item) => item.name).join("/")}`;
};

const joinFilePath = (basePath, name) => {
  const normalizedBase = String(basePath || "/").trim() || "/";
  const entryName = String(name || "").trim();
  if (!entryName) return normalizedBase;
  if (normalizedBase === "/") return `/${entryName}`;
  return `${normalizedBase}/${entryName}`;
};

const getEntryFullPath = (entry) => {
  if (!entry) return "/";
  const entryName = String(entry.name || "").trim();
  if (!entryName) return "/";
  if (state.view === "recycle") {
    const originalDir = String(entry.originalDir || "我的文件").trim() || "我的文件";
    return joinFilePath(originalDir, entryName);
  }
  return joinFilePath(getCurrentBasePath(), entryName);
};

const resolveSelectedEntryDetails = (selected = []) => {
  if (!Array.isArray(selected) || selected.length === 0) return [];
  const byKey = new Map(state.entries.map((entry) => [entryKey(entry), entry]));
  return selected.map((item) => byKey.get(entryKey(item)) || item);
};

const buildDeleteConfirmMessageHtml = (entries = []) => {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return "确定删除所选文件吗？";
  const pathsHtml = list
    .map((entry) => {
      const fullPath = getEntryFullPath(entry);
      const targetName = String(entry && entry.name ? entry.name : "").trim();
      if (!targetName) {
        return `<div class="delete-confirm-target-path"><span class="delete-confirm-target-parent">${escapeHtml(fullPath)}</span></div>`;
      }
      const targetSuffix = `/${targetName}`;
      const parentPath = fullPath.endsWith(targetSuffix) ? fullPath.slice(0, fullPath.length - targetName.length) : fullPath;
      return `<div class="delete-confirm-target-path"><span class="delete-confirm-target-parent">${escapeHtml(parentPath)}</span><span class="delete-confirm-target-name">${escapeHtml(targetName)}</span></div>`;
    })
    .join("");
  return `确定删除以下内容吗？<div class="delete-confirm-target-list">${pathsHtml}</div>`;
};

const resolveUploadPathText = (basePath, relativePath) => {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return basePath;
  const folderPath = parts.slice(0, -1).join("/");
  return basePath === "/" ? `/${folderPath}` : `${basePath}/${folderPath}`;
};

const normalizeUploadSourcePath = (value) => String(value || "").replace(/\\/g, "/").trim();

const getUploadSourcePathFromItem = (uploadItem) => {
  if (!uploadItem || !uploadItem.file) return "";
  const file = uploadItem.file;
  const fromItem = normalizeUploadSourcePath(uploadItem.sourcePath);
  if (fromItem) return fromItem;
  const fromFilePath = normalizeUploadSourcePath(file.path);
  if (fromFilePath) return fromFilePath;
  const fromRelative = normalizeUploadSourcePath(uploadItem.relativePath || file.webkitRelativePath);
  if (fromRelative) return fromRelative;
  return normalizeUploadSourcePath(file.name);
};

const createUploadItem = (file, relativePath = "", sourcePath = "") => ({
  file,
  relativePath: String(relativePath || ""),
  sourcePath: normalizeUploadSourcePath(sourcePath || file?.path || relativePath || file?.webkitRelativePath || file?.name)
});

const isUploadItemSourcePathValid = (task, uploadItem) => {
  if (!task || !uploadItem || !uploadItem.file) return false;
  const expectedPath = normalizeUploadSourcePath(task.sourcePath);
  if (!expectedPath) return true;
  const actualPath = getUploadSourcePathFromItem(uploadItem);
  if (!actualPath) return false;
  return expectedPath === actualPath;
};

const getUploadStatusText = (task) => {
  if (task.status === "pending") return "待上传";
  if (task.status === "completed") return "已完成";
  if (task.status === "canceled") return "已取消";
  if (task.status === "paused") return "已暂停";
  const speedText = task.speed > 0 ? ` | ${formatSize(task.speed)}/s` : "";
  return `${task.progress}%${speedText}`;
};

const normalizeUploadTaskStatus = (status) => {
  if (status === "pending" || status === "uploading" || status === "downloading" || status === "completed" || status === "failed" || status === "canceled" || status === "paused") {
    return status;
  }
  return "failed";
};

const getTransferTaskApiUrl = (taskType) => `/api/upload-tasks?taskType=${taskType === "download" ? "download" : "upload"}`;

const getUploadTaskPayload = () => state.uploadTasks.map((task) => ({
  id: String(task.id || ""),
  name: String(task.name || ""),
  size: Number(task.size || 0),
  startedAt: task.startedAt || new Date().toISOString(),
  targetPath: String(task.targetPath || "/"),
  sourcePath: String(task.sourcePath || ""),
  progress: Number(task.progress || 0),
  status: normalizeUploadTaskStatus(task.status)
}));

let uploadTasksSaveTimer = 0;
const uploadTaskRuntimePayloadMap = new Map();
let uploadActiveWorkerCount = 0;
const persistUploadTasks = async () => {
  try {
    await request(getTransferTaskApiUrl("upload"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: getUploadTaskPayload() })
    });
  } catch (e) {}
};

const getDownloadTaskPayload = () => state.downloadTasks.map((task) => ({
  id: String(task.id || ""),
  name: String(task.name || ""),
  size: Number(task.size || 0),
  startedAt: task.startedAt || new Date().toISOString(),
  targetPath: String(task.sourcePath || "/"),
  progress: Number(task.progress || 0),
  downloaded: Number(task.downloaded || 0),
  speed: Number(task.speed || 0),
  status: normalizeUploadTaskStatus(task.status)
}));

let downloadTasksSaveTimer = 0;
const persistDownloadTasks = async () => {
  try {
    await request(getTransferTaskApiUrl("download"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: getDownloadTaskPayload() })
    });
  } catch (e) {}
};

const schedulePersistDownloadTasks = () => {
  if (downloadTasksSaveTimer) {
    clearTimeout(downloadTasksSaveTimer);
  }
  downloadTasksSaveTimer = window.setTimeout(() => {
    downloadTasksSaveTimer = 0;
    persistDownloadTasks();
  }, 300);
};

const schedulePersistUploadTasks = () => {
  if (uploadTasksSaveTimer) {
    clearTimeout(uploadTasksSaveTimer);
  }
  uploadTasksSaveTimer = window.setTimeout(() => {
    uploadTasksSaveTimer = 0;
    persistUploadTasks();
  }, 300);
};

const normalizePageSize = (value) => {
  const next = Number(value);
  if (PAGE_SIZE_OPTIONS.includes(next)) return next;
  return 20;
};

const getFileQueryKey = () => JSON.stringify({
  view: state.view,
  currentFolderId: state.currentFolderId,
  keyword: state.keyword,
  searchScope: state.searchScope,
  category: state.category,
  sortBy: state.sortBy,
  order: state.order
});

const getPaginationInfo = (total, currentPage, pageSize) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize;
  const endIndex = Math.min(total, startIndex + pageSize);
  return { totalPages, page, startIndex, endIndex };
};

const getCurrentFilePageEntries = () => {
  return state.entries;
};

const renderFilePagination = () => {
  const { totalPages, page, startIndex, endIndex } = getPaginationInfo(state.entriesTotal, state.filePage, state.filePageSize);
  state.filePage = page;
  if (filePaginationSummaryEl) {
    const start = state.entriesTotal === 0 ? 0 : startIndex + 1;
    filePaginationSummaryEl.textContent = `共 ${state.entriesTotal} 条，当前 ${start}-${endIndex}`;
  }
  if (filePageInfoEl) {
    filePageInfoEl.textContent = `${page} / ${totalPages}`;
  }
  if (filePrevPageBtn) {
    filePrevPageBtn.disabled = page <= 1;
  }
  if (fileNextPageBtn) {
    fileNextPageBtn.disabled = page >= totalPages;
  }
  if (filePageSizeSelect) {
    filePageSizeSelect.value = String(state.filePageSize);
  }
};

const renderUploadTaskPagination = (total) => {
  const { totalPages, page, startIndex, endIndex } = getPaginationInfo(total, state.uploadTasksPage, state.uploadTasksPageSize);
  state.uploadTasksPage = page;
  if (uploadTaskPaginationSummaryEl) {
    const start = total === 0 ? 0 : startIndex + 1;
    uploadTaskPaginationSummaryEl.textContent = `共 ${total} 条，当前 ${start}-${endIndex}`;
  }
  if (uploadTaskPageInfoEl) {
    uploadTaskPageInfoEl.textContent = `${page} / ${totalPages}`;
  }
  if (uploadTaskPrevPageBtn) {
    uploadTaskPrevPageBtn.disabled = page <= 1;
  }
  if (uploadTaskNextPageBtn) {
    uploadTaskNextPageBtn.disabled = page >= totalPages;
  }
  if (uploadTaskPageSizeSelect) {
    uploadTaskPageSizeSelect.value = String(state.uploadTasksPageSize);
  }
  return { startIndex, endIndex };
};

const renderDownloadTaskPagination = (total) => {
  const { totalPages, page, startIndex, endIndex } = getPaginationInfo(total, state.downloadTasksPage, state.downloadTasksPageSize);
  state.downloadTasksPage = page;
  if (downloadTaskPaginationSummaryEl) {
    const start = total === 0 ? 0 : startIndex + 1;
    downloadTaskPaginationSummaryEl.textContent = `共 ${total} 条，当前 ${start}-${endIndex}`;
  }
  if (downloadTaskPageInfoEl) {
    downloadTaskPageInfoEl.textContent = `${page} / ${totalPages}`;
  }
  if (downloadTaskPrevPageBtn) {
    downloadTaskPrevPageBtn.disabled = page <= 1;
  }
  if (downloadTaskNextPageBtn) {
    downloadTaskNextPageBtn.disabled = page >= totalPages;
  }
  if (downloadTaskPageSizeSelect) {
    downloadTaskPageSizeSelect.value = String(state.downloadTasksPageSize);
  }
  return { startIndex, endIndex };
};

const renderAdminTablePagination = ({
  total,
  page,
  pageSize,
  summaryEl,
  pageInfoEl,
  prevBtn,
  nextBtn,
  pageSizeSelect
}) => {
  const { totalPages, page: safePage, startIndex, endIndex } = getPaginationInfo(total, page, pageSize);
  if (summaryEl) {
    const start = total === 0 ? 0 : startIndex + 1;
    summaryEl.textContent = `共 ${total} 条，当前 ${start}-${endIndex}`;
  }
  if (pageInfoEl) {
    pageInfoEl.textContent = `${safePage} / ${totalPages}`;
  }
  if (prevBtn) {
    prevBtn.disabled = safePage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = safePage >= totalPages;
  }
  if (pageSizeSelect) {
    pageSizeSelect.value = String(pageSize);
  }
  return { totalPages, page: safePage, startIndex, endIndex };
};

const loadUploadTasks = async () => {
  try {
    const res = await request(getTransferTaskApiUrl("upload"));
    if (!res.ok) return;
    const parsed = await res.json();
    if (!Array.isArray(parsed)) return;
    state.uploadTasks = parsed.map((task) => ({
      id: String(task.id || `${Date.now()}-${Math.random()}`),
      name: String(task.name || ""),
      size: Number(task.size || 0),
      startedAt: task.startedAt || new Date().toISOString(),
      targetPath: String(task.targetPath || "/"),
      sourcePath: String(task.sourcePath || ""),
      progress: Number(task.progress || 0),
      status: task.status === "uploading" || task.status === "pending" ? "paused" : normalizeUploadTaskStatus(task.status),
      xhr: null,
      abortController: null,
      cancelRequested: false,
      uploadSessionId: "",
      uploaded: 0,
      lastUpdateTime: 0,
      lastUploaded: 0,
      speed: 0
    }));
  } catch (e) {}
};

const loadDownloadTasks = async () => {
  try {
    const res = await request(getTransferTaskApiUrl("download"));
    if (!res.ok) return;
    const parsed = await res.json();
    if (!Array.isArray(parsed)) return;
    state.downloadTasks = parsed.map((task) => ({
      id: String(task.id || `${Date.now()}-${Math.random()}`),
      entryId: String(task.entryId || ""),
      entryType: String(task.entryType || "file"),
      name: String(task.name || ""),
      size: Number(task.size || 0),
      sourcePath: String(task.targetPath || "/"),
      startedAt: task.startedAt || new Date().toISOString(),
      status: task.status === "downloading"
        ? "downloading"
        : task.status === "pending"
          ? "pending"
          : task.status === "paused"
            ? "paused"
            : task.status === "browser_downloading"
              ? "browser_downloading"
              : task.status === "completed"
                ? "completed"
                : "canceled",
      progress: Number(task.progress || 0),
      downloaded: Number(task.downloaded || 0),
      speed: Number(task.speed || 0)
    }));
  } catch (e) {}
};

const getDownloadStatusText = (task) => {
  if (task.status === "pending") return "待下载";
  if (task.status === "completed") return "已完成";
  if (task.status === "canceled") return "已取消";
  if (task.status === "paused") return "已暂停";
  if (task.status === "browser_downloading") return "请在浏览器中查看下载详情";
  if (task.status === "downloading") {
    const progressText = task.progress > 0 ? ` ${task.progress}%` : "";
    const speedText = task.speed > 0 ? ` | ${formatSize(task.speed)}/s` : "";
    const downloadedText = task.downloaded > 0 && task.size > 0 ? ` | ${formatSize(task.downloaded)}/${formatSize(task.size)}` : "";
    return `下载中${progressText}${speedText}${downloadedText}`;
  }
  return "下载中";
};

const getCancelableSelectedTransferTaskCount = () => {
  if (state.transferTaskTab === "upload") {
    const selectedSet = new Set(state.selectedUploadTaskIds);
    return state.uploadTasks.reduce((count, task) => {
      if (!selectedSet.has(task.id)) return count;
      return count + ((task.status === "pending" || task.status === "uploading") ? 1 : 0);
    }, 0);
  }
  const selectedSet = new Set(state.selectedDownloadTaskIds);
  return state.downloadTasks.reduce((count, task) => {
    if (!selectedSet.has(task.id)) return count;
    return count + ((task.status === "downloading" || task.status === "pending") ? 1 : 0);
  }, 0);
};

const getCanceledSelectedTransferTaskCount = () => {
  if (state.transferTaskTab === "upload") {
    const selectedSet = new Set(state.selectedUploadTaskIds);
    return state.uploadTasks.reduce((count, task) => {
      if (!selectedSet.has(task.id)) return count;
      return count + (task.status === "canceled" ? 1 : 0);
    }, 0);
  }
  const selectedSet = new Set(state.selectedDownloadTaskIds);
  return state.downloadTasks.reduce((count, task) => {
    if (!selectedSet.has(task.id)) return count;
    return count + (task.status === "canceled" ? 1 : 0);
  }, 0);
};

const renderTransferTaskHeader = () => {
  if (!uploadingCountEl || !completedCountEl || !pendingCountEl) return;
  const isUploadTab = state.transferTaskTab === "upload";
  const pendingUploadCount = state.uploadTasks.filter((task) => task.status === "pending").length;
  const uploadingCount = state.uploadTasks.filter((task) => task.status === "uploading").length;
  const uploadCompletedCount = state.uploadTasks.filter((task) => task.status === "completed").length;
  const pendingDownloadCount = state.downloadTasks.filter((task) => task.status === "pending").length;
  const downloadingCount = state.downloadTasks.filter((task) => task.status === "downloading" || task.status === "browser_downloading").length;
  const pausedDownloadCount = state.downloadTasks.filter((task) => task.status === "paused").length;
  const downloadCompletedCount = state.downloadTasks.filter((task) => task.status === "completed").length;
  
  // 更新上传和下载按钮显示
  const activeUploadCount = pendingUploadCount + uploadingCount;
  const activeDownloadCount = pendingDownloadCount + downloadingCount + pausedDownloadCount;
  
  if (transferUploadTabBtn) {
    if (activeUploadCount > 0) {
      transferUploadTabBtn.textContent = `上传任务 (${activeUploadCount})`;
    } else {
      transferUploadTabBtn.textContent = "上传任务";
    }
  }
  
  if (transferDownloadTabBtn) {
    if (activeDownloadCount > 0) {
      transferDownloadTabBtn.textContent = `下载任务 (${activeDownloadCount})`;
    } else {
      transferDownloadTabBtn.textContent = "下载任务";
    }
  }
  
  if (isUploadTab) {
    pendingCountEl.textContent = `待上传 ${pendingUploadCount}`;
    pendingCountEl.style.display = "inline";
    uploadingCountEl.textContent = `上传中 ${uploadingCount}`;
    completedCountEl.textContent = `已完成 ${uploadCompletedCount}`;
  } else {
    pendingCountEl.textContent = `待下载 ${pendingDownloadCount}`;
    pendingCountEl.style.display = "inline";
    uploadingCountEl.textContent = `下载中 ${downloadingCount + pausedDownloadCount}`;
    completedCountEl.textContent = `已完成 ${downloadCompletedCount}`;
  }
  const activeTaskCount = pendingUploadCount + uploadingCount + pendingDownloadCount + downloadingCount + pausedDownloadCount;
  if (uploadTasksCompletedBadge) {
    if (activeTaskCount > 0) {
      uploadTasksCompletedBadge.textContent = String(activeTaskCount);
      uploadTasksCompletedBadge.style.display = "inline-flex";
    } else {
      uploadTasksCompletedBadge.textContent = "";
      uploadTasksCompletedBadge.style.display = "none";
    }
  }
  
  if (clearCanceledTasksBtn) {
    const hasCanceledTasks = isUploadTab 
      ? state.uploadTasks.some(t => t.status === "canceled")
      : state.downloadTasks.some(t => t.status === "canceled");
    const selectedCount = isUploadTab ? state.selectedUploadTaskIds.length : state.selectedDownloadTaskIds.length;
    const canceledSelectedCount = getCanceledSelectedTransferTaskCount();
    clearCanceledTasksBtn.textContent = isUploadTab ? "清空已取消上传记录" : "清空已取消下载记录";
    clearCanceledTasksBtn.style.display = hasCanceledTasks ? "inline-flex" : "none";
    clearCanceledTasksBtn.disabled = selectedCount === 0 || canceledSelectedCount !== selectedCount;
  }

if (clearCanceledTasksBtn) {
  clearCanceledTasksBtn.onclick = async () => {
    const isUploadTab = state.transferTaskTab === "upload";
    const selectedIds = isUploadTab ? state.selectedUploadTaskIds.slice() : state.selectedDownloadTaskIds.slice();
    const selectedCount = selectedIds.length;
    const canceledSelectedCount = getCanceledSelectedTransferTaskCount();
    if (selectedCount === 0 || canceledSelectedCount !== selectedCount) {
      return;
    }
    const hasCanceledTasks = isUploadTab 
      ? state.uploadTasks.some(t => t.status === "canceled")
      : state.downloadTasks.some(t => t.status === "canceled");
      
    if (!hasCanceledTasks) {
      if (typeof window.showAppNotice === "function") {
        window.showAppNotice({ title: "提示", message: "没有已取消的记录", isError: true });
      } else {
        alert("没有已取消的记录");
      }
      return;
    }

    const confirmed = await showDeleteConfirm({
      title: "清空记录",
      message: isUploadTab ? `确定清空选中的 ${selectedCount} 条已取消上传记录吗？` : `确定清空选中的 ${selectedCount} 条已取消下载记录吗？`,
      desc: "清空后无法恢复"
    });
    if (!confirmed) return;

    if (isUploadTab) {
      const selectedIdSet = new Set(selectedIds);
      const canceledIds = state.uploadTasks
        .filter(t => t.status === "canceled" && selectedIdSet.has(t.id))
        .map(t => t.id);
      state.selectedUploadTaskIds = state.selectedUploadTaskIds.filter(id => !canceledIds.includes(id));
      state.uploadTasks = state.uploadTasks.filter(t => !(t.status === "canceled" && selectedIdSet.has(t.id)));
      renderUploadTasks();
      schedulePersistUploadTasks();
      return;
    }
    
    const selectedIdSet = new Set(selectedIds);
    const canceledIds = state.downloadTasks
      .filter(t => t.status === "canceled" && selectedIdSet.has(t.id))
      .map(t => t.id);
    state.selectedDownloadTaskIds = state.selectedDownloadTaskIds.filter(id => !canceledIds.includes(id));
    state.downloadTasks = state.downloadTasks.filter(t => !(t.status === "canceled" && selectedIdSet.has(t.id)));
    renderDownloadTasks();
    schedulePersistDownloadTasks();
  };
}

if (clearUploadTasksBtn) {
    const hasTasks = isUploadTab ? state.uploadTasks.length > 0 : state.downloadTasks.length > 0;
    clearUploadTasksBtn.textContent = isUploadTab ? "清空已完成上传记录" : "清空已完成下载记录";
    clearUploadTasksBtn.style.display = hasTasks ? "inline-flex" : "none";
  }
  if (cancelSelectedTransferTasksBtn) {
    const selectedCount = isUploadTab ? state.selectedUploadTaskIds.length : state.selectedDownloadTaskIds.length;
    const cancelableSelectedCount = getCancelableSelectedTransferTaskCount();
    cancelSelectedTransferTasksBtn.textContent = selectedCount > 0 ? `批量取消（${selectedCount}）` : "批量取消";
    cancelSelectedTransferTasksBtn.style.display = selectedCount > 0 ? "inline-flex" : "none";
    cancelSelectedTransferTasksBtn.disabled = selectedCount === 0 || cancelableSelectedCount !== selectedCount;
  }
  if (clearSelectedTransferTasksBtn) {
    const selectedCount = isUploadTab ? state.selectedUploadTaskIds.length : state.selectedDownloadTaskIds.length;
    clearSelectedTransferTasksBtn.textContent = selectedCount > 0 ? `批量清除（${selectedCount}）` : "批量清除";
    clearSelectedTransferTasksBtn.style.display = selectedCount > 0 ? "inline-flex" : "none";
    clearSelectedTransferTasksBtn.disabled = selectedCount === 0;
  }
};

const switchTransferTaskTab = (tab) => {
  state.transferTaskTab = tab === "download" ? "download" : "upload";
  if (transferUploadTabBtn) {
    transferUploadTabBtn.classList.toggle("active", state.transferTaskTab === "upload");
  }
  if (transferDownloadTabBtn) {
    transferDownloadTabBtn.classList.toggle("active", state.transferTaskTab === "download");
  }
  if (uploadTaskPanel) {
    uploadTaskPanel.classList.toggle("hidden", state.transferTaskTab !== "upload");
  }
  if (downloadTaskPanel) {
    downloadTaskPanel.classList.toggle("hidden", state.transferTaskTab !== "download");
  }
  if (transferTaskRefreshTip) {
    transferTaskRefreshTip.textContent = state.transferTaskTab === "upload" 
      ? "如果有文件正在上传中请勿刷新页面，避免任务中断" 
      : "小于100MB文件会出现在此下载列表中，大于100MB文件直接用浏览器下载，如果有文件正在下载中请勿刷新页面，避免任务中断";
  }
  renderTransferTaskHeader();
};

const sortUploadTasksForDisplay = (tasks = []) => {
  return tasks.slice().sort((a, b) => {
    const rankMap = {
      uploading: 0,
      pending: 1,
      paused: 2,
      completed: 3,
      canceled: 4
    };
    const rankA = Object.prototype.hasOwnProperty.call(rankMap, a.status) ? rankMap[a.status] : 9;
    const rankB = Object.prototype.hasOwnProperty.call(rankMap, b.status) ? rankMap[b.status] : 9;
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
};

const sortDownloadTasksForDisplay = (tasks = []) => {
  return tasks.slice().sort((a, b) => {
    const rankMap = {
      downloading: 0,
      browser_downloading: 0,
      pending: 1,
      paused: 1,
      completed: 2,
      canceled: 3
    };
    const rankA = Object.prototype.hasOwnProperty.call(rankMap, a.status) ? rankMap[a.status] : 9;
    const rankB = Object.prototype.hasOwnProperty.call(rankMap, b.status) ? rankMap[b.status] : 9;
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
};

const setUploadTaskSelected = (taskId, selected) => {
  const id = String(taskId || "").trim();
  if (!id) return;
  const nextSet = new Set(state.selectedUploadTaskIds);
  if (selected) {
    nextSet.add(id);
  } else {
    nextSet.delete(id);
  }
  state.selectedUploadTaskIds = Array.from(nextSet);
};

const setDownloadTaskSelected = (taskId, selected) => {
  const id = String(taskId || "").trim();
  if (!id) return;
  const nextSet = new Set(state.selectedDownloadTaskIds);
  if (selected) {
    nextSet.add(id);
  } else {
    nextSet.delete(id);
  }
  state.selectedDownloadTaskIds = Array.from(nextSet);
};

const renderUploadTasks = () => {
  if (!uploadTaskList) return;
  const orderedTasks = sortUploadTasksForDisplay(state.uploadTasks);
  const validIdSet = new Set(orderedTasks.map((task) => String(task.id || "")));
  state.selectedUploadTaskIds = state.selectedUploadTaskIds.filter((id) => validIdSet.has(id));
  const selectedSet = new Set(state.selectedUploadTaskIds);
  uploadTaskList.innerHTML = orderedTasks.map((task) => {
    let statusTop = getUploadStatusText(task);
    let hasProgress = task.status === "uploading" && task.progress > 0;
    
    return `
    <div class="upload-task-row" data-upload-task-id="${escapeHtml(task.id)}" data-upload-task-status="${escapeHtml(task.status)}">
      <div><input type="checkbox" data-upload-select="${escapeHtml(task.id)}" ${selectedSet.has(task.id) ? "checked" : ""}></div>
      <div class="upload-task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</div>
      <div>${formatSize(task.size)}</div>
      <div>${formatDate(task.startedAt)}</div>
      <div title="${escapeHtml(task.targetPath)}">${escapeHtml(task.targetPath)}</div>
      <div title="${escapeHtml(task.sourcePath || "-")}">${escapeHtml(task.sourcePath || "-")}</div>
      <div class="upload-task-progress">
        <div class="upload-progress-top">${escapeHtml(statusTop)}</div>
        ${hasProgress ? `<div class="upload-progress-bar"><div class="upload-progress-inner" style="width:${task.progress}%;"></div></div>` : ""}
      </div>
      <div class="upload-task-ops">
        ${isChunkUploadFileSize(task.size) && task.status === "uploading" ? `<button class="btn-sm" data-upload-pause="${escapeHtml(task.id)}">暂停</button>` : ""}
        ${isChunkUploadFileSize(task.size) && task.status === "paused" ? `<button class="btn-sm primary" data-upload-resume="${escapeHtml(task.id)}">继续</button>` : ""}
        ${task.status === "uploading" || task.status === "pending" || task.status === "paused" ? `<button class="btn-sm danger" data-upload-cancel="${escapeHtml(task.id)}">取消</button>` : ""}
        <button class="btn-sm" data-upload-delete="${escapeHtml(task.id)}">删除</button>
      </div>
    </div>
  `}).join("");
  if (uploadTaskSelectAllCheckbox) {
    const selectedCount = orderedTasks.reduce((count, item) => count + (selectedSet.has(item.id) ? 1 : 0), 0);
    uploadTaskSelectAllCheckbox.checked = orderedTasks.length > 0 && selectedCount === orderedTasks.length;
    uploadTaskSelectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < orderedTasks.length;
  }
  renderTransferTaskHeader();
};

const patchUploadTaskRow = (taskId) => {
  if (!uploadTaskList) return false;
  const task = state.uploadTasks.find((item) => item.id === taskId);
  if (!task) return false;
  const row = Array.from(uploadTaskList.querySelectorAll("[data-upload-task-id]")).find((item) => item.dataset.uploadTaskId === taskId);
  if (!row) return false;
  
  const progressTop = row.querySelector(".upload-progress-top");
  if (progressTop) {
    progressTop.textContent = getUploadStatusText(task);
  }
  
  const progressInner = row.querySelector(".upload-progress-inner");
  if (progressInner) {
    progressInner.style.width = `${task.progress}%`;
  }
  
  const hasProgress = task.status === "uploading" && task.progress > 0;
  const progressBar = row.querySelector(".upload-progress-bar");
  if (progressBar) {
    progressBar.style.display = hasProgress ? "" : "none";
  }
  
  const statusText = row.querySelector(".upload-status-text");
  if (statusText) {
    statusText.textContent = getUploadStatusText(task);
  }
  
  const ops = row.querySelector(".upload-task-ops");
  const prevStatus = String(row.dataset.uploadTaskStatus || "");
  if (ops && prevStatus !== task.status) {
    ops.innerHTML = `
      ${isChunkUploadFileSize(task.size) && task.status === "uploading" ? `<button class="btn-sm" data-upload-pause="${escapeHtml(task.id)}">暂停</button>` : ""}
      ${isChunkUploadFileSize(task.size) && task.status === "paused" ? `<button class="btn-sm primary" data-upload-resume="${escapeHtml(task.id)}">继续</button>` : ""}
      ${task.status === "uploading" || task.status === "pending" || task.status === "paused" ? `<button class="btn-sm danger" data-upload-cancel="${escapeHtml(task.id)}">取消</button>` : ""}
      <button class="btn-sm" data-upload-delete="${escapeHtml(task.id)}">删除</button>
    `;
  }
  row.dataset.uploadTaskStatus = task.status;
  return true;
};

const patchDownloadTaskRow = (taskId) => {
  if (!downloadTaskList) return false;
  const task = state.downloadTasks.find((item) => item.id === taskId);
  if (!task) return false;
  const row = downloadTaskList.querySelector(`[data-download-task-id="${escapeHtml(taskId)}"]`);
  if (!row) return false;
  
  const progressTop = row.querySelector(".upload-progress-top");
  if (progressTop) {
    progressTop.textContent = getDownloadStatusText(task);
  }
  
  const hasProgress = (task.status === "downloading" || task.status === "paused") && task.size > 0;
  let progressBar = row.querySelector(".upload-progress-bar");
  
  if (hasProgress && !progressBar) {
    // 如果需要显示进度条但不存在，创建它
    const progressContainer = row.querySelector(".upload-task-progress");
    if (progressContainer) {
      progressBar = document.createElement("div");
      progressBar.className = "upload-progress-bar";
      progressBar.innerHTML = `<div class="upload-progress-inner" style="width:${task.progress}%;"></div>`;
      progressContainer.appendChild(progressBar);
    }
  } else if (progressBar) {
    // 进度条存在，更新宽度或隐藏
    if (hasProgress) {
      progressBar.style.display = "";
      const progressInner = progressBar.querySelector(".upload-progress-inner");
      if (progressInner) {
        progressInner.style.width = `${task.progress}%`;
      }
    } else {
      progressBar.style.display = "none";
    }
  }
  
  const prevStatus = String(row.dataset.downloadTaskStatus || "");
  if (prevStatus !== task.status) {
    const ops = row.querySelector(".upload-task-ops");
    if (ops) {
      ops.innerHTML = `
        ${task.status === "downloading" ? `<button class="btn-sm" data-download-pause="${task.id}">暂停</button>` : ""}
        ${task.status === "paused" ? `<button class="btn-sm primary" data-download-resume="${task.id}">继续</button>` : ""}
        ${(task.status === "pending" || task.status === "downloading" || task.status === "paused") && task.entryId ? `<button class="btn-sm danger" data-download-cancel="${task.id}">取消</button>` : ""}
        <button class="btn-sm" data-download-delete="${task.id}">删除</button>
      `;
    }
    row.dataset.downloadTaskStatus = task.status;
  }
  return true;
};

const renderDownloadTasks = () => {
  if (!downloadTaskList) return;
  const orderedTasks = sortDownloadTasksForDisplay(state.downloadTasks);
  const validIdSet = new Set(orderedTasks.map((task) => String(task.id || "")));
  state.selectedDownloadTaskIds = state.selectedDownloadTaskIds.filter((id) => validIdSet.has(id));
  const selectedSet = new Set(state.selectedDownloadTaskIds);
  downloadTaskList.innerHTML = orderedTasks.map((task) => {
    let statusTop = getDownloadStatusText(task);
    let hasProgress = (task.status === "downloading" || task.status === "paused") && task.size > 0;
    
    return `
    <div class="upload-task-row" data-download-task-id="${escapeHtml(task.id)}" data-download-task-status="${escapeHtml(task.status)}">
      <div><input type="checkbox" data-download-select="${escapeHtml(task.id)}" ${selectedSet.has(task.id) ? "checked" : ""}></div>
      <div class="upload-task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</div>
      <div>${task.size > 0 ? formatSize(task.size) : "-"}</div>
      <div>${formatDate(task.startedAt)}</div>
      <div title="${escapeHtml(task.sourcePath)}">${escapeHtml(task.sourcePath)}</div>
      <div class="upload-task-progress">
        <div class="upload-progress-top">${escapeHtml(statusTop)}</div>
        ${hasProgress ? `<div class="upload-progress-bar"><div class="upload-progress-inner" style="width:${task.progress}%;"></div></div>` : ""}
      </div>
      <div class="upload-task-ops">
        ${task.status === "downloading" ? `<button class="btn-sm" data-download-pause="${task.id}">暂停</button>` : ""}
        ${task.status === "paused" ? `<button class="btn-sm primary" data-download-resume="${task.id}">继续</button>` : ""}
        ${(task.status === "pending" || task.status === "downloading" || task.status === "paused") && task.entryId ? `<button class="btn-sm danger" data-download-cancel="${task.id}">取消</button>` : ""}
        <button class="btn-sm" data-download-delete="${task.id}">删除</button>
      </div>
    </div>
  `}).join("");
  if (downloadTaskSelectAllCheckbox) {
    const selectedCount = orderedTasks.reduce((count, item) => count + (selectedSet.has(item.id) ? 1 : 0), 0);
    downloadTaskSelectAllCheckbox.checked = orderedTasks.length > 0 && selectedCount === orderedTasks.length;
    downloadTaskSelectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < orderedTasks.length;
  }
  renderTransferTaskHeader();
};

const loadMyShares = async () => {
  try {
    const res = await request("/api/shares");
    if (!res.ok) return;
    const data = await res.json();
    state.myShares = (Array.isArray(data) ? data : []).filter((item) => !item.isCanceled);
    const validCodeSet = new Set(state.myShares.map((item) => String(item.shareCode || "").trim()).filter(Boolean));
    state.selectedMyShareCodes = state.selectedMyShareCodes.filter((code) => validCodeSet.has(code));
  } catch (error) {}
};

const copyTextToClipboard = async (text) => {
  const value = String(text || "");
  if (!value) return false;
  let copySuccess = false;
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      copySuccess = true;
    } catch (e) {
      // 静默处理错误，因为我们有降级方案
    }
  }
  if (!copySuccess) {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    input.style.width = "2em";
    input.style.height = "2em";
    input.style.padding = "0";
    input.style.border = "none";
    input.style.outline = "none";
    input.style.boxShadow = "none";
    input.style.background = "transparent";
    document.body.appendChild(input);
    try {
      input.focus();
      input.select();
      input.setSelectionRange(0, 99999);
      const ok = document.execCommand("copy");
      if (ok) {
        copySuccess = true;
      }
    } catch (e) {
      console.warn("execCommand failed:", e);
    } finally {
      document.body.removeChild(input);
    }
  }
  return copySuccess;
};

const setMyShareSelected = (shareCode, selected) => {
  const code = String(shareCode || "").trim();
  if (!code) return;
  const nextSet = new Set(state.selectedMyShareCodes);
  if (selected) {
    nextSet.add(code);
  } else {
    nextSet.delete(code);
  }
  state.selectedMyShareCodes = Array.from(nextSet);
};

const formatMyShareStatus = (item) => {
  if (item.isCanceled) return "已取消";
  if (item.isExpired) return "已失效";
  if (!item.expiresAt) return "永久有效";
  const expireAt = new Date(item.expiresAt).getTime();
  if (!Number.isFinite(expireAt)) return "永久有效";
  const diff = expireAt - Date.now();
  if (diff <= 0) return "已失效";
  const dayMs = 24 * 60 * 60 * 1000;
  if (diff >= dayMs) {
    return `剩余${Math.ceil(diff / dayMs)}天`;
  }
  return `剩余${Math.max(1, Math.ceil(diff / (60 * 60 * 1000)))}小时`;
};

const updateMyShareBatchAction = () => {
  if (!myShareBatchCancelBtn) return;
  const count = state.selectedMyShareCodes.length;
  if (count <= 0) {
    myShareBatchCancelBtn.style.display = "none";
    return;
  }
  myShareBatchCancelBtn.style.display = "inline-flex";
  myShareBatchCancelBtn.textContent = `取消分享（${count}）`;
};

const renderMyShares = () => {
  if (!myShareList) return;
  const list = state.myShares.slice();
  const { totalPages, page, startIndex, endIndex } = getPaginationInfo(list.length, state.mySharesPage, state.mySharesPageSize);
  state.mySharesPage = page;
  if (mySharePaginationSummaryEl) {
    const start = list.length === 0 ? 0 : startIndex + 1;
    mySharePaginationSummaryEl.textContent = `共 ${list.length} 条，当前 ${start}-${endIndex}`;
  }
  if (mySharePageInfoEl) {
    mySharePageInfoEl.textContent = `${page} / ${totalPages}`;
  }
  if (mySharePrevPageBtn) {
    mySharePrevPageBtn.disabled = page <= 1;
  }
  if (myShareNextPageBtn) {
    myShareNextPageBtn.disabled = page >= totalPages;
  }
  if (mySharePageSizeSelect) {
    mySharePageSizeSelect.value = String(state.mySharesPageSize);
  }
  const currentList = list.slice(startIndex, endIndex);
  const selectedCodeSet = new Set(state.selectedMyShareCodes);
  if (myShareSelectAllCheckbox) {
    const selectedCount = currentList.reduce((count, item) => {
      const code = String(item.shareCode || "").trim();
      return count + (code && selectedCodeSet.has(code) ? 1 : 0);
    }, 0);
    myShareSelectAllCheckbox.checked = currentList.length > 0 && selectedCount === currentList.length;
    myShareSelectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < currentList.length;
  }
  myShareList.innerHTML = currentList.map((item) => {
    const shareCode = String(item.shareCode || "").trim();
    const isSelected = shareCode && selectedCodeSet.has(shareCode);
    const statusText = formatMyShareStatus(item);
    const iconClass = getFileIcon({ type: item.entryType, name: item.entryName || "" });
    return `
      <div class="table-row my-share-row${isSelected ? " selected" : ""}" data-share-code="${escapeHtml(shareCode)}">
        <div class="cell-check"><input type="checkbox" data-share-select="${escapeHtml(shareCode)}" ${isSelected ? "checked" : ""}></div>
        <div class="cell-name name-wrapper" title="${escapeHtml(item.entryName || "")}">
          <i class="${iconClass} file-icon"></i>
          <span class="file-name-text">${escapeHtml(item.entryName || "")}</span>
        </div>
        <div class="cell-share-visits">${Number(item.visitCount || 0)}</div>
        <div class="cell-share-downloads">${Number(item.downloadCount || 0)}</div>
        <div class="cell-share-expire" title="${escapeHtml(statusText)}">${escapeHtml(statusText)}</div>
        <div class="cell-share-ops">
          <button class="btn-sm" data-share-copy-link="${escapeHtml(shareCode)}">复制链接</button>
          ${item.hasAccessCode ? `<button class="btn-sm viewcode" data-share-view-code="${escapeHtml(item.shareCode || "")}">查看提取码</button>` : ""}
          <button class="btn-sm danger" data-share-cancel="${escapeHtml(item.shareCode || "")}">取消分享</button>
        </div>
      </div>
    `;
  }).join("");
  if (currentList.length === 0) {
    myShareList.innerHTML = `<div class="empty-tip" style="padding: 48px 0;">暂无分享记录</div>`;
  }
  updateMyShareBatchAction();
};

const updateUploadTask = (taskId, patch) => {
  const task = state.uploadTasks.find((item) => item.id === taskId);
  if (!task) return;
  Object.assign(task, patch);
  const patchKeys = patch && typeof patch === "object" ? Object.keys(patch) : [];
  const progressOnly = patchKeys.length === 1 && patchKeys[0] === "progress";
  if (progressOnly) {
    const updated = patchUploadTaskRow(taskId);
    if (!updated) {
      renderUploadTasks();
    }
  } else {
    renderUploadTasks();
    renderTransferTaskHeader();
  }
  schedulePersistUploadTasks();
};

const cancelUploadTask = (taskId) => {
  const task = state.uploadTasks.find((item) => item.id === taskId);
  if (!task || (task.status !== "uploading" && task.status !== "pending" && task.status !== "paused")) return false;
  uploadTaskRuntimePayloadMap.delete(taskId);
  task.cancelRequested = true;
  updateUploadTask(taskId, { status: "canceled", uploadSessionId: "" });
  try {
    if (task.xhr && typeof task.xhr.abort === "function") {
      task.xhr.abort();
    }
  } catch (e) {}
  try {
    if (task.abortController && task.abortController.signal && !task.abortController.signal.aborted) {
      task.abortController.abort();
    }
  } catch (e) {}
  cleanupChunkUploadSession(task.uploadSessionId);
  cleanupChunkUploadSessionByTaskId(task.id);
  return true;
};

const pauseUploadTask = (taskId) => {
  const task = state.uploadTasks.find((item) => item.id === taskId);
  if (!task || !isChunkUploadFileSize(task.size) || task.status !== "uploading") return false;
  task.cancelRequested = true; // Temporary stop
  updateUploadTask(taskId, { status: "paused" });
  try {
    if (task.xhr && typeof task.xhr.abort === "function") {
      task.xhr.abort();
    }
  } catch (e) {}
  try {
    if (task.abortController && task.abortController.signal && !task.abortController.signal.aborted) {
      task.abortController.abort();
    }
  } catch (e) {}
  return true;
};

const pauseDownloadTask = (taskId) => {
  const task = state.downloadTasks.find((item) => item.id === taskId);
  if (!task || task.status !== "downloading") return false;
  
  // 中止当前下载
  try {
    if (task.abortController && task.abortController.signal && !task.abortController.signal.aborted) {
      task.abortController.abort();
    }
  } catch (e) {}
  
  updateDownloadTask(taskId, { status: "paused" });
  return true;
};

const resumeUploadTask = (taskId) => {
  const task = state.uploadTasks.find((item) => item.id === taskId);
  if (!task || !isChunkUploadFileSize(task.size) || task.status !== "paused") return false;
  const runtimePayload = uploadTaskRuntimePayloadMap.get(taskId);
  if (!runtimePayload || !runtimePayload.uploadItem || !runtimePayload.uploadItem.file) {
    const expectedSourcePath = normalizeUploadSourcePath(task.sourcePath);
    const useDirectoryPicker = expectedSourcePath.includes("/");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    if (useDirectoryPicker) {
      fileInput.setAttribute("webkitdirectory", "");
      fileInput.setAttribute("directory", "");
      fileInput.multiple = true;
    }
    fileInput.onchange = (e) => {
      const allFiles = Array.from((e.target && e.target.files) || []);
      if (!allFiles.length) return;
      let file = allFiles[0];
      let relativePath = "";
      if (useDirectoryPicker) {
        const exactMatched = allFiles.find((item) => {
          const currentRelativePath = normalizeUploadSourcePath(item.webkitRelativePath || item.name);
          return currentRelativePath === expectedSourcePath && item.name === task.name && item.size === task.size;
        });
        const fallbackMatched = allFiles.find((item) => item.name === task.name && item.size === task.size);
        if (!exactMatched && !fallbackMatched) {
          alert("未在所选目录中找到原上传文件，请选择原始目录");
          return;
        }
        file = exactMatched || fallbackMatched;
        relativePath = String(file.webkitRelativePath || "");
      }
      if (file.name !== task.name || file.size !== task.size) {
        alert("选择的文件与原任务不匹配，请选择同名且大小相同的文件");
        return;
      }
      const uploadItem = createUploadItem(file, relativePath);
      if (!isUploadItemSourcePathValid(task, uploadItem)) {
        alert("上传文件路径无效，请选择原始路径中的文件");
        return;
      }
      uploadTaskRuntimePayloadMap.set(taskId, {
        uploadItem
      });
      task.cancelRequested = false;
      updateUploadTask(taskId, { status: "pending", sourcePath: getUploadSourcePathFromItem(uploadItem) });
      tryStartPendingUploadTasks();
    };
    fileInput.click();
    return false;
  }
  if (!isUploadItemSourcePathValid(task, runtimePayload.uploadItem)) {
    alert("上传文件路径无效，请重新选择原文件后再继续");
    updateUploadTask(taskId, { status: "paused" });
    return false;
  }
  task.cancelRequested = false;
  updateUploadTask(taskId, { status: "pending" });
  tryStartPendingUploadTasks();
  return true;
};

const resumeDownloadTask = (taskId) => {
  const task = state.downloadTasks.find((item) => item.id === taskId);
  if (!task || task.status !== "paused") return false;
  
  // 重新启动下载
  if (task.entryId) {
    // 查找对应的 entry，重新开始下载
    const entry = {
      id: task.entryId,
      type: task.entryType || "file",
      name: task.name,
      size: task.size
    };
    
    // 重置任务状态
    updateDownloadTask(taskId, { 
      status: "downloading",
      progress: task.progress || 0,
      downloaded: task.downloaded || 0,
      speed: 0
    });
    
    // 重新开始下载
    if (task.entryType === "folder" || (task.size && task.size > 100 * 1024 * 1024)) {
      // 大文件或文件夹使用浏览器下载
      const rawUrl = task.entryType === "folder"
        ? `/api/download/folder/${task.entryId}`
        : `/api/download/${task.entryId}`;
      const popup = window.open(appendFileSpaceToUrl(rawUrl));
      if (!popup) {
        updateDownloadTask(taskId, { status: "canceled" });
        return false;
      }
      updateDownloadTask(taskId, { status: "browser_downloading" });
    } else {
      // 小文件使用 fetch 方式重新下载
      (async () => {
        const rawUrl = task.entryType === "folder"
          ? `/api/download/folder/${task.entryId}`
          : `/api/download/${task.entryId}`;
        
        const controller = new AbortController();
        const signal = controller.signal;
        
        task.abortController = controller;
        
        try {
          const startTime = Date.now();
          let lastUpdateTime = startTime;
          let lastDownloadedBytes = 0;
          
          const res = await fetch(appendFileSpaceToUrl(rawUrl), {
            signal
          });
          
          if (!res.ok) {
            let message = "下载失败";
            try {
              const data = await res.json();
              if (data && data.message) {
                message = data.message;
              }
            } catch (error) {}
            throw new Error(message);
          }
          
          const contentLength = Number(res.headers.get("content-length") || 0);
          if (contentLength > 0) {
            updateDownloadTask(taskId, { size: contentLength });
          }
          
          const reader = res.body.getReader();
          const chunks = [];
          let receivedBytes = 0;
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            chunks.push(value);
            receivedBytes += value.length;
            
            const now = Date.now();
            const timeDiff = now - lastUpdateTime;
            
            if (timeDiff >= 100) {
              const progress = contentLength > 0 ? Math.min(100, Math.round((receivedBytes / contentLength) * 100)) : 0;
              const speed = timeDiff > 0 ? (receivedBytes - lastDownloadedBytes) / (timeDiff / 1000) : 0;
              
              updateDownloadTask(taskId, {
                progress,
                downloaded: receivedBytes,
                speed
              });
              
              lastUpdateTime = now;
              lastDownloadedBytes = receivedBytes;
            }
          }
          
          const blob = new Blob(chunks);
          if (!blob || Number(blob.size || 0) === 0) {
            throw new Error("下载失败");
          }
          
          const downloadName = resolveDownloadNameFromHeader(
            res.headers.get("content-disposition"),
            task.name
          );
          
          updateDownloadTask(taskId, { 
            status: "completed", 
            name: downloadName,
            progress: 100,
            downloaded: blob.size
          });
          
          triggerBlobDownload(blob, downloadName);
        } catch (error) {
          if (error.name === "AbortError") {
            const currentTask = state.downloadTasks.find((item) => item.id === taskId);
            if (!currentTask || currentTask.status !== "paused") {
              updateDownloadTask(taskId, { status: "canceled" });
            }
          } else {
            updateDownloadTask(taskId, { status: "canceled" });
            alert(error && error.message ? error.message : "下载失败");
          }
        } finally {
          task.abortController = null;
        }
      })();
    }
  }
  
  return true;
};

const removeUploadTask = async (taskId) => {
  const task = state.uploadTasks.find((item) => item.id === taskId);
  if (!task) return;
  uploadTaskRuntimePayloadMap.delete(taskId);
  cancelUploadTask(taskId);
  state.selectedUploadTaskIds = state.selectedUploadTaskIds.filter((id) => id !== String(taskId));
  state.uploadTasks = state.uploadTasks.filter((item) => item.id !== taskId);
  renderUploadTasks();
  try {
    await request(`/api/upload-tasks/${encodeURIComponent(taskId)}?taskType=upload`, { method: "DELETE" });
  } catch (e) {
    schedulePersistUploadTasks();
  }
};

const clearUploadTasks = async () => {
  uploadTaskRuntimePayloadMap.clear();
  state.selectedUploadTaskIds = [];
  state.uploadTasks.forEach((task) => {
    cancelUploadTask(task.id);
  });
  state.uploadTasks = [];
  renderUploadTasks();
  try {
    await request(getTransferTaskApiUrl("upload"), { method: "DELETE" });
  } catch (e) {
    schedulePersistUploadTasks();
  }
};

const createDownloadTask = (entry) => ({
  id: `${Date.now()}-${createClientUuid()}`,
  entryId: entry.id,
  entryType: entry.type === "folder" ? "folder" : "file",
  name: String(entry.name || ""),
  size: Number(entry.size || 0),
  sourcePath: getCurrentBasePath(),
  startedAt: new Date().toISOString(),
  status: "pending",
  progress: 0,
  downloaded: 0,
  speed: 0
});

const updateDownloadTask = (taskId, patch) => {
  const task = state.downloadTasks.find((item) => item.id === taskId);
  if (!task) return;
  Object.assign(task, patch);
  
  if (!patchDownloadTaskRow(taskId)) {
    renderDownloadTasks();
  }
  
  renderTransferTaskHeader();
  schedulePersistDownloadTasks();
};

const removeDownloadTask = async (taskId) => {
  const task = state.downloadTasks.find((item) => item.id === taskId);
  if (!task) return;
  state.selectedDownloadTaskIds = state.selectedDownloadTaskIds.filter((id) => id !== String(taskId));
  state.downloadTasks = state.downloadTasks.filter((item) => item.id !== taskId);
  renderDownloadTasks();
  try {
    await request(`/api/upload-tasks/${encodeURIComponent(taskId)}?taskType=download`, { method: "DELETE" });
  } catch (e) {
    schedulePersistDownloadTasks();
  }
};

const clearDownloadTasks = async () => {
  state.selectedDownloadTaskIds = [];
  state.downloadTasks = [];
  renderDownloadTasks();
  try {
    await request(getTransferTaskApiUrl("download"), { method: "DELETE" });
  } catch (e) {
    schedulePersistDownloadTasks();
  }
};

const startDownloadTask = (entry) => {
  if (!entry || !entry.id) return;
  if (!ensurePermission("download")) return;
  const task = createDownloadTask(entry);
  state.downloadTasksPage = 1;
  state.downloadTasks.push(task);
  renderDownloadTasks();
  schedulePersistDownloadTasks();
  updateDownloadTask(task.id, { status: "downloading" });
  
  // 判断文件大小，大于100MB使用浏览器下载，小于等于100MB使用fetch方式
  const isLargeFile = entry.type === "folder" || (entry.size && entry.size > 100 * 1024 * 1024);
  
  if (isLargeFile) {
    // 大文件使用浏览器下载
    const rawUrl = entry.type === "folder"
      ? `/api/download/folder/${entry.id}`
      : `/api/download/${entry.id}`;
    const popup = window.open(appendFileSpaceToUrl(rawUrl));
    if (!popup) {
      updateDownloadTask(task.id, { status: "canceled" });
      return;
    }
    updateDownloadTask(task.id, { status: "browser_downloading" });
  } else {
    // 小文件使用fetch方式并显示进度
    (async () => {
      const rawUrl = entry.type === "folder"
        ? `/api/download/folder/${entry.id}`
        : `/api/download/${entry.id}`;
      
      const controller = new AbortController();
      const signal = controller.signal;
      
      task.abortController = controller;
      
      try {
        const startTime = Date.now();
        let lastUpdateTime = startTime;
        let lastDownloadedBytes = 0;
        
        const res = await fetch(appendFileSpaceToUrl(rawUrl), {
          signal
        });
        
        if (!res.ok) {
          let message = "下载失败";
          try {
            const data = await res.json();
            if (data && data.message) {
              message = data.message;
            }
          } catch (error) {}
          throw new Error(message);
        }
        
        const contentLength = Number(res.headers.get("content-length") || 0);
        if (contentLength > 0) {
          updateDownloadTask(task.id, { size: contentLength });
        }
        
        const reader = res.body.getReader();
        const chunks = [];
        let receivedBytes = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          receivedBytes += value.length;
          
          const now = Date.now();
          const timeDiff = now - lastUpdateTime;
          
          if (timeDiff >= 100) {
            const progress = contentLength > 0 ? Math.min(100, Math.round((receivedBytes / contentLength) * 100)) : 0;
            const speed = timeDiff > 0 ? (receivedBytes - lastDownloadedBytes) / (timeDiff / 1000) : 0;
            
            updateDownloadTask(task.id, {
              progress,
              downloaded: receivedBytes,
              speed
            });
            
            lastUpdateTime = now;
            lastDownloadedBytes = receivedBytes;
          }
        }
        
        const blob = new Blob(chunks);
        if (!blob || Number(blob.size || 0) === 0) {
          throw new Error("下载失败");
        }
        
        const downloadName = resolveDownloadNameFromHeader(
          res.headers.get("content-disposition"),
          entry.name
        );
        
        updateDownloadTask(task.id, { 
          status: "completed", 
          name: downloadName,
          progress: 100,
          downloaded: blob.size
        });
        
        triggerBlobDownload(blob, downloadName);
      } catch (error) {
        if (error.name === "AbortError") {
          const currentTask = state.downloadTasks.find((item) => item.id === task.id);
          if (!currentTask || currentTask.status !== "paused") {
            updateDownloadTask(task.id, { status: "canceled" });
          }
        } else {
          updateDownloadTask(task.id, { status: "canceled" });
          alert(error && error.message ? error.message : "下载失败");
        }
      } finally {
        task.abortController = null;
      }
    })();
  }
};

const resolveDownloadNameFromHeader = (contentDisposition, fallbackName) => {
  const header = String(contentDisposition || "");
  const utfMatch = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1]).trim() || fallbackName;
    } catch (error) {}
  }
  const normalMatch = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (normalMatch && normalMatch[1]) {
    return normalMatch[1].trim() || fallbackName;
  }
  return fallbackName;
};

const triggerBlobDownload = (blob, fileName) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const startBatchDownloadTask = async (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return;
  if (!ensurePermission("download")) return;
  const task = createDownloadTask({
    id: 0,
    type: "file",
    name: `批量下载(${entries.length})`,
    size: 0
  });
  state.downloadTasksPage = 1;
  state.downloadTasks.push(task);
  renderDownloadTasks();
  schedulePersistDownloadTasks();
  updateDownloadTask(task.id, { status: "downloading" });
  
  const controller = new AbortController();
  const signal = controller.signal;
  
  task.abortController = controller;
  
  try {
    const startTime = Date.now();
    let lastUpdateTime = startTime;
    let lastDownloadedBytes = 0;
    
    const res = await fetch(appendFileSpaceToUrl("/api/download/batch"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: entries.map((item) => ({
          id: item.id,
          type: item.type === "folder" ? "folder" : "file"
        }))
      }),
      signal
    });
    
    if (!res.ok) {
      let message = "批量下载失败";
      try {
        const data = await res.json();
        if (data && data.message) {
          message = data.message;
        }
      } catch (error) {}
      throw new Error(message);
    }
    
    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > 0) {
      updateDownloadTask(task.id, { size: contentLength });
    }
    
    const reader = res.body.getReader();
    const chunks = [];
    let receivedBytes = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      receivedBytes += value.length;
      
      const now = Date.now();
      const timeDiff = now - lastUpdateTime;
      
      if (timeDiff >= 100) {
        const progress = contentLength > 0 ? Math.min(100, Math.round((receivedBytes / contentLength) * 100)) : 0;
        const speed = timeDiff > 0 ? (receivedBytes - lastDownloadedBytes) / (timeDiff / 1000) : 0;
        
        updateDownloadTask(task.id, {
          progress,
          downloaded: receivedBytes,
          speed
        });
        
        lastUpdateTime = now;
        lastDownloadedBytes = receivedBytes;
      }
    }
    
    const blob = new Blob(chunks);
    if (!blob || Number(blob.size || 0) === 0) {
      throw new Error("批量下载失败");
    }
    
    const downloadName = resolveDownloadNameFromHeader(
      res.headers.get("content-disposition"),
      `批量下载-${Date.now()}.zip`
    );
    
    updateDownloadTask(task.id, { 
      status: "completed", 
      name: downloadName,
      progress: 100,
      downloaded: blob.size
    });
    
    triggerBlobDownload(blob, downloadName);
  } catch (error) {
    if (error.name === "AbortError") {
      updateDownloadTask(task.id, { status: "canceled" });
    } else {
      updateDownloadTask(task.id, { status: "canceled" });
      alert(error && error.message ? error.message : "批量下载失败");
    }
  } finally {
    task.abortController = null;
  }
};

const showDeleteConfirm = ({ title, message, messageHtml, desc, descHtml, okText, cancelText } = {}) => {
  if (!deleteConfirmModal) {
    return Promise.resolve(nativeConfirm(message || "确定删除吗？"));
  }
  if (deleteConfirmTitleEl) deleteConfirmTitleEl.textContent = title || "确定删除";
  if (deleteConfirmMessageEl) {
    if (messageHtml) {
      deleteConfirmMessageEl.innerHTML = messageHtml;
    } else {
      deleteConfirmMessageEl.textContent = message || "确定删除所选文件吗？";
    }
  }
  if (deleteConfirmDescEl) {
    if (descHtml) {
      deleteConfirmDescEl.innerHTML = descHtml;
    } else {
      deleteConfirmDescEl.textContent = desc || "删除的文件可在 30 天内通过回收站还原";
    }
  }
  const prevOkText = deleteConfirmOkBtn ? deleteConfirmOkBtn.textContent : "";
  const prevCancelText = deleteConfirmCancelBtn ? deleteConfirmCancelBtn.textContent : "";
  if (deleteConfirmOkBtn && okText) deleteConfirmOkBtn.textContent = okText;
  if (deleteConfirmCancelBtn && cancelText) deleteConfirmCancelBtn.textContent = cancelText;
  deleteConfirmModal.style.display = "flex";
  return new Promise((resolve) => {
    const close = (confirmed) => {
      deleteConfirmModal.style.display = "none";
      if (deleteConfirmOkBtn) deleteConfirmOkBtn.textContent = prevOkText;
      if (deleteConfirmCancelBtn) deleteConfirmCancelBtn.textContent = prevCancelText;
      if (deleteConfirmCloseBtn) deleteConfirmCloseBtn.removeEventListener("click", onClose);
      if (deleteConfirmCancelBtn) deleteConfirmCancelBtn.removeEventListener("click", onCancel);
      if (deleteConfirmOkBtn) deleteConfirmOkBtn.removeEventListener("click", onOk);
      deleteConfirmModal.removeEventListener("click", onMaskClick);
      document.removeEventListener("keydown", onEsc);
      resolve(!!confirmed);
    };
    const onClose = () => close(false);
    const onCancel = () => close(false);
    const onOk = () => close(true);
    const onMaskClick = (event) => {
      if (event.target === deleteConfirmModal) close(false);
    };
    const onEsc = (event) => {
      if (event.key === "Escape") close(false);
    };
    if (deleteConfirmCloseBtn) deleteConfirmCloseBtn.addEventListener("click", onClose, { once: true });
    if (deleteConfirmCancelBtn) deleteConfirmCancelBtn.addEventListener("click", onCancel, { once: true });
    if (deleteConfirmOkBtn) deleteConfirmOkBtn.addEventListener("click", onOk, { once: true });
    deleteConfirmModal.addEventListener("click", onMaskClick);
    document.addEventListener("keydown", onEsc);
  });
};

let appNoticeModal = null;
let appPromptModal = null;
let appSelectModal = null;
let hiddenSpaceResetModal = null;
let archiveEntriesModal = null;
let appBusyModal = null;
const ensureAppNoticeModal = () => {
  if (appNoticeModal) return appNoticeModal;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="delete-confirm-modal">
      <div class="delete-confirm-header">
        <span id="appNoticeTitle"></span>
        <button type="button" class="delete-confirm-close" id="appNoticeCloseBtn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="delete-confirm-body">
        <div class="delete-confirm-icon" id="appNoticeIcon"><i class="fa-solid fa-circle-info"></i></div>
        <div class="delete-confirm-message" id="appNoticeMessage"></div>
      </div>
      <div class="delete-confirm-actions">
        <button type="button" class="delete-confirm-btn primary-blue" id="appNoticeOkBtn">知道了</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  appNoticeModal = overlay;
  return overlay;
};

const ensureAppPromptModal = () => {
  if (appPromptModal) return appPromptModal;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="delete-confirm-modal app-prompt-dialog">
      <div class="delete-confirm-header">
        <span id="appPromptTitle">输入内容</span>
        <button type="button" id="appPromptHeaderActionBtn" style="display:none;">重置密码</button>
      </div>
      <form id="appPromptForm" class="app-prompt-form">
        <div class="delete-confirm-body app-prompt-body">
          <div class="form-group app-prompt-input-wrap">
            <input type="password" id="appPromptInput" autocomplete="off" />
          </div>
        </div>
        <div class="delete-confirm-actions app-prompt-actions">
          <button type="button" class="delete-confirm-btn cancel" id="appPromptCancelBtn">取消</button>
          <button type="submit" class="delete-confirm-btn primary-blue" id="appPromptOkBtn">确定</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  appPromptModal = overlay;
  return overlay;
};

const ensureAppSelectModal = () => {
  if (appSelectModal) return appSelectModal;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="delete-confirm-modal app-select-dialog">
      <div class="delete-confirm-header">
        <span id="appSelectTitle">选择目录</span>
      </div>
      <form id="appSelectForm" class="app-select-form">
        <div class="delete-confirm-body app-select-body">
          <select id="appSelectDropdown" class="app-select-dropdown"></select>
          <input type="hidden" id="appSelectInput" />
        </div>
        <div class="delete-confirm-actions app-select-actions">
          <button type="button" class="delete-confirm-btn cancel" id="appSelectCancelBtn">取消</button>
          <button type="submit" class="delete-confirm-btn primary-blue" id="appSelectOkBtn">确定</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  appSelectModal = overlay;
  return overlay;
};

const ensureHiddenSpaceResetModal = () => {
  if (hiddenSpaceResetModal) return hiddenSpaceResetModal;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="delete-confirm-modal hs-reset-dialog">
      <div class="delete-confirm-header">
        <span id="hsResetTitle">重置密码</span>
      </div>
      <form id="hsResetForm" class="hs-reset-form">
        <div class="delete-confirm-body hs-reset-body">
          <div class="hs-reset-tabs">
            <button type="button" class="hs-reset-tab active" id="hsResetTabCurrent" data-method="current">验证登录密码</button>
            <button type="button" class="hs-reset-tab" id="hsResetTabSms" data-method="sms">短信验证码</button>
          </div>
          <div class="hs-reset-panel hs-reset-panel-current" id="hsResetPanelCurrent">
            <p class="hs-reset-label">登录密码</p>
            <div class="hs-reset-input-wrap">
              <input type="password" id="hsResetOldPasswordInput" autocomplete="off" placeholder="请输入当前账号登录密码" />
            </div>
          </div>
          <div class="hs-reset-panel hs-reset-panel-sms" id="hsResetPanelSms" style="display:none;">
            <p class="hs-reset-label">短信验证码</p>
            <div class="hs-reset-code-row">
              <input type="text" id="hsResetCodeInput" autocomplete="off" />
              <button type="button" class="hs-reset-send-btn" id="hsResetSendCodeBtn">发送验证码</button>
            </div>
          </div>
          <p class="hs-reset-label">新密码</p>
          <div class="hs-reset-input-wrap">
            <input type="password" id="hsResetNewPasswordInput" autocomplete="off" />
          </div>
          <p class="hs-reset-label">确认新密码</p>
          <div class="hs-reset-input-wrap">
            <input type="password" id="hsResetConfirmPasswordInput" autocomplete="off" />
          </div>
        </div>
        <div class="delete-confirm-actions hs-reset-actions">
          <button type="button" class="delete-confirm-btn cancel" id="hsResetCancelBtn">取消</button>
          <button type="submit" class="delete-confirm-btn primary-blue" id="hsResetOkBtn">确定</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  hiddenSpaceResetModal = overlay;
  return overlay;
};

const ensureArchiveEntriesModal = () => {
  if (archiveEntriesModal) return archiveEntriesModal;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay archive-entries-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="modal archive-entries-modal">
      <div class="archive-entries-header">
        <div class="archive-entries-title-wrap">
          <h3 id="archiveEntriesTitle">压缩包内容</h3>
          <div class="archive-entries-count" id="archiveEntriesCount"></div>
        </div>
        <button type="button" class="archive-entries-close" id="archiveEntriesCloseBtn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="archive-entries-body">
        <div class="archive-entries-breadcrumb" id="archiveEntriesBreadcrumb"></div>
        <div class="archive-entries-empty" id="archiveEntriesEmpty" style="display:none;">压缩包为空</div>
        <div class="archive-entries-table-wrap" id="archiveEntriesTableWrap">
          <table class="archive-entries-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th>大小</th>
                <th>压缩后</th>
                <th class="archive-entries-preview-cell">预览</th>
              </tr>
            </thead>
            <tbody id="archiveEntriesBody"></tbody>
          </table>
        </div>
      </div>
      <div class="modal-actions archive-entries-actions">
        <button type="button" class="btn-primary" id="archiveEntriesOkBtn">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  archiveEntriesModal = overlay;
  return overlay;
};

const ensureAppBusyModal = () => {
  if (appBusyModal) return appBusyModal;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay app-busy-overlay";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="app-busy-modal">
      <i class="fa-solid fa-spinner app-busy-spinner"></i>
      <div class="app-busy-text" id="appBusyText">正在加载，请稍候...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  appBusyModal = overlay;
  return overlay;
};

const showAppBusy = (text = "正在加载，请稍候...") => {
  const modal = ensureAppBusyModal();
  const textEl = modal.querySelector("#appBusyText");
  if (textEl) {
    textEl.textContent = String(text || "正在加载，请稍候...");
  }
  modal.style.display = "flex";
  return () => {
    modal.style.display = "none";
  };
};

const APP_NOTICE_TYPE = {
  TIP: "tip",
  ERROR: "error",
  NORMAL: "normal"
};

const appNoticeTypeMap = {
  [APP_NOTICE_TYPE.TIP]: {
    defaultTitle: "提示",
    defaultIconClass: "fa-solid fa-circle-info",
    iconBackground: "#fff7e8",
    iconColor: "#ff7d00"
  },
  [APP_NOTICE_TYPE.ERROR]: {
    defaultTitle: "错误",
    defaultIconClass: "fa-solid fa-circle-xmark",
    iconBackground: "#fff2f0",
    iconColor: "#f53f3f"
  },
  [APP_NOTICE_TYPE.NORMAL]: {
    defaultTitle: "操作成功",
    defaultIconClass: "fa-solid fa-circle-check",
    iconBackground: "#e8f3ff",
    iconColor: "#165dff"
  }
};

const appNoticeActionMap = {
  copyShareLink: { title: "复制链接", iconClass: "fa-solid fa-link", type: APP_NOTICE_TYPE.NORMAL },
  copyShareWithCode: { title: "复制分享信息", iconClass: "fa-solid fa-copy", type: APP_NOTICE_TYPE.NORMAL },
  copyAccessCode: { title: "复制提取码", iconClass: "fa-solid fa-key", type: APP_NOTICE_TYPE.NORMAL },
  viewAccessCode: { title: "提取码", iconClass: "fa-solid fa-key", type: APP_NOTICE_TYPE.TIP },
  cancelShare: { title: "取消分享", iconClass: "fa-solid fa-ban", type: APP_NOTICE_TYPE.TIP },
  createShare: { title: "创建分享", iconClass: "fa-solid fa-share-nodes", type: APP_NOTICE_TYPE.NORMAL }
};

const showAppNotice = ({ title, message, isError = false, iconTone = "default", action = "", noticeType = "", iconClass = "", autoCloseMs = 0, okText = "知道了", okAction = "close", okPayload = "" } = {}) => new Promise((resolve) => {
  const modal = ensureAppNoticeModal();
  const titleEl = modal.querySelector("#appNoticeTitle");
  const messageEl = modal.querySelector("#appNoticeMessage");
  const iconEl = modal.querySelector("#appNoticeIcon");
  const closeBtn = modal.querySelector("#appNoticeCloseBtn");
  const okBtn = modal.querySelector("#appNoticeOkBtn");
  const prevOkText = okBtn ? okBtn.textContent : "知道了";
  const actionKey = String(action || "").trim();
  const actionConfig = actionKey ? appNoticeActionMap[actionKey] : null;
  const inferredTypeFromTone = iconTone === "orange" ? APP_NOTICE_TYPE.TIP : (iconTone === "blue" ? APP_NOTICE_TYPE.NORMAL : "");
  const finalType = isError ? APP_NOTICE_TYPE.ERROR : (noticeType || inferredTypeFromTone || (actionConfig && actionConfig.type) || APP_NOTICE_TYPE.NORMAL);
  const typeConfig = appNoticeTypeMap[finalType] || appNoticeTypeMap[APP_NOTICE_TYPE.NORMAL];
  const finalTitle = title || (actionConfig && actionConfig.title) || typeConfig.defaultTitle;
  const finalIconClass = iconClass || (actionConfig && actionConfig.iconClass) || typeConfig.defaultIconClass;
  titleEl.textContent = finalTitle;
  messageEl.textContent = message || "";
  if (okBtn) okBtn.textContent = okText || "知道了";
  iconEl.innerHTML = `<i class="${finalIconClass}"></i>`;
  iconEl.style.background = typeConfig.iconBackground;
  iconEl.style.color = typeConfig.iconColor;
  modal.style.display = "flex";
  let autoCloseTimer = null;
  const copyValue = String(okPayload || "");
  const close = () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
    modal.style.display = "none";
    if (okBtn) okBtn.textContent = prevOkText;
    closeBtn.removeEventListener("click", close);
    okBtn.removeEventListener("click", onOk);
    modal.removeEventListener("click", closeByMask);
    resolve();
  };
  const onOk = async () => {
    if (okAction === "copy" && copyValue) {
      try {
        await copyTextToClipboard(copyValue);
      } catch (error) {}
    }
    close();
  };
  const closeByMask = (event) => {
    if (event.target === modal) close();
  };
  closeBtn.addEventListener("click", close);
  okBtn.addEventListener("click", onOk);
  modal.addEventListener("click", closeByMask);
  const autoCloseDelay = Math.max(0, Number(autoCloseMs) || 0);
  if (autoCloseDelay > 0) {
    autoCloseTimer = setTimeout(() => {
      close();
    }, autoCloseDelay);
  }
});

const showAppPrompt = ({ title, message, defaultValue = "", inputType = "password", required, requiredMessage = "", headerActionText = "", headerActionValue = "" } = {}) => new Promise((resolve) => {
  const modal = ensureAppPromptModal();
  const titleEl = modal.querySelector("#appPromptTitle");
  const formEl = modal.querySelector("#appPromptForm");
  const inputEl = modal.querySelector("#appPromptInput");
  const cancelBtn = modal.querySelector("#appPromptCancelBtn");
  const headerActionBtn = modal.querySelector("#appPromptHeaderActionBtn");
  const isRequired = required === undefined ? inputType !== "text" : !!required;
  titleEl.textContent = title || message || "输入内容";
  inputEl.type = inputType === "text" ? "text" : "password";
  inputEl.value = defaultValue == null ? "" : String(defaultValue);
  if (headerActionBtn) {
    const actionText = String(headerActionText || "").trim();
    if (actionText) {
      headerActionBtn.textContent = actionText;
      headerActionBtn.style.display = "";
    } else {
      headerActionBtn.style.display = "none";
    }
  }
  modal.style.display = "flex";
  const close = (value) => {
    modal.style.display = "none";
    formEl.removeEventListener("submit", onSubmit);
    cancelBtn.removeEventListener("click", onCancel);
    if (headerActionBtn) {
      headerActionBtn.removeEventListener("click", onHeaderAction);
      headerActionBtn.style.display = "none";
    }
    modal.removeEventListener("click", closeByMask);
    document.removeEventListener("keydown", onEsc);
    resolve(value);
  };
  const onSubmit = (event) => {
    event.preventDefault();
    const value = String(inputEl.value || "");
    if (isRequired && value.trim() === "") {
      alert(requiredMessage || "请输入密码");
      inputEl.focus();
      return;
    }
    close(inputEl.value);
  };
  const onCancel = () => close(null);
  const onHeaderAction = () => close(headerActionValue || "__APP_PROMPT_HEADER_ACTION__");
  const closeByMask = (event) => {
    if (event.target === modal) close(null);
  };
  const onEsc = (event) => {
    if (event.key === "Escape") close(null);
  };
  formEl.addEventListener("submit", onSubmit);
  cancelBtn.addEventListener("click", onCancel);
  if (headerActionBtn) {
    headerActionBtn.addEventListener("click", onHeaderAction);
  }
  modal.addEventListener("click", closeByMask);
  document.addEventListener("keydown", onEsc);
  setTimeout(() => inputEl.focus(), 0);
});

const showAppSelect = ({ title, options = [], defaultValue = "" } = {}) => new Promise((resolve) => {
  const modal = ensureAppSelectModal();
  const titleEl = modal.querySelector("#appSelectTitle");
  const formEl = modal.querySelector("#appSelectForm");
  const dropdownEl = modal.querySelector("#appSelectDropdown");
  const selectEl = modal.querySelector("#appSelectInput");
  const cancelBtn = modal.querySelector("#appSelectCancelBtn");
  titleEl.textContent = title || "选择目录";
  dropdownEl.innerHTML = "";
  const desiredValue = String(defaultValue == null ? "" : defaultValue);
  const isTreeMode = options && options.children !== undefined;
  const treeRoot = isTreeMode ? options : null;
  if (isTreeMode) {
    const flatOptions = [];
    const flattenTree = (node, prefix = "", isLast = true, depth = 0) => {
      const label = node.label || "/";
      flatOptions.push({ value: node.value, label, depth, isRoot: depth === 0, prefix, isLast });
      if (node.children && node.children.length > 0) {
        node.children.forEach((child, index) => {
          const childIsLast = index === node.children.length - 1;
          const childPrefix = prefix + (isLast ? "\u00A0\u00A0\u00A0\u00A0" : "\u2502\u00A0\u00A0\u00A0");
          flattenTree(child, childPrefix, childIsLast, depth + 1);
        });
      }
    };
    flattenTree(treeRoot);
    flatOptions.forEach((item) => {
      const optionEl = document.createElement("option");
      optionEl.value = String(item.value);
      if (item.isRoot) {
        optionEl.textContent = item.label;
        optionEl.style.fontWeight = "600";
      } else {
        const connector = item.isLast ? "\u2514 " : "\u251C ";
        optionEl.textContent = `${item.prefix}${connector}${item.label}`;
      }
      dropdownEl.appendChild(optionEl);
    });
    selectEl.value = desiredValue && flatOptions.some((o) => String(o.value) === desiredValue)
      ? desiredValue
      : String(flatOptions[0].value);
  } else {
    options.forEach((item) => {
      const optionEl = document.createElement("option");
      optionEl.value = String(item.value);
      optionEl.textContent = String(item.label);
      dropdownEl.appendChild(optionEl);
    });
    selectEl.value = desiredValue && options.some((o) => String(o.value) === desiredValue)
      ? desiredValue
      : (options.length > 0 ? String(options[0].value) : "");
  }
  dropdownEl.value = selectEl.value;
  dropdownEl.addEventListener("change", () => {
    selectEl.value = dropdownEl.value;
  });
  modal.style.display = "flex";
  const close = (value) => {
    modal.style.display = "none";
    formEl.removeEventListener("submit", onSubmit);
    cancelBtn.removeEventListener("click", onCancel);
    modal.removeEventListener("click", closeByMask);
    document.removeEventListener("keydown", onEsc);
    resolve(value);
  };
  const onSubmit = (event) => {
    event.preventDefault();
    close(selectEl.value);
  };
  const onCancel = () => close(null);
  const closeByMask = (event) => {
    if (event.target === modal) close(null);
  };
  const onEsc = (event) => {
    if (event.key === "Escape") close(null);
  };
  formEl.addEventListener("submit", onSubmit);
  cancelBtn.addEventListener("click", onCancel);
  modal.addEventListener("click", closeByMask);
  document.addEventListener("keydown", onEsc);
  setTimeout(() => dropdownEl.focus(), 0);
});

const showHiddenSpaceResetModal = () => new Promise((resolve) => {
  const modal = ensureHiddenSpaceResetModal();
  const formEl = modal.querySelector("#hsResetForm");
  const tabCurrent = modal.querySelector("#hsResetTabCurrent");
  const tabSms = modal.querySelector("#hsResetTabSms");
  const panelCurrent = modal.querySelector("#hsResetPanelCurrent");
  const panelSms = modal.querySelector("#hsResetPanelSms");
  const oldPwdInput = modal.querySelector("#hsResetOldPasswordInput");
  const codeInput = modal.querySelector("#hsResetCodeInput");
  const newPwdInput = modal.querySelector("#hsResetNewPasswordInput");
  const confirmPwdInput = modal.querySelector("#hsResetConfirmPasswordInput");
  const sendCodeBtn = modal.querySelector("#hsResetSendCodeBtn");
  const cancelBtn = modal.querySelector("#hsResetCancelBtn");
  let method = "current";
  let countdown = 0;
  let timer = null;
  const updateSendBtn = () => {
    if (!sendCodeBtn) return;
    if (countdown > 0) {
      sendCodeBtn.textContent = `${countdown}s后重发`;
      sendCodeBtn.disabled = true;
      return;
    }
    sendCodeBtn.textContent = "发送验证码";
    sendCodeBtn.disabled = false;
  };
  const switchMethod = (next) => {
    method = next === "sms" ? "sms" : "current";
    if (tabCurrent) tabCurrent.classList.toggle("active", method === "current");
    if (tabSms) tabSms.classList.toggle("active", method === "sms");
    if (panelCurrent) panelCurrent.style.display = method === "current" ? "" : "none";
    if (panelSms) panelSms.style.display = method === "sms" ? "" : "none";
  };
  switchMethod("current");
  if (oldPwdInput) oldPwdInput.value = "";
  if (codeInput) codeInput.value = "";
  if (newPwdInput) newPwdInput.value = "";
  if (confirmPwdInput) confirmPwdInput.value = "";
  countdown = 0;
  updateSendBtn();
  modal.style.display = "flex";
  const close = (payload) => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    modal.style.display = "none";
    formEl.removeEventListener("submit", onSubmit);
    cancelBtn.removeEventListener("click", onCancel);
    if (tabCurrent) tabCurrent.removeEventListener("click", onTabCurrent);
    if (tabSms) tabSms.removeEventListener("click", onTabSms);
    if (sendCodeBtn) sendCodeBtn.removeEventListener("click", onSendCode);
    resolve(payload);
  };
  const onSubmit = (event) => {
    event.preventDefault();
    const oldPassword = String(oldPwdInput && oldPwdInput.value ? oldPwdInput.value : "").trim();
    const code = String(codeInput && codeInput.value ? codeInput.value : "").trim();
    const newPassword = String(newPwdInput && newPwdInput.value ? newPwdInput.value : "").trim();
    const confirmPassword = String(confirmPwdInput && confirmPwdInput.value ? confirmPwdInput.value : "").trim();
    if (method === "current" && !oldPassword) {
      alert("请输入登录密码");
      if (oldPwdInput) oldPwdInput.focus();
      return;
    }
    if (method === "sms" && !/^\d{6}$/.test(code)) {
      alert("请输入6位短信验证码");
      if (codeInput) codeInput.focus();
      return;
    }
    if (newPassword.length < 4) {
      alert("新密码至少4位");
      if (newPwdInput) newPwdInput.focus();
      return;
    }
    if (!confirmPassword) {
      alert("请确认新密码");
      if (confirmPwdInput) confirmPwdInput.focus();
      return;
    }
    close({ method, oldPassword, code, newPassword, confirmPassword });
  };
  const onCancel = () => close(null);
  const onTabCurrent = () => switchMethod("current");
  const onTabSms = () => switchMethod("sms");
  const onSendCode = async () => {
    if (countdown > 0) return;
    try {
      const res = await request("/api/hidden-space/reset-password/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || "验证码发送失败");
        return;
      }
      alert(data.message || "验证码已发送");
      const total = Math.max(1, Math.min(3600, Math.floor(Number(data.sendIntervalSeconds) || 60)));
      countdown = total;
      updateSendBtn();
      if (timer) {
        clearInterval(timer);
      }
      timer = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) {
          countdown = 0;
          clearInterval(timer);
          timer = null;
        }
        updateSendBtn();
      }, 1000);
    } catch (_error) {
      alert("网络请求失败，请稍后重试");
    }
  };
  formEl.addEventListener("submit", onSubmit);
  cancelBtn.addEventListener("click", onCancel);
  if (tabCurrent) tabCurrent.addEventListener("click", onTabCurrent);
  if (tabSms) tabSms.addEventListener("click", onTabSms);
  if (sendCodeBtn) sendCodeBtn.addEventListener("click", onSendCode);
  setTimeout(() => oldPwdInput && oldPwdInput.focus(), 0);
});

const showArchiveEntriesModal = ({ title = "", entries = [], total = 0, archiveEntry = null, previewConfig = {} } = {}) => new Promise((resolve) => {
  const modal = ensureArchiveEntriesModal();
  const titleEl = modal.querySelector("#archiveEntriesTitle");
  const countEl = modal.querySelector("#archiveEntriesCount");
  const breadcrumbEl = modal.querySelector("#archiveEntriesBreadcrumb");
  const bodyEl = modal.querySelector("#archiveEntriesBody");
  const emptyEl = modal.querySelector("#archiveEntriesEmpty");
  const tableWrapEl = modal.querySelector("#archiveEntriesTableWrap");
  const closeBtn = modal.querySelector("#archiveEntriesCloseBtn");
  const okBtn = modal.querySelector("#archiveEntriesOkBtn");
  const finalTitle = String(title || "").trim() || "压缩包内容";
  titleEl.textContent = finalTitle;
  const safeEntries = (Array.isArray(entries) ? entries : []).map((item) => {
    const rawPath = String(item && item.path ? item.path : "").replace(/\\/g, "/").trim();
    const normalizedPath = rawPath.replace(/^\/+|\/+$/g, "");
    const isDirectory = !!(item && item.isDirectory) || /\/$/.test(rawPath);
    return {
      path: normalizedPath,
      isDirectory,
      size: Math.max(0, Number(item && item.size ? item.size : 0)),
      compressedSize: Math.max(0, Number(item && item.compressedSize ? item.compressedSize : 0))
    };
  }).filter((item) => !!item.path);
  const totalCount = Math.max(0, Number(total || safeEntries.length || 0));
  
  const localPreviewConfig = previewConfig && typeof previewConfig === "object" ? previewConfig : {};
  
  const PREVIEW_IMAGE_EXT_SET = new Set(Array.isArray(localPreviewConfig.imageExts) ? localPreviewConfig.imageExts : []);
  const PREVIEW_VIDEO_EXT_SET = new Set(Array.isArray(localPreviewConfig.videoExts) ? localPreviewConfig.videoExts : []);
  const PREVIEW_AUDIO_EXT_SET = new Set(Array.isArray(localPreviewConfig.audioExts) ? localPreviewConfig.audioExts : []);
  const PREVIEW_TEXT_EXT_SET = new Set(Array.isArray(localPreviewConfig.textExts) ? localPreviewConfig.textExts : []);
  const PREVIEW_DOC_EXT_SET = new Set(Array.isArray(localPreviewConfig.docExts) ? localPreviewConfig.docExts : []);
  
  const getFileExt = (fileName) => {
    const name = String(fileName || "").trim().toLowerCase();
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex <= -1 || dotIndex === name.length - 1) return "";
    return name.slice(dotIndex + 1);
  };
  
  const resolvePreviewType = (fileName) => {
    const ext = getFileExt(fileName);
    if (PREVIEW_IMAGE_EXT_SET.has(ext)) return "image";
    if (PREVIEW_VIDEO_EXT_SET.has(ext)) return "video";
    if (PREVIEW_AUDIO_EXT_SET.has(ext)) return "audio";
    if (PREVIEW_TEXT_EXT_SET.has(ext)) return "text";
    if (PREVIEW_DOC_EXT_SET.has(ext)) return "document";
    return "";
  };
  const dirSet = new Set([""]);
  safeEntries.forEach((item) => {
    const parts = item.path.split("/").filter(Boolean);
    const maxDepth = item.isDirectory ? parts.length : Math.max(0, parts.length - 1);
    let cursor = "";
    for (let i = 0; i < maxDepth; i += 1) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i];
      dirSet.add(cursor);
    }
  });
  let currentPrefix = "";
  const getChildrenByPrefix = (prefix) => {
    const normalizedPrefix = String(prefix || "");
    const folderChildren = [];
    const fileChildren = [];
    dirSet.forEach((dirPath) => {
      if (!dirPath || dirPath === normalizedPrefix) return;
      const parent = dirPath.includes("/") ? dirPath.slice(0, dirPath.lastIndexOf("/")) : "";
      if (parent !== normalizedPrefix) return;
      const folderName = dirPath.includes("/") ? dirPath.slice(dirPath.lastIndexOf("/") + 1) : dirPath;
      folderChildren.push({ isDirectory: true, path: dirPath, name: folderName, size: 0, compressedSize: 0 });
    });
    safeEntries.forEach((item) => {
      if (item.isDirectory) return;
      const parent = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/")) : "";
      if (parent !== normalizedPrefix) return;
      const fileName = item.path.includes("/") ? item.path.slice(item.path.lastIndexOf("/") + 1) : item.path;
      fileChildren.push({ isDirectory: false, path: item.path, name: fileName, size: item.size, compressedSize: item.compressedSize });
    });
    folderChildren.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    fileChildren.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return [...folderChildren, ...fileChildren];
  };
  const renderBreadcrumb = () => {
    const parts = currentPrefix ? currentPrefix.split("/").filter(Boolean) : [];
    const items = [{ label: "根目录", path: "" }];
    let cursor = "";
    parts.forEach((part) => {
      cursor = cursor ? `${cursor}/${part}` : part;
      items.push({ label: part, path: cursor });
    });
    breadcrumbEl.innerHTML = items.map((item, index) => {
      const isLast = index === items.length - 1;
      const safeLabel = escapeHtml(item.label);
      if (isLast) {
        return `<span class="archive-breadcrumb-item active">${safeLabel}</span>`;
      }
      return `<button type="button" class="archive-breadcrumb-item" data-archive-breadcrumb="${escapeHtml(item.path)}">${safeLabel}</button><span class="archive-breadcrumb-sep">/</span>`;
    }).join("");
  };
  const renderCurrentView = () => {
    const children = getChildrenByPrefix(currentPrefix);
    countEl.textContent = `当前 ${children.length} 项，压缩包共 ${totalCount} 项`;
    renderBreadcrumb();
    if (children.length === 0) {
      bodyEl.innerHTML = "";
      emptyEl.style.display = "";
      emptyEl.textContent = "此目录为空";
      tableWrapEl.style.display = "none";
      return;
    }
    emptyEl.style.display = "none";
    tableWrapEl.style.display = "";
    bodyEl.innerHTML = children.map((item) => {
      const typeText = item.isDirectory ? "目录" : "文件";
      const nameText = escapeHtml(String(item.name || ""));
      const sizeText = item.isDirectory ? "-" : formatSize(item.size);
      const compressedText = item.isDirectory ? "-" : (item.compressedSize > 0 ? formatSize(item.compressedSize) : "-");
      if (item.isDirectory) {
        return `<tr class="archive-entry-dir-row" data-archive-dir="${escapeHtml(item.path)}"><td>${typeText}</td><td class="archive-entries-name-cell"><button type="button" class="archive-entry-dir-btn">${nameText}</button></td><td>${sizeText}</td><td>${compressedText}</td><td></td></tr>`;
      }
      const previewType = resolvePreviewType(item.name);
      const canPreview = !!previewType && archiveEntry;
      const previewBtnHtml = canPreview ? `<td class="archive-entries-preview-cell"><button type="button" class="archive-entry-preview-btn" title="预览" data-archive-preview="${escapeHtml(item.path)}">预览</button></td>` : '<td class="archive-entries-preview-cell"></td>';
      const nameCellHtml = canPreview 
        ? `<td class="archive-entries-name-cell"><span class="archive-entry-name-text previewable-name" data-archive-preview="${escapeHtml(item.path)}">${nameText}</span></td>`
        : `<td class="archive-entries-name-cell"><span class="archive-entry-name-text">${nameText}</span></td>`;
      return `<tr class="${canPreview ? "archive-entry-file-row previewable" : "archive-entry-file-row"}" data-archive-file="${escapeHtml(item.path)}"><td>${typeText}</td>${nameCellHtml}<td>${sizeText}</td><td>${compressedText}</td>${previewBtnHtml}</tr>`;
    }).join("");
  };
  renderCurrentView();
  modal.style.display = "flex";
  
  const handleArchiveFilePreview = async (filePath) => {
    if (!filePath || !archiveEntry) return;
    const normalizedPath = String(filePath || "").replace(/\\/g, "/").trim();
    if (!normalizedPath) return;
    
    const fileName = normalizedPath.split("/").pop() || "文件";
    const ext = getFileExt(fileName);
    const previewType = resolvePreviewType(fileName);
    
    
    if (!previewType) {
      alert("该文件格式暂不支持预览");
      return;
    }
    
    const closeBusy = showAppBusy("正在加载文件内容...");
    try {
      const res = await request(`/api/files/${archiveEntry.id}/zip/entry?path=${encodeURIComponent(normalizedPath)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "读取文件失败");
        return;
      }
      
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
      const previewUrl = URL.createObjectURL(file);
      
      const tempEntry = {
        id: `archive_${archiveEntry.id}_${normalizedPath}`,
        name: fileName,
        type: "file",
        size: file.size,
        ext,
        previewUrl,
        isArchiveEntry: true,
        archiveId: archiveEntry.id,
        archivePath: normalizedPath,
        archiveContent: blob
      };
      
      if (previewType === "image" || previewType === "video" || previewType === "audio") {
        tempEntry.getPreviewUrl = () => previewUrl;
      }
      
      closeBusy();
      
      if (window.DrivePreview && typeof window.DrivePreview.open === "function") {
        const currentPreviewConfig = localPreviewConfig || state.previewConfig || {};
        
        if (window.DrivePreview.updatePreviewExtSets) {
          window.DrivePreview.updatePreviewExtSets(currentPreviewConfig);
        }
        
        const originalGetStreamPreviewUrl = window.DrivePreview.getStreamPreviewUrl;
        const mockGetStreamPreviewUrl = (entry) => {
          if (entry && entry.previewUrl) return entry.previewUrl;
          if (originalGetStreamPreviewUrl) return originalGetStreamPreviewUrl(entry);
          return "";
        };
        
        window.DrivePreview.getStreamPreviewUrl = mockGetStreamPreviewUrl;
        
        const originalGetEntries = window.DrivePreview.getEntries;
        
        if (tempEntry.isArchiveEntry) {
          window.DrivePreview.getEntries = () => [tempEntry];
        }
        
        try {
          await window.DrivePreview.open(tempEntry);
        } finally {
          if (originalGetStreamPreviewUrl) {
            window.DrivePreview.getStreamPreviewUrl = originalGetStreamPreviewUrl;
          } else {
            delete window.DrivePreview.getStreamPreviewUrl;
          }
          
          if (originalGetEntries) {
            window.DrivePreview.getEntries = originalGetEntries;
          } else {
            delete window.DrivePreview.getEntries;
          }
        }
        
        const cleanupTimer = setTimeout(() => {
          URL.revokeObjectURL(previewUrl);
        }, 60000);
        
        const checkModal = setInterval(() => {
          const modal = document.getElementById("previewModal");
          if (modal && modal.style.display === "none") {
            clearInterval(checkModal);
            clearTimeout(cleanupTimer);
            URL.revokeObjectURL(previewUrl);
          }
        }, 500);
      } else {
        window.open(previewUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(previewUrl), 5000);
      }
    } catch (error) {
      closeBusy();
      alert(error && error.message ? error.message : "预览失败");
    }
  };
  
  const close = () => {
    modal.style.display = "none";
    closeBtn.removeEventListener("click", onClose);
    okBtn.removeEventListener("click", onClose);
    bodyEl.removeEventListener("click", onBodyClick);
    breadcrumbEl.removeEventListener("click", onBreadcrumbClick);
    modal.removeEventListener("click", closeByMask);
    document.removeEventListener("keydown", onEsc);
    resolve();
  };
  const onClose = () => close();
  const onBodyClick = (event) => {
    const previewBtn = event.target.closest("[data-archive-preview]");
    if (previewBtn) {
      event.stopPropagation();
      const filePath = String(previewBtn.getAttribute("data-archive-preview") || "");
      if (!filePath || !archiveEntry) return;
      handleArchiveFilePreview(filePath);
      return;
    }
    const dirBtn = event.target.closest("[data-archive-dir]");
    if (!dirBtn) return;
    const nextPrefix = String(dirBtn.getAttribute("data-archive-dir") || "");
    currentPrefix = nextPrefix;
    renderCurrentView();
  };
  const onBreadcrumbClick = (event) => {
    const breadcrumbBtn = event.target.closest("[data-archive-breadcrumb]");
    if (!breadcrumbBtn) return;
    currentPrefix = String(breadcrumbBtn.getAttribute("data-archive-breadcrumb") || "");
    renderCurrentView();
  };
  const closeByMask = (event) => {
    if (event.target === modal) close();
  };
  const onEsc = (event) => {
    if (event.key === "Escape") close();
  };
  closeBtn.addEventListener("click", onClose);
  okBtn.addEventListener("click", onClose);
  bodyEl.addEventListener("click", onBodyClick);
  breadcrumbEl.addEventListener("click", onBreadcrumbClick);
  modal.addEventListener("click", closeByMask);
  document.addEventListener("keydown", onEsc);
});

window.showAppConfirm = (options = {}) => showDeleteConfirm(options);
window.showAppNotice = (options = {}) => showAppNotice(options);
window.showAppPrompt = (options = {}) => showAppPrompt(options);
window.showAppSelect = (options = {}) => showAppSelect(options);
window.alert = (message) => {
  showAppNotice({ message: String(message || ""), noticeType: APP_NOTICE_TYPE.ERROR }).catch(() => {
    nativeAlert(String(message || ""));
  });
};
const cleanupChunkUploadSession = (uploadId, { keepalive = false } = {}) => {
  const normalizedUploadId = String(uploadId || "").trim();
  if (!normalizedUploadId) return;
  const url = appendFileSpaceToUrl(`/api/upload/chunk/${encodeURIComponent(normalizedUploadId)}`);
  fetch(url, {
    method: "DELETE",
    credentials: "same-origin",
    keepalive: !!keepalive
  }).catch(() => {});
};
const cleanupChunkUploadSessionByTaskId = (taskId, { keepalive = false } = {}) => {
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) return;
  const url = appendFileSpaceToUrl(`/api/upload/chunk-task/${encodeURIComponent(normalizedTaskId)}`);
  fetch(url, {
    method: "DELETE",
    credentials: "same-origin",
    keepalive: !!keepalive
  }).catch(() => {});
};
window.addEventListener("beforeunload", () => {
  const uploadingTasks = state.uploadTasks.filter((task) => task && task.status === "uploading");
  const hasUploadingTask = uploadingTasks.length > 0;
  if (!hasUploadingTask) return;
  uploadingTasks.forEach((task) => {
    // Keep chunk session on server to support resumable uploads across sessions
    task.status = "paused";
  });
  persistUploadTasks();
});

const setUploadTasksViewVisible = (visible) => {
  if (!filesContentContainer || !uploadTasksMainContainer) return;
  if (mySharesMainContainer) {
    mySharesMainContainer.classList.add("hidden");
  }
  filesContentContainer.classList.toggle("hidden", visible);
  uploadTasksMainContainer.classList.toggle("hidden", !visible);
  const myFilesHeader = document.getElementById("myFilesHeader");
  if (visible) {
    document.querySelectorAll(".secondary-nav-item, .sub-nav-item").forEach((el) => el.classList.remove("active"));
    mainNavItems.forEach((el) => el.classList.remove("active"));
    if (myFilesHeader) {
      myFilesHeader.classList.remove("active");
    }
  } else {
    mainNavItems.forEach((el) => {
      el.classList.toggle("active", String(el.dataset.view || "") === "files");
    });
    updateNavState();
  }
  if (uploadTasksNavBtn) {
    uploadTasksNavBtn.classList.toggle("active", visible);
  }
  if (mySharesNavBtn && visible) {
    mySharesNavBtn.classList.remove("active");
  }
  if (visible && detailsSidebar && !detailsSidebar.classList.contains("hidden")) {
    detailsSidebar.classList.add("hidden");
  }
  if (mobileCategoryBar) {
    mobileCategoryBar.style.display = (!visible && state.view === "files" && state.fileSpace !== "hidden") ? "" : "none";
  }
};

const isRecycleUploadRestricted = () => {
  const uploadTasksVisible = uploadTasksMainContainer && !uploadTasksMainContainer.classList.contains("hidden");
  return state.view === "recycle" && !uploadTasksVisible;
};

const setMySharesViewVisible = (visible) => {
  if (!filesContentContainer || !mySharesMainContainer) return;
  if (uploadTasksMainContainer) {
    uploadTasksMainContainer.classList.add("hidden");
  }
  filesContentContainer.classList.toggle("hidden", visible);
  mySharesMainContainer.classList.toggle("hidden", !visible);
  const myFilesHeader = document.getElementById("myFilesHeader");
  if (visible) {
    document.querySelectorAll(".secondary-nav-item, .sub-nav-item").forEach((el) => el.classList.remove("active"));
    if (myFilesHeader) {
      myFilesHeader.classList.remove("active");
    }
  } else {
    mainNavItems.forEach((el) => {
      el.classList.toggle("active", String(el.dataset.view || "") === "files");
    });
    updateNavState();
  }
  if (mySharesNavBtn) {
    mySharesNavBtn.classList.toggle("active", visible);
  }
  if (uploadTasksNavBtn && visible) {
    uploadTasksNavBtn.classList.remove("active");
  }
  if (visible && detailsSidebar && !detailsSidebar.classList.contains("hidden")) {
    detailsSidebar.classList.add("hidden");
  }
  if (mobileCategoryBar) {
    mobileCategoryBar.style.display = (!visible && state.view === "files" && state.fileSpace !== "hidden") ? "" : "none";
  }
};

const request = async (url, options = {}) => {
  const targetUrl = appendFileSpaceToUrl(url);
  const response = await fetch(targetUrl, options);
  if (response.status === 401) {
    clearLoginSessionStorage();
    window.location.href = "/";
    throw new Error("未登录");
  }
  return response;
};

if (window.DrivePreview && typeof window.DrivePreview.init === "function") {
  window.DrivePreview.init({
    request,
    buildPreviewUrl: appendFileSpaceToUrl,
    escapeHtml,
    getEntries: () => state.entries
  });
}

const loadPublicSettings = async () => {
  try {
    const res = await fetch("/api/public-settings");
    if (!res.ok) return;
    const settings = await res.json();
    const system = settings && settings.system && typeof settings.system === "object" ? settings.system : {};
    const login = settings && settings.login && typeof settings.login === "object" ? settings.login : {};
    const title = String(system.siteTitle || "").trim();
    if (title) {
      document.title = title;
    }
    const avatarUploadSizeMb = Math.max(1, Math.min(100, Math.floor(Number(system.avatarUploadSizeMb) || DEFAULT_AVATAR_UPLOAD_SIZE_MB)));
    const maxUploadFileCount = Math.max(1, Math.min(1000, Math.floor(Number(system.maxUploadFileCount) || 100)));
    const maxConcurrentUploadCount = Math.max(1, Math.min(20, Math.floor(Number(system.maxConcurrentUploadCount) || 3)));
    const chunkUploadThresholdMb = Math.max(1, Math.min(102400, Math.floor(Number(system.chunkUploadThresholdMb) || DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB)));
    const avatarUploadFormats = normalizeAvatarFormatList(system.avatarUploadFormats);
    const uploadAllowedExtSet = normalizeUploadAllowedExtSet(system.uploadCategoryRules);
    const previewConfig = system.previewConfig && typeof system.previewConfig === "object" ? system.previewConfig : {};
    state.maxUploadFileCount = maxUploadFileCount;
    state.maxConcurrentUploadCount = maxConcurrentUploadCount;
    state.chunkUploadThresholdMb = chunkUploadThresholdMb;
    state.chunkUploadThresholdBytes = chunkUploadThresholdMb * 1024 * 1024;
    state.uploadAllowedExtSet = uploadAllowedExtSet;
    state.avatarUploadSizeMb = avatarUploadSizeMb;
    state.avatarUploadMaxSizeBytes = avatarUploadSizeMb * 1024 * 1024;
    state.avatarUploadFormats = avatarUploadFormats;
    state.previewConfig = previewConfig;
    if (window.DrivePreview && typeof window.DrivePreview.updatePreviewExtSets === "function") {
      window.DrivePreview.updatePreviewExtSets(previewConfig);
    }
    updateAvatarUploadUiHints();
    const sessionMinutes = Math.max(1, Math.min(43200, Math.floor(Number(login.loginSessionMinutes) || 10080)));
    state.loginSessionMinutes = sessionMinutes;
    const savedLoginAt = Number(localStorage.getItem(LOGIN_AT_STORAGE_KEY) || 0);
    const loginAt = Number.isFinite(savedLoginAt) && savedLoginAt > 0 ? savedLoginAt : Date.now();
    localStorage.setItem(LOGIN_AT_STORAGE_KEY, String(loginAt));
    localStorage.setItem(LOGIN_SESSION_MINUTES_STORAGE_KEY, String(sessionMinutes));
    const expireAt = loginAt + sessionMinutes * 60 * 1000;
    scheduleAutoLogout(expireAt - Date.now());
  } catch (error) {
    updateAvatarUploadUiHints();
    ensureAutoLogoutByStoredSession();
  }
};

const resolveCurrentFilesSide = () => {
  if (uploadTasksMainContainer && !uploadTasksMainContainer.classList.contains("hidden")) {
    return { side: "uploadTasks", category: null };
  }
  if (mySharesMainContainer && !mySharesMainContainer.classList.contains("hidden")) {
    return { side: "myShares", category: null };
  }
  if (state.fileSpace === "hidden" && state.view === "files" && !state.category && !state.keyword) {
    return { side: "hidden", category: null };
  }
  if (state.view === "recycle") {
    return { side: "recycle", category: null };
  }
  if (state.category) {
    return { side: "category", category: state.category };
  }
  return { side: "myFiles", category: null };
};

const updateRouteQuery = (payload = {}, replace = false) => {
  const { main, side, category, usersTab, mountId, syncTaskId, settingsMenu, monitorMenu, fileSpace } = payload;
  const params = new URLSearchParams(window.location.search);
  if (main) params.set("main", main);
  else params.delete("main");
  if (side) params.set("side", side);
  else params.delete("side");
  if (category) params.set("category", category);
  else params.delete("category");
  const hasUsersTab = Object.prototype.hasOwnProperty.call(payload, "usersTab");
  if (hasUsersTab) {
    if (usersTab) params.set("usersTab", usersTab);
    else params.delete("usersTab");
  }
  const hasMountId = Object.prototype.hasOwnProperty.call(payload, "mountId");
  if (hasMountId) {
    if (mountId) params.set("mountId", String(mountId));
    else params.delete("mountId");
  }
  const hasSyncTaskId = Object.prototype.hasOwnProperty.call(payload, "syncTaskId");
  if (hasSyncTaskId) {
    if (syncTaskId) params.set("syncTaskId", String(syncTaskId));
    else params.delete("syncTaskId");
  }
  const hasSettingsMenu = Object.prototype.hasOwnProperty.call(payload, "settingsMenu");
  if (hasSettingsMenu) {
    if (settingsMenu) params.set("settingsMenu", settingsMenu);
    else params.delete("settingsMenu");
  } else if (Object.prototype.hasOwnProperty.call(payload, "main") && main !== "settings") {
    params.delete("settingsMenu");
  }
  const hasMonitorMenu = Object.prototype.hasOwnProperty.call(payload, "monitorMenu");
  if (hasMonitorMenu) {
    if (monitorMenu) params.set("monitorMenu", monitorMenu);
    else params.delete("monitorMenu");
  } else if (Object.prototype.hasOwnProperty.call(payload, "main") && main !== "monitor") {
    params.delete("monitorMenu");
  }
  const hasFileSpace = Object.prototype.hasOwnProperty.call(payload, "fileSpace");
  if (hasFileSpace) {
    if (fileSpace === "hidden") params.set("space", "hidden");
    else params.delete("space");
  }
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
};

const syncRouteByCurrentState = (replace = false) => {
  const activeMain = Array.from(mainNavItems).find((item) => item.classList.contains("active"))?.dataset.view || "files";
  if (activeMain !== "files") {
    updateRouteQuery({ main: activeMain, side: null, category: null }, replace);
    return;
  }
  const current = resolveCurrentFilesSide();
  updateRouteQuery({ main: "files", side: current.side, category: current.category, fileSpace: state.fileSpace }, replace);
};

const entryKey = (entry) => `${entry.type}:${entry.id}`;

const getSelectedEntries = () => state.selectedEntries.slice();

const clearSelection = () => {
  state.selectedEntries = [];
  const fileTable = document.querySelector("#view-files .file-table");
  if (fileTable) fileTable.classList.remove("show-check");
  
  document.querySelectorAll(".grid-item.selected, .table-row.selected, .timeline-entry.selected").forEach(item => {
    item.classList.remove("selected");
    const checkbox = item.querySelector("input[type='checkbox']");
    if (checkbox) checkbox.checked = false;
  });
  
  if (typeof window !== "undefined" && window.gridDragSelectState) {
    window.gridDragSelectState.selectedItems.clear();
    window.gridDragSelectState.isSelecting = false;
    if (window.hideGridSelectionBox) {
      window.hideGridSelectionBox();
    }
  }
  updateBatchActionState();
};

const clearBatchClipboard = () => {
  state.clipboardAction = "";
  state.clipboardEntries = [];
  updateBatchActionState();
};

const applyPermissionUI = () => {
  const canUpload = hasUserPermission("upload");
  if (uploadFileBtn) uploadFileBtn.style.display = canUpload ? "" : "none";
  if (uploadDirBtn) uploadDirBtn.style.display = canUpload ? "" : "none";
  if (mobileUploadEntry) mobileUploadEntry.style.display = canUpload ? "" : "none";
  if (!canUpload && mobileUploadPopover) {
    mobileUploadPopover.classList.remove("show");
  }
  if (state.clipboardAction === "copy" && !hasUserPermission("copy")) {
    clearBatchClipboard();
  }
  if (state.clipboardAction === "move" && !hasUserPermission("move")) {
    clearBatchClipboard();
  }
  updateBatchActionState();
};

const setEntrySelected = (entry, checked) => {
  const key = entryKey(entry);
  const map = new Map(state.selectedEntries.map((item) => [entryKey(item), item]));
  if (checked) {
    map.set(key, { id: entry.id, type: entry.type, name: entry.name });
  } else {
    map.delete(key);
  }
  state.selectedEntries = Array.from(map.values());
};

const isEntrySelected = (entry) => state.selectedEntries.some((item) => item.id === entry.id && item.type === entry.type);

const updateBatchButtonLabel = (btn, icon, text, count) => {
  if (!btn) return;
  const finalText = count === 1 ? text.replace(/^批量/, "") : text;
  const suffix = count > 0 ? ` (${count})` : "";
  btn.innerHTML = `<i class="${icon}" ></i> ${finalText}${suffix}`;
};

const updateBatchPasteLabel = (action, count) => {
  if (!batchPasteBtn) return;
  const text = action === "move" ? "移入" : "粘贴";
  const suffix = count > 0 ? ` (${count})` : "";
  batchPasteBtn.innerHTML = `<i class="fa-regular fa-clipboard" ></i> ${text}${suffix}`;
};

const setCurrentPageSelection = (checked) => {
  const currentPageEntries = getCurrentFilePageEntries();
  currentPageEntries.forEach((entry) => setEntrySelected(entry, checked));
  if (!checked) {
    state.selectedEntry = null;
    renderDetails(null);
  } else if (currentPageEntries.length > 0) {
    state.selectedEntry = currentPageEntries[0];
    renderDetails(currentPageEntries[0]);
  }
  renderFileList();
};

const updateBatchActionState = () => {
  const count = state.selectedEntries.length;
  const hasClipboard = state.clipboardEntries.length > 0 && !!state.clipboardAction;
  const disabled = count === 0 || state.view === "recycle";
  const isRecycle = state.view === "recycle";
  const hasSelection = count > 0;
  const canCopy = hasUserPermission("copy");
  const canMove = hasUserPermission("move");
  const canDelete = hasUserPermission("delete");
  const canDownload = hasUserPermission("download");
  const canArchive = canDownload && hasUserPermission("upload");
  const canPaste = state.clipboardAction === "move" ? canMove : canCopy;
  batchButtonMeta.forEach((item) => updateBatchButtonLabel(item.btn, item.icon, item.text, count));
  if (batchDownloadBtn) {
    batchDownloadBtn.disabled = disabled || !canDownload;
    batchDownloadBtn.style.display = !isRecycle && canDownload ? "" : "none";
  }
  if (batchArchiveBtn) {
    batchArchiveBtn.disabled = disabled || !canArchive;
    batchArchiveBtn.style.display = !isRecycle && canArchive ? "" : "none";
  }
  if (batchCopyBtn) {
    batchCopyBtn.disabled = disabled || !canCopy;
    batchCopyBtn.style.display = !isRecycle && canCopy ? "" : "none";
  }
  if (batchMoveBtn) {
    batchMoveBtn.disabled = disabled || !canMove;
    batchMoveBtn.style.display = !isRecycle && canMove ? "" : "none";
  }
  if (batchDeleteBtn) {
    batchDeleteBtn.disabled = disabled || !canDelete;
    batchDeleteBtn.style.display = !isRecycle && canDelete ? "" : "none";
  }
  if (newFolderBtn) {
    newFolderBtn.style.display = isRecycle ? "none" : "";
  }
  if (batchRestoreBtn) {
    batchRestoreBtn.disabled = count === 0;
    const suffix = count > 0 ? ` (${count})` : "";
    batchRestoreBtn.innerHTML = `<i class="fa-solid fa-rotate-left" ></i> 恢复${suffix}`;
    batchRestoreBtn.style.display = isRecycle ? "" : "none";
  }
  if (clearSelectionBtn) {
    clearSelectionBtn.disabled = count === 0;
    clearSelectionBtn.style.display = count > 0 && !hasClipboard ? "" : "none";
  }
  if (batchPasteBtn) {
    batchPasteBtn.style.display = hasClipboard ? "" : "none";
    batchPasteBtn.disabled = state.view === "recycle" || !canPaste;
    updateBatchPasteLabel(state.clipboardAction, state.clipboardEntries.length);
  }
  if (batchCancelBtn) {
    batchCancelBtn.style.display = hasClipboard ? "" : "none";
  }
  const fileTable = document.querySelector("#view-files .file-table");
  if (fileTable && isMobileViewport()) {
    fileTable.classList.toggle("show-check", hasSelection);
  }
  const listToolbar = document.querySelector(".list-toolbar-actions");
  if (listToolbar && isMobileViewport()) {
    listToolbar.classList.toggle("has-selection", hasSelection);
  }
  const currentPageEntries = getCurrentFilePageEntries();
  const visible = currentPageEntries.length;
  const selectedVisible = currentPageEntries.filter((entry) => isEntrySelected(entry)).length;
  if (selectAllCheckbox) {
    if (visible === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = selectedVisible === visible;
      selectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible;
    }
  }
  if (gridSelectAllBtn) {
    gridSelectAllBtn.disabled = visible === 0;
    gridSelectAllBtn.classList.toggle("active", visible > 0 && selectedVisible === visible);
    gridSelectAllBtn.textContent = visible > 0 && selectedVisible === visible ? "取消全选" : "全选";
  }
};

const getQuickAccessEntryType = (value) => value === "file" ? "file" : "folder";

const getQuickAccessEntryId = (item) => {
  const rawId = item && item.entryId !== undefined ? item.entryId : item && item.folderId;
  const entryId = Number(rawId);
  return Number.isInteger(entryId) && entryId > 0 ? entryId : 0;
};

const getQuickAccessEntryKey = (entryType, entryId) => `${getQuickAccessEntryType(entryType)}:${Number(entryId)}`;

const getQuickAccessEntryKeySet = () => {
  return new Set(
    state.quickAccessFolders
      .map((item) => {
        const entryId = getQuickAccessEntryId(item);
        if (!entryId) return "";
        const entryType = getQuickAccessEntryType(item && item.entryType);
        return getQuickAccessEntryKey(entryType, entryId);
      })
      .filter(Boolean)
  );
};

const renderQuickAccessList = () => {
  if (!quickAccessListEl) return;
  quickAccessListEl.innerHTML = "";
  if (!Array.isArray(state.quickAccessFolders) || state.quickAccessFolders.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "drag-placeholder";
    placeholder.textContent = "暂无收藏";
    quickAccessListEl.appendChild(placeholder);
    updateMenuGroupToggleVisibility();
    return;
  }
  state.quickAccessFolders.forEach((item) => {
    const entryId = getQuickAccessEntryId(item);
    if (!entryId) return;
    const entryType = getQuickAccessEntryType(item && item.entryType);
    const entryIconClass = entryType === "file" ? "fa-regular fa-file" : "fa-regular fa-folder";
    const link = document.createElement("a");
    link.href = "#";
    link.className = "quick-access-item";
    link.innerHTML = `<i class="fa-solid fa-star quick-access-remove"></i><i class="${entryIconClass}"></i><span title="${escapeHtml(String(item.name || ""))}">${escapeHtml(String(item.name || ""))}</span>`;
    link.onclick = async (event) => {
      event.preventDefault();
      const target = event.target instanceof Element ? event.target : null;
      const removeIcon = target ? target.closest(".quick-access-remove") : null;
      if (removeIcon) {
        const removeRes = await request(`/api/quick-access/${entryType}/${entryId}`, { method: "DELETE" });
        if (!removeRes.ok) {
          const data = await removeRes.json().catch(() => ({}));
          alert(data.message || "操作失败");
          return;
        }
        await loadQuickAccess();
        renderFileList();
        return;
      }
      clearSelection();
      setUploadTasksViewVisible(false);
      state.view = "files";
      state.category = "";
      state.keyword = "";
      state.selectedEntry = null;
      if (entryType === "folder") {
        state.currentFolderId = entryId;
        updateRouteQuery({ main: "files", side: "myFiles", category: null });
        refreshAll();
      } else {
        updateRouteQuery({ main: "files", side: "myFiles", category: null });
        openFilePreview({ id: entryId, type: "file", name: String(item.name || "文件") });
      }
    };
    quickAccessListEl.appendChild(link);
  });
  updateMenuGroupToggleVisibility();
};

const loadQuickAccess = async () => {
  try {
    const res = await request("/api/quick-access");
    if (!res.ok) {
      state.quickAccessFolders = [];
      renderQuickAccessList();
      return;
    }
    const rows = await res.json();
    state.quickAccessFolders = Array.isArray(rows) ? rows : [];
    renderQuickAccessList();
  } catch (error) {
    state.quickAccessFolders = [];
    renderQuickAccessList();
  }
};

const toggleQuickAccessEntry = async (entry) => {
  const entryId = Number(entry && entry.id);
  const entryType = getQuickAccessEntryType(entry && entry.type);
  if (!Number.isInteger(entryId) || entryId <= 0 || (entryType !== "folder" && entryType !== "file")) return;
  const quickAccessSet = getQuickAccessEntryKeySet();
  const exists = quickAccessSet.has(getQuickAccessEntryKey(entryType, entryId));
  const url = exists ? `/api/quick-access/${entryType}/${entryId}` : "/api/quick-access";
  const options = exists
    ? { method: "DELETE" }
    : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryType, entryId })
    };
  const res = await request(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.message || "操作失败");
    return;
  }
  await loadQuickAccess();
  renderFileList();
};
