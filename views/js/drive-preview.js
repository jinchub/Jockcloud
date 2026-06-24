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

  const appendThemeParam = (url) => {
    if (!url) return url;
    const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}theme=${theme}`;
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
      dragOriginY: 0,
      pinchStartDistance: 0,
      pinchStartZoom: 1,
      pinching: false
    },
    mediaPreview: {
      entries: [],
      activeIndex: -1,
      sidebarCollapsed: false,
      lastWheelAt: 0,
      playbackMode: "once" // once: 单次播放, repeat-one: 单曲循环, repeat-all: 列表播放, shuffle: 随机播放
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
    if (size === null || size === undefined) return "-";
    const s = Number(size);
    if (!Number.isFinite(s) || s < 0) return "-";
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
      previewMeta.textContent = "大小：- ｜ 上传时间：-";
      return;
    }
    const sizeText = formatSize(entry.size);
    const timeText = formatDate(entry.createdAt || entry.updatedAt || entry.modifiedAt || entry.mtime);
    previewMeta.textContent = `大小：${sizeText} ｜ 上传时间：${timeText}`;
    // 如果是 PDF 预览，添加浏览器预览按钮到 meta 中（仅电脑端）
    if (state.activeType === "document" && getFileExt(state.activeEntry?.name) === "pdf" && typeof isMobileViewport === "function" && !isMobileViewport()) {
      const existingBtn = previewMeta.querySelector("#pdfBrowserPreviewBtn");
      if (!existingBtn) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "pdfBrowserPreviewBtn";
        btn.className = "pdf-tool-btn pdf-meta-btn";
        btn.title = "使用浏览器原生预览";
        btn.textContent = "浏览器预览";
        previewMeta.appendChild(btn);
      }
    }
    // 如果是 PPTX 预览，添加图片预览按钮到 meta 中
    if (state.activeType === "document" && getFileExt(state.activeEntry?.name) === "pptx") {
      const existingBtn = previewMeta.querySelector("#pptxBackToImageBtn");
      if (!existingBtn) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "pptxBackToImageBtn";
        btn.className = "pdf-tool-btn pdf-meta-btn";
        btn.title = "切换回图片预览模式";
        btn.textContent = "图片预览";
        btn.style.display = "none";
        previewMeta.appendChild(btn);
      }
    }
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
      } catch (error) { }
      if (!snapshot.paused) {
        const playResult = mediaEl.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(() => { });
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

  const showNotice = ({ title = "提示", message = "", isError = false, okText = "知道了", iconTone, iconClass, onOk } = {}) => {
    if (typeof global.showAppNotice === "function") {
      global.showAppNotice({ title, message, isError, okText, iconTone, iconClass, okAction: "custom", okPayload: onOk });
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
    const finalUrl = appendThemeParam(typeof state.buildPreviewUrl === "function" ? state.buildPreviewUrl(officeUrl, entry) : officeUrl);
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

  const renderPptxPreview = async (entry, container) => {
    if (!container || !entry) return;
    let pdfUrl;
    let fallbackHtmlUrl;
    if (entry.isArchiveEntry && entry.archiveId && entry.archivePath) {
      pdfUrl = `/api/files/${encodeURIComponent(entry.archiveId)}/zip/entry?path=${encodeURIComponent(entry.archivePath)}&mode=office&as-pdf=1`;
      fallbackHtmlUrl = `/api/files/${encodeURIComponent(entry.archiveId)}/zip/entry?path=${encodeURIComponent(entry.archivePath)}&mode=office`;
    } else if (entry.id !== undefined && entry.id !== null) {
      pdfUrl = `/api/preview/${encodeURIComponent(entry.id)}?mode=office&as-pdf=1`;
      fallbackHtmlUrl = `/api/preview/${encodeURIComponent(entry.id)}?mode=office`;
    } else {
      return;
    }
    const finalPdfUrl = typeof state.buildPreviewUrl === "function" ? state.buildPreviewUrl(pdfUrl, entry) : pdfUrl;
    const finalFallbackUrl = appendThemeParam(typeof state.buildPreviewUrl === "function" ? state.buildPreviewUrl(fallbackHtmlUrl, entry) : fallbackHtmlUrl);

    container.innerHTML = `
      <div class="pdf-preview pptx-preview">
        <div class="pdf-loading">正在加载预览...</div>
        <div class="pdf-error" style="display:none;"></div>
        <div class="pdf-content-wrap" style="display:none;">
          <div class="pdf-canvas-wrap pptx-canvas-wrap"></div>
        </div>
        <div class="pdf-toolbar pptx-toolbar" style="display:none;">
          <button type="button" class="pdf-tool-btn" id="pptxPrevPageBtn" disabled>上一页</button>
          <input type="text" class="pdf-page-input" id="pptxPageInput" value="0 / 0" />
          <button type="button" class="pdf-tool-btn" id="pptxNextPageBtn" disabled>下一页</button>
          <button type="button" class="pdf-tool-btn" id="pptxZoomOutBtn">-</button>
          <input type="text" class="pdf-zoom-input" id="pptxZoomInput" value="100%" />
          <button type="button" class="pdf-tool-btn" id="pptxZoomInBtn">+</button>
          <button type="button" class="pdf-tool-btn" id="pptxFitWidthBtn" title="适应宽度">适应宽度</button>
          <button type="button" class="pdf-tool-btn" id="pptxFallbackBtn" title="切换原始样式预览" style="display:none;">原始样式</button>
        </div>
      </div>
    `;

    const loading = container.querySelector(".pdf-loading");
    const errorDiv = container.querySelector(".pdf-error");
    const contentWrap = container.querySelector(".pdf-content-wrap");
    const canvasWrap = container.querySelector(".pptx-canvas-wrap");
    const toolbar = container.querySelector(".pptx-toolbar");
    const prevBtn = container.querySelector("#pptxPrevPageBtn");
    const nextBtn = container.querySelector("#pptxNextPageBtn");
    const pageInput = container.querySelector("#pptxPageInput");
    const zoomOutBtn = container.querySelector("#pptxZoomOutBtn");
    const zoomInBtn = container.querySelector("#pptxZoomInBtn");
    const zoomInput = container.querySelector("#pptxZoomInput");
    const fitWidthBtn = container.querySelector("#pptxFitWidthBtn");
    const fallbackBtn = container.querySelector("#pptxFallbackBtn");

    const fallbackToHtml = (message, showImageBtn = false) => {
      const loadingText = message || "正在加载预览...";
      container.innerHTML = `
        <div class="document-preview">
          <div class="loading" style="display:block;color:#666;padding:12px;">${loadingText}</div>
          <iframe class="preview-iframe" style="display:none;" src="${finalFallbackUrl}"></iframe>
        </div>
      `;
      const iframe = container.querySelector("iframe");
      const fallbackLoading = container.querySelector(".loading");
      // 仅手动切换时显示 meta 区域的图片预览按钮
      if (showImageBtn) {
        const backToImageBtn = previewMeta ? previewMeta.querySelector("#pptxBackToImageBtn") : null;
        if (backToImageBtn) backToImageBtn.style.display = "inline-block";
      }
      if (iframe) {
        iframe.onload = () => {
          iframe.style.display = "block";
          if (fallbackLoading) fallbackLoading.style.display = "none";
        };
        iframe.onerror = () => {
          if (fallbackLoading) fallbackLoading.textContent = "文档预览失败";
        };
      }
    };

    if (typeof pdfjsLib === "undefined") {
      fallbackToHtml("PDF.js 未加载，使用原始样式预览");
      return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs-dist@2.16.105/build/pdf.worker.min.js";

    let pdfDoc = null;
    let currentPage = 1;
    let scale = 1.0;
    let renderedPages = new Set();
    let pageHeights = [];

    const updatePageInfo = (pageNum) => {
      pageInput.value = `${pageNum} / ${pdfDoc.numPages}`;
      prevBtn.disabled = pageNum <= 1;
      nextBtn.disabled = pageNum >= pdfDoc.numPages;
    };
    const updateZoomInfo = () => {
      zoomInput.value = `${Math.round(scale * 100)}%`;
    };

    const parseZoomValue = (rawValue) => {
      if (rawValue == null) return NaN;
      const str = String(rawValue).trim().replace(/[%％]/g, "");
      const val = parseFloat(str);
      if (!isNaN(val) && val >= 50 && val <= 300) {
        return val;
      }
      return NaN;
    };

    const getPageViewport = async (pageNum) => {
      const page = await pdfDoc.getPage(pageNum);
      return page.getViewport({ scale: scale * 1.5 });
    };

    const createPagePlaceholder = (pageNum, viewport) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page-wrapper pptx-page-wrapper";
      wrapper.dataset.pageNum = pageNum;
      wrapper.style.width = viewport.width + "px";
      wrapper.style.height = viewport.height + "px";
      wrapper.style.marginBottom = "16px";
      wrapper.style.marginLeft = "auto";
      wrapper.style.marginRight = "auto";
      wrapper.style.position = "relative";
      wrapper.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
      wrapper.style.border = "1px solid #ddd";
      return wrapper;
    };

    const renderPageToWrap = async (pageNum) => {
      if (!pdfDoc || renderedPages.has(pageNum)) return;
      renderedPages.add(pageNum);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale * 1.5 });
        const wrapper = canvasWrap.querySelector(`.pptx-page-wrapper[data-page-num="${pageNum}"]`);
        if (!wrapper) return;
        const canvas = document.createElement("canvas");
        canvas.dataset.pageNum = pageNum;
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        canvas.style.position = "absolute";
        canvas.style.top = "0";
        canvas.style.left = "0";
        await page.render({ canvasContext: ctx, viewport }).promise;
        wrapper.appendChild(canvas);
        pageHeights[pageNum] = viewport.height + 16;
      } catch (e) {
        console.log("[pptx] render page error:", e);
      }
    };

    const getPageTopOffset = (pageNum) => {
      let offset = 0;
      for (let i = 1; i < pageNum; i++) {
        offset += pageHeights[i] || 1000;
      }
      return offset;
    };

    const checkAndRenderVisiblePages = async () => {
      if (!pdfDoc) return;
      const scrollTop = canvasWrap.scrollTop;
      const viewHeight = canvasWrap.clientHeight;
      const viewBottom = scrollTop + viewHeight;
      const margin = viewHeight * 2;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageTop = getPageTopOffset(i);
        const pageBottom = pageTop + (pageHeights[i] || 1000);
        if (pageBottom >= scrollTop - margin && pageTop <= viewBottom + margin && !renderedPages.has(i)) {
          await renderPageToWrap(i);
        }
      }
    };

    const initPagePlaceholders = async () => {
      canvasWrap.innerHTML = "";
      pageHeights = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const viewport = await getPageViewport(i);
        const placeholder = createPagePlaceholder(i, viewport);
        canvasWrap.appendChild(placeholder);
        pageHeights[i] = viewport.height + 16;
      }
    };

    const renderAllPages = async () => {
      if (!pdfDoc) return;
      const savedPage = currentPage;
      renderedPages.clear();
      await initPagePlaceholders();
      const targetWrapper = canvasWrap.querySelector(`.pptx-page-wrapper[data-page-num="${savedPage}"]`);
      if (targetWrapper) {
        targetWrapper.scrollIntoView({ block: "start", behavior: "instant" });
      }
      await checkAndRenderVisiblePages();
      onScroll();
    };

    const fitWidth = async () => {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const wrapWidth = canvasWrap.clientWidth - 32;
      scale = (wrapWidth / unscaledViewport.width) / 1.5;
      await renderAllPages();
      onScroll();
    };

    const onScroll = () => {
      if (!pdfDoc) return;
      const scrollTop = canvasWrap.scrollTop;
      let accumulatedHeight = 0;
      let foundPage = 1;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        accumulatedHeight += pageHeights[i] || 1000;
        if (accumulatedHeight > scrollTop) {
          foundPage = i;
          break;
        }
      }
      if (foundPage !== currentPage) {
        currentPage = foundPage;
        updatePageInfo(currentPage);
      }
      void checkAndRenderVisiblePages();
    };

    try {
      const response = await fetch(finalPdfUrl);
      if (!response.ok) {
        fallbackToHtml();
        return;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf")) {
        fallbackToHtml();
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      pdfDoc = await loadingTask.promise;
      loading.style.display = "none";
      contentWrap.style.display = "flex";
      toolbar.style.display = "flex";
      currentPage = 1;
      await renderAllPages();
      canvasWrap.addEventListener("scroll", onScroll);
      updatePageInfo(1);
      updateZoomInfo();
      onScroll();
      // 图片模式加载成功，显示原始样式切换按钮
      if (fallbackBtn) fallbackBtn.style.display = "inline-block";
    } catch (e) {
      console.log("[pptx] load error:", e);
      fallbackToHtml("PPT 转换失败，正在使用原始样式预览...");
      return;
    }

    prevBtn.onclick = () => {
      if (currentPage > 1) {
        const targetWrapper = canvasWrap.querySelector(`.pptx-page-wrapper[data-page-num="${currentPage - 1}"]`);
        if (targetWrapper) {
          targetWrapper.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    };
    nextBtn.onclick = () => {
      if (pdfDoc && currentPage < pdfDoc.numPages) {
        const targetWrapper = canvasWrap.querySelector(`.pptx-page-wrapper[data-page-num="${currentPage + 1}"]`);
        if (targetWrapper) {
          targetWrapper.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    };
    zoomOutBtn.onclick = async () => {
      if (scale > 0.5) {
        scale -= 0.25;
        updateZoomInfo();
        await renderAllPages();
        onScroll();
      }
    };
    zoomInBtn.onclick = async () => {
      if (scale < 3) {
        scale += 0.25;
        updateZoomInfo();
        await renderAllPages();
        onScroll();
      }
    };
    fitWidthBtn.onclick = async () => {
      await fitWidth();
      updateZoomInfo();
    };

    pageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = parseInt(pageInput.value, 10);
        if (!isNaN(val) && val >= 1 && val <= pdfDoc.numPages && val !== currentPage) {
          currentPage = val;
          const targetWrapper = canvasWrap.querySelector(`.pptx-page-wrapper[data-page-num="${val}"]`);
          if (targetWrapper) {
            targetWrapper.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        } else {
          updatePageInfo(currentPage);
        }
        pageInput.blur();
      }
    });
    pageInput.addEventListener("blur", () => {
      updatePageInfo(currentPage);
    });

    const applyZoomInput = () => {
      const val = parseZoomValue(zoomInput.value);
      if (!isNaN(val)) {
        scale = val / 100;
        updateZoomInfo();
        void renderAllPages();
        onScroll();
        return true;
      }
      updateZoomInfo();
      return false;
    };

    zoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyZoomInput();
        zoomInput.blur();
      }
    });
    zoomInput.addEventListener("blur", () => {
      applyZoomInput();
    });

    // 原始样式切换按钮
    let isFallbackMode = false;
    fallbackBtn.onclick = () => {
      isFallbackMode = !isFallbackMode;
      if (isFallbackMode) {
        fallbackBtn.textContent = "图片预览";
        fallbackBtn.title = "切换回图片预览模式";
        fallbackToHtml("已切换到原始样式预览", true);
      } else {
        fallbackBtn.textContent = "原始样式";
        fallbackBtn.title = "切换原始样式预览";
        // 重新渲染 PDF.js 预览
        renderPptxPreview(entry, container);
      }
    };

    // meta 区域的图片预览按钮
    const metaBackToImageBtn = previewMeta ? previewMeta.querySelector("#pptxBackToImageBtn") : null;
    if (metaBackToImageBtn) {
      metaBackToImageBtn.onclick = () => {
        // 隐藏 meta 按钮，重新渲染图片预览
        metaBackToImageBtn.style.display = "none";
        renderPptxPreview(entry, container);
      };
    }
  };

  const renderPdfPreview = async (entry, container) => {
    if (!container || !entry) return;
    let pdfUrl;
    if (entry.isArchiveEntry && entry.archiveId && entry.archivePath) {
      pdfUrl = `/api/files/${encodeURIComponent(entry.archiveId)}/zip/entry?path=${encodeURIComponent(entry.archivePath)}&mode=stream`;
    } else if (entry.id !== undefined && entry.id !== null) {
      pdfUrl = `/api/preview/${encodeURIComponent(entry.id)}?mode=stream`;
    } else {
      return;
    }
    const finalUrl = typeof state.buildPreviewUrl === "function" ? state.buildPreviewUrl(pdfUrl, entry) : pdfUrl;

    container.innerHTML = `
      <div class="pdf-preview">
        <div class="pdf-loading">正在加载 PDF，请稍候...</div>
        <div class="pdf-error" style="display:none;">PDF 加载失败，请稍后重试</div>
        <div class="pdf-content-wrap">
          <div class="pdf-outline-panel" id="pdfOutlinePanel" style="display:${/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "none" : "flex"};">
            <div class="pdf-outline-header">
              <span class="pdf-outline-title">目录</span>
              <button type="button" class="pdf-outline-close-btn" id="pdfOutlineCloseBtn">×</button>
            </div>
            <div class="pdf-outline-list" id="pdfOutlineList"></div>
          </div>
          <div class="pdf-canvas-wrap"></div>
        </div>
        <div class="pdf-toolbar">
          <button type="button" class="pdf-tool-btn" id="pdfToggleOutlineBtn" title="显示目录">☰</button>
          <button type="button" class="pdf-tool-btn" id="pdfPrevPageBtn" disabled>上一页</button>
          <input type="text" class="pdf-page-input" id="pdfPageInput" value="0 / 0" />
          <button type="button" class="pdf-tool-btn" id="pdfNextPageBtn" disabled>下一页</button>
          <button type="button" class="pdf-tool-btn" id="pdfZoomOutBtn">-</button>
          <input type="text" class="pdf-zoom-input" id="pdfZoomInput" value="100%" />
          <button type="button" class="pdf-tool-btn" id="pdfZoomInBtn">+</button>
          <button type="button" class="pdf-tool-btn" id="pdfFitWidthBtn" title="适应宽度">适应宽度</button>
        </div>
      </div>
    `;

    const loading = container.querySelector(".pdf-loading");
    const errorDiv = container.querySelector(".pdf-error");
    const canvasWrap = container.querySelector(".pdf-canvas-wrap");
    const prevBtn = container.querySelector("#pdfPrevPageBtn");
    const nextBtn = container.querySelector("#pdfNextPageBtn");
    const pageInput = container.querySelector("#pdfPageInput");
    const zoomOutBtn = container.querySelector("#pdfZoomOutBtn");
    const zoomInBtn = container.querySelector("#pdfZoomInBtn");
    const zoomInput = container.querySelector("#pdfZoomInput");
    const fitWidthBtn = container.querySelector("#pdfFitWidthBtn");

    if (typeof pdfjsLib === "undefined") {
      loading.textContent = "PDF.js 未加载，请刷新页面重试";
      return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs-dist@2.16.105/build/pdf.worker.min.js";

    let pdfDoc = null;
    let currentPage = 1;
    let scale = 1.0;
    let rendering = false;
    let highlightOutlineItem = null;
    let renderedPages = new Set(); // 已渲染的页码
    let pageHeights = []; // 存储每页的渲染高度

    const updatePageInfo = (pageNum) => {
      pageInput.value = `${pageNum} / ${pdfDoc.numPages}`;
      prevBtn.disabled = pageNum <= 1;
      nextBtn.disabled = pageNum >= pdfDoc.numPages;
    };
    const updateZoomInfo = () => {
      zoomInput.value = `${Math.round(scale * 100)}%`;
    };

    const parseZoomValue = (rawValue) => {
      if (rawValue == null) return NaN;
      const str = String(rawValue).trim().replace(/[%％]/g, "");
      const val = parseFloat(str);
      if (!isNaN(val) && val >= 50 && val <= 300) {
        return val;
      }
      return NaN;
    };

    // 获取页面 viewport
    const getPageViewport = async (pageNum) => {
      const page = await pdfDoc.getPage(pageNum);
      return page.getViewport({ scale: scale * 1.5 });
    };

    // 创建页面占位元素
    const createPagePlaceholder = (pageNum, viewport) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page-wrapper";
      wrapper.dataset.pageNum = pageNum;
      wrapper.style.width = viewport.width + "px";
      wrapper.style.height = viewport.height + "px";
      wrapper.style.marginBottom = "12px";
      wrapper.style.marginLeft = "auto";
      wrapper.style.marginRight = "auto";
      wrapper.style.position = "relative";
      return wrapper;
    };

    // 渲染单个页面
    const renderPageToWrap = async (pageNum) => {
      if (!pdfDoc || renderedPages.has(pageNum)) return;
      renderedPages.add(pageNum);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale * 1.5 });
        const wrapper = canvasWrap.querySelector(`.pdf-page-wrapper[data-page-num="${pageNum}"]`);
        if (!wrapper) return;

        const canvas = document.createElement("canvas");
        canvas.dataset.pageNum = pageNum;
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        canvas.style.position = "absolute";
        canvas.style.top = "0";
        canvas.style.left = "0";
        await page.render({ canvasContext: ctx, viewport }).promise;
        wrapper.appendChild(canvas);
        pageHeights[pageNum] = viewport.height + 12;
      } catch (e) {
        console.log("[pdf] render page error:", e);
      }
    };

    // 获取页面在 canvasWrap 中的偏移
    const getPageTopOffset = (pageNum) => {
      let offset = 0;
      for (let i = 1; i < pageNum; i++) {
        offset += pageHeights[i] || 1000;
      }
      return offset;
    };

    // 检查并渲染可视区域内的页面（懒加载）
    const checkAndRenderVisiblePages = async () => {
      if (!pdfDoc) return;
      const scrollTop = canvasWrap.scrollTop;
      const viewHeight = canvasWrap.clientHeight;
      const viewBottom = scrollTop + viewHeight;
      const margin = viewHeight * 2; // 预加载上下各两屏

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageTop = getPageTopOffset(i);
        const pageBottom = pageTop + (pageHeights[i] || 1000);
        if (pageBottom >= scrollTop - margin && pageTop <= viewBottom + margin && !renderedPages.has(i)) {
          await renderPageToWrap(i);
        }
      }
    };

    // 初始化所有页面占位
    const initPagePlaceholders = async () => {
      canvasWrap.innerHTML = "";
      pageHeights = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const viewport = await getPageViewport(i);
        const placeholder = createPagePlaceholder(i, viewport);
        canvasWrap.appendChild(placeholder);
        pageHeights[i] = viewport.height + 12;
      }
    };

    // 重新渲染所有页面（缩放时调用）
    const renderAllPages = async () => {
      if (!pdfDoc) return;
      // 保存当前页面
      const savedPage = currentPage;
      renderedPages.clear();
      await initPagePlaceholders();
      // 滚动到当前页
      const targetWrapper = canvasWrap.querySelector(`.pdf-page-wrapper[data-page-num="${savedPage}"]`);
      if (targetWrapper) {
        targetWrapper.scrollIntoView({ block: "start", behavior: "instant" });
      }
      await checkAndRenderVisiblePages();
      onScroll();
    };

    // 计算适应宽度的缩放比例
    const fitWidth = async () => {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const wrapWidth = canvasWrap.clientWidth - 32;
      scale = (wrapWidth / unscaledViewport.width) / 1.5;
      await renderAllPages();
      onScroll();
    };

    // 滚动时更新当前页码和高亮，并触发懒加载
    const onScroll = () => {
      if (!pdfDoc) return;
      const scrollTop = canvasWrap.scrollTop;

      // 计算当前页码
      let accumulatedHeight = 0;
      let foundPage = 1;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        accumulatedHeight += pageHeights[i] || 1000;
        if (accumulatedHeight > scrollTop) {
          foundPage = i;
          break;
        }
      }
      if (foundPage !== currentPage) {
        currentPage = foundPage;
        updatePageInfo(currentPage);
        if (highlightOutlineItem) {
          highlightOutlineItem(currentPage);
        }
      }

      // 懒加载
      void checkAndRenderVisiblePages();
    };

    try {
      // 先用 fetch 获取 PDF（会自动携带 cookies），再传递给 PDF.js
      const response = await fetch(finalUrl);
      if (!response.ok) {
        loading.textContent = "PDF 加载失败，请稍后重试";
        errorDiv.style.display = "block";
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      pdfDoc = await loadingTask.promise;
      loading.style.display = "none";
      currentPage = 1;
      await renderAllPages();

      // 绑定滚动事件
      canvasWrap.addEventListener("scroll", onScroll);
      // 初始化页码显示
      updatePageInfo(1);
      updateZoomInfo();
      // 初始化触发一次
      onScroll();

      // 加载并渲染目录
      const outline = await pdfDoc.getOutline();
      const outlinePanel = container.querySelector("#pdfOutlinePanel");
      const outlineList = container.querySelector("#pdfOutlineList");
      // 存储页码到目录元素的映射
      const outlinePageMap = [];

      if (outline && outline.length > 0 && outlineList) {
        const renderOutlineItems = async (items, parentEl, depth = 0) => {
          for (const item of items) {
            const div = document.createElement("div");
            div.className = "pdf-outline-item";
            div.style.paddingLeft = `${depth * 16 + 8}px`;
            div.textContent = item.title;

            let dest = item.dest;
            if (typeof dest === "string") {
              dest = await pdfDoc.getDestination(dest);
            }
            let itemPage = null;
            if (dest && dest.length > 0) {
              const pageRef = dest[0];
              const pageIndex = await pdfDoc.getPageIndex(pageRef);
              itemPage = pageIndex + 1;
              outlinePageMap.push({ el: div, page: itemPage });

              div.onclick = async () => {
                currentPage = itemPage;
                const targetWrapper = canvasWrap.querySelector(`.pdf-page-wrapper[data-page-num="${itemPage}"]`);
                if (targetWrapper) {
                  targetWrapper.scrollIntoView({ block: "start", behavior: "smooth" });
                }
              };
            }

            parentEl.appendChild(div);
            if (item.items && item.items.length > 0) {
              await renderOutlineItems(item.items, parentEl, depth + 1);
            }
          }
        };
        await renderOutlineItems(outline, outlineList);
      }

      // 高亮当前页面对应的目录项
      highlightOutlineItem = (pageNum) => {
        outlineList.querySelectorAll(".pdf-outline-item").forEach((el) => el.classList.remove("active"));
        // 找到小于等于当前页码的最后一个目录项
        let activeItem = null;
        for (const m of outlinePageMap) {
          if (m.page <= pageNum) {
            activeItem = m.el;
          } else {
            break;
          }
        }
        if (activeItem) {
          activeItem.classList.add("active");
          // 滚动到可视区域
          activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      };
    } catch (e) {
      console.log("[pdf] load error:", e);
      loading.style.display = "none";
      errorDiv.style.display = "block";
      return;
    }

    prevBtn.onclick = () => {
      if (currentPage > 1) {
        const targetWrapper = canvasWrap.querySelector(`.pdf-page-wrapper[data-page-num="${currentPage - 1}"]`);
        if (targetWrapper) {
          targetWrapper.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    };
    nextBtn.onclick = () => {
      if (pdfDoc && currentPage < pdfDoc.numPages) {
        const targetWrapper = canvasWrap.querySelector(`.pdf-page-wrapper[data-page-num="${currentPage + 1}"]`);
        if (targetWrapper) {
          targetWrapper.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    };
    zoomOutBtn.onclick = async () => {
      if (scale > 0.5) {
        scale -= 0.25;
        updateZoomInfo();
        await renderAllPages();
        onScroll();
      }
    };
    zoomInBtn.onclick = async () => {
      if (scale < 3) {
        scale += 0.25;
        updateZoomInfo();
        await renderAllPages();
        onScroll();
      }
    };
    fitWidthBtn.onclick = async () => {
      await fitWidth();
      updateZoomInfo();
    };

    // 目录面板切换
    const toggleOutlineBtn = container.querySelector("#pdfToggleOutlineBtn");
    const outlinePanel = container.querySelector("#pdfOutlinePanel");
    const outlineCloseBtn = container.querySelector("#pdfOutlineCloseBtn");
    if (toggleOutlineBtn && outlinePanel) {
      const hasOutline = outlinePanel.querySelector(".pdf-outline-item");
      if (!hasOutline) {
        toggleOutlineBtn.style.display = "none";
      }
      toggleOutlineBtn.onclick = () => {
        outlinePanel.style.display = outlinePanel.style.display === "none" ? "flex" : "none";
      };
    }
    if (outlineCloseBtn && outlinePanel) {
      outlineCloseBtn.onclick = () => {
        outlinePanel.style.display = "none";
      };
    }

    // 页码输入处理
    pageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = parseInt(pageInput.value, 10);
        if (!isNaN(val) && val >= 1 && val <= pdfDoc.numPages && val !== currentPage) {
          currentPage = val;
          const targetWrapper = canvasWrap.querySelector(`.pdf-page-wrapper[data-page-num="${val}"]`);
          if (targetWrapper) {
            targetWrapper.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        } else {
          updatePageInfo(currentPage);
        }
        pageInput.blur();
      }
    });
    pageInput.addEventListener("blur", () => {
      updatePageInfo(currentPage);
    });

    // 缩放输入处理
    const applyZoomInput = () => {
      const val = parseZoomValue(zoomInput.value);
      if (!isNaN(val)) {
        scale = val / 100;
        updateZoomInfo();
        void renderAllPages();
        onScroll();
        return true;
      }
      updateZoomInfo();
      return false;
    };

    zoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyZoomInput();
        zoomInput.blur();
      }
    });
    zoomInput.addEventListener("blur", () => {
      applyZoomInput();
    });

    // 浏览器原生预览（iframe 模式），仅电脑端
    const metaBrowserBtn = previewMeta.querySelector("#pdfBrowserPreviewBtn");
    if (typeof isMobileViewport === "function" && isMobileViewport()) {
      if (metaBrowserBtn) metaBrowserBtn.style.display = "none";
    } else {
      if (metaBrowserBtn) {
        metaBrowserBtn.onclick = () => {
          // 替换 meta 中的按钮
          metaBrowserBtn.textContent = "PDF.js 预览";
          metaBrowserBtn.title = "切换回 PDF.js 预览";
          metaBrowserBtn.onclick = () => {
            // 恢复按钮
            metaBrowserBtn.textContent = "浏览器预览";
            metaBrowserBtn.title = "使用浏览器原生预览";
            void renderPdfPreview(entry, container);
          };
          // 切换为 iframe 模式
          container.innerHTML = `
            <div class="pdf-iframe-wrap">
              <iframe class="preview-iframe" src="${finalUrl}"></iframe>
            </div>
          `;
        };
      }
    }
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
      if (["docx", "doc", "xlsx", "xls", "csv", "pptx"].includes(ext)) {
        renderOfficePreviewFrame(entry, previewMiniBody);
      } else if (ext === "pdf") {
        void renderPdfPreview(entry, previewMiniBody);
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

  const showUnsupportedNotice = (entry) => {
    const iconClass = (entry && typeof global.getFileIcon === "function") ? global.getFileIcon(entry) : "fa-solid fa-file";
    showNotice({
      title: "提示",
      message: "当前文件暂不支持预览，请下载后查看",
      isError: false,
      iconTone: "orange",
      iconClass: iconClass,
      okText: "下载",
      onOk: () => {
        if (typeof global.startDownloadTask === "function" && entry) {
          global.startDownloadTask(entry);
        }
      }
    });
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
    const audioVolumeBtn = previewBody.querySelector("#previewAudioVolumeBtn");
    const audioVolumeIcon = previewBody.querySelector("#previewAudioVolumeIcon");
    const audioVolumePopup = previewBody.querySelector("#previewAudioVolumePopup");
    const audioModeBtn = previewBody.querySelector("#previewAudioModeBtn");
    const audioModeIcon = previewBody.querySelector("#previewAudioModeIcon");
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
      const audioCover = previewBody.querySelector("#previewAudioCover");
      const syncPlayState = () => {
        const isPaused = audioEl.paused;
        audioPlayBtn.innerHTML = isPaused
          ? '<i class="fa-solid fa-play"></i>'
          : '<i class="fa-solid fa-pause"></i>';
        if (audioCover) {
          audioCover.classList.add("is-rotating");
          audioCover.style.animationPlayState = isPaused ? "paused" : "running";
        }
      };
      syncPlayState();
      audioPlayBtn.onclick = () => {
        if (audioEl.paused) {
          const playResult = audioEl.play();
          if (playResult && typeof playResult.catch === "function") {
            playResult.catch(() => { });
          }
          return;
        }
        audioEl.pause();
      };
      audioEl.onplay = syncPlayState;
      audioEl.onpause = syncPlayState;
      audioEl.onended = () => {
        const mode = state.mediaPreview.playbackMode || "once";
        const entries = state.mediaPreview.entries;
        const currentIndex = state.mediaPreview.activeIndex;
        if (mode === "repeat-one") {
          // 单曲循环：重新播放当前歌曲
          audioEl.currentTime = 0;
          audioEl.play().catch(() => {});
        } else if (mode === "repeat-all") {
          // 列表播放：播放下一首，到末尾后回到第一首
          let nextIndex = currentIndex + 1;
          if (nextIndex >= entries.length) {
            nextIndex = 0;
          }
          if (!setMediaActiveByIndex(nextIndex)) return;
          updateMediaActiveState(previewType);
        } else if (mode === "shuffle") {
          // 随机播放：随机选择一首（排除当前）
          if (entries.length > 1) {
            let randomIndex;
            do {
              randomIndex = Math.floor(Math.random() * entries.length);
            } while (randomIndex === currentIndex);
            if (!setMediaActiveByIndex(randomIndex)) return;
            updateMediaActiveState(previewType);
          }
        }
        // once 模式：播放结束后不自动切换
      };
    }
    if (audioProgressRange && audioEl) {
      const audioProgressFill = previewBody.querySelector("#previewAudioProgressFill");
      const audioProgressThumb = previewBody.querySelector("#previewAudioProgressThumb");
      const audioProgressBar = previewBody.querySelector("#previewAudioProgressBar");
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
        if (audioProgressFill) audioProgressFill.style.width = `${percent}%`;
        if (audioProgressThumb) audioProgressThumb.style.left = `${percent}%`;
      };
      syncProgress();
      if (audioProgressRange) {
        audioProgressRange.oninput = () => {
          const duration = Number(audioEl.duration);
          if (!Number.isFinite(duration) || duration <= 0) return;
          const percent = Math.max(0, Math.min(100, Number(audioProgressRange.value) || 0));
          audioEl.currentTime = duration * (percent / 100);
          syncProgress();
        };
      }
      if (audioProgressBar) {
        audioProgressBar.addEventListener("pointerdown", () => audioProgressBar.classList.add("is-dragging"));
        document.addEventListener("pointerup", () => audioProgressBar.classList.remove("is-dragging"));
      }
      audioEl.ontimeupdate = syncProgress;
      audioEl.onloadedmetadata = syncProgress;
      audioEl.ondurationchange = syncProgress;
    }
    if (audioVolumeRange && audioEl) {
      const syncVolumeIcon = () => {
        const currentVolume = audioEl.muted ? 0 : Number(audioEl.volume);
        const volumePercent = Math.round(Math.max(0, Math.min(1, currentVolume)) * 100);
        audioVolumeRange.value = String(volumePercent);
        audioVolumeRange.style.setProperty("--volume-percent", `${volumePercent}%`);
        if (audioVolumeIcon) {
          let iconClass = "fa-solid fa-volume-high";
          if (audioEl.muted || currentVolume <= 0) {
            iconClass = "fa-solid fa-volume-xmark";
          } else if (currentVolume < 0.5) {
            iconClass = "fa-solid fa-volume-low";
          }
          audioVolumeIcon.className = iconClass;
        }
      };
      const togglePopup = (event) => {
        if (event) event.stopPropagation();
        if (audioVolumePopup) {
          audioVolumePopup.classList.toggle("is-open");
        }
      };
      syncVolumeIcon();
      audioVolumeRange.oninput = () => {
        const value = Number(audioVolumeRange.value);
        const volume = Math.max(0, Math.min(1, value / 100));
        audioEl.volume = volume;
        audioEl.muted = volume <= 0;
      };
      if (audioVolumeBtn) audioVolumeBtn.onclick = togglePopup;
      audioEl.onvolumechange = syncVolumeIcon;
      if (audioVolumePopup) {
        const closePopup = (event) => {
          if (!audioVolumePopup.contains(event.target) && (!audioVolumeBtn || !audioVolumeBtn.contains(event.target))) {
            audioVolumePopup.classList.remove("is-open");
          }
        };
        document.addEventListener("click", closePopup);
      }
    }
    if (audioModeBtn && audioModeIcon) {
      const PLAYBACK_MODES = ["once", "repeat-one", "repeat-all", "shuffle"];
      const PLAYBACK_MODE_ICONS = {
        once: "fa-solid fa-arrow-right-arrow-left",
        "repeat-one": "fa-solid fa-repeat",
        "repeat-all": "fa-solid fa-list-ol",
        shuffle: "fa-solid fa-shuffle"
      };
      const PLAYBACK_MODE_TITLES = {
        once: "单次播放",
        "repeat-one": "单曲循环",
        "repeat-all": "列表播放",
        shuffle: "随机播放"
      };
      const syncModeIcon = () => {
        const mode = state.mediaPreview.playbackMode || "once";
        audioModeIcon.className = PLAYBACK_MODE_ICONS[mode] || PLAYBACK_MODE_ICONS.once;
        audioModeBtn.title = PLAYBACK_MODE_TITLES[mode] || "单次播放";
      };
      syncModeIcon();
      audioModeBtn.onclick = () => {
        const currentIndex = PLAYBACK_MODES.indexOf(state.mediaPreview.playbackMode);
        const nextIndex = (currentIndex + 1) % PLAYBACK_MODES.length;
        state.mediaPreview.playbackMode = PLAYBACK_MODES[nextIndex];
        syncModeIcon();
      };
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
        // 只保留音量/静音/播放/暂停偏好，新歌曲从 0 秒开始
        const wasPaused = mediaEl.paused;
        const volume = mediaEl.volume;
        const muted = mediaEl.muted;

        const handleError = (e) => {
          if (mediaEl.error && mediaEl.error.code === MediaError.MEDIA_ERR_ABORTED) {
            return;
          }
        };

        mediaEl.src = mediaUrl;
        mediaEl.onerror = handleError;
        mediaEl.load();

        // 新歌曲重置到 0 秒
        const resetAndPlay = () => {
          try {
            mediaEl.currentTime = 0;
          } catch (error) { }
          if (!wasPaused) {
            const playResult = mediaEl.play();
            if (playResult && typeof playResult.catch === "function") {
              playResult.catch(() => { });
            }
          }
        };
        if (mediaEl.readyState >= 1) {
          resetAndPlay();
        } else {
          mediaEl.addEventListener("loadedmetadata", resetAndPlay, { once: true });
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
    const audioTitleEl = previewBody.querySelector(".preview-audio-title");
    if (toolbarName && currentEntry) {
      const mediaName = state.escapeHtml(currentEntry.name || "预览文件");
      toolbarName.textContent = mediaName;
      toolbarName.title = mediaName;
    }
    if (audioTitleEl && currentEntry) {
      audioTitleEl.textContent = state.escapeHtml(currentEntry.name || "预览文件");
      audioTitleEl.title = state.escapeHtml(currentEntry.name || "预览文件");
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
        const thumbUrl = previewType === "video"
          ? `/api/preview/${encodeURIComponent(item.id)}?mode=stream&variant=thumb`
          : "";
        const thumbHtml = previewType === "video" && thumbUrl
          ? `<img class="preview-media-item-thumb" src="${thumbUrl}" alt="" loading="lazy" onerror="this.style.display='none'" />`
          : "";
        const audioIconHtml = previewType === "audio"
          ? `<i class="fa-solid fa-music file-audio file-icon preview-media-item-icon"></i>`
          : "";
        return `
          <button type="button" class="preview-media-item${activeClass}" data-index="${index}" title="${name}">
            <span class="preview-media-item-index">${index + 1}.</span>
            ${audioIconHtml}${thumbHtml}
            <span class="preview-media-item-name">${name}</span>
          </button>
        `;
      }).join("")
      : `<div class="preview-media-empty">${emptyText}</div>`;
    const mediaUrl = getStreamPreviewUrl(currentEntry);
    const mediaName = state.escapeHtml(currentEntry.name || "预览文件");
    const existingAvatarImg = document.querySelector(".user-avatar-img");
    const profileAvatarImg = document.querySelector("#profileCenterAvatar img");
    let avatarUrlRaw =
      (existingAvatarImg && existingAvatarImg.tagName === "IMG" && existingAvatarImg.getAttribute("src")) ||
      (profileAvatarImg && profileAvatarImg.tagName === "IMG" && profileAvatarImg.getAttribute("src")) ||
      "";
    const avatarUrl = String(avatarUrlRaw || "").trim();
    const playerHtml = previewType === "video"
      ? `<video class="preview-video preview-media-main-video" src="${mediaUrl}" controls autoplay preload="metadata" playsinline></video>`
      : `
        <div class="preview-media-audio-wrap">
          <audio class="preview-audio" src="${mediaUrl}" autoplay preload="metadata"></audio>
          <div class="preview-audio-cover" id="previewAudioCover">
            ${avatarUrl ? `<img class="preview-audio-avatar" src="${state.escapeHtml(avatarUrl)}" alt="" />` : `<div class="preview-audio-avatar-preview"></div>`}
          </div>
          <div class="preview-audio-title">${mediaName}</div>
          <div class="preview-audio-subtitle">云盘音乐</div>
          <div class="preview-audio-progress-wrap">
            <span class="preview-audio-time" id="previewAudioCurrentTime">0:00</span>
            <div class="preview-audio-progress-bar" id="previewAudioProgressBar">
              <div class="preview-audio-progress-bar-fill" id="previewAudioProgressFill"></div>
              <div class="preview-audio-progress-bar-thumb" id="previewAudioProgressThumb"></div>
              <input id="previewAudioProgressRange" type="range" min="0" max="100" step="0.1" value="0" />
            </div>
            <span class="preview-audio-time" id="previewAudioDuration">0:00</span>
            <div class="preview-audio-volume-wrap">
              <button type="button" class="preview-audio-volume-btn" id="previewAudioVolumeBtn" aria-label="音量" title="音量"><i class="fa-solid fa-volume-high" id="previewAudioVolumeIcon"></i></button>
              <div class="preview-audio-volume-popup" id="previewAudioVolumePopup">
                <input id="previewAudioVolumeRange" type="range" min="0" max="100" step="1" value="100" />
              </div>
            </div>
          </div>
          <div class="preview-audio-controls">
            <button type="button" class="preview-audio-btn" id="previewAudioPrevBtn" ${hasPrev ? "" : "disabled"} aria-label="上一首" title="上一首"><i class="fa-solid fa-backward-step"></i></button>
            <button type="button" class="preview-audio-btn is-primary" id="previewAudioPlayBtn" aria-label="播放/暂停" title="播放/暂停"><i class="fa-solid fa-pause"></i></button>
            <button type="button" class="preview-audio-btn" id="previewAudioNextBtn" ${hasNext ? "" : "disabled"} aria-label="下一首" title="下一首"><i class="fa-solid fa-forward-step"></i></button>
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
          <div class="preview-media-stage${previewType === "audio" ? " is-audio-stage" : ""}" id="previewMediaStage">
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
            ${previewType === "audio" ? `<div class="preview-media-toolbar-right"><button type="button" class="preview-audio-mode-btn" id="previewAudioModeBtn" aria-label="播放模式" title="播放模式"><i class="fa-solid fa-arrow-right-arrow-left" id="previewAudioModeIcon"></i></button></div>` : ""}
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

      // 双指缩放
      let pinchStartDistance = 0;
      let pinchStartZoom = 1;
      let isPinching = false;

      const getTouchDistance = (touch1, touch2) => {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
      };

      stageEl.ontouchstart = (event) => {
        if (event.touches.length === 2) {
          event.preventDefault();
          isPinching = true;
          pinchStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
          pinchStartZoom = state.imagePreview.zoom;
        }
      };

      stageEl.ontouchmove = (event) => {
        if (!isPinching || event.touches.length !== 2) return;
        event.preventDefault();
        const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
        const scale = currentDistance / pinchStartDistance;
        const newZoom = clampImageZoom(pinchStartZoom * scale);
        state.imagePreview.zoom = newZoom;
        if (newZoom <= 1) {
          state.imagePreview.offsetX = 0;
          state.imagePreview.offsetY = 0;
        }
        imageEl.style.transform = buildImageTransform();
        // 更新缩放显示
        const zoomDisplay = previewBody.querySelector(".preview-image-toolbar-center span:first-of-type");
        if (zoomDisplay) {
          zoomDisplay.textContent = `${Math.round(newZoom * 100)}%`;
        }
      };

      stageEl.ontouchend = (event) => {
        if (event.touches.length < 2) {
          isPinching = false;
        }
      };
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
        const thumbUrl = `/api/preview/${encodeURIComponent(item.id)}?mode=stream&variant=thumb`;
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
      showUnsupportedNotice(entry);
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
      if (ext === "pptx") {
        // PPTX 使用图片式预览（逐页 canvas 渲染，保留原始样式）
        void renderPptxPreview(entry, previewBody);
      } else if (["docx", "doc", "xlsx", "xls", "csv"].includes(ext)) {
        // 其他 Office 文档使用 iframe 预览
        renderOfficePreviewFrame(entry, previewBody);
      } else if (ext === "ppt") {
        // 旧版 PPT 不支持预览
        showUnsupportedNotice(entry);
      } else if (ext === "pdf") {
        void renderPdfPreview(entry, previewBody);
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
        if (previewModal) {
          previewModal.style.display = "flex";
        }
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
