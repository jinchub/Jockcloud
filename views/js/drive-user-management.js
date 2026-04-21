// User Management
const getPermissionSourceText = (source) => {
  if (source === "user") return "用户";
  if (source === "group") return "用户组";
  return "默认";
};

const setUserManageTab = (tab, routeMode = "none") => {
  userManageActiveTab = tab === "groups" ? "groups" : "users";
  const usersTabBtn = document.getElementById("usersTabBtn");
  const userGroupsTabBtn = document.getElementById("userGroupsTabBtn");
  const usersTabPanel = document.getElementById("usersTabPanel");
  const userGroupsTabPanel = document.getElementById("userGroupsTabPanel");
  const addUserBtn = document.getElementById("addUserBtn");
  const addUserGroupBtn = document.getElementById("addUserGroupBtn");
  const usersActive = userManageActiveTab === "users";
  if (usersTabBtn) {
    usersTabBtn.style.background = usersActive ? "#165dff" : "";
    usersTabBtn.style.color = usersActive ? "#fff" : "";
    usersTabBtn.style.border = usersActive ? "none" : "";
  }
  if (userGroupsTabBtn) {
    userGroupsTabBtn.style.background = usersActive ? "" : "#165dff";
    userGroupsTabBtn.style.color = usersActive ? "" : "#fff";
    userGroupsTabBtn.style.border = usersActive ? "" : "none";
  }
  if (usersTabPanel) usersTabPanel.style.display = usersActive ? "" : "none";
  if (userGroupsTabPanel) userGroupsTabPanel.style.display = usersActive ? "none" : "";
  if (addUserBtn) addUserBtn.style.display = usersActive ? "" : "none";
  if (addUserGroupBtn) addUserGroupBtn.style.display = usersActive ? "none" : "";
  if (routeMode === "push" || routeMode === "replace") {
    updateRouteQuery({ main: "users", usersTab: userManageActiveTab }, routeMode === "replace");
  }
};

const loadUserGroups = async () => {
  const res = await request("/api/user-groups");
  if (!res.ok) {
    throw new Error("用户组加载失败");
  }
  userGroupsData = await res.json();
  renderUserGroups();
  renderUserGroupSingleSelect();
};

const loadUsers = async () => {
  try {
    const [usersRes] = await Promise.all([request("/api/users"), loadUserGroups()]);
    usersData = await usersRes.json();
    renderUsers();
    renderPermissions();
    setUserManageTab(userManageActiveTab);
  } catch (e) {
    console.error(e);
    // if 403, maybe show empty or alert
  }
};

const renderUsers = () => {
  const tbody = document.querySelector("#usersTable tbody");
  if (!tbody) return;
  const sortedUsers = getSortedUsersByTable("users");
  const usersPagination = renderAdminTablePagination({
    total: sortedUsers.length,
    page: state.usersPage,
    pageSize: state.usersPageSize,
    summaryEl: usersPaginationSummaryEl,
    pageInfoEl: usersPageInfoEl,
    prevBtn: usersPrevPageBtn,
    nextBtn: usersNextPageBtn,
    pageSizeSelect: usersPageSizeSelect
  });
  state.usersPage = usersPagination.page;
  tbody.innerHTML = sortedUsers.slice(usersPagination.startIndex, usersPagination.endIndex).map(u => {
    const deleteBtn = u.role === "admin" ? "" : `<button class="btn-sm danger" onclick="deleteUser(${u.id})">删除</button>`;
    return `
      <tr>
        <td>${u.id}</td>
        <td>
          <img src="${u.avatar || 'https://ui-avatars.com/api/?name=' + u.username + '&background=random'}" 
               style="width:28px; height:28px; position:absolute;margin-top:-14px; border-radius:10px; object-fit:cover;">
        </td>
        <td>${u.username}</td>
        <td>${u.name || "-"}</td>
        <td>${u.role === 'admin' ? '<span style="color:#165dff">管理员</span>' : '普通用户'}</td>
        <td>${(u.groupNames || []).length > 0 ? u.groupNames.join("、") : "-"}</td>
        <td>${u.phone || "-"}</td>
        <td>${formatSize(u.used)}</td>
        <td>
          <button class="btn-sm" onclick="editUser(${u.id})">编辑</button>
          ${deleteBtn}
        </td>
      </tr>
    `;
  }).join("");
};

