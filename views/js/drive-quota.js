// Quota Logic
const renderGroupBadge = (groupName, clickable = false) => {
  const name = escapeHtml(groupName);
  const lowerName = String(groupName || "").toLowerCase();
  
  if (lowerName === "svip") {
    return `<span class="profile-group-badge svip-badge${clickable ? " clickable-badge" : ""}"${clickable ? ' onclick="event.stopPropagation(); showPlanComparison()"' : ''}><span class="badge-icon-s">S</span><span class="badge-text">SVIP</span></span>`;
  } else if (lowerName === "vip") {
    return `<span class="profile-group-badge vip-badge${clickable ? " clickable-badge" : ""}"${clickable ? ' onclick="event.stopPropagation(); showPlanComparison()"' : ''}><span class="badge-icon-v">V</span><span class="badge-text">VIP</span></span>`;
  } else {
    return `<span class="profile-group-badge user-badge${clickable ? " clickable-badge" : ""}"${clickable ? ' onclick="event.stopPropagation(); showPlanComparison()"' : ''}><span class="badge-text">普通用户</span></span>`;
  }
};

let planComparisonLoadPromise = null;

const getPlanComparisonToneKey = (groupName) => {
  const lowerName = String(groupName || "").trim().toLowerCase();
  if (lowerName === "svip") return "svip";
  if (lowerName === "vip") return "vip";
  return "user";
};

const getPlanComparisonDisplayName = (groupName) => {
  const rawName = String(groupName || "").trim();
  if (!rawName) return "未命名用户组";
  return rawName.toLowerCase() === "user" ? "普通用户" : rawName;
};

const getPlanComparisonIconText = (groupName) => {
  const lowerName = String(groupName || "").trim().toLowerCase();
  if (lowerName === "svip") return "S";
  if (lowerName === "vip") return "V";
  if (lowerName === "user") return "U";
  return escapeHtml(getPlanComparisonDisplayName(groupName).charAt(0).toUpperCase() || "U");
};

const sortPlanComparisonGroups = (groups = []) => {
  const priorityMap = { svip: 1, vip: 2, user: 3 };
  return (Array.isArray(groups) ? groups : []).slice().sort((a, b) => {
    const aName = String(a && a.name || "").trim().toLowerCase();
    const bName = String(b && b.name || "").trim().toLowerCase();
    const aPriority = Object.prototype.hasOwnProperty.call(priorityMap, aName) ? priorityMap[aName] : 99;
    const bPriority = Object.prototype.hasOwnProperty.call(priorityMap, bName) ? priorityMap[bName] : 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return Number(a && a.id || 0) - Number(b && b.id || 0);
  });
};

const getPlanComparisonQuotaText = (quotaBytes) => {
  const quota = Number(quotaBytes);
  return quota === -1 ? "不限制" : formatSize(Number.isFinite(quota) ? quota : 0);
};

const getPlanComparisonUploadSizeText = (maxUploadSizeMb) => {
  const sizeMb = Number(maxUploadSizeMb || 0);
  return sizeMb > 0 ? formatSize(sizeMb * 1024 * 1024) : "不限制";
};

const getPlanComparisonUploadCountText = (maxUploadFileCount) => {
  const fileCount = Number(maxUploadFileCount || 0);
  return fileCount > 0 ? `${fileCount} 个` : "不限制";
};

const getPlanComparisonArchiveSupportHtml = (permissions = [], toneKey = "user") => {
  const permissionSet = new Set(Array.isArray(permissions) ? permissions : []);
  const valueClass = `${toneKey}-value`;
  if (permissionSet.has("extract")) {
    return `<span class="${valueClass}"><i class="fa-solid fa-check support-icon"></i> 查看预览/解压</span>`;
  }
  if (permissionSet.has("viewArchive")) {
    return `<span class="${valueClass}"><i class="fa-solid fa-check support-icon"></i> 查看预览</span>`;
  }
  return `<span class="${valueClass}"><i class="fa-solid fa-xmark support-icon" style="color: #f53f3f"></i>不支持</span>`;
};

const renderPlanComparisonState = (message, isError = false) => {
  const headEl = document.getElementById("planComparisonTableHead");
  const bodyEl = document.getElementById("planComparisonTableBody");
  if (!headEl || !bodyEl) return;
  headEl.innerHTML = `
    <tr>
      <th>权益</th>
      <th>方案</th>
    </tr>
  `;
  bodyEl.innerHTML = `
    <tr>
      <td class="feature-name">状态</td>
      <td class="feature-value${isError ? " user-value" : ""}">${escapeHtml(String(message || ""))}</td>
    </tr>
  `;
};

