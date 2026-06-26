// User Management
const getPermissionSourceText = (source) => {
  if (source === "user") return "用户";
  if (source === "group") return "用户组";
  return "默认";
};

const USERS_MENUITEMS = [
  { key: "users", title: "用户", icon: "fa-solid fa-user-group", desc: "管理所有注册用户" },
  { key: "groups", title: "用户组", icon: "fa-solid fa-users-gear", desc: "管理用户组及权限配置" }
];

const renderUsersSidebar = () => {
  const asideList = document.getElementById("usersAsideList");
  if (!asideList) return;
  asideList.innerHTML = USERS_MENUITEMS.map(item => `
    <button type="button" class="settings-menu-item ${userManageActiveTab === item.key ? "active" : ""}" data-users-menu="${item.key}">
      <i class="${item.icon}"></i>
      <span>${item.title}</span>
    </button>
  `).join("");
};

const setUserManageTab = (tab, routeMode = "none") => {
  userManageActiveTab = tab === "groups" ? "groups" : "users";
  const usersTabPanel = document.getElementById("usersTabPanel");
  const userGroupsTabPanel = document.getElementById("userGroupsTabPanel");
  const addUserBtn = document.getElementById("addUserBtn");
  const addUserGroupBtn = document.getElementById("addUserGroupBtn");
  const panelTitle = document.getElementById("usersPanelTitle");
  const panelMeta = document.getElementById("usersPanelMeta");
  const usersActive = userManageActiveTab === "users";
  // 更新侧边栏高亮
  document.querySelectorAll("#usersAsideList .settings-menu-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.usersMenu === userManageActiveTab);
  });
  // 更新面板
  if (usersTabPanel) usersTabPanel.style.display = usersActive ? "flex" : "none";
  if (userGroupsTabPanel) userGroupsTabPanel.style.display = usersActive ? "none" : "flex";
  if (addUserBtn) addUserBtn.style.display = usersActive ? "" : "none";
  if (addUserGroupBtn) addUserGroupBtn.style.display = usersActive ? "none" : "";
  // 更新标题和描述
  const activeItem = USERS_MENUITEMS.find(m => m.key === userManageActiveTab);
  if (panelTitle) panelTitle.textContent = activeItem ? activeItem.title : "用户管理";
  if (panelMeta) panelMeta.textContent = activeItem ? activeItem.desc : "";
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
    setUserManageTab(userManageActiveTab);
  } catch (e) {
    console.error(e);
    // if 403, maybe show empty or alert
  }
};
window.loadUsers = loadUsers; // expose globally for cross-file access

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
    const deleteBtn = u.role === "admin" ? "" : `<button class="btn-sm btn-delete-user danger" onclick="deleteUser(${u.id})"><i class="fas fa-trash-alt"></i> 删除</button>`;
    return `
      <tr>
        <td>${u.id}</td>
        <td>
          <img src="${u.avatar || 'https://ui-avatars.com/api/?name=' + u.username + '&background=random'}" 
               style="width:28px; height:28px; position:absolute;margin-top:-14px; border-radius:10px; object-fit:cover;">
        </td>
        <td>${u.username}</td>
        <td>${u.name || "-"}</td>
        <td>${u.role === 'admin' ? '<span style="color:#00abff">管理员</span>' : '普通用户'}</td>
        <td>${(u.groupNames || []).length > 0 ? u.groupNames.join("、") : "-"}</td>
        <td>${u.phone || "-"}</td>
        <td>${formatSize(u.used)}</td>
        <td style="display: flex; flex-wrap: wrap; gap: 4px;">
          <button class="btn-sm btn-edit-user" onclick="editUser(${u.id})"><i class="fas fa-edit"></i> 编辑</button>
          ${deleteBtn}
        </td>
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
  const hiddenGroupIds = isPermissionMode
    ? ["fullnameGroup", "phoneGroup", "passwordGroup", "roleGroup", "avatarGroup", "userGroupsGroup"]
    : [];
  ["fullnameGroup", "phoneGroup", "passwordGroup", "roleGroup", "avatarGroup", "permissionsGroup", "userGroupsGroup"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = hiddenGroupIds.includes(id) ? "none" : "";
  });
  const permissionsGroup = document.getElementById("permissionsGroup");
  if (permissionsGroup) permissionsGroup.style.display = isPermissionMode ? "" : "none";
};

const openUserModal = async (id, mode = "full") => {
  const user = usersData.find(u => u.id === id);
  if (!user) return;
  renderPermissionInputs();
  setUserModalMode(mode);
  document.getElementById("userModalTitle").textContent = mode === "permissions" ? "配置权限" : "编辑用户";
  document.getElementById("userId").value = user.id;
  document.getElementById("username").value = user.username;
  document.getElementById("username").disabled = true; // Cannot change username
  document.getElementById("fullname").value = user.name || "";
  document.getElementById("phone").value = user.phone || "";
  const pwdInput = document.getElementById("password");
  if (pwdInput) {
    pwdInput.required = false;
    pwdInput.placeholder = "留空则不修改";
    pwdInput.value = "";
  }
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
  const statusEl = document.getElementById("avatarUploadStatus");
  const avatarBtn = document.getElementById("avatarUploadBtn");
  if (avatarInput) avatarInput.value = avatarUrl;
  if (avatarPreview) avatarPreview.src = avatarUrl || `https://ui-avatars.com/api/?name=${user.username}&background=random`;
  if (statusEl) statusEl.textContent = "";
  // 编辑用户时用户名已存在，启用头像按钮
  updateAvatarBtnState();
  
  document.getElementById("userModal").style.display = "flex";
};

