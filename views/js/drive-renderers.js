// Renderers
const renderPath = () => {
  currentPathEl.innerHTML = "";
  if (searchResultSummaryEl) {
    searchResultSummaryEl.style.display = "none";
    searchResultSummaryEl.innerHTML = "";
  }
  
  if (state.view === "recycle") {
    currentPathEl.textContent = "回收站（30天后自动删除）";
    
    // Add "Empty Recycle Bin" button if not exists
    if (hasUserPermission("delete") && !document.getElementById("emptyRecycleBtn")) {
      const btn = document.createElement("span");
      btn.id = "emptyRecycleBtn";
      btn.className = "btn-link";
      btn.style.marginLeft = "20px";
      btn.style.color = "#ffffffff";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "12px";
      btn.style.backgroundColor = "#f53e3e";
      btn.style.padding = "4px 8px";
      btn.style.borderRadius = "24px";
      btn.style.fontWeight = "400";
      btn.innerHTML = '<i class="fa-regular fa-trash-can"></i> 清空回收站';
      btn.onclick = async () => {
        const confirmed = await showDeleteConfirm({
          title: "清空回收站",
          message: "确定清空回收站吗？",
          desc: "清空后将无法恢复"
        });
        if (!confirmed) return;
        const res = await request("/api/recycle", { method: "DELETE" });
        if (res.ok) refreshAll();
      };
      currentPathEl.appendChild(btn);
    }
    return;
  }

  if (state.category) {
    const map = {
      image: "图片",
      doc: "文档",
      video: "视频",
      audio: "音频",
      text: "文本",
      archive: "压缩",
      program: "程序",
      other: "其它"
    };
    currentPathEl.textContent = map[state.category] || "搜索结果";
    return;
  }

  if (state.keyword && searchResultSummaryEl) {
    const label = document.createElement("span");
    label.textContent = "搜索内容：";
    const keywordEl = document.createElement("span");
    keywordEl.className = "search-keyword-highlight";
    keywordEl.textContent = state.keyword;
    const resetBtn = document.createElement("span");
    resetBtn.className = "btn-action";
    resetBtn.style.justifyContent = "center";
    resetBtn.textContent = "重置";
    resetBtn.onclick = () => {
      const targetFolderId = state.searchOriginFolderId;
      clearSelection();
      state.view = "files";
      state.currentFolderId = targetFolderId === undefined ? null : targetFolderId;
      state.category = "";
      state.keyword = "";
      state.searchOriginFolderId = null;
      state.selectedEntry = null;
      if (searchInput) {
        searchInput.value = "";
      }
      updateRouteQuery({ main: "files", side: "myFiles", category: null });
      refreshAll();
    };
    searchResultSummaryEl.appendChild(label);
    searchResultSummaryEl.appendChild(keywordEl);
    searchResultSummaryEl.appendChild(resetBtn);
    searchResultSummaryEl.style.display = "flex";
  }
  
  const createLink = (name, id, iconClass = "") => {
    const span = document.createElement("span");
    span.className = "path-link";
    if (iconClass) {
      const icon = document.createElement("i");
      icon.className = iconClass;
      icon.style.marginRight = "6px";
      span.appendChild(icon);
    }
    span.appendChild(document.createTextNode(name));
    span.onclick = () => {
      clearSelection();
      state.currentFolderId = id;
      state.keyword = "";
      state.searchOriginFolderId = null;
      state.selectedEntry = null;
      refreshAll();
    };
    return span;
  };

  if (state.path.length === 0) {
    currentPathEl.innerHTML = `<i class="fa-solid fa-house" style="margin-right:6px;"></i>${getRootLabelBySpace()}`;
  } else {
    currentPathEl.appendChild(createLink(getRootLabelBySpace(), null, "fa-solid fa-house"));
    state.path.forEach((item, index) => {
      const sep = document.createElement("span");
      sep.textContent = " > ";
      sep.style.color = "#8a8f99";
      currentPathEl.appendChild(sep);
      
      if (index === state.path.length - 1) {
        const last = document.createElement("span");
        last.textContent = item.name;
        currentPathEl.appendChild(last);
      } else {
        currentPathEl.appendChild(createLink(item.name, item.id));
      }
    });
  }
};

