const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");
const ENV_FILE = path.join(ROOT_DIR, ".env");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const HIDDEN_UPLOAD_DIR = path.join(ROOT_DIR, "hidden-uploads");
const SESSION_COOKIE = "cloud_sid";
const DEFAULT_LOGIN_SESSION_MINUTES = 7 * 24 * 60;
const CAPTCHA_EXPIRE_MS = 5 * 60 * 1000;
const SMS_CODE_EXPIRE_MS = 5 * 60 * 1000;
const SMS_SEND_INTERVAL_MS = 60 * 1000;
const RECYCLE_RETENTION_DAYS = 30;
const RECYCLE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const LOG_DIR = path.join(ROOT_DIR, "logs");
const APP_LOG_FILE = path.join(LOG_DIR, "app.log");
const ERROR_LOG_FILE = path.join(LOG_DIR, "error.log");
const LOG_MAX_STRING_LENGTH = 800;
const LOG_MAX_OBJECT_KEYS = 30;
const LOG_MAX_ARRAY_ITEMS = 30;
const LOG_MAX_DEPTH = 4;
const DEFAULT_MAX_UPLOAD_FILE_SIZE_MB = 10240;
const AVATAR_MAX_UPLOAD_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB = 200;
const DEFAULT_UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_CHUNK_SIZE_BYTES = 20 * 1024 * 1024;
const CHUNK_SESSION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const CHUNK_SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PREVIEW_MEDIA_STREAM_CHUNK_BYTES = 2 * 1024 * 1024;
const SYNC_SCHEDULER_CRON = "*/10 * * * * *";
const AVATAR_ROOT_DIR = path.join(UPLOAD_DIR, "avatar");
const CHUNK_UPLOAD_ROOT_DIR = path.join(UPLOAD_DIR, ".chunk-uploads");
const DEFAULT_AVATAR_UPLOAD_SIZE_MB = 4;
const DEFAULT_AVATAR_UPLOAD_FORMATS = ["jpg", "png", "webp", "bmp"];
const FILE_UPLOAD_CATEGORY_KEYS = ["image", "video", "audio", "doc", "text", "archive", "program", "other"];
const FILE_UPLOAD_CATEGORY_LABELS = {
  image: "图片",
  video: "视频",
  audio: "音频",
  doc: "文档",
  text: "文本",
  archive: "压缩包",
  program: "程序包",
  other: "其他"
};
const DEFAULT_UPLOAD_CATEGORY_RULES = {
  image: { formats: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "svg", "tif", "tiff", "psd", "ai", "eps", "raw", "cr2", "nef", "arw", "ico", "cur", "pcx", "tga", "exr", "hdr", "dng", "heic", "heif", "avif"], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB },
  video: { formats: ["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "m4v", "3gp", "3g2", "mpg", "mpeg", "m2ts", "mts", "ts", "vob", "ogv", "rm", "rmvb", "divx", "xvid", "dat", "mxf"], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB },
  audio: { formats: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "amr", "wma", "ape", "dsf", "dff", "opus", "mka", "aiff", "aif", "au", "voc", "ra", "ram", "mid", "midi", "kar", "rmi", "mod", "s3m", "xm", "it", "mtm", "umx"], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB },
  doc: { formats: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "wps", "et", "dps", "epub", "mobi", "azw3", "html", "htm", "xml", "md", "tif", "tiff", "odt", "ods", "odp", "odg", "odf", "rtf", "pages", "numbers", "key", "vsd", "vsdx", "pub", "accdb", "mdb", "one", "onetoc2"], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB },
  text: { formats: ["txt", "md", "markdown", "log", "ini", "conf", "cfg", "yaml", "yml", "json", "xml", "csv", "tsv", "srt", "ass", "ssa", "vtt", "rtf", "tex", "latex", "lyx", "java", "js", "ts", "jsx", "tsx", "py", "rb", "php", "go", "rs", "c", "cpp", "cc", "cxx", "h", "hpp", "cs", "vb", "swift", "kt", "scala", "sh", "bash", "bat", "cmd", "ps1", "sql", "lua", "pl", "pm", "r", "mat", "m", "hs", "lhs", "erl", "hrl", "ex", "exs", "clj", "cljc", "cljs", "edn", "vim", "rc", "env", "dockerfile", "makefile", "cmake", "ninja", "meson", "pro", "sln", "csproj", "vbproj", "vcxproj", "xcodeproj", "pbxproj", "gradle", "sbt", "pom", "xml", "iml", "ipynb", "rmarkdown", "rmd", "qmd", "jupyter", "rproj", "dvc", "jsonl", "ndjson", "yaml", "yml", "toml", "ini", "cfg", "conf", "properties", "prop", "env", "env.local", "env.development", "env.production", "env.test", "gitignore", "gitattributes", "gitconfig", "gitmodules", "dockerignore", "docker-compose", "compose", "k8s", "kubernetes", "helm", "chart", "tf", "terraform", "hcl", "packer", "vagrant", "ansible", "playbook", "role", "inventory", "hosts", "group_vars", "host_vars", "site", "local", "tasks", "handlers", "templates", "files", "vars", "defaults", "meta", "library", "module_utils", "filter_plugins", "callback_plugins", "connection_plugins", "lookup_plugins", "vars_plugins", "test_plugins", "action_plugins", "terminal_plugins", "netconf_plugins", "httpapi_plugins", "cliconf_plugins", "cache_plugins", "strategy_plugins", "inventory_plugins", "shell_plugins", "doc_fragments", "module_utils", "plugins", "roles", "collections", "ansible.cfg", "hosts", "inventory", "group_vars", "host_vars", "site.yml", "local.yml", "tasks", "handlers", "templates", "files", "vars", "defaults", "meta", "library", "module_utils", "filter_plugins", "callback_plugins", "connection_plugins", "lookup_plugins", "vars_plugins", "test_plugins", "action_plugins", "terminal_plugins", "netconf_plugins", "httpapi_plugins", "cliconf_plugins", "cache_plugins", "strategy_plugins", "inventory_plugins", "shell_plugins", "doc_fragments", "module_utils", "plugins", "roles", "collections", "ansible.cfg"], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB },
  archive: { formats: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "cab", "iso", "z", "lz", "lzma", "lzo", "zstd", "zst", "arj", "lzh", "ace", "uue", "jar", "war", "ear", "sar", "par", "par2", "rev", "apk", "xapk", "apks", "apkm", "aab", "dmg", "pkg", "deb", "rpm", "appimage", "snap", "flatpak", "ipa", "msix", "appx", "xbap", "click", "snap", "flatpak", "appimage", "tar.gz", "tgz", "tar.bz2", "tbz2", "tar.xz", "txz", "tar.zst", "tzst", "tar.lz", "tlz", "tar.lzma", "tlzma", "zipx", "7z.001", "7z.002", "rar.part1", "rar.part2", "zip.001", "zip.002"], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB },
  program: { formats: ["exe", "msi", "apk", "dmg", "pkg", "deb", "rpm", "appimage", "ipa", "msix", "appx", "xbap", "click", "snap", "flatpak", "xapk", "apks", "apkm", "aab", "bin", "run", "sh", "bash", "command", "tool", "workflow", "action", "plugin", "extension", "addon", "theme", "skin", "pack", "mod", "map", "wad", "pk3", "pk4", "vpk", "bsp", "nav", "dem", "replay", "save", "sav", "cfg", "ini", "con", "rc", "reg", "bat", "cmd", "ps1", "psm1", "psd1", "ps1xml", "clixml", "dll", "so", "dylib", "a", "lib", "o", "obj", "ko", "sys", "drv", "vxd", "ocx", "cpl", "scr", "msc", "mmc", "ade", "adp", "bas", "bat", "chm", "cmd", "com", "cpl", "crt", "csh", "der", "exe", "fxp", "gadget", "hlp", "hta", "inf", "ins", "isp", "its", "js", "jse", "lnk", "mad", "maf", "mag", "mam", "maq", "mar", "mas", "mat", "mau", "mav", "maw", "mda", "mdb", "mde", "mdt", "mdw", "mdz", "msc", "msh", "msh1", "msh2", "mshxml", "msh1xml", "msh2xml", "msi", "msp", "mst", "ops", "pcd", "pif", "pl", "plg", "prf", "prg", "pst", "reg", "scf", "scr", "sct", "shb", "shs", "url", "vb", "vbe", "vbs", "vsw", "ws", "wsc", "wsf", "wsh", "xnk"], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB },
  other: { formats: [], maxSizeMb: DEFAULT_MAX_UPLOAD_FILE_SIZE_MB }
};
const THUMBNAIL_IMAGE_MIME_SET = new Set(["image/jpeg", "image/pjpeg", "image/png", "image/webp", "image/bmp", "image/x-ms-bmp", "image/gif"]);
const THUMBNAIL_MIME_TO_EXT_MAP = {
  "image/jpeg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/gif": "gif"
};
const THUMBNAIL_MAX_DATA_URL_LENGTH = 2 * 1024 * 1024;
const AVATAR_FORMAT_MIME_MAP = {
  jpg: ["image/jpeg", "image/pjpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  bmp: ["image/bmp", "image/x-ms-bmp"],
  gif: ["image/gif"]
};
const MENU_PERMISSION_KEYS = ["files", "transfer", "users", "permissions", "quota", "mounts", "sync", "monitor", "settings"];
const VIEW_MODE_OPTIONS = new Set(["list", "grid"]);
const GRID_SIZE_OPTIONS = new Set(["small", "medium", "large"]);
const FILE_CATEGORY_OPTIONS = ["image", "doc", "video", "text", "audio", "archive", "program", "other"];
const LOGIN_PASSWORD_RSA_OAEP_HASH = "sha256";
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const ARCHIVE_SUPPORTED_TYPE_SET = new Set(["zip", "tar", "tgz", "tbz2", "txz", "gz", "bz2", "xz"]);
const ALL_FILE_PERMISSIONS = ["upload", "download", "rename", "delete", "move", "copy", "extract", "viewArchive"];
const FILE_PERMISSION_SET = new Set(ALL_FILE_PERMISSIONS);
const ALLOWED_UPLOAD_TASK_STATUS = new Set(["pending", "uploading", "downloading", "completed", "failed", "canceled", "paused"]);
const ALLOWED_SYNC_TASK_STATUS = new Set(["idle", "running", "paused", "success", "error"]);
const SETTINGS_GLOBAL_KEY = "global";

const DEFAULT_PREVIEW_CONFIG = {
  imageExts: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff", "ico", "avif", "apng", "jfif", "heic", "heif"],
  videoExts: ["mp4", "webm", "ogg", "ogv", "mov", "m4v", "mkv", "avi", "wmv", "flv", "3gp", "mpeg", "mpg", "ts", "m2ts"],
  audioExts: ["mp3", "wav", "flac", "aac", "ogg", "oga", "m4a", "amr", "opus", "wma", "abc"],
  textExts: ["crt", "csr", "key", "pem", "txt", "md", "markdown", "log", "ini", "conf", "cfg", "yaml", "yml", "json", "xml", "csv", "tsv", "srt", "ass", "ssa", "vtt", "rtf", "tex", "js", "ts", "jsx", "tsx", "py", "java", "c", "cc", "cpp", "h", "hpp", "cs", "go", "rs", "php", "rb", "swift", "kt", "kts", "sql", "sh", "bash", "zsh", "ps1", "bat", "cmd", "vue", "css", "scss", "sass", "less", "html", "htm", "xhtml", "toml", "env", "gitignore", "dockerfile", "makefile", "gradle", "properties", "lock"],
  docExts: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "wps", "et", "dps", "epub", "mobi", "azw3", "ibooks", "ps", "eps"]
};

