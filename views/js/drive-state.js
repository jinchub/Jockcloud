// State
const state = {
  currentFolderId: null,
  searchOriginFolderId: null,
  keyword: "",
  searchScope: "all",
  category: "", // image, video, audio, doc, text, archive, program, other, recycle
  view: "files", // files, recycle
  path: [],
  entries: [],
  selectedEntry: null,
  selectedEntries: [],
  viewMode: "list",
  gridSize: "medium",
  sortBy: "updatedAt",
  order: "desc",
  clipboardAction: "",
  clipboardEntries: [],
  uploadTasks: [],
  downloadTasks: [],
  selectedUploadTaskIds: [],
  selectedDownloadTaskIds: [],
  myShares: [],
  selectedMyShareCodes: [],
  userPermissions: FILE_PERMISSION_KEYS.slice(),
  filePage: 1,
  filePageSize: 50,
  entriesTotal: 0,
  uploadTasksPage: 1,
  uploadTasksPageSize: 20,
  downloadTasksPage: 1,
  downloadTasksPageSize: 20,
  transferTaskTab: "upload",
  mySharesPage: 1,
  mySharesPageSize: 20,
  usersPage: 1,
  usersPageSize: 20,
  userGroupsPage: 1,
  userGroupsPageSize: 20,
  permissionsPage: 1,
  permissionsPageSize: 20,
  quotaPage: 1,
  quotaPageSize: 20,
  entriesQueryKey: "",
  loginSessionMinutes: 10080,
  sessionExpireTimer: null,
  allowedMenus: MAIN_MENU_KEYS.slice(),
  mobileVisibleMenus: MAIN_MENU_KEYS.slice(),
  currentUser: null,
  currentUserStats: null,
  maxUploadFileCount: 100,
  maxConcurrentUploadCount: 3,
  chunkUploadThresholdMb: DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB,
  chunkUploadThresholdBytes: DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB * 1024 * 1024,
  uploadAllowedExtSet: null,
  avatarUploadSizeMb: DEFAULT_AVATAR_UPLOAD_SIZE_MB,
  avatarUploadMaxSizeBytes: DEFAULT_AVATAR_UPLOAD_SIZE_MB * 1024 * 1024,
  avatarUploadFormats: DEFAULT_AVATAR_UPLOAD_FORMATS.slice(),
  quickAccessFolders: [],
  visibleCategories: FILE_CATEGORY_KEYS.slice(),
  categoryTimelineEnabled: normalizeCategoryTimelineModePreference(localStorage.getItem(CATEGORY_TIMELINE_MODE_STORAGE_KEY)),
  fileSpace: "normal",
  hiddenSpaceEnabled: null,
  hiddenSpaceUnlocked: hiddenSpaceManager ? hiddenSpaceManager.getInitialUnlocked() : false
};

const clearLoginSessionStorage = () => {
  localStorage.removeItem(LOGIN_AT_STORAGE_KEY);
  localStorage.removeItem(LOGIN_SESSION_MINUTES_STORAGE_KEY);
  localStorage.removeItem("drive_allowed_menus_cache_v1");
  localStorage.removeItem("drive_mobile_visible_menus_cache_v1");
  if (hiddenSpaceManager) {
    hiddenSpaceManager.clearUnlockedStorage();
  }
};

const getRootLabelBySpace = () => {
  if (hiddenSpaceManager) {
    return hiddenSpaceManager.getRootLabel(state);
  }
  return state.fileSpace === "hidden" ? "隐藏空间" : "我的文件";
};

const setHiddenSpaceUnlocked = (unlocked) => {
  if (hiddenSpaceManager) {
    hiddenSpaceManager.setUnlocked(state, unlocked, { closeBtn: closeHiddenSpaceBtn, dot: hiddenSpaceDot, resetBtn: resetHiddenSpacePwdBtn });
    return;
  }
  state.hiddenSpaceUnlocked = !!unlocked;
};

const updateHiddenSpaceUiState = () => {
  if (hiddenSpaceManager) {
    hiddenSpaceManager.updateUi(state, { closeBtn: closeHiddenSpaceBtn, dot: hiddenSpaceDot, resetBtn: resetHiddenSpacePwdBtn });
    return;
  }
};

const appendFileSpaceToUrl = (url) => {
  if (hiddenSpaceManager) {
    return hiddenSpaceManager.appendFileSpaceToUrl(url, state);
  }
  return url;
};

const loadHiddenSpaceStatus = async () => {
  if (!hiddenSpaceManager) return;
  await hiddenSpaceManager.loadStatus(request, state, { closeBtn: closeHiddenSpaceBtn, dot: hiddenSpaceDot, resetBtn: resetHiddenSpacePwdBtn });
};