const renderPlanComparisonTable = (groups = []) => {
  const headEl = document.getElementById("planComparisonTableHead");
  const bodyEl = document.getElementById("planComparisonTableBody");
  if (!headEl || !bodyEl) return;
  const sortedGroups = sortPlanComparisonGroups(groups);
  if (!sortedGroups.length) {
    renderPlanComparisonState("暂无用户组配置", false);
    return;
  }

  headEl.innerHTML = `
    <tr>
      <th>权益</th>
      ${sortedGroups.map((group) => {
        const toneKey = getPlanComparisonToneKey(group && group.name);
        return `
          <th>
            <div class="plan-header">
              <span class="plan-icon plan-icon-${toneKey}">${getPlanComparisonIconText(group && group.name)}</span>
              <span class="plan-name">${escapeHtml(getPlanComparisonDisplayName(group && group.name))}</span>
            </div>
          </th>
        `;
      }).join("")}
    </tr>
  `;

  const rows = [
    {
      name: "空间容量",
      renderValue: (group) => escapeHtml(getPlanComparisonQuotaText(group && group.quotaBytes))
    },
    {
      name: "上传大小限制",
      renderValue: (group) => escapeHtml(getPlanComparisonUploadSizeText(group && group.maxUploadSizeMb))
    },
    {
      name: "单次上传数量",
      renderValue: (group) => escapeHtml(getPlanComparisonUploadCountText(group && group.maxUploadFileCount))
    },
    {
      name: "压缩文件",
      renderValue: (group) => getPlanComparisonArchiveSupportHtml(group && group.permissions, getPlanComparisonToneKey(group && group.name))
    }
  ];

  bodyEl.innerHTML = rows.map((row) => `
    <tr>
      <td class="feature-name">${escapeHtml(row.name)}</td>
      ${sortedGroups.map((group) => `<td class="feature-value ${getPlanComparisonToneKey(group && group.name)}-value">${row.renderValue(group)}</td>`).join("")}
    </tr>
  `).join("");
};

const loadPlanComparison = async () => {
  if (planComparisonLoadPromise) return planComparisonLoadPromise;
  planComparisonLoadPromise = (async () => {
    const res = await request("/api/auth/plan-groups");
    let data = null;
    try {
      data = await res.json();
    } catch (error) {}
    if (!res.ok) {
      throw new Error(data && data.message ? data.message : "加载方案配置失败");
    }
    renderPlanComparisonTable(Array.isArray(data) ? data : []);
  })();
  try {
    await planComparisonLoadPromise;
  } finally {
    planComparisonLoadPromise = null;
  }
};

const showPlanComparison = async () => {
  const modal = document.getElementById("planComparisonModal");
  if (modal) {
    modal.style.display = "flex";
  }
  renderPlanComparisonState("加载中...", false);
  try {
    await loadPlanComparison();
  } catch (error) {
    renderPlanComparisonState(error && error.message ? error.message : "加载方案配置失败", true);
  }
};

const closePlanComparisonModal = () => {
  const modal = document.getElementById("planComparisonModal");
  if (modal) {
    modal.style.display = "none";
  }
};

