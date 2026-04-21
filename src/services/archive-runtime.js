const createArchiveRuntime = ({
  fs,
  path,
  spawn,
  archiver,
  ARCHIVE_SUPPORTED_TYPE_SET,
  Buffer,
  safeFileName
}) => {
  const escapePowerShellSingleQuote = (value) => String(value || "").replace(/'/g, "''");

  const runCompressArchive = (sourceDir, archivePath) => new Promise((resolve, reject) => {
    const normalizedSourceDir = path.resolve(sourceDir);
    const normalizedArchivePath = path.resolve(archivePath);
    if (!fs.existsSync(normalizedSourceDir)) {
      reject(new Error("压缩源目录不存在"));
      return;
    }
    try {
      if (fs.existsSync(normalizedArchivePath)) {
        fs.unlinkSync(normalizedArchivePath);
      }
      fs.mkdirSync(path.dirname(normalizedArchivePath), { recursive: true });
    } catch (error) {
      reject(error);
      return;
    }
    const output = fs.createWriteStream(normalizedArchivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => {
      resolve();
    });
    output.on("error", (error) => {
      reject(error);
    });
    archive.on("error", (error) => {
      reject(error);
    });
    archive.pipe(output);
    archive.directory(normalizedSourceDir, false);
    archive.finalize().catch((error) => {
      reject(error);
    });
  });

  const runPythonScript = (script, env = {}) => new Promise((resolve, reject) => {
    const commands = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
    let cursor = 0;
    const tryNext = () => {
      if (cursor >= commands.length) {
        reject(new Error("未找到可用的 Python 环境"));
        return;
      }
      const command = commands[cursor];
      cursor += 1;
      const child = spawn(command, ["-c", script], {
        env: { ...process.env, ...env },
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      if (child.stdout) {
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk || "");
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk || "");
        });
      }
      child.on("error", () => {
        tryNext();
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        if (code === 9009 || /not found|找不到/i.test(stderr)) {
          tryNext();
          return;
        }
        reject(new Error(stderr.trim() || "执行失败"));
      });
    };
    tryNext();
  });

  const listZipEntries = async (zipPath) => {
    const normalizedZipPath = path.resolve(zipPath);
    if (!fs.existsSync(normalizedZipPath)) {
      throw new Error("压缩包不存在");
    }
    const JSZip = require("jszip");
    const zipData = fs.readFileSync(normalizedZipPath);
    const zip = await JSZip.loadAsync(zipData);
    const entries = [];
    for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
      const normalizedPath = entryPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      if (!normalizedPath) continue;
      let fileName = normalizedPath;
      if (!zipEntry.dir && !normalizedPath.endsWith("/")) {
        if (/[\u0080-\uffff]/.test(fileName)) {
          try {
            const buf = Buffer.from(fileName, "latin1");
            const gbkDecoded = buf.toString("gbk");
            if (!gbkDecoded.includes("�")) {
              fileName = gbkDecoded;
            }
          } catch (e) {}
        }
      }
      entries.push({
        path: fileName,
        isDirectory: zipEntry.dir || fileName.endsWith("/"),
        size: zipEntry.dir ? 0 : (zipEntry._data ? zipEntry._data.uncompressedSize : 0),
        compressedSize: zipEntry.dir ? 0 : (zipEntry._data ? zipEntry._data.compressedSize : 0),
        modifiedAt: zipEntry.date ? zipEntry.date.toISOString() : null
      });
    }
    return entries;
  };

  const extractZipToDirectory = async (zipPath, targetDir) => {
    const normalizedZipPath = path.resolve(zipPath);
    const normalizedTargetDir = path.resolve(targetDir);
    fs.mkdirSync(normalizedTargetDir, { recursive: true });
    if (process.platform === "win32") {
      const source = escapePowerShellSingleQuote(normalizedZipPath);
      const target = escapePowerShellSingleQuote(normalizedTargetDir);
      const command = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${source}' -DestinationPath '${target}' -Force`;
      await new Promise((resolve, reject) => {
        const child = spawn("powershell", ["-NoProfile", "-Command", command], { windowsHide: true });
        let stderr = "";
        if (child.stderr) {
          child.stderr.on("data", (chunk) => {
            stderr += String(chunk || "");
          });
        }
        child.on("error", (error) => {
          reject(error);
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderr.trim() || "解压失败"));
        });
      });
      return;
    }
    await runPythonScript(
      "import os, zipfile; z=zipfile.ZipFile(os.environ['ZIP_PATH'],'r'); z.extractall(os.environ['TARGET_DIR']); z.close()",
      { ZIP_PATH: normalizedZipPath, TARGET_DIR: normalizedTargetDir }
    );
  };

  const listArchiveEntries = async (archivePath, archiveType) => {
    if (archiveType === "zip") {
      return listZipEntries(archivePath);
    }
    if (!ARCHIVE_SUPPORTED_TYPE_SET.has(archiveType)) {
      throw new Error("该压缩类型暂不支持查看");
    }
    const output = await runPythonScript(
      "import os, json, tarfile\np=os.environ['ARCHIVE_PATH']; t=os.environ['ARCHIVE_TYPE']; items=[]\nif t in ('tar','tgz','tbz2','txz'):\n mode={'tar':'r:','tgz':'r:gz','tbz2':'r:bz2','txz':'r:xz'}[t]\n f=tarfile.open(p,mode)\n for m in f.getmembers():\n  items.append({'path':m.name,'isDirectory':m.isdir(),'size':int(m.size if m.isfile() else 0),'compressedSize':0,'modifiedAt':None})\n f.close()\nelse:\n base=os.path.basename(p)\n if t=='gz' and base.endswith('.gz'): name=base[:-3] or base\n elif t=='bz2' and base.endswith('.bz2'): name=base[:-4] or base\n elif t=='xz' and base.endswith('.xz'): name=base[:-3] or base\n else: name=base\n items.append({'path':name,'isDirectory':False,'size':0,'compressedSize':0,'modifiedAt':None})\nprint(json.dumps(items, ensure_ascii=False))",
      { ARCHIVE_PATH: path.resolve(archivePath), ARCHIVE_TYPE: archiveType }
    );
    const raw = String(output || "").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  };

  const extractArchiveToDirectory = async (archivePath, archiveType, targetDir) => {
    if (archiveType === "zip") {
      await extractZipToDirectory(archivePath, targetDir);
      return;
    }
    if (!ARCHIVE_SUPPORTED_TYPE_SET.has(archiveType)) {
      throw new Error("该压缩类型暂不支持解压");
    }
    await runPythonScript(
      "import os, tarfile, gzip, bz2, lzma, shutil\np=os.environ['ARCHIVE_PATH']; t=os.environ['ARCHIVE_TYPE']; out=os.environ['TARGET_DIR']\nos.makedirs(out, exist_ok=True)\nif t in ('tar','tgz','tbz2','txz'):\n mode={'tar':'r:','tgz':'r:gz','tbz2':'r:bz2','txz':'r:xz'}[t]\n f=tarfile.open(p,mode)\n base_norm=os.path.normpath(out)\n for m in f.getmembers():\n  name=m.name.replace('\\\\','/').lstrip('/')\n  if not name: continue\n  target=os.path.normpath(os.path.join(out,name))\n  if not target.startswith(base_norm): continue\n  if m.isdir():\n   os.makedirs(target, exist_ok=True)\n   continue\n  if not m.isfile():\n   continue\n  os.makedirs(os.path.dirname(target), exist_ok=True)\n  src=f.extractfile(m)\n  if src is None: continue\n  with src as s, open(target,'wb') as d: shutil.copyfileobj(s,d)\n f.close()\nelse:\n base=os.path.basename(p)\n if t=='gz' and base.endswith('.gz'): name=base[:-3] or base\n elif t=='bz2' and base.endswith('.bz2'): name=base[:-4] or base\n elif t=='xz' and base.endswith('.xz'): name=base[:-3] or base\n else: name=base\n target=os.path.join(out,name)\n if t=='gz': opener=gzip.open\n elif t=='bz2': opener=bz2.open\n else: opener=lzma.open\n with opener(p,'rb') as s, open(target,'wb') as d: shutil.copyfileobj(s,d)",
      { ARCHIVE_PATH: path.resolve(archivePath), ARCHIVE_TYPE: archiveType, TARGET_DIR: path.resolve(targetDir) }
    );
  };

  const resolveUniqueName = (name, usedNameSet) => {
    const rawName = String(name || "").trim() || "未命名";
    const safeName = safeFileName(rawName) || "未命名";
    if (!usedNameSet.has(safeName)) {
      usedNameSet.add(safeName);
      return safeName;
    }
    const ext = path.extname(safeName);
    const base = ext ? safeName.slice(0, -ext.length) : safeName;
    let index = 1;
    let candidate = `${base}(${index})${ext}`;
    while (usedNameSet.has(candidate)) {
      index += 1;
      candidate = `${base}(${index})${ext}`;
    }
    usedNameSet.add(candidate);
    return candidate;
  };

  return {
    runCompressArchive,
    listArchiveEntries,
    extractArchiveToDirectory,
    resolveUniqueName
  };
};

module.exports = {
  createArchiveRuntime
};