const ensureHiddenSpaceAccess = async () => {
  if (!hiddenSpaceManager) return false;
  const ask = async (message, defaultValue) => {
    if (typeof window.showAppPrompt === "function") {
      const isVerifyPrompt = String(message || "").trim() === "请输入隐藏空间安全密码";
      return window.showAppPrompt({
        title: message,
        defaultValue,
        inputType: "password",
        headerActionText: isVerifyPrompt ? "重置密码" : "",
        headerActionValue: "__RESET_HIDDEN_SPACE_PASSWORD__"
      });
    }
    try {
      return window.prompt(message, defaultValue);
    } catch (error) {
      alert("当前环境不支持输入弹窗");
      return null;
    }
  };
  const choose = async (title, options) => {
    if (typeof window.showAppSelect === "function") {
      return window.showAppSelect({ title, options, defaultValue: "current" });
    }
    return "current";
  };
  const openResetDialog = async () => {
    return showHiddenSpaceResetModal();
  };
  return hiddenSpaceManager.ensureAccess(
    request,
    state,
    { closeBtn: closeHiddenSpaceBtn, dot: hiddenSpaceDot, resetBtn: resetHiddenSpacePwdBtn },
    (message) => alert(message),
    ask,
    choose,
    openResetDialog
  );
};

const switchFileSpace = async (nextSpace, side = "myFiles") => {
  const normalized = nextSpace === "hidden" ? "hidden" : "normal";
  const shouldResetContext = state.fileSpace !== normalized || state.view !== "files" || !!state.category || !!state.keyword;
  if (shouldResetContext) {
    state.fileSpace = normalized;
    state.view = "files";
    state.currentFolderId = null;
    state.category = "";
    state.keyword = "";
    state.selectedEntry = null;
    clearSelection();
    if (searchInput) {
      searchInput.value = "";
    }
    await loadUploadTasks();
    await loadDownloadTasks();
    renderUploadTasks();
    renderDownloadTasks();
  }
  setUploadTasksViewVisible(false);
  updateHiddenSpaceUiState();
  updateRouteQuery({ main: "files", side, category: null });
  await refreshAll();
};

const scheduleAutoLogout = (remainMs) => {
  if (state.sessionExpireTimer) {
    clearTimeout(state.sessionExpireTimer);
    state.sessionExpireTimer = null;
  }
  if (remainMs <= 0) {
    clearLoginSessionStorage();
    window.location.href = "/";
    return;
  }
  const waitMs = Math.min(remainMs, MAX_TIMEOUT_MS);
  state.sessionExpireTimer = setTimeout(() => {
    scheduleAutoLogout(remainMs - waitMs);
  }, waitMs);
};

const ensureAutoLogoutByStoredSession = () => {
  const savedLoginAt = Number(localStorage.getItem(LOGIN_AT_STORAGE_KEY) || 0);
  if (!Number.isFinite(savedLoginAt) || savedLoginAt <= 0) return;
  const storedSessionMinutes = Math.max(1, Math.min(43200, Math.floor(Number(localStorage.getItem(LOGIN_SESSION_MINUTES_STORAGE_KEY)) || state.loginSessionMinutes)));
  const expireAt = savedLoginAt + storedSessionMinutes * 60 * 1000;
  scheduleAutoLogout(expireAt - Date.now());
};

const normalizeUserPermissions = (permissions) => {
  if (!Array.isArray(permissions)) return FILE_PERMISSION_KEYS.slice();
  return permissions.filter((item) => FILE_PERMISSION_KEYS.includes(String(item)));
};

const normalizeAllowedMenus = (menus) => {
  if (!Array.isArray(menus)) return MAIN_MENU_KEYS.slice();
  const dedup = [];
  const seen = new Set();
  menus.forEach((item) => {
    const key = String(item || "");
    if (!MAIN_MENU_KEYS.includes(key) || seen.has(key)) return;
    seen.add(key);
    dedup.push(key);
  });
  if (!seen.has("files")) {
    dedup.unshift("files");
    seen.add("files");
  }
  if (!seen.has("transfer")) {
    dedup.splice(Math.min(1, dedup.length), 0, "transfer");
    seen.add("transfer");
  }
  return dedup;
};

const isMobileViewport = () => {
  return window.matchMedia("(max-width: 768px)").matches;
};

const getRenderableMenus = () => {
  const allowed = normalizeAllowedMenus(state.allowedMenus);
  if (!isMobileViewport()) return allowed;
  const mobileSet = new Set(normalizeAllowedMenus(state.mobileVisibleMenus));
  const filtered = allowed.filter((key) => mobileSet.has(key));
  if (filtered.length > 0) return filtered;
  return ["files"];
};

