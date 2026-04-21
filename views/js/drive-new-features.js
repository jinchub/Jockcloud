// --- New Features Logic ---

const mainNavItems = document.querySelectorAll(".primary-nav-item[data-view]");
const views = {
  files: document.getElementById("view-files"),
  users: document.getElementById("view-users"),
  permissions: document.getElementById("view-permissions"),
  quota: document.getElementById("view-quota"),
  mounts: document.getElementById("view-mounts"),
  sync: document.getElementById("view-sync"),
  monitor: document.getElementById("view-monitor"),
  settings: document.getElementById("view-settings")
};

const pruneUnauthorizedMenuNodes = () => {
  // Do not remove menu/view nodes at runtime.
  // Cached permissions may be stale on first paint; nodes are only hidden/shown by applyMainMenuVisibility.
};

const applyMainMenuVisibility = () => {
  document.documentElement.classList.remove("menu-permission-init");
  pruneUnauthorizedMenuNodes();
  const allowed = new Set(getRenderableMenus());
  mainNavItems.forEach((el) => {
    const view = String(el.dataset.view || "");
    el.style.display = allowed.has(view) ? "" : "none";
    if (!allowed.has(view)) {
      el.classList.remove("active");
    }
  });
  if (uploadTasksNavBtn) {
    const visible = allowed.has("transfer");
    uploadTasksNavBtn.style.display = visible ? "" : "none";
    if (!visible) {
      uploadTasksNavBtn.classList.remove("active");
    }
  }
};

let usersData = [];
let userGroupsData = [];
let userManageActiveTab = "users";
let userModalGroupIds = [];
const mountManager = typeof window.createMountManager === "function"
  ? window.createMountManager({ request, formatDate, escapeHtml })
  : null;
const syncManager = typeof window.createSyncManager === "function"
  ? window.createSyncManager({ request, formatDate, escapeHtml })
  : null;
const settingsManager = typeof window.createSettingsManager === "function"
  ? window.createSettingsManager({ request, formatDate, escapeHtml })
  : null;
const userTableSort = {
  users: { key: "id", order: "asc" },
  permissions: { key: "id", order: "asc" },
  quota: { key: "id", order: "asc" }
};

const getSortedUsersByTable = (tableKey) => {
  const sortState = userTableSort[tableKey] || { key: "id", order: "asc" };
  const sorted = usersData.slice().sort((a, b) => {
    if (sortState.key === "username") {
      const left = String(a.username || "").toLowerCase();
      const right = String(b.username || "").toLowerCase();
      if (left === right) return Number(a.id || 0) - Number(b.id || 0);
      return left < right ? -1 : 1;
    }
    if (sortState.key === "used") {
      return Number(a.used || 0) - Number(b.used || 0);
    }
    if (sortState.key === "usageRate") {
      const getUsageRate = (user) => {
        const total = Number(user.quota);
        if (!Number.isFinite(total) || total <= 0) return -1;
        return Number(user.used || 0) / total;
      };
      return getUsageRate(a) - getUsageRate(b);
    }
    return Number(a.id || 0) - Number(b.id || 0);
  });
  return sortState.order === "asc" ? sorted : sorted.reverse();
};

const getSortIndicator = (tableKey, key) => {
  const sortState = userTableSort[tableKey];
  if (!sortState || sortState.key !== key) return "";
  return sortState.order === "asc" ? " ↑" : " ↓";
};