const getFileIcon = (entry) => {
  if (entry.type === "folder") return "fa-solid fa-folder file-folder";
  
  const name = entry.name.toLowerCase();
  if (name.endsWith(".psd")) {
    return "file-psd";
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".gif") || name.endsWith(".bmp") || name.endsWith(".webp")) {
    return "fa-solid fa-image file-image";
  }
  if (name.endsWith(".mp4") || name.endsWith(".mkv") || name.endsWith(".avi") || name.endsWith(".mov")) {
    return "fa-solid fa-film file-video";
  }
  if (name.endsWith(".mp3") || name.endsWith(".wav") || name.endsWith(".flac") || name.endsWith(".m4a")) {
    return "fa-solid fa-music file-audio";
  }
  if (name.endsWith(".pdf")) {
    return "fa-solid fa-file-pdf file-pdf";
  }
  if (name.endsWith(".doc") || name.endsWith(".docx")) {
    return "fa-solid fa-file-word file-word";
  }
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
    return "fa-solid fa-file-excel file-excel";
  }
  if (name.endsWith(".ppt") || name.endsWith(".pptx")) {
    return "fa-solid fa-file-powerpoint file-ppt";
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return "fa-solid fa-file-lines file-text";
  }
  if (name.endsWith(".zip") || name.endsWith(".rar") || name.endsWith(".7z") || name.endsWith(".tar") || name.endsWith(".gz")) {
    return "fa-solid fa-file-zipper file-zip";
  }
  if (name.endsWith(".exe") || name.endsWith(".msi") || name.endsWith(".bat") || name.endsWith(".cmd") || name.endsWith(".com")) {
    return "fa-brands fa-windows file-program";
  }
  if (name.endsWith(".ttf") || name.endsWith(".otf") || name.endsWith(".woff") || name.endsWith(".woff2")) {
    return "fa-solid fa-font file-font";
  }
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return "fa-brands fa-html5 file-code-html";
  }
  if (name.endsWith(".css") || name.endsWith(".scss") || name.endsWith(".less")) {
    return "fa-brands fa-css3-alt file-code-css";
  }
  if (name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs")) {
    return "fa-brands fa-js file-code-js";
  }
  if (name.endsWith(".ts") || name.endsWith(".tsx")) {
    return "fa-solid fa-code file-code-ts";
  }
  if (name.endsWith(".jsx")) {
    return "fa-brands fa-react file-code-react";
  }
  if (name.endsWith(".vue")) {
    return "fa-brands fa-vuejs file-code-vue";
  }
  if (name.endsWith(".json")) {
    return "fa-solid fa-code file-code-json";
  }
  if (name.endsWith(".py")) {
    return "fa-brands fa-python file-code-py";
  }
  if (name.endsWith(".java")) {
    return "fa-brands fa-java file-code-java";
  }
  if (name.endsWith(".php")) {
    return "fa-brands fa-php file-code-php";
  }
  if (name.endsWith(".sql")) {
    return "fa-solid fa-database file-code-sql";
  }
  if (name.endsWith(".sh") || name.endsWith(".bash") || name.endsWith(".zsh") || name.endsWith(".bat") || name.endsWith(".ps1")) {
    return "fa-solid fa-terminal file-code-shell";
  }
  if (name.endsWith(".xml")) {
    return "fa-solid fa-code file-code-xml";
  }
  if (name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".toml") || name.endsWith(".ini")) {
    return "fa-solid fa-sliders file-code-config";
  }
  if (name.endsWith(".c") || name.endsWith(".cpp") || name.endsWith(".cc") || name.endsWith(".h") || name.endsWith(".hpp")) {
    return "fa-solid fa-microchip file-code-cpp";
  }
  if (name.endsWith(".cs")) {
    return "fa-solid fa-hashtag file-code-cs";
  }
  if (name.endsWith(".go") || name.endsWith(".rs") || name.endsWith(".swift") || name.endsWith(".kt")) {
    return "fa-solid fa-file-code file-code";
  }
  return "fa-solid fa-file file-default";
};