const renderPermissions = () => {
  const tbody = document.querySelector("#permsTable tbody");
  if (!tbody) return;
  const searchInput = document.getElementById("permsSearchInput");
  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : "";
  let filteredUsers = getSortedUsersByTable("permissions");
  if (keyword) {
    filteredUsers = filteredUsers.filter(u =>
      (u.username && u.username.toLowerCase().includes(keyword)) ||
      (u.name && u.name.toLowerCase().includes(keyword))
    );
  }
  const permsPagination = renderAdminTablePagination({
    total: filteredUsers.length,
    page: state.permissionsPage,
    pageSize: state.permissionsPageSize,
    summaryEl: permsPaginationSummaryEl,
    pageInfoEl: permsPageInfoEl,
    prevBtn: permsPrevPageBtn,
    nextBtn: permsNextPageBtn,
    pageSizeSelect: permsPageSizeSelect
  });
  state.permissionsPage = permsPagination.page;
  tbody.innerHTML = filteredUsers.slice(permsPagination.startIndex, permsPagination.endIndex).map(u => {
    const perms = u.effectivePermissions || u.permissions || [];
    const groupNames = u.groupNames && u.groupNames.length > 0 ? u.groupNames.join(", ") : "-";
    const checks = ALL_PERMISSIONS.map(p => `
      <td>${perms.includes(p) ? '<i class="fa-solid fa-check" style="color: #18b377"></i>' : '<i class="fa-solid fa-xmark" style="color: #f53f3f"></i>'}</td>
    `).join("");

    return `
      <tr>
        <td>${u.id}</td>
        <td>${u.username} (${u.name || "-"}) / ${groupNames}</td>
        ${checks}
      </tr>
    `;
  }).join("");
};

const ALL_PERMISSIONS = FILE_PERMISSION_KEYS.slice();
const PERMISSION_LABELS = {
  upload: "上传",
  download: "下载",
  rename: "重命名",
  delete: "删除",
  move: "移动",
  copy: "复制",
  extract: "解压",
  viewArchive: "查看压缩包"
};
let userModalMode = "full";
let currentUserGroupIds = [];
const quotaGbInput = document.getElementById("quotaGb");
const quotaUnlimitedInput = document.getElementById("quotaUnlimited");
const quotaUnitInput = document.getElementById("quotaUnit");
const QUOTA_UNIT_BYTES = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024
};

const renderPermissionInputs = () => {
  const container = document.getElementById("permissionsInputs");
  if (!container || container.childElementCount > 0) return;
  container.innerHTML = ALL_PERMISSIONS.map(p => {
    if (p === "extract" || p === "viewArchive") {
      // 这两个是自动管理的权限，显示为只读
      return `
        <label style="display:flex; align-items:center; gap:6px; cursor:not-allowed; opacity:0.7;">
          <input type="checkbox" value="${p}" class="perm-checkbox" disabled />
          <span>${PERMISSION_LABELS[p]}</span>
          <span style="font-size:12px;color:#666;margin-left:6px;">(自动)</span>
        </label>
      `;
    } else {
      return `
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" value="${p}" class="perm-checkbox" />
          <span>${PERMISSION_LABELS[p]}</span>
        </label>
      `;
    }
  }).join("");
};

const setPermissionSelections = (permissions = []) => {
  const selected = new Set(permissions);
  document.querySelectorAll(".perm-checkbox").forEach(el => {
    el.checked = selected.has(el.value);
  });
};

const getPermissionSelections = () => {
  const allPermissions = Array.from(document.querySelectorAll(".perm-checkbox:checked")).map(el => el.value);
  // 过滤掉自动管理的权限
  return allPermissions.filter(p => p !== "extract" && p !== "viewArchive");
};

