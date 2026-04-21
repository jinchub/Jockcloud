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

const showPlanComparison = () => {
  const modal = document.getElementById("planComparisonModal");
  if (modal) {
    modal.style.display = "flex";
  }
};

const closePlanComparisonModal = () => {
  const modal = document.getElementById("planComparisonModal");
  if (modal) {
    modal.style.display = "none";
  }
};

const loadQuota = async () => {
  try {
    const res = await request("/api/admin/stats");
    const stats = await res.json();
    document.getElementById("totalSpaceDisplay").textContent = formatSize(stats.totalUsed);
    document.getElementById("totalSpaceDisplay").textContent = "不限制";
    document.getElementById("usedSpaceDisplay").textContent = formatSize(stats.totalUsed);
    document.getElementById("userCountDisplay").textContent = stats.userCount;
    
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
    const effectiveQuota = u.effectiveQuota !== undefined ? u.effectiveQuota : u.quota;
    const total = effectiveQuota === -1 ? 0 : effectiveQuota;
    const percentValue = total > 0 ? (used / total) * 100 : 0;
    const percent = total > 0 ? ((used / total) * 100).toFixed(1) + "%" : "-";
    const barColor = percentValue > 95 ? "#f53f3f" : percentValue > 75 ? "#ff7d00" : "#165dff";
    
    return `
      <tr>
        <td>${u.id}</td>
        <td>${u.username} (${u.name || "-"})</td>
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
        <td><button class="btn-sm" onclick="editUserQuota(${u.id})">调整</button></td>
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
      { closeBtn: closeHiddenSpaceBtn, dot: hiddenSpaceDot, resetBtn: resetHiddenSpacePwdBtn },
      (message) => alert(message),
      ask,
      choose,
      openResetDialog
    );
  };
}
