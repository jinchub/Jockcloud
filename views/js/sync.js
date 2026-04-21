(function () {
  const nativeAlert = typeof window !== "undefined" && typeof window.alert === "function" ? window.alert.bind(window) : () => {};
  const nativeConfirm = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm.bind(window) : () => false;

  const getStatusText = (status) => {
    if (status === "running") return "运行中";
    if (status === "paused") return "已暂停";
    if (status === "success") return "成功";
    if (status === "error") return "失败";
    return "未启动";
  };

  const getStatusClassName = (status) => {
    if (status === "running") return "sync-status-running";
    if (status === "paused") return "sync-status-paused";
    if (status === "success") return "sync-status-success";
    if (status === "error") return "sync-status-error";
    return "sync-status-idle";
  };

  const getTaskTypeText = (type) => (type === "schedule" ? "定时" : "单次");

  const getDirectionText = (direction) => {
    if (direction === "remote_to_local") return "远端同步本地";
    if (direction === "bidirectional") return "双向同步";
    return "本地同步远端";
  };

  const getScheduleUnitText = (unit) => {
    if (unit === "time_point") return "指定时间";
    if (unit === "week") return "周";
    if (unit === "month") return "月";
    if (unit === "minute") return "分钟";
    if (unit === "hour") return "小时";
    return "天";
  };

  const normalizeScheduleTime = (value) => {
    const raw = String(value || "").trim().replace(" ", "T");
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const normalizeDir = (value) => {
    const text = String(value || "").trim().replace(/\\/g, "/");
    if (!text) return "/";
    return text.startsWith("/") ? text : `/${text}`;
  };

  const toIntervalMs = (task) => {
    const value = Math.max(1, Number(task.scheduleValue || 1));
    if (task.scheduleUnit === "month") return value * 30 * 24 * 60 * 60 * 1000;
    if (task.scheduleUnit === "week") return value * 7 * 24 * 60 * 60 * 1000;
    if (task.scheduleUnit === "day") return value * 24 * 60 * 60 * 1000;
    if (task.scheduleUnit === "hour") return value * 60 * 60 * 1000;
    return value * 60 * 1000;
  };

  const getScheduleText = (task) => {
    if (task.type !== "schedule") return "单次";
    if (task.scheduleUnit === "time_point") {
      const scheduleTime = normalizeScheduleTime(task.scheduleTime);
      return scheduleTime ? `在 ${scheduleTime.replace("T", " ")}` : "未设置指定时间";
    }
    return `每 ${Math.max(1, Number(task.scheduleValue || 1))} ${getScheduleUnitText(task.scheduleUnit)}`;
  };

  const getFileUpdateRuleText = (task) => {
    if (task.fileUpdateRule === "new_only") return "只同步新文件";
    if (task.fileUpdateRule === "modified_only") return "只同步修改过的文件";
    return "所有文件都同步";
  };

  const getDeleteRuleText = (task) => {
    if (task.deleteRule === "sync_delete") return "同步删除";
    if (task.deleteRule === "mirror") return "双向同步（目标与源保持一致）";
    return "不同步删除";
  };

  const createTaskId = () => {
    const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    return `sync-${Date.now()}-${uuid}`;
  };

  window.createSyncManager = ({ request, formatDate, escapeHtml }) => {
    const syncView = document.getElementById("view-sync");
    const syncSidebar = document.getElementById("syncSidebar");
    const toggleSyncSidebarBtn = document.getElementById("toggleSyncSidebarBtn");
    const addSyncTaskBtn = document.getElementById("addSyncTaskBtn");
    const syncTaskAsideList = document.getElementById("syncTaskAsideList");
    const syncTaskTitle = document.getElementById("syncTaskTitle");
    const syncTaskMeta = document.getElementById("syncTaskMeta");
    const syncTaskDetail = document.getElementById("syncTaskDetail");
    const syncTaskModal = document.getElementById("syncTaskModal");
    const syncTaskModalTitle = document.getElementById("syncTaskModalTitle");
    const syncTaskForm = document.getElementById("syncTaskForm");
    const syncTaskIdInput = document.getElementById("syncTaskId");
    const syncTaskNameInput = document.getElementById("syncTaskName");
    const syncLocalDirSelect = document.getElementById("syncLocalDir");
    const syncRemoteMountSelect = document.getElementById("syncRemoteMount");
    const syncRemoteDirInput = document.getElementById("syncRemoteDir");
    const syncDirectionSelect = document.getElementById("syncDirection");
    const syncTaskTypeSelect = document.getElementById("syncTaskType");
    const syncScheduleGroup = document.getElementById("syncScheduleGroup");
    const syncScheduleIntervalRow = document.getElementById("syncScheduleIntervalRow");
    const syncScheduleTimeRow = document.getElementById("syncScheduleTimeRow");
    const syncScheduleValueInput = document.getElementById("syncScheduleValue");
    const syncScheduleUnitSelect = document.getElementById("syncScheduleUnit");
    const syncScheduleTimeInput = document.getElementById("syncScheduleTime");
    const syncEmptyDirSelect = document.getElementById("syncEmptyDir");
    const syncFileUpdateRuleSelect = document.getElementById("syncFileUpdateRule");
    const syncDeleteRuleSelect = document.getElementById("syncDeleteRule");
    const cancelSyncTaskModalBtn = document.getElementById("cancelSyncTaskModalBtn");
    if (!syncView || !syncSidebar || !toggleSyncSidebarBtn || !addSyncTaskBtn || !syncTaskAsideList || !syncTaskTitle || !syncTaskMeta || !syncTaskDetail || !syncTaskModal || !syncTaskModalTitle || !syncTaskForm || !syncTaskIdInput || !syncTaskNameInput || !syncLocalDirSelect || !syncRemoteMountSelect || !syncRemoteDirInput || !syncDirectionSelect || !syncTaskTypeSelect || !syncScheduleGroup || !syncScheduleIntervalRow || !syncScheduleTimeRow || !syncScheduleValueInput || !syncScheduleUnitSelect || !syncScheduleTimeInput || !syncEmptyDirSelect || !syncFileUpdateRuleSelect || !syncDeleteRuleSelect || !cancelSyncTaskModalBtn) {
      return {
        onEnterView: async () => {}
      };
    }

    const runtime = {
      tasks: [],
      selectedTaskId: "",
      mounts: [],
      localDirOptions: [{ value: "/", label: "/" }],
      executing: new Set(),
      saveTimer: 0,
      refreshTimer: 0,
      refreshIntervalMs: 0,
      refreshing: false,
      hasLoadedOnce: false,
      liveLogSource: null,
      liveLogTaskId: "",
      liveLogLineCount: 0
    };

    const syncTaskRoute = (replace = false) => {
      const params = new URLSearchParams(window.location.search);
      params.set("main", "sync");
      if (runtime.selectedTaskId) params.set("syncTaskId", runtime.selectedTaskId);
      else params.delete("syncTaskId");
      params.delete("mountId");
      params.delete("settingsMenu");
      params.delete("usersTab");
      params.delete("side");
      params.delete("category");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    };

    const showSyncNotice = async (message, isError = true) => {
      if (typeof window.showAppNotice === "function") {
        await window.showAppNotice({ title: isError ? "提示" : "操作成功", message: String(message || ""), isError });
        return;
      }
      nativeAlert(String(message || ""));
    };

    const showSyncConfirm = async (message) => {
      if (typeof window.showAppConfirm === "function") {
        return window.showAppConfirm({
          title: "确认操作",
          message: message || "确定继续吗？",
          desc: "请确认后继续执行",
          okText: "确认",
          cancelText: "取消"
        });
      }
      return nativeConfirm(message || "确定继续吗？");
    };

    const getTaskById = (taskId) => runtime.tasks.find((item) => item.id === taskId);
    const getMountById = (mountId) => runtime.mounts.find((item) => String(item.id) === String(mountId));

    const normalizeTask = (item = {}) => {
      const type = item.type === "schedule" ? "schedule" : "once";
      return {
        id: String(item.id || createTaskId()),
        name: String(item.name || "").trim(),
        localDir: normalizeDir(item.localDir),
        remoteMountId: String(item.remoteMountId || ""),
        remoteMountName: String(item.remoteMountName || ""),
        remoteDir: normalizeDir(item.remoteDir),
        direction: item.direction === "remote_to_local" || item.direction === "bidirectional" ? item.direction : "local_to_remote",
        type,
        scheduleValue: Math.max(1, Number(item.scheduleValue || 1)),
        scheduleUnit: item.scheduleUnit === "day" || item.scheduleUnit === "hour" || item.scheduleUnit === "week" || item.scheduleUnit === "month" || item.scheduleUnit === "time_point" ? item.scheduleUnit : "minute",
        scheduleTime: normalizeScheduleTime(item.scheduleDateTime || item.scheduleAt || item.scheduleTime),
        syncEmptyDir: String(item.syncEmptyDir || "0") === "1" || item.syncEmptyDir === true ? "1" : "0",
        fileUpdateRule: item.fileUpdateRule === "new_only" || item.fileUpdateRule === "modified_only" ? item.fileUpdateRule : "all",
        deleteRule: item.deleteRule === "sync_delete" || item.deleteRule === "mirror" ? item.deleteRule : "keep",
        status: item.status || "idle",
        detail: String(item.detail || ""),
        detailStatus: item.detailStatus || item.status || "idle",
        detailAt: item.detailAt || "",
        lastRunAt: item.lastRunAt || "",
        nextRunAt: item.nextRunAt || "",
        createdAt: item.createdAt || new Date().toISOString()
      };
    };

    const getSyncTaskPayload = () => runtime.tasks.map((task) => ({
      id: String(task.id || ""),
      name: String(task.name || ""),
      localDir: normalizeDir(task.localDir),
      remoteMountId: String(task.remoteMountId || ""),
      remoteMountName: String(task.remoteMountName || ""),
      remoteDir: normalizeDir(task.remoteDir),
      direction: task.direction === "remote_to_local" || task.direction === "bidirectional" ? task.direction : "local_to_remote",
      type: task.type === "schedule" ? "schedule" : "once",
      scheduleValue: Math.max(1, Number(task.scheduleValue || 1)),
      scheduleUnit: task.scheduleUnit === "day" || task.scheduleUnit === "hour" || task.scheduleUnit === "week" || task.scheduleUnit === "month" || task.scheduleUnit === "time_point" ? task.scheduleUnit : "minute",
      scheduleTime: normalizeScheduleTime(task.scheduleTime),
      scheduleDateTime: task.scheduleUnit === "time_point" ? normalizeScheduleTime(task.scheduleTime) : "",
      syncEmptyDir: String(task.syncEmptyDir || "0") === "1" ? 1 : 0,
      fileUpdateRule: task.fileUpdateRule === "new_only" || task.fileUpdateRule === "modified_only" ? task.fileUpdateRule : "all",
      deleteRule: task.deleteRule === "sync_delete" || task.deleteRule === "mirror" ? task.deleteRule : "keep",
      status: String(task.status || "idle"),
      detail: String(task.detail || ""),
      detailStatus: String(task.detailStatus || task.status || "idle"),
      detailAt: task.detailAt || "",
      lastRunAt: task.lastRunAt || "",
      nextRunAt: task.nextRunAt || "",
      createdAt: task.createdAt || new Date().toISOString()
    }));

    const persistTasks = async () => {
      try {
        await request("/api/sync-tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: getSyncTaskPayload() })
        });
      } catch (e) {
      }
    };

    const schedulePersistTasks = () => {
      if (runtime.saveTimer) {
        clearTimeout(runtime.saveTimer);
      }
      runtime.saveTimer = window.setTimeout(() => {
        runtime.saveTimer = 0;
        persistTasks();
      }, 300);
    };

    const loadTasks = async () => {
      try {
        const res = await request("/api/sync-tasks");
        if (!res.ok) {
          runtime.tasks = [];
          return;
        }
        const parsed = await res.json();
        if (!Array.isArray(parsed)) {
          runtime.tasks = [];
          return;
        }
        runtime.tasks = parsed.map((item) => normalizeTask(item));
      } catch (e) {
        runtime.tasks = [];
      }
    };

    const isSyncViewVisible = () => syncView.style.display !== "none";

    const refreshTasksFromServer = async (force = false) => {
      if (!isSyncViewVisible()) return;
      if (runtime.refreshing || (!force && runtime.executing.size > 0) || (!force && runtime.saveTimer)) return;
      runtime.refreshing = true;
      const prevSelectedTaskId = runtime.selectedTaskId;
      try {
        await loadTasks();
        if (!runtime.tasks.length) {
          runtime.selectedTaskId = "";
        } else if (prevSelectedTaskId && getTaskById(prevSelectedTaskId)) {
          runtime.selectedTaskId = prevSelectedTaskId;
        } else if (prevSelectedTaskId && !getTaskById(prevSelectedTaskId)) {
          runtime.selectedTaskId = runtime.tasks[0].id;
        } else {
          runtime.selectedTaskId = "";
        }
        const selectedTask = getSelectedTask();
        if (selectedTask && selectedTask.status === "running") {
          updateTaskLogOnly(selectedTask.id);
        } else {
          render();
        }
        updateAutoRefreshTimer();
        syncTaskRoute(true);
      } finally {
        runtime.refreshing = false;
      }
    };

    const getAutoRefreshIntervalMs = () => {
      const minMs = 500;
      const maxMs = 30 * 60 * 1000;
      const selected = getSelectedTask();
      if (selected && selected.status === "paused") {
        return 0;
      }
      if (selected && selected.status === "running") {
        return 500;
      }
      const runningSchedules = runtime.tasks.filter((task) => task.type === "schedule" && task.status === "running");
      if (!runningSchedules.length) {
        return 0;
      }
      const fastestMs = Math.min(...runningSchedules.map((task) => toIntervalMs(task)));
      return Math.max(minMs, Math.min(maxMs, fastestMs));
    };

    const updateAutoRefreshTimer = () => {
      const nextIntervalMs = getAutoRefreshIntervalMs();
      if (!nextIntervalMs) {
        if (runtime.refreshTimer) {
          clearInterval(runtime.refreshTimer);
          runtime.refreshTimer = 0;
        }
        runtime.refreshIntervalMs = 0;
        return;
      }
      if (runtime.refreshTimer && runtime.refreshIntervalMs === nextIntervalMs) return;
      if (runtime.refreshTimer) {
        clearInterval(runtime.refreshTimer);
      }
      runtime.refreshIntervalMs = nextIntervalMs;
      runtime.refreshTimer = window.setInterval(() => {
        refreshTasksFromServer();
      }, nextIntervalMs);
    };

    const startAutoRefresh = () => {
      updateAutoRefreshTimer();
    };

    const getSelectedTask = () => getTaskById(runtime.selectedTaskId);

    const renderMountOptions = (selectedValue = "") => {
      if (!runtime.mounts.length) {
        syncRemoteMountSelect.innerHTML = `<option value="">暂无挂载，请先到挂载菜单添加</option>`;
        syncRemoteMountSelect.value = "";
        return;
      }
      syncRemoteMountSelect.innerHTML = runtime.mounts.map((mount) => `
        <option value="${escapeHtml(String(mount.id))}">${escapeHtml(String(mount.name || `挂载-${mount.id}`))}</option>
      `).join("");
      const matched = runtime.mounts.some((mount) => String(mount.id) === String(selectedValue));
      syncRemoteMountSelect.value = matched ? String(selectedValue) : String(runtime.mounts[0].id);
    };

    const loadMounts = async () => {
      try {
        const res = await request("/api/mounts");
        if (!res.ok) {
          runtime.mounts = [];
          renderMountOptions();
          return;
        }
        const parsed = await res.json();
        runtime.mounts = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        runtime.mounts = [];
      }
      renderMountOptions(syncRemoteMountSelect.value);
    };

    const renderLocalDirOptions = (selectedValue = "/") => {
      const normalizedSelected = normalizeDir(selectedValue);
      const options = Array.isArray(runtime.localDirOptions) && runtime.localDirOptions.length
        ? runtime.localDirOptions.slice()
        : [{ value: "/", label: "/" }];
      const exists = options.some((item) => normalizeDir(item.value) === normalizedSelected);
      if (!exists) {
        options.unshift({ value: normalizedSelected, label: `${normalizedSelected}（已不存在）` });
      }
      syncLocalDirSelect.innerHTML = options.map((item) => `
        <option value="${escapeHtml(normalizeDir(item.value))}">${escapeHtml(String(item.label || item.value || "/"))}</option>
      `).join("");
      syncLocalDirSelect.value = normalizedSelected;
    };

    const loadLocalDirOptions = async () => {
      const options = [{ value: "/", label: "/" }];
      const visited = new Set();
      const walk = async (parentId, parentPath, depth) => {
        const queryValue = parentId === null ? "null" : String(parentId);
        let rows = [];
        try {
          const res = await request(`/api/folders?parentId=${encodeURIComponent(queryValue)}`);
          if (!res.ok) return;
          const parsed = await res.json();
          rows = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return;
        }
        for (const folder of rows) {
          const folderId = Number(folder.id);
          if (!folderId || visited.has(folderId)) continue;
          visited.add(folderId);
          const name = String(folder.name || "").trim() || `目录-${folderId}`;
          const value = normalizeDir(parentPath === "/" ? `/${name}` : `${parentPath}/${name}`);
          const indent = depth > 0 ? `${"　".repeat(depth)}└ ` : "";
          options.push({
            value,
            label: `${indent}${name}`
          });
          await walk(folderId, value, depth + 1);
        }
      };
      await walk(null, "/", 0);
      runtime.localDirOptions = options;
      renderLocalDirOptions(syncLocalDirSelect.value || "/");
    };

    const getTaskMetaText = (task) => {
      if (!task) return "请选择左侧任务或创建新任务";
      const mountText = task.remoteMountName || "未选择挂载";
      const lastText = task.lastRunAt ? formatDate(task.lastRunAt) : "-";
      const nextText = task.nextRunAt ? formatDate(task.nextRunAt) : "-";
      return `远程挂载：${mountText} · 同步类型：${getDirectionText(task.direction)} · 上次同步：${lastText} · 下次同步：${nextText}`;
    };

    const renderTaskSidebar = () => {
      if (!runtime.tasks.length) {
        syncTaskAsideList.innerHTML = `<div class="sync-empty">暂无同步任务</div>`;
        return;
      }
      const sorted = runtime.tasks.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      syncTaskAsideList.innerHTML = sorted.map((task) => `
        <div class="mount-side-item ${task.id === runtime.selectedTaskId ? "active" : ""}" data-sync-item="${escapeHtml(task.id)}">
          <div class="mount-side-main">
            <div class="mount-side-name">${escapeHtml(task.name || "未命名任务")}</div>
            <div class="mount-side-type ${getStatusClassName(task.status)}">${getStatusText(task.status)} · ${escapeHtml(getTaskTypeText(task.type))}</div>
          </div>
          <div class="mount-side-actions">
            <button type="button" class="mount-side-action-btn" data-sync-edit="${escapeHtml(task.id)}" title="编辑"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="mount-side-action-btn danger" data-sync-delete="${escapeHtml(task.id)}" title="删除"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </div>
      `).join("");
    };

    const renderTaskLog = (detailText) => {
      if (!detailText || detailText.trim() === "") {
        return '<div class="sync-log-empty">暂无同步记录</div>';
      }
      const lines = detailText
        .trim()
        .split("\n")
        .map((line) => String(line || "").trim())
        .filter(Boolean)
        .filter((line) => !line.includes("日志已清空"));
      if (!lines.length) {
        return '<div class="sync-log-empty">暂无同步记录</div>';
      }
      const groupedLines = [];
      let currentGroup = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("成功") || line.includes("失败") || line.includes("错误")) {
          if (currentGroup.length > 0) {
            groupedLines.push(currentGroup);
          }
          currentGroup = [line];
        } else {
          currentGroup.push(line);
        }
      }
      if (currentGroup.length > 0) {
        groupedLines.push(currentGroup);
      }
      const reversedGroups = groupedLines.reverse();
      return reversedGroups.map((group) => {
        return group.map((line) => {
          const escapedLine = escapeHtml(line);
          if (line.includes("成功")) {
            return `<div class="sync-log-line sync-log-success">${escapedLine}</div>`;
          } else if (line.includes("失败") || line.includes("错误")) {
            return `<div class="sync-log-line sync-log-error">${escapedLine}</div>`;
          } else if (line.includes("暂停")) {
            return `<div class="sync-log-line sync-log-paused">${escapedLine}</div>`;
          } else if (line.includes("已启动") || line.includes("已触发")) {
            return `<div class="sync-log-line sync-log-running">${escapedLine}</div>`;
          } else {
            return `<div class="sync-log-line">${escapedLine}</div>`;
          }
        }).join("");
      }).join("");
    };

    const renderTaskDetail = () => {
      const task = getSelectedTask();
      if (!task) {
        syncTaskTitle.textContent = "同步任务详情";
        syncTaskMeta.textContent = "请选择左侧任务或创建新任务";
        syncTaskDetail.innerHTML = `<div class="sync-empty">请先创建同步任务</div>`;
        return;
      }
      syncTaskTitle.textContent = task.name || "同步任务详情";
      syncTaskMeta.textContent = getTaskMetaText(task);
      const running = task.status === "running";
      const logHtml = renderTaskLog(task.detail);
      syncTaskDetail.innerHTML = `
        <div class="sync-detail-grid">
          <div class="sync-detail-item">
            <div class="sync-detail-label">同步名称</div>
            <div class="sync-detail-value">${escapeHtml(task.name || "-")}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">同步状态</div>
            <div class="sync-detail-value ${getStatusClassName(task.status)}">${escapeHtml(getStatusText(task.status))}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">本地目录</div>
            <div class="sync-detail-value">${escapeHtml(task.localDir || "-")}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">远程目录</div>
            <div class="sync-detail-value">${escapeHtml(task.remoteMountName || "-")} · ${escapeHtml(task.remoteDir || "-")}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">任务类型</div>
            <div class="sync-detail-value">${escapeHtml(getTaskTypeText(task.type))}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">同步类型</div>
            <div class="sync-detail-value">${escapeHtml(getDirectionText(task.direction))}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">定时规则</div>
            <div class="sync-detail-value">${escapeHtml(getScheduleText(task))}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">空目录同步</div>
            <div class="sync-detail-value">${task.syncEmptyDir === "1" ? "同步空目录" : "不同步空目录"}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">文件更新规则</div>
            <div class="sync-detail-value">${escapeHtml(getFileUpdateRuleText(task))}</div>
          </div>
          <div class="sync-detail-item">
            <div class="sync-detail-label">删除规则</div>
            <div class="sync-detail-value">${escapeHtml(getDeleteRuleText(task))}</div>
          </div>
        </div>
        <div class="sync-detail-actions">
          <button type="button" class="btn-upload mounts-upload-btn" data-sync-start="${escapeHtml(task.id)}"><i class="fa-solid ${running ? "fa-pause" : "fa-play"}"></i>${running ? " 暂停" : " 开始"}</button>
          <button type="button" class="btn-upload mounts-upload-btn" data-sync-once="${escapeHtml(task.id)}"><i class="fa-solid fa-bolt"></i> 单次同步</button>
          <button type="button" class="btn-sm" data-sync-edit-detail="${escapeHtml(task.id)}">编辑</button>
          <button type="button" class="btn-sm danger" data-sync-delete-detail="${escapeHtml(task.id)}">删除</button>
          <button type="button" class="btn-sm" data-sync-clear-log="${escapeHtml(task.id)}"><i class="fa-solid fa-eraser"></i> 清空日志</button>
        </div>
        <div class="sync-detail-log" id="syncDetailLog">${logHtml}</div>
      `;
      if (running) {
        const logContainer = document.getElementById("syncDetailLog");
        if (logContainer) {
          logContainer.scrollTop = logContainer.scrollHeight;
        }
      }
    };

    const render = () => {
      renderTaskSidebar();
      renderTaskDetail();
    };

    const setSelectedTask = (taskId, routeMode = "push") => {
      const hasTask = runtime.tasks.some((task) => task.id === taskId);
      if (!hasTask) {
        runtime.selectedTaskId = runtime.tasks[0] ? runtime.tasks[0].id : "";
      } else {
        runtime.selectedTaskId = taskId;
      }
      render();
      updateAutoRefreshTimer();
      const selectedTask = getSelectedTask();
      if (selectedTask && selectedTask.status === "running") {
        startLiveLogStream(selectedTask.id);
      } else {
        stopLiveLogStream();
      }
      if (routeMode === "push" || routeMode === "replace") {
        syncTaskRoute(routeMode === "replace");
      }
    };

    const updateTask = (taskId, patch = {}) => {
      const target = getTaskById(taskId);
      if (!target) return;
      Object.assign(target, patch);
      schedulePersistTasks();
      render();
    };

    const stopLiveLogStream = () => {
      if (runtime.liveLogSource) {
        runtime.liveLogSource.close();
        runtime.liveLogSource = null;
      }
      runtime.liveLogTaskId = "";
      runtime.liveLogLineCount = 0;
    };

    const updateTaskLogOnly = (taskId) => {
      const task = getTaskById(taskId);
      if (!task) return;
      const logContainer = document.getElementById("syncDetailLog");
      if (!logContainer) return;
      const logHtml = renderTaskLog(task.detail);
      logContainer.innerHTML = logHtml;
      logContainer.scrollTop = logContainer.scrollHeight;
    };

    const startLiveLogStream = (taskId, reset = false) => {
      const task = getTaskById(taskId);
      if (!task) return;
      if (typeof window.EventSource !== "function") {
        return;
      }
      if (runtime.liveLogTaskId === taskId && runtime.liveLogSource) {
        return;
      }
      if (runtime.liveLogTaskId !== taskId || runtime.liveLogSource) {
        stopLiveLogStream();
      }
      runtime.liveLogTaskId = taskId;
      if (reset) {
        runtime.liveLogLineCount = 0;
        task.detail = "";
        if (runtime.selectedTaskId === taskId) {
          updateTaskLogOnly(taskId);
        }
      }
      const stream = new window.EventSource(`/api/sync-tasks/${encodeURIComponent(taskId)}/log-stream`);
      runtime.liveLogSource = stream;
      stream.onmessage = async (event) => {
        if (runtime.liveLogSource !== stream) return;
        let payload = null;
        try {
          payload = JSON.parse(event.data || "{}");
        } catch (e) {
          return;
        }
        if (!payload || payload.type === "ping") return;
        const currentTask = getTaskById(taskId);
        if (!currentTask) return;
        const nextDetail = payload.detail !== undefined ? String(payload.detail || "") : String(currentTask.detail || "");
        const nextStatus = payload.status ? String(payload.status) : String(currentTask.status || "");
        const nextDetailStatus = payload.detailStatus ? String(payload.detailStatus) : String(currentTask.detailStatus || nextStatus);
        const nextDetailAt = payload.detailAt ? String(payload.detailAt) : String(currentTask.detailAt || "");
        const nextLineCount = Math.max(0, Number(payload.lineCount || 0));
        const detailChanged = nextDetail !== String(currentTask.detail || "");
        const statusChanged = nextStatus !== String(currentTask.status || "");
        currentTask.detail = nextDetail;
        currentTask.status = nextStatus;
        currentTask.detailStatus = nextDetailStatus;
        currentTask.detailAt = nextDetailAt;
        runtime.liveLogLineCount = nextLineCount;
        if (statusChanged) {
          render();
        } else if (detailChanged && runtime.selectedTaskId === taskId) {
          updateTaskLogOnly(taskId);
        }
        if (payload.type === "end" || nextStatus !== "running") {
          stopLiveLogStream();
          await refreshTasksFromServer(true);
        }
      };
      stream.onerror = () => {
        if (runtime.liveLogSource !== stream) return;
      };
    };

    const triggerTaskAction = async (taskId, action) => {
      if (runtime.executing.has(taskId)) return;
      runtime.executing.add(taskId);
      const task = getTaskById(taskId);
      if (!task) {
        runtime.executing.delete(taskId);
        return;
      }
      const prevStatus = task.status;
      if (action === "start") {
        updateTask(taskId, { status: "running" });
        startLiveLogStream(taskId, false);
      } else if (action === "pause") {
        updateTask(taskId, { status: "paused" });
        stopLiveLogStream();
      }
      try {
        const res = await request(`/api/sync-tasks/${encodeURIComponent(taskId)}/${action}`, { method: "POST" });
        if (!res.ok) {
          updateTask(taskId, { status: prevStatus });
          let message = "操作失败";
          try {
            const parsed = await res.json();
            if (parsed && parsed.message) {
              message = String(parsed.message);
            }
          } catch (e) {
          }
          throw new Error(message);
        }
        runtime.executing.delete(taskId);
        await refreshTasksFromServer(true);
        if (action === "start" || action === "run") {
          startLiveLogStream(taskId, action === "run");
        }
      } catch (e) {
        runtime.executing.delete(taskId);
        updateTask(taskId, { status: prevStatus });
        stopLiveLogStream();
        await showSyncNotice(e.message || "操作失败");
      }
    };

    const startTask = async (taskId) => {
      await triggerTaskAction(taskId, "start");
    };

    const pauseTask = async (taskId) => {
      await triggerTaskAction(taskId, "pause");
    };

    const runTaskOnce = async (taskId) => {
      await triggerTaskAction(taskId, "run");
    };

    const deleteTask = async (taskId) => {
      try {
        const res = await request(`/api/sync-tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
        if (!res.ok) {
          let message = "删除失败";
          try {
            const parsed = await res.json();
            if (parsed && parsed.message) {
              message = String(parsed.message);
            }
          } catch (e) {
          }
          throw new Error(message);
        }
        runtime.tasks = runtime.tasks.filter((task) => task.id !== taskId);
        if (runtime.selectedTaskId === taskId) {
          stopLiveLogStream();
          runtime.selectedTaskId = runtime.tasks[0] ? runtime.tasks[0].id : "";
        }
        render();
        updateAutoRefreshTimer();
        syncTaskRoute(true);
      } catch (e) {
        await showSyncNotice(e.message || "删除失败");
        await refreshTasksFromServer(true);
      }
    };

    const updateScheduleGroupVisible = () => {
      const isSchedule = syncTaskTypeSelect.value === "schedule";
      syncScheduleGroup.style.display = isSchedule ? "" : "none";
      if (!isSchedule) return;
      const isTimePoint = syncScheduleUnitSelect.value === "time_point";
      syncScheduleValueInput.style.display = isTimePoint ? "none" : "";
      syncScheduleTimeRow.style.display = isTimePoint ? "" : "none";
    };

    const openTaskModal = async (task) => {
      await loadMounts();
      await loadLocalDirOptions();
      if (!runtime.mounts.length) {
        await showSyncNotice("请先到挂载菜单创建远程挂载");
        return;
      }
      if (task) {
        syncTaskModalTitle.textContent = "编辑同步任务";
        syncTaskIdInput.value = task.id;
        syncTaskNameInput.value = task.name || "";
        renderLocalDirOptions(task.localDir || "/");
        syncRemoteDirInput.value = task.remoteDir || "/";
        syncDirectionSelect.value = task.direction || "local_to_remote";
        syncTaskTypeSelect.value = task.type || "once";
        syncScheduleValueInput.value = String(Math.max(1, Number(task.scheduleValue || 1)));
        syncScheduleUnitSelect.value = task.scheduleUnit || "minute";
        syncScheduleTimeInput.value = normalizeScheduleTime(task.scheduleTime);
        syncEmptyDirSelect.value = task.syncEmptyDir === "1" ? "1" : "0";
        syncFileUpdateRuleSelect.value = task.fileUpdateRule === "new_only" || task.fileUpdateRule === "modified_only" ? task.fileUpdateRule : "all";
        syncDeleteRuleSelect.value = task.deleteRule === "sync_delete" || task.deleteRule === "mirror" ? task.deleteRule : "keep";
        renderMountOptions(task.remoteMountId);
      } else {
        syncTaskModalTitle.textContent = "新建同步任务";
        syncTaskIdInput.value = "";
        syncTaskNameInput.value = "";
        renderLocalDirOptions("/");
        syncRemoteDirInput.value = "/";
        syncDirectionSelect.value = "local_to_remote";
        syncTaskTypeSelect.value = "once";
        syncScheduleValueInput.value = "1";
        syncScheduleUnitSelect.value = "minute";
        syncScheduleTimeInput.value = "";
        syncEmptyDirSelect.value = "0";
        syncFileUpdateRuleSelect.value = "all";
        syncDeleteRuleSelect.value = "keep";
        renderMountOptions(runtime.mounts[0] ? runtime.mounts[0].id : "");
      }
      updateScheduleGroupVisible();
      syncTaskModal.style.display = "flex";
    };

    const closeTaskModal = () => {
      syncTaskModal.style.display = "none";
    };

    const submitTaskForm = async () => {
      const id = String(syncTaskIdInput.value || "").trim();
      const name = String(syncTaskNameInput.value || "").trim();
      const localDir = normalizeDir(syncLocalDirSelect.value);
      const remoteDir = normalizeDir(syncRemoteDirInput.value);
      const direction = syncDirectionSelect.value === "remote_to_local" || syncDirectionSelect.value === "bidirectional"
        ? syncDirectionSelect.value
        : "local_to_remote";
      const remoteMountId = String(syncRemoteMountSelect.value || "").trim();
      const remoteMount = getMountById(remoteMountId);
      const type = syncTaskTypeSelect.value === "schedule" ? "schedule" : "once";
      const scheduleValue = Math.max(1, Number(syncScheduleValueInput.value || 1));
      const scheduleUnit = syncScheduleUnitSelect.value === "day" || syncScheduleUnitSelect.value === "hour" || syncScheduleUnitSelect.value === "week" || syncScheduleUnitSelect.value === "month" || syncScheduleUnitSelect.value === "time_point"
        ? syncScheduleUnitSelect.value
        : "minute";
      const scheduleTime = normalizeScheduleTime(syncScheduleTimeInput.value);
      const syncEmptyDir = syncEmptyDirSelect.value === "1" ? "1" : "0";
      const fileUpdateRule = syncFileUpdateRuleSelect.value === "new_only" || syncFileUpdateRuleSelect.value === "modified_only"
        ? syncFileUpdateRuleSelect.value
        : "all";
      const deleteRule = syncDeleteRuleSelect.value === "sync_delete" || syncDeleteRuleSelect.value === "mirror"
        ? syncDeleteRuleSelect.value
        : "keep";
      if (!name) {
        await showSyncNotice("请填写同步名称");
        return;
      }
      if (!remoteMount) {
        await showSyncNotice("请选择远程挂载");
        return;
      }
      if (type === "schedule" && scheduleUnit === "time_point" && !scheduleTime) {
        await showSyncNotice("请选择指定时间");
        return;
      }
      if (type === "schedule" && scheduleUnit === "time_point") {
        const scheduleAtDate = new Date(scheduleTime);
        if (Number.isNaN(scheduleAtDate.getTime()) || scheduleAtDate.getTime() <= Date.now()) {
          await showSyncNotice("指定时间需晚于当前时间");
          return;
        }
      }
      if (id) {
        const target = getTaskById(id);
        if (!target) return;
        const patch = {
          name,
          localDir,
          remoteMountId,
          remoteMountName: String(remoteMount.name || remoteMount.id),
          remoteDir,
          direction,
          type,
          scheduleValue,
          scheduleUnit,
          scheduleTime,
          syncEmptyDir,
          fileUpdateRule,
          deleteRule,
          nextRunAt: ""
        };
        updateTask(id, patch);
        updateAutoRefreshTimer();
      } else {
        const task = normalizeTask({
          id: createTaskId(),
          name,
          localDir,
          remoteMountId,
          remoteMountName: String(remoteMount.name || remoteMount.id),
          remoteDir,
          direction,
          type,
          scheduleValue,
          scheduleUnit,
          scheduleTime,
          syncEmptyDir,
          fileUpdateRule,
          deleteRule,
          status: "idle",
          detail: "",
          createdAt: new Date().toISOString()
        });
        runtime.tasks.unshift(task);
        runtime.selectedTaskId = task.id;
        schedulePersistTasks();
        render();
        updateAutoRefreshTimer();
      }
      closeTaskModal();
    };

    const updateSidebarToggleIcon = () => {
      const icon = toggleSyncSidebarBtn.querySelector("i");
      if (!icon) return;
      if (syncSidebar.classList.contains("collapsed")) {
        icon.className = "fa-solid fa-angles-right";
        toggleSyncSidebarBtn.title = "展开侧边栏";
      } else {
        icon.className = "fa-solid fa-angles-left";
        toggleSyncSidebarBtn.title = "收起侧边栏";
      }
    };

    const bindEvents = () => {
      addSyncTaskBtn.onclick = () => {
        openTaskModal(null);
      };

      cancelSyncTaskModalBtn.onclick = () => {
        closeTaskModal();
      };

      syncTaskTypeSelect.onchange = () => {
        updateScheduleGroupVisible();
      };

      syncScheduleUnitSelect.onchange = () => {
        updateScheduleGroupVisible();
      };

      syncTaskForm.onsubmit = async (event) => {
        event.preventDefault();
        await submitTaskForm();
      };

      toggleSyncSidebarBtn.onclick = () => {
        syncSidebar.classList.toggle("collapsed");
        updateSidebarToggleIcon();
      };

      syncTaskAsideList.onclick = async (event) => {
        const target = event.target.closest("button,[data-sync-item]");
        if (!target) return;
        const editId = target.getAttribute("data-sync-edit");
        if (editId) {
          event.stopPropagation();
          const task = getTaskById(editId);
          if (!task) return;
          await openTaskModal(task);
          return;
        }
        const deleteId = target.getAttribute("data-sync-delete");
        if (deleteId) {
          event.stopPropagation();
          if (!await showSyncConfirm("确定删除该同步任务吗？")) return;
          await deleteTask(deleteId);
          return;
        }
        const taskId = target.getAttribute("data-sync-item");
        if (taskId) {
          setSelectedTask(taskId, "push");
        }
      };

      syncTaskDetail.onclick = async (event) => {
        const target = event.target.closest("button");
        if (!target) return;
        const startId = target.getAttribute("data-sync-start");
        if (startId) {
          const task = getTaskById(startId);
          if (!task) return;
          if (task.status === "running") {
            await pauseTask(startId);
          } else {
            await startTask(startId);
          }
          return;
        }
        const onceId = target.getAttribute("data-sync-once");
        if (onceId) {
          await runTaskOnce(onceId);
          return;
        }
        const editId = target.getAttribute("data-sync-edit-detail");
        if (editId) {
          const task = getTaskById(editId);
          if (!task) return;
          await openTaskModal(task);
          return;
        }
        const deleteId = target.getAttribute("data-sync-delete-detail");
        if (deleteId) {
          if (!await showSyncConfirm("确定删除该同步任务吗？")) return;
          await deleteTask(deleteId);
          return;
        }
        const clearLogId = target.getAttribute("data-sync-clear-log");
        if (clearLogId) {
          if (!await showSyncConfirm("确定清空该任务的日志记录吗？")) return;
          try {
            const res = await request(`/api/sync-tasks/${encodeURIComponent(clearLogId)}/clear-log`, { method: "POST" });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.message || "操作失败");
            }
            stopLiveLogStream();
            await refreshTasksFromServer(true);
            await showSyncNotice("日志已清空", false);
          } catch (e) {
            await showSyncNotice(e.message || "清空日志失败");
          }
          return;
        }
      };
    };

    bindEvents();
    updateSidebarToggleIcon();
    render();
    startAutoRefresh();

    return {
      onEnterView: async (options = {}) => {
        const params = new URLSearchParams(window.location.search);
        const syncTaskIdFromUrl = Object.prototype.hasOwnProperty.call(options, "taskId")
          ? String(options.taskId || "").trim()
          : String(params.get("syncTaskId") || "").trim();
        if (!runtime.hasLoadedOnce) {
          await loadTasks();
          runtime.hasLoadedOnce = true;
        }
        await loadMounts();
        if (runtime.tasks.length) {
          if (syncTaskIdFromUrl && getTaskById(syncTaskIdFromUrl)) {
            runtime.selectedTaskId = syncTaskIdFromUrl;
          } else {
            runtime.selectedTaskId = "";
          }
        } else {
          runtime.selectedTaskId = "";
        }
        render();
        updateAutoRefreshTimer();
        const selectedTask = getSelectedTask();
        if (selectedTask && selectedTask.status === "running") {
          startLiveLogStream(selectedTask.id);
        } else {
          stopLiveLogStream();
        }
        syncTaskRoute(true);
      }
    };
  };
})();