const normalizeUserGroupIds = (ids = []) => {
  const seen = new Set();
  return (ids || []).map((item) => Number(item)).filter((item) => {
    if (!Number.isFinite(item) || item <= 0 || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
};

const renderUserGroupSingleSelect = (selectedId = null) => {
  const select = document.getElementById("userGroupSingleSelect");
  if (!select) return;
  const id = selectedId !== null && selectedId !== undefined ? Number(selectedId) : null;
  select.innerHTML = userGroupsData.map((group) => {
    const selected = Number(group.id) === id ? "selected" : "";
    return `<option value="${group.id}" ${selected}>${escapeHtml(group.name || `用户组${group.id}`)}</option>`;
  }).join("");
};

const getSelectedUserGroupId = () => {
  const select = document.getElementById("userGroupSingleSelect");
  if (!select) return null;
  const val = Number(select.value);
  return Number.isFinite(val) && val > 0 ? val : null;
};

const setUserModalMode = (mode) => {
  userModalMode = mode;
  const isPermissionMode = mode === "permissions";
  const isQuotaMode = mode === "quota";
  const hiddenGroupIds = isPermissionMode
    ? ["fullnameGroup", "phoneGroup", "passwordGroup", "roleGroup", "avatarGroup", "quotaGroup", "userGroupsGroup"]
    : isQuotaMode
      ? ["fullnameGroup", "phoneGroup", "passwordGroup", "roleGroup", "avatarGroup", "permissionsGroup", "userGroupsGroup"]
      : [];
  ["fullnameGroup", "phoneGroup", "passwordGroup", "roleGroup", "avatarGroup", "quotaGroup", "permissionsGroup", "userGroupsGroup"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = hiddenGroupIds.includes(id) ? "none" : "";
  });
  const permissionsGroup = document.getElementById("permissionsGroup");
  if (permissionsGroup) permissionsGroup.style.display = isPermissionMode ? "" : "none";
};

const setQuotaInputs = (quota = -1, userGroupIds = []) => {
  if (!quotaGbInput || !quotaUnlimitedInput || !quotaUnitInput) return;
  
  const quotaUnlimitedLabel = document.getElementById("quotaUnlimitedLabel");
  const hasUserGroup = Array.isArray(userGroupIds) && userGroupIds.length > 0;
  
  // 如果配额为 -1，表示使用默认限制（用户组配额）
  if (Number(quota) === -1) {
    quotaUnlimitedInput.checked = true;
    quotaGbInput.value = "";
    quotaGbInput.disabled = true;
    quotaUnitInput.value = "GB";
    quotaUnitInput.disabled = true;
    quotaUnitInput.dataset.prevUnit = "GB";
    if (quotaUnlimitedLabel) {
      quotaUnlimitedLabel.textContent = hasUserGroup ? "使用默认限制" : "不限制";
    }
    return;
  }
  
  // 否则使用自定义配额
  const numericQuota = Number(quota);
  let unit = "GB";
  let unitBytes = QUOTA_UNIT_BYTES.GB;
  if (numericQuota > 0 && numericQuota < QUOTA_UNIT_BYTES.MB) {
    unit = "KB";
    unitBytes = QUOTA_UNIT_BYTES.KB;
  } else if (numericQuota > 0 && numericQuota < QUOTA_UNIT_BYTES.GB) {
    unit = "MB";
    unitBytes = QUOTA_UNIT_BYTES.MB;
  } else if (numericQuota >= QUOTA_UNIT_BYTES.TB) {
    unit = "TB";
    unitBytes = QUOTA_UNIT_BYTES.TB;
  }
  quotaUnlimitedInput.checked = false;
  quotaGbInput.disabled = false;
  quotaUnitInput.disabled = false;
  quotaUnitInput.value = unit;
  quotaUnitInput.dataset.prevUnit = unit;
  quotaGbInput.value = (numericQuota / unitBytes).toFixed(2).replace(/\.?0+$/, "");
  if (quotaUnlimitedLabel) {
    quotaUnlimitedLabel.textContent = "自定义配额";
  }
};

const getQuotaValue = async () => {
  if (!quotaGbInput || !quotaUnlimitedInput || !quotaUnitInput) return -1;
  if (quotaUnlimitedInput.checked) {
    // 勾选"使用默认限制"时，查询用户组的配额
    if (currentUserGroupIds && currentUserGroupIds.length > 0) {
      try {
        const res = await request(`/api/user-groups`);
        const groups = await res.json();
        const userGroups = groups.filter(g => currentUserGroupIds.includes(g.id));
        
        // 取用户组的最小配额
        let minQuota = -1;
        userGroups.forEach(group => {
          const quota = Number(group.quotaBytes || -1);
          if (quota === -1) {
            minQuota = -1; // 有一个组不限制，则返回 -1
          } else if (quota > 0 && (minQuota === -1 || quota < minQuota)) {
            minQuota = quota;
          }
        });
        return minQuota;
      } catch (e) {
        return -1;
      }
    }
    return -1;
  }
  const value = Number(quotaGbInput.value);
  const unitBytes = QUOTA_UNIT_BYTES[quotaUnitInput.value] || QUOTA_UNIT_BYTES.GB;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * unitBytes);
};

if (quotaUnlimitedInput && quotaGbInput && quotaUnitInput) {
  quotaUnlimitedInput.onchange = () => {
    const hasUserGroup = currentUserGroupIds && currentUserGroupIds.length > 0;
    const quotaUnlimitedLabel = document.getElementById("quotaUnlimitedLabel");
    
    if (quotaUnlimitedInput.checked) {
      // 勾选：使用默认限制
      quotaGbInput.disabled = true;
      quotaUnitInput.disabled = true;
      quotaGbInput.value = "";
      if (quotaUnlimitedLabel) {
        quotaUnlimitedLabel.textContent = hasUserGroup ? "使用默认限制" : "不限制";
      }
    } else {
      // 不勾选：自定义配额，必须输入大于 0 的值
      quotaGbInput.disabled = false;
      quotaUnitInput.disabled = false;
      quotaGbInput.value = "";
      quotaGbInput.focus();
      if (quotaUnlimitedLabel) {
        quotaUnlimitedLabel.textContent = "自定义配额";
      }
    }
  };
  quotaUnitInput.onchange = () => {
    if (quotaUnlimitedInput.checked) return;
    const currentValue = Number(quotaGbInput.value);
    if (!Number.isFinite(currentValue) || currentValue < 0) return;
    const previousUnit = quotaUnitInput.dataset.prevUnit || "GB";
    const previousUnitBytes = QUOTA_UNIT_BYTES[previousUnit] || QUOTA_UNIT_BYTES.GB;
    const currentUnitBytes = QUOTA_UNIT_BYTES[quotaUnitInput.value] || QUOTA_UNIT_BYTES.GB;
    const bytes = currentValue * previousUnitBytes;
    quotaGbInput.value = (bytes / currentUnitBytes).toFixed(2).replace(/\.?0+$/, "");
    quotaUnitInput.dataset.prevUnit = quotaUnitInput.value;
  };
}

const openUserModal = (id, mode = "full") => {
  const user = usersData.find(u => u.id === id);
  if (!user) return;
  renderPermissionInputs();
  setUserModalMode(mode);
  
  // 保存当前用户组 ID
  currentUserGroupIds = user.groupIds || [];
  
  document.getElementById("userModalTitle").textContent = mode === "permissions" ? "配置权限" : mode === "quota" ? "调整空间配额" : "编辑用户";
  document.getElementById("userId").value = user.id;
  document.getElementById("username").value = user.username;
  document.getElementById("username").disabled = true; // Cannot change username
  document.getElementById("fullname").value = user.name || "";
  document.getElementById("phone").value = user.phone || "";
  document.getElementById("password").value = "";
  setPermissionSelections(user.permissions || []);
  renderUserGroupSingleSelect(user.groupIds && user.groupIds.length > 0 ? user.groupIds[0] : null);
  
  const roleSelect = document.getElementById("role");
  if (roleSelect) {
    roleSelect.value = user.role || "user";
    if (user.id === 1) {
       roleSelect.disabled = true;
       roleSelect.title = "默认管理员角色不可更改";
    } else {
       roleSelect.disabled = false;
       roleSelect.title = "";
    }
  }

  // Set Avatar
  const avatarUrl = user.avatar || "";
  const avatarInput = document.getElementById("avatarUrl");
  const avatarPreview = document.getElementById("avatarPreview");
  if (avatarInput) avatarInput.value = avatarUrl;
  if (avatarPreview) avatarPreview.src = avatarUrl || `https://ui-avatars.com/api/?name=${user.username}&background=random`;
  setQuotaInputs(user.quota, currentUserGroupIds);
  
  document.getElementById("userModal").style.display = "flex";
};

window.editUser = (id) => {
  openUserModal(id, "full");
};

window.editUserPermissions = (id) => {
  openUserModal(id, "permissions");
};

window.editUserQuota = (id) => {
  openUserModal(id, "quota");
};

window.deleteUser = async (id) => {
  const confirmed = await showDeleteConfirm({
    title: "确定删除",
    message: "确定删除该用户吗？其所有文件也将被删除！",
    desc: "删除后将无法恢复，请谨慎操作",
    okText: "删除",
    cancelText: "取消"
  });
  if (!confirmed) return;
  try {
    const res = await request(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) loadUsers();
  } catch(e) { alert(e.message); }
};

document.getElementById("addUserBtn").onclick = () => {
  renderPermissionInputs();
  setUserModalMode("full");
  document.getElementById("userModalTitle").textContent = "新建用户";
  document.getElementById("userForm").reset();
  document.getElementById("userId").value = "";
  document.getElementById("username").disabled = false;
  setPermissionSelections(ALL_PERMISSIONS);
  
  // 默认选择 user 用户组（ID 为 3）
  let userGroupId = userGroupsData.find(g => Number(g.id) === 3)?.id;
  if (!userGroupId) {
    // 如果找不到 id=3 的组，尝试找 name 为 "user" 的组
    userGroupId = userGroupsData.find(g => g.name === "user")?.id || null;
  }
  renderUserGroupSingleSelect(userGroupId);
  
  // 默认空间配额 100GB
  setQuotaInputs(100 * 1024 * 1024 * 1024);
  if (quotaUnitInput) quotaUnitInput.dataset.prevUnit = quotaUnitInput.value;
  
  const roleSelect = document.getElementById("role");
  if (roleSelect) {
     roleSelect.disabled = false;
     roleSelect.value = "user";
  }

  // Reset Avatar Preview
  const avatarPreview = document.getElementById("avatarPreview");
  if (avatarPreview) avatarPreview.src = "https://ui-avatars.com/api/?name=User&background=random";
  
  document.getElementById("userModal").style.display = "flex";
};

document.getElementById("userForm").onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById("userId").value;
  const username = document.getElementById("username").value;
  const name = document.getElementById("fullname").value;
  const phone = document.getElementById("phone").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role") ? document.getElementById("role").value : "user";
  const avatar = document.getElementById("avatarUrl") ? document.getElementById("avatarUrl").value : "";
  const permissions = getPermissionSelections();
  const groupId = getSelectedUserGroupId();
  const groupIds = groupId !== null ? [groupId] : [];
  let body = {};
  let url = "";
  let method = "";

  if (userModalMode === "permissions") {
    if (!id) return;
    body = { permissions };
    url = `/api/users/${id}`;
    method = "PUT";
  } else if (userModalMode === "quota") {
    if (!id) return;
    const quota = await getQuotaValue();
    if (quota === null) {
      alert("请输入正确的空间配额");
      return;
    }
    body = { quota };
    url = `/api/users/${id}`;
    method = "PUT";
  } else {
    const quota = await getQuotaValue();
    if (quota === null) {
      alert("请输入正确的空间配额");
      return;
    }
    if (password && String(password).length < 6) {
      alert("密码至少6位");
      return;
    }
    body = { username, name, phone, quota, role, avatar, groupIds };
    if (password) body.password = password;
    url = id ? `/api/users/${id}` : "/api/users";
    method = id ? "PUT" : "POST";
  }
  
  try {
    const res = await request(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      document.getElementById("userModal").style.display = "none";
      await loadUsers();
      if (userModalMode === "quota") renderQuotaTable();
    } else {
      const data = await res.json();
      alert(data.message || "操作失败");
    }
  } catch(e) { alert("操作失败"); }
};