const IMAGE_THUMB_EXT_SET = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "avif", "apng", "jfif", "tif", "tiff", "ico"]);
const IMAGE_UPLOAD_MIME_SET = new Set(["image/jpeg", "image/pjpeg", "image/png", "image/webp", "image/bmp", "image/x-ms-bmp", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon", "image/ico"]);
const UPLOAD_THUMB_MAX_SIDE = 240;
const UPLOAD_THUMB_QUALITY = 0.82;
const FILE_CATEGORY_LABEL_MAP = {
  image: "图片",
  video: "视频",
  audio: "音频",
  doc: "文档",
  text: "文本",
  archive: "压缩",
  program: "程序",
  other: "其它"
};

const isImageEntry = (entry) => {
  if (!entry || entry.type === "folder") return false;
  if (String(entry.fileCategory || "").toLowerCase() === "image") return true;
  const name = String(entry.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return !!ext && IMAGE_THUMB_EXT_SET.has(ext);
};

const getEntryPreviewUrl = (entry) => {
  if (!entry || entry.type === "folder" || entry.id === undefined || entry.id === null) return "";
  const recycleQuery = state.view === "recycle" ? "&recycle=1" : "";
  const hasThumbnail = !!entry.hasThumbnail;
  if (hasThumbnail) {
    return appendFileSpaceToUrl(`/api/preview/${encodeURIComponent(entry.id)}?variant=thumb${recycleQuery}`);
  }
  return appendFileSpaceToUrl(`/api/preview/${encodeURIComponent(entry.id)}${state.view === "recycle" ? "?recycle=1" : ""}`);
};

const getEntryVisualHtml = (entry, variant = "list") => {
  const iconClass = getFileIcon(entry);
  if (!isImageEntry(entry)) {
    return variant === "detail"
      ? `<i class="${iconClass}"></i>`
      : `<i class="${iconClass} file-icon"></i>`;
  }
  const previewUrl = getEntryPreviewUrl(entry);
  if (!previewUrl) {
    return variant === "detail"
      ? `<i class="${iconClass}"></i>`
      : `<i class="${iconClass} file-icon"></i>`;
  }
  const escapedName = escapeHtml(entry.name || "图片");
  return `<img class="file-thumb file-thumb-${variant}" src="${previewUrl}" alt="${escapedName}" loading="lazy" />`;
};

const getEntryTypeLabel = (entry) => {
  if (!entry) return "-";
  if (entry.type === "folder") return "文件夹";
  const category = String(entry.fileCategory || "").trim().toLowerCase();
  return FILE_CATEGORY_LABEL_MAP[category] || "其它";
};

const createUploadImageThumbnailDataUrl = (file) => new Promise((resolve) => {
  if (!file) {
    resolve("");
    return;
  }
  const mimeType = String(file.type || "").toLowerCase();
  if (!IMAGE_UPLOAD_MIME_SET.has(mimeType)) {
    resolve("");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height) {
        URL.revokeObjectURL(objectUrl);
        resolve("");
        return;
      }
      const scale = Math.min(1, UPLOAD_THUMB_MAX_SIDE / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve("");
        return;
      }
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      if (typeof canvas.toDataURL === "function") {
        resolve(canvas.toDataURL("image/webp", UPLOAD_THUMB_QUALITY));
      } else {
        resolve("");
      }
    } catch (error) {
      resolve("");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    resolve("");
  };
  image.src = objectUrl;
});

const updateViewModeUI = () => {
  if (viewModeBtn) {
    viewModeBtn.className = state.viewMode === "grid" ? "fa-solid fa-table-list " : "fa-solid fa-table-cells-large";
  }
  if (gridSizeSelector) {
    gridSizeSelector.classList.toggle("visible", state.viewMode === "grid");
    gridSizeSelector.querySelectorAll(".grid-size-option").forEach(option => {
      const size = option.dataset.size;
      option.classList.toggle("active", state.viewMode === "grid" && size === state.gridSize);
    });
  }
  if (gridSelectAllBtn) {
    gridSelectAllBtn.style.display = state.viewMode === "grid" ? "inline-flex" : "none";
  }
  if (timelineModeToggleBtn) {
    const shouldShowTimelineToggle = state.viewMode !== "grid" && state.view === "files";
    timelineModeToggleBtn.style.display = shouldShowTimelineToggle ? "inline-flex" : "none";
    timelineModeToggleBtn.classList.toggle("active", shouldShowTimelineToggle && state.categoryTimelineEnabled);
    timelineModeToggleBtn.textContent = shouldShowTimelineToggle && state.categoryTimelineEnabled ? "时光轴" : "默认";
    timelineModeToggleBtn.title = shouldShowTimelineToggle && state.categoryTimelineEnabled ? "切换为默认列表" : "切换为时光轴";
  }
};

const persistViewPreference = async () => {
  const res = await request("/api/auth/view-preference", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      viewMode: state.viewMode,
      gridSize: state.gridSize
    })
  });
  if (res.ok) return;
  let message = "视图偏好保存失败";
  try {
    const data = await res.json();
    if (data && data.message) {
      message = data.message;
    }
  } catch (error) {}
  throw new Error(message);
};

const persistCategoryVisibilityPreference = async () => {
  const res = await request("/api/auth/category-visibility", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      visibleCategories: state.visibleCategories.slice()
    })
  });
  if (res.ok) return;
  let message = "分类显示偏好保存失败";
  try {
    const data = await res.json();
    if (data && data.message) {
      message = data.message;
    }
  } catch (error) {}
  throw new Error(message);
};

const showDetailsSidebar = () => {
  if (!detailsSidebar) return;
  if (filesContentContainer && filesContentContainer.classList.contains("hidden")) {
    setUploadTasksViewVisible(false);
  }
  detailsSidebar.classList.remove("hidden");
};

