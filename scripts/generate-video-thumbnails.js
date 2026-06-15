/**
 * 批量为现有视频文件生成缩略图
 * 使用方法: node scripts/generate-video-thumbnails.js
 */

const fs = require("fs");
const path = require("path");

// 读取 .env 文件
const ENV_FILE = path.resolve(__dirname, "../.env");
if (fs.existsSync(ENV_FILE)) {
  const envContent = fs.readFileSync(ENV_FILE, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const mysql = require("mysql2/promise");
const { generateVideoThumbnail, resolveAbsoluteStoragePath, setStorageDiskConfig } = require("../src/utils/file-helpers");

const BATCH_SIZE = 5;

async function main() {
  console.log("开始为现有视频生成缩略图...\n");

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "jockcloud",
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  try {
    // 直接从数据库加载存储磁盘配置
    const [settingsRows] = await pool.query(
      "SELECT config_key, config_value FROM settings"
    );
    
    // 解析所有设置行
    const settingsMap = {};
    settingsRows.forEach((row) => {
      try {
        settingsMap[row.config_key] = JSON.parse(row.config_value);
      } catch (e) {
        settingsMap[row.config_key] = row.config_value;
      }
    });
    
    // 尝试多种方式获取存储磁盘配置
    let storageDisks = null;
    
    // 方式1: system.storageDisks (可能是数组或对象)
    if (settingsMap["system.storageDisks"]) {
      storageDisks = settingsMap["system.storageDisks"];
    }
    // 方式2: 直接是 storageDisks
    else if (settingsMap["storageDisks"]) {
      storageDisks = settingsMap["storageDisks"];
    }
    // 方式3: 遍历所有值，找到数组类型的（磁盘配置是数组）
    else {
      for (const key of Object.keys(settingsMap)) {
        const val = settingsMap[key];
        if (Array.isArray(val) && val.length > 0 && val[0].id !== undefined && val[0].path !== undefined) {
          storageDisks = val;
          break;
        }
      }
    }
    
    if (storageDisks) {
      // 如果是数组，包装成 {disks: [...]} 格式
      const diskConfig = Array.isArray(storageDisks) 
        ? { defaultDiskId: "", disks: storageDisks }
        : storageDisks;
      
      setStorageDiskConfig(diskConfig);
      const disks = Array.isArray(diskConfig.disks) ? diskConfig.disks : [];
      console.log(`已加载存储磁盘配置，共 ${disks.length} 个磁盘:`);
      disks.forEach((d) => console.log(`  [${d.id}] ${d.path} (enabled: ${d.enabled !== false})`));
      console.log("");
    } else {
      console.log("未找到存储磁盘配置，使用默认路径\n");
    }

    const [rows] = await pool.query(
      `SELECT id, storage_name, original_name, space_type 
       FROM files 
       WHERE file_category = 'video' 
       AND (thumbnail_storage_name IS NULL OR thumbnail_storage_name = '')
       ORDER BY id ASC`
    );

    console.log(`找到 ${rows.length} 个需要生成缩略图的视频文件\n`);

    if (rows.length === 0) {
      console.log("所有视频文件都已有缩略图，无需处理。");
      return;
    }

    // 调试：显示前3条记录的路径解析
    rows.slice(0, 3).forEach((row) => {
      const resolved = resolveAbsoluteStoragePath(row.storage_name, row.space_type);
      const exists = resolved ? fs.existsSync(resolved) : false;
      console.log(`  ID ${row.id}: storage_name=${row.storage_name}`);
      console.log(`    解析路径: ${resolved}`);
      console.log(`    文件存在: ${exists}`);
    });
    console.log("");

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(async (row) => {
        const videoPath = resolveAbsoluteStoragePath(row.storage_name, row.space_type);
        if (!videoPath || !fs.existsSync(videoPath)) {
          console.log(`[跳过] ID ${row.id}: 文件不存在 ${videoPath}`);
          return { id: row.id, success: false, reason: "文件不存在" };
        }
        const thumbnailStorageName = await generateVideoThumbnail(videoPath, row.storage_name, row.space_type);
        if (thumbnailStorageName) {
          await pool.query("UPDATE files SET thumbnail_storage_name = ? WHERE id = ?", [thumbnailStorageName, row.id]);
          console.log(`[成功] ID ${row.id}: ${row.original_name}`);
          return { id: row.id, success: true };
        }
        console.log(`[失败] ID ${row.id}: 缩略图生成失败`);
        return { id: row.id, success: false, reason: "生成失败" };
      }));

      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value.success) successCount++;
        else failCount++;
      });

      const progress = Math.min(i + BATCH_SIZE, rows.length);
      console.log(`进度: ${progress}/${rows.length}\n`);
    }

    console.log("========================================");
    console.log(`处理完成！成功: ${successCount}, 失败: ${failCount}`);
    console.log("========================================");
  } catch (err) {
    console.error("执行出错:", err.message, err.stack);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