const renderUserGroupPermissionInputs = () => {
  const container = document.getElementById("userGroupPermissionsInputs");
  if (!container) return;
  container.innerHTML = ALL_PERMISSIONS.map((permission) => {
    return `
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" value="${permission}" class="group-perm-checkbox" checked />
        <span>${PERMISSION_LABELS[permission]}</span>
      </label>
    `;
  }).join("");
};

const setUserGroupPermissionSelections = (permissions = []) => {
  const selected = new Set(permissions);
  document.querySelectorAll(".group-perm-checkbox").forEach((item) => {
    item.checked = selected.has(item.value);
  });
};

const getUserGroupPermissionSelections = () => {
  const allPermissions = Array.from(document.querySelectorAll(".group-perm-checkbox:checked")).map((item) => item.value);
  return allPermissions;
};

const setUserGroupMaxUploadLimit = (maxUploadSizeGb) => {
  const sizeInput = document.getElementById("userGroupMaxUploadSize");
  const unlimitedInput = document.getElementById("userGroupMaxUploadUnlimited");
  if (!sizeInput || !unlimitedInput) return;
  const numeric = Number(maxUploadSizeGb);
  if (Number.isFinite(numeric) && numeric > 0) {
    unlimitedInput.checked = false;
    sizeInput.disabled = false;
    sizeInput.value = String(Math.floor(numeric));
    return;
  }
  unlimitedInput.checked = true;
  sizeInput.value = "";
  sizeInput.disabled = true;
};

