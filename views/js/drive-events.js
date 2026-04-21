// Events
const uploadLargeFileByChunks = async ({ taskId, uploadItem, thumbnailDataUrl, abortController, batchMeta, uploadStrategy = "cancel" }) => {
  const file = uploadItem.file;
  const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_SIZE_BYTES);
  const initRes = await request("/api/upload/chunk/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientTaskId: taskId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      folderId: state.currentFolderId === null ? "null" : String(state.currentFolderId),
      relativePath: uploadItem.relativePath ? uploadItem.relativePath.replace(/\\/g, "/") : "",
      uploadBatchId: batchMeta && batchMeta.batchId ? String(batchMeta.batchId) : "",
      uploadBatchTotal: batchMeta && Number.isFinite(Number(batchMeta.batchTotal)) ? Math.floor(Number(batchMeta.batchTotal)) : 1,
      totalChunks,
      chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
      resume: true
    }),
    signal: abortController.signal
  });
  const initData = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    throw new Error(String(initData && initData.message ? initData.message : "分片初始化失败"));
  }
  const uploadId = String(initData.uploadId || "");
  if (!uploadId) {
    throw new Error("分片初始化失败");
  }
  updateUploadTask(taskId, { uploadSessionId: uploadId });
  const uploadedChunksSet = new Set(Array.isArray(initData.uploadedChunks) ? initData.uploadedChunks : []);
  let uploadedBytes = uploadedChunksSet.size * UPLOAD_CHUNK_SIZE_BYTES;
  const startTime = Date.now();
  let lastUpdateTime = startTime;
  let lastUploadedBytes = uploadedBytes;
  
  if (uploadedChunksSet.size > 0) {
    const initialProgress = Math.min(99, Math.floor((uploadedBytes / file.size) * 100));
    updateUploadTask(taskId, { 
      progress: initialProgress,
      uploaded: uploadedBytes,
      lastUpdateTime: startTime,
      lastUploaded: uploadedBytes
    });
  }

  for (let index = 0; index < totalChunks; index += 1) {
    if (uploadedChunksSet.has(index)) {
      continue;
    }
    const start = index * UPLOAD_CHUNK_SIZE_BYTES;
    const end = Math.min(file.size, start + UPLOAD_CHUNK_SIZE_BYTES);
    const chunkBlob = file.slice(start, end);
    const formData = new FormData();
    formData.append("chunk", chunkBlob, `${file.name}.part${index}`);
    formData.append("chunkIndex", String(index));
    const chunkRes = await fetch(appendFileSpaceToUrl(`/api/upload/chunk/${encodeURIComponent(uploadId)}`), {
      method: "POST",
      body: formData,
      signal: abortController.signal
    });
    if (chunkRes.status === 401) {
      clearLoginSessionStorage();
      window.location.href = "/";
      throw new Error("未登录");
    }
    if (!chunkRes.ok) {
      const chunkData = await chunkRes.json().catch(() => ({}));
      throw new Error(String(chunkData && chunkData.message ? chunkData.message : "分片上传失败"));
    }
    uploadedBytes += (end - start);
    const progress = Math.min(99, Math.floor((uploadedBytes / file.size) * 100));
    
    const now = Date.now();
    const timeDiff = now - lastUpdateTime;
    let speed = 0;
    if (timeDiff > 0) {
      speed = (uploadedBytes - lastUploadedBytes) / (timeDiff / 1000);
    }
    
    updateUploadTask(taskId, { 
      progress,
      uploaded: uploadedBytes,
      lastUpdateTime: now,
      lastUploaded: uploadedBytes,
      speed
    });
  }
  
  const completeBody = { 
    thumbnailDataUrl: thumbnailDataUrl || "",
    uploadStrategy: uploadStrategy
  };
  
  const completeRes = await request(`/api/upload/chunk/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(completeBody),
    signal: abortController.signal
  });
  
  if (completeRes.status === 409) {
    const completeData = await completeRes.json().catch(() => ({}));
    if (completeData && completeData.conflict) {
      const fileName = completeData.fileName || file.name;
      
      // 显示选择对话框
      const selectedStrategy = await showAppSelect({
        title: "文件已存在",
        message: `文件 "${fileName}" 已存在，请选择处理方式：`,
        options: [
          { value: "auto_rename", label: "自动重命名" },
          { value: "overwrite", label: "覆盖原文件" },
          { value: "cancel", label: "取消上传" }
        ],
        defaultValue: "auto_rename"
      });
      
      if (selectedStrategy === null || selectedStrategy === "cancel") {
        throw new Error("上传已取消");
      }
      
      // 重新尝试完成上传，使用选择的策略
      const retryCompleteBody = { 
        thumbnailDataUrl: thumbnailDataUrl || "",
        uploadStrategy: selectedStrategy
      };
      
      const retryCompleteRes = await request(`/api/upload/chunk/${encodeURIComponent(uploadId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryCompleteBody),
        signal: abortController.signal
      });
      
      if (!retryCompleteRes.ok) {
        const retryData = await retryCompleteRes.json().catch(() => ({}));
        throw new Error(String(retryData && retryData.message ? retryData.message : "合并分片失败"));
      }
    } else {
      throw new Error(String(completeData && completeData.message ? completeData.message : "合并分片失败"));
    }
  } else if (!completeRes.ok) {
    const completeData = await completeRes.json().catch(() => ({}));
    throw new Error(String(completeData && completeData.message ? completeData.message : "合并分片失败"));
  }
  
  updateUploadTask(taskId, { uploadSessionId: "" });
};

const enqueueUploadTask = (uploadItem, batchMeta = null) => {
  const taskId = `${Date.now()}-${createClientUuid()}`;
  state.uploadTasks.push({
    id: taskId,
    name: uploadItem.file.name,
    size: uploadItem.file.size,
    startedAt: new Date().toISOString(),
    targetPath: resolveUploadPathText(getCurrentBasePath(), uploadItem.relativePath),
    sourcePath: getUploadSourcePathFromItem(uploadItem),
    progress: 0,
    status: "pending",
    xhr: null,
    abortController: null,
    cancelRequested: false,
    uploadSessionId: "",
    uploaded: 0,
    lastUpdateTime: 0,
    lastUploaded: 0,
    speed: 0
  });
  uploadTaskRuntimePayloadMap.set(taskId, { uploadItem, batchMeta });
  return taskId;
};

const buildUploadErrorMessage = (message, fileName) => {
  const text = String(message || "").trim();
  if (!text) return "";
  const name = String(fileName || "").trim();
  if (name && text.includes("格式不支持")) {
    return `${text}：${name}`;
  }
  return text;
};