window.editUser = (id) => {
  openUserModal(id, "full");
};

window.editUserPermissions = (id) => {
  openUserModal(id, "permissions");
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
  
  const roleSelect = document.getElementById("role");
  if (roleSelect) {
     roleSelect.disabled = false;
     roleSelect.value = "user";
  }

  // 新建用户时密码必填
  const pwdInput = document.getElementById("password");
  if (pwdInput) {
    pwdInput.required = true;
    pwdInput.placeholder = "请输入密码";
  }

  // Reset Avatar Preview
  const avatarPreview = document.getElementById("avatarPreview");
  const statusEl = document.getElementById("avatarUploadStatus");
  if (avatarPreview) avatarPreview.src = "https://ui-avatars.com/api/?name=User&background=random";
  if (statusEl) statusEl.textContent = "";
  updateAvatarBtnState();
  
  document.getElementById("userModal").style.display = "flex";
};

// 头像上传 - 复用现有的更换头像弹窗（支持裁剪、预设）
const setUserAvatarResult = (avatarUrl) => {
  const avatarInput = document.getElementById("avatarUrl");
  const avatarPreview = document.getElementById("avatarPreview");
  const statusEl = document.getElementById("avatarUploadStatus");
  if (avatarInput) avatarInput.value = avatarUrl;
  if (avatarPreview) avatarPreview.src = avatarUrl;
  if (statusEl) statusEl.innerHTML = '<span style="color:#52c41a;"><i class="fa-solid fa-check-circle"></i> 头像已设置</span>';
};

const setAvatar = (url) => {
  setUserAvatarResult(url);
};
// 暴露到全局供 inline onclick 使用
window.setAvatar = setAvatar;

// 头像按钮启用状态跟随用户名输入
const updateAvatarBtnState = () => {
  const username = document.getElementById("username");
  const avatarBtn = document.getElementById("avatarUploadBtn");
  if (!avatarBtn) return;
  const hasUsername = username && username.value.trim().length > 0;
  avatarBtn.disabled = !hasUsername;
  avatarBtn.style.opacity = hasUsername ? "1" : "0.5";
  avatarBtn.style.cursor = hasUsername ? "pointer" : "not-allowed";
};
document.getElementById("username").addEventListener("input", updateAvatarBtnState);

document.getElementById("avatarUploadBtn").onclick = () => {
  const avatarUpdateModal = document.getElementById("avatarUpdateModal");
  if (!avatarUpdateModal) return;
  // 重置裁剪弹窗状态
  const profileAvatarUrlInput = document.getElementById("profileAvatarUrlInput");
  const profileAvatarFileInput = document.getElementById("profileAvatarFileInput");
  const profileAvatarPreview = document.getElementById("profileAvatarPreview");
  if (profileAvatarUrlInput) profileAvatarUrlInput.value = "";
  if (profileAvatarFileInput) profileAvatarFileInput.value = "";
  if (profileAvatarPreview) profileAvatarPreview.src = "https://ui-avatars.com/api/?name=User&background=random";
  if (typeof avatarCropState !== "undefined") {
    avatarCropState.useLocalFile = false;
    if (typeof resetAvatarCropCanvas === "function") {
      resetAvatarCropCanvas("https://ui-avatars.com/api/?name=User&background=random");
    }
  }
  // 标记为用户管理模式
  window._userManagementAvatarMode = true;
  avatarUpdateModal.style.display = "flex";
};

document.querySelectorAll("#avatarGroup [data-avatar-preset]").forEach((el) => {
  el.addEventListener("click", () => {
    setAvatar(el.src);
  });
});

// 取消按钮关闭弹窗时清理标志（不能声明新变量，避免UglifyJS合并let链导致覆盖函数）
(function() {
  const btn = document.getElementById("cancelAvatarUpdateBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      window._userManagementAvatarMode = false;
    });
  }
})();

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
  } else {
    if (password && String(password).length < 6) {
      alert("密码至少6位");
      return;
    }
    body = { username, name, phone, role, avatar, groupIds };
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
      <td style="display: flex; flex-wrap: wrap; gap: 4px;">
        <button class="btn-sm btn-edit-user-group" onclick="editUserGroup(${group.id})">编辑</button>
        <button class="btn-sm btn-delete-user-group danger" onclick="deleteUserGroup(${group.id})">删除</button>
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

// 侧边栏菜单点击事件
const usersAsideList = document.getElementById("usersAsideList");
if (usersAsideList) {
  usersAsideList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-users-menu]");
    if (btn) {
      setUserManageTab(btn.dataset.usersMenu, "push");
    }
  });
}

// 侧边栏折叠/展开
const toggleUsersSidebarBtn = document.getElementById("toggleUsersSidebarBtn");
const usersSidebar = document.getElementById("usersSidebar");
if (toggleUsersSidebarBtn && usersSidebar) {
  toggleUsersSidebarBtn.addEventListener("click", () => {
    usersSidebar.classList.toggle("collapsed");
    const icon = toggleUsersSidebarBtn.querySelector("i");
    if (icon) {
      icon.className = usersSidebar.classList.contains("collapsed") ? "fa-solid fa-angles-right" : "fa-solid fa-angles-left";
    }
  });
}

renderUsersSidebar();
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