const getUserGroupMaxUploadLimitPayload = () => {
  const sizeInput = document.getElementById("userGroupMaxUploadSize");
  const unlimitedInput = document.getElementById("userGroupMaxUploadUnlimited");
  if (!sizeInput || !unlimitedInput) return -1;
  if (unlimitedInput.checked) return -1;
  const value = Math.floor(Number(sizeInput.value || 0));
  if (!Number.isFinite(value) || value <= 0) return -1;
  return Math.max(1, Math.min(100, value));
};

const setUserGroupMaxUploadFileCountLimit = (maxUploadFileCount) => {
  const countInput = document.getElementById("userGroupMaxUploadFileCount");
  const unlimitedInput = document.getElementById("userGroupMaxUploadFileCountUnlimited");
  if (!countInput || !unlimitedInput) return;
  const numeric = Number(maxUploadFileCount);
  if (Number.isFinite(numeric) && numeric > 0) {
    unlimitedInput.checked = false;
    countInput.disabled = false;
    countInput.value = String(Math.floor(numeric));
    return;
  }
  unlimitedInput.checked = true;
  countInput.value = "";
  countInput.disabled = true;
};

const getUserGroupMaxUploadFileCountPayload = () => {
  const countInput = document.getElementById("userGroupMaxUploadFileCount");
  const unlimitedInput = document.getElementById("userGroupMaxUploadFileCountUnlimited");
  if (!countInput || !unlimitedInput) return -1;
  if (unlimitedInput.checked) return -1;
  const value = Math.floor(Number(countInput.value || 0));
  if (!Number.isFinite(value) || value <= 0) return -1;
  return Math.max(1, Math.min(1000, value));
};