const runUploadTask = (taskId, uploadItem, batchMeta = null) => new Promise((resolve) => {
  const task = state.uploadTasks.find((item) => item.id === taskId);
  if (!task || task.status === "canceled" || task.cancelRequested) {
    resolve();
    return;
  }
  const startTime = Date.now();
  updateUploadTask(taskId, { 
    status: "uploading", 
    progress: 0,
    uploaded: 0,
    lastUpdateTime: startTime,
    lastUploaded: 0,
    speed: 0
  });

  const sendUpload = async () => {
    const abortController = new AbortController();
    task.abortController = abortController;
    task.xhr = { abort: () => abortController.abort() };
    const thumbnailDataUrl = await createUploadImageThumbnailDataUrl(uploadItem.file);
    if (isChunkUploadFileSize(uploadItem.file.size)) {
      try {
        await uploadLargeFileByChunks({ taskId, uploadItem, thumbnailDataUrl, abortController, batchMeta });
        updateUploadTask(taskId, { status: "completed", progress: 100 });
        refreshAll();
      } catch (error) {
        if (task.status === "paused") {
          // Do not cleanup session if paused
        } else {
          cleanupChunkUploadSession(task.uploadSessionId);
          cleanupChunkUploadSessionByTaskId(taskId);
          if (task.cancelRequested || abortController.signal.aborted || (error && error.name === "AbortError")) {
            updateUploadTask(taskId, { status: "canceled", uploadSessionId: "" });
          } else {
            const errorMessage = buildUploadErrorMessage(error && error.message, uploadItem && uploadItem.file ? uploadItem.file.name : "");
            if (errorMessage) {
              alert(errorMessage);
            }
            updateUploadTask(taskId, { status: "canceled", uploadSessionId: "" });
          }
        }
      }
      resolve();
      return;
    }
    
    // 普通上传处理函数
    const performUpload = async (currentStrategy = "cancel") => {
      return new Promise((uploadResolve, uploadReject) => {
        const xhr = new XMLHttpRequest();
        task.xhr = xhr;
        xhr.open("POST", appendFileSpaceToUrl("/api/upload"), true);
        const startTime = Date.now();
        let lastUpdateTime = startTime;
        let lastUploadedBytes = 0;
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const progress = Math.min(99, Math.floor((event.loaded / event.total) * 100));
          
          const now = Date.now();
          const timeDiff = now - lastUpdateTime;
          let speed = 0;
          if (timeDiff > 0) {
            speed = (event.loaded - lastUploadedBytes) / (timeDiff / 1000);
          }
          
          updateUploadTask(taskId, { 
            progress,
            uploaded: event.loaded,
            lastUpdateTime: now,
            lastUploaded: event.loaded,
            speed
          });
        };
        xhr.onabort = () => {
          if (task.status !== "paused") {
            updateUploadTask(taskId, { status: "canceled" });
          }
          uploadReject(new Error("上传已取消"));
        };
        xhr.onerror = () => {
          if (task.status !== "paused") {
            updateUploadTask(taskId, { status: "canceled" });
          }
          uploadReject(new Error("上传失败"));
        };
        xhr.onload = async () => {
          if (xhr.status === 401) {
            clearLoginSessionStorage();
            window.location.href = "/";
            uploadReject(new Error("未登录"));
            return;
          }
          
          let responseData = {};
          try {
            responseData = JSON.parse(xhr.responseText || "{}");
          } catch (e) {}
          
          if (xhr.status === 409 && responseData.conflict) {
            const fileName = responseData.fileName || (uploadItem && uploadItem.file ? uploadItem.file.name : "");
            
            // 显示选择对话框
            const selectedStrategy = await showAppSelect({
              title: "文件已存在",
              message: `文件 "${fileName}" 已存在，请选择处理方式：`,
              options: [
                { value: "auto_rename", label: "自动重命名" },
                { value: "overwrite", label: "覆盖原文件" },
                { value: "cancel", label: "取消上传" }
              ],
              defaultValue: "auto_rename"
            });
            
            if (selectedStrategy === null || selectedStrategy === "cancel") {
              uploadReject(new Error("上传已取消"));
              return;
            }
            
            // 重新尝试上传，使用选择的策略
            try {
              const finalResult = await performUpload(selectedStrategy);
              uploadResolve(finalResult);
              return;
            } catch (retryError) {
              uploadReject(retryError);
              return;
            }
          }
          
          if (xhr.status >= 200 && xhr.status < 300) {
            updateUploadTask(taskId, { status: "completed", progress: 100 });
            refreshAll();
            uploadResolve(responseData);
            return;
          }
          
          let errorMessage = "";
          errorMessage = String(responseData.message || "");
          const finalErrorMessage = buildUploadErrorMessage(errorMessage, uploadItem && uploadItem.file ? uploadItem.file.name : "");
          if (finalErrorMessage) {
            alert(finalErrorMessage);
          }
          updateUploadTask(taskId, { status: "canceled" });
          uploadReject(new Error(finalErrorMessage || "上传失败"));
        };
        const formData = new FormData();
        formData.append("files", uploadItem.file, uploadItem.file.name);
        formData.append("folderId", state.currentFolderId === null ? "null" : String(state.currentFolderId));
        formData.append("uploadBatchId", batchMeta && batchMeta.batchId ? String(batchMeta.batchId) : "");
        formData.append("uploadBatchTotal", batchMeta && Number.isFinite(Number(batchMeta.batchTotal)) ? String(Math.floor(Number(batchMeta.batchTotal))) : "1");
        formData.append("uploadStrategy", currentStrategy);
        if (uploadItem.relativePath) {
          formData.append("relativePaths", uploadItem.relativePath.replace(/\\/g, "/"));
        }
        if (thumbnailDataUrl) {
          formData.append("thumbnailDataUrls", thumbnailDataUrl);
        }
        xhr.send(formData);
      });
    };
    
    try {
      await performUpload("cancel");
      resolve();
    } catch (error) {
      if (task.cancelRequested || abortController.signal.aborted || (error && error.name === "AbortError")) {
        updateUploadTask(taskId, { status: "canceled" });
      } else {
        if (!String(error && error.message).includes("上传已取消")) {
          const errorMessage = buildUploadErrorMessage(error && error.message, uploadItem && uploadItem.file ? uploadItem.file.name : "");
          if (errorMessage) {
            alert(errorMessage);
          }
        }
        updateUploadTask(taskId, { status: "canceled" });
      }
      resolve();
    }
  };
  sendUpload();
});

const tryStartPendingUploadTasks = () => {
  const limit = getEffectiveConcurrentUploadLimit();
  while (uploadActiveWorkerCount < limit) {
    const nextTask = state.uploadTasks.find((task) => {
      if (!task || task.status !== "pending" || task.cancelRequested) return false;
      return uploadTaskRuntimePayloadMap.has(task.id);
    });
    if (!nextTask) break;
    const runtimePayload = uploadTaskRuntimePayloadMap.get(nextTask.id);
    if (!runtimePayload) break;
    uploadActiveWorkerCount += 1;
    runUploadTask(nextTask.id, runtimePayload.uploadItem, runtimePayload.batchMeta)
      .finally(() => {
        const latestTask = state.uploadTasks.find((item) => item.id === nextTask.id);
        const shouldKeepRuntimePayload = !!latestTask && latestTask.status === "paused";
        if (!shouldKeepRuntimePayload) {
          uploadTaskRuntimePayloadMap.delete(nextTask.id);
        }
        uploadActiveWorkerCount = Math.max(0, uploadActiveWorkerCount - 1);
        tryStartPendingUploadTasks();
      });
  }
};

const checkUploadQuota = async (items) => {
  const uploadSize = items.reduce((total, item) => total + Math.max(0, Number(item && item.file ? item.file.size : 0)), 0);
  if (uploadSize <= 0) return true;
  try {
    const res = await request("/api/stats");
    if (!res.ok) return true;
    const stats = await res.json();
    state.currentUserStats = stats;
    const used = Number(stats.totalSize || 0);
    const quota = Number(stats.quota || -1);
    if (quota !== -1 && used + uploadSize > quota) {
      alert("超出空间配额，无法上传");
      return false;
    }
  } catch (e) {}
  return true;
};

const getEffectiveUploadFileCountLimit = () => {
  const groupLimitRaw = state.currentUser && Object.prototype.hasOwnProperty.call(state.currentUser, "groupUploadMaxFileCount")
    ? Number(state.currentUser.groupUploadMaxFileCount)
    : NaN;
  if (Number.isFinite(groupLimitRaw)) {
    const groupLimit = Math.floor(groupLimitRaw);
    if (groupLimit === -1) return -1;
    if (groupLimit > 0) return Math.max(1, Math.min(1000, groupLimit));
  }
  const systemLimit = Math.floor(Number(state.maxUploadFileCount || 100));
  if (!Number.isFinite(systemLimit) || systemLimit <= 0) return 100;
  return Math.max(1, Math.min(1000, systemLimit));
};

const getEffectiveConcurrentUploadLimit = () => {
  const value = Math.floor(Number(state.maxConcurrentUploadCount || 3));
  if (!Number.isFinite(value) || value <= 0) return 3;
  return Math.max(1, Math.min(20, value));
};

const refreshUploadLimitsFromServer = async () => {
  try {
    const res = await fetch("/api/public-settings");
    if (!res.ok) return;
    const settings = await res.json().catch(() => ({}));
    const system = settings && settings.system && typeof settings.system === "object" ? settings.system : {};
    const maxUploadFileCount = Math.max(1, Math.min(1000, Math.floor(Number(system.maxUploadFileCount) || state.maxUploadFileCount || 100)));
    const maxConcurrentUploadCount = Math.max(1, Math.min(20, Math.floor(Number(system.maxConcurrentUploadCount) || state.maxConcurrentUploadCount || 3)));
    const chunkUploadThresholdMb = Math.max(1, Math.min(102400, Math.floor(Number(system.chunkUploadThresholdMb) || state.chunkUploadThresholdMb || DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB)));
    const uploadAllowedExtSet = normalizeUploadAllowedExtSet(system.uploadCategoryRules);
    state.maxUploadFileCount = maxUploadFileCount;
    state.maxConcurrentUploadCount = maxConcurrentUploadCount;
    state.chunkUploadThresholdMb = chunkUploadThresholdMb;
    state.chunkUploadThresholdBytes = chunkUploadThresholdMb * 1024 * 1024;
    state.uploadAllowedExtSet = uploadAllowedExtSet;
  } catch (e) {}
};

const uploadBatch = async (items) => {
  if (!ensurePermission("upload")) return;
  if (isRecycleUploadRestricted()) {
    alert("回收站中无法上传");
    return;
  }
  if (!Array.isArray(items) || items.length === 0) return;
  await refreshUploadLimitsFromServer();
  const unsupportedItems = collectUnsupportedUploadItems(items);
  if (unsupportedItems.length > 0) {
    showUnsupportedUploadFormatNotice(unsupportedItems);
    return;
  }
  const uploadFileCountLimit = getEffectiveUploadFileCountLimit();
  if (uploadFileCountLimit > 0 && items.length > uploadFileCountLimit) {
    alert(`单次最多上传 ${uploadFileCountLimit} 个文件`);
    return;
  }
  const quotaAllowed = await checkUploadQuota(items);
  if (!quotaAllowed) return;
  const batchMeta = {
    batchId: `${Date.now()}-${createClientUuid()}`,
    batchTotal: items.length
  };
  state.uploadTasksPage = 1;
  items.forEach((item) => {
    enqueueUploadTask(item, batchMeta);
  });
  renderUploadTasks();
  schedulePersistUploadTasks();
  tryStartPendingUploadTasks();
};

