// DOM Elements
const fileListEl = document.getElementById("fileList");
const uploadFileBtn = document.getElementById("uploadFileBtn");
const uploadDirBtn = document.getElementById("uploadDirBtn");
const mobileUploadEntry = document.getElementById("mobileUploadEntry");
const mobileUploadMenuBtn = document.getElementById("mobileUploadMenuBtn");
const mobileUploadPopover = document.getElementById("mobileUploadPopover");
const mobileUploadFileBtn = document.getElementById("mobileUploadFileBtn");
const mobileUploadDirBtn = document.getElementById("mobileUploadDirBtn");
const fileInput = document.getElementById("fileInput");
const dirInput = document.getElementById("dirInput");
const newFolderBtn = document.getElementById("newFolderBtn");
const refreshDirBtn = document.getElementById("refreshDirBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const searchScopeGroup = document.getElementById("searchScopeGroup");
// const userNameAvatar = document.getElementById("userNameAvatar");
const statsEl = document.getElementById("stats");
const refreshCapacityBtn = document.getElementById("refreshCapacityBtn");
const detailsContent = document.getElementById("detailsContent");
const closeDetailsBtn = document.getElementById("closeDetailsBtn");
const detailsSidebar = document.getElementById("detailsSidebar");
const filesContentContainer = document.getElementById("filesContentContainer");
const uploadTasksMainContainer = document.getElementById("uploadTasksMainContainer");
const uploadTasksNavBtn = document.getElementById("uploadTasksNavBtn");
const mobileCategoryBar = document.getElementById("mobileCategoryBar");
const mySharesMainContainer = document.getElementById("mySharesMainContainer");
const mySharesNavBtn = document.getElementById("mySharesNavBtn");
const closeMySharesBtn = document.getElementById("closeMySharesBtn");
const myShareList = document.getElementById("myShareList");
const mySharePaginationSummaryEl = document.getElementById("mySharePaginationSummary");
const mySharePageInfoEl = document.getElementById("mySharePageInfo");
const mySharePrevPageBtn = document.getElementById("mySharePrevPageBtn");
const myShareNextPageBtn = document.getElementById("myShareNextPageBtn");
const mySharePageSizeSelect = document.getElementById("mySharePageSizeSelect");
const myShareSelectAllCheckbox = document.getElementById("myShareSelectAllCheckbox");
const myShareBatchCancelBtn = document.getElementById("myShareBatchCancelBtn");
const hiddenSpaceNavBtn = document.getElementById("hiddenSpaceNavBtn");
const hiddenSpaceDot = document.getElementById("hiddenSpaceDot");
const resetHiddenSpacePwdBtn = document.getElementById("resetHiddenSpacePwdBtn");
const closeHiddenSpaceBtn = document.getElementById("closeHiddenSpaceBtn");
const closeUploadTasksBtn = document.getElementById("closeUploadTasksBtn");
const contextMenu = document.getElementById("contextMenu");
const currentPathEl = document.querySelector(".current-path");
const logoutBtn = document.getElementById("logoutBtn");
const newFolderModal = document.getElementById("newFolderModal");
const newFolderForm = document.getElementById("newFolderForm");
const newFolderNameInput = document.getElementById("newFolderName");
const cancelNewFolderBtn = document.getElementById("cancelNewFolderBtn");
const renameModal = document.getElementById("renameModal");
const renameForm = document.getElementById("renameForm");
const renameInput = document.getElementById("renameInput");
const cancelRenameBtn = document.getElementById("cancelRenameBtn");
const shareModal = document.getElementById("shareModal");
const shareForm = document.getElementById("shareForm");
const shareExpireOptionList = document.getElementById("shareExpireOptionList");
const shareCustomCodeInput = document.getElementById("shareCustomCodeInput");
const shareResultBox = document.getElementById("shareResultBox");
const shareLinkText = document.getElementById("shareLinkText");
const shareCodeText = document.getElementById("shareCodeText");
const shareExpireText = document.getElementById("shareExpireText");
const cancelShareBtn = document.getElementById("cancelShareBtn");
const generateShareBtn = document.getElementById("generateShareBtn");
const viewModeBtn = document.getElementById("viewModeBtn");
const gridSizeSelector = document.getElementById("gridSizeSelector");
const gridSelectAllBtn = document.getElementById("gridSelectAllBtn");
const timelineModeToggleBtn = document.getElementById("timelineModeToggleBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const batchDownloadBtn = document.getElementById("batchDownloadBtn");
const batchArchiveBtn = document.getElementById("batchArchiveBtn");
const batchCopyBtn = document.getElementById("batchCopyBtn");
const batchMoveBtn = document.getElementById("batchMoveBtn");
const batchDeleteBtn = document.getElementById("batchDeleteBtn");
const batchRestoreBtn = document.getElementById("batchRestoreBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const batchPasteBtn = document.getElementById("batchPasteBtn");
const batchCancelBtn = document.getElementById("batchCancelBtn");
const searchResultSummaryEl = document.getElementById("searchResultSummary");
const deleteConfirmModal = document.getElementById("deleteConfirmModal");
const deleteConfirmTitleEl = document.getElementById("deleteConfirmTitle");
const deleteConfirmMessageEl = document.getElementById("deleteConfirmMessage");
const deleteConfirmDescEl = document.getElementById("deleteConfirmDesc");
const deleteConfirmCloseBtn = document.getElementById("deleteConfirmCloseBtn");
const deleteConfirmCancelBtn = document.getElementById("deleteConfirmCancelBtn");
const deleteConfirmOkBtn = document.getElementById("deleteConfirmOkBtn");
const uploadTaskList = document.getElementById("uploadTaskList");
const downloadTaskList = document.getElementById("downloadTaskList");
const pendingCountEl = document.getElementById("pendingCount");
const uploadingCountEl = document.getElementById("uploadingCount");
const completedCountEl = document.getElementById("completedCount");
const clearCanceledTasksBtn = document.getElementById("clearCanceledTasksBtn");
const clearUploadTasksBtn = document.getElementById("clearUploadTasksBtn");
const cancelSelectedTransferTasksBtn = document.getElementById("cancelSelectedTransferTasksBtn");
const clearSelectedTransferTasksBtn = document.getElementById("clearSelectedTransferTasksBtn");
const uploadTaskSelectAllCheckbox = document.getElementById("uploadTaskSelectAllCheckbox");
const downloadTaskSelectAllCheckbox = document.getElementById("downloadTaskSelectAllCheckbox");
const uploadTasksCompletedBadge = document.getElementById("uploadTasksCompletedBadge");
const transferUploadTabBtn = document.getElementById("transferUploadTabBtn");
const transferDownloadTabBtn = document.getElementById("transferDownloadTabBtn");
const transferTaskRefreshTip = document.getElementById("transferTaskRefreshTip");
const uploadTaskPanel = document.getElementById("uploadTaskPanel");
const downloadTaskPanel = document.getElementById("downloadTaskPanel");
const filePaginationSummaryEl = document.getElementById("filePaginationSummary");
const filePageInfoEl = document.getElementById("filePageInfo");
const filePrevPageBtn = document.getElementById("filePrevPageBtn");
const fileNextPageBtn = document.getElementById("fileNextPageBtn");
const filePageSizeSelect = document.getElementById("filePageSizeSelect");
const uploadTaskPaginationSummaryEl = document.getElementById("uploadTaskPaginationSummary");
const uploadTaskPageInfoEl = document.getElementById("uploadTaskPageInfo");
const uploadTaskPrevPageBtn = document.getElementById("uploadTaskPrevPageBtn");
const uploadTaskNextPageBtn = document.getElementById("uploadTaskNextPageBtn");
const uploadTaskPageSizeSelect = document.getElementById("uploadTaskPageSizeSelect");
const downloadTaskPaginationSummaryEl = document.getElementById("downloadTaskPaginationSummary");
const downloadTaskPageInfoEl = document.getElementById("downloadTaskPageInfo");
const downloadTaskPrevPageBtn = document.getElementById("downloadTaskPrevPageBtn");
const downloadTaskNextPageBtn = document.getElementById("downloadTaskNextPageBtn");
const downloadTaskPageSizeSelect = document.getElementById("downloadTaskPageSizeSelect");
const usersPaginationSummaryEl = document.getElementById("usersPaginationSummary");
const usersPageInfoEl = document.getElementById("usersPageInfo");
const usersPrevPageBtn = document.getElementById("usersPrevPageBtn");
const usersNextPageBtn = document.getElementById("usersNextPageBtn");
const usersPageSizeSelect = document.getElementById("usersPageSizeSelect");
const userGroupsPaginationSummaryEl = document.getElementById("userGroupsPaginationSummary");
const userGroupsPageInfoEl = document.getElementById("userGroupsPageInfo");
const userGroupsPrevPageBtn = document.getElementById("userGroupsPrevPageBtn");
const userGroupsNextPageBtn = document.getElementById("userGroupsNextPageBtn");
const userGroupsPageSizeSelect = document.getElementById("userGroupsPageSizeSelect");
const permsPaginationSummaryEl = document.getElementById("permsPaginationSummary");
const permsPageInfoEl = document.getElementById("permsPageInfo");
const permsPrevPageBtn = document.getElementById("permsPrevPageBtn");
const permsNextPageBtn = document.getElementById("permsNextPageBtn");
const permsPageSizeSelect = document.getElementById("permsPageSizeSelect");
const quotaPaginationSummaryEl = document.getElementById("quotaPaginationSummary");
const quotaPageInfoEl = document.getElementById("quotaPageInfo");
const quotaPrevPageBtn = document.getElementById("quotaPrevPageBtn");
const quotaNextPageBtn = document.getElementById("quotaNextPageBtn");
const quotaPageSizeSelect = document.getElementById("quotaPageSizeSelect");
const listViewEl = document.querySelector(".list-view");
const quickAccessListEl = document.getElementById("quickAccessList");
const myFilesMoreBtn = document.getElementById("myFilesMoreBtn");
const myFilesNamePanel = document.getElementById("myFilesNamePanel");
const profileCenterModal = document.getElementById("profileCenterModal");
const profileCenterAvatar = document.getElementById("profileCenterAvatar");
const profileCenterName = document.getElementById("profileCenterName");
const profileCenterGroups = document.getElementById("profileCenterGroups");
const profileCenterUsername = document.getElementById("profileCenterUsername");
const profileCenterQuota = document.getElementById("profileCenterQuota");
const closeProfileCenterBtn = document.getElementById("closeProfileCenterBtn");
const openAvatarUpdateBtn = document.getElementById("openAvatarUpdateBtn");
const openProfileEditBtn = document.getElementById("openProfileEditBtn");
const profileLogoutBtn = document.getElementById("profileLogoutBtn");
const avatarUpdateModal = document.getElementById("avatarUpdateModal");
const avatarUpdateForm = document.getElementById("avatarUpdateForm");
const profileAvatarFileInput = document.getElementById("profileAvatarFileInput");
const profileAvatarUploadLabel = document.getElementById("profileAvatarUploadLabel");
const profileAvatarUploadTip = document.getElementById("profileAvatarUploadTip");
const profileAvatarCropCanvas = document.getElementById("profileAvatarCropCanvas");
const profileAvatarZoomRange = document.getElementById("profileAvatarZoomRange");
const profileAvatarUrlInput = document.getElementById("profileAvatarUrlInput");
const profileAvatarPreview = document.getElementById("profileAvatarPreview");
const cancelAvatarUpdateBtn = document.getElementById("cancelAvatarUpdateBtn");
const profileEditModal = document.getElementById("profileEditModal");
const profileEditForm = document.getElementById("profileEditForm");
const profileEditNameInput = document.getElementById("profileEditNameInput");
const profileEditPhoneInput = document.getElementById("profileEditPhoneInput");
const profileEditPasswordInput = document.getElementById("profileEditPasswordInput");
const cancelProfileEditBtn = document.getElementById("cancelProfileEditBtn");
const closePlanComparisonBtn = document.getElementById("closePlanComparisonBtn");
const batchButtonMeta = [
  { btn: batchDownloadBtn, icon: "fa-solid fa-download", text: "下载" },
  { btn: batchArchiveBtn, icon: "fa-solid fa-file-zipper", text: "压缩" },
  { btn: batchCopyBtn, icon: "fa-regular fa-copy", text: "复制" },
  { btn: batchMoveBtn, icon: "fa-solid fa-right-left", text: "移动" },
  { btn: batchDeleteBtn, icon: "fa-regular fa-trash-can", text: "删除" }
];
const MENU_ICON_SVG = {
  open: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5h6l1.8 2h9.2"/><path d="M4 8.5v9a2 2 0 0 0 2 2h11.8a2 2 0 0 0 1.9-1.5l1.3-5a2 2 0 0 0-1.9-2.5H8.8a2 2 0 0 0-1.8 1.1"/></svg>',
  detail: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>',
  download: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5v10"/><path d="m8.5 11 3.5 3.5 3.5-3.5"/><path d="M5 18.5h14"/></svg>',
  zipView: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h8l3 3v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5v-15A2 2 0 0 1 7 3.5Z"/><path d="M15 3.5v3h3"/><path d="M10 9.5h2"/><path d="M10 12.5h2"/><path d="M10 15.5h2"/><path d="M12 9.5v8"/></svg>',
  unzip: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5h5l2 2h10"/><path d="M4 9.5v9a2 2 0 0 0 2 2h12a2 2 0 0 0 1.9-1.4l1.2-4.5A2 2 0 0 0 19.2 12H11"/><path d="M12 3.5v7"/><path d="m8.8 7.2 3.2 3.3 3.2-3.3"/></svg>',
  unzipTarget: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5h5l2 2h10"/><path d="M4 9.5v9a2 2 0 0 0 2 2h12a2 2 0 0 0 1.9-1.4l1.2-4.5A2 2 0 0 0 19.2 12H11"/><path d="M12 3.5v7"/><path d="m8.8 7.2 3.2 3.3 3.2-3.3"/><circle cx="18.5" cy="5.5" r="2"/><path d="M18.5 7.5v2.8"/></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="7" r="2.2"/><circle cx="18" cy="17" r="2.2"/><path d="m8.2 11.1 7.6-2.7"/><path d="m8.2 12.9 7.6 2.7"/></svg>',
  copy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3.5" width="13" height="13" rx="2"/><rect x="3.5" y="8" width="13" height="13" rx="2"/></svg>',
  rename: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5h4.2l9.2-9.2-4.2-4.2-9.2 9.2z"/><path d="m12.8 7.2 4.2 4.2"/></svg>',
  move: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="m8.7 7.3 3.3-3.3 3.3 3.3"/><path d="m8.7 16.7 3.3 3.3 3.3-3.3"/><path d="M4 12h16"/><path d="m7.3 8.7-3.3 3.3 3.3 3.3"/><path d="m16.7 8.7 3.3 3.3-3.3 3.3"/></svg>',
  delete: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 7.5h13"/><path d="M9.5 7.5v-2h5v2"/><path d="M8 7.5v11a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 18.5v-11"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
  deleteStrong: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f53f3f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 7.5h13"/><path d="M9.5 7.5v-2h5v2"/><path d="M8 7.5v11a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 18.5v-11"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
  restore: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1f2329" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.2 8v4h4"/><path d="M6.4 12a6.6 6.6 0 1 0 2.2-4.9"/></svg>'
};
const MENU_ICON_SRC = Object.entries(MENU_ICON_SVG).reduce((acc, [key, svg]) => {
  acc[key] = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return acc;
}, {});
const getContextMenuItemContent = (iconKey, label) => {
  const iconSvg = (MENU_ICON_SVG[iconKey] || MENU_ICON_SVG.open).replace(/stroke="[^"]*"/g, 'stroke="currentColor"');
  return `<span class="menu-item-icon">${iconSvg}</span><span>${label}</span>`;
};
const initContextMenuIconItems = () => {
  const openEl = document.getElementById("menuOpen");
  const detailEl = document.getElementById("menuDetail");
  const downloadEl = document.getElementById("menuDownload");
  const zipViewEl = document.getElementById("menuZipView");
  const zipExtractCurrentEl = document.getElementById("menuZipExtractCurrent");
  const zipExtractTargetEl = document.getElementById("menuZipExtractTarget");
  const locateFolderEl = document.getElementById("menuLocateFolder");
  const shareEl = document.getElementById("menuShare");
  const copyEl = document.getElementById("menuCopy");
  const renameEl = document.getElementById("menuRename");
  const moveEl = document.getElementById("menuMove");
  const deleteEl = document.getElementById("menuDelete");
  if (openEl) openEl.innerHTML = getContextMenuItemContent("open", "打开");
  if (detailEl) detailEl.innerHTML = getContextMenuItemContent("detail", "详情");
  if (downloadEl) downloadEl.innerHTML = getContextMenuItemContent("download", "下载");
  if (zipViewEl) zipViewEl.innerHTML = getContextMenuItemContent("zipView", "查看压缩包");
  if (zipExtractCurrentEl) zipExtractCurrentEl.innerHTML = getContextMenuItemContent("unzip", "解压到当前目录");
  if (zipExtractTargetEl) zipExtractTargetEl.innerHTML = getContextMenuItemContent("unzipTarget", "解压到指定目录");
  if (locateFolderEl) locateFolderEl.innerHTML = getContextMenuItemContent("open", "跳转至所在目录");
  if (shareEl) shareEl.innerHTML = getContextMenuItemContent("share", "分享");
  if (copyEl) copyEl.innerHTML = getContextMenuItemContent("copy", "复制");
  if (renameEl) renameEl.innerHTML = getContextMenuItemContent("rename", "重命名");
  if (moveEl) moveEl.innerHTML = getContextMenuItemContent("move", "移动");
  if (deleteEl) deleteEl.innerHTML = getContextMenuItemContent("delete", "删除");
};
const FILE_PERMISSION_KEYS = ["upload", "download", "rename", "delete", "move", "copy", "extract", "viewArchive"];
const MAIN_MENU_KEYS = ["files", "transfer", "users", "permissions", "quota", "mounts", "sync", "monitor", "settings"];
const FILE_CATEGORY_KEYS = ["image", "doc", "video", "text", "audio", "archive", "program", "other"];
const PAGE_SIZE_OPTIONS = [20, 50, 100, 150, 200];
const nativeAlert = typeof window !== "undefined" && typeof window.alert === "function" ? window.alert.bind(window) : () => {};
const nativeConfirm = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm.bind(window) : () => false;
const ARCHIVE_FILE_EXT_SET = new Set(["zip", "tar", "tgz", "gz", "bz2", "xz", "tar.gz", "tar.bz2", "tar.xz"]);
const LOGIN_AT_STORAGE_KEY = "jc_login_at";
const LOGIN_SESSION_MINUTES_STORAGE_KEY = "jc_login_session_minutes";
const CATEGORY_TIMELINE_MODE_STORAGE_KEY = "jc_category_timeline_mode";
const MAX_TIMEOUT_MS = 2147483647;
const DEFAULT_AVATAR_UPLOAD_SIZE_MB = 4;
const DEFAULT_AVATAR_UPLOAD_FORMATS = ["jpg", "png", "webp", "bmp"];
const DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB = 200;
const UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const getChunkUploadThresholdBytes = () => {
  const value = Number(state && state.chunkUploadThresholdBytes);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB * 1024 * 1024;
};
const isChunkUploadFileSize = (size) => Number(size || 0) > getChunkUploadThresholdBytes();
const VIEW_MODE_SET = new Set(["list", "grid"]);
const GRID_SIZE_SET = new Set(["small", "medium", "large"]);
const createClientUuid = () => {
  const cryptoObj = typeof globalThis !== "undefined" && globalThis.crypto ? globalThis.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
};
const hiddenSpaceManager = typeof window.createHiddenSpaceManager === "function" ? window.createHiddenSpaceManager() : null;
const AVATAR_MIME_FORMAT_MAP = {
  "image/jpeg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/gif": "gif"
};

const getEntryFileExt = (entry) => {
  const name = String(entry && entry.name ? entry.name : "").trim().toLowerCase();
  if (name.endsWith(".tar.gz")) return "tar.gz";
  if (name.endsWith(".tar.bz2")) return "tar.bz2";
  if (name.endsWith(".tar.xz")) return "tar.xz";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= -1 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1);
};

const isArchiveFileEntry = (entry) => {
  if (!entry || entry.type !== "file") return false;
  return ARCHIVE_FILE_EXT_SET.has(getEntryFileExt(entry));
};