const setUserGroupQuota = (quotaBytes = -1) => {
  const quotaInput = document.getElementById("userGroupQuotaGb");
  const unitInput = document.getElementById("userGroupQuotaUnit");
  const unlimitedInput = document.getElementById("userGroupQuotaUnlimited");
  if (!quotaInput || !unitInput || !unlimitedInput) return;
  
  if (Number(quotaBytes) === -1) {
    unlimitedInput.checked = true;
    quotaInput.value = "";
    quotaInput.disabled = true;
    unitInput.value = "GB";
    unitInput.disabled = true;
    unitInput.dataset.prevUnit = "GB";
    return;
  }
  
  const numericQuota = Number(quotaBytes);
  let unit = "GB";
  let unitBytes = QUOTA_UNIT_BYTES.GB;
  if (numericQuota > 0 && numericQuota < QUOTA_UNIT_BYTES.MB) {
    unit = "KB";
    unitBytes = QUOTA_UNIT_BYTES.KB;
  } else if (numericQuota > 0 && numericQuota < QUOTA_UNIT_BYTES.GB) {
    unit = "MB";
    unitBytes = QUOTA_UNIT_BYTES.MB;
  } else if (numericQuota >= QUOTA_UNIT_BYTES.TB) {
    unit = "TB";
    unitBytes = QUOTA_UNIT_BYTES.TB;
  }
  
  unlimitedInput.checked = false;
  quotaInput.disabled = false;
  unitInput.disabled = false;
  unitInput.value = unit;
  unitInput.dataset.prevUnit = unit;
  quotaInput.value = (numericQuota / unitBytes).toFixed(2).replace(/\.?0+$/, "");
};

const getUserGroupQuotaPayload = () => {
  const quotaInput = document.getElementById("userGroupQuotaGb");
  const unitInput = document.getElementById("userGroupQuotaUnit");
  const unlimitedInput = document.getElementById("userGroupQuotaUnlimited");
  if (!quotaInput || !unitInput || !unlimitedInput) return -1;
  
  if (unlimitedInput.checked) return -1;
  const value = Number(quotaInput.value);
  const unitBytes = QUOTA_UNIT_BYTES[unitInput.value] || QUOTA_UNIT_BYTES.GB;
  if (!Number.isFinite(value) || value < 0) return -1;
  return Math.round(value * unitBytes);
};