if (uploadFileBtn) {
  uploadFileBtn.onclick = () => {
    if (!ensurePermission("upload")) return;
    if (isRecycleUploadRestricted()) {
      alert("回收站中无法上传");
      return;
    }
    fileInput.click();
  };
}

if (uploadDirBtn) {
  uploadDirBtn.onclick = () => {
    if (!ensurePermission("upload")) return;
    if (isRecycleUploadRestricted()) {
      alert("回收站中无法上传");
      return;
    }
    dirInput.click();
  };
}

if (mobileUploadMenuBtn && mobileUploadPopover) {
  mobileUploadMenuBtn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isShown = mobileUploadPopover.classList.toggle("show");
    mobileUploadMenuBtn.classList.toggle("active", isShown);
  };
}

if (mobileUploadFileBtn && mobileUploadPopover) {
  mobileUploadFileBtn.onclick = () => {
    if (!ensurePermission("upload")) return;
    if (isRecycleUploadRestricted()) {
      alert("回收站中无法上传");
      return;
    }
    mobileUploadPopover.classList.remove("show");
    mobileUploadMenuBtn.classList.remove("active");
    fileInput.click();
  };
}

if (mobileUploadDirBtn && mobileUploadPopover) {
  mobileUploadDirBtn.onclick = () => {
    if (!ensurePermission("upload")) return;
    if (isRecycleUploadRestricted()) {
      alert("回收站中无法上传");
      return;
    }
    mobileUploadPopover.classList.remove("show");
    mobileUploadMenuBtn.classList.remove("active");
    dirInput.click();
  };
}

if (mobileUploadEntry && mobileUploadPopover) {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (mobileUploadEntry.contains(event.target)) return;
    mobileUploadPopover.classList.remove("show");
    mobileUploadMenuBtn.classList.remove("active");
  });
}

fileInput.onchange = () => {
  if (!fileInput.files.length) return;
  const items = Array.from(fileInput.files).map((file) => createUploadItem(file));
  uploadBatch(items);
  fileInput.value = "";
};

if (dirInput) {
  dirInput.onchange = () => {
    if (!dirInput.files.length) return;
    const items = Array.from(dirInput.files).map((file) => createUploadItem(file, file.webkitRelativePath || file.name));
    uploadBatch(items);
    dirInput.value = "";
  };
}

if (selectAllCheckbox) {
  selectAllCheckbox.onchange = () => {
    setCurrentPageSelection(!!selectAllCheckbox.checked);
  };
}

if (gridSelectAllBtn) {
  gridSelectAllBtn.onclick = () => {
    const currentPageEntries = getCurrentFilePageEntries();
    const visible = currentPageEntries.length;
    if (visible === 0) return;
    const selectedVisible = currentPageEntries.filter((entry) => isEntrySelected(entry)).length;
    setCurrentPageSelection(selectedVisible !== visible);
  };
}

if (filePrevPageBtn) {
  filePrevPageBtn.onclick = async () => {
    state.filePage = Math.max(1, state.filePage - 1);
    clearSelection();
    state.selectedEntry = null;
    renderDetails(null);
    await loadEntries();
    renderFileList();
  };
}

if (fileNextPageBtn) {
  fileNextPageBtn.onclick = async () => {
    const { totalPages } = getPaginationInfo(state.entriesTotal, state.filePage, state.filePageSize);
    state.filePage = Math.min(totalPages, state.filePage + 1);
    clearSelection();
    state.selectedEntry = null;
    renderDetails(null);
    await loadEntries();
    renderFileList();
  };
}

if (filePageSizeSelect) {
  filePageSizeSelect.onchange = async () => {
    state.filePageSize = normalizePageSize(filePageSizeSelect.value);
    state.filePage = 1;
    clearSelection();
    state.selectedEntry = null;
    renderDetails(null);
    await loadEntries();
    renderFileList();
  };
}

if (batchCopyBtn) {
  batchCopyBtn.onclick = () => {
    if (!ensurePermission("copy")) return;
    const selected = getSelectedEntries();
    if (selected.length === 0) {
      alert("请先选择文件或文件夹");
      return;
    }
    state.clipboardAction = "copy";
    state.clipboardEntries = selected;
    updateBatchActionState();
  };
}

if (batchMoveBtn) {
  batchMoveBtn.onclick = () => {
    if (!ensurePermission("move")) return;
    const selected = getSelectedEntries();
    if (selected.length === 0) {
      alert("请先选择文件或文件夹");
      return;
    }
    state.clipboardAction = "move";
    state.clipboardEntries = selected;
    updateBatchActionState();
  };
}

if (batchDownloadBtn) {
  batchDownloadBtn.onclick = async () => {
    if (!ensurePermission("download")) return;
    if (state.view === "recycle") {
      alert("回收站中无法下载");
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
    if (selectedEntries.length === 1) {
      startDownloadTask(selectedEntries[0]);
      return;
    }
    await startBatchDownloadTask(selectedEntries);
  };
}

if (batchArchiveBtn) {
  batchArchiveBtn.onclick = async () => {
    await createBatchArchive();
  };
}

if (batchDeleteBtn) {
  batchDeleteBtn.onclick = async () => {
    if (!ensurePermission("delete")) return;
    const selected = getSelectedEntries();
    const fallbackSelected = (!selected.length && state.selectedEntry)
      ? [{ id: state.selectedEntry.id, type: state.selectedEntry.type, name: state.selectedEntry.name }]
      : [];
    const finalSelected = selected.length > 0 ? selected : fallbackSelected;
    if (finalSelected.length === 0) {
      alert("请先选择文件或文件夹");
      return;
    }
    if (!selected.length && fallbackSelected.length > 0) {
      state.selectedEntries = fallbackSelected;
      updateBatchActionState();
    }
    const selectedDetails = resolveSelectedEntryDetails(finalSelected);
    const confirmed = await showDeleteConfirm({
      title: "确定删除",
      messageHtml: buildDeleteConfirmMessageHtml(selectedDetails),
      desc: "删除的文件可在 30 天内通过回收站还原"
    });
    if (!confirmed) return;
    await submitBatchAction("delete");
  };
}

if (batchRestoreBtn) {
  batchRestoreBtn.onclick = async () => {
    if (state.view !== "recycle") return;
    await restoreSelectedEntries();
  };
}

if (clearSelectionBtn) {
  clearSelectionBtn.onclick = () => {
    clearSelection();
    state.selectedEntry = null;
    renderDetails(null);
    refreshAll();
  };
}

if (batchPasteBtn) {
  batchPasteBtn.onclick = async () => {
    if (state.view === "recycle") {
      alert("回收站中无法粘贴");
      return;
    }
    if (!state.clipboardAction || state.clipboardEntries.length === 0) {
      alert("没有可粘贴的内容");
      return;
    }
    if (state.clipboardAction === "copy" && !ensurePermission("copy")) return;
    if (state.clipboardAction === "move" && !ensurePermission("move")) return;
    await submitBatchAction(state.clipboardAction, state.currentFolderId);
  };
}

if (batchCancelBtn) {
  batchCancelBtn.onclick = () => {
    clearBatchClipboard();
  };
}

newFolderBtn.onclick = async () => {
  if (state.view === 'recycle') {
    alert("回收站中无法创建文件夹");
    return;
  }
  if (state.category) {
    state.category = "";
    state.view = "files";
    refreshAll();
  }
  if (newFolderForm && newFolderModal && newFolderNameInput) {
    newFolderForm.reset();
    newFolderNameInput.value = "新建文件夹";
    newFolderModal.style.display = "flex";
    newFolderNameInput.focus();
    newFolderNameInput.select();
  }
};

if (refreshDirBtn) {
  refreshDirBtn.onclick = async () => {
    await refreshAll();
  };
}

if (refreshCapacityBtn) {
  refreshCapacityBtn.onclick = async () => {
    await loadStats();
  };
}

if (cancelNewFolderBtn && newFolderModal) {
  cancelNewFolderBtn.onclick = () => {
    newFolderModal.style.display = "none";
  };
}

if (newFolderForm && newFolderModal && newFolderNameInput) {
  newFolderForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = newFolderNameInput.value.trim();
    if (!name) return;
    try {
      const res = await request("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: state.currentFolderId })
      });
      if (res.ok) {
        newFolderModal.style.display = "none";
        refreshAll();
      } else {
        const data = await res.json();
        alert(data.message || "创建失败");
      }
    } catch (e) {
      console.error(e);
      alert("创建失败");
    }
  };
}

if (cancelRenameBtn && renameModal) {
  cancelRenameBtn.onclick = () => {
    renameModal.style.display = "none";
  };
}

if (renameForm && renameModal && renameInput) {
  renameForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!state.selectedEntry) return;
    if (!ensurePermission("rename")) return;
    const newName = renameInput.value.trim();
    if (!newName) return;
    const url = state.selectedEntry.type === "folder" ? `/api/folders/${state.selectedEntry.id}` : `/api/files/${state.selectedEntry.id}`;
    try {
      const res = await request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName })
      });
      if (res.ok) {
        renameModal.style.display = "none";
        refreshAll();
      } else {
        const data = await res.json();
        alert(data.message || "重命名失败");
      }
    } catch (e) {
      console.error(e);
      alert("重命名失败");
    }
  };
}