const renderFileList = () => {
  fileListEl.innerHTML = "";
  updateViewModeUI();
  const isRecycleListMode = state.view === "recycle" && state.viewMode !== "grid";
  const isCategoryTimelineMode = state.view === "files" && state.viewMode !== "grid" && state.categoryTimelineEnabled;

  const tableHeader = document.querySelector(".table-header");
  if (tableHeader) {
    tableHeader.style.display = (state.viewMode === "grid" || isCategoryTimelineMode) ? "none" : "flex";
    tableHeader.classList.toggle("show-expire-col", isRecycleListMode);
  }

  fileListEl.classList.toggle("grid-mode", state.viewMode === "grid");
  fileListEl.classList.toggle("show-expire-col", isRecycleListMode);
  fileListEl.classList.toggle("timeline-mode", isCategoryTimelineMode);
  fileListEl.classList.remove("grid-empty");
  fileListEl.classList.remove("grid-size-small", "grid-size-medium", "grid-size-large");
  if (state.viewMode === "grid") {
    fileListEl.classList.add(`grid-size-${state.gridSize}`);
  }

  const timeSortKey = state.view === "recycle" ? "deletedAt" : "updatedAt";
  const getSortHeaderHtml = (label, key) => {
    const isActive = state.sortBy === key;
    const isAsc = isActive && state.order === "asc";
    const isDesc = isActive && state.order === "desc";
    return `<span class="table-sort-label">${label}</span><span class="table-sort-arrows"><i class="fa-solid fa-caret-up ${isAsc ? "active" : ""}"></i><i class="fa-solid fa-caret-down ${isDesc ? "active" : ""}"></i></span>`;
  };
  document.querySelectorAll(".table-header > div").forEach(div => {
    if (div.classList.contains("cell-name")) div.innerHTML = getSortHeaderHtml("文件名", "name");
    if (div.classList.contains("cell-size")) div.innerHTML = getSortHeaderHtml("大小", "size");
    if (div.classList.contains("cell-type")) div.innerHTML = getSortHeaderHtml("类型", "type");
    if (div.classList.contains("cell-time")) div.innerHTML = getSortHeaderHtml(state.view === "recycle" ? "删除时间" : "修改时间", timeSortKey);
    if (div.classList.contains("cell-quick")) div.textContent = state.view === "recycle" ? "" : "收藏";
    if (div.classList.contains("cell-origin")) div.textContent = state.view === "recycle" ? "原目录" : "";
    if (div.classList.contains("cell-expire")) div.textContent = state.view === "recycle" ? "多久后自动删除" : "";
  });

  const currentPageEntries = getCurrentFilePageEntries();

  if (state.entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-tip";
    if (state.viewMode === "grid") {
      fileListEl.classList.add("grid-empty");
    } else {
      empty.style.padding = "40px";
    }
    empty.textContent = state.view === 'recycle' ? "回收站为空" : "暂无文件";
    fileListEl.appendChild(empty);
    renderFilePagination();
    updateBatchActionState();
    return;
  }

  const quickAccessEntryKeySet = getQuickAccessEntryKeySet();
  let lastTimelineDay = "";
  let timelineDayEntriesContainer = null;
  let timelineDayGroupIndex = 0;
  currentPageEntries.forEach(entry => {
    const isFolder = entry.type === "folder";
    const entryName = String(entry.name || "");
    const displayEntryName = state.viewMode === "grid" ? truncateNameWithDots(entryName, 16) : entryName;
    const escapedEntryName = escapeHtml(entryName);
    const escapedDisplayEntryName = escapeHtml(displayEntryName);
    const timeValue = state.view === "recycle" ? entry.deletedAt : entry.updatedAt;
    const timeLabel = formatDate(timeValue);
    const timelineDayLabel = formatDateDay(timeValue);
    const originalDir = state.view === "recycle" ? String(entry.originalDir || "我的文件") : "";
    const expireLabel = state.view === "recycle" ? formatRecycleAutoDeleteText(entry.deletedAt) : "";
    if (isCategoryTimelineMode && timelineDayLabel !== lastTimelineDay) {
      const dayGroup = document.createElement("div");
      dayGroup.className = "timeline-day-group";
      const currentTimelineDayGroupIndex = timelineDayGroupIndex;
      dayGroup.style.setProperty("--timeline-day-sticky-index", String(currentTimelineDayGroupIndex));
      dayGroup.innerHTML = `
        <span class="timeline-day-dot"></span>
        <span class="timeline-day-label">${escapeHtml(timelineDayLabel === "-" ? "未知日期" : timelineDayLabel)}</span>
      `;
      fileListEl.appendChild(dayGroup);
      const dayEntries = document.createElement("div");
      dayEntries.className = "timeline-day-entries";
      fileListEl.appendChild(dayEntries);
      const dayLabel = dayGroup.querySelector(".timeline-day-label");
      if (dayLabel) {
        dayLabel.setAttribute("role", "button");
        dayLabel.setAttribute("tabindex", "0");
        const revealDayEntries = () => {
          const stickyHeight = Number.parseFloat(
            window.getComputedStyle(fileListEl).getPropertyValue("--timeline-day-sticky-height")
          ) || 34;
          const stickyTopOffset = currentTimelineDayGroupIndex * stickyHeight;
          const targetScrollTop = Math.max(0, dayEntries.offsetTop - stickyTopOffset - 4);
          fileListEl.scrollTo({ top: targetScrollTop, behavior: "smooth" });
        };
        dayLabel.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          revealDayEntries();
        });
        dayLabel.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          revealDayEntries();
        });
      }
      timelineDayEntriesContainer = dayEntries;
      lastTimelineDay = timelineDayLabel;
      timelineDayGroupIndex += 1;
    }
    const item = document.createElement("div");
    item.className = state.viewMode === "grid" ? "grid-item" : `table-row${isCategoryTimelineMode ? " timeline-entry" : ""}`;
    if (isEntrySelected(entry) || (state.selectedEntry && state.selectedEntry.id === entry.id && state.selectedEntry.type === entry.type)) {
      item.classList.add("selected");
    }

    if (state.viewMode === "grid") {
      item.setAttribute("data-entry-id", String(entry.id));
      item.setAttribute("data-entry-type", entry.type);
      item.innerHTML = `
        <div class="grid-check"><input type="checkbox" ${isEntrySelected(entry) ? "checked" : ""}></div>
        ${getEntryVisualHtml(entry, "grid")}
        <div class="grid-item-name" title="${escapedEntryName}">${escapedDisplayEntryName}</div>
      `;
      const checkWrap = item.querySelector(".grid-check");
      const checkInput = item.querySelector(".grid-check input");
      if (checkWrap && checkInput) {
        checkWrap.onclick = (event) => {
          event.stopPropagation();
          if (event.target !== checkInput) {
            checkInput.click();
          }
        };
        checkInput.onclick = (event) => {
          event.stopPropagation();
        };
        checkInput.onchange = () => {
          setEntrySelected(entry, checkInput.checked);
          if (checkInput.checked) {
            state.selectedEntry = entry;
          } else if (state.selectedEntry && state.selectedEntry.id === entry.id && state.selectedEntry.type === entry.type) {
            state.selectedEntry = null;
          }
          item.classList.toggle("selected", checkInput.checked);
          updateBatchActionState();
        };
      }
    } else if (isCategoryTimelineMode) {
      item.innerHTML = `
        <div class="timeline-check"><input type="checkbox" ${isEntrySelected(entry) ? "checked" : ""}></div>
        <div class="timeline-card-media">${getEntryVisualHtml(entry, "timeline")}</div>
        <div class="timeline-card-name" title="${escapedEntryName}">${escapedDisplayEntryName}</div>
        <div class="timeline-card-time">${escapeHtml(timeLabel)}</div>
      `;
      const checkWrap = item.querySelector(".timeline-check");
      const checkInput = item.querySelector(".timeline-check input");
      if (checkWrap && checkInput) {
        checkWrap.onclick = (event) => {
          event.stopPropagation();
          if (event.target !== checkInput) {
            checkInput.click();
          }
        };
        checkInput.onclick = (event) => {
          event.stopPropagation();
        };
        checkInput.onchange = () => {
          setEntrySelected(entry, checkInput.checked);
          if (checkInput.checked) {
            state.selectedEntry = entry;
          } else if (state.selectedEntry && state.selectedEntry.id === entry.id && state.selectedEntry.type === entry.type) {
            state.selectedEntry = null;
          }
          item.classList.toggle("selected", checkInput.checked);
          updateBatchActionState();
        };
      }
    } else {
      const canQuickToggle = state.view !== "recycle" && (entry.type === "folder" || entry.type === "file");
      const isQuickAccess = canQuickToggle && quickAccessEntryKeySet.has(getQuickAccessEntryKey(entry.type, Number(entry.id)));
      item.innerHTML = `
        <div class="cell-check"><input type="checkbox" ${isEntrySelected(entry) ? "checked" : ""}></div>
        <div class="cell-name name-wrapper">
          ${getEntryVisualHtml(entry, "list")}
          <span class="file-name-text" title="${escapedEntryName}">${escapedDisplayEntryName}</span>
        </div>
        <div class="cell-size">${isFolder ? "-" : formatSize(entry.size)}</div>
        <div class="cell-type">${getEntryTypeLabel(entry)}</div>
        <div class="cell-time">${timeLabel}</div>
        <div class="cell-quick">${canQuickToggle ? `<button type="button" class="quick-access-toggle${isQuickAccess ? " active" : ""}" title="${isQuickAccess ? "取消收藏" : "加入收藏"}"><i class="${isQuickAccess ? "fa-solid" : "fa-regular"} fa-star"></i></button>` : ""}</div>
        ${state.view === "recycle" ? `<div class="cell-origin" title="${escapeHtml(originalDir)}">${escapeHtml(originalDir)}</div>` : ""}
        ${state.view === "recycle" ? `<div class="cell-expire">${expireLabel}</div>` : ""}
      `;
      const checkWrap = item.querySelector(".cell-check");
      const checkInput = item.querySelector(".cell-check input");
      if (checkWrap && checkInput) {
        checkWrap.onclick = (event) => {
          event.stopPropagation();
          if (event.target !== checkInput) {
            checkInput.click();
          }
        };
        checkInput.onclick = (event) => {
          event.stopPropagation();
        };
        checkInput.onchange = () => {
          setEntrySelected(entry, checkInput.checked);
          if (checkInput.checked) {
            state.selectedEntry = entry;
          } else if (state.selectedEntry && state.selectedEntry.id === entry.id && state.selectedEntry.type === entry.type) {
            state.selectedEntry = null;
          }
          item.classList.toggle("selected", checkInput.checked);
          updateBatchActionState();
        };
      }
      const quickAccessBtn = item.querySelector(".quick-access-toggle");
      if (quickAccessBtn) {
        quickAccessBtn.onclick = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await toggleQuickAccessEntry(entry);
        };
      }
    }

    const toggleMobileEntrySelection = () => {
      const nextChecked = !isEntrySelected(entry);
      setEntrySelected(entry, nextChecked);
      if (nextChecked) {
        state.selectedEntry = entry;
      } else if (state.selectedEntry && state.selectedEntry.id === entry.id && state.selectedEntry.type === entry.type) {
        state.selectedEntry = null;
      }
      item.classList.toggle("selected", nextChecked);
      const checkInput = item.querySelector(".cell-check input, .grid-check input, .timeline-check input");
      if (checkInput) checkInput.checked = nextChecked;
      updateBatchActionState();
    };
    let mobileLongPressTimer = null;
    let mobileLongPressTriggered = false;
    let mobileTouchStartX = 0;
    let mobileTouchStartY = 0;
    const clearMobileLongPressTimer = () => {
      if (!mobileLongPressTimer) return;
      clearTimeout(mobileLongPressTimer);
      mobileLongPressTimer = null;
    };
    item.addEventListener("touchstart", (event) => {
      if (!isMobileViewport() || state.view !== "files") return;
      if (event.touches.length !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && target.closest("input, button, .quick-access-toggle, .cell-check, .grid-check")) return;
      mobileLongPressTriggered = false;
      const touch = event.touches[0];
      mobileTouchStartX = touch.clientX;
      mobileTouchStartY = touch.clientY;
      clearMobileLongPressTimer();
      mobileLongPressTimer = setTimeout(() => {
        mobileLongPressTriggered = true;
        toggleMobileEntrySelection();
      }, 380);
    }, { passive: true });
    item.addEventListener("touchmove", (event) => {
      if (!isMobileViewport() || state.view !== "files") return;
      if (!mobileLongPressTimer || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (Math.abs(touch.clientX - mobileTouchStartX) > 10 || Math.abs(touch.clientY - mobileTouchStartY) > 10) {
        clearMobileLongPressTimer();
      }
    }, { passive: true });
    item.addEventListener("touchend", (event) => {
      if (!isMobileViewport() || state.view !== "files") return;
      clearMobileLongPressTimer();
      if (mobileLongPressTriggered) {
        event.preventDefault();
        event.stopPropagation();
        mobileLongPressTriggered = false;
        return;
      }
      if (state.selectedEntries.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        toggleMobileEntrySelection();
      }
    }, { passive: false });
    item.addEventListener("touchcancel", () => {
      clearMobileLongPressTimer();
      mobileLongPressTriggered = false;
    }, { passive: true });

    item.onclick = async (e) => {
      if (e.button !== 0) return;
      if (state.view !== "recycle" && isFolder) {
        clearSelection();
        state.currentFolderId = entry.id;
        state.selectedEntry = null;
        state.category = "";
        state.keyword = "";
        if (searchInput) {
          searchInput.value = "";
        }
        refreshAll();
        return;
      }
      state.selectedEntry = entry;
      document.querySelectorAll(".table-row, .grid-item").forEach(r => r.classList.remove("selected"));
      item.classList.add("selected");
      if (state.view === "recycle") return;
      if (isArchiveFileEntry(entry)) {
        if (hasUserPermission("viewArchive")) {
          // 有权限，显示原来的查看提示
          const confirmed = await showDeleteConfirm({
            title: "查看压缩包",
            message: "是否查看该压缩包内容？",
            desc: "将以文件列表方式展示压缩包内容",
            okText: "查看",
            cancelText: "取消"
          });
          if (!confirmed) return;
          await viewZipArchiveEntries(entry);
        } else {
          // 无权限，显示VIP升级提示
          const confirmed = await showDeleteConfirm({
            title: "查看压缩包",
            message: "在线查看压缩包功能需要升级为VIP",
            desc: "升级VIP后可享受在线查看、解压等更多功能",
            okText: "升级VIP",
            cancelText: "取消"
          });
          if (!confirmed) return;
          return;
        }
      }
      openFilePreview(entry);
    };

    item.oncontextmenu = (e) => {
      e.preventDefault();
      state.selectedEntry = entry;
      document.querySelectorAll(".table-row, .grid-item").forEach(r => r.classList.remove("selected"));
      item.classList.add("selected");

      const menu = document.getElementById("contextMenu");
      const isRecycle = state.view === "recycle";
      const isArchiveFile = !isRecycle && isArchiveFileEntry(entry);
      
      document.getElementById("menuOpen").style.display = isRecycle ? "none" : "";
      document.getElementById("menuDetail").style.display = "";
      document.getElementById("menuCopy").style.display = (isRecycle || !hasUserPermission("copy")) ? "none" : "";
      document.getElementById("menuDownload").style.display = (isRecycle || !hasUserPermission("download")) ? "none" : "";
      document.getElementById("menuZipView").style.display = (isArchiveFile && hasUserPermission("viewArchive")) ? "" : "none";
      document.getElementById("menuZipExtractCurrent").style.display = (isArchiveFile && hasUserPermission("extract")) ? "" : "none";
      document.getElementById("menuZipExtractTarget").style.display = (isArchiveFile && hasUserPermission("extract")) ? "" : "none";
      document.getElementById("menuLocateFolder").style.display = (!isRecycle && !!state.keyword && entry.type === "file") ? "" : "none";
      document.getElementById("menuShare").style.display = isRecycle ? "none" : "";
      document.getElementById("menuRename").style.display = (isRecycle || !hasUserPermission("rename")) ? "none" : "";
      document.getElementById("menuMove").style.display = (isRecycle || !hasUserPermission("move")) ? "none" : "";
      document.getElementById("menuDelete").style.display = hasUserPermission("delete") ? "" : "none";
      document.getElementById("menuDelete").innerHTML = isRecycle
        ? getContextMenuItemContent("deleteStrong", "彻底删除")
        : getContextMenuItemContent("delete", "删除");
      
      let restoreBtn = document.getElementById("menuRestore");
      if (isRecycle) {
        if (!restoreBtn) {
          restoreBtn = document.createElement("div");
          restoreBtn.id = "menuRestore";
          restoreBtn.className = "menu-item";
          restoreBtn.innerHTML = getContextMenuItemContent("restore", "还原");
          restoreBtn.onclick = restoreEntry;
          menu.insertBefore(restoreBtn, menu.firstChild);
        }
        restoreBtn.style.display = "";
      } else if (restoreBtn) {
        restoreBtn.style.display = "none";
      }

      menu.style.display = "block";
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      let left = e.pageX;
      let top = e.pageY;
      const maxLeft = scrollX + viewportWidth - menuWidth - 8;
      const maxTop = scrollY + viewportHeight - menuHeight - 8;
      if (left > maxLeft) left = Math.max(scrollX + 8, maxLeft);
      if (top > maxTop) top = Math.max(scrollY + 8, maxTop);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };

    if (isCategoryTimelineMode && timelineDayEntriesContainer) {
      timelineDayEntriesContainer.appendChild(item);
    } else {
      fileListEl.appendChild(item);
    }
  });
  renderFilePagination();
  updateBatchActionState();
};