const openUserGroupModal = (groupId) => {
  renderUserGroupPermissionInputs();
  const modal = document.getElementById("userGroupModal");
  const titleEl = document.getElementById("userGroupModalTitle");
  const idInput = document.getElementById("userGroupId");
  const nameInput = document.getElementById("userGroupName");
  if (!modal || !titleEl || !idInput || !nameInput) return;
  if (!groupId) {
    titleEl.textContent = "新建用户组";
    idInput.value = "";
    nameInput.value = "";
    setUserGroupPermissionSelections(ALL_PERMISSIONS);
    setUserGroupMaxUploadLimit(null);
    setUserGroupMaxUploadFileCountLimit(null);
    setUserGroupQuota(-1);
  } else {
    const group = userGroupsData.find((item) => Number(item.id) === Number(groupId));
    if (!group) return;
    titleEl.textContent = "编辑用户组";
    idInput.value = String(group.id);
    nameInput.value = group.name || "";
    setUserGroupPermissionSelections(group.permissions || []);
    setUserGroupMaxUploadLimit(group.maxUploadSizeGb);
    setUserGroupMaxUploadFileCountLimit(group.maxUploadFileCount);
    setUserGroupQuota(group.quotaBytes);
  }
  modal.style.display = "flex";
};

const renderUserGroups = () => {
  const tbody = document.querySelector("#userGroupsTable tbody");
  if (!tbody) return;
  const userGroupsPagination = renderAdminTablePagination({
    total: userGroupsData.length,
    page: state.userGroupsPage,
    pageSize: state.userGroupsPageSize,
    summaryEl: userGroupsPaginationSummaryEl,
    pageInfoEl: userGroupsPageInfoEl,
    prevBtn: userGroupsPrevPageBtn,
    nextBtn: userGroupsNextPageBtn,
    pageSizeSelect: userGroupsPageSizeSelect
  });
  state.userGroupsPage = userGroupsPagination.page;
  tbody.innerHTML = userGroupsData.slice(userGroupsPagination.startIndex, userGroupsPagination.endIndex).map((group) => {
    const quotaBytes = Number(group.quotaBytes || -1);
    const quotaText = quotaBytes === -1 ? "不限制" : formatSize(quotaBytes);
    
    return `
    <tr>
      <td>${group.id}</td>
      <td>${escapeHtml(group.name || "-")}</td>
      <td>${quotaText}</td>
      <td>${Number(group.maxUploadSizeGb || 0) > 0 ? `${Number(group.maxUploadSizeGb)}GB` : "不限制"}</td>
      <td>${Number(group.maxUploadFileCount || 0) > 0 ? `${Number(group.maxUploadFileCount)}个` : "不限制"}</td>
      <td>${(group.permissions || []).map((item) => PERMISSION_LABELS[item] || item).join("、") || "-"}</td>
      <td>${Number(group.memberCount || 0)}</td>
      <td>
        <button class="btn-sm" onclick="editUserGroup(${group.id})">编辑</button>
        <button class="btn-sm danger" onclick="deleteUserGroup(${group.id})">删除</button>
      </td>
    </tr>
  `;
  }).join("");
};

window.editUserGroup = (id) => {
  openUserGroupModal(id);
};