const updateSearchScopeUi = () => {
  if (!searchScopeGroup) return;
  state.searchScope = "all";
  searchScopeGroup.querySelectorAll(".search-scope-option").forEach((option) => {
    const scope = "all";
    option.classList.toggle("active", scope === state.searchScope);
  });
};

const triggerSearch = () => {
  clearSelection();
  const nextKeyword = searchInput.value.trim();
  if (nextKeyword && !state.keyword) {
    state.searchOriginFolderId = state.currentFolderId;
  }
  if (!nextKeyword) {
    state.searchOriginFolderId = null;
  }
  state.searchScope = "all";
  state.keyword = nextKeyword;
  state.view = "files";
  state.category = "";
  refreshAll();
};

searchBtn.onclick = () => {
  triggerSearch();
};

searchInput.onkeyup = (e) => {
  if (e.key === "Enter") {
    triggerSearch();
  }
};

if (searchScopeGroup) {
  searchScopeGroup.onclick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const option = target ? target.closest(".search-scope-option") : null;
    if (!option) return;
    const nextScope = "all";
    if (state.searchScope === nextScope) return;
    state.searchScope = nextScope;
    updateSearchScopeUi();
  };
  updateSearchScopeUi();
}

const toggleDetailsBtn = document.getElementById("toggleDetailsBtn");
const detailsSidebarOverlay = document.getElementById("detailsSidebarOverlay");
if (toggleDetailsBtn) {
  toggleDetailsBtn.onclick = () => {
    if (!detailsSidebar) return;
    if (filesContentContainer && filesContentContainer.classList.contains("hidden")) {
      setUploadTasksViewVisible(false);
    }
    const willShow = detailsSidebar.classList.contains("hidden");
    detailsSidebar.classList.toggle("hidden");
    if (detailsSidebarOverlay) {
      detailsSidebarOverlay.classList.toggle("show", willShow && isMobileViewport());
    }
    if (willShow) {
      setUploadTasksViewVisible(false);
    }
  };
}

if (viewModeBtn && gridSizeSelector) {
  viewModeBtn.onclick = async () => {
    const prevViewMode = state.viewMode;
    const prevGridSize = state.gridSize;
    state.viewMode = state.viewMode === "grid" ? "list" : "grid";
    try {
      await persistViewPreference();
      refreshAll();
    } catch (error) {
      state.viewMode = prevViewMode;
      state.gridSize = prevGridSize;
      refreshAll();
      alert(error && error.message ? error.message : "视图偏好保存失败");
    }
  };
  gridSizeSelector.onclick = async (e) => {
    const option = e.target.closest(".grid-size-option");
    if (!option) return;
    const prevViewMode = state.viewMode;
    const prevGridSize = state.gridSize;
    state.viewMode = "grid";
    state.gridSize = normalizeGridSizePreference(option.dataset.size);
    try {
      await persistViewPreference();
      refreshAll();
    } catch (error) {
      state.viewMode = prevViewMode;
      state.gridSize = prevGridSize;
      refreshAll();
      alert(error && error.message ? error.message : "视图偏好保存失败");
    }
  };
}

if (timelineModeToggleBtn) {
  timelineModeToggleBtn.onclick = async () => {
    state.categoryTimelineEnabled = !state.categoryTimelineEnabled;
    localStorage.setItem(CATEGORY_TIMELINE_MODE_STORAGE_KEY, state.categoryTimelineEnabled ? "1" : "0");
    try {
      await request("/api/auth/timeline-preference", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timelineEnabled: state.categoryTimelineEnabled
        })
      });
    } catch (error) {
      // 保存失败时回滚本地状态
      state.categoryTimelineEnabled = !state.categoryTimelineEnabled;
      localStorage.setItem(CATEGORY_TIMELINE_MODE_STORAGE_KEY, state.categoryTimelineEnabled ? "1" : "0");
    }
    renderFileList();
  };
}

closeDetailsBtn.onclick = () => {
  detailsSidebar.classList.add("hidden");
  if (detailsSidebarOverlay) detailsSidebarOverlay.classList.remove("show");
};

if (detailsSidebarOverlay) {
  detailsSidebarOverlay.onclick = () => {
    detailsSidebar.classList.add("hidden");
    detailsSidebarOverlay.classList.remove("show");
  };
}
if (closeUploadTasksBtn) {
  closeUploadTasksBtn.onclick = () => {
    setUploadTasksViewVisible(false);
    syncRouteByCurrentState();
  };
}
if (closeMySharesBtn) {
  closeMySharesBtn.onclick = () => {
    setMySharesViewVisible(false);
    syncRouteByCurrentState();
  };
}

const performLogout = async () => {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (e) {}
  clearLoginSessionStorage();
  window.location.href = "/";
};

if (logoutBtn) {
  logoutBtn.onclick = async (e) => {
    e.preventDefault();
    if (logoutBtn.disabled) return;
    logoutBtn.disabled = true;
    await performLogout();
  };
}

if (profileLogoutBtn) {
  profileLogoutBtn.onclick = async () => {
    if (profileLogoutBtn.disabled) return;
    profileLogoutBtn.disabled = true;
    await performLogout();
  };
}

document.onclick = () => {
  contextMenu.style.display = "none";
  if (myFilesNamePanel) {
    myFilesNamePanel.classList.remove("visible");
  }
};
initContextMenuIconItems();

document.getElementById("menuOpen").onclick = async () => {
  if (!state.selectedEntry) return;
  if (state.selectedEntry.type === "folder") {
    clearSelection();
    state.currentFolderId = state.selectedEntry.id;
    state.selectedEntry = null;
    state.category = "";
    state.keyword = "";
    if (searchInput) {
      searchInput.value = "";
    }
    refreshAll();
  } else {
    if (isArchiveFileEntry(state.selectedEntry)) {
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
        await viewZipArchiveEntries(state.selectedEntry);
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
      return;
    }
    openFilePreview(state.selectedEntry);
  }
};

document.getElementById("menuDetail").onclick = async () => {
  await showSelectedEntryDetails();
};

document.getElementById("menuDownload").onclick = () => {
  if (!state.selectedEntry) return;
  startDownloadTask(state.selectedEntry);
};

document.getElementById("menuZipView").onclick = async () => {
  if (!state.selectedEntry || !isArchiveFileEntry(state.selectedEntry)) return;
  if (!ensurePermission("viewArchive")) return;
  await viewZipArchiveEntries(state.selectedEntry);
};

document.getElementById("menuZipExtractCurrent").onclick = async () => {
  if (!state.selectedEntry || !isArchiveFileEntry(state.selectedEntry)) return;
  if (!ensurePermission("extract")) return;
  await extractZipArchive(state.selectedEntry, { targetFolderId: state.currentFolderId });
};

document.getElementById("menuZipExtractTarget").onclick = async () => {
  if (!state.selectedEntry || !isArchiveFileEntry(state.selectedEntry)) return;
  if (!ensurePermission("extract")) return;
  await extractZipArchiveToSpecifiedPath(state.selectedEntry);
};

document.getElementById("menuLocateFolder").onclick = async () => {
  if (!state.selectedEntry || state.selectedEntry.type !== "file" || !state.keyword) return;
  const targetFileId = Number(state.selectedEntry.id);
  const targetParentId = state.selectedEntry.parentId === null || state.selectedEntry.parentId === undefined
    ? null
    : Number(state.selectedEntry.parentId);
  clearSelection();
  state.view = "files";
  state.currentFolderId = Number.isFinite(targetParentId) ? targetParentId : null;
  state.category = "";
  state.keyword = "";
  state.selectedEntry = null;
  if (searchInput) {
    searchInput.value = "";
  }
  updateRouteQuery({ main: "files", side: "myFiles", category: null });
  await refreshAll();
  const matchedEntry = state.entries.find((entry) => entry.type === "file" && Number(entry.id) === targetFileId) || null;
  if (matchedEntry) {
    state.selectedEntry = matchedEntry;
    renderFileList();
    renderDetails(matchedEntry);
    showDetailsSidebar();
  } else {
    renderDetails(null);
  }
};

document.getElementById("menuShare").onclick = () => {
  if (!state.selectedEntry) return;
  if (!ensurePermission("download")) return;
  if (!shareModal) return;
  resetShareModalState();
  shareModal.style.display = "flex";
};

document.getElementById("menuCopy").onclick = () => {
  if (!state.selectedEntry) return;
  if (!ensurePermission("copy")) return;
  clearSelection();
  setEntrySelected(state.selectedEntry, true);
  state.clipboardAction = "copy";
  state.clipboardEntries = getSelectedEntries();
  updateBatchActionState();
};

document.getElementById("menuRename").onclick = async () => {
  if (!state.selectedEntry) return;
  if (!ensurePermission("rename")) return;
  if (renameModal && renameInput) {
    renameInput.value = state.selectedEntry.name || "";
    renameModal.style.display = "flex";
    renameInput.focus();
    renameInput.select();
  }
};