const updateUserTableSortHeaders = () => {
  const mappings = [
    { id: "usersSortId", table: "users", key: "id", text: "ID" },
    { id: "usersSortUsername", table: "users", key: "username", text: "用户名" },
    { id: "permsSortId", table: "permissions", key: "id", text: "ID" },
    { id: "permsSortUsername", table: "permissions", key: "username", text: "用户名" },
    { id: "quotaSortId", table: "quota", key: "id", text: "ID" },
    { id: "quotaSortUsername", table: "quota", key: "username", text: "用户名" },
    { id: "quotaSortUsed", table: "quota", key: "used", text: "已用" },
    { id: "quotaSortUsageRate", table: "quota", key: "usageRate", text: "使用率" }
  ];
  mappings.forEach(({ id, table, key, text }) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${text}${getSortIndicator(table, key)}`;
  });
};

const toggleUserTableSort = (tableKey, key) => {
  const sortState = userTableSort[tableKey];
  if (!sortState) return;
  if (sortState.key === key) {
    sortState.order = sortState.order === "asc" ? "desc" : "asc";
  } else {
    sortState.key = key;
    sortState.order = "asc";
  }
  updateUserTableSortHeaders();
  if (tableKey === "users") renderUsers();
  if (tableKey === "permissions") renderPermissions();
  if (tableKey === "quota") renderQuotaTable();
};

const bindUserTableSortEvents = () => {
  const bindings = [
    ["usersSortId", "users", "id"],
    ["usersSortUsername", "users", "username"],
    ["permsSortId", "permissions", "id"],
    ["permsSortUsername", "permissions", "username"],
    ["quotaSortId", "quota", "id"],
    ["quotaSortUsername", "quota", "username"],
    ["quotaSortUsed", "quota", "used"],
    ["quotaSortUsageRate", "quota", "usageRate"]
  ];
  bindings.forEach(([id, table, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = () => toggleUserTableSort(table, key);
  });
  updateUserTableSortHeaders();
};

const switchMainView = async (viewName, enterOptions = {}) => {
  const renderableMenus = getRenderableMenus();
  const targetView = renderableMenus.includes(viewName) ? viewName : (renderableMenus[0] || "files");
  
  // Stop monitor auto-refresh and timers when leaving monitor view
  if (Array.from(mainNavItems).some(el => el.classList.contains("active") && el.dataset.view === "monitor") && targetView !== "monitor") {
    stopSystemMonitorAutoRefresh();
    stopResourceMonitorAutoRefresh();
    stopApiMonitorAutoRefresh();
    stopUptimeTimer();
  }
  
  // Update Nav Active State
  mainNavItems.forEach(el => {
    if (el.dataset.view === targetView) el.classList.add("active");
    else el.classList.remove("active");
  });
  if (uploadTasksNavBtn) {
    uploadTasksNavBtn.classList.remove("active");
  }
  if (secondarySidebar) {
    secondarySidebar.style.display = targetView === "files" ? "" : "none";
  }
  if (mobileCategoryBar && targetView !== "files") {
    mobileCategoryBar.style.display = "none";
  }

  // Toggle Views
  const flexViews = new Set(["files", "users", "permissions", "quota"]);
  Object.keys(views).forEach(key => {
    if (!views[key]) return;
    views[key].style.display = key === targetView ? (flexViews.has(key) ? "flex" : "block") : "none";
  });

  // Load Data
  if (targetView === "users") await loadUsers();
  if (targetView === "permissions") await loadUsers();
  if (targetView === "quota") await loadQuota();
  if (targetView === "mounts" && mountManager && typeof mountManager.onEnterView === "function") await mountManager.onEnterView(enterOptions.mounts || {});
  if (targetView === "sync" && syncManager && typeof syncManager.onEnterView === "function") await syncManager.onEnterView(enterOptions.sync || {});
  if (targetView === "settings" && settingsManager && typeof settingsManager.onEnterView === "function") await settingsManager.onEnterView(enterOptions.settings || {});
  return targetView;
};

const bindPrimaryNav = () => {
  mainNavItems.forEach(el => {
    el.onclick = async (e) => {
      e.preventDefault();
      const view = el.dataset.view;
      const enterOptions = {};
      if (view === "settings") {
        enterOptions.settings = { menu: "system" };
      } else if (view === "sync") {
        enterOptions.sync = { taskId: "" };
      } else if (view === "monitor") {
        monitorState.activeMenu = "system";
      }
      const targetView = await switchMainView(view, enterOptions);
      if (targetView === "files") {
        setUploadTasksViewVisible(false);
        await refreshAll();
        updateRouteQuery({ main: "files", side: resolveCurrentFilesSide().side, category: resolveCurrentFilesSide().category, usersTab: null, mountId: null, syncTaskId: null, settingsMenu: null, monitorMenu: null });
      } else if (targetView === "monitor") {
        renderMonitorPanel(monitorState.activeMenu);
        updateRouteQuery({ main: targetView, side: null, category: null, usersTab: null, mountId: null, syncTaskId: null, settingsMenu: null, monitorMenu: monitorState.activeMenu });
      } else {
        updateRouteQuery({ main: targetView, side: null, category: null, usersTab: null, mountId: null, syncTaskId: null, settingsMenu: null, monitorMenu: null });
      }
    };
  });
};

const applyRouteFromUrl = async () => {
  const params = new URLSearchParams(window.location.search);
  const main = params.get("main");
  const renderableMenus = getRenderableMenus();
  const fallbackMain = renderableMenus[0] || "files";
  const targetMain = views[main] && renderableMenus.includes(main) ? main : fallbackMain;
  const currentMain = await switchMainView(targetMain);

  if (currentMain !== "files") {
    setUploadTasksViewVisible(false);
    if (currentMain === "users") {
      const usersTab = params.get("usersTab");
      setUserManageTab(usersTab === "groups" ? "groups" : "users", "replace");
    }
    if (currentMain === "monitor") {
      const monitorMenu = params.get("monitorMenu");
      monitorState.activeMenu = normalizeMonitorMenuKey(monitorMenu, "system");
      renderMonitorPanel(monitorState.activeMenu);
    }
    updateRouteQuery({
      main: currentMain,
      side: null,
      category: null,
      usersTab: currentMain === "users" ? userManageActiveTab : null,
      mountId: currentMain === "mounts" ? undefined : null,
      syncTaskId: currentMain === "sync" ? undefined : null,
      monitorMenu: currentMain === "monitor" ? monitorState.activeMenu : null
    }, true);
    return;
  }

  const side = params.get("side");
  const routeSpace = params.get("space") === "hidden" ? "hidden" : "normal";
  const category = params.get("category");
  const validCategories = new Set(["image", "doc", "video", "audio", "text", "archive", "program", "other"]);
  clearSelection();
  state.selectedEntry = null;
  state.keyword = "";
  if (searchInput) {
    searchInput.value = "";
  }

  if (side === "uploadTasks") {
    state.view = "files";
    state.category = "";
    state.currentFolderId = null;
    setUploadTasksViewVisible(true);
  } else if (side === "myShares") {
    state.view = "files";
    state.category = "";
    state.currentFolderId = null;
    await loadMyShares();
    state.mySharesPage = 1;
    renderMyShares();
    setMySharesViewVisible(true);
  } else {
    setUploadTasksViewVisible(false);
    if (side === "hidden") {
      state.view = "files";
      state.category = "";
      state.currentFolderId = null;
      const pass = await ensureHiddenSpaceAccess().catch(() => false);
      if (!pass) {
        state.fileSpace = "normal";
      } else {
        state.fileSpace = "hidden";
      }
    } else if (side === "recycle") {
      state.fileSpace = routeSpace;
      state.view = "recycle";
      state.category = "";
      state.currentFolderId = null;
      if (state.fileSpace === "hidden") {
        const pass = await ensureHiddenSpaceAccess().catch(() => false);
        if (!pass) {
          state.fileSpace = "normal";
        }
      }
    } else if (side === "category" && validCategories.has(category)) {
      state.fileSpace = "normal";
      state.view = "files";
      state.category = category;
      state.currentFolderId = null;
    } else {
      state.fileSpace = "normal";
      state.view = "files";
      state.category = "";
      state.currentFolderId = null;
    }
  }
  updateHiddenSpaceUiState();
  updateRouteQuery({ main: "files", side: resolveCurrentFilesSide().side, category: resolveCurrentFilesSide().category }, true);
  await refreshAll();
};
