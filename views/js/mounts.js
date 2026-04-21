(function () {
  const nativeAlert = typeof window !== "undefined" && typeof window.alert === "function" ? window.alert.bind(window) : () => {};
  const getMountTypeLabel = (type) => {
    const mapping = {
      aliyun: "阿里云 OSS",
      qiniu: "七牛云 Kodo",
      tencent: "腾讯云 COS"
    };
    return mapping[type] || type || "-";
  };

  const showMountNotice = async (message, isError = true) => {
    if (typeof window.showAppNotice === "function") {
      await window.showAppNotice({ title: isError ? "提示" : "操作成功", message: String(message || ""), isError });
      return;
    }
    nativeAlert(String(message || ""));
  };

  const showMountConfirmDialog = ({ title, message, okText = "确认", cancelText = "取消" } = {}) => {
    if (typeof window.showAppConfirm === "function") {
      return window.showAppConfirm({
        title: title || "确认操作",
        message: message || "确定继续吗？",
        desc: "请确认后继续执行",
        okText,
        cancelText
      });
    }
    return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";

    const panel = document.createElement("div");
    panel.style.width = "min(420px, calc(100% - 32px))";
    panel.style.background = "#fff";
    panel.style.borderRadius = "10px";
    panel.style.padding = "18px 18px 14px";
    panel.style.boxSizing = "border-box";
    panel.style.boxShadow = "0 18px 36px rgba(0,0,0,0.18)";

    const titleEl = document.createElement("div");
    titleEl.style.fontSize = "16px";
    titleEl.style.fontWeight = "600";
    titleEl.style.marginBottom = "10px";
    titleEl.textContent = title || "确认操作";

    const messageEl = document.createElement("div");
    messageEl.style.fontSize = "14px";
    messageEl.style.lineHeight = "1.6";
    messageEl.style.color = "#4e5969";
    messageEl.style.wordBreak = "break-all";
    messageEl.textContent = message || "确定继续吗？";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "10px";
    actions.style.marginTop = "18px";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-sm";
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "btn-sm danger";
    okBtn.textContent = okText;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    panel.appendChild(titleEl);
    panel.appendChild(messageEl);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = (confirmed) => {
      document.removeEventListener("keydown", onEsc);
      overlay.removeEventListener("click", onMaskClick);
      cancelBtn.removeEventListener("click", onCancel);
      okBtn.removeEventListener("click", onOk);
      overlay.remove();
      resolve(!!confirmed);
    };
    const onEsc = (event) => {
      if (event.key === "Escape") close(false);
    };
    const onMaskClick = (event) => {
      if (event.target === overlay) close(false);
    };
    const onCancel = () => close(false);
    const onOk = () => close(true);
    document.addEventListener("keydown", onEsc);
    overlay.addEventListener("click", onMaskClick);
    cancelBtn.addEventListener("click", onCancel);
    okBtn.addEventListener("click", onOk);
    okBtn.focus();
  });
  };

  const showMountInputDialog = ({
    title,
    message,
    defaultValue = "",
    okText = "确认",
    cancelText = "取消",
    placeholder = ""
  } = {}) => new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";

    const panel = document.createElement("div");
    panel.style.width = "min(460px, calc(100% - 32px))";
    panel.style.background = "var(--bg-card)";
    panel.style.borderRadius = "10px";
    panel.style.padding = "18px";
    panel.style.boxSizing = "border-box";
    panel.style.boxShadow = "0 18px 36px rgba(0,0,0,0.18)";

    const titleEl = document.createElement("div");
    titleEl.style.fontSize = "16px";
    titleEl.style.fontWeight = "600";
    titleEl.style.marginBottom = "10px";
    titleEl.style.color = "var(--text-primary)";
    titleEl.textContent = title || "请输入";

    const messageEl = document.createElement("div");
    messageEl.style.fontSize = "14px";
    messageEl.style.lineHeight = "1.6";
    messageEl.style.color = "var(--text-secondary)";
    messageEl.style.marginBottom = "10px";
    messageEl.textContent = message || "";

    const input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue || "";
    input.placeholder = placeholder;
    input.style.width = "100%";
    input.style.height = "38px";
    input.style.padding = "0 10px";
    input.style.boxSizing = "border-box";
    input.style.border = "1px solid var(--border-secondary)";
    input.style.borderRadius = "8px";
    input.style.fontSize = "14px";
    input.style.background = "var(--bg-primary)";
    input.style.color = "var(--text-primary)";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "10px";
    actions.style.marginTop = "16px";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-sm";
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "btn-sm";
    okBtn.style.background = "#165dff";
    okBtn.style.color = "#fff";
    okBtn.style.border = "none";
    okBtn.textContent = okText;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    panel.appendChild(titleEl);
    panel.appendChild(messageEl);
    panel.appendChild(input);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = (value) => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.removeEventListener("click", onMaskClick);
      cancelBtn.removeEventListener("click", onCancel);
      okBtn.removeEventListener("click", onOk);
      overlay.remove();
      resolve(value);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close(null);
      if (event.key === "Enter") onOk();
    };
    const onMaskClick = (event) => {
      if (event.target === overlay) close(null);
    };
    const onCancel = () => close(null);
    const onOk = () => {
      const value = String(input.value || "").trim();
      if (!value) {
        input.focus();
        return;
      }
      close(value);
    };
    document.addEventListener("keydown", onKeyDown);
    overlay.addEventListener("click", onMaskClick);
    cancelBtn.addEventListener("click", onCancel);
    okBtn.addEventListener("click", onOk);
    input.focus();
    input.select();
  });

  const showMountErrorDialog = ({ message = "", title = "错误提示" } = {}) => new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";

    const panel = document.createElement("div");
    panel.style.width = "min(520px, calc(100% - 32px))";
    panel.style.background = "#fff";
    panel.style.borderRadius = "10px";
    panel.style.padding = "18px";
    panel.style.boxSizing = "border-box";
    panel.style.boxShadow = "0 18px 36px rgba(0,0,0,0.18)";

    const titleEl = document.createElement("div");
    titleEl.style.fontSize = "16px";
    titleEl.style.fontWeight = "600";
    titleEl.style.marginBottom = "10px";
    titleEl.textContent = title;

    const contentBox = document.createElement("textarea");
    contentBox.readOnly = true;
    contentBox.value = String(message || "");
    contentBox.style.width = "100%";
    contentBox.style.minHeight = "120px";
    contentBox.style.resize = "vertical";
    contentBox.style.padding = "10px";
    contentBox.style.boxSizing = "border-box";
    contentBox.style.border = "1px solid #dcdfe6";
    contentBox.style.borderRadius = "8px";
    contentBox.style.fontSize = "13px";
    contentBox.style.lineHeight = "1.6";
    contentBox.style.color = "#4e5969";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "10px";
    actions.style.marginTop = "14px";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-sm";
    copyBtn.textContent = "复制内容";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-sm";
    closeBtn.style.background = "#165dff";
    closeBtn.style.color = "#fff";
    closeBtn.style.border = "none";
    closeBtn.textContent = "关闭";

    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    panel.appendChild(titleEl);
    panel.appendChild(contentBox);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.removeEventListener("click", onMaskClick);
      closeBtn.removeEventListener("click", onClose);
      copyBtn.removeEventListener("click", onCopy);
      overlay.remove();
      resolve();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" || event.key === "Enter") close();
    };
    const onMaskClick = (event) => {
      if (event.target === overlay) close();
    };
    const onClose = () => close();
    const onCopy = async () => {
      const text = String(contentBox.value || "");
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          contentBox.focus();
          contentBox.select();
          document.execCommand("copy");
        }
        copyBtn.textContent = "已复制";
        setTimeout(() => {
          copyBtn.textContent = "复制内容";
        }, 1200);
      } catch (e) {
        contentBox.focus();
        contentBox.select();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    overlay.addEventListener("click", onMaskClick);
    closeBtn.addEventListener("click", onClose);
    copyBtn.addEventListener("click", onCopy);
    contentBox.focus();
    contentBox.select();
  });

  window.createMountManager = ({ request, formatDate, escapeHtml }) => {
    let mountsData = [];
    let selectedMountId = null;
    let editingMountId = null;
    let mountObjects = [];
    let loadingMountObjects = false;
    let creatingMountFolder = false;
    let mountCurrentPrefix = "";
    let mountPageSize = 50;
    let mountCurrentPage = 1;
    let mountSearchKeyword = "";
    let mountTotalCount = 0;
    let mountSortKey = "name";
    let mountSortOrder = "asc";
    const syncMountRoute = (replace = false) => {
      const params = new URLSearchParams(window.location.search);
      params.set("main", "mounts");
      if (Number(selectedMountId) > 0) params.set("mountId", String(Number(selectedMountId)));
      else params.delete("mountId");
      params.delete("syncTaskId");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    };

    const getSelectedMount = () => mountsData.find((item) => Number(item.id) === Number(selectedMountId)) || null;
    const isObjectMountType = (type) => type === "tencent" || type === "qiniu" || type === "aliyun";

    const normalizeMountPrefix = (value) => {
      const cleaned = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (!cleaned) return "";
      return cleaned.split("/").filter((item) => item && item !== "." && item !== "..").join("/") + "/";
    };

    const getMountBreadcrumbItems = () => {
      const normalized = normalizeMountPrefix(mountCurrentPrefix);
      if (!normalized) return [{ label: "根目录", prefix: "" }];
      const parts = normalized.replace(/\/$/, "").split("/");
      const items = [{ label: "根目录", prefix: "" }];
      let current = "";
      parts.forEach((part) => {
        current += `${part}/`;
        items.push({ label: part, prefix: current });
      });
      return items;
    };

    const renderMountBreadcrumb = () => {
      const breadcrumbEl = document.getElementById("mountBreadcrumb");
      if (!breadcrumbEl) return;
      const mount = getSelectedMount();
      if (!mount) {
        breadcrumbEl.innerHTML = "";
        return;
      }
      const items = getMountBreadcrumbItems();
      breadcrumbEl.innerHTML = items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        const crumb = isCurrent
          ? `<span class="mount-crumb current">${escapeHtml(item.label)}</span>`
          : `<button type="button" class="mount-crumb" onclick="openMountFolder('${encodeURIComponent(item.prefix)}')">${escapeHtml(item.label)}</button>`;
        const sep = isCurrent ? "" : `<span class="mount-crumb-sep">/</span>`;
        return `${crumb}${sep}`;
      }).join("");
    };

    const getMountProcessedRows = () => mountObjects.slice();

    const renderMountSortHeaders = () => {
      const sortNameEl = document.getElementById("mountSortName");
      const sortPathEl = document.getElementById("mountSortPath");
      const sortUpdatedAtEl = document.getElementById("mountSortUpdatedAt");
      const getLabel = (label, key) => {
        if (mountSortKey !== key) return `${label} ↕`;
        return `${label} ${mountSortOrder === "asc" ? "↑" : "↓"}`;
      };
      if (sortNameEl) sortNameEl.textContent = getLabel("文件名", "name");
      if (sortPathEl) sortPathEl.textContent = getLabel("存储路径", "path");
      if (sortUpdatedAtEl) sortUpdatedAtEl.textContent = getLabel("更新时间", "updatedAt");
    };

    const renderMountStorage = () => {
      const titleEl = document.getElementById("mountStorageTitle");
      const closeConnectionBtn = document.getElementById("closeMountConnectionBtn");
      const metaEl = document.getElementById("mountStorageMeta");
      const searchBtn = document.getElementById("searchMountObjectBtn");
      const resetSearchBtn = document.getElementById("resetMountSearchBtn");
      const refreshBtn = document.getElementById("refreshMountObjectBtn");
      const createFolderBtn = document.getElementById("createMountFolderBtn");
      const mountTable = document.getElementById("mountStorageTable");
      const emptyPanel = document.getElementById("mountEmptyPanel");
      const emptyText = document.getElementById("mountEmptyText");
      const tbody = document.getElementById("mountStorageTableBody");
      const paginationSummaryEl = document.getElementById("mountPaginationSummary");
      const pageInfoEl = document.getElementById("mountPageInfo");
      const prevPageBtn = document.getElementById("mountPrevPageBtn");
      const nextPageBtn = document.getElementById("mountNextPageBtn");
      const pageSizeSelect = document.getElementById("mountPageSizeSelect");
      if (!titleEl || !metaEl || !tbody) return;
      renderMountSortHeaders();
      if (pageSizeSelect && pageSizeSelect.value !== String(mountPageSize)) {
        pageSizeSelect.value = String(mountPageSize);
      }
      const renderPagination = (totalCount) => {
        const totalPages = Math.max(1, Math.ceil(totalCount / mountPageSize));
        if (mountCurrentPage > totalPages) mountCurrentPage = totalPages;
        if (mountCurrentPage < 1) mountCurrentPage = 1;
        if (paginationSummaryEl) paginationSummaryEl.textContent = `共 ${totalCount} 条`;
        if (pageInfoEl) pageInfoEl.textContent = `${mountCurrentPage} / ${totalPages}`;
        if (prevPageBtn) prevPageBtn.disabled = mountCurrentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = mountCurrentPage >= totalPages;
        return { totalPages };
      };
      const showMountEmpty = (message) => {
        if (mountTable) mountTable.style.display = "none";
        if (emptyPanel) emptyPanel.style.display = "flex";
        if (emptyText) emptyText.textContent = message;
        tbody.innerHTML = "";
      };
      const showMountTable = () => {
        if (mountTable) mountTable.style.display = "";
        if (emptyPanel) emptyPanel.style.display = "none";
      };
      const mount = getSelectedMount();
      if (!mount) {
        titleEl.textContent = "文件存储列表";
        metaEl.textContent = mountsData.length ? "未连接，请点击左侧挂载" : "请选择左侧挂载";
        mountCurrentPage = 1;
        mountTotalCount = 0;
        if (searchBtn) {
          searchBtn.disabled = true;
          searchBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> 搜索`;
        }
        if (resetSearchBtn) {
          resetSearchBtn.disabled = true;
          resetSearchBtn.style.display = "none";
        }
        if (closeConnectionBtn) {
          closeConnectionBtn.disabled = true;
        }
        if (refreshBtn) {
          refreshBtn.disabled = true;
          refreshBtn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> 刷新`;
        }
        if (createFolderBtn) {
          createFolderBtn.disabled = true;
          createFolderBtn.innerHTML = `<i class="fa-solid fa-folder-plus"></i> 目录`;
        }
        renderPagination(0);
        showMountEmpty(mountsData.length ? "当前未连接挂载，请点击左侧挂载列表" : "暂无挂载，请先添加");
        return;
      }
      const config = mount.config || {};
      titleEl.textContent = `${mount.name} 文件存储列表`;
      const baseMeta = `${getMountTypeLabel(mount.type)} · ${config.bucket || "-"} @ ${config.endpoint || "-"}`;
      metaEl.textContent = mountSearchKeyword ? `${baseMeta} · 全局搜索: ${mountSearchKeyword}` : baseMeta;
      if (searchBtn) {
        searchBtn.disabled = loadingMountObjects || !isObjectMountType(mount.type);
        searchBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> 搜索`;
      }
      if (resetSearchBtn) {
        resetSearchBtn.disabled = loadingMountObjects || !mountSearchKeyword;
        resetSearchBtn.style.display = mountSearchKeyword ? "" : "none";
      }
      if (closeConnectionBtn) {
        closeConnectionBtn.disabled = false;
      }
      if (refreshBtn) {
        refreshBtn.disabled = loadingMountObjects || !isObjectMountType(mount.type);
        refreshBtn.innerHTML = loadingMountObjects ? `<i class="fa-solid fa-spinner fa-spin"></i> 刷新中` : `<i class="fa-solid fa-rotate-right"></i> 刷新`;
      }
      if (createFolderBtn) {
        createFolderBtn.disabled = creatingMountFolder || loadingMountObjects || !isObjectMountType(mount.type);
        createFolderBtn.innerHTML = creatingMountFolder
          ? `<i class="fa-solid fa-spinner fa-spin"></i> 新建中`
          : `<i class="fa-solid fa-folder-plus"></i> 新建目录`;
      }
      renderMountBreadcrumb();
      if (loadingMountObjects) {
        renderPagination(mountTotalCount);
        showMountEmpty(mountSearchKeyword ? "正在执行全局搜索..." : "正在加载对象列表...");
        return;
      }
      const processedRows = getMountProcessedRows();
      if (!processedRows.length || mountTotalCount <= 0) {
        renderPagination(mountTotalCount);
        showMountEmpty(mountSearchKeyword ? "未找到匹配对象文件" : "当前挂载暂无对象文件");
        return;
      }
      showMountTable();
      renderPagination(mountTotalCount);
      const pageRows = processedRows;
      tbody.innerHTML = pageRows.map((row) => {
        if (row.type === "folder") {
          return `
        <tr>
          <td><button type="button" class="mount-folder-btn" onclick="openMountFolder('${encodeURIComponent(row.prefix || "")}')"><i class="fa-regular fa-folder"></i> ${escapeHtml(row.name)}</button></td>
          <td>${escapeHtml(row.prefix || "")}</td>
          <td>${escapeHtml(config.bucket || "-")}</td>
          <td>${escapeHtml(config.endpoint || "-")}</td>
          <td>-</td>
          <td>
            <button class="btn-sm" onclick="renameMountFolder('${encodeURIComponent(row.prefix || "")}')">重命名</button>
            <button class="btn-sm danger" onclick="deleteMountFolder('${encodeURIComponent(row.prefix || "")}')">删除</button>
          </td>
        </tr>
      `;
        }
        return `
        <tr>
          <td title="${escapeHtml(row.key)}">${escapeHtml(row.name || row.key)}</td>
          <td title="${escapeHtml(row.key)}">${escapeHtml(row.key)}</td>
          <td>${escapeHtml(config.bucket || "-")}</td>
          <td>${escapeHtml(config.endpoint || "-")}</td>
          <td>${formatDate(row.lastModified)}</td>
          <td>
            <button class="btn-sm" onclick="downloadMountObject('${encodeURIComponent(row.key)}')">下载</button>
            <button class="btn-sm" onclick="renameMountObject('${encodeURIComponent(row.key)}')">重命名</button>
            <button class="btn-sm danger" onclick="deleteMountObject('${encodeURIComponent(row.key)}')">删除</button>
          </td>
        </tr>
      `;
      }).join("");
    };

    const loadMountObjects = async (nextPrefix = mountCurrentPrefix) => {
      const mount = getSelectedMount();
      if (!mount) {
        mountCurrentPrefix = "";
        mountObjects = [];
        mountTotalCount = 0;
        renderMountStorage();
        return;
      }
      if (!isObjectMountType(mount.type)) {
        mountCurrentPrefix = "";
        mountObjects = [];
        mountTotalCount = 0;
        renderMountStorage();
        return;
      }
      mountCurrentPrefix = normalizeMountPrefix(nextPrefix);
      loadingMountObjects = true;
      renderMountStorage();
      try {
        const query = new URLSearchParams({
          prefix: mountCurrentPrefix,
          page: String(mountCurrentPage),
          pageSize: String(mountPageSize),
          sortKey: mountSortKey,
          sortOrder: mountSortOrder
        });
        const res = await request(`/api/mounts/${mount.id}/objects?${query.toString()}`);
        if (!res.ok) {
          let message = "获取对象列表失败";
          try {
            const data = await res.json();
            if (data && data.message) {
              message = data.message;
            }
          } catch (e) {}
          mountObjects = [];
          mountTotalCount = 0;
          loadingMountObjects = false;
          renderMountStorage();
          await showMountErrorDialog({ message, title: "错误提示" });
          return;
        }
        const payload = await res.json();
        if (Array.isArray(payload)) {
          mountObjects = payload;
          mountTotalCount = payload.length;
        } else {
          const folders = Array.isArray(payload.folders) ? payload.folders.map((item) => ({
            type: "folder",
            name: String(item.name || ""),
            prefix: String(item.prefix || ""),
            key: ""
          })) : [];
          const files = Array.isArray(payload.files) ? payload.files.map((item) => ({
            type: "file",
            key: String(item.key || ""),
            name: String(item.name || ""),
            lastModified: item.lastModified || null
          })) : [];
          mountCurrentPrefix = normalizeMountPrefix(payload.prefix || mountCurrentPrefix);
          mountObjects = [...folders, ...files];
          mountTotalCount = Number(payload.total || 0);
        }
      } catch (e) {
        mountObjects = [];
        mountTotalCount = 0;
      }
      loadingMountObjects = false;
      renderMountStorage();
    };

    const renameSingleMountObject = async (fromKey, toKey) => {
      const mount = getSelectedMount();
      if (!mount) throw new Error("请先选择挂载");
      const res = await request(`/api/mounts/${mount.id}/objects/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromKey, toKey })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "重命名失败");
      }
    };

    const deleteSingleMountObject = async (key) => {
      const mount = getSelectedMount();
      if (!mount) throw new Error("请先选择挂载");
      const res = await request(`/api/mounts/${mount.id}/objects?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "删除失败");
      }
    };

    const createMountFolder = async (name) => {
      const mount = getSelectedMount();
      if (!mount) throw new Error("请先选择挂载");
      const res = await request(`/api/mounts/${mount.id}/objects/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: mountCurrentPrefix, name })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "新建目录失败");
      }
    };

    const listMountObjectsByPrefix = async (prefix) => {
      const mount = getSelectedMount();
      if (!mount) throw new Error("请先选择挂载");
      const res = await request(`/api/mounts/${mount.id}/objects?prefix=${encodeURIComponent(normalizeMountPrefix(prefix))}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "获取对象列表失败");
      }
      const payload = await res.json();
      return {
        folders: Array.isArray(payload.folders) ? payload.folders : [],
        files: Array.isArray(payload.files) ? payload.files : []
      };
    };

    const collectMountFileKeysRecursively = async (prefix) => {
      const queue = [normalizeMountPrefix(prefix)];
      const visited = new Set();
      const keys = [];
      while (queue.length) {
        const currentPrefix = normalizeMountPrefix(queue.shift());
        if (visited.has(currentPrefix)) continue;
        visited.add(currentPrefix);
        const { folders, files } = await listMountObjectsByPrefix(currentPrefix);
        folders.forEach((folder) => {
          const nextPrefix = normalizeMountPrefix(folder.prefix || "");
          if (nextPrefix && !visited.has(nextPrefix)) {
            queue.push(nextPrefix);
          }
        });
        files.forEach((file) => {
          const key = String(file.key || file.path || "").trim();
          if (key) keys.push(key);
        });
      }
      return keys;
    };

    const normalizeMountListPayload = (payload) => {
      if (Array.isArray(payload)) return payload;
      if (payload && Array.isArray(payload.list)) return payload.list;
      if (payload && Array.isArray(payload.items)) return payload.items;
      if (payload && Array.isArray(payload.data)) return payload.data;
      return [];
    };

    const renderMounts = () => {
      const mountListEl = document.getElementById("mountsAsideList");
      if (!mountListEl) return;
      mountListEl.innerHTML = mountsData.length ? mountsData.map((m) => `
        <div class="mount-side-item ${Number(m.id) === Number(selectedMountId) ? "active" : ""}" data-mount-id="${m.id}">
          <div class="mount-side-main">
            <div class="mount-side-name">${escapeHtml(String(m.name || ("挂载-" + m.id)))}</div>
            <div class="mount-side-type">${getMountTypeLabel(m.type)}</div>
          </div>
          <div class="mount-side-actions">
            <button type="button" class="mount-side-action-btn" data-action="edit" data-mount-id="${m.id}" title="编辑"><i class="fa-regular fa-pen-to-square"></i></button>
            <button type="button" class="mount-side-action-btn danger" data-action="delete" data-mount-id="${m.id}" title="删除"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </div>
      `).join("") : `<div class="mount-empty">暂无挂载存储</div>`;
      mountListEl.querySelectorAll(".mount-side-item").forEach((item) => {
        item.onclick = async () => {
          selectedMountId = Number(item.dataset.mountId);
          mountCurrentPrefix = "";
          mountObjects = [];
          mountCurrentPage = 1;
          mountTotalCount = 0;
          mountSearchKeyword = "";
          renderMounts();
          syncMountRoute();
          await loadMountObjects();
        };
      });
      mountListEl.querySelectorAll(".mount-side-action-btn").forEach((btn) => {
        btn.onclick = (event) => {
          event.stopPropagation();
          const id = Number(btn.dataset.mountId);
          if (btn.dataset.action === "edit") {
            openMountModal(id);
          } else {
            window.deleteMount(id);
          }
        };
      });
      renderMountStorage();
    };

    const loadMounts = async () => {
      try {
        const res = await request("/api/mounts");
        if (!res.ok) {
          mountsData = [];
          renderMounts();
          return;
        }
        const payload = await res.json();
        mountsData = normalizeMountListPayload(payload);
        if (!mountsData.some((item) => Number(item.id) === Number(selectedMountId))) {
          selectedMountId = null;
          mountCurrentPrefix = "";
          mountObjects = [];
          mountCurrentPage = 1;
          mountTotalCount = 0;
          mountSearchKeyword = "";
        }
        renderMounts();
      } catch (e) {
        mountsData = [];
        renderMounts();
      }
    };

    const parseMountStorageList = (raw) => {
      const text = String(raw || "").trim();
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) return null;
        return parsed.map((item) => ({
          name: String(item.name || ""),
          path: String(item.path || "/"),
          bucket: item.bucket ? String(item.bucket) : undefined,
          endpoint: item.endpoint ? String(item.endpoint) : undefined,
          updatedAt: item.updatedAt || undefined
        }));
      } catch (e) {
        return null;
      }
    };

    const openMountModal = (mountId = null) => {
      const modal = document.getElementById("mountModal");
      const form = document.getElementById("mountForm");
      const title = document.getElementById("mountModalTitle");
      if (!modal || !form || !title) return;
      form.reset();
      editingMountId = mountId ? Number(mountId) : null;
      document.getElementById("mountEditId").value = editingMountId || "";
      if (editingMountId) {
        const mount = mountsData.find((item) => Number(item.id) === editingMountId);
        if (!mount) return;
        const config = mount.config || {};
        title.textContent = "编辑挂载";
        document.getElementById("mountName").value = mount.name || "";
        document.getElementById("mountType").value = mount.type || "aliyun";
        document.getElementById("mountAk").value = config.ak || "";
        document.getElementById("mountSk").value = config.sk || "";
        document.getElementById("mountBucket").value = config.bucket || "";
        document.getElementById("mountEndpoint").value = config.endpoint || "";
        document.getElementById("mountStorageList").value = Array.isArray(config.storageList) ? JSON.stringify(config.storageList, null, 2) : "";
      } else {
        title.textContent = "添加挂载";
        document.getElementById("mountStorageList").value = "";
      }
      modal.style.display = "flex";
    };

    const closeMountModal = () => {
      editingMountId = null;
      document.getElementById("mountModal").style.display = "none";
    };

    const bindEvents = () => {
      const addMountBtn = document.getElementById("addMountBtn");
      const toggleMountSidebarBtn = document.getElementById("toggleMountSidebarBtn");
      const mountSidebarEl = document.querySelector(".mounts-sidebar");
      const cancelMountModalBtn = document.getElementById("cancelMountModalBtn");
      const mountForm = document.getElementById("mountForm");
      const closeMountConnectionBtn = document.getElementById("closeMountConnectionBtn");
      const createMountFolderBtn = document.getElementById("createMountFolderBtn");
      const uploadMountObjectBtn = document.getElementById("uploadMountObjectBtn");
      const refreshMountObjectBtn = document.getElementById("refreshMountObjectBtn");
      const searchMountObjectBtn = document.getElementById("searchMountObjectBtn");
      const resetMountSearchBtn = document.getElementById("resetMountSearchBtn");
      const mountPrevPageBtn = document.getElementById("mountPrevPageBtn");
      const mountNextPageBtn = document.getElementById("mountNextPageBtn");
      const mountPageSizeSelect = document.getElementById("mountPageSizeSelect");
      const mountSortName = document.getElementById("mountSortName");
      const mountSortPath = document.getElementById("mountSortPath");
      const mountSortUpdatedAt = document.getElementById("mountSortUpdatedAt");
      const mountObjectUploadInput = document.getElementById("mountObjectUploadInput");
      if (!addMountBtn || !toggleMountSidebarBtn || !mountSidebarEl || !cancelMountModalBtn || !mountForm || !closeMountConnectionBtn || !createMountFolderBtn || !uploadMountObjectBtn || !refreshMountObjectBtn || !mountPrevPageBtn || !mountNextPageBtn || !mountObjectUploadInput) return;

      addMountBtn.onclick = () => {
        openMountModal(null);
      };

      const updateMountSidebarToggleIcon = () => {
        const icon = toggleMountSidebarBtn.querySelector("i");
        if (!icon) return;
        if (mountSidebarEl.classList.contains("collapsed")) {
          icon.className = "fa-solid fa-angles-right";
          toggleMountSidebarBtn.title = "展开侧边栏";
        } else {
          icon.className = "fa-solid fa-angles-left";
          toggleMountSidebarBtn.title = "收起侧边栏";
        }
      };

      toggleMountSidebarBtn.onclick = () => {
        mountSidebarEl.classList.toggle("collapsed");
        updateMountSidebarToggleIcon();
      };
      updateMountSidebarToggleIcon();

      cancelMountModalBtn.onclick = () => {
        closeMountModal();
      };

      closeMountConnectionBtn.onclick = () => {
        selectedMountId = null;
        mountCurrentPrefix = "";
        mountObjects = [];
        mountCurrentPage = 1;
        mountTotalCount = 0;
        mountSearchKeyword = "";
        loadingMountObjects = false;
        renderMounts();
        syncMountRoute();
      };

      const runMountGlobalSearch = async (keyword, resetPage = true) => {
        const mount = getSelectedMount();
        if (!mount) {
          await showMountNotice("请先选择挂载");
          return;
        }
        if (!isObjectMountType(mount.type)) {
          await showMountNotice("当前挂载类型不支持对象操作");
          return;
        }
        const normalizedKeyword = String(keyword || "").trim();
        if (!normalizedKeyword) {
          mountSearchKeyword = "";
          if (resetPage) mountCurrentPage = 1;
          await loadMountObjects();
          return;
        }
        if (resetPage) mountCurrentPage = 1;
        mountSearchKeyword = normalizedKeyword;
        mountObjects = [];
        mountTotalCount = 0;
        loadingMountObjects = true;
        renderMountStorage();
        try {
          const query = new URLSearchParams({
            prefix: "",
            keyword: normalizedKeyword,
            page: String(mountCurrentPage),
            pageSize: String(mountPageSize),
            sortKey: mountSortKey,
            sortOrder: mountSortOrder
          });
          const res = await request(`/api/mounts/${mount.id}/objects?${query.toString()}`);
          if (!res.ok) {
            let message = "全局搜索失败";
            try {
              const data = await res.json();
              if (data && data.message) message = data.message;
            } catch (e) {}
            throw new Error(message);
          }
          const payload = await res.json();
          const folders = Array.isArray(payload.folders) ? payload.folders.map((item) => ({
            type: "folder",
            name: String(item.name || ""),
            prefix: String(item.prefix || item.path || ""),
            key: ""
          })) : [];
          const files = Array.isArray(payload.files) ? payload.files.map((item) => ({
            type: "file",
            key: String(item.key || item.path || ""),
            name: String(item.name || ""),
            lastModified: item.lastModified || null
          })) : [];
          mountObjects = [...folders, ...files];
          mountTotalCount = Number(payload.total || 0);
        } catch (e) {
          mountSearchKeyword = "";
          mountObjects = [];
          mountTotalCount = 0;
          await showMountNotice(e.message || "全局搜索失败");
        } finally {
          loadingMountObjects = false;
          renderMountStorage();
        }
      };

      mountForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("mountName").value;
        const type = document.getElementById("mountType").value;
        const ak = document.getElementById("mountAk").value;
        const sk = document.getElementById("mountSk").value;
        const bucket = document.getElementById("mountBucket").value;
        const endpoint = document.getElementById("mountEndpoint").value;
        const storageListRaw = document.getElementById("mountStorageList").value;
        const parsedStorageList = parseMountStorageList(storageListRaw);
        if (parsedStorageList === null) {
          await showMountNotice("文件存储列表格式不正确，请输入合法 JSON 数组");
          return;
        }
        const config = { ak, sk, bucket, endpoint, storageList: parsedStorageList };
        try {
          const isEdit = Boolean(editingMountId);
          const targetId = editingMountId;
          const res = await request(isEdit ? `/api/mounts/${targetId}` : "/api/mounts", {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, type, config })
          });
          if (res.ok) {
            closeMountModal();
            if (targetId) {
              selectedMountId = targetId;
            }
            await loadMounts();
            await loadMountObjects();
            syncMountRoute();
          } else {
            await showMountNotice(isEdit ? "更新失败" : "添加失败");
          }
        } catch (e) {
          await showMountNotice(editingMountId ? "更新失败" : "添加失败");
        }
      };

      uploadMountObjectBtn.onclick = async () => {
        const mount = getSelectedMount();
        if (!mount) {
          await showMountNotice("请先选择挂载");
          return;
        }
        if (!isObjectMountType(mount.type)) {
          await showMountNotice("当前挂载类型不支持对象操作");
          return;
        }
        mountObjectUploadInput.click();
      };

      refreshMountObjectBtn.onclick = async () => {
        const mount = getSelectedMount();
        if (!mount) {
          await showMountNotice("请先选择挂载");
          return;
        }
        if (!isObjectMountType(mount.type)) {
          await showMountNotice("当前挂载类型不支持对象操作");
          return;
        }
        if (mountSearchKeyword) {
          await runMountGlobalSearch(mountSearchKeyword, false);
          return;
        }
        await loadMountObjects();
      };

      if (searchMountObjectBtn) {
        searchMountObjectBtn.onclick = async () => {
          const mount = getSelectedMount();
          if (!mount) {
            await showMountNotice("请先选择挂载");
            return;
          }
          if (!isObjectMountType(mount.type)) {
            await showMountNotice("当前挂载类型不支持对象操作");
            return;
          }
          const nextKeyword = await showMountInputDialog({
            title: "全局搜索对象",
            message: "将搜索当前挂载全部目录，留空可清空搜索",
            defaultValue: mountSearchKeyword,
            okText: "搜索",
            cancelText: "取消",
            placeholder: "请输入关键字"
          });
          if (nextKeyword === null) return;
          await runMountGlobalSearch(nextKeyword);
        };
      }

      if (resetMountSearchBtn) {
        resetMountSearchBtn.onclick = async () => {
          await runMountGlobalSearch("");
        };
      }

      createMountFolderBtn.onclick = async () => {
        const mount = getSelectedMount();
        if (!mount) {
          await showMountNotice("请先选择挂载");
          return;
        }
        if (!isObjectMountType(mount.type)) {
          await showMountNotice("当前挂载类型不支持对象操作");
          return;
        }
        const folderName = await showMountInputDialog({
          title: "新建目录",
          message: "请输入目录名称",
          okText: "创建",
          cancelText: "取消",
          placeholder: "请输入目录名称"
        });
        if (!folderName) return;
        if (folderName.includes("/")) {
          await showMountNotice("目录名不能包含 /");
          return;
        }
        try {
          creatingMountFolder = true;
          renderMountStorage();
          await createMountFolder(folderName);
          await loadMountObjects();
        } catch (e) {
          await showMountNotice(e.message || "新建目录失败");
        } finally {
          creatingMountFolder = false;
          renderMountStorage();
        }
      };

      mountPrevPageBtn.onclick = async () => {
        if (mountCurrentPage <= 1) return;
        mountCurrentPage -= 1;
        if (mountSearchKeyword) await runMountGlobalSearch(mountSearchKeyword, false);
        else await loadMountObjects();
      };

      mountNextPageBtn.onclick = async () => {
        const totalPages = Math.max(1, Math.ceil(mountTotalCount / mountPageSize));
        if (mountCurrentPage >= totalPages) return;
        mountCurrentPage += 1;
        if (mountSearchKeyword) await runMountGlobalSearch(mountSearchKeyword, false);
        else await loadMountObjects();
      };

      if (mountPageSizeSelect) {
        mountPageSizeSelect.onchange = async () => {
          const nextPageSize = Number(mountPageSizeSelect.value);
          if (![50, 100, 150].includes(nextPageSize)) return;
          mountPageSize = nextPageSize;
          mountCurrentPage = 1;
          if (mountSearchKeyword) await runMountGlobalSearch(mountSearchKeyword);
          else await loadMountObjects();
        };
      }

      const toggleMountSort = async (key) => {
        if (mountSortKey === key) {
          mountSortOrder = mountSortOrder === "asc" ? "desc" : "asc";
        } else {
          mountSortKey = key;
          mountSortOrder = key === "updatedAt" ? "desc" : "asc";
        }
        mountCurrentPage = 1;
        if (mountSearchKeyword) await runMountGlobalSearch(mountSearchKeyword);
        else await loadMountObjects();
      };

      if (mountSortName) mountSortName.onclick = () => toggleMountSort("name");
      if (mountSortPath) mountSortPath.onclick = () => toggleMountSort("path");
      if (mountSortUpdatedAt) mountSortUpdatedAt.onclick = () => toggleMountSort("updatedAt");

      mountObjectUploadInput.onchange = async (event) => {
        const mount = getSelectedMount();
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!mount || !file) return;
        try {
          const form = new FormData();
          form.append("file", file, file.name);
          form.append("key", `${mountCurrentPrefix}${file.name}`);
          const res = await request(`/api/mounts/${mount.id}/objects/upload`, { method: "POST", body: form });
          if (res.ok) {
            await loadMountObjects();
          } else {
            const data = await res.json();
            await showMountNotice(data.message || "上传失败");
          }
        } catch (e) {
          await showMountNotice("上传失败");
        }
      };
    };

    window.openMountFolder = async (encodedPrefix) => {
      const nextPrefix = decodeURIComponent(encodedPrefix || "");
      mountSearchKeyword = "";
      mountTotalCount = 0;
      mountCurrentPage = 1;
      await loadMountObjects(nextPrefix);
    };

    window.downloadMountObject = (encodedKey) => {
      const mount = getSelectedMount();
      if (!mount) return;
      const key = decodeURIComponent(encodedKey || "");
      window.open(`/api/mounts/${mount.id}/objects/download?key=${encodeURIComponent(key)}`, "_blank");
    };

    window.renameMountObject = async (encodedKey) => {
      const mount = getSelectedMount();
      if (!mount) return;
      const oldKey = decodeURIComponent(encodedKey || "");
      const segments = oldKey.split("/");
      const oldName = segments[segments.length - 1] || oldKey;
      const nextName = await showMountInputDialog({
        title: "重命名对象",
        message: "请输入新文件名",
        defaultValue: oldName,
        okText: "保存",
        cancelText: "取消",
        placeholder: "请输入新文件名"
      });
      if (!nextName) return;
      if (nextName.includes("/")) {
        await showMountNotice("文件名不能包含 /");
        return;
      }
      const parent = segments.slice(0, -1).join("/");
      const nextKey = parent ? `${parent}/${nextName}` : nextName;
      if (nextKey === oldKey) return;
      try {
        await renameSingleMountObject(oldKey, nextKey);
        await loadMountObjects();
      } catch (e) {
        await showMountNotice(e.message || "重命名失败");
      }
    };

    window.deleteMountObject = async (encodedKey) => {
      const mount = getSelectedMount();
      if (!mount) return;
      const key = decodeURIComponent(encodedKey || "");
      const firstConfirm = await showMountConfirmDialog({
        title: "删除对象",
        message: `确认删除 ${key} 吗？`,
        okText: "继续删除",
        cancelText: "取消"
      });
      if (!firstConfirm) return;
      const secondConfirm = await showMountConfirmDialog({
        title: "二次确认",
        message: "删除后无法恢复，确定继续删除吗？",
        okText: "确认删除",
        cancelText: "返回"
      });
      if (!secondConfirm) return;
      try {
        await deleteSingleMountObject(key);
        await loadMountObjects();
      } catch (e) {
        await showMountNotice(e.message || "删除失败");
      }
    };

    window.renameMountFolder = async (encodedPrefix) => {
      const mount = getSelectedMount();
      if (!mount) return;
      const oldPrefix = normalizeMountPrefix(decodeURIComponent(encodedPrefix || ""));
      if (!oldPrefix) return;
      const oldName = oldPrefix.replace(/\/$/, "").split("/").filter(Boolean).pop() || oldPrefix;
      const nextName = await showMountInputDialog({
        title: "重命名目录",
        message: "请输入新目录名",
        defaultValue: oldName,
        okText: "保存",
        cancelText: "取消",
        placeholder: "请输入新目录名"
      });
      if (!nextName) return;
      if (nextName.includes("/")) {
        await showMountNotice("目录名不能包含 /");
        return;
      }
      const segments = oldPrefix.replace(/\/$/, "").split("/").filter(Boolean);
      const parentPath = segments.slice(0, -1).join("/");
      const nextPrefix = normalizeMountPrefix(parentPath ? `${parentPath}/${nextName}` : nextName);
      if (!nextPrefix || nextPrefix === oldPrefix) return;
      try {
        loadingMountObjects = true;
        renderMountStorage();
        const keys = await collectMountFileKeysRecursively(oldPrefix);
        for (const key of keys) {
          const nextKey = `${nextPrefix}${key.slice(oldPrefix.length)}`;
          await renameSingleMountObject(key, nextKey);
        }
        try {
          await renameSingleMountObject(oldPrefix, nextPrefix);
        } catch (e) {}
      } catch (e) {
        await showMountNotice(e.message || "目录重命名失败");
      } finally {
        loadingMountObjects = false;
      }
      await loadMountObjects();
    };

    window.deleteMountFolder = async (encodedPrefix) => {
      const mount = getSelectedMount();
      if (!mount) return;
      const folderPrefix = normalizeMountPrefix(decodeURIComponent(encodedPrefix || ""));
      if (!folderPrefix) return;
      const firstConfirm = await showMountConfirmDialog({
        title: "删除目录",
        message: `确认删除目录 ${folderPrefix} 吗？`,
        okText: "继续删除",
        cancelText: "取消"
      });
      if (!firstConfirm) return;
      const secondConfirm = await showMountConfirmDialog({
        title: "二次确认",
        message: "将删除目录下所有文件且无法恢复，确定继续吗？",
        okText: "确认删除",
        cancelText: "返回"
      });
      if (!secondConfirm) return;
      try {
        loadingMountObjects = true;
        renderMountStorage();
        const keys = await collectMountFileKeysRecursively(folderPrefix);
        for (const key of keys) {
          await deleteSingleMountObject(key);
        }
        try {
          await deleteSingleMountObject(folderPrefix);
        } catch (e) {}
      } catch (e) {
        await showMountNotice(e.message || "目录删除失败");
      } finally {
        loadingMountObjects = false;
      }
      await loadMountObjects();
    };

    window.deleteMount = async (id) => {
      if (!await showMountConfirmDialog({
        title: "删除挂载",
        message: "确定删除该挂载吗？",
        okText: "删除",
        cancelText: "取消"
      })) return;
      try {
        await request(`/api/mounts/${id}`, { method: "DELETE" });
        if (Number(selectedMountId) === Number(id)) {
          selectedMountId = null;
          mountCurrentPrefix = "";
          mountObjects = [];
        }
        await loadMounts();
        await loadMountObjects();
        syncMountRoute(true);
      } catch (e) {}
    };

    bindEvents();

    return {
      onEnterView: async () => {
        const params = new URLSearchParams(window.location.search);
        const mountIdFromUrl = Math.floor(Number(params.get("mountId")));
        selectedMountId = Number.isFinite(mountIdFromUrl) && mountIdFromUrl > 0 ? mountIdFromUrl : null;
        await loadMounts();
        await loadMountObjects();
        syncMountRoute(true);
      }
    };
  };
})();