document.getElementById("menuDelete").onclick = async () => {
  if (!state.selectedEntry) return;
  if (!ensurePermission("delete")) return;
  
  const isRecycle = state.view === "recycle";
  const confirmed = await showDeleteConfirm({
    title: isRecycle ? "彻底删除" : "确定删除",
    messageHtml: buildDeleteConfirmMessageHtml([state.selectedEntry]),
    desc: isRecycle ? "彻底删除后将无法恢复" : "删除的文件可在 30 天内通过回收站还原"
  });
  if (!confirmed) return;

  let url;
  if (isRecycle) {
    url = state.selectedEntry.type === "folder" 
      ? `/api/recycle/folders/${state.selectedEntry.id}` 
      : `/api/recycle/files/${state.selectedEntry.id}`;
  } else {
    url = state.selectedEntry.type === "folder" 
      ? `/api/folders/${state.selectedEntry.id}` 
      : `/api/files/${state.selectedEntry.id}`;
  }

  const res = await request(url, { method: "DELETE" });
  if (res.ok) {
    clearSelection();
    state.selectedEntry = null;
    refreshAll();
  }
};

document.getElementById("menuMove").onclick = async () => {
  if (!state.selectedEntry) return;
  if (!ensurePermission("move")) return;
  clearSelection();
  setEntrySelected(state.selectedEntry, true);
  state.clipboardAction = "move";
  state.clipboardEntries = getSelectedEntries();
  updateBatchActionState();
};

if (shareForm && shareCustomCodeInput) {
  shareForm.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || target.name !== "shareCodeMode") return;
    const mode = getShareCodeMode();
    shareCustomCodeInput.style.display = mode === "custom" ? "block" : "none";
    if (mode !== "custom") {
      shareCustomCodeInput.value = "";
    } else {
      shareCustomCodeInput.focus();
    }
  });
}

if (shareExpireOptionList) {
  shareExpireOptionList.addEventListener("click", (event) => {
    const optionBtn = event.target.closest(".share-expire-option");
    if (!optionBtn) return;
    const expireType = String(optionBtn.dataset.expireType || "").trim();
    if (!expireType) return;
    selectedShareExpireType = expireType;
    shareExpireOptionList.querySelectorAll(".share-expire-option").forEach((item) => {
      item.classList.toggle("active", item === optionBtn);
    });
  });
}

if (cancelShareBtn && shareModal) {
  cancelShareBtn.onclick = () => {
    shareModal.style.display = "none";
  };
}

if (shareForm && shareModal) {
  shareForm.onsubmit = async (event) => {
    event.preventDefault();
    if (!state.selectedEntry) return;
    const mode = generateShareBtn && generateShareBtn.dataset.mode ? generateShareBtn.dataset.mode : "generate";
    if (mode === "copy" && latestSharePayload && latestSharePayload.shareUrl) {
      let copyText = latestSharePayload.shareUrl;
      if (latestSharePayload.accessCode && latestSharePayload.accessCode !== "无") {
        copyText = `分享链接：${latestSharePayload.shareUrl}\n提取码：${latestSharePayload.accessCode}`;
      }
      try {
        let copySuccess = false;
        if (navigator.clipboard && window.isSecureContext) {
          try {
            await navigator.clipboard.writeText(copyText);
            copySuccess = true;
          } catch (e) {
            // 静默处理错误，因为我们有降级方案
          }
        }
        
        if (!copySuccess) {
          const textarea = document.createElement("textarea");
          textarea.value = copyText;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          textarea.style.left = "-9999px";
          textarea.style.top = "-9999px";
          document.body.appendChild(textarea);
          try {
            textarea.select();
            textarea.setSelectionRange(0, 99999);
            const res = document.execCommand("copy");
            if (res) {
              copySuccess = true;
            }
          } catch (e) {
            console.warn("execCommand failed:", e);
          } finally {
            document.body.removeChild(textarea);
          }
        }
        
        if (copySuccess) {
          await showAppNotice({
            message: latestSharePayload.accessCode && latestSharePayload.accessCode !== "无" ? "已复制分享链接和提取码" : "已复制分享链接",
            action: "copyShareWithCode"
          });
        } else {
          throw new Error("复制失败");
        }
      } catch (error) {
        await showAppNotice({
          message: "复制失败，请手动复制",
          action: "copyShareWithCode",
          noticeType: APP_NOTICE_TYPE.ERROR
        });
      }
      return;
    }
    const codeMode = getShareCodeMode();
    const customCode = shareCustomCodeInput ? shareCustomCodeInput.value.trim() : "";
    if (codeMode === "custom" && !/^[A-Za-z0-9]{4,12}$/.test(customCode)) {
      alert("自定义提取码仅支持4-12位字母数字");
      return;
    }
    if (generateShareBtn) {
      generateShareBtn.disabled = true;
      generateShareBtn.textContent = "生成中...";
    }
    try {
      const res = await request("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: state.selectedEntry.type,
          entryId: state.selectedEntry.id,
          expireType: selectedShareExpireType,
          codeMode,
          accessCode: customCode
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || "生成分享失败");
        return;
      }
      if (shareResultBox) shareResultBox.style.display = "block";
      if (shareLinkText) {
        shareLinkText.textContent = data.shareUrl || "";
        shareLinkText.href = data.shareUrl || "#";
      }
      if (shareCodeText) {
        shareCodeText.textContent = data.accessCode || "无";
      }
      if (shareExpireText) {
        shareExpireText.textContent = data.expireLabel || "";
      }
      latestSharePayload = {
        shareUrl: data.shareUrl || "",
        accessCode: data.accessCode || ""
      };
      if (generateShareBtn) {
        generateShareBtn.textContent = "复制链接";
        generateShareBtn.dataset.mode = "copy";
      }
    } catch (error) {
      alert("生成分享失败");
    } finally {
      if (generateShareBtn) {
        generateShareBtn.disabled = false;
      }
    }
  };
}

if (uploadTaskList) {
  uploadTaskList.onclick = async (event) => {
    const selectInput = event.target.closest("input[data-upload-select]");
    if (selectInput) {
      const taskId = String(selectInput.dataset.uploadSelect || "").trim();
      if (!taskId) return;
      setUploadTaskSelected(taskId, !!selectInput.checked);
      renderUploadTasks();
      return;
    }
    const pauseBtn = event.target.closest("[data-upload-pause]");
    if (pauseBtn) {
      const taskId = pauseBtn.dataset.uploadPause;
      pauseUploadTask(taskId);
      return;
    }
    const resumeBtn = event.target.closest("[data-upload-resume]");
    if (resumeBtn) {
      const taskId = resumeBtn.dataset.uploadResume;
      resumeUploadTask(taskId);
      return;
    }
    const cancelBtn = event.target.closest("[data-upload-cancel]");
    if (cancelBtn) {
      const taskId = cancelBtn.dataset.uploadCancel;
      cancelUploadTask(taskId);
      return;
    }
    const deleteBtn = event.target.closest("[data-upload-delete]");
    if (!deleteBtn) return;
    await removeUploadTask(deleteBtn.dataset.uploadDelete);
  };
}

if (downloadTaskList) {
  downloadTaskList.onclick = async (event) => {
    const selectInput = event.target.closest("input[data-download-select]");
    if (selectInput) {
      const taskId = String(selectInput.dataset.downloadSelect || "").trim();
      if (!taskId) return;
      setDownloadTaskSelected(taskId, !!selectInput.checked);
      renderDownloadTasks();
      return;
    }
    const pauseBtn = event.target.closest("[data-download-pause]");
    if (pauseBtn) {
      const taskId = pauseBtn.dataset.downloadPause;
      pauseDownloadTask(taskId);
      return;
    }
    const resumeBtn = event.target.closest("[data-download-resume]");
    if (resumeBtn) {
      const taskId = resumeBtn.dataset.downloadResume;
      resumeDownloadTask(taskId);
      return;
    }
    const cancelBtn = event.target.closest("[data-download-cancel]");
    if (cancelBtn) {
      const taskId = String(cancelBtn.dataset.downloadCancel || "");
      const task = state.downloadTasks.find((item) => item.id === taskId);
      if (!task) return;
      if (task.status !== "pending" && task.status !== "downloading" && task.status !== "paused") return;
      
      // 如果有 AbortController，调用 abort()
      if (task.abortController) {
        try {
          task.abortController.abort();
        } catch (e) {}
      }
      
      updateDownloadTask(taskId, { status: "canceled" });
      return;
    }
    const deleteBtn = event.target.closest("[data-download-delete]");
    if (!deleteBtn) return;
    await removeDownloadTask(deleteBtn.dataset.downloadDelete);
  };
}

if (transferUploadTabBtn) {
  transferUploadTabBtn.onclick = () => {
    switchTransferTaskTab("upload");
  };
}

if (transferDownloadTabBtn) {
  transferDownloadTabBtn.onclick = () => {
    switchTransferTaskTab("download");
  };
}