const submitBatchAction = async (action, targetFolderId = undefined) => {
  const permissionMap = { copy: "copy", move: "move", delete: "delete" };
  if (permissionMap[action] && !ensurePermission(permissionMap[action])) {
    return;
  }
  const selected = (action === "copy" || action === "move")
    ? state.clipboardEntries.slice()
    : getSelectedEntries();
  if (selected.length === 0) {
    alert("请先选择文件或文件夹");
    return;
  }
  
  // 内部执行函数
  const performAction = async (pasteStrategy = "cancel") => {
    const body = { action, entries: selected };
    if (targetFolderId !== undefined) {
      body.targetFolderId = targetFolderId;
    }
    body.pasteStrategy = pasteStrategy;
    
    const res = await request("/api/entries/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.status === 409 && data.code === "NAME_CONFLICT") {
      // 显示选择对话框
      let message = "当前目录中存在同名的文件或目录，请选择处理方式：";
      if (data.conflicts && data.conflicts.length > 0) {
        const conflictNames = data.conflicts.slice(0, 5).map(item => item.name).join("、");
        const moreText = data.conflicts.length > 5 ? ` 等 ${data.conflicts.length} 个` : "";
        message = `文件 ${conflictNames}${moreText} 已存在，请选择处理方式：`;
      }
      
      const selectedStrategy = await showAppSelect({
        title: "文件已存在",
        message,
        options: [
          { value: "auto_rename", label: "自动重命名" },
          { value: "overwrite", label: "覆盖原文件" },
          { value: "cancel", label: "取消粘贴" }
        ],
        defaultValue: "auto_rename"
      });
      
      if (selectedStrategy === null || selectedStrategy === "cancel") {
        return;
      }
      
      // 重新执行操作，使用选择的策略
      await performAction(selectedStrategy);
      return;
    }
    
    if (!res.ok) {
      alert(data.message || "批量操作失败");
      return;
    }
    if (data.failCount > 0) {
      const firstError = Array.isArray(data.errors) && data.errors.length > 0 ? data.errors[0].message : "";
      if (firstError && data.successCount === 0) {
        alert(firstError);
      } else if (firstError) {
        alert(`${firstError}（成功 ${data.successCount} 个，失败 ${data.failCount} 个）`);
      } else {
        alert(`操作完成：成功 ${data.successCount} 个，失败 ${data.failCount} 个`);
      }
    }
    if (action === "copy" || action === "move") {
      clearBatchClipboard();
    }
    clearSelection();
    state.selectedEntry = null;
    renderDetails(null);
    refreshAll();
  };
  
  // 初始调用
  await performAction("cancel");
};