const normalizeViewModePreference = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return VIEW_MODE_SET.has(normalized) ? normalized : "list";
};

const normalizeGridSizePreference = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return GRID_SIZE_SET.has(normalized) ? normalized : "medium";
};

function normalizeCategoryTimelineModePreference(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return !(normalized === "0" || normalized === "false" || normalized === "off");
}

const normalizeVisibleCategoriesPreference = (value) => {
  if (!Array.isArray(value)) return FILE_CATEGORY_KEYS.slice();
  const dedup = [];
  const seen = new Set();
  value.forEach((item) => {
    const key = String(item || "").trim().toLowerCase();
    if (!FILE_CATEGORY_KEYS.includes(key) || seen.has(key)) return;
    seen.add(key);
    dedup.push(key);
  });
  return dedup;
};

const isCategoryVisible = (category) => {
  return state.visibleCategories.includes(String(category || ""));
};

const hasVisibleElement = (elements) => {
  return Array.from(elements || []).some((element) => {
    if (!(element instanceof Element)) return false;
    return window.getComputedStyle(element).display !== "none";
  });
};

const ensureGroupToggleIcon = (headerEl) => {
  if (!(headerEl instanceof Element)) return null;
  const headerLeft = headerEl.querySelector(".header-left");
  if (!headerLeft) return null;
  let toggleIcon = headerLeft.querySelector(".toggle-icon");
  if (!toggleIcon) {
    toggleIcon = document.createElement("i");
    toggleIcon.className = "fa-solid fa-caret-down toggle-icon";
    headerLeft.insertBefore(toggleIcon, headerLeft.firstChild);
  }
  return toggleIcon;
};

const removeGroupToggleIcon = (headerEl) => {
  if (!(headerEl instanceof Element)) return;
  const toggleIcon = headerEl.querySelector(".header-left .toggle-icon");
  if (toggleIcon) {
    toggleIcon.remove();
  }
};

const updateMenuGroupToggleVisibility = () => {
  const myFilesHeader = document.getElementById("myFilesHeader");
  if (myFilesHeader) {
    const myFilesSubItems = myFilesHeader.parentElement
      ? myFilesHeader.parentElement.querySelectorAll(".sub-items .sub-nav-item[data-category]")
      : [];
    const canToggleMyFiles = hasVisibleElement(myFilesSubItems);
    if (canToggleMyFiles) {
      ensureGroupToggleIcon(myFilesHeader);
      if (myFilesHeader.parentElement) {
        myFilesHeader.parentElement.classList.add("expanded");
      }
    } else {
      removeGroupToggleIcon(myFilesHeader);
    }
    if (!canToggleMyFiles && myFilesHeader.parentElement) {
      myFilesHeader.parentElement.classList.remove("expanded");
    }
  }

  const quickAccessHeader = document.getElementById("quickAccessHeader");
  if (quickAccessHeader) {
    const quickAccessItems = quickAccessHeader.parentElement
      ? quickAccessHeader.parentElement.querySelectorAll("#quickAccessList .quick-access-item")
      : [];
    const canToggleQuickAccess = quickAccessItems.length > 0;
    if (canToggleQuickAccess) {
      ensureGroupToggleIcon(quickAccessHeader);
    } else {
      removeGroupToggleIcon(quickAccessHeader);
    }
    if (!canToggleQuickAccess && quickAccessHeader.parentElement) {
      quickAccessHeader.parentElement.classList.add("expanded");
    }
  }
};

const applyCategoryVisibilityUI = () => {
  document.querySelectorAll(".sub-nav-item[data-category]").forEach((item) => {
    const category = String(item.dataset.category || "").trim().toLowerCase();
    if (category === "all") {
      item.style.display = "";
      return;
    }
    item.style.display = isCategoryVisible(category) ? "" : "none";
  });
  if (!myFilesNamePanel) return;
  myFilesNamePanel.querySelectorAll("input[data-category-visibility]").forEach((input) => {
    const category = String(input.dataset.categoryVisibility || "").trim().toLowerCase();
    input.checked = isCategoryVisible(category);
  });
  updateMenuGroupToggleVisibility();
};

const hasUserPermission = (permission) => {
  return state.userPermissions.includes(permission);
};

const ensurePermission = (permission) => {
  if (hasUserPermission(permission)) return true;
  if (typeof window.showAppNotice === "function") {
    window.showAppNotice({ title: "提示", message: "无权执行该操作", isError: true });
  } else {
    nativeAlert("无权执行该操作");
  }
  return false;
};
