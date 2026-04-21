(function (global) {
  let PREVIEW_IMAGE_EXT_SET = new Set();
  let PREVIEW_VIDEO_EXT_SET = new Set();
  let PREVIEW_AUDIO_EXT_SET = new Set();
  let PREVIEW_TEXT_EXT_SET = new Set();
  let PREVIEW_DOC_EXT_SET = new Set();
  
  const updatePreviewExtSets = (previewConfig) => {
    if (previewConfig && typeof previewConfig === "object") {
      PREVIEW_IMAGE_EXT_SET = new Set(Array.isArray(previewConfig.imageExts) ? previewConfig.imageExts : []);
      PREVIEW_VIDEO_EXT_SET = new Set(Array.isArray(previewConfig.videoExts) ? previewConfig.videoExts : []);
      PREVIEW_AUDIO_EXT_SET = new Set(Array.isArray(previewConfig.audioExts) ? previewConfig.audioExts : []);
      PREVIEW_TEXT_EXT_SET = new Set(Array.isArray(previewConfig.textExts) ? previewConfig.textExts : []);
      PREVIEW_DOC_EXT_SET = new Set(Array.isArray(previewConfig.docExts) ? previewConfig.docExts : []);
    }
  };
  const state = {
    request: null,
    buildPreviewUrl: null,
    getEntries: null,
    escapeHtml: (value) => String(value || ""),
    activeEntry: null,
    activeType: "",
    imagePreview: {
      entries: [],
      activeIndex: -1,
      sidebarCollapsed: false,
      zoom: 1,
      lastWheelAt: 0,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragOriginX: 0,
      dragOriginY: 0
    },
    mediaPreview: {
      entries: [],
      activeIndex: -1,
      sidebarCollapsed: false,
      lastWheelAt: 0
    },
    textPreview: {
      fontSize: 13,
      wrap: false,
      text: "",
      truncated: false,
      canEdit: false,
      isSaving: false,
      dirty: false
    }
  };
  let previewModal = null;
  let previewTitle = null;
  let previewMeta = null;
  let previewBody = null;
  let closePreviewBtn = null;
  let minimizePreviewBtn = null;
  let previewMiniWindow = null;
  let previewMiniTitle = null;
  let previewMiniBody = null;
  let maximizePreviewBtn = null;
  let closeMiniPreviewBtn = null;
  let eventsBound = false;
  let editorInstance = null;
  let lastSavedText = "";
  let monacoReadyPromise = null;
  let editorInitVersion = 0;

  const ensureDom = () => {
    if (!previewModal) previewModal = document.getElementById("previewModal");
    if (!previewTitle) previewTitle = document.getElementById("previewTitle");
    if (!previewMeta) previewMeta = document.getElementById("previewMeta");
    if (!previewBody) previewBody = document.getElementById("previewBody");
    if (!closePreviewBtn) closePreviewBtn = document.getElementById("closePreviewBtn");
    if (!minimizePreviewBtn) minimizePreviewBtn = document.getElementById("minimizePreviewBtn");
    if (!previewMiniWindow) previewMiniWindow = document.getElementById("previewMiniWindow");
    if (!previewMiniTitle) previewMiniTitle = document.getElementById("previewMiniTitle");
    if (!previewMiniBody) previewMiniBody = document.getElementById("previewMiniBody");
    if (!maximizePreviewBtn) maximizePreviewBtn = document.getElementById("maximizePreviewBtn");
    if (!closeMiniPreviewBtn) closeMiniPreviewBtn = document.getElementById("closeMiniPreviewBtn");
  };

  const getFileExt = (fileName) => {
    const name = String(fileName || "").trim().toLowerCase();
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex <= -1 || dotIndex === name.length - 1) return "";
    return name.slice(dotIndex + 1);
  };

  const resolvePreviewType = (entry) => {
    if (!entry || entry.type !== "file") return "";
    const ext = getFileExt(entry.name);
    if (PREVIEW_IMAGE_EXT_SET.has(ext)) return "image";
    if (PREVIEW_VIDEO_EXT_SET.has(ext)) return "video";
    if (PREVIEW_AUDIO_EXT_SET.has(ext)) return "audio";
    if (PREVIEW_TEXT_EXT_SET.has(ext)) return "text";
    if (PREVIEW_DOC_EXT_SET.has(ext)) return "document";
    return "";
  };

  const isMobileViewport = () => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(max-width: 768px)").matches;
    }
    if (typeof window !== "undefined" && Number.isFinite(window.innerWidth)) {
      return window.innerWidth <= 768;
    }
    return false;
  };

  const resolveEditorMode = (entry) => {
    const ext = getFileExt(entry && entry.name);
    if (["js", "jsx", "ts", "tsx"].includes(ext)) return "javascript";
    if (["json"].includes(ext)) return "json";
    if (["html", "htm", "xhtml", "vue"].includes(ext)) return "html";
    if (["css", "scss", "sass", "less"].includes(ext)) return "css";
    if (["md", "markdown"].includes(ext)) return "markdown";
    if (["xml"].includes(ext)) return "xml";
    if (["yml", "yaml"].includes(ext)) return "yaml";
    if (["sh", "bash", "zsh"].includes(ext)) return "shell";
    if (["py"].includes(ext)) return "python";
    if (["sql"].includes(ext)) return "sql";
    if (["java"].includes(ext)) return "java";
    if (["c", "cc", "cpp", "h", "hpp"].includes(ext)) return "cpp";
    if (["cs"].includes(ext)) return "csharp";
    if (["go"].includes(ext)) return "go";
    if (["rs"].includes(ext)) return "rust";
    if (["php"].includes(ext)) return "php";
    if (["rb"].includes(ext)) return "ruby";
    if (["kt", "kts"].includes(ext)) return "kotlin";
    if (["ps1"].includes(ext)) return "powershell";
    if (["ini", "conf", "cfg", "toml", "properties", "env"].includes(ext)) return "ini";
    return "plaintext";
  };

  const clampFontSize = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 13;
    return Math.max(10, Math.min(28, Math.floor(num)));
  };

  const formatSize = (size) => {
    if (!size || size === "0") return "-";
    const s = Number(size);
    if (!Number.isFinite(s) || s <= 0) return "-";
    if (s < 1024) return `${s} B`;
    if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)} KB`;
    if (s < 1024 * 1024 * 1024) return `${(s / 1024 / 1024).toFixed(1)} MB`;
    return `${(s / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "-";
    const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `${datePart} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const setPreviewMeta = (entry) => {
    if (!previewMeta) return;
    if (!entry || entry.type !== "file") {
      previewMeta.textContent = "大小：- ｜ 修改时间：-";
      return;
    }
    const sizeText = formatSize(entry.size);
    const timeText = formatDate(entry.updatedAt || entry.modifiedAt || entry.mtime || entry.createdAt);
    previewMeta.textContent = `大小：${sizeText} ｜ 修改时间：${timeText}`;
  };

  const clampImageZoom = (zoom) => {
    const num = Number(zoom);
    if (!Number.isFinite(num)) return 1;
    return Math.max(0.2, Math.min(5, num));
  };

  const getEntriesByPreviewType = (previewType) => {
    const source = typeof state.getEntries === "function" ? state.getEntries() : [];
    if (!Array.isArray(source) || source.length === 0) {
      return state.activeEntry && resolvePreviewType(state.activeEntry) === previewType ? [state.activeEntry] : [];
    }
    return source.filter((entry) => entry && entry.type === "file" && resolvePreviewType(entry) === previewType);
  };

  const getImageActiveIndex = (entries, activeEntry) => {
    if (!Array.isArray(entries) || !activeEntry) return -1;
    const activeId = String(activeEntry.id);
    let index = entries.findIndex((item) => String(item && item.id) === activeId);
    if (index >= 0) return index;
    const activeName = String(activeEntry.name || "");
    index = entries.findIndex((item) => String((item && item.name) || "") === activeName);
    return index;
  };

  const syncImageEntries = (activeEntry) => {
    const nextEntries = getEntriesByPreviewType("image");
    const index = getImageActiveIndex(nextEntries, activeEntry);
    state.imagePreview.entries = nextEntries;
    state.imagePreview.activeIndex = index;
  };

  const setImageActiveByIndex = (index, { resetZoom = true } = {}) => {
    const entries = state.imagePreview.entries;
    if (!Array.isArray(entries) || entries.length === 0) return false;
    const safeIndex = Math.max(0, Math.min(entries.length - 1, Number(index)));
    const nextEntry = entries[safeIndex];
    if (!nextEntry) return false;
    state.activeEntry = nextEntry;
    state.imagePreview.activeIndex = safeIndex;
    if (resetZoom) {
      state.imagePreview.zoom = 1;
      state.imagePreview.offsetX = 0;
      state.imagePreview.offsetY = 0;
    }
    previewTitle.textContent = nextEntry.name || "文件预览";
    setPreviewMeta(nextEntry);
    return true;
  };

  const buildImageTransform = () => {
    const zoom = clampImageZoom(state.imagePreview.zoom);
    const offsetX = Number(state.imagePreview.offsetX) || 0;
    const offsetY = Number(state.imagePreview.offsetY) || 0;
    return `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${zoom})`;
  };

  const syncMediaEntries = (activeEntry, previewType) => {
    const nextEntries = getEntriesByPreviewType(previewType);
    const index = getImageActiveIndex(nextEntries, activeEntry);
    state.mediaPreview.entries = nextEntries;
    state.mediaPreview.activeIndex = index;
  };

  const setMediaActiveByIndex = (index) => {
    const entries = state.mediaPreview.entries;
    if (!Array.isArray(entries) || entries.length === 0) return false;
    const safeIndex = Math.max(0, Math.min(entries.length - 1, Number(index)));
    const nextEntry = entries[safeIndex];
    if (!nextEntry) return false;
    state.activeEntry = nextEntry;
    state.mediaPreview.activeIndex = safeIndex;
    previewTitle.textContent = nextEntry.name || "文件预览";
    setPreviewMeta(nextEntry);
    return true;
  };

  const getMediaPlaybackStateKey = (previewType) => `${previewType}:${state.activeEntry ? state.activeEntry.id : ""}`;

  const captureCurrentMediaPlaybackState = (previewType) => {
    if (!previewBody || !["video", "audio"].includes(previewType)) return null;
    const mediaEl = previewBody.querySelector(previewType === "video" ? "video.preview-video" : "audio.preview-audio");
    if (!mediaEl) return null;
    return {
      key: getMediaPlaybackStateKey(previewType),
      currentTime: Number(mediaEl.currentTime) || 0,
      paused: !!mediaEl.paused,
      volume: Number.isFinite(Number(mediaEl.volume)) ? Number(mediaEl.volume) : 1,
      muted: !!mediaEl.muted,
      playbackRate: Number.isFinite(Number(mediaEl.playbackRate)) ? Number(mediaEl.playbackRate) : 1
    };
  };

  const restoreCurrentMediaPlaybackState = (previewType, snapshot) => {
    if (!snapshot || snapshot.key !== getMediaPlaybackStateKey(previewType) || !previewBody) return;
    const mediaEl = previewBody.querySelector(previewType === "video" ? "video.preview-video" : "audio.preview-audio");
    if (!mediaEl) return;
    mediaEl.volume = Math.max(0, Math.min(1, Number(snapshot.volume) || 0));
    mediaEl.muted = !!snapshot.muted;
    mediaEl.playbackRate = Math.max(0.25, Math.min(4, Number(snapshot.playbackRate) || 1));
    const targetTime = Math.max(0, Number(snapshot.currentTime) || 0);
    const applyCurrentTime = () => {
      try {
        mediaEl.currentTime = targetTime;
      } catch (error) {}
      if (!snapshot.paused) {
        const playResult = mediaEl.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(() => {});
        }
      } else {
        mediaEl.pause();
      }
    };
    if (mediaEl.readyState >= 1) {
      applyCurrentTime();
    } else {
      mediaEl.addEventListener("loadedmetadata", applyCurrentTime, { once: true });
    }
  };

  const ensureMonacoReady = () => {
    if (global.monaco && global.monaco.editor) {
      return Promise.resolve(global.monaco);
    }
    if (monacoReadyPromise) return monacoReadyPromise;
    const req = global.require;
    if (typeof req !== "function" || typeof req.config !== "function") {
      return Promise.resolve(null);
    }
    monacoReadyPromise = new Promise((resolve) => {
      const baseUrl = new URL("/monaco-editor@0.52.2/min/", global.location.href).href;
      const workerMainUrl = new URL("vs/base/worker/workerMain.js", baseUrl).href;
      req.config({
        paths: {
          vs: "/monaco-editor@0.52.2/min/vs"
        }
      });
      global.MonacoEnvironment = {
        baseUrl,
        getWorker: (_workerId, label) => {
          const workerCode = `
self.MonacoEnvironment = { baseUrl: ${JSON.stringify(baseUrl)} };
importScripts(${JSON.stringify(workerMainUrl)});
`;
          const blob = new Blob([workerCode], { type: "application/javascript" });
          const workerUrl = URL.createObjectURL(blob);
          const worker = new Worker(workerUrl, { name: String(label || "monaco-worker") });
          URL.revokeObjectURL(workerUrl);
          return worker;
        }
      };
      req(
        ["vs/editor/editor.main"],
        () => resolve(global.monaco || null),
        () => resolve(null)
      );
    });
    return monacoReadyPromise;
  };

  const showNotice = ({ title = "提示", message = "", isError = false } = {}) => {
    if (typeof global.showAppNotice === "function") {
      global.showAppNotice({ title, message, isError });
      return;
    }
    if (typeof global.alert === "function") {
      global.alert(String(message || ""));
    }
  };

  const destroyEditor = () => {
    if (!editorInstance) return;
    if (typeof editorInstance.dispose === "function") {
      editorInstance.dispose();
    }
    editorInstance = null;
  };

  const getEditorValue = () => {
    if (editorInstance) return editorInstance.getValue();
    return String(state.textPreview.text || "");
  };

  const performSave = async ({ showSuccessNotice = true } = {}) => {
    if (!state.activeEntry || !state.textPreview.canEdit || state.textPreview.isSaving) return false;
    if (typeof state.request !== "function") return false;
    const content = getEditorValue();
    const saveBtn = previewBody ? previewBody.querySelector("#previewSaveBtn") : null;
    state.textPreview.isSaving = true;
    setStatusText();
    if (saveBtn) saveBtn.disabled = true;
    try {
      const res = await state.request(`/api/preview/${state.activeEntry.id}?mode=text`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data && data.message ? data.message : "保存失败");
      }
      lastSavedText = content;
      state.textPreview.text = content;
      state.textPreview.dirty = false;
      setStatusText();
      if (showSuccessNotice) {
        showNotice({ title: "提示", message: data && data.message ? data.message : "保存成功", isError: false });
      }
      return true;
    } catch (error) {
      showNotice({ title: "提示", message: error && error.message ? error.message : "保存失败", isError: true });
      return false;
    } finally {
      state.textPreview.isSaving = false;
      setStatusText();
      if (saveBtn) saveBtn.disabled = !state.textPreview.canEdit;
    }
  };

  const setStatusText = () => {
    if (!previewBody) return;
    const statusEl = previewBody.querySelector("#previewEditorStatus");
    if (!statusEl) return;
    if (state.textPreview.isSaving) {
      statusEl.textContent = "保存中...";
      statusEl.style.color = "#165dff";
      return;
    }
    if (state.textPreview.dirty) {
      statusEl.textContent = "未保存";
      statusEl.style.color = "#f53f3f";
      return;
    }
    statusEl.textContent = state.textPreview.canEdit ? "已保存" : "只读";
    statusEl.style.color = "#00b42a";
  };

  const updateEditorVisuals = () => {
    if (!previewBody) return;
    if (!editorInstance) return;
    if (typeof editorInstance.updateOptions === "function") {
      editorInstance.updateOptions({
        wordWrap: state.textPreview.wrap ? "on" : "off",
        fontSize: state.textPreview.fontSize
      });
    }
    if (typeof editorInstance.layout === "function") {
      editorInstance.layout();
    }
  };

  const openNativeFindWidget = async () => {
    if (!editorInstance) return;
    const findAction = typeof editorInstance.getAction === "function"
      ? editorInstance.getAction("actions.find")
      : null;
    if (findAction && typeof findAction.run === "function") {
      await findAction.run();
      editorInstance.focus();
      return;
    }
    editorInstance.trigger("manual", "actions.find", null);
    editorInstance.focus();
  };

  const renderTextPreviewShell = () => {
    if (!previewBody) return;
    const readonlyFlag = state.textPreview.canEdit ? "" : "disabled";
    const truncatedHtml = state.textPreview.truncated ? `<div class="preview-code-truncated">内容过长，已截断</div>` : "";
    
    // 检查是否是压缩包中的文件
    const isArchiveEntry = state.activeEntry && state.activeEntry.isArchiveEntry;
    const saveBtnHtml = isArchiveEntry ? "" : `<button type="button" class="preview-tool-btn" id="previewSaveBtn" ${readonlyFlag}>保存</button>`;
    
    previewBody.innerHTML = `
      <div class="preview-code-wrap">
        <div class="preview-code-toolbar">
          <div class="preview-code-toolbar-left">
            <button type="button" class="preview-tool-btn" id="previewFindBtn">查找</button>
            <button type="button" class="preview-tool-btn" id="previewFontDownBtn">A-</button>
            <span class="preview-font-size-text" id="previewFontSizeText">${state.textPreview.fontSize}px</span>
            <button type="button" class="preview-tool-btn" id="previewFontUpBtn">A+</button>
            <label class="preview-wrap-toggle"><input type="checkbox" id="previewWrapToggle" ${state.textPreview.wrap ? "checked" : ""}> 自动换行</label>
          </div>
          <div class="preview-code-toolbar-right">
            <span class="preview-search-summary" id="previewEditorStatus">已保存</span>
            ${saveBtnHtml}
          </div>
        </div>
        <div class="preview-editor-wrap">
          <div id="previewEditorMonaco" class="preview-editor-monaco"></div>
        </div>
        ${truncatedHtml}
      </div>
    `;
  };

  const initEditor = async () => {
    if (!previewBody) return;
    editorInitVersion += 1;
    const currentVersion = editorInitVersion;
    destroyEditor();
    const monacoHost = previewBody.querySelector("#previewEditorMonaco");
    if (!monacoHost) return;
    const monaco = await ensureMonacoReady();
    if (currentVersion !== editorInitVersion || !monacoHost.isConnected) return;
    if (!monaco || !monaco.editor || !global.monaco) {
      monacoHost.innerHTML = `<div class="preview-placeholder">Monaco 编辑器加载失败</div>`;
      return;
    }
    monacoHost.innerHTML = "";
    editorInstance = monaco.editor.create(monacoHost, {
      value: String(state.textPreview.text || ""),
      language: resolveEditorMode(state.activeEntry),
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      glyphMargin: false,
      folding: true,
      wordWrap: state.textPreview.wrap ? "on" : "off",
      readOnly: !state.textPreview.canEdit,
      scrollBeyondLastLine: false,
      fontSize: state.textPreview.fontSize,
      renderWhitespace: "selection",
      tabSize: 2
    });
    editorInstance.onDidChangeModelContent(() => {
      state.textPreview.dirty = editorInstance.getValue() !== lastSavedText;
      setStatusText();
    });
    if (typeof editorInstance.addCommand === "function" && monaco.KeyMod && monaco.KeyCode) {
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
        void openNativeFindWidget();
      });
    }
    updateEditorVisuals();
  };

  const renderTextPreview = () => {
    if (!previewBody) return;
    renderTextPreviewShell();
    const findBtn = previewBody.querySelector("#previewFindBtn");
    const fontDownBtn = previewBody.querySelector("#previewFontDownBtn");
    const fontUpBtn = previewBody.querySelector("#previewFontUpBtn");
    const wrapToggle = previewBody.querySelector("#previewWrapToggle");
    const saveBtn = previewBody.querySelector("#previewSaveBtn");
    if (findBtn) {
      findBtn.onclick = () => {
        void openNativeFindWidget();
      };
    }
    if (fontDownBtn) {
      fontDownBtn.onclick = () => {
        state.textPreview.fontSize = clampFontSize(state.textPreview.fontSize - 1);
        const fontText = previewBody.querySelector("#previewFontSizeText");
        if (fontText) fontText.textContent = `${state.textPreview.fontSize}px`;
        updateEditorVisuals();
      };
    }
    if (fontUpBtn) {
      fontUpBtn.onclick = () => {
        state.textPreview.fontSize = clampFontSize(state.textPreview.fontSize + 1);
        const fontText = previewBody.querySelector("#previewFontSizeText");
        if (fontText) fontText.textContent = `${state.textPreview.fontSize}px`;
        updateEditorVisuals();
      };
    }
    if (wrapToggle) {
      wrapToggle.onchange = () => {
        state.textPreview.wrap = Boolean(wrapToggle.checked);
        updateEditorVisuals();
      };
    }
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!state.activeEntry || !state.textPreview.canEdit || state.textPreview.isSaving) return;
        await performSave({ showSuccessNotice: true });
      };
    }
    void initEditor();
    setStatusText();
  };

  const renderOfficePreviewFrame = (entry, container) => {
    if (!container || !entry) return;
    let officeUrl;
    // 如果是压缩包中的文件，使用 zip/entry API
    if (entry.isArchiveEntry && entry.archiveId && entry.archivePath) {
      officeUrl = `/api/files/${encodeURIComponent(entry.archiveId)}/zip/entry?path=${encodeURIComponent(entry.archivePath)}&mode=office`;
    } else if (entry.id !== undefined && entry.id !== null) {
      // 普通文件使用普通预览 API
      officeUrl = `/api/preview/${encodeURIComponent(entry.id)}?mode=office`;
    } else {
      return;
    }
    const finalUrl = typeof state.buildPreviewUrl === "function" ? state.buildPreviewUrl(officeUrl, entry) : officeUrl;
    container.innerHTML = `
      <div class="document-preview">
        <div class="loading">正在转换文档，请稍候...</div>
        <iframe class="preview-iframe" style="display:none;" src="${finalUrl}"></iframe>
      </div>
    `;
    const iframe = container.querySelector("iframe");
    const loading = container.querySelector(".loading");
    if (!iframe || !loading) return;
    iframe.onload = () => {
      iframe.style.display = "block";
      loading.style.display = "none";
    };
    iframe.onerror = () => {
      loading.textContent = "文档转换失败，请稍后重试";
      iframe.style.display = "none";
    };
  };

  const renderMiniPreview = () => {
    if (!previewMiniBody) return;
    const entry = state.activeEntry;
    const previewType = state.activeType;
    if (!entry || !previewType) {
      previewMiniBody.innerHTML = "";
      return;
    }
    const previewUrl = getStreamPreviewUrl(entry);
    if (previewType === "image") {
      previewMiniBody.innerHTML = `<img src="${previewUrl}" alt="${state.escapeHtml(entry.name || "预览图片")}" />`;
      return;
    }
    if (previewType === "video") {
      previewMiniBody.innerHTML = `<video class="preview-video" src="${previewUrl}" controls autoplay preload="metadata" playsinline></video>`;
      return;
    }
    if (previewType === "audio") {
      previewMiniBody.innerHTML = `<div class="preview-audio-wrap"><audio class="preview-audio" src="${previewUrl}" controls autoplay preload="metadata"></audio></div>`;
      return;
    }
    if (previewType === "document") {
      const ext = getFileExt(entry.name);
      if (["docx", "doc", "xlsx", "xls", "csv"].includes(ext)) {
        renderOfficePreviewFrame(entry, previewMiniBody);
      } else {
        previewMiniBody.innerHTML = `<iframe class="preview-iframe" src="${previewUrl}"></iframe>`;
      }
      return;
    }
    previewMiniBody.innerHTML = `<div class="preview-mini-text-tip">文本预览已最小化，点击右上角按钮可恢复</div>`;
  };

  const hideMiniWindow = () => {
    ensureDom();
    if (previewMiniWindow) {
      previewMiniWindow.style.display = "none";
    }
    if (previewMiniBody) {
      previewMiniBody.innerHTML = "";
    }
  };

  const showMiniWindow = () => {
    ensureDom();
    if (!previewMiniWindow || !previewMiniTitle) return;
    previewMiniTitle.textContent = state.activeEntry && state.activeEntry.name ? state.activeEntry.name : "文件预览";
    renderMiniPreview();
    previewMiniWindow.style.display = "flex";
  };

  const closeNow = () => {
    ensureDom();
    destroyEditor();
    if (previewModal) {
      previewModal.style.display = "none";
    }
    if (previewBody) {
      previewBody.innerHTML = "";
    }
    setPreviewBodyImageMode(false);
    setPreviewBodyDocumentMode(false);
    hideMiniWindow();
    state.activeEntry = null;
    state.activeType = "";
    state.imagePreview.entries = [];
    state.imagePreview.activeIndex = -1;
    state.imagePreview.sidebarCollapsed = false;
    state.imagePreview.zoom = 1;
    state.imagePreview.lastWheelAt = 0;
    state.imagePreview.offsetX = 0;
    state.imagePreview.offsetY = 0;
    state.imagePreview.dragging = false;
    state.imagePreview.dragStartX = 0;
    state.imagePreview.dragStartY = 0;
    state.imagePreview.dragOriginX = 0;
    state.imagePreview.dragOriginY = 0;
    state.mediaPreview.entries = [];
    state.mediaPreview.activeIndex = -1;
    state.mediaPreview.sidebarCollapsed = false;
    state.mediaPreview.lastWheelAt = 0;
    state.textPreview.dirty = false;
    state.textPreview.isSaving = false;
    lastSavedText = "";
    setPreviewMeta(null);
  };

  const close = async () => {
    if (state.textPreview.isSaving) return;
    const hasUnsaved = Boolean(
      state.activeType === "text"
      && state.textPreview.canEdit
      && state.textPreview.dirty
    );
    if (!hasUnsaved) {
      closeNow();
      return;
    }
    const shouldSave = typeof global.showAppConfirm === "function"
      ? await global.showAppConfirm({
        title: "保存确认",
        message: "检测到未保存内容，是否先保存再关闭？",
        desc: "点击“保存并关闭”会先保存修改；点击“不保存关闭”将直接关闭。",
        okText: "保存并关闭",
        cancelText: "不保存关闭"
      })
      : true;
    if (!shouldSave) {
      closeNow();
      return;
    }
    const saved = await performSave({ showSuccessNotice: false });
    if (!saved) return;
    closeNow();
  };

  const showUnsupported = () => {
    ensureDom();
    if (!previewBody) return;
    previewBody.innerHTML = `<div class="preview-placeholder">当前文件暂不支持预览</div>`;
  };

  const showUnsupportedNotice = () => {
    showNotice({ title: "提示", message: "当前文件暂不支持预览", isError: true });
  };

  const setPreviewBodyImageMode = (enabled) => {
    if (!previewBody) return;
    previewBody.classList.toggle("preview-body-image", Boolean(enabled));
  };

  const setPreviewBodyMediaMode = (enabled) => {
    if (!previewBody) return;
    previewBody.classList.toggle("preview-body-media", Boolean(enabled));
  };

  const setPreviewBodyDocumentMode = (enabled) => {
    if (!previewBody) return;
    previewBody.classList.toggle("preview-body-document", Boolean(enabled));
  };

  const bindMediaPreviewEvents = (previewType) => {
    if (!previewBody) return;
    const listEl = previewBody.querySelector("#previewMediaList");
    const prevBtn = previewBody.querySelector("#previewMediaPrevBtn");
    const nextBtn = previewBody.querySelector("#previewMediaNextBtn");
    const audioPrevBtn = previewBody.querySelector("#previewAudioPrevBtn");
    const audioPlayBtn = previewBody.querySelector("#previewAudioPlayBtn");
    const audioNextBtn = previewBody.querySelector("#previewAudioNextBtn");
    const audioVolumeRange = previewBody.querySelector("#previewAudioVolumeRange");
    const audioProgressRange = previewBody.querySelector("#previewAudioProgressRange");
    const audioCurrentTimeText = previewBody.querySelector("#previewAudioCurrentTime");
    const audioDurationText = previewBody.querySelector("#previewAudioDuration");
    const audioArcActivePath = previewBody.querySelector("#previewAudioArcActivePath");
    const audioMuteBtn = previewBody.querySelector("#previewAudioMuteBtn");
    const audioMuteIcon = previewBody.querySelector("#previewAudioMuteIcon");
    const audioLowMuteBtn = previewBody.querySelector("#previewAudioLowMuteBtn");
    const audioEl = previewBody.querySelector("audio.preview-audio");
    const stageEl = previewBody.querySelector("#previewMediaStage");
    const toggleSidebarBtn = previewBody.querySelector("#previewMediaToggleSidebarBtn");
    const expandSidebarBtn = previewBody.querySelector("#previewMediaExpandSidebarBtn");
    if (listEl) {
      listEl.onclick = (event) => {
        const target = event.target && typeof event.target.closest === "function"
          ? event.target.closest(".preview-media-item")
          : null;
        if (!target) return;
        const nextIndex = Number(target.dataset.index);
        if (!Number.isInteger(nextIndex)) return;
        if (!setMediaActiveByIndex(nextIndex)) return;
        updateMediaActiveState(previewType);
      };
    }
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (!setMediaActiveByIndex(state.mediaPreview.activeIndex - 1)) return;
        updateMediaActiveState(previewType);
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (!setMediaActiveByIndex(state.mediaPreview.activeIndex + 1)) return;
        updateMediaActiveState(previewType);
      };
    }
    if (audioPrevBtn) {
      audioPrevBtn.onclick = () => {
        if (!setMediaActiveByIndex(state.mediaPreview.activeIndex - 1)) return;
        updateMediaActiveState(previewType);
      };
    }
    if (audioNextBtn) {
      audioNextBtn.onclick = () => {
        if (!setMediaActiveByIndex(state.mediaPreview.activeIndex + 1)) return;
        updateMediaActiveState(previewType);
      };
    }
    if (audioPlayBtn && audioEl) {
      const syncPlayIcon = () => {
        audioPlayBtn.innerHTML = audioEl.paused
          ? '<i class="fa-solid fa-play"></i>'
          : '<i class="fa-solid fa-pause"></i>';
      };
      syncPlayIcon();
      audioPlayBtn.onclick = () => {
        if (audioEl.paused) {
          const playResult = audioEl.play();
          if (playResult && typeof playResult.catch === "function") {
            playResult.catch(() => {});
          }
          return;
        }
        audioEl.pause();
      };
      audioEl.onplay = syncPlayIcon;
      audioEl.onpause = syncPlayIcon;
    }
    if (audioProgressRange && audioEl) {
      const formatAudioTime = (value) => {
        const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
        const minute = Math.floor(totalSeconds / 60);
        const second = String(totalSeconds % 60).padStart(2, "0");
        return `${minute}:${second}`;
      };
      const syncProgress = () => {
        const duration = Number(audioEl.duration);
        const current = Number(audioEl.currentTime) || 0;
        const hasDuration = Number.isFinite(duration) && duration > 0;
        const percent = hasDuration ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;
        audioProgressRange.value = String(percent);
        if (audioCurrentTimeText) audioCurrentTimeText.textContent = formatAudioTime(current);
        if (audioDurationText) audioDurationText.textContent = formatAudioTime(hasDuration ? duration : 0);
        if (audioArcActivePath) {
          const totalLength = 295;
          const activeLength = (percent / 100) * totalLength;
          audioArcActivePath.style.strokeDasharray = `${activeLength} ${totalLength}`;
        }
      };
      syncProgress();
      audioProgressRange.oninput = () => {
        const duration = Number(audioEl.duration);
        if (!Number.isFinite(duration) || duration <= 0) return;
        const percent = Math.max(0, Math.min(100, Number(audioProgressRange.value) || 0));
        audioEl.currentTime = duration * (percent / 100);
        syncProgress();
      };
      audioEl.ontimeupdate = syncProgress;
      audioEl.onloadedmetadata = syncProgress;
      audioEl.ondurationchange = syncProgress;
    }
    if (audioVolumeRange && audioEl) {
      const syncVolumeRange = () => {
        const currentVolume = audioEl.muted ? 0 : Number(audioEl.volume);
        const volumePercent = Math.round(Math.max(0, Math.min(1, currentVolume)) * 100);
        audioVolumeRange.value = String(volumePercent);
        audioVolumeRange.style.setProperty("--volume-percent", `${volumePercent}%`);
        if (audioMuteIcon) {
          audioMuteIcon.className = audioEl.muted || currentVolume <= 0
            ? "fa-solid fa-volume-xmark"
            : "fa-solid fa-volume-high";
        }
      };
      const toggleMute = () => {
        audioEl.muted = !audioEl.muted;
        syncVolumeRange();
      };
      syncVolumeRange();
      audioVolumeRange.oninput = () => {
        const value = Number(audioVolumeRange.value);
        const volume = Math.max(0, Math.min(1, value / 100));
        audioEl.volume = volume;
        audioEl.muted = volume <= 0;
      };
      if (audioMuteBtn) audioMuteBtn.onclick = toggleMute;
      if (audioLowMuteBtn) audioLowMuteBtn.onclick = toggleMute;
      audioEl.onvolumechange = syncVolumeRange;
    }
    if (stageEl) {
      stageEl.onwheel = (event) => {
        event.preventDefault();
        if (state.mediaPreview.entries.length <= 1) return;
        const now = Date.now();
        if (now - state.mediaPreview.lastWheelAt < 150) return;
        state.mediaPreview.lastWheelAt = now;
        const direction = event.deltaY > 0 ? 1 : -1;
        if (!setMediaActiveByIndex(state.mediaPreview.activeIndex + direction)) return;
        updateMediaActiveState(previewType);
      };
    }
    if (toggleSidebarBtn) {
      toggleSidebarBtn.onclick = () => {
        state.mediaPreview.sidebarCollapsed = !state.mediaPreview.sidebarCollapsed;
        const sidebar = previewBody.querySelector(".preview-media-sidebar");
        if (sidebar) {
          sidebar.classList.toggle("is-collapsed", state.mediaPreview.sidebarCollapsed);
        }
        toggleSidebarBtn.textContent = state.mediaPreview.sidebarCollapsed ? "展开" : "收起";
        
        // 显示/隐藏展开按钮
        let expandBtn = previewBody.querySelector("#previewMediaExpandSidebarBtn");
        if (state.mediaPreview.sidebarCollapsed) {
          if (!expandBtn) {
            const stage = previewBody.querySelector("#previewMediaStage");
            if (stage) {
              expandBtn = document.createElement("button");
              expandBtn.type = "button";
              expandBtn.className = "preview-sidebar-expand-btn";
              expandBtn.id = "previewMediaExpandSidebarBtn";
              expandBtn.textContent = "展开列表";
              expandBtn.onclick = () => {
                state.mediaPreview.sidebarCollapsed = false;
                if (sidebar) {
                  sidebar.classList.remove("is-collapsed");
                }
                toggleSidebarBtn.textContent = "收起";
                expandBtn.remove();
              };
              stage.insertBefore(expandBtn, stage.firstChild);
            }
          }
        } else if (expandBtn) {
          expandBtn.remove();
        }
      };
    }
    if (expandSidebarBtn) {
      expandSidebarBtn.onclick = () => {
        state.mediaPreview.sidebarCollapsed = false;
        const sidebar = previewBody.querySelector(".preview-media-sidebar");
        if (sidebar) {
          sidebar.classList.remove("is-collapsed");
        }
        const toggleBtn = previewBody.querySelector("#previewMediaToggleSidebarBtn");
        if (toggleBtn) {
          toggleBtn.textContent = "收起";
        }
        expandSidebarBtn.remove();
      };
    }
  };

  const updateMediaActiveState = (previewType) => {
    if (!previewBody || !["video", "audio"].includes(previewType)) return;
    const activeIndex = state.mediaPreview.activeIndex;
    
    // 更新列表项的激活状态
    const listItems = previewBody.querySelectorAll(".preview-media-item");
    listItems.forEach((item, index) => {
      if (index === activeIndex) {
        item.classList.add("is-active");
        if (typeof item.scrollIntoView === "function") {
          item.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      } else {
        item.classList.remove("is-active");
      }
    });
    
    // 更新媒体源
    const currentEntry = state.activeEntry;
    if (currentEntry) {
      const mediaUrl = getStreamPreviewUrl(currentEntry);
      const mediaEl = previewBody.querySelector(previewType === "video" ? "video.preview-video" : "audio.preview-audio");
      if (mediaEl) {
        // 保存当前播放状态
        const wasPaused = mediaEl.paused;
        const currentTime = mediaEl.currentTime;
        const volume = mediaEl.volume;
        const muted = mediaEl.muted;
        
        // 添加错误处理，避免 ERR_ABORTED 日志
        const handleError = (e) => {
          // 忽略加载错误（通常是切换时的正常中止）
          if (mediaEl.error && mediaEl.error.code === MediaError.MEDIA_ERR_ABORTED) {
            return;
          }
        };
        
        // 更新源并恢复状态
        mediaEl.src = mediaUrl;
        mediaEl.onerror = handleError;
        mediaEl.load();
        
        // 恢复播放状态
        if (!wasPaused && previewType === "video") {
          mediaEl.play().catch(() => {});
        }
        if (currentTime) {
          mediaEl.currentTime = currentTime;
        }
        mediaEl.volume = volume;
        mediaEl.muted = muted;
      }
    }
    
    // 更新导航按钮状态
    const prevBtn = previewBody.querySelector("#previewMediaPrevBtn");
    const nextBtn = previewBody.querySelector("#previewMediaNextBtn");
    const audioPrevBtn = previewBody.querySelector("#previewAudioPrevBtn");
    const audioNextBtn = previewBody.querySelector("#previewAudioNextBtn");
    if (prevBtn) {
      prevBtn.disabled = activeIndex <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = activeIndex >= state.mediaPreview.entries.length - 1;
    }
    if (audioPrevBtn) {
      audioPrevBtn.disabled = activeIndex <= 0;
    }
    if (audioNextBtn) {
      audioNextBtn.disabled = activeIndex >= state.mediaPreview.entries.length - 1;
    }
    
    // 更新文件名显示
    const toolbarName = previewBody.querySelector(".preview-media-toolbar-name");
    if (toolbarName && currentEntry) {
      const mediaName = state.escapeHtml(currentEntry.name || "预览文件");
      toolbarName.textContent = mediaName;
      toolbarName.title = mediaName;
    }
  };

  const renderMediaPreview = (previewType) => {
    if (!previewBody || !state.activeEntry || !["video", "audio"].includes(previewType)) return;
    syncMediaEntries(state.activeEntry, previewType);
    if (state.mediaPreview.activeIndex < 0 && state.mediaPreview.entries.length > 0) {
      setMediaActiveByIndex(0);
    }
    const currentEntry = state.activeEntry;
    const mediaEntries = state.mediaPreview.entries;
    const activeIndex = state.mediaPreview.activeIndex;
    const hasPrev = activeIndex > 0;
    const hasNext = activeIndex >= 0 && activeIndex < mediaEntries.length - 1;
    const sidebarCollapsed = Boolean(state.mediaPreview.sidebarCollapsed);
    const sidebarTitle = previewType === "video" ? "当前目录视频" : "当前目录音频";
    const emptyText = previewType === "video" ? "当前目录暂无视频" : "当前目录暂无音频";
    const mobileNav = isMobileViewport();
    const listHtml = mediaEntries.length > 0
      ? mediaEntries.map((item, index) => {
        const activeClass = index === activeIndex ? " is-active" : "";
        const name = state.escapeHtml(item && item.name ? item.name : "");
        return `
          <button type="button" class="preview-media-item${activeClass}" data-index="${index}" title="${name}">
            <span class="preview-media-item-index">${index + 1}.</span>
            <span class="preview-media-item-name">${name}</span>
          </button>
        `;
      }).join("")
      : `<div class="preview-media-empty">${emptyText}</div>`;
    const mediaUrl = getStreamPreviewUrl(currentEntry);
    const mediaName = state.escapeHtml(currentEntry.name || "预览文件");
    const playerHtml = previewType === "video"
      ? `<video class="preview-video preview-media-main-video" src="${mediaUrl}" controls autoplay preload="metadata" playsinline></video>`
      : `
        <div class="preview-media-audio-wrap">
          <audio class="preview-audio" src="${mediaUrl}" autoplay preload="metadata"></audio>
          <div class="preview-audio-progress-wrap">
            <span class="preview-audio-time" id="previewAudioCurrentTime">0:00</span>
            <div class="preview-audio-progress-arc">
              <svg viewBox="0 0 280 70" aria-hidden="true">
                <path d="M10 60 Q140 0 270 60" class="preview-audio-arc-track"></path>
                <path d="M10 60 Q140 0 270 60" class="preview-audio-arc-active" id="previewAudioArcActivePath"></path>
              </svg>
              <input id="previewAudioProgressRange" type="range" min="0" max="100" step="0.1" value="0" />
            </div>
            <span class="preview-audio-time" id="previewAudioDuration">0:00</span>
          </div>
          <div class="preview-audio-controls">
            <button type="button" class="preview-audio-btn" id="previewAudioPrevBtn" ${hasPrev ? "" : "disabled"} aria-label="上一首" title="上一首"><i class="fa-solid fa-backward-step"></i></button>
            <button type="button" class="preview-audio-btn is-primary" id="previewAudioPlayBtn" aria-label="播放/暂停" title="播放/暂停"><i class="fa-solid fa-pause"></i></button>
            <button type="button" class="preview-audio-btn" id="previewAudioNextBtn" ${hasNext ? "" : "disabled"} aria-label="下一首" title="下一首"><i class="fa-solid fa-forward-step"></i></button>
            <div class="preview-audio-volume-wrap">
              <button type="button" class="preview-audio-mute-btn" id="previewAudioLowMuteBtn" aria-label="静音" title="静音"><i class="fa-solid fa-volume-low"></i></button>
              <input id="previewAudioVolumeRange" type="range" min="0" max="100" step="1" value="100" />
              <button type="button" class="preview-audio-mute-btn" id="previewAudioMuteBtn" aria-label="静音" title="静音"><i class="fa-solid fa-volume-high" id="previewAudioMuteIcon"></i></button>
            </div>
          </div>
        </div>
      `;
    previewBody.innerHTML = `
      <div class="preview-media-layout">
        <aside class="preview-media-sidebar${sidebarCollapsed ? " is-collapsed" : ""}">
          <div class="preview-media-sidebar-title">
            <span>${sidebarTitle}（${mediaEntries.length}）</span>
            <button type="button" class="preview-sidebar-toggle-btn" id="previewMediaToggleSidebarBtn">${sidebarCollapsed ? "展开" : "收起"}</button>
          </div>
          <div class="preview-media-list" id="previewMediaList">${listHtml}</div>
        </aside>
        <section class="preview-media-main">
          <div class="preview-media-stage" id="previewMediaStage">
            ${sidebarCollapsed ? `<button type="button" class="preview-sidebar-expand-btn" id="previewMediaExpandSidebarBtn">展开列表</button>` : ""}
            ${previewType === "video" && !mobileNav ? `<button type="button" class="preview-media-nav prev" id="previewMediaPrevBtn" ${hasPrev ? "" : "disabled"}>上一项</button>` : ""}
            ${playerHtml}
            ${previewType === "video" && !mobileNav ? `<button type="button" class="preview-media-nav next" id="previewMediaNextBtn" ${hasNext ? "" : "disabled"}>下一项</button>` : ""}
          </div>
          <div class="preview-media-toolbar${previewType === "video" && mobileNav ? " with-mobile-nav" : ""}">
            ${previewType === "video" && mobileNav ? `<button type="button" class="preview-media-nav prev" id="previewMediaPrevBtn" ${hasPrev ? "" : "disabled"}>上一项</button>` : ""}
            <div class="preview-media-toolbar-center">
              <span class="preview-media-toolbar-name" title="${mediaName}">${mediaName}</span>
              <span class="preview-media-toolbar-tip">滚轮切换${previewType === "video" ? "视频" : "音频"}</span>
            </div>
            ${previewType === "video" && mobileNav ? `<button type="button" class="preview-media-nav next" id="previewMediaNextBtn" ${hasNext ? "" : "disabled"}>下一项</button>` : ""}
          </div>
        </section>
      </div>
    `;
    bindMediaPreviewEvents(previewType);
  };

  const bindImagePreviewEvents = () => {
    if (!previewBody) return;
    const listEl = previewBody.querySelector("#previewImageList");
    const prevBtn = previewBody.querySelector("#previewImagePrevBtn");
    const nextBtn = previewBody.querySelector("#previewImageNextBtn");
    const zoomInBtn = previewBody.querySelector("#previewImageZoomInBtn");
    const zoomOutBtn = previewBody.querySelector("#previewImageZoomOutBtn");
    const zoomResetBtn = previewBody.querySelector("#previewImageZoomResetBtn");
    const stageEl = previewBody.querySelector("#previewImageStage");
    const imageEl = previewBody.querySelector("#previewImageMainImg");
    const toggleSidebarBtn = previewBody.querySelector("#previewImageToggleSidebarBtn");
    const expandSidebarBtn = previewBody.querySelector("#previewImageExpandSidebarBtn");

    if (listEl) {
      listEl.onclick = (event) => {
        const target = event.target && typeof event.target.closest === "function"
          ? event.target.closest(".preview-image-item")
          : null;
        if (!target) return;
        const nextIndex = Number(target.dataset.index);
        if (!Number.isInteger(nextIndex)) return;
        if (!setImageActiveByIndex(nextIndex, { resetZoom: true })) return;
        updateImageActiveState();
      };
    }

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (!setImageActiveByIndex(state.imagePreview.activeIndex - 1, { resetZoom: true })) return;
        updateImageActiveState();
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (!setImageActiveByIndex(state.imagePreview.activeIndex + 1, { resetZoom: true })) return;
        updateImageActiveState();
      };
    }

    if (zoomInBtn) {
      zoomInBtn.onclick = () => {
        state.imagePreview.zoom = clampImageZoom(state.imagePreview.zoom + 0.2);
        updateImageActiveState();
      };
    }

    if (zoomOutBtn) {
      zoomOutBtn.onclick = () => {
        state.imagePreview.zoom = clampImageZoom(state.imagePreview.zoom - 0.2);
        if (state.imagePreview.zoom <= 1) {
          state.imagePreview.offsetX = 0;
          state.imagePreview.offsetY = 0;
        }
        updateImageActiveState();
      };
    }

    if (zoomResetBtn) {
      zoomResetBtn.onclick = () => {
        state.imagePreview.zoom = 1;
        state.imagePreview.offsetX = 0;
        state.imagePreview.offsetY = 0;
        updateImageActiveState();
      };
    }

    if (stageEl) {
      stageEl.onwheel = (event) => {
        event.preventDefault();
        if (state.imagePreview.entries.length <= 1) return;
        const now = Date.now();
        if (now - state.imagePreview.lastWheelAt < 150) return;
        state.imagePreview.lastWheelAt = now;
        const direction = event.deltaY > 0 ? 1 : -1;
        if (!setImageActiveByIndex(state.imagePreview.activeIndex + direction, { resetZoom: true })) return;
        updateImageActiveState();
      };
    }

    if (stageEl && imageEl) {
      const stopDragging = () => {
        state.imagePreview.dragging = false;
        stageEl.classList.remove("is-dragging");
      };
      if (state.imagePreview.zoom > 1) {
        stageEl.classList.add("can-drag");
      } else {
        stageEl.classList.remove("can-drag");
      }
      imageEl.onpointerdown = (event) => {
        if (state.imagePreview.zoom <= 1) return;
        event.preventDefault();
        state.imagePreview.dragging = true;
        state.imagePreview.dragStartX = event.clientX;
        state.imagePreview.dragStartY = event.clientY;
        state.imagePreview.dragOriginX = state.imagePreview.offsetX;
        state.imagePreview.dragOriginY = state.imagePreview.offsetY;
        stageEl.classList.add("is-dragging");
        if (typeof imageEl.setPointerCapture === "function") {
          imageEl.setPointerCapture(event.pointerId);
        }
      };
      imageEl.onpointermove = (event) => {
        if (!state.imagePreview.dragging) return;
        const deltaX = event.clientX - state.imagePreview.dragStartX;
        const deltaY = event.clientY - state.imagePreview.dragStartY;
        state.imagePreview.offsetX = state.imagePreview.dragOriginX + deltaX;
        state.imagePreview.offsetY = state.imagePreview.dragOriginY + deltaY;
        imageEl.style.transform = buildImageTransform();
      };
      imageEl.onpointerup = stopDragging;
      imageEl.onpointercancel = stopDragging;
      imageEl.onlostpointercapture = stopDragging;
    }
    if (toggleSidebarBtn) {
      toggleSidebarBtn.onclick = () => {
        state.imagePreview.sidebarCollapsed = !state.imagePreview.sidebarCollapsed;
        const sidebar = previewBody.querySelector(".preview-image-sidebar");
        if (sidebar) {
          sidebar.classList.toggle("is-collapsed", state.imagePreview.sidebarCollapsed);
        }
        toggleSidebarBtn.textContent = state.imagePreview.sidebarCollapsed ? "展开" : "收起";
        
        // 显示/隐藏展开按钮
        let expandBtn = previewBody.querySelector("#previewImageExpandSidebarBtn");
        if (state.imagePreview.sidebarCollapsed) {
          if (!expandBtn) {
            const stage = previewBody.querySelector("#previewImageStage");
            if (stage) {
              expandBtn = document.createElement("button");
              expandBtn.type = "button";
              expandBtn.className = "preview-sidebar-expand-btn";
              expandBtn.id = "previewImageExpandSidebarBtn";
              expandBtn.textContent = "展开列表";
              expandBtn.onclick = () => {
                state.imagePreview.sidebarCollapsed = false;
                if (sidebar) {
                  sidebar.classList.remove("is-collapsed");
                }
                toggleSidebarBtn.textContent = "收起";
                expandBtn.remove();
              };
              stage.insertBefore(expandBtn, stage.firstChild);
            }
          }
        } else if (expandBtn) {
          expandBtn.remove();
        }
      };
    }
    if (expandSidebarBtn) {
      expandSidebarBtn.onclick = () => {
        state.imagePreview.sidebarCollapsed = false;
        const sidebar = previewBody.querySelector(".preview-image-sidebar");
        if (sidebar) {
          sidebar.classList.remove("is-collapsed");
        }
        const toggleBtn = previewBody.querySelector("#previewImageToggleSidebarBtn");
        if (toggleBtn) {
          toggleBtn.textContent = "收起";
        }
        expandSidebarBtn.remove();
      };
    }
  };

  const updateImageActiveState = () => {
    if (!previewBody) return;
    const activeIndex = state.imagePreview.activeIndex;
    
    // 更新列表项的激活状态
    const listItems = previewBody.querySelectorAll(".preview-image-item");
    listItems.forEach((item, index) => {
      if (index === activeIndex) {
        item.classList.add("is-active");
        // 确保激活项在可视区域内
        if (typeof item.scrollIntoView === "function") {
          item.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      } else {
        item.classList.remove("is-active");
      }
    });
    
    // 更新主图
    const imageEl = previewBody.querySelector("#previewImageMainImg");
    const currentEntry = state.activeEntry;
    if (imageEl && currentEntry) {
      const imageUrl = getStreamPreviewUrl(currentEntry);
      const imageName = state.escapeHtml(currentEntry.name || "预览图片");
      
      // 添加错误处理，避免不必要的日志
      const handleImageError = (e) => {
        // 忽略加载错误（通常是切换时的正常中止）
        if (imageEl.error && imageEl.error.code === MediaError.MEDIA_ERR_ABORTED) {
          return;
        }
      };
      
      imageEl.onerror = handleImageError;
      imageEl.src = imageUrl;
      imageEl.alt = imageName;
      imageEl.style.transform = buildImageTransform();
    }
    
    // 更新工具栏的缩放比例显示
    const zoomDisplay = previewBody.querySelector(".preview-image-toolbar-center span:first-of-type");
    if (zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(clampImageZoom(state.imagePreview.zoom) * 100)}%`;
    }
    
    // 更新导航按钮状态
    const prevBtn = previewBody.querySelector("#previewImagePrevBtn");
    const nextBtn = previewBody.querySelector("#previewImageNextBtn");
    if (prevBtn) {
      prevBtn.disabled = activeIndex <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = activeIndex >= state.imagePreview.entries.length - 1;
    }
  };

  const renderImagePreview = () => {
    if (!previewBody || !state.activeEntry) return;
    syncImageEntries(state.activeEntry);
    if (state.imagePreview.activeIndex < 0 && state.imagePreview.entries.length > 0) {
      setImageActiveByIndex(0, { resetZoom: true });
    }
    const currentEntry = state.activeEntry;
    const imageEntries = state.imagePreview.entries;
    const activeIndex = state.imagePreview.activeIndex;
    const zoom = clampImageZoom(state.imagePreview.zoom);
    state.imagePreview.zoom = zoom;
    const sidebarCollapsed = Boolean(state.imagePreview.sidebarCollapsed);
    const mobileNav = isMobileViewport();
    const hasPrev = activeIndex > 0;
    const hasNext = activeIndex >= 0 && activeIndex < imageEntries.length - 1;
    const listHtml = imageEntries.length > 0
      ? imageEntries.map((item, index) => {
        const activeClass = index === activeIndex ? " is-active" : "";
        const name = state.escapeHtml(item && item.name ? item.name : "");
        const thumbUrl = getStreamPreviewUrl(item);
        return `
          <button type="button" class="preview-image-item${activeClass}" data-index="${index}" title="${name}">
            <span class="preview-image-item-index">${index + 1}.</span>
            <img src="${thumbUrl}" alt="${name}" loading="lazy" />
            <span class="preview-image-item-name">${name}</span>
          </button>
        `;
      }).join("")
      : `<div class="preview-image-empty">当前目录暂无图片</div>`;
    const imageUrl = getStreamPreviewUrl(currentEntry);
    const imageName = state.escapeHtml(currentEntry.name || "预览图片");
    previewBody.innerHTML = `
      <div class="preview-image-layout">
        <aside class="preview-image-sidebar${sidebarCollapsed ? " is-collapsed" : ""}">
          <div class="preview-image-sidebar-title">
            <span>当前目录图片（${imageEntries.length}）</span>
            <button type="button" class="preview-sidebar-toggle-btn" id="previewImageToggleSidebarBtn">${sidebarCollapsed ? "展开" : "收起"}</button>
          </div>
          <div class="preview-image-list" id="previewImageList">${listHtml}</div>
        </aside>
        <section class="preview-image-main">
          <div class="preview-image-stage" id="previewImageStage">
            ${sidebarCollapsed ? `<button type="button" class="preview-sidebar-expand-btn" id="previewImageExpandSidebarBtn">展开列表</button>` : ""}
            ${mobileNav ? "" : `<button type="button" class="preview-image-nav prev" id="previewImagePrevBtn" ${hasPrev ? "" : "disabled"}>上一张</button>`}
            <img src="${imageUrl}" alt="${imageName}" id="previewImageMainImg" class="preview-image-main-img" style="transform: ${buildImageTransform()};" />
            ${mobileNav ? "" : `<button type="button" class="preview-image-nav next" id="previewImageNextBtn" ${hasNext ? "" : "disabled"}>下一张</button>`}
          </div>
          <div class="preview-image-toolbar${mobileNav ? " with-mobile-nav" : ""}">
            ${mobileNav ? `<button type="button" class="preview-image-nav prev" id="previewImagePrevBtn" ${hasPrev ? "" : "disabled"}>上一张</button>` : ""}
            <div class="preview-image-toolbar-center">
              <button type="button" id="previewImageZoomOutBtn">缩小</button>
              <span>${Math.round(zoom * 100)}%</span>
              <button type="button" id="previewImageZoomInBtn">放大</button>
              <button type="button" id="previewImageZoomResetBtn">重置</button>
              <span class="preview-image-toolbar-tip">滚轮切换图片</span>
            </div>
            ${mobileNav ? `<button type="button" class="preview-image-nav next" id="previewImageNextBtn" ${hasNext ? "" : "disabled"}>下一张</button>` : ""}
          </div>
        </section>
      </div>
    `;
    bindImagePreviewEvents();
  };

  const open = async (entry) => {
    ensureDom();
    if (!entry || entry.type !== "file" || !previewModal || !previewBody || !previewTitle) return;
    const ext = getFileExt(entry.name);
    const previewType = resolvePreviewType(entry);
    if (!previewType) {
      showUnsupportedNotice();
      return;
    }
    state.activeEntry = entry;
    state.activeType = previewType;
    hideMiniWindow();
    setPreviewBodyImageMode(false);
    setPreviewBodyMediaMode(false);
    setPreviewBodyDocumentMode(false);
    setPreviewBodyDocumentMode(false);
    previewTitle.textContent = entry.name || "文件预览";
    setPreviewMeta(entry);
    previewModal.style.display = "flex";
    if (previewType === "image") {
      state.imagePreview.zoom = 1;
      state.imagePreview.lastWheelAt = 0;
      state.imagePreview.offsetX = 0;
      state.imagePreview.offsetY = 0;
      state.imagePreview.dragging = false;
      state.imagePreview.sidebarCollapsed = isMobileViewport();
      setPreviewBodyImageMode(true);
      renderImagePreview();
      return;
    }
    const previewUrl = getStreamPreviewUrl(entry);
    if (previewType === "video") {
      state.mediaPreview.lastWheelAt = 0;
      state.mediaPreview.sidebarCollapsed = isMobileViewport();
      setPreviewBodyMediaMode(true);
      renderMediaPreview("video");
      return;
    }
    if (previewType === "audio") {
      state.mediaPreview.lastWheelAt = 0;
      state.mediaPreview.sidebarCollapsed = isMobileViewport();
      setPreviewBodyMediaMode(true);
      renderMediaPreview("audio");
      return;
    }
    if (previewType === "document") {
      setPreviewBodyDocumentMode(true);
      const ext = getFileExt(entry.name);
      if (["docx", "doc", "xlsx", "xls", "csv"].includes(ext)) {
        // 对于 Office 文档，无论是否是压缩包中的文件，都使用 renderOfficePreviewFrame
        renderOfficePreviewFrame(entry, previewBody);
      } else {
        const previewUrl = getStreamPreviewUrl(entry);
        previewBody.innerHTML = `<iframe class="preview-iframe" src="${previewUrl}"></iframe>`;
      }
      return;
    }
    state.textPreview.text = "";
    state.textPreview.truncated = false;
    state.textPreview.canEdit = false;
    state.textPreview.dirty = false;
    state.textPreview.isSaving = false;
    renderTextPreview();
    
    // 如果是压缩包中的文件，直接使用 archiveContent
    if (entry.isArchiveEntry && entry.archiveContent) {
      try {
        const text = await entry.archiveContent.text();
        state.textPreview.text = text;
        state.textPreview.truncated = false;
        state.textPreview.canEdit = false; // 压缩包中的文件不可编辑
        state.textPreview.dirty = false;
        state.textPreview.isSaving = false;
        lastSavedText = state.textPreview.text;
        renderTextPreview();
        return;
      } catch {
        showUnsupported();
        return;
      }
    }
    
    if (typeof state.request !== "function") {
      showUnsupported();
      return;
    }
    try {
      const res = await state.request(`/api/preview/${entry.id}?mode=text&limit=400000`);
      if (!res.ok) {
        showUnsupported();
        return;
      }
      const data = await res.json();
      state.textPreview.text = typeof data.content === "string" ? data.content : "";
      state.textPreview.truncated = Boolean(data && data.truncated);
      state.textPreview.canEdit = Boolean(data && data.editable);
      state.textPreview.dirty = false;
      state.textPreview.isSaving = false;
      lastSavedText = state.textPreview.text;
      renderTextPreview();
    } catch {
      showUnsupported();
    }
  };

  const bindEvents = () => {
    if (eventsBound) return;
    ensureDom();
    if (!previewModal) return;
    if (closePreviewBtn) {
      closePreviewBtn.onclick = close;
    }
    if (minimizePreviewBtn) {
      minimizePreviewBtn.onclick = () => {
        if (!state.activeEntry || !state.activeType) return;
        if (previewModal) {
          previewModal.style.display = "none";
        }
        showMiniWindow();
      };
    }
    if (maximizePreviewBtn) {
      maximizePreviewBtn.onclick = () => {
        if (!state.activeEntry || !state.activeType) return;
        hideMiniWindow();
        open(state.activeEntry);
      };
    }
    if (closeMiniPreviewBtn) {
      closeMiniPreviewBtn.onclick = close;
    }
    eventsBound = true;
  };

  const getStreamPreviewUrl = (entry) => {
    // 如果是压缩包中的文件，直接使用 previewUrl
    if (entry && entry.isArchiveEntry && entry.previewUrl) {
      return entry.previewUrl;
    }
    if (!entry || entry.id === undefined || entry.id === null) return "";
    const rawUrl = `/api/preview/${encodeURIComponent(entry.id)}?mode=stream`;
    if (typeof state.buildPreviewUrl === "function") {
      return state.buildPreviewUrl(rawUrl, entry);
    }
    return rawUrl;
  };

  const init = ({ request, buildPreviewUrl, getEntries, escapeHtml } = {}) => {
    if (typeof request === "function") state.request = request;
    if (typeof buildPreviewUrl === "function") state.buildPreviewUrl = buildPreviewUrl;
    if (typeof getEntries === "function") state.getEntries = getEntries;
    if (typeof escapeHtml === "function") state.escapeHtml = escapeHtml;
    bindEvents();
  };

  global.DrivePreview = {
    init,
    open,
    close,
    resolvePreviewType,
    updatePreviewExtSets,
    getStreamPreviewUrl
  };
})(window);
