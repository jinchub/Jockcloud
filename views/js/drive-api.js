// API Calls
const loadStats = async () => {
  try {
    const res = await request("/api/stats");
    const data = await res.json();
    const used = Number(data.totalSize || 0);
    const quota = Number(data.quota || -1); // -1 means unlimited
    
    // If quota is -1, maybe show "Unlimited" or just show used size?
    // User requested "show actual space based on config".
    // If unlimited, we can't show a meaningful progress bar percentage (or 0%).
    
    let totalText = "∞";
    let percent = 0;
    
    if (quota !== -1) {
      totalText = formatSize(quota);
      percent = (used / quota) * 100;
      // Clamp percent
      if (percent > 100) percent = 100;
    }
    
    const usedText = used > 0 ? formatSize(used) : "0 B";
    statsEl.textContent = `${usedText} / ${totalText}`;
    
    // Min 2% width for visibility unless 0 usage?
    // If unlimited, let's keep bar minimal or hidden? 
    // Let's just set to a small value or 0 if unlimited.
    // If quota exists, show real percent.
    
    const barWidth = quota === -1 ? (used > 0 ? 5 : 0) : Math.max(2, percent);
    document.querySelector(".capacity-inner").style.width = `${barWidth}%`;
    
    if (quota !== -1 && percent > 95) {
      document.querySelector(".capacity-inner").style.backgroundColor = "#f53f3f";
    } else if (quota !== -1 && percent > 75) {
      document.querySelector(".capacity-inner").style.backgroundColor = "#ff7d00";
    } else {
      document.querySelector(".capacity-inner").style.backgroundColor = "#165dff";
    }
    
  } catch(e) {}
};

const loadPath = async () => {
  if (state.currentFolderId === null) {
    state.path = [];
    return;
  }
  const res = await request(`/api/folders/${state.currentFolderId}/path`);
  state.path = await res.json();
};

const loadEntries = async () => {
  const nextKey = getFileQueryKey();
  if (state.entriesQueryKey !== nextKey) {
    state.filePage = 1;
    state.entriesQueryKey = nextKey;
  }
  if (state.view === "recycle") {
    const query = new URLSearchParams();
    query.set("sortBy", state.sortBy);
    query.set("order", state.order);
    query.set("page", String(state.filePage));
    query.set("pageSize", String(state.filePageSize));
    const res = await request(`/api/recycle?${query.toString()}`);
    const payload = await res.json();
    if (Array.isArray(payload)) {
      state.entries = payload;
      state.entriesTotal = payload.length;
      state.filePage = 1;
      return;
    }
    state.entries = Array.isArray(payload && payload.items) ? payload.items : [];
    state.entriesTotal = Number(payload && payload.total) || 0;
    state.filePage = Number(payload && payload.page) || state.filePage;
    return;
  }

  const query = new URLSearchParams();
  query.set("sortBy", state.sortBy);
  query.set("order", state.order);

  if (state.category) {
    query.set("category", state.category);
  } else if (!state.keyword) {
    query.set("parentId", state.currentFolderId === null ? "null" : String(state.currentFolderId));
  }
  
  if (state.keyword) {
    query.set("keyword", state.keyword);
  }
  query.set("page", String(state.filePage));
  query.set("pageSize", String(state.filePageSize));
  const res = await request(`/api/entries?${query.toString()}`);
  const payload = await res.json();
  if (Array.isArray(payload)) {
    state.entries = payload;
    state.entriesTotal = payload.length;
    state.filePage = 1;
    return;
  }
  state.entries = Array.isArray(payload && payload.items) ? payload.items : [];
  state.entriesTotal = Number(payload && payload.total) || 0;
  state.filePage = Number(payload && payload.page) || state.filePage;
};

const refreshAll = async (keepSelection = false) => {
  try {
    const promises = [loadEntries(), loadStats(), loadQuickAccess()];
    if (state.view === "files" && !state.category) {
      promises.push(loadPath());
    } else {
      state.path = []; // Clear path when in category/search/recycle view
    }
    
    await Promise.all(promises);
    if (!keepSelection) {
      const visibleMap = new Map(state.entries.map((entry) => [entryKey(entry), entry]));
      state.selectedEntries = state.selectedEntries.filter((item) => {
        const visible = visibleMap.get(entryKey(item));
        if (visible) {
          // 更新选中条目的最新数据
          item.isPinned = visible.isPinned;
          item.is_favorite = visible.is_favorite;
          item.name = visible.name;
          return true;
        }
        return false;
      });
      // 更新 state.selectedEntry 的最新数据
      if (state.selectedEntry) {
        const updated = visibleMap.get(entryKey(state.selectedEntry));
        if (updated) {
          state.selectedEntry.isPinned = updated.isPinned;
          state.selectedEntry.is_favorite = updated.is_favorite;
          state.selectedEntry.name = updated.name;
        }
      }
    }
    renderPath();
    renderFileList();
    renderDetails(state.selectedEntry);
    updateNavState();
    updateBatchActionState();
    if (state.view !== "recycle") {
      startVideoThumbnailPolling();
    }
  } catch(e) {
    console.error(e);
  }
};

// 视频缩略图轮询
const videoThumbnailPollMap = new Map();

const pollVideoThumbnailStatus = (fileId, maxRetries = 20, interval = 2000) => {
  if (videoThumbnailPollMap.has(fileId)) return;
  let retryCount = 0;
  let timerId = null;
  const poll = async () => {
    if (retryCount >= maxRetries) {
      videoThumbnailPollMap.delete(fileId);
      return;
    }
    retryCount++;
    try {
      const res = await request(`/api/files/${fileId}/thumbnail-status`);
      if (!res.ok) {
        videoThumbnailPollMap.delete(fileId);
        return;
      }
      const data = await res.json();
      if (data.hasThumbnail) {
        videoThumbnailPollMap.delete(fileId);
        const entry = state.entries.find((e) => e.id === fileId && e.type === "file");
        if (entry) {
          entry.hasThumbnail = true;
          renderFileList();
        }
      } else {
        timerId = setTimeout(poll, interval);
        videoThumbnailPollMap.set(fileId, timerId);
      }
    } catch (e) {
      videoThumbnailPollMap.delete(fileId);
    }
  };
  timerId = setTimeout(poll, interval);
  videoThumbnailPollMap.set(fileId, timerId);
};

const startVideoThumbnailPolling = () => {
  for (const entry of state.entries) {
    if (entry.type === "file" && !entry.hasThumbnail && String(entry.fileCategory || "").toLowerCase() === "video") {
      pollVideoThumbnailStatus(entry.id);
    }
  }
};