module.exports = {
  ROOT_DIR,
  ENV_FILE,
  PUBLIC_DIR,
  UPLOAD_DIR,
  HIDDEN_UPLOAD_DIR,
  SESSION_COOKIE,
  DEFAULT_LOGIN_SESSION_MINUTES,
  CAPTCHA_EXPIRE_MS,
  SMS_CODE_EXPIRE_MS,
  SMS_SEND_INTERVAL_MS,
  RECYCLE_RETENTION_DAYS,
  RECYCLE_CLEANUP_INTERVAL_MS,
  LOG_DIR,
  APP_LOG_FILE,
  ERROR_LOG_FILE,
  LOG_MAX_STRING_LENGTH,
  LOG_MAX_OBJECT_KEYS,
  LOG_MAX_ARRAY_ITEMS,
  LOG_MAX_DEPTH,
  DEFAULT_MAX_UPLOAD_FILE_SIZE_MB,
  AVATAR_MAX_UPLOAD_FILE_SIZE_BYTES,
  DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB,
  DEFAULT_UPLOAD_CHUNK_SIZE_BYTES,
  MAX_UPLOAD_CHUNK_SIZE_BYTES,
  CHUNK_SESSION_EXPIRE_MS,
  CHUNK_SESSION_CLEANUP_INTERVAL_MS,
  PREVIEW_MEDIA_STREAM_CHUNK_BYTES,
  SYNC_SCHEDULER_CRON,
  AVATAR_ROOT_DIR,
  CHUNK_UPLOAD_ROOT_DIR,
  DEFAULT_AVATAR_UPLOAD_SIZE_MB,
  DEFAULT_AVATAR_UPLOAD_FORMATS,
  FILE_UPLOAD_CATEGORY_KEYS,
  FILE_UPLOAD_CATEGORY_LABELS,
  DEFAULT_UPLOAD_CATEGORY_RULES,
  THUMBNAIL_IMAGE_MIME_SET,
  THUMBNAIL_MIME_TO_EXT_MAP,
  THUMBNAIL_MAX_DATA_URL_LENGTH,
  AVATAR_FORMAT_MIME_MAP,
  MENU_PERMISSION_KEYS,
  VIEW_MODE_OPTIONS,
  GRID_SIZE_OPTIONS,
  FILE_CATEGORY_OPTIONS,
  LOGIN_PASSWORD_RSA_OAEP_HASH,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  ARCHIVE_SUPPORTED_TYPE_SET,
  ALL_FILE_PERMISSIONS,
  FILE_PERMISSION_SET,
  ALLOWED_UPLOAD_TASK_STATUS,
  ALLOWED_SYNC_TASK_STATUS,
  SETTINGS_GLOBAL_KEY,
  DEFAULT_PREVIEW_CONFIG
};