let storageDiskPageData = {
  systemDisks: [],
  storageConfig: {
    programDiskId: "",
    defaultDiskId: "",
    defaultDiskLocked: false,
    disks: []
  }
};
let storageDiskEventsBound = false;
const createTempNfsDiskId = () => `nfs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isRawNfsLikePath = (value) => /^(?![a-zA-Z]:[\\/])[^\\/:]+:\/.+/.test(String(value || "").trim());
let pendingNfsTestPath = "";
let pendingNfsTestPassed = false;

const renderSystemDiskTable = () => {
  const tbody = document.querySelector("#systemDiskTable tbody");
  if (!tbody) return;
  const rows = Array.isArray(storageDiskPageData.systemDisks) ? storageDiskPageData.systemDisks : [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999;">暂无磁盘数据</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((item) => `
    <tr>
      <td>${escapeHtml(item.label || item.mount || "-")}</td>
      <td>${escapeHtml(item.mount || "-")}</td>
      <td>${formatSize(Number(item.totalBytes || 0))}</td>
      <td>${formatSize(Number(item.usedBytes || 0))}</td>
      <td>${formatSize(Number(item.freeBytes || 0))}</td>
    </tr>
  `).join("");
};

const renderStorageConfigTable = () => {
  const tbody = document.querySelector("#storageDiskConfigTable tbody");
  if (!tbody) return;
  const storageConfig = storageDiskPageData.storageConfig && typeof storageDiskPageData.storageConfig === "object"
    ? storageDiskPageData.storageConfig
    : { programDiskId: "", defaultDiskId: "", defaultDiskLocked: false, disks: [] };
  const rows = Array.isArray(storageConfig.disks) ? storageConfig.disks : [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#999;">未检测到可用磁盘</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((item) => {
    const isDefault = String(item.id || "") === String(storageConfig.defaultDiskId || "");
    const diskName = item.isProgramDisk ? `${item.name}（程序所在盘）` : item.name;
    const isNfs = String(item.source || "").toLowerCase() === "nfs";
    const defaultDisabledAttr = storageConfig.defaultDiskLocked ? "disabled" : "";
    const enabledDisabledAttr = item.hasData ? "disabled" : (storageConfig.defaultDiskLocked && isDefault ? "disabled" : "");
    const pathDisabledAttr = item.hasData ? "disabled" : "";
    const removeDisabledAttr = item.hasData ? "disabled" : "";
    const rowTitle = item.hasData ? ' title="该存储盘已有数据，已锁定关键操作"' : "";
    const pathCell = isNfs
      ? `<input type="text" class="storage-disk-path-input" value="${escapeHtml(String(item.remotePath || item.path || ""))}" placeholder="输入 NFS 远程路径或已挂载目录" style="width:100%; padding:4px 8px; border:1px solid #dcdfe6; border-radius:4px;" ${pathDisabledAttr} />`
      : escapeHtml(String(item.path || "-"));
    const actionCell = isNfs
      ? `<button type="button" class="btn-sm storage-disk-remove-btn" ${removeDisabledAttr}>移除</button>`
      : "-";
    const mountText = isNfs
      ? escapeHtml(String(item.mountMode || "") === "auto" ? `自动挂载到 ${item.path || "-"}` : (item.systemDiskMount || item.mount || "-"))
      : escapeHtml(item.systemDiskMount || item.mount || "-");
    return `
      <tr data-disk-id="${escapeHtml(String(item.id || ""))}" data-source="${isNfs ? "nfs" : "system"}"${rowTitle}>
        <td><input type="radio" name="defaultStorageDisk" ${isDefault ? "checked" : ""} ${defaultDisabledAttr} /></td>
        <td>${isNfs ? "NFS" : "本地盘"}</td>
        <td>${escapeHtml(diskName || "-")}</td>
        <td class="storage-disk-mount">${mountText}</td>
        <td>${pathCell}</td>
        <td class="storage-disk-total">${Number(item.totalBytes || 0) > 0 ? formatSize(Number(item.totalBytes || 0)) : "-"}</td>
        <td class="storage-disk-free">${Number(item.freeBytes || 0) > 0 ? formatSize(Number(item.freeBytes || 0)) : "-"}</td>
        <td style="text-align:center;"><input type="checkbox" class="storage-disk-enabled" ${item.enabled === false ? "" : "checked"} ${enabledDisabledAttr} /></td>
        <td>${actionCell}</td>
      </tr>
    `;
  }).join("");
};

const collectStorageDiskConfigPayload = () => {
  const rows = Array.from(document.querySelectorAll("#storageDiskConfigTable tbody tr[data-disk-id]"));
  const disks = rows.map((row) => {
    const diskId = String(row.dataset.diskId || "").trim();
    const source = String(row.dataset.source || "system").trim().toLowerCase();
    const enabled = !!(row.querySelector(".storage-disk-enabled") || {}).checked;
    const isDefault = !!(row.querySelector('input[type="radio"][name="defaultStorageDisk"]') || {}).checked;
    const pathInput = row.querySelector(".storage-disk-path-input");
    const diskPath = pathInput ? String(pathInput.value || "").trim() : "";
    const payload = {
      id: diskId,
      source,
      enabled,
      isDefault
    };
    if (source === "nfs") {
      payload.path = diskPath;
    }
    return payload;
  }).filter((item) => item.id);
  const invalidNfsDisk = disks.find((item) => item.source === "nfs" && !item.path);
  if (invalidNfsDisk) {
    throw new Error("请输入 NFS 挂载目录绝对路径");
  }
  const defaultDisk = disks.find((item) => item.isDefault && item.enabled) || disks.find((item) => item.enabled) || null;
  return {
    defaultDiskId: defaultDisk ? defaultDisk.id : "",
    disks: disks.map((item) => ({
      id: item.id,
      source: item.source,
      path: item.path,
      enabled: item.enabled
    }))
  };
};

const loadStorageDisks = async () => {
  try {
    const res = await request("/api/admin/storage-disks");
    if (!res.ok) return;
    const payload = await res.json();
    storageDiskPageData = {
      systemDisks: Array.isArray(payload.systemDisks) ? payload.systemDisks : [],
      storageConfig: payload.storageConfig && typeof payload.storageConfig === "object"
        ? payload.storageConfig
        : { programDiskId: "", defaultDiskId: "", defaultDiskLocked: false, disks: [] }
    };
    renderSystemDiskTable();
    renderStorageConfigTable();
  } catch (e) {}
};

const getNfsStorageModalElements = () => {
  const modal = document.getElementById("nfsStorageModal");
  return {
    modal,
    form: document.getElementById("nfsStorageForm"),
    pathInput: document.getElementById("nfsStorageModalPathInput"),
    resultEl: document.getElementById("nfsStorageTestResult"),
    testBtn: document.getElementById("testNfsStorageBtn"),
    cancelBtn: document.getElementById("cancelNfsStorageModalBtn")
  };
};

const setNfsStorageTestResult = (message, isError = false) => {
  const { resultEl } = getNfsStorageModalElements();
  if (!resultEl) return;
  resultEl.textContent = String(message || "");
  resultEl.style.color = isError ? "#f53f3f" : "#52c41a";
};

const openNfsStorageModal = () => {
  const { modal, pathInput, resultEl } = getNfsStorageModalElements();
  if (!modal || !pathInput) return;
  pendingNfsTestPath = "";
  pendingNfsTestPassed = false;
  pathInput.value = "";
  if (resultEl) {
    resultEl.textContent = "";
    resultEl.style.color = "#666";
  }
  modal.style.display = "flex";
  setTimeout(() => pathInput.focus(), 0);
};

const closeNfsStorageModal = () => {
  const { modal } = getNfsStorageModalElements();
  if (!modal) return;
  modal.style.display = "none";
};

const testNfsStorageAccess = async () => {
  const { pathInput, testBtn } = getNfsStorageModalElements();
  const targetPath = String(pathInput && pathInput.value || "").trim();
  if (!targetPath) {
    pendingNfsTestPassed = false;
    setNfsStorageTestResult("请输入 NFS 挂载目录绝对路径", true);
    return false;
  }
  try {
    if (testBtn) testBtn.disabled = true;
    const res = await request("/api/admin/storage-disks/test-nfs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: targetPath })
    });
    const data = await res.json();
    if (!res.ok) {
      pendingNfsTestPassed = false;
      pendingNfsTestPath = "";
      setNfsStorageTestResult(data.message || "权限测试失败", true);
      return false;
    }
    pendingNfsTestPassed = true;
    pendingNfsTestPath = String(data.path || targetPath).trim();
    setNfsStorageTestResult(data.mountMode === "auto"
      ? `${data.message || "权限测试通过"}，将自动挂载到 ${data.mountPath || "-"}`
      : (data.message || "权限测试通过"));
    return true;
  } catch (error) {
    pendingNfsTestPassed = false;
    pendingNfsTestPath = "";
    setNfsStorageTestResult("权限测试失败", true);
    return false;
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
};

const appendNfsStorageRow = (targetPath) => {
  const tbody = document.querySelector("#storageDiskConfigTable tbody");
  if (!tbody) return false;
  const currentRows = Array.from(tbody.querySelectorAll("tr[data-disk-id]"));
  const normalizedTargetPath = String(targetPath || "").trim();
  const duplicated = currentRows.some((row) => {
    if (String(row.dataset.source || "") !== "nfs") return false;
    const input = row.querySelector(".storage-disk-path-input");
    return String(input && input.value || "").trim() === normalizedTargetPath;
  });
  if (duplicated) {
    setNfsStorageTestResult("该 NFS 挂载目录已存在", true);
    return false;
  }
  const row = document.createElement("tr");
  row.dataset.diskId = createTempNfsDiskId();
  row.dataset.source = "nfs";
  const defaultDisabledAttr = storageDiskPageData.storageConfig && storageDiskPageData.storageConfig.defaultDiskLocked ? "disabled" : "";
  row.innerHTML = `
    <td><input type="radio" name="defaultStorageDisk" ${defaultDisabledAttr} /></td>
    <td>NFS</td>
    <td>NFS 挂载</td>
    <td class="storage-disk-mount">${escapeHtml(isRawNfsLikePath(normalizedTargetPath) ? "待自动挂载" : normalizedTargetPath)}</td>
    <td><input type="text" class="storage-disk-path-input" value="${escapeHtml(normalizedTargetPath)}" placeholder="输入 NFS 远程路径或已挂载目录" style="width:100%; padding:4px 8px; border:1px solid #dcdfe6; border-radius:4px;" /></td>
    <td>-</td>
    <td>-</td>
    <td style="text-align:center;"><input type="checkbox" class="storage-disk-enabled" checked /></td>
    <td><button type="button" class="btn-sm storage-disk-remove-btn">移除</button></td>
  `;
  tbody.appendChild(row);
  return true;
};

const bindStorageDiskEvents = () => {
  if (storageDiskEventsBound) return;
  storageDiskEventsBound = true;
  const addNfsBtn = document.getElementById("addNfsStorageBtn");
  const saveBtn = document.getElementById("saveStorageDiskBtn");
  const refreshBtn = document.getElementById("refreshStorageDisksBtn");
  const storageTableBody = document.querySelector("#storageDiskConfigTable tbody");
  const {
    modal: nfsStorageModal,
    form: nfsStorageForm,
    pathInput: nfsStorageModalPathInput,
    testBtn: testNfsStorageBtn,
    cancelBtn: cancelNfsStorageModalBtn
  } = getNfsStorageModalElements();
  if (addNfsBtn) {
    addNfsBtn.onclick = () => {
      openNfsStorageModal();
    };
  }
  if (nfsStorageModalPathInput) {
    nfsStorageModalPathInput.addEventListener("input", () => {
      const currentPath = String(nfsStorageModalPathInput.value || "").trim();
      if (currentPath !== pendingNfsTestPath) {
        pendingNfsTestPassed = false;
        setNfsStorageTestResult("", false);
      }
    });
  }
  if (testNfsStorageBtn) {
    testNfsStorageBtn.onclick = async () => {
      await testNfsStorageAccess();
    };
  }
  if (cancelNfsStorageModalBtn) {
    cancelNfsStorageModalBtn.onclick = () => {
      closeNfsStorageModal();
    };
  }
  if (nfsStorageModal) {
    nfsStorageModal.addEventListener("click", (event) => {
      if (event.target === nfsStorageModal) {
        closeNfsStorageModal();
      }
    });
  }
  if (nfsStorageForm) {
    nfsStorageForm.onsubmit = async (event) => {
      event.preventDefault();
      const currentPath = String(nfsStorageModalPathInput && nfsStorageModalPathInput.value || "").trim();
      if (!currentPath) {
        setNfsStorageTestResult("请输入 NFS 挂载目录绝对路径", true);
        return;
      }
      if (!pendingNfsTestPassed || pendingNfsTestPath !== currentPath) {
        const passed = await testNfsStorageAccess();
        if (!passed) return;
      }
      if (!appendNfsStorageRow(pendingNfsTestPath || currentPath)) return;
      closeNfsStorageModal();
    };
  }
  if (saveBtn) {
    saveBtn.onclick = async () => {
      let payload;
      try {
        payload = collectStorageDiskConfigPayload();
      } catch (error) {
        alert(error.message || "存储盘配置不正确");
        return;
      }
      if (storageDiskPageData.storageConfig && storageDiskPageData.storageConfig.defaultDiskLocked) {
        const currentDefaultId = String(storageDiskPageData.storageConfig.defaultDiskId || "");
        const currentDefaultDisk = payload.disks.find((item) => item.id === currentDefaultId);
        if (payload.defaultDiskId !== currentDefaultId) {
          alert("默认盘已有数据，不能修改默认盘");
          return;
        }
        if (currentDefaultDisk && !currentDefaultDisk.enabled) {
          alert("默认盘已有数据，不能禁用默认盘");
          return;
        }
      }
      if (!payload.disks.some((item) => item.enabled)) {
        alert("请至少启用一块存储盘");
        return;
      }
      try {
        const res = await request("/api/admin/storage-disks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "保存失败");
          return;
        }
        await loadQuota();
        alert(data.message || "保存成功");
      } catch (e) {
        alert("保存失败");
      }
    };
  }
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      await loadStorageDisks();
    };
  }
  if (storageTableBody) {
    storageTableBody.addEventListener("click", (event) => {
      const removeBtn = event.target.closest(".storage-disk-remove-btn");
      if (!removeBtn) return;
      const row = removeBtn.closest("tr[data-disk-id]");
      if (!row || String(row.dataset.source || "") !== "nfs") return;
      row.remove();
    });
  }
};

const loadQuota = async () => {
  try {
    bindStorageDiskEvents();
    const res = await request("/api/admin/stats");
    const stats = await res.json();
    document.getElementById("totalSpaceDisplay").textContent = Number(stats.totalSpace || 0) > 0 ? formatSize(stats.totalSpace) : "-";
    document.getElementById("usedSpaceDisplay").textContent = Number(stats.availableSpace || 0) > 0 ? formatSize(stats.availableSpace) : "-";
    document.getElementById("userCountDisplay").textContent = stats.userCount;
    await loadStorageDisks();
    
    // 初始化搜索状态
    if (state.quotaSearchTerm === undefined) {
      state.quotaSearchTerm = "";
    }
    
    // Also load users for table
    await loadQuotaUsers();
    renderQuotaTable();
  } catch(e) {}
};

const loadQuotaUsers = async () => {
  try {
    const searchTerm = state.quotaSearchTerm || "";
    const url = searchTerm ? `/api/users?search=${encodeURIComponent(searchTerm)}` : "/api/users";
    const res = await request(url);
    const users = await res.json();
    usersData = users;
  } catch(e) {
    console.error("Failed to load quota users", e);
  }
};

const renderQuotaTable = () => {
  const tbody = document.querySelector("#quotaTable tbody");
  if (!tbody) return;
  
  const quotaPagination = renderAdminTablePagination({
    total: usersData.length,
    page: state.quotaPage,
    pageSize: state.quotaPageSize,
    summaryEl: quotaPaginationSummaryEl,
    pageInfoEl: quotaPageInfoEl,
    prevBtn: quotaPrevPageBtn,
    nextBtn: quotaNextPageBtn,
    pageSizeSelect: quotaPageSizeSelect
  });
  state.quotaPage = quotaPagination.page;
  tbody.innerHTML = usersData.slice(quotaPagination.startIndex, quotaPagination.endIndex).map(u => {
    const used = u.used || 0;
    const effectiveQuota = u.effectiveQuota !== undefined ? u.effectiveQuota : -1;
    const total = effectiveQuota === -1 ? 0 : effectiveQuota;
    const percentValue = total > 0 ? (used / total) * 100 : 0;
    const percent = total > 0 ? ((used / total) * 100).toFixed(1) + "%" : "-";
    const barColor = percentValue > 95 ? "#f53f3f" : percentValue > 75 ? "#ff7d00" : "#165dff";
    
    return `
      <tr>
        <td>${u.id}</td>
        <td>${u.username} (${u.name || "-"})</td>
        <td>${escapeHtml(u.storageDiskDisplay || "-")}</td>
        <td>${formatSize(used)}${percent === "-" ? "" : ` (${percent})`}</td>
        <td>${effectiveQuota === -1 ? "无限制" : formatSize(effectiveQuota)}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:100px; height:8px; background:#ebedf0; border-radius:4px; overflow:hidden;">
              <div style="width:${total > 0 ? Math.min(100, percentValue) : 0}%; height:100%; background:${barColor};"></div>
            </div>
            <span>${percent}</span>
          </div>
        </td>
        <td>${u.fileCount || 0}</td>
      </tr>
    `;
  }).join("");
};

const handleQuotaSearch = async () => {
  const input = document.getElementById("quotaSearchInput");
  const clearBtn = document.getElementById("quotaClearSearchBtn");
  if (!input) return;
  
  state.quotaSearchTerm = input.value.trim();
  state.quotaPage = 1;
  
  if (clearBtn) {
    clearBtn.style.display = state.quotaSearchTerm ? "" : "none";
  }
  
  await loadQuotaUsers();
  renderQuotaTable();
};

const clearQuotaSearch = async () => {
  const input = document.getElementById("quotaSearchInput");
  const clearBtn = document.getElementById("quotaClearSearchBtn");
  if (!input) return;
  
  input.value = "";
  state.quotaSearchTerm = "";
  state.quotaPage = 1;
  
  if (clearBtn) {
    clearBtn.style.display = "none";
  }
  
  await loadQuotaUsers();
  renderQuotaTable();
};


const renderLogoBox = (user) => {
  const logoBox = document.querySelector(".logo-box");
  if (!logoBox || !user) return;
  
  let avatarHtml = "";
  if (user.avatar && user.avatar.trim() !== "") {
    avatarHtml = `<img src="${user.avatar}" class="user-avatar-img" alt="avatar">`;
  } else {
    const firstChar = (user.username || "U").charAt(0).toUpperCase();
    avatarHtml = `<div class="user-avatar-default">${firstChar}</div>`;
  }
  
  let groupsHtml = "";
  if (user.groupNames && Array.isArray(user.groupNames) && user.groupNames.length > 0) {
    groupsHtml = `<div class="logo-box-groups">${user.groupNames.map(g => renderGroupBadge(g, true)).join("")}</div>`;
  }
  
  logoBox.innerHTML = avatarHtml + groupsHtml;
};

const renderProfileCenter = () => {
  const user = state.currentUser;
  if (!user) return;
  const avatarUrl = user.avatar && user.avatar.trim() ? user.avatar : "";
  if (profileCenterAvatar) {
    if (avatarUrl) {
      profileCenterAvatar.innerHTML = `<img src="${avatarUrl}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      profileCenterAvatar.textContent = (user.username || "U").charAt(0).toUpperCase();
    }
  }
  if (profileCenterName) {
    profileCenterName.textContent = user.name && user.name.trim() ? user.name : "未设置名称";
  }
  if (profileCenterGroups) {
    const groupNames = user.groupNames && Array.isArray(user.groupNames) && user.groupNames.length > 0
      ? user.groupNames.map(g => renderGroupBadge(g)).join("")
      : "";
    profileCenterGroups.innerHTML = groupNames;
  }
  if (profileCenterUsername) {
    profileCenterUsername.textContent = `用户名: ${user.username || "-"}`;
  }
  if (profileCenterLastLoginAt) {
    profileCenterLastLoginAt.textContent = `登录时间: ${formatDate(user.lastLoginAt)}`;
  }
  if (profileCenterLastLoginIp) {
    profileCenterLastLoginIp.textContent = `登录IP: ${user.lastLoginIp || "-"}`;
  }
  if (profileCenterQuota) {
    profileCenterQuota.textContent = `空间额度：${formatQuotaSummary(state.currentUserStats)}`;
  }
};