const createBatchArchive = async () => {
  if (!ensurePermission("download")) return;
  if (!ensurePermission("upload")) return;
  if (state.view === "recycle") {
    alert("回收站中无法压缩");
    return;
  }
  const selected = getSelectedEntries();
  if (selected.length === 0) {
    alert("请先选择文件或文件夹");
    return;
  }
  const selectedSet = new Set(selected.map((entry) => entryKey(entry)));
  const selectedEntries = state.entries.filter((entry) => selectedSet.has(entryKey(entry)));
  if (selectedEntries.length === 0) {
    alert("请先选择文件或文件夹");
    return;
  }
  const input = await showAppPrompt({
    title: "输入压缩包名称",
    defaultValue: "新建压缩包",
    inputType: "text"
  });
  if (input === null) return;
  const archiveNameRaw = String(input || "").trim();
  if (!archiveNameRaw) {
    alert("压缩包名称不能为空");
    return;
  }
  const closeBusy = showAppBusy("正在创建压缩包...");
  try {
    const res = await request("/api/archive/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: archiveNameRaw,
        parentId: state.currentFolderId === null ? null : state.currentFolderId,
        entries: selectedEntries.map((item) => ({ id: item.id, type: item.type === "folder" ? "folder" : "file" }))
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      closeBusy();
      alert(data.message || "压缩失败");
      return;
    }
    clearSelection();
    state.selectedEntry = null;
    renderDetails(null);
    await refreshAll();
    closeBusy();
    await showAppNotice({
      title: "压缩完成",
      message: data.message || "压缩完成",
      noticeType: APP_NOTICE_TYPE.NORMAL
    });
  } finally {
    closeBusy();
  }
};