window.deleteUserGroup = async (id) => {
  const confirmed = await showDeleteConfirm({
    title: "确定删除",
    message: "确定删除该用户组吗？",
    desc: "删除后成员将解除绑定",
    okText: "删除",
    cancelText: "取消"
  });
  if (!confirmed) return;
  try {
    const res = await request(`/api/user-groups/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || "删除失败");
      return;
    }
    await loadUsers();
  } catch (e) {
    alert("删除失败");
  }
};

const addUserGroupBtn = document.getElementById("addUserGroupBtn");
if (addUserGroupBtn) {
  addUserGroupBtn.onclick = () => {
    openUserGroupModal();
  };
}
const userGroupAddBtn = document.getElementById("userGroupAddBtn");
if (userGroupAddBtn) {
  userGroupAddBtn.onclick = () => {
  };
}

const usersTabBtn = document.getElementById("usersTabBtn");
if (usersTabBtn) {
  usersTabBtn.onclick = () => setUserManageTab("users", "push");
}
const userGroupsTabBtn = document.getElementById("userGroupsTabBtn");
if (userGroupsTabBtn) {
  userGroupsTabBtn.onclick = () => setUserManageTab("groups", "push");
}
setUserManageTab("users");

const userGroupForm = document.getElementById("userGroupForm");
if (userGroupForm) {
  userGroupForm.onsubmit = async (event) => {
    event.preventDefault();
    const id = Number((document.getElementById("userGroupId") || {}).value || 0);
    const name = (document.getElementById("userGroupName") || {}).value || "";
    const permissions = getUserGroupPermissionSelections();
    const maxUploadSizeGb = getUserGroupMaxUploadLimitPayload();
    const maxUploadFileCount = getUserGroupMaxUploadFileCountPayload();
    const quotaBytes = getUserGroupQuotaPayload();
    const payload = { name, permissions, maxUploadSizeGb, maxUploadFileCount, quotaBytes };
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/user-groups/${id}` : "/api/user-groups";
    try {
      const res = await request(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "保存失败");
        return;
      }
      const modal = document.getElementById("userGroupModal");
      if (modal) modal.style.display = "none";
      await loadUsers();
    } catch (e) {
      alert("保存失败");
    }
  };
}

const userGroupMaxUploadUnlimitedInput = document.getElementById("userGroupMaxUploadUnlimited");
const userGroupMaxUploadSizeInput = document.getElementById("userGroupMaxUploadSize");
if (userGroupMaxUploadUnlimitedInput && userGroupMaxUploadSizeInput) {
  userGroupMaxUploadUnlimitedInput.onchange = () => {
    userGroupMaxUploadSizeInput.disabled = userGroupMaxUploadUnlimitedInput.checked;
    if (userGroupMaxUploadUnlimitedInput.checked) {
      userGroupMaxUploadSizeInput.value = "";
    }
  };
}

const userGroupMaxUploadFileCountUnlimitedInput = document.getElementById("userGroupMaxUploadFileCountUnlimited");
const userGroupMaxUploadFileCountInput = document.getElementById("userGroupMaxUploadFileCount");
if (userGroupMaxUploadFileCountUnlimitedInput && userGroupMaxUploadFileCountInput) {
  userGroupMaxUploadFileCountUnlimitedInput.onchange = () => {
    userGroupMaxUploadFileCountInput.disabled = userGroupMaxUploadFileCountUnlimitedInput.checked;
    if (userGroupMaxUploadFileCountUnlimitedInput.checked) {
      userGroupMaxUploadFileCountInput.value = "";
    }
  };
}

// 用户组配额输入框事件处理
const userGroupQuotaUnlimitedInput = document.getElementById("userGroupQuotaUnlimited");
const userGroupQuotaInput = document.getElementById("userGroupQuotaGb");
const userGroupQuotaUnitInput = document.getElementById("userGroupQuotaUnit");
if (userGroupQuotaUnlimitedInput && userGroupQuotaInput && userGroupQuotaUnitInput) {
  userGroupQuotaUnlimitedInput.onchange = () => {
    userGroupQuotaInput.disabled = userGroupQuotaUnlimitedInput.checked;
    userGroupQuotaUnitInput.disabled = userGroupQuotaUnlimitedInput.checked;
    if (userGroupQuotaUnlimitedInput.checked) {
      userGroupQuotaInput.value = "";
    }
  };
  userGroupQuotaUnitInput.onchange = () => {
    if (userGroupQuotaUnlimitedInput.checked) return;
    const currentValue = Number(userGroupQuotaInput.value);
    if (!Number.isFinite(currentValue) || currentValue < 0) return;
    const previousUnit = userGroupQuotaUnitInput.dataset.prevUnit || "GB";
    const previousUnitBytes = QUOTA_UNIT_BYTES[previousUnit] || QUOTA_UNIT_BYTES.GB;
    const currentUnitBytes = QUOTA_UNIT_BYTES[userGroupQuotaUnitInput.value] || QUOTA_UNIT_BYTES.GB;
    const bytes = currentValue * previousUnitBytes;
    userGroupQuotaInput.value = (bytes / currentUnitBytes).toFixed(2).replace(/\.?0+$/, "");
    userGroupQuotaUnitInput.dataset.prevUnit = userGroupQuotaUnitInput.value;
  };
}