const loadCurrentUserStats = async () => {
  try {
    const res = await request("/api/stats");
    if (!res.ok) return;
    const stats = await res.json();
    state.currentUserStats = stats;
  } catch (e) {}
};

const openProfileCenter = async () => {
  if (!state.currentUser || !profileCenterModal) return;
  await loadCurrentUserStats();
  renderProfileCenter();
  profileCenterModal.style.display = "flex";
};

const closeModalById = (modalEl) => {
  if (!modalEl) return;
  modalEl.style.display = "none";
};

const bindProfileCenter = () => {
  const logoBox = document.querySelector(".logo-box");
  if (logoBox) {
    logoBox.style.cursor = "pointer";
    logoBox.onclick = (event) => {
      event.preventDefault();
      openProfileCenter();
    };
  }
  if (closeProfileCenterBtn) {
    closeProfileCenterBtn.onclick = () => closeModalById(profileCenterModal);
  }
  if (closePlanComparisonBtn) {
    closePlanComparisonBtn.onclick = () => closePlanComparisonModal();
  }
  const planComparisonModal = document.getElementById("planComparisonModal");
  if (planComparisonModal) {
    planComparisonModal.addEventListener("click", (e) => {
      if (e.target === planComparisonModal) {
        closePlanComparisonModal();
      }
    });
  }
  if (openAvatarUpdateBtn) {
    openAvatarUpdateBtn.onclick = () => {
      if (!state.currentUser) return;
      updateAvatarUploadUiHints();
      const avatarUrl = state.currentUser.avatar && state.currentUser.avatar.trim() ? state.currentUser.avatar : getDefaultAvatarByUser(state.currentUser);
      if (profileAvatarUrlInput) profileAvatarUrlInput.value = state.currentUser.avatar || "";
      if (profileAvatarPreview) profileAvatarPreview.src = avatarUrl;
      if (profileAvatarFileInput) profileAvatarFileInput.value = "";
      avatarCropState.useLocalFile = false;
      resetAvatarCropCanvas(avatarUrl);
      if (avatarUpdateModal) avatarUpdateModal.style.display = "flex";
    };
  }
  if (openProfileEditBtn) {
    openProfileEditBtn.onclick = () => {
      if (!state.currentUser) return;
      if (profileEditNameInput) profileEditNameInput.value = state.currentUser.name || "";
      if (profileEditPhoneInput) profileEditPhoneInput.value = state.currentUser.phone || "";
      if (profileEditPasswordInput) profileEditPasswordInput.value = "";
      if (profileEditModal) profileEditModal.style.display = "flex";
    };
  }
  if (profileAvatarUrlInput && profileAvatarPreview) {
    profileAvatarUrlInput.oninput = () => {
      updateAvatarPreviewByUrl();
    };
  }
  if (profileAvatarFileInput) {
    profileAvatarFileInput.onchange = () => {
      const file = profileAvatarFileInput.files && profileAvatarFileInput.files[0] ? profileAvatarFileInput.files[0] : null;
      readLocalAvatarFile(file);
    };
  }
  if (profileAvatarZoomRange) {
    profileAvatarZoomRange.oninput = () => {
      if (!profileAvatarCropCanvas || !avatarCropState.image) return;
      const prevScale = avatarCropState.scale;
      const nextRate = Number(profileAvatarZoomRange.value || 100) / 100;
      avatarCropState.scale = avatarCropState.minScale * nextRate;
      const centerX = profileAvatarCropCanvas.width / 2;
      const centerY = profileAvatarCropCanvas.height / 2;
      const ratio = avatarCropState.scale / prevScale;
      avatarCropState.offsetX = centerX - (centerX - avatarCropState.offsetX) * ratio;
      avatarCropState.offsetY = centerY - (centerY - avatarCropState.offsetY) * ratio;
      drawAvatarCropCanvas();
    };
  }
  if (profileAvatarCropCanvas) {
    profileAvatarCropCanvas.onpointerdown = (event) => {
      if (!avatarCropState.image) return;
      avatarCropState.dragging = true;
      avatarCropState.dragStartX = event.clientX;
      avatarCropState.dragStartY = event.clientY;
      avatarCropState.dragOffsetX = avatarCropState.offsetX;
      avatarCropState.dragOffsetY = avatarCropState.offsetY;
      profileAvatarCropCanvas.classList.add("dragging");
      profileAvatarCropCanvas.setPointerCapture(event.pointerId);
    };
    profileAvatarCropCanvas.onpointermove = (event) => {
      if (!avatarCropState.dragging) return;
      avatarCropState.offsetX = avatarCropState.dragOffsetX + (event.clientX - avatarCropState.dragStartX);
      avatarCropState.offsetY = avatarCropState.dragOffsetY + (event.clientY - avatarCropState.dragStartY);
      drawAvatarCropCanvas();
    };
    profileAvatarCropCanvas.onpointerup = (event) => {
      avatarCropState.dragging = false;
      profileAvatarCropCanvas.classList.remove("dragging");
      profileAvatarCropCanvas.releasePointerCapture(event.pointerId);
    };
    profileAvatarCropCanvas.onpointercancel = () => {
      avatarCropState.dragging = false;
      profileAvatarCropCanvas.classList.remove("dragging");
    };
    profileAvatarCropCanvas.onwheel = (event) => {
      if (!avatarCropState.image || !profileAvatarZoomRange) return;
      event.preventDefault();
      const currentRate = Number(profileAvatarZoomRange.value || 100);
      const nextRate = Math.max(100, Math.min(400, currentRate + (event.deltaY < 0 ? 5 : -5)));
      if (nextRate === currentRate) return;
      const prevScale = avatarCropState.scale;
      profileAvatarZoomRange.value = String(nextRate);
      avatarCropState.scale = avatarCropState.minScale * (nextRate / 100);
      const rect = profileAvatarCropCanvas.getBoundingClientRect();
      const pointX = event.clientX - rect.left;
      const pointY = event.clientY - rect.top;
      const ratio = avatarCropState.scale / prevScale;
      avatarCropState.offsetX = pointX - (pointX - avatarCropState.offsetX) * ratio;
      avatarCropState.offsetY = pointY - (pointY - avatarCropState.offsetY) * ratio;
      drawAvatarCropCanvas();
    };
  }
  document.querySelectorAll("[data-avatar-preset]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!profileAvatarUrlInput || !profileAvatarPreview) return;
      profileAvatarUrlInput.value = el.src;
      profileAvatarPreview.src = el.src;
      avatarCropState.useLocalFile = false;
      resetAvatarCropCanvas(el.src);
      if (profileAvatarFileInput) profileAvatarFileInput.value = "";
    });
  });
  if (cancelAvatarUpdateBtn) {
    cancelAvatarUpdateBtn.onclick = () => closeModalById(avatarUpdateModal);
  }
  if (cancelProfileEditBtn) {
    cancelProfileEditBtn.onclick = () => closeModalById(profileEditModal);
  }
  if (avatarUpdateForm) {
    avatarUpdateForm.onsubmit = async (event) => {
      event.preventDefault();
      if (!state.currentUser) return;
      try {
        let res;
        // 不管是不是本地文件，只要有有效裁切图片，都尝试用裁切数据提交，除非明确只用了纯文本URL
        if (avatarCropState.image) {
          const output = getAvatarCropOutputConfig();
          if (!output.supported) {
            alert("当前图片格式配置不支持剪裁导出，请至少包含 png、jpg 或 webp");
            return;
          }
          const blob = await getCroppedAvatarBlob(output.mime);
          if (!blob) {
            alert("头像处理失败");
            return;
          }
          const formData = new FormData();
          formData.append("avatar", blob, `avatar.${output.ext}`);
          res = await request("/api/auth/avatar", {
            method: "POST",
            body: formData
          });
        } else {
          let avatar = profileAvatarUrlInput ? profileAvatarUrlInput.value.trim() : "";
          if (avatar && !avatar.startsWith("/")) {
            try {
              const urlObj = new URL(avatar);
              avatar = urlObj.pathname + urlObj.search;
            } catch (err) {
              avatar = "/" + avatar;
            }
          }
          res = await request("/api/auth/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatar })
          });
        }
        if (!res.ok) {
          const data = await res.json();
          alert(data.message || "保存失败");
          return;
        }
        closeModalById(avatarUpdateModal);
        closeModalById(profileCenterModal);
        await loadUserInfo();
      } catch (e) {
        alert("保存失败");
      }
    };
  }
  if (profileEditForm) {
    profileEditForm.onsubmit = async (event) => {
      event.preventDefault();
      const name = profileEditNameInput ? profileEditNameInput.value.trim() : "";
      const phone = profileEditPhoneInput ? profileEditPhoneInput.value.trim() : "";
      const password = profileEditPasswordInput ? profileEditPasswordInput.value : "";
      if (password && String(password).length < 6) {
        showAppNotice({ title: "提示", message: "密码至少6位", isError: true });
        return;
      }
      const body = { name, phone };
      if (password) body.password = password;
      try {
        const res = await request("/api/auth/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const data = await res.json();
          showAppNotice({ title: "提示", message: data.message || "保存失败", isError: true });
          return;
        }
        closeModalById(profileEditModal);
        await loadUserInfo();
        renderProfileCenter();
        showAppNotice({ title: "提示", message: "保存成功" });
      } catch (e) {
        showAppNotice({ title: "提示", message: "保存失败", isError: true });
      }
    };
  }
  [profileCenterModal, avatarUpdateModal, profileEditModal].forEach((modalEl) => {
    if (!modalEl) return;
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) modalEl.style.display = "none";
    });
  });
  if (shareModal) {
    shareModal.addEventListener("click", (event) => {
      if (event.target === shareModal) {
        shareModal.style.display = "none";
      }
    });
  }
};