const renderDetails = (entry) => {
  if (!entry) {
    detailsContent.innerHTML = `
      <div class="empty-info">
        <i class="fa-regular fa-file" style="font-size: 64px; color: #e5e6eb;"></i>
        <p>选中文件/文件夹，查看详情</p>
      </div>
    `;
    return;
  }

  const isFolder = entry.type === "folder";
  const folderTotalSize = Number(entry.totalSize);
  const folderSizeText = Number.isFinite(folderTotalSize) && folderTotalSize >= 0 ? formatSize(folderTotalSize) : "-";

  detailsContent.innerHTML = `
    <div class="info-detail-box">
      ${getEntryVisualHtml(entry, "detail")}
      <div class="info-detail-name">${entry.name}</div>
    </div>
    <div class="info-prop">
      <div class="info-prop-label">类型</div>
      <div class="info-prop-value">${getEntryTypeLabel(entry)}</div>
    </div>
    <div class="info-prop">
      <div class="info-prop-label">大小</div>
      <div class="info-prop-value">${isFolder ? folderSizeText : formatSize(entry.size)}</div>
    </div>
    <div class="info-prop">
      <div class="info-prop-label">修改时间</div>
      <div class="info-prop-value">${formatDate(entry.updatedAt)}</div>
    </div>
    ${state.view === 'recycle' ? `
    <div class="info-prop">
      <div class="info-prop-label">删除时间</div>
      <div class="info-prop-value">${formatDate(entry.deletedAt)}</div>
    </div>` : ''}
  `;
};

