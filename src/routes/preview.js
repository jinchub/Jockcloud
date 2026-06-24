module.exports = (app, deps) => {
  const { convert: convertOffice } = require("officeparser");
  const AdmZip = require("adm-zip");
  const os = require("os");
  const path = require("path");
  const { execFile } = require("child_process");
  const logger = require("../utils/logger");
  const { logError: loggerError } = logger;

  let cachedLibreOfficePath = null;
  let libreOfficePathChecked = false;

  function detectLibreOfficePath() {
    if (libreOfficePathChecked) return cachedLibreOfficePath;
    libreOfficePathChecked = true;
    const candidates = [];
    const platform = os.platform();
    //ppt转图片预览需安装 libreoffice
    if (platform === "win32") {
      candidates.push("D:\\LibreOffice\\program\\soffice.exe");
      candidates.push("C:\\Program Files\\LibreOffice\\program\\soffice.exe");
      candidates.push("C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe");
      candidates.push("C:\\Program Files\\LibreOffice 24.2\\program\\soffice.exe");
      candidates.push("C:\\Program Files\\LibreOffice 24.8\\program\\soffice.exe");
      candidates.push("D:\\Program Files\\LibreOffice\\program\\soffice.exe");
      candidates.push("D:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe");
    } else if (platform === "darwin") {
      candidates.push("/Applications/LibreOffice.app/Contents/MacOS/soffice");
      candidates.push("/usr/local/bin/soffice");
      candidates.push("/opt/local/bin/soffice");
    } else {
      candidates.push("/usr/bin/libreoffice");
      candidates.push("/usr/bin/soffice");
      candidates.push("/usr/local/bin/libreoffice");
      candidates.push("/usr/local/bin/soffice");
      candidates.push("/snap/bin/libreoffice");
      candidates.push("/usr/lib/libreoffice/program/soffice");
    }
    for (const p of candidates) {
      try {
        if (deps.fs.existsSync(p)) {
          cachedLibreOfficePath = p;
          return p;
        }
      } catch (e) {}
    }
    cachedLibreOfficePath = null;
    return null;
  }

  function getPptCacheDir() {
    const cacheDir = path.join(process.cwd(), "uploads", ".ppt-pdf-cache");
    try {
      if (!deps.fs.existsSync(cacheDir)) {
        deps.fs.mkdirSync(cacheDir, { recursive: true });
      }
    } catch (e) {}
    return cacheDir;
  }

  function getCacheKey(fileId, fileSize, mtime) {
    return `${fileId}_${fileSize}_${mtime}`;
  }

  function convertPptxToPdfWithLibreOffice(sofficePath, inputPath, outputDir) {
    return new Promise((resolve, reject) => {
      const timeoutMs = 120000;
      let finished = false;
      const child = execFile(
        sofficePath,
        ["--headless", "--nologo", "--norestore", "--nofirststartwizard", "--convert-to", "pdf", "--outdir", outputDir, inputPath],
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (finished) return;
          finished = true;
          if (err) {
            reject(new Error(`LibreOffice 转换失败: ${err.message}`));
            return;
          }
          const inputBase = path.basename(inputPath, path.extname(inputPath));
          const expectedOutput = path.join(outputDir, `${inputBase}.pdf`);
          if (deps.fs.existsSync(expectedOutput)) {
            resolve(expectedOutput);
            return;
          }
          try {
            const files = deps.fs.readdirSync(outputDir);
            const pdfFile = files.find(f => f.toLowerCase().endsWith(".pdf"));
            if (pdfFile) {
              resolve(path.join(outputDir, pdfFile));
              return;
            }
          } catch (e) {}
          reject(new Error("PDF 文件未生成"));
        }
      );
      setTimeout(() => {
        if (!finished) {
          finished = true;
          try { child.kill("SIGKILL"); } catch (e) {}
          reject(new Error("PPT 转换超时，请稍后重试"));
        }
      }, timeoutMs + 2000);
    });
  }

  function sendPptPdfPreview(res, pdfPath, originalName) {
    const escapedName = escapeHtml(originalName || "preview.pdf");
    const pdfName = escapedName.replace(/\.[^.]+$/, "") + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(pdfName)}`);
    res.setHeader("Cache-Control", "no-cache");
    deps.fs.createReadStream(pdfPath).pipe(res);
  }

  /**
   * 从 PPTX 中提取背景色（优先从 slide 的第一个全尺寸形状获取，其次从主题获取）
   */
  function extractPptxThemeStyles(filePath) {
    try {
      const zip = new AdmZip(filePath);

      // 1. 优先从每张 slide 的第一个形状提取背景色（覆盖整个幻灯片的形状）
      const presXml = zip.readFile("ppt/presentation.xml")?.toString("utf8") || "";
      const sldIdLstMatch = presXml.match(/<p:sldIdLst[^>]*>([\s\S]*?)<\/p:sldIdLst>/);
      let slideBgColor = null;
      if (sldIdLstMatch) {
        const slideIds = [...sldIdLstMatch[1].matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
        const presRelsXml = zip.readFile("ppt/_rels/presentation.xml.rels")?.toString("utf8") || "";
        for (const rId of slideIds) {
          const relMatch = presRelsXml.match(new RegExp(`<Relationship\\s+Id="${rId}"[^>]*Target="([^"]+)`));
          if (!relMatch) continue;
          let slidePath = relMatch[1];
          if (!slidePath.startsWith("/")) slidePath = "ppt/" + slidePath;
          const slideXml = zip.readFile(slidePath)?.toString("utf8") || "";
          const spTree = slideXml.match(/<p:spTree[^>]*>([\s\S]*?)<\/p:spTree>/);
          if (!spTree) continue;
          const shapes = [...spTree[1].matchAll(/<p:sp[^>]*>([\s\S]*?)<\/p:sp>/g)];
          const firstShape = shapes[0]?.[1];
          if (!firstShape) continue;
          // 检查是否覆盖整个幻灯片
          const xfrm = firstShape.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/);
          if (xfrm) {
            const off = xfrm[1].match(/<a:off x="(\d+)" y="(\d+)"/);
            const ext = xfrm[1].match(/<a:ext cx="(\d+)" cy="(\d+)"/);
            if (off && ext && parseInt(off[1]) === 0 && parseInt(off[2]) === 0 &&
                parseInt(ext[1]) >= 12000000 && parseInt(ext[2]) >= 6800000) {
              // 是全尺寸背景形状，提取填充色
              const solidFill = firstShape.match(/<a:solidFill[^>]*>([\s\S]*?)<\/a:solidFill>/);
              if (solidFill) {
                const srgb = solidFill[1].match(/<a:srgbClr val="([^"]+)"/);
                if (srgb) { slideBgColor = `#${srgb[1]}`; break; }
              }
              const gradFill = firstShape.match(/<a:gradFill[^>]*>([\s\S]*?)<\/a:gradFill>/);
              if (gradFill) {
                const gsList = [...gradFill[1].matchAll(/<a:gs pos="(\d+)">([\s\S]*?)<\/a:gs>/g)];
                if (gsList.length >= 2) {
                  const stops = gsList.map(gs => {
                    const pos = parseInt(gs[1]) / 1000 * 100;
                    const srgb = gs[2].match(/<a:srgbClr val="([^"]+)"/);
                    return `${srgb ? `#${srgb[1]}` : "#ffffff"} ${pos}%`;
                  });
                  slideBgColor = `linear-gradient(180deg, ${stops.join(", ")})`;
                  break;
                }
              }
            }
          }
        }
      }

      // 2. 从主题提取颜色作为备选
      const themeXml = zip.readFile("ppt/theme/theme1.xml")?.toString("utf8") || "";
      const clrSchemeMatch = themeXml.match(/<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/);
      const colors = {};
      if (clrSchemeMatch) {
        const colorTags = [...clrSchemeMatch[1].matchAll(/<a:(\w+)>([\s\S]*?)<\/a:\1>/g)];
        for (const tag of colorTags) {
          const inner = tag[2];
          const srgb = inner.match(/<a:srgbClr val="([^"]+)"/);
          const sys = inner.match(/<a:sysClr val="[^"]*" lastClr="([^"]+)"/);
          colors[tag[1]] = srgb ? `#${srgb[1]}` : (sys ? `#${sys[1]}` : null);
        }
      }

      const bgColor = slideBgColor || colors.lt1 || "#ffffff";
      const bg2Color = colors.lt2 || "#f0f0f0";

      return {
        bgColor,
        bg2Color,
        accent1: colors.accent1 || "#4472C4",
        dk2: colors.dk2 || "#44546A"
      };
    } catch (e) {
      return null;
    }
  }

  const {
    authRequired,
    requireFilePermission,
    pool,
    sendDbError,
    resolveStorageSpaceTypeByRequest,
    normalizeFolderId,
    resolveAbsoluteStoragePath,
    inferImageMimeTypeFromStorageName,
    fs,
    hasFilePermission,
    Buffer,
    mammoth,
    xlsx,
    PREVIEW_MEDIA_STREAM_CHUNK_BYTES
  } = deps;

  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
  ));

  const isOfficePasswordProtectedError = (err) => {
    const message = String(err && err.message ? err.message : err || "").toLowerCase();
    return message.includes("password-protected")
      || message.includes("password protected")
      || message.includes("encrypted")
      || message.includes("密码保护")
      || message.includes("已加密");
  };

  const sendOfficePreviewUnsupportedHtml = (res, originalName) => {
    const escapedOriginalName = escapeHtml(originalName);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { margin: 0; padding: 0; background: #f7f8fa; font-family: Arial, sans-serif; color: #333; } .preview-message { min-height: 100vh; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 24px; } .preview-message-card { max-width: 520px; background: #fff; border: 1px solid #e5e6eb; border-radius: 12px; padding: 24px; text-align: center; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06); } .preview-message-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; } .preview-message-desc { font-size: 14px; line-height: 1.7; color: #666; } [data-theme="dark"] body { background: #1e1e1e !important; color: #f0f0f0 !important; } [data-theme="dark"] .preview-message-card { background: #2b2b2b !important; border-color: #3c3c3c !important; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); } [data-theme="dark"] .preview-message-title { color: #f0f0f0 !important; } [data-theme="dark"] .preview-message-desc { color: #9a9a9a !important; }</style></head><body><div class="preview-message"><div class="preview-message-card"><div class="preview-message-title">该文档已加密</div><div class="preview-message-desc">当前暂不支持输入文档密码进行在线预览，请下载文件后输入密码打开。</div></div></div><script>function getCurrentTheme() { try { const params = new URLSearchParams(location.search); const q = params.get("theme"); if (q === "dark") return "dark"; if (q === "light") return "light"; } catch (e) {} try { if (window.parent && window.parent !== window) { const parentHtml = window.parent.document.documentElement; if (parentHtml) { if (parentHtml.getAttribute("data-theme") === "dark") return "dark"; const parentMode = parentHtml.getAttribute("data-theme-mode"); if (parentMode === "auto" || !parentMode) { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } } } } catch (e) {} try { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } catch (e) {} return "light"; } function applyTheme() { if (!document.documentElement) return; const theme = getCurrentTheme(); if (theme === "dark") { document.documentElement.setAttribute("data-theme", "dark"); } else { document.documentElement.removeAttribute("data-theme"); } } applyTheme(); try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} setInterval(applyTheme, 2000);</script></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  };

  app.get("/api/preview/:id", authRequired, requireFilePermission("download"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    const mode = String(req.query.mode || "stream").trim().toLowerCase();
    const variant = String(req.query.variant || "origin").trim().toLowerCase();
    const recyclePreview = String(req.query.recycle || "").trim() === "1";
    if (!fileId) {
      res.status(400).json({ message: "文件ID不合法" });
      return;
    }
    if (mode !== "stream" && mode !== "text" && mode !== "office") {
      res.status(400).json({ message: "预览模式不合法" });
      return;
    }
    try {
      const previewSql = recyclePreview
        ? "SELECT original_name AS originalName, storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName, size, mime_type AS mimeType FROM files WHERE id = ? AND user_id = ? AND space_type = ? LIMIT 1"
        : "SELECT original_name AS originalName, storage_name AS storageName, thumbnail_storage_name AS thumbnailStorageName, size, mime_type AS mimeType FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1";
      const [rows] = await pool.query(previewSql, [fileId, req.user.userId, spaceType]);
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const rawStorageName = String(rows[0].storageName || "");
      const rawThumbnailStorageName = String(rows[0].thumbnailStorageName || "");
      let storageName = rawStorageName;
      let mimeType = String(rows[0].mimeType || "").trim() || "application/octet-stream";
      if (mimeType === "application/octet-stream") {
        mimeType = inferImageMimeTypeFromStorageName(rows[0].originalName || storageName, mimeType);
      }
      if (mode === "stream" && variant === "thumb" && rawThumbnailStorageName) {
        const thumbPath = resolveAbsoluteStoragePath(rawThumbnailStorageName, spaceType);
        if (thumbPath && fs.existsSync(thumbPath)) {
          storageName = rawThumbnailStorageName;
          mimeType = inferImageMimeTypeFromStorageName(rawThumbnailStorageName, "image/webp");
        }
      }
      const filePath = resolveAbsoluteStoragePath(storageName, spaceType);
      if (!filePath) {
        res.status(400).json({ message: "文件路径不合法" });
        return;
      }
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ message: "文件已丢失" });
        return;
      }
      if (mode === "office") {
        const originalName = rows[0].originalName || "";
        const escapedOriginalName = escapeHtml(originalName);
        const extMatch = originalName.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : "";
        try {
          const stats = fs.statSync(filePath);
          if (stats.size === 0) {
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { padding: 20px; font-family: sans-serif; }</style></head><body></body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
          if (ext === "docx" || ext === "doc") {
            const result = await mammoth.convertToHtml({ path: filePath }, {
              styleMap: [
                "p[style-name='标题 1'] => h1",
                "p[style-name='标题 2'] => h2",
                "p[style-name='标题 3'] => h3",
                "p[style-name='标题 4'] => h4",
                "p[style-name='标题 5'] => h5",
                "p[style-name='标题 6'] => h6",
                "p[style-name='Heading 1'] => h1",
                "p[style-name='Heading 2'] => h2",
                "p[style-name='Heading 3'] => h3",
                "p[style-name='Heading 4'] => h4",
                "p[style-name='Heading 5'] => h5",
                "p[style-name='Heading 6'] => h6",
              ],
              convertImage: mammoth.images.imgElement(function(image) {
                return image.read("base64").then(function(imageBuffer) {
                  return {
                    src: "data:" + image.contentType + ";base64," + imageBuffer
                  };
                });
              })
            });
            // 从 docx 中提取段落对齐信息并注入到 HTML 中
            try {
              const AdmZipLocal = require("adm-zip");
              const zip = new AdmZipLocal(filePath);
              const documentXml = zip.readFile("word/document.xml")?.toString("utf8") || "";
              const alignmentMap = new Map();
              const paragraphs = [...documentXml.matchAll(/<w:p[^>]*>([\s\S]*?)<\/w:p>/g)];
              let paraIndex = 0;
              for (const p of paragraphs) {
                const pContent = p[1];
                const jcMatch = pContent.match(/<w:jc\s+w:val="([^"]+)"/);
                if (jcMatch) {
                  const alignment = jcMatch[1];
                  alignmentMap.set(paraIndex, alignment);
                }
                paraIndex++;
              }
              // 将对齐信息注入到 HTML 的 p 和 h1-h6 标签中
              let enhancedHtml = result.value;
              const blockTags = [...enhancedHtml.matchAll(/<(p|h[1-6])([^>]*)>/g)];
              let blockIdx = 0;
              for (const tagMatch of blockTags) {
                const fullTag = tagMatch[0];
                const tagName = tagMatch[1];
                const attrs = tagMatch[2];
                const alignment = alignmentMap.get(blockIdx);
                if (alignment) {
                  const cssAlign = {
                    "center": "text-align: center;",
                    "right": "text-align: right;",
                    "left": "text-align: left;",
                    "both": "text-align: justify;",
                    "end": "text-align: right;",
                    "start": "text-align: left;",
                    "mediumKashida": "text-align: justify;",
                    "distribute": "text-align: justify;",
                    "numTab": "text-align: left;",
                    "highKashida": "text-align: justify;",
                    "lowKashida": "text-align: justify;",
                    "thaiDistribute": "text-align: justify;"
                  }[alignment] || "";
                  if (cssAlign) {
                    const newTag = attrs.includes("style=")
                      ? fullTag.replace(/style="/, `style="${cssAlign} `)
                      : fullTag.replace(`<${tagName}`, `<${tagName} style="${cssAlign}"`);
                    enhancedHtml = enhancedHtml.replace(fullTag, newTag);
                  }
                }
                blockIdx++;
              }
              result.value = enhancedHtml;
            } catch (e) {
              console.log("[docx alignment extract error]", e);
            }
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; background: #fff; color: #333; } img { max-width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; margin: 10px 0; } table, th, td { border: 1px solid #ddd; color: #333; } th, td { padding: 8px; text-align: left; } th { background-color: #f2f2f2; color: #333; } h1, h2, h3, h4, h5, h6 { color: #333; } a { color: #007cba; } p.centered { text-align: center; } td[align='center'], th[align='center'] { text-align: center; } td[align='right'], th[align='right'] { text-align: right; } td[align='left'], th[align='left'] { text-align: left; } td[valign='middle'], th[valign='middle'] { vertical-align: middle; } td[valign='top'], th[valign='top'] { vertical-align: top; } td[valign='bottom'], th[valign='bottom'] { vertical-align: bottom; } [data-theme="dark"] body { background: #2b2b2b !important; color: #f0f0f0 !important; } [data-theme="dark"] h1, [data-theme="dark"] h2, [data-theme="dark"] h3, [data-theme="dark"] h4, [data-theme="dark"] h5, [data-theme="dark"] h6 { color: #f0f0f0 !important; } [data-theme="dark"] table, [data-theme="dark"] th, [data-theme="dark"] td { border-color: #3c3c3c !important; color: #f0f0f0 !important; } [data-theme="dark"] th { background-color: #303030 !important; } [data-theme="dark"] td { background-color: transparent !important; } [data-theme="dark"] a { color: #60a5fa !important; }</style></head><body>${result.value || "<p>文档内容为空</p>"}<script>function getCurrentTheme() { try { const params = new URLSearchParams(location.search); const q = params.get("theme"); if (q === "dark") return "dark"; if (q === "light") return "light"; } catch (e) {} try { if (window.parent && window.parent !== window) { const parentHtml = window.parent.document.documentElement; if (parentHtml && parentHtml.getAttribute("data-theme") === "dark") return "dark"; const parentMode = parentHtml ? parentHtml.getAttribute("data-theme-mode") : null; if (parentMode === "auto" || !parentMode) { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } } } catch (e) {} try { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } catch (e) {} return "light"; } function applyTheme() { if (!document.documentElement || !document.body) return; const theme = getCurrentTheme(); if (theme === "dark") { document.documentElement.setAttribute("data-theme", "dark"); } else { document.documentElement.removeAttribute("data-theme"); } } applyTheme(); try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} setInterval(applyTheme, 2000);</script></body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
          if (ext === "xlsx" || ext === "xls" || ext === "csv") {
            const fileBuffer = fs.readFileSync(filePath);
            const workbook = xlsx.read(fileBuffer, { type: "buffer", raw: true, cellDates: true, WTF: false });
            const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
            let tabsHtml = "";
            let contentHtml = "";
            if (sheetNames.length === 0) {
              tabsHtml = `<button class="tab-button active" onclick="showSheet(0)">Sheet1</button>`;
              contentHtml = `<div class="sheet-content active" id="sheet-0"><div style="min-height: 120px;"></div></div>`;
            } else {
              sheetNames.forEach((sheetName, index) => {
                const worksheet = workbook.Sheets && workbook.Sheets[sheetName] ? workbook.Sheets[sheetName] : null;
                const escapedSheetName = String(sheetName || "未命名工作表").replace(/[&<>"']/g, (char) => (
                  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
                ));
                const sheetHtml = worksheet && worksheet["!ref"]
                  ? xlsx.utils.sheet_to_html(worksheet)
                  : "<div style=\"min-height: 120px;\"></div>";
                tabsHtml += `<button class="tab-button ${index === 0 ? "active" : ""}" onclick="showSheet(${index})">${escapedSheetName}</button>`;
                contentHtml += `<div class="sheet-content ${index === 0 ? "active" : ""}" id="sheet-${index}">${sheetHtml}</div>`;
              });
            }
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #fff; color: #333; } .tabs { border-bottom: 1px solid #ccc; margin-bottom: 20px; display: flex; flex-wrap: wrap; align-items: center; } .tab-button { background: #f1f1f1; border: none; padding: 10px 20px; cursor: pointer; margin-right: 5px; border-top-left-radius: 5px; border-top-right-radius: 5px; color: #333; } .tab-button.active { background: #007cba; color: white; } .sheet-content { display: none; overflow: auto; } .sheet-content.active { display: block; } table { border-collapse: collapse; width: 100%; font-size: 12px; background: #fff; } td, th { border: 1px solid #ddd; padding: 4px 8px; text-align: left; white-space: nowrap; color: #333; } th { background-color: #f2f2f2; font-weight: bold; } [data-theme="dark"] body { background: #2b2b2b !important; color: #f0f0f0 !important; } [data-theme="dark"] .tabs { border-bottom-color: #353535 !important; } [data-theme="dark"] .tab-button { background: #303030 !important; color: #f0f0f0 !important; border: 1px solid #3c3c3c !important; } [data-theme="dark"] .tab-button:hover { background: #3a3a3a !important; } [data-theme="dark"] .tab-button.active { background: #2b93ff !important; color: #fff !important; } [data-theme="dark"] table { background: #252525 !important; color: #f0f0f0 !important; } [data-theme="dark"] td, [data-theme="dark"] th, [data-theme="dark"] tr, [data-theme="dark"] tbody, [data-theme="dark"] thead { color: #f0f0f0 !important; background: transparent; border-color: #3c3c3c !important; } [data-theme="dark"] td { background-color: #252525 !important; } [data-theme="dark"] th { background-color: #303030 !important; color: #d8d8d8 !important; } [data-theme="dark"] tr:nth-child(even) td { background-color: #2f2f2f !important; }</style></head><body><div class="tabs">${tabsHtml}</div><div class="content">${contentHtml}</div><script>function getCurrentTheme() { try { const params = new URLSearchParams(location.search); const q = params.get("theme"); if (q === "dark") return "dark"; if (q === "light") return "light"; } catch (e) {} try { if (window.parent && window.parent !== window) { const parentHtml = window.parent.document.documentElement; if (parentHtml) { if (parentHtml.getAttribute("data-theme") === "dark") return "dark"; const parentMode = parentHtml.getAttribute("data-theme-mode"); if (parentMode === "auto" || !parentMode) { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } } } } catch (e) {} try { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } catch (e) {} return "light"; } function clearInlineColors() { const elements = document.querySelectorAll("table, tr, td, th, tbody, thead"); elements.forEach((el) => { try { if (el.style) { el.style.color = ""; el.style.backgroundColor = ""; el.style.background = ""; } } catch (e) {} }); } let _currentTheme = null; function applyTheme() { if (!document.documentElement || !document.body) return; const theme = getCurrentTheme(); if (_currentTheme === theme) return; _currentTheme = theme; if (theme === "dark") { document.documentElement.setAttribute("data-theme", "dark"); clearInlineColors(); } else { document.documentElement.removeAttribute("data-theme"); } } function showSheet(index) { const sheets = document.querySelectorAll(".sheet-content"); const buttons = document.querySelectorAll(".tab-button"); sheets.forEach((sheet) => sheet.classList.remove("active")); buttons.forEach((button) => button.classList.remove("active")); const target = document.getElementById("sheet-" + index); if (target) target.classList.add("active"); if (buttons[index]) buttons[index].classList.add("active"); } applyTheme(); try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} setInterval(applyTheme, 2000);</script></body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
          if (ext === "pptx") {
            let asPdf = String(req.query["as-pdf"] || "").trim().toLowerCase() === "1";
            if (asPdf) {
              const sofficePath = detectLibreOfficePath();
              if (!sofficePath) {
                // 未安装 LibreOffice，降级返回原始 HTML 预览
                loggerError("PPTX预览不支持图片模式（LibreOffice未安装）", {
                  fileId,
                  fileName: originalName,
                  platform: os.platform(),
                  env: process.env
                });
                asPdf = false;
              } else {
                const cacheDir = getPptCacheDir();
                let stats;
                try {
                  stats = fs.statSync(filePath);
                } catch (e) {
                  res.status(404).json({ message: "文件不存在" });
                  return;
                }
                const cacheKey = getCacheKey(fileId, stats.size, Math.floor(stats.mtimeMs || 0));
                const cachePdfPath = path.join(cacheDir, `${cacheKey}.pdf`);
                let pdfPath = null;
                try {
                  if (fs.existsSync(cachePdfPath)) {
                    pdfPath = cachePdfPath;
                  } else {
                    const tempDir = path.join(cacheDir, `tmp_${fileId}_${Date.now()}`);
                    try {
                      fs.mkdirSync(tempDir, { recursive: true });
                    } catch (e) {
                      res.status(500).json({ message: "无法创建临时目录" });
                      return;
                    }
                    try {
                      pdfPath = await convertPptxToPdfWithLibreOffice(sofficePath, filePath, tempDir);
                      if (pdfPath && fs.existsSync(pdfPath)) {
                        try {
                          fs.copyFileSync(pdfPath, cachePdfPath);
                          pdfPath = cachePdfPath;
                        } catch (e) {
                        }
                      }
                    } catch (convertErr) {
                      // 转换失败，降级到原始 HTML 预览
                      loggerError("PPTX预览不支持图片模式（LibreOffice转换失败）", {
                        fileId,
                        fileName: originalName,
                        error: convertErr.message,
                        platform: os.platform(),
                        env: process.env
                      });
                      asPdf = false;
                    } finally {
                      try {
                        if (fs.existsSync(tempDir)) {
                          const entries = fs.readdirSync(tempDir);
                          for (const entry of entries) {
                            try { fs.unlinkSync(path.join(tempDir, entry)); } catch (e) {}
                          }
                          fs.rmdirSync(tempDir);
                        }
                      } catch (e) {}
                    }
                  }
                } catch (e) {
                  // 转换出错，降级到原始 HTML 预览
                  loggerError("PPTX预览不支持图片模式（转换过程出错）", {
                    fileId,
                    fileName: originalName,
                    error: e.message,
                    platform: os.platform(),
                    env: process.env
                  });
                  asPdf = false;
                }
                if (asPdf && pdfPath && fs.existsSync(pdfPath)) {
                  sendPptPdfPreview(res, pdfPath, originalName);
                  return;
                }
              }
            }
            const { value: rawHtml } = await convertOffice(filePath, "html", { ignoreNotes: true });
            const html = rawHtml.replace(/<div class="slide-note">[\s\S]*?<\/div>\s*/g, "");
            const theme = extractPptxThemeStyles(filePath);
            let themeCSS = "";
            if (theme) {
              const bg = theme.gradientCSS || theme.bgColor;
              themeCSS = `
                :root {
                  --ppt-bg: ${theme.bgColor};
                  --ppt-bg2: ${theme.bg2Color};
                  --ppt-accent: ${theme.accent1};
                  --ppt-dark: ${theme.dk2};
                }
                body { background-color: ${theme.bg2Color} !important; }
                .presentation-container { background: transparent !important; }
                .slide {
                  background: ${bg} !important;
                  border: 1px solid ${theme.bg2Color};
                  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                h1, h2, h3 { color: var(--ppt-dark) !important; }
                .metadata-summary { display: none; }
              `;
            }
            const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; background: #fff; color: #333; } img { max-width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; margin: 10px 0; } table, th, td { border: 1px solid #ddd; color: #333; } th, td { padding: 8px; text-align: left; } th { background-color: #f2f2f2; color: #333; } [data-theme="dark"] body { background: #2b2b2b !important; color: #f0f0f0 !important; } [data-theme="dark"] table, [data-theme="dark"] th, [data-theme="dark"] td { border-color: #3c3c3c !important; color: #f0f0f0 !important; } [data-theme="dark"] th { background-color: #303030 !important; } [data-theme="dark"] td { background-color: transparent !important; } [data-theme="dark"] .slide { box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important; }${themeCSS}</style></head><body>${html || "<p>演示文稿内容为空</p>"}<script>function getCurrentTheme() { try { const params = new URLSearchParams(location.search); const q = params.get("theme"); if (q === "dark") return "dark"; if (q === "light") return "light"; } catch (e) {} try { if (window.parent && window.parent !== window) { const parentHtml = window.parent.document.documentElement; if (parentHtml) { if (parentHtml.getAttribute("data-theme") === "dark") return "dark"; const parentMode = parentHtml.getAttribute("data-theme-mode"); if (parentMode === "auto" || !parentMode) { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } } } } catch (e) {} try { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } catch (e) {} return "light"; } function applyTheme() { if (!document.documentElement) return; const theme = getCurrentTheme(); if (theme === "dark") { document.documentElement.setAttribute("data-theme", "dark"); } else { document.documentElement.removeAttribute("data-theme"); } } applyTheme(); try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} setInterval(applyTheme, 2000);</script></body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(fullHtml);
            return;
          }
          if (ext === "ppt") {
            sendOfficePreviewUnsupportedHtml(res, originalName);
            return;
          }
          res.status(400).send("不支持的办公文档格式预览");
          return;
        } catch (err) {
          if (isOfficePasswordProtectedError(err)) {
            sendOfficePreviewUnsupportedHtml(res, originalName);
            return;
          }
          // PPTX 转换失败时降级到原始 HTML 预览
          if (ext === "pptx") {
            loggerError("PPTX预览不支持图片模式（officeparser转换失败）", {
              fileId,
              fileName: originalName,
              error: err.message,
              platform: os.platform(),
              env: process.env
            });
            try {
              const { value: rawHtml } = await convertOffice(filePath, "html", { ignoreNotes: true });
              const html = rawHtml.replace(/<div class="slide-note">[\s\S]*?<\/div>\s*/g, "");
              const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; background: #fff; color: #333; } img { max-width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; margin: 10px 0; } table, th, td { border: 1px solid #ddd; color: #333; } th, td { padding: 8px; text-align: left; } th { background-color: #f2f2f2; color: #333; } [data-theme="dark"] body { background: #2b2b2b !important; color: #f0f0f0 !important; } [data-theme="dark"] table, [data-theme="dark"] th, [data-theme="dark"] td { border-color: #3c3c3c !important; color: #f0f0f0 !important; } [data-theme="dark"] th { background-color: #303030 !important; } [data-theme="dark"] td { background-color: transparent !important; }</style></head><body>${html || "<p>演示文稿内容为空</p>"}<script>function getCurrentTheme() { try { const params = new URLSearchParams(location.search); const q = params.get("theme"); if (q === "dark") return "dark"; if (q === "light") return "light"; } catch (e) {} try { if (window.parent && window.parent !== window) { const parentHtml = window.parent.document.documentElement; if (parentHtml) { if (parentHtml.getAttribute("data-theme") === "dark") return "dark"; const parentMode = parentHtml.getAttribute("data-theme-mode"); if (parentMode === "auto" || !parentMode) { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } } } } catch (e) {} try { const mql = window.matchMedia("(prefers-color-scheme: dark)"); if (mql.matches) return "dark"; } catch (e) {} return "light"; } function applyTheme() { if (!document.documentElement) return; const theme = getCurrentTheme(); if (theme === "dark") { document.documentElement.setAttribute("data-theme", "dark"); } else { document.documentElement.removeAttribute("data-theme"); } } applyTheme(); try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} setInterval(applyTheme, 2000);</script></body></html>`;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.send(fullHtml);
              return;
            } catch (fallbackErr) {
              loggerError("PPTX预览不支持图片模式（officeparser fallback也失败）", {
                fileId,
                fileName: originalName,
                error: fallbackErr.message,
                platform: os.platform(),
                env: process.env
              });
              sendOfficePreviewUnsupportedHtml(res, originalName);
              return;
            }
          }
          res.status(500).send("文档解析失败: " + (err && err.message ? err.message : "未知错误"));
          return;
        }
      }
      if (mode === "text") {
        const limit = Math.max(1, Math.min(1000000, Math.floor(Number(req.query.limit) || 200000)));
        const stats = fs.statSync(filePath);
        const bytesToRead = Math.min(Number(stats.size || 0), limit);
        const fd = fs.openSync(filePath, "r");
        try {
          const buffer = Buffer.alloc(bytesToRead);
          const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, 0);
          const content = buffer.toString("utf8", 0, bytesRead);
          res.json({ content, truncated: Number(stats.size || 0) > bytesRead, editable: hasFilePermission(req, "rename") });
        } finally {
          fs.closeSync(fd);
        }
        return;
      }
      const stats = fs.statSync(filePath);
      const totalSize = Number(stats.size || 0);
      const rangeHeader = String(req.headers.range || "").trim();
      const isMedia = mimeType.startsWith("video/") || mimeType.startsWith("audio/");
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(rows[0].originalName || "preview")}`);
      if (!isMedia) {
        res.sendFile(filePath);
        return;
      }
      res.setHeader("Accept-Ranges", "bytes");
      if (!rangeHeader) {
        const end = Math.min(totalSize - 1, PREVIEW_MEDIA_STREAM_CHUNK_BYTES - 1);
        res.status(206);
        res.setHeader("Content-Range", `bytes 0-${end}/${totalSize}`);
        res.setHeader("Content-Length", String(end + 1));
        fs.createReadStream(filePath, { start: 0, end }).pipe(res);
        return;
      }
      const matched = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
      if (!matched) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
        return;
      }
      let start = matched[1] ? Number(matched[1]) : NaN;
      let end = matched[2] ? Number(matched[2]) : NaN;
      if (Number.isNaN(start) && Number.isNaN(end)) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
        return;
      }
      if (Number.isNaN(start)) {
        const suffixLength = end;
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
          res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
          return;
        }
        start = Math.max(totalSize - suffixLength, 0);
        end = totalSize - 1;
      } else {
        if (!Number.isFinite(start) || start < 0) {
          res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
          return;
        }
        if (Number.isNaN(end) || !Number.isFinite(end) || end >= totalSize) {
          end = totalSize - 1;
        }
      }
      if (start >= totalSize || end < start) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      res.setHeader("Content-Length", String(chunkSize));
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } catch (error) {
      sendDbError(res, error);
    }
  });

  app.put("/api/preview/:id", authRequired, requireFilePermission("rename"), async (req, res) => {
    const spaceType = resolveStorageSpaceTypeByRequest(req);
    const fileId = normalizeFolderId(req.params.id);
    const mode = String(req.query.mode || "").trim().toLowerCase();
    const content = typeof req.body.content === "string" ? req.body.content : null;
    if (!fileId) {
      res.status(400).json({ message: "文件ID不合法" });
      return;
    }
    if (mode !== "text") {
      res.status(400).json({ message: "保存模式不合法" });
      return;
    }
    if (content === null) {
      res.status(400).json({ message: "文本内容不合法" });
      return;
    }
    try {
      const [rows] = await pool.query(
        "SELECT storage_name AS storageName FROM files WHERE id = ? AND user_id = ? AND space_type = ? AND deleted_at IS NULL LIMIT 1",
        [fileId, req.user.userId, spaceType]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "文件不存在" });
        return;
      }
      const storageName = String(rows[0].storageName || "");
      const filePath = resolveAbsoluteStoragePath(storageName, spaceType);
      if (!filePath) {
        res.status(400).json({ message: "文件路径不合法" });
        return;
      }
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ message: "文件已丢失" });
        return;
      }
      const contentBuffer = Buffer.from(content, "utf8");
      fs.writeFileSync(filePath, contentBuffer);
      await pool.query("UPDATE files SET size = ?, updated_at = NOW() WHERE id = ? AND user_id = ? AND space_type = ?", [
        contentBuffer.length,
        fileId,
        req.user.userId,
        spaceType
      ]);
      res.json({ message: "保存成功" });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