const loadUserInfo = async () => {
  try {
    const res = await request("/api/auth/me");
    const user = await res.json();
    state.currentUser = user;
    const nextViewMode = normalizeViewModePreference(user && user.viewMode);
    const nextGridSize = normalizeGridSizePreference(user && user.gridSize);
    const nextVisibleCategories = normalizeVisibleCategoriesPreference(user && user.visibleCategories);
    const nextTimelineEnabled = Boolean(user && user.timelineEnabled);
    const viewPreferenceChanged = state.viewMode !== nextViewMode || state.gridSize !== nextGridSize;
    const categoryVisibilityChanged = JSON.stringify(state.visibleCategories) !== JSON.stringify(nextVisibleCategories);
    const timelinePreferenceChanged = state.categoryTimelineEnabled !== nextTimelineEnabled;
    state.viewMode = nextViewMode;
    state.gridSize = nextGridSize;
    state.visibleCategories = nextVisibleCategories;
    state.categoryTimelineEnabled = nextTimelineEnabled;
    localStorage.setItem(CATEGORY_TIMELINE_MODE_STORAGE_KEY, state.categoryTimelineEnabled ? "1" : "0");
    applyCategoryVisibilityUI();
    state.userPermissions = normalizeUserPermissions(user.permissions);
    state.allowedMenus = normalizeAllowedMenus(user.allowedMenus);
    state.mobileVisibleMenus = normalizeAllowedMenus(user.mobileVisibleMenus);
    localStorage.setItem("drive_allowed_menus_cache_v1", JSON.stringify(state.allowedMenus));
    localStorage.setItem("drive_mobile_visible_menus_cache_v1", JSON.stringify(state.mobileVisibleMenus));
    applyMainMenuVisibility();
    applyPermissionUI();
    await loadUploadTasks();
    await loadDownloadTasks();
    renderUploadTasks();
    renderDownloadTasks();
    switchTransferTaskTab("upload");
    const activeMain = Array.from(mainNavItems).find((item) => item.classList.contains("active"))?.dataset.view || "";
    if (!getRenderableMenus().includes(activeMain)) {
      await applyRouteFromUrl();
    }
    renderLogoBox(user);
    renderProfileCenter();
    const categoryWillBeHidden = state.category && !isCategoryVisible(state.category);
    if (categoryWillBeHidden) {
      state.category = "";
      updateRouteQuery({ main: "files", side: "myFiles", category: null });
      await refreshAll();
    } else if (viewPreferenceChanged || categoryVisibilityChanged || timelinePreferenceChanged) {
      renderFileList();
    } else {
      updateViewModeUI();
    }
    await loadHiddenSpaceStatus();
  } catch(e) {
    console.error("Failed to load user info", e);
    state.currentUser = null;
    state.userPermissions = FILE_PERMISSION_KEYS.slice();
    state.allowedMenus = MAIN_MENU_KEYS.slice();
    state.mobileVisibleMenus = MAIN_MENU_KEYS.slice();
    applyMainMenuVisibility();
    applyPermissionUI();
    state.uploadTasks = [];
    renderUploadTasks();
    state.downloadTasks = [];
    renderDownloadTasks();
    switchTransferTaskTab("upload");
    state.hiddenSpaceEnabled = null;
    state.visibleCategories = FILE_CATEGORY_KEYS.slice();
    applyCategoryVisibilityUI();
    setHiddenSpaceUnlocked(false);
    updateHiddenSpaceUiState();
  }
};