const showSelectedEntryDetails = async () => {
  if (!state.selectedEntry) return;
  let detailEntry = state.selectedEntry;
  try {
    const res = await request(`/api/entries/${state.selectedEntry.type}/${state.selectedEntry.id}`);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      detailEntry = { ...state.selectedEntry, ...data };
      state.selectedEntry = detailEntry;
    }
  } catch (error) {
    void error;
  }
  renderDetails(detailEntry);
  showDetailsSidebar();
};

const updateNavState = () => {
  const uploadTasksVisible = uploadTasksMainContainer && !uploadTasksMainContainer.classList.contains("hidden");
  const mySharesVisible = mySharesMainContainer && !mySharesMainContainer.classList.contains("hidden");
  
  if (uploadTasksVisible) {
    if (uploadTasksNavBtn) uploadTasksNavBtn.classList.add("active");
    if (mySharesNavBtn) mySharesNavBtn.classList.remove("active");
    document.querySelectorAll(".secondary-nav-item, .sub-nav-item").forEach(el => el.classList.remove("active"));
    return;
  }
  if (mySharesVisible) {
    if (mySharesNavBtn) mySharesNavBtn.classList.add("active");
    if (uploadTasksNavBtn) uploadTasksNavBtn.classList.remove("active");
    document.querySelectorAll(".secondary-nav-item, .sub-nav-item").forEach(el => el.classList.remove("active"));
    return;
  }
  
  const localMainNavItems = document.querySelectorAll(".primary-nav-item[data-view]");
  const localViews = {
    files: document.getElementById("view-files"),
    users: document.getElementById("view-users"),
    permissions: document.getElementById("view-permissions"),
    quota: document.getElementById("view-quota"),
    mounts: document.getElementById("view-mounts"),
    sync: document.getElementById("view-sync"),
    monitor: document.getElementById("view-monitor"),
    settings: document.getElementById("view-settings")
  };
  
  let activeMainView = null;
  for (const [viewName, viewEl] of Object.entries(localViews)) {
    if (viewEl && viewEl.style.display !== "none") {
      activeMainView = viewName;
      break;
    }
  }
  if (activeMainView) {
    localMainNavItems.forEach(el => {
      if (el.dataset.view === activeMainView) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  document.querySelectorAll(".secondary-nav-item, .sub-nav-item").forEach(el => el.classList.remove("active"));
  if (uploadTasksNavBtn) {
    uploadTasksNavBtn.classList.remove("active");
  }
  const myFilesHeader = document.getElementById("myFilesHeader");
  if (myFilesHeader) {
    myFilesHeader.classList.remove("active");
  }
  
  if (state.view === "recycle") {
    document.querySelectorAll(".secondary-nav-item").forEach((el) => {
      if (el.textContent.includes("回收站")) {
        el.classList.add("active");
      }
    });
  } else if (state.category) {
    if (myFilesHeader && state.fileSpace !== "hidden") {
      myFilesHeader.classList.add("active");
    }
    if (isCategoryVisible(state.category)) {
      document.querySelectorAll(".sub-nav-item[data-category]").forEach((el) => {
        if (String(el.dataset.category || "") === state.category) {
          el.classList.add("active");
        }
      });
    }
  } else {
    if (state.fileSpace === "hidden") {
      if (hiddenSpaceNavBtn) {
        hiddenSpaceNavBtn.classList.add("active");
      }
    } else if (myFilesHeader) {
      myFilesHeader.classList.add("active");
      document.querySelectorAll(".sub-nav-item[data-category]").forEach((el) => {
        if (String(el.dataset.category || "") === "all") {
          el.classList.add("active");
        }
      });
    }
  }
  if (mobileCategoryBar && state.view === "files" && state.fileSpace !== "hidden" && !state.category) {
    const allBtn = mobileCategoryBar.querySelector("[data-mobile-category-all]");
    if (allBtn) {
      allBtn.classList.add("active");
    }
  }
  if (mobileCategoryBar) {
    mobileCategoryBar.style.display = (state.view === "files" && state.fileSpace !== "hidden" && !uploadTasksVisible && !mySharesVisible) ? "" : "none";
  }
};
