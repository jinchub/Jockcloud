module.exports = (app, deps) => {
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
        const escapedOriginalName = String(originalName).replace(/[&<>"']/g, (char) => (
          { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
        ));
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
            const result = await mammoth.convertToHtml({ path: filePath });
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; } img { max-width: 100%; height: auto; } table { border-collapse: collapse; width: 100%; margin: 10px 0; } table, th, td { border: 1px solid #ddd; } th, td { padding: 8px; text-align: left; } th { background-color: #f2f2f2; }</style></head><body>${result.value || "<p>文档内容为空</p>"}</body></html>`;
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
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedOriginalName}</title><style>body { font-family: Arial, sans-serif; margin: 0; padding: 20px; } .tabs { border-bottom: 1px solid #ccc; margin-bottom: 20px; } .tab-button { background: #f1f1f1; border: none; padding: 10px 20px; cursor: pointer; margin-right: 5px; border-top-left-radius: 5px; border-top-right-radius: 5px; } .tab-button.active { background: #007cba; color: white; } .sheet-content { display: none; overflow: auto; } .sheet-content.active { display: block; } table { border-collapse: collapse; width: 100%; font-size: 12px; } td, th { border: 1px solid #ddd; padding: 4px 8px; text-align: left; white-space: nowrap; } th { background-color: #f2f2f2; font-weight: bold; }</style><script>function showSheet(index) { const sheets = document.querySelectorAll(".sheet-content"); const buttons = document.querySelectorAll(".tab-button"); sheets.forEach((sheet) => sheet.classList.remove("active")); buttons.forEach((button) => button.classList.remove("active")); const target = document.getElementById("sheet-" + index); if (target) target.classList.add("active"); if (buttons[index]) buttons[index].classList.add("active"); }</script></head><body><div class="tabs">${tabsHtml}</div><div class="content">${contentHtml}</div></body></html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
            return;
          }
          res.status(400).send("不支持的办公文档格式预览");
          return;
        } catch (err) {
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