if (closeHiddenSpaceBtn) {
  closeHiddenSpaceBtn.onclick = async () => {
    if (state.fileSpace !== "hidden") return;
    setHiddenSpaceUnlocked(false);
    await switchFileSpace("normal", "myFiles");
  };
}

if (hiddenSpaceUnlockedIcon) {
  hiddenSpaceUnlockedIcon.onclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.hiddenSpaceUnlocked) return;
    setHiddenSpaceUnlocked(false);
    if (state.fileSpace === "hidden") {
      await switchFileSpace("normal", "myFiles");
      return;
    }
    updateHiddenSpaceUiState();
  };
}

if (resetHiddenSpacePwdBtn) {
  resetHiddenSpacePwdBtn.onclick = async () => {
    if (!hiddenSpaceManager || typeof hiddenSpaceManager.resetPassword !== "function") return;
    const ask = async (message, defaultValue) => {
      if (typeof window.showAppPrompt === "function") {
        return window.showAppPrompt({ title: message, defaultValue, inputType: "password" });
      }
      try {
        return window.prompt(message, defaultValue);
      } catch (_error) {
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
    await hiddenSpaceManager.resetPassword(
      request,
      state,
      { closeBtn: closeHiddenSpaceBtn, dot: hiddenSpaceDot, resetBtn: resetHiddenSpacePwdBtn, autoExitTip: hiddenSpaceAutoExitTip, unlockedIcon: hiddenSpaceUnlockedIcon },
      (message) => alert(message),
      ask,
      choose,
      openResetDialog
    );
  };
}
