// Actions
const restoreEntry = async () => {
  if (!state.selectedEntry) return;
  const url = state.selectedEntry.type === "folder" 
    ? `/api/recycle/folders/${state.selectedEntry.id}/restore`
    : `/api/recycle/files/${state.selectedEntry.id}/restore`;
    
  const res = await request(url, { method: "POST" });
  if (res.ok) {
    state.selectedEntry = null;
    refreshAll();
  } else {
    alert("还原失败");
  }
};

const restoreSelectedEntries = async () => {
  const selected = getSelectedEntries();
  const fallbackSelected = (!selected.length && state.selectedEntry)
    ? [{ id: state.selectedEntry.id, type: state.selectedEntry.type, name: state.selectedEntry.name }]
    : [];
  const finalSelected = selected.length > 0 ? selected : fallbackSelected;
  if (finalSelected.length === 0) {
    alert("请先选择要恢复的文件");
    return;
  }
  if (!selected.length && fallbackSelected.length > 0) {
    state.selectedEntries = fallbackSelected;
    updateBatchActionState();
  }

  let successCount = 0;
  let failCount = 0;
  let firstError = "";
  for (const entry of finalSelected) {
    const url = entry.type === "folder"
      ? `/api/recycle/folders/${entry.id}/restore`
      : `/api/recycle/files/${entry.id}/restore`;
    try {
      const res = await request(url, { method: "POST" });
      if (res.ok) {
        successCount += 1;
        continue;
      }
      const data = await res.json().catch(() => ({}));
      failCount += 1;
      if (!firstError) {
        firstError = data.message || "恢复失败";
      }
    } catch (e) {
      failCount += 1;
      if (!firstError) {
        firstError = "恢复失败";
      }
    }
  }

  if (failCount > 0) {
    if (successCount > 0) {
      alert(`${firstError}（成功 ${successCount} 个，失败 ${failCount} 个）`);
    } else {
      alert(firstError);
    }
  }
  clearSelection();
  state.selectedEntry = null;
  renderDetails(null);
  refreshAll();
};

const loadExtractTargetFolderOptions = async () => {
  const root = { value: "null", label: "/", children: [] };
  const queue = [{ id: null, node: root }];
  const visited = new Set(["null"]);
  let guard = 0;
  while (queue.length > 0 && guard < 2000) {
    guard += 1;
    const current = queue.shift();
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const query = new URLSearchParams();
      query.set("parentId", current.id === null ? "null" : String(current.id));
      query.set("type", "folder");
      query.set("page", String(page));
      query.set("pageSize", "200");
      const res = await request(`/api/entries?${query.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "读取目录失败");
      }
      const entries = Array.isArray(data)
        ? data
        : Array.isArray(data && data.items)
          ? data.items
          : [];
      totalPages = Math.max(1, Number(data && data.totalPages) || 1);
      const folders = entries
        .filter((item) => item && item.type === "folder")
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
      for (const folder of folders) {
        const folderId = Number(folder.id) || 0;
        if (!folderId) continue;
        const key = String(folderId);
        if (visited.has(key)) continue;
        visited.add(key);
        const folderName = String(folder.name || "").trim() || `目录-${folderId}`;
        const childNode = { value: String(folderId), label: folderName, children: [] };
        current.node.children.push(childNode);
        queue.push({ id: folderId, node: childNode });
      }
      page += 1;
    }
  }
  return root;
};

const viewZipArchiveEntries = async (entry) => {
  if (!entry || entry.type !== "file") return;
  const closeBusy = showAppBusy("正在加载压缩包内容...");
  try {
    const res = await request(`/api/files/${entry.id}/zip/entries`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || "读取压缩包失败");
      return;
    }
    const entries = Array.isArray(data.entries) ? data.entries : [];
    closeBusy();
    const configToSend = state.previewConfig || {};
    await showArchiveEntriesModal({
      title: String(entry.name || "").trim() || "压缩包内容",
      entries,
      total: Number(data.total || entries.length || 0),
      archiveEntry: entry,
      previewConfig: configToSend
    });
  } finally {
    closeBusy();
  }
};

const extractZipArchive = async (entry, options = {}) => {
  if (!entry || entry.type !== "file") return;
  const closeBusy = showAppBusy("正在解压，请稍候...");
  const body = {};
  if (Object.prototype.hasOwnProperty.call(options, "targetFolderId")) {
    body.targetFolderId = options.targetFolderId;
  }
  if (typeof options.targetPath === "string") {
    body.targetPath = options.targetPath;
  }
  try {
    const res = await request(`/api/files/${entry.id}/zip/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      closeBusy();
      alert(data.message || "解压失败");
      return;
    }
    await refreshAll();
    closeBusy();
    await showAppNotice({
      title: "解压完成",
      message: data.message || "解压完成",
      noticeType: APP_NOTICE_TYPE.NORMAL
    });
  } finally {
    closeBusy();
  }
};

const extractZipArchiveToSpecifiedPath = async (entry) => {
  let options = [];
  try {
    options = await loadExtractTargetFolderOptions();
  } catch (error) {
    alert(error && error.message ? error.message : "读取目录失败");
    return;
  }
  const defaultValue = state.currentFolderId === null ? "null" : String(state.currentFolderId);
  const selected = await showAppSelect({
    title: "选择解压目录",
    options,
    defaultValue
  });
  if (selected === null) return;
  const targetFolderId = selected === "null" ? null : Number(selected);
  if (selected !== "null" && (!Number.isInteger(targetFolderId) || targetFolderId <= 0)) {
    alert("目录参数不合法");
    return;
  }
  await extractZipArchive(entry, { targetFolderId });
};