if (myShareList) {
  myShareList.onclick = async (event) => {
    const selectInput = event.target.closest("input[data-share-select]");
    if (selectInput) {
      const shareCode = String(selectInput.dataset.shareSelect || "").trim();
      if (!shareCode) return;
      setMyShareSelected(shareCode, !!selectInput.checked);
      renderMyShares();
      return;
    }
    const copyLinkBtn = event.target.closest("[data-share-copy-link]");
    if (copyLinkBtn) {
      const shareCode = String(copyLinkBtn.dataset.shareCopyLink || "").trim();
      if (!shareCode) return;
      const shareLink = `${window.location.origin}/s/${encodeURIComponent(shareCode)}`;
      try {
        await copyTextToClipboard(shareLink);
        await showAppNotice({
          message: "已复制分享链接",
          action: "copyShareLink"
        });
      } catch (error) {
        await showAppNotice({
          message: "复制失败，请手动复制",
          action: "copyShareLink",
          noticeType: APP_NOTICE_TYPE.ERROR
        });
      }
      return;
    }
    const viewCodeBtn = event.target.closest("[data-share-view-code]");
    if (viewCodeBtn) {
      const shareCode = String(viewCodeBtn.dataset.shareViewCode || "").trim();
      if (!shareCode) return;
      try {
        const res = await request(`/api/shares/${encodeURIComponent(shareCode)}/access-code`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          await showAppNotice({
            message: data.message || "获取提取码失败",
            action: "copyAccessCode",
            noticeType: APP_NOTICE_TYPE.ERROR
          });
          return;
        }
        const accessCode = String(data.accessCode || "").trim();
        if (!accessCode) {
          await showAppNotice({
            message: "当前分享没有提取码",
            action: "copyAccessCode",
            noticeType: APP_NOTICE_TYPE.TIP,
            autoCloseMs: 1200
          });
          return;
        }
        await showAppNotice({
          message: `提取码：${accessCode}`,
          action: "viewAccessCode",
          okText: "复制提码",
          okAction: "copy",
          okPayload: accessCode
        });
      } catch (error) {
        await showAppNotice({
          message: "复制失败，请手动复制",
          action: "copyAccessCode",
          noticeType: APP_NOTICE_TYPE.ERROR,
          autoCloseMs: 1200
        });
      }
      return;
    }
    const row = event.target.closest(".my-share-row");
    if (row && !event.target.closest("button, a, input, label")) {
      const shareCode = String(row.dataset.shareCode || "").trim();
      if (!shareCode) return;
      const checked = state.selectedMyShareCodes.includes(shareCode);
      setMyShareSelected(shareCode, !checked);
      renderMyShares();
      return;
    }
    const cancelBtn = event.target.closest("[data-share-cancel]");
    if (!cancelBtn) return;
    const shareCode = String(cancelBtn.dataset.shareCancel || "").trim();
    if (!shareCode) return;
    const confirmed = await showDeleteConfirm({
      title: "确认取消分享",
      message: "取消分享后，该条分享记录将被删除，好友将无法再访问此分享链接。您确认要取消分享吗？",
      desc: "此操作不可恢复",
      okText: "确认",
      cancelText: "取消"
    });
    if (!confirmed) return;
    const res = await request(`/api/shares/${encodeURIComponent(shareCode)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || "取消分享失败");
      return;
    }
    await loadMyShares();
    renderMyShares();
  };
}

if (myShareSelectAllCheckbox) {
  myShareSelectAllCheckbox.onchange = () => {
    const list = state.myShares.slice();
    const { startIndex, endIndex } = getPaginationInfo(list.length, state.mySharesPage, state.mySharesPageSize);
    const currentList = list.slice(startIndex, endIndex);
    currentList.forEach((item) => {
      setMyShareSelected(item.shareCode, myShareSelectAllCheckbox.checked);
    });
    renderMyShares();
  };
}

if (uploadTaskSelectAllCheckbox) {
  uploadTaskSelectAllCheckbox.onchange = () => {
    const checked = !!uploadTaskSelectAllCheckbox.checked;
    sortUploadTasksForDisplay(state.uploadTasks).forEach((task) => {
      setUploadTaskSelected(task.id, checked);
    });
    renderUploadTasks();
  };
}

if (downloadTaskSelectAllCheckbox) {
  downloadTaskSelectAllCheckbox.onchange = () => {
    const checked = !!downloadTaskSelectAllCheckbox.checked;
    sortDownloadTasksForDisplay(state.downloadTasks).forEach((task) => {
      setDownloadTaskSelected(task.id, checked);
    });
    renderDownloadTasks();
  };
}

if (myShareBatchCancelBtn) {
  myShareBatchCancelBtn.onclick = async () => {
    const selectedCodes = state.selectedMyShareCodes.slice();
    if (selectedCodes.length === 0) return;
    const confirmed = await showDeleteConfirm({
      title: "确认取消分享",
      message: "取消分享后，该条分享记录将被删除，好友将无法再访问此分享链接。您确认要取消分享吗？",
      desc: `已选择 ${selectedCodes.length} 条分享`,
      okText: "确认",
      cancelText: "取消"
    });
    if (!confirmed) return;
    const results = await Promise.all(selectedCodes.map((shareCode) => request(`/api/shares/${encodeURIComponent(shareCode)}`, { method: "DELETE" })));
    const failedCount = results.filter((res) => !res.ok).length;
    if (failedCount > 0) {
      alert(`已取消 ${selectedCodes.length - failedCount} 条，失败 ${failedCount} 条`);
    } else {
      alert(`已取消 ${selectedCodes.length} 条分享`);
    }
    state.selectedMyShareCodes = [];
    if (myShareSelectAllCheckbox) {
      myShareSelectAllCheckbox.checked = false;
      myShareSelectAllCheckbox.indeterminate = false;
    }
    await loadMyShares();
    renderMyShares();
  };
}

if (clearUploadTasksBtn) {
  clearUploadTasksBtn.onclick = async () => {
    const isUploadTab = state.transferTaskTab === "upload";
    const hasCompletedTasks = isUploadTab 
      ? state.uploadTasks.some(t => t.status === "completed") 
      : state.downloadTasks.some(t => t.status === "completed");
      
    if (!hasCompletedTasks) {
      if (typeof window.showAppNotice === "function") {
        window.showAppNotice({ title: "提示", message: "没有已完成的记录", isError: true });
      } else {
        alert("没有已完成的记录");
      }
      return;
    }

    const confirmed = await showDeleteConfirm({
      title: "清空记录",
      message: isUploadTab ? "确定清空已完成的上传记录吗？" : "确定清空已完成的下载记录吗？",
      desc: "清空后无法恢复"
    });
    if (!confirmed) return;

    if (isUploadTab) {
      const completedIds = state.uploadTasks.filter(t => t.status === "completed").map(t => t.id);
      state.selectedUploadTaskIds = state.selectedUploadTaskIds.filter(id => !completedIds.includes(id));
      state.uploadTasks = state.uploadTasks.filter(t => t.status !== "completed");
      renderUploadTasks();
      schedulePersistUploadTasks();
      return;
    }
    
    const completedIds = state.downloadTasks.filter(t => t.status === "completed").map(t => t.id);
    state.selectedDownloadTaskIds = state.selectedDownloadTaskIds.filter(id => !completedIds.includes(id));
    state.downloadTasks = state.downloadTasks.filter(t => t.status !== "completed");
    renderDownloadTasks();
    schedulePersistDownloadTasks();
  };
}

if (cancelSelectedTransferTasksBtn) {
  cancelSelectedTransferTasksBtn.onclick = async () => {
    const isUploadTab = state.transferTaskTab === "upload";
    const cancelableSelectedCount = getCancelableSelectedTransferTaskCount();
    if (cancelableSelectedCount <= 0) return;
    if (isUploadTab) {
      const targetIds = state.selectedUploadTaskIds.slice();
      if (targetIds.length === 0) return;
      targetIds.forEach((taskId) => {
        cancelUploadTask(taskId);
      });
      state.selectedUploadTaskIds = [];
      renderUploadTasks();
      return;
    }
    const targetIds = state.selectedDownloadTaskIds.slice();
    if (targetIds.length === 0) return;
    targetIds.forEach((taskId) => {
      const task = state.downloadTasks.find((item) => item.id === taskId);
      if (!task || (task.status !== "downloading" && task.status !== "pending")) return;
      updateDownloadTask(taskId, { status: "canceled" });
    });
    state.selectedDownloadTaskIds = [];
    renderDownloadTasks();
  };
}

if (clearSelectedTransferTasksBtn) {
  clearSelectedTransferTasksBtn.onclick = async () => {
    const isUploadTab = state.transferTaskTab === "upload";
    const selectedIds = isUploadTab ? state.selectedUploadTaskIds.slice() : state.selectedDownloadTaskIds.slice();
    const selectedCount = selectedIds.length;
    if (selectedCount === 0) return;
    const confirmed = await showDeleteConfirm({
      title: "批量清除记录",
      message: isUploadTab ? `确定清除选中的 ${selectedCount} 条上传记录吗？` : `确定清除选中的 ${selectedCount} 条下载记录吗？`,
      desc: "清除后无法恢复"
    });
    if (!confirmed) return;
    if (isUploadTab) {
      await Promise.all(selectedIds.map((taskId) => removeUploadTask(taskId)));
      renderUploadTasks();
      return;
    }
    await Promise.all(selectedIds.map((taskId) => removeDownloadTask(taskId)));
    renderDownloadTasks();
  };
}

if (uploadTaskPrevPageBtn) {
  uploadTaskPrevPageBtn.onclick = () => {
    state.uploadTasksPage = Math.max(1, state.uploadTasksPage - 1);
    renderUploadTasks();
  };
}

if (uploadTaskNextPageBtn) {
  uploadTaskNextPageBtn.onclick = () => {
    const { totalPages } = getPaginationInfo(state.uploadTasks.length, state.uploadTasksPage, state.uploadTasksPageSize);
    state.uploadTasksPage = Math.min(totalPages, state.uploadTasksPage + 1);
    renderUploadTasks();
  };
}

if (uploadTaskPageSizeSelect) {
  uploadTaskPageSizeSelect.onchange = () => {
    state.uploadTasksPageSize = normalizePageSize(uploadTaskPageSizeSelect.value);
    state.uploadTasksPage = 1;
    renderUploadTasks();
  };
}

if (downloadTaskPrevPageBtn) {
  downloadTaskPrevPageBtn.onclick = () => {
    state.downloadTasksPage = Math.max(1, state.downloadTasksPage - 1);
    renderDownloadTasks();
  };
}

if (downloadTaskNextPageBtn) {
  downloadTaskNextPageBtn.onclick = () => {
    const { totalPages } = getPaginationInfo(state.downloadTasks.length, state.downloadTasksPage, state.downloadTasksPageSize);
    state.downloadTasksPage = Math.min(totalPages, state.downloadTasksPage + 1);
    renderDownloadTasks();
  };
}

if (downloadTaskPageSizeSelect) {
  downloadTaskPageSizeSelect.onchange = () => {
    state.downloadTasksPageSize = normalizePageSize(downloadTaskPageSizeSelect.value);
    state.downloadTasksPage = 1;
    renderDownloadTasks();
  };
}

if (mySharePrevPageBtn) {
  mySharePrevPageBtn.onclick = () => {
    state.mySharesPage = Math.max(1, state.mySharesPage - 1);
    renderMyShares();
  };
}

if (myShareNextPageBtn) {
  myShareNextPageBtn.onclick = () => {
    const { totalPages } = getPaginationInfo(state.myShares.length, state.mySharesPage, state.mySharesPageSize);
    state.mySharesPage = Math.min(totalPages, state.mySharesPage + 1);
    renderMyShares();
  };
}

if (mySharePageSizeSelect) {
  mySharePageSizeSelect.onchange = () => {
    state.mySharesPageSize = normalizePageSize(mySharePageSizeSelect.value);
    state.mySharesPage = 1;
    renderMyShares();
  };
}

if (usersPrevPageBtn) {
  usersPrevPageBtn.onclick = () => {
    state.usersPage = Math.max(1, state.usersPage - 1);
    renderUsers();
  };
}

if (usersNextPageBtn) {
  usersNextPageBtn.onclick = () => {
    const { totalPages } = getPaginationInfo(usersData.length, state.usersPage, state.usersPageSize);
    state.usersPage = Math.min(totalPages, state.usersPage + 1);
    renderUsers();
  };
}

if (usersPageSizeSelect) {
  usersPageSizeSelect.onchange = () => {
    state.usersPageSize = normalizePageSize(usersPageSizeSelect.value);
    state.usersPage = 1;
    renderUsers();
  };
}

if (userGroupsPrevPageBtn) {
  userGroupsPrevPageBtn.onclick = () => {
    state.userGroupsPage = Math.max(1, state.userGroupsPage - 1);
    renderUserGroups();
  };
}

if (userGroupsNextPageBtn) {
  userGroupsNextPageBtn.onclick = () => {
    const { totalPages } = getPaginationInfo(userGroupsData.length, state.userGroupsPage, state.userGroupsPageSize);
    state.userGroupsPage = Math.min(totalPages, state.userGroupsPage + 1);
    renderUserGroups();
  };
}

if (userGroupsPageSizeSelect) {
  userGroupsPageSizeSelect.onchange = () => {
    state.userGroupsPageSize = normalizePageSize(userGroupsPageSizeSelect.value);
    state.userGroupsPage = 1;
    renderUserGroups();
  };
}

if (permsPrevPageBtn) {
  permsPrevPageBtn.onclick = () => {
    state.permissionsPage = Math.max(1, state.permissionsPage - 1);
    renderPermissions();
  };
}

if (permsNextPageBtn) {
  permsNextPageBtn.onclick = () => {
    const { totalPages } = getPaginationInfo(usersData.length, state.permissionsPage, state.permissionsPageSize);
    state.permissionsPage = Math.min(totalPages, state.permissionsPage + 1);
    renderPermissions();
  };
}

if (permsPageSizeSelect) {
  permsPageSizeSelect.onchange = () => {
    state.permissionsPageSize = normalizePageSize(permsPageSizeSelect.value);
    state.permissionsPage = 1;
    renderPermissions();
  };
}

const permsSearchInput = document.getElementById("permsSearchInput");
const permsSearchBtn = document.getElementById("permsSearchBtn");
const permsClearSearchBtn = document.getElementById("permsClearSearchBtn");

if (permsSearchBtn) {
  permsSearchBtn.onclick = () => {
    const keyword = permsSearchInput ? permsSearchInput.value.trim().toLowerCase() : "";
    state.permissionsPage = 1;
    renderPermissions();
    if (permsClearSearchBtn) {
      permsClearSearchBtn.style.display = keyword ? "" : "none";
    }
  };
}

if (permsClearSearchBtn) {
  permsClearSearchBtn.onclick = () => {
    if (permsSearchInput) permsSearchInput.value = "";
    state.permissionsPage = 1;
    renderPermissions();
    permsClearSearchBtn.style.display = "none";
  };
}

if (permsSearchInput) {
  permsSearchInput.onkeypress = (e) => {
    if (e.key === "Enter") {
      permsSearchBtn && permsSearchBtn.click();
    }
  };
}

if (quotaPrevPageBtn) {
  quotaPrevPageBtn.onclick = () => {
    state.quotaPage = Math.max(1, state.quotaPage - 1);
    renderQuotaTable();
  };
}

if (quotaNextPageBtn) {
  quotaNextPageBtn.onclick = () => {
    const { totalPages } = getPaginationInfo(usersData.length, state.quotaPage, state.quotaPageSize);
    state.quotaPage = Math.min(totalPages, state.quotaPage + 1);
    renderQuotaTable();
  };
}

if (quotaPageSizeSelect) {
  quotaPageSizeSelect.onchange = () => {
    state.quotaPageSize = normalizePageSize(quotaPageSizeSelect.value);
    state.quotaPage = 1;
    renderQuotaTable();
  };
}

// 空间管理搜索功能
const quotaSearchInput = document.getElementById("quotaSearchInput");
const quotaSearchBtn = document.getElementById("quotaSearchBtn");
const quotaClearSearchBtn = document.getElementById("quotaClearSearchBtn");

if (quotaSearchBtn) {
  quotaSearchBtn.onclick = async () => {
    await handleQuotaSearch();
  };
}

if (quotaClearSearchBtn) {
  quotaClearSearchBtn.onclick = async () => {
    await clearQuotaSearch();
  };
}

if (quotaSearchInput) {
  quotaSearchInput.onkeypress = async (e) => {
    if (e.key === "Enter") {
      await handleQuotaSearch();
    }
  };
}

const readDroppedEntryFiles = async (entry, parentPath = "") => {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file) => resolve([createUploadItem(file, `${parentPath}${file.name}`)]),
        () => resolve([])
      );
    });
  }
  if (entry.isDirectory) {
    const nextPath = `${parentPath}${entry.name}/`;
    const reader = entry.createReader();
    const allChildren = [];
    while (true) {
      const batch = await new Promise((resolve) => {
        reader.readEntries(resolve, () => resolve([]));
      });
      if (!batch.length) break;
      allChildren.push(...batch);
    }
    const results = [];
    for (const child of allChildren) {
      const files = await readDroppedEntryFiles(child, nextPath);
      results.push(...files);
    }
    return results;
  }
  return [];
};

const collectDroppedFiles = async (dataTransfer) => {
  const fromEntry = [];
  const fromItemFile = [];
  const items = dataTransfer?.items ? Array.from(dataTransfer.items) : [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) {
      if (entry.isDirectory) {
        const files = await readDroppedEntryFiles(entry, "");
        fromEntry.push(...files);
      } else {
        const file = item.getAsFile ? item.getAsFile() : null;
        if (file) {
          fromItemFile.push(createUploadItem(file, file.webkitRelativePath || file.name));
        }
      }
      continue;
    }
    const fallbackFile = item.getAsFile ? item.getAsFile() : null;
    if (fallbackFile) {
      fromItemFile.push(createUploadItem(fallbackFile, fallbackFile.webkitRelativePath || fallbackFile.name));
    }
  }

  const fromRawFiles = Array.from(dataTransfer?.files || []).map((file) =>
    createUploadItem(file, file.webkitRelativePath || file.name)
  );

  const merged = [...fromEntry, ...fromItemFile, ...fromRawFiles];
  if (merged.length === 0) return [];

  const uniqueMap = new Map();
  merged.forEach((item) => {
    const file = item && item.file;
    const path = String(item && item.relativePath ? item.relativePath : "");
    const key = file
      ? `${path}::${file.name}::${file.size}::${file.lastModified}`
      : `${path}::unknown`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  });
  return Array.from(uniqueMap.values());
};

const bindDragUpload = () => {
  if (!listViewEl) return;
  let dragDepth = 0;
  const clearDragState = () => {
    dragDepth = 0;
    listViewEl.classList.remove("drag-over");
  };

  document.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    event.preventDefault();
  });

  listViewEl.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    listViewEl.classList.add("drag-over");
  });

  listViewEl.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      listViewEl.classList.remove("drag-over");
    }
  });

  listViewEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  });

  listViewEl.addEventListener("drop", async (event) => {
    event.preventDefault();
    clearDragState();
    if (!hasUserPermission("upload")) return;
    const items = await collectDroppedFiles(event.dataTransfer);
    uploadBatch(items);
  });
};

let gridDragSelectState = {
  isSelecting: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  selectionBox: null,
  selectedItems: new Set()
};

const createGridSelectionBox = () => {
  if (gridDragSelectState.selectionBox) return;
  const box = document.createElement("div");
  box.className = "grid-selection-box";
  box.style.position = "fixed";
  box.style.border = "1px solid var(--primary-color)";
  box.style.background = "rgba(22, 93, 255, 0.1)";
  box.style.pointerEvents = "none";
  box.style.zIndex = "9999";
  box.style.display = "none";
  document.body.appendChild(box);
  gridDragSelectState.selectionBox = box;
};

const updateGridSelectionBox = () => {
  if (!gridDragSelectState.selectionBox) return;
  const { startX, startY, currentX, currentY } = gridDragSelectState;
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  
  gridDragSelectState.selectionBox.style.left = `${left}px`;
  gridDragSelectState.selectionBox.style.top = `${top}px`;
  gridDragSelectState.selectionBox.style.width = `${width}px`;
  gridDragSelectState.selectionBox.style.height = `${height}px`;
};

const hideGridSelectionBox = () => {
  if (gridDragSelectState.selectionBox) {
    gridDragSelectState.selectionBox.style.display = "none";
  }
};

const showGridSelectionBox = () => {
  if (gridDragSelectState.selectionBox) {
    gridDragSelectState.selectionBox.style.display = "block";
  }
};

const getGridItems = () => {
  if (!fileListEl) return [];
  return Array.from(fileListEl.querySelectorAll(".grid-item"));
};

const isPointInRect = (x, y, rect) => {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

const isRectsIntersect = (rect1, rect2) => {
  return !(rect1.right < rect2.left || 
           rect1.left > rect2.right || 
           rect1.bottom < rect2.top || 
           rect1.top > rect2.bottom);
};

const selectGridItemsInRect = (selectionRect) => {
  const gridItems = getGridItems();
  gridItems.forEach(item => {
    const itemRect = item.getBoundingClientRect();
    const itemCenterX = (itemRect.left + itemRect.right) / 2;
    const itemCenterY = (itemRect.top + itemRect.bottom) / 2;
    
    const shouldSelect = isPointInRect(itemCenterX, itemCenterY, selectionRect) || 
                         isRectsIntersect(selectionRect, itemRect);
    
    if (shouldSelect) {
      const checkbox = item.querySelector(".grid-check input");
      const entryId = item.getAttribute("data-entry-id");
      const entryType = item.getAttribute("data-entry-type");
      
      if (checkbox && !checkbox.checked && entryId && entryType) {
        checkbox.checked = true;
        item.classList.add("selected");
        
        const entry = state.entries?.find(e => 
          String(e.id) === entryId && e.type === entryType
        );
        
        if (entry) {
          setEntrySelected(entry, true);
        }
      }
    }
  });
  
  updateBatchActionState();
};

const getEntryFromGridItem = (item) => {
  const entryId = item.getAttribute("data-entry-id");
  const entryType = item.getAttribute("data-entry-type");
  if (!entryId || !entryType || !state.entries) return null;
  return state.entries.find(entry => 
    String(entry.id) === entryId && entry.type === entryType
  );
};

const endGridDragSelect = () => {
  if (!gridDragSelectState.isSelecting) return;
  
  gridDragSelectState.isSelecting = false;
  hideGridSelectionBox();
  gridDragSelectState.selectedItems.clear();
};

const bindGridDragSelect = () => {
  if (!fileListEl) return;
  
  createGridSelectionBox();
  
  let isDragging = false;
  let dragStartTarget = null;
  let hasDragged = false;
  
  fileListEl.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (state.viewMode !== "grid") return;
    
    const target = event.target;
    if (target.closest(".grid-check") || 
        target.closest("input") || 
        target.closest("button")) {
      return;
    }
    
    isDragging = true;
    hasDragged = false;
    dragStartTarget = target;
    gridDragSelectState.startX = event.clientX;
    gridDragSelectState.startY = event.clientY;
    gridDragSelectState.currentX = event.clientX;
    gridDragSelectState.currentY = event.clientY;
    gridDragSelectState.selectedItems.clear();
  });
  
  document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    
    const dx = event.clientX - gridDragSelectState.startX;
    const dy = event.clientY - gridDragSelectState.startY;
    
    if (!hasDragged && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      hasDragged = true;
      gridDragSelectState.isSelecting = true;
      showGridSelectionBox();
    }
    
    if (hasDragged) {
      gridDragSelectState.currentX = event.clientX;
      gridDragSelectState.currentY = event.clientY;
      updateGridSelectionBox();
      
      const selectionRect = {
        left: Math.min(gridDragSelectState.startX, gridDragSelectState.currentX),
        right: Math.max(gridDragSelectState.startX, gridDragSelectState.currentX),
        top: Math.min(gridDragSelectState.startY, gridDragSelectState.currentY),
        bottom: Math.max(gridDragSelectState.startY, gridDragSelectState.currentY)
      };
      
      selectGridItemsInRect(selectionRect);
    }
  });
  
  document.addEventListener("mouseup", (event) => {
    if (!isDragging) return;
    
    if (!hasDragged) {
      const target = event.target;
      const clickedOnGridItem = target.closest(".grid-item");
      
      if (!clickedOnGridItem && state.selectedEntries.length > 0) {
        clearSelection();
      }
    }
    
    isDragging = false;
    if (hasDragged) {
      endGridDragSelect();
    }
  });
};

const toggleSecondaryBtn = document.getElementById("toggleSecondaryBtn");
const secondarySidebar = document.getElementById("secondarySidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const syncSecondaryToggleState = () => {
  if (!toggleSecondaryBtn || !secondarySidebar) return;
  const icon = toggleSecondaryBtn.querySelector("i");
  if (!icon) return;
  if (secondarySidebar.classList.contains("collapsed")) {
    icon.className = "fa-solid fa-angles-right";
    toggleSecondaryBtn.title = "展开侧边栏";
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove("show");
    }
    return;
  }
  icon.className = "fa-solid fa-angles-left";
  toggleSecondaryBtn.title = "收起侧边栏";
  if (sidebarOverlay && window.matchMedia("(max-width: 768px)").matches) {
    sidebarOverlay.classList.add("show");
  }
};

if (toggleSecondaryBtn && secondarySidebar) {
  if (window.matchMedia("(max-width: 768px)").matches) {
    secondarySidebar.classList.add("collapsed");
  }
  syncSecondaryToggleState();
  toggleSecondaryBtn.onclick = (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target && target.closest("button")) return;
    secondarySidebar.classList.toggle("collapsed");
    syncSecondaryToggleState();
  };
}

if (sidebarOverlay) {
  sidebarOverlay.onclick = () => {
    if (!secondarySidebar.classList.contains("collapsed")) {
      secondarySidebar.classList.add("collapsed");
      syncSecondaryToggleState();
    }
  };
}

const collapseSecondarySidebarOnMobile = () => {
  if (window.matchMedia("(max-width: 768px)").matches && secondarySidebar && !secondarySidebar.classList.contains("collapsed")) {
    secondarySidebar.classList.add("collapsed");
    syncSecondaryToggleState();
  }
};

if (secondarySidebar) {
  secondarySidebar.addEventListener("click", (event) => {
    const subNavItem = event.target.closest(".sub-nav-item[data-category]");
    if (subNavItem) {
      collapseSecondarySidebarOnMobile();
      return;
    }
    const secondaryNavItem = event.target.closest(".secondary-nav-item");
    if (secondaryNavItem && secondaryNavItem.id !== "quickAccessHeader" && !secondaryNavItem.closest("#quickAccessList")) {
      collapseSecondarySidebarOnMobile();
      return;
    }
  });
}

document.documentElement.classList.remove("mobile-secondary-init");

bindGridDragSelect();

if (typeof window !== "undefined") {
  window.gridDragSelectState = gridDragSelectState;
  window.hideGridSelectionBox = hideGridSelectionBox;
}
