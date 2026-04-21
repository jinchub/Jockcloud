const mysql = require('mysql2/promise');
const { getDbConfig, hashPassword, ensureSettingsTable, ensureSettingsDefaultRow } = require('./utils');

const dbConfig = getDbConfig();
const pool = mysql.createPool(dbConfig);

const initDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(64) NULL,
      phone VARCHAR(20) NULL,
      password_hash VARCHAR(128) NOT NULL,
      quota_bytes BIGINT DEFAULT -1,
      permissions TEXT NULL,
      role VARCHAR(20) DEFAULT 'user',
      avatar VARCHAR(255) NULL,
      hidden_space_enabled TINYINT(1) NOT NULL DEFAULT 0,
      hidden_space_password_hash VARCHAR(128) NULL,
      view_mode VARCHAR(16) NOT NULL DEFAULT 'list',
      grid_size VARCHAR(16) NOT NULL DEFAULT 'medium',
      visible_categories TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_phone (phone),
      INDEX idx_users_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sessions_user (user_id),
      INDEX idx_sessions_expire (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(64) NOT NULL UNIQUE,
      permissions TEXT NULL,
      max_upload_size_mb INT NULL,
      max_upload_file_count INT NULL,
      quota_bytes BIGINT DEFAULT -1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_group_members (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      group_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_group_member (user_id, group_id),
      INDEX idx_group_member_user (user_id),
      INDEX idx_group_member_group (group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS folders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      parent_id INT NULL,
      space_type VARCHAR(16) NOT NULL DEFAULT 'normal',
      deleted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_folders_user_parent (user_id, parent_id),
      INDEX idx_folders_user_space (user_id, space_type, deleted_at),
      INDEX idx_folders_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      folder_id INT NULL,
      original_name VARCHAR(255) NOT NULL,
      storage_name VARCHAR(255) NOT NULL,
      thumbnail_storage_name VARCHAR(255) NULL,
      file_category VARCHAR(16) NOT NULL DEFAULT 'other',
      size BIGINT NOT NULL,
      mime_type VARCHAR(255) NULL,
      space_type VARCHAR(16) NOT NULL DEFAULT 'normal',
      deleted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_files_user_folder (user_id, folder_id),
      INDEX idx_files_user_space (user_id, space_type, deleted_at),
      INDEX idx_files_category (file_category),
      INDEX idx_files_updated (updated_at),
      INDEX idx_files_original_name (original_name(100))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upload_tasks (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      task_id VARCHAR(128) NOT NULL,
      task_type VARCHAR(20) NOT NULL DEFAULT 'upload',
      name VARCHAR(255) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      started_at DATETIME NOT NULL,
      target_path VARCHAR(512) NOT NULL,
      source_path VARCHAR(1024) NOT NULL DEFAULT '',
      progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL,
      space_type VARCHAR(16) NOT NULL DEFAULT 'normal',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_upload_task (user_id, task_id),
      INDEX idx_upload_task_user_time (user_id, started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_access (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      folder_id INT NULL,
      entry_type VARCHAR(16) NOT NULL DEFAULT 'folder',
      entry_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_quick_access_user_entry (user_id, entry_type, entry_id),
      INDEX idx_quick_access_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shares (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      space_type VARCHAR(16) NOT NULL DEFAULT 'normal',
      entry_type VARCHAR(16) NOT NULL,
      entry_id INT NOT NULL,
      share_code VARCHAR(32) NOT NULL UNIQUE,
      password_hash VARCHAR(128) NULL,
      access_code VARCHAR(20) NULL,
      visit_count INT NOT NULL DEFAULT 0,
      download_count INT NOT NULL DEFAULT 0,
      expires_at DATETIME NULL,
      is_canceled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_shares_user_created (user_id, created_at),
      INDEX idx_shares_entry (user_id, space_type, entry_type, entry_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_tasks (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      task_id VARCHAR(128) NOT NULL,
      name VARCHAR(255) NOT NULL,
      local_dir VARCHAR(512) NOT NULL,
      remote_mount_id VARCHAR(128) NOT NULL,
      remote_mount_name VARCHAR(255) NOT NULL,
      remote_dir VARCHAR(512) NOT NULL,
      sync_direction VARCHAR(32) NOT NULL DEFAULT 'local_to_remote',
      task_type VARCHAR(20) NOT NULL,
      schedule_value INT UNSIGNED NOT NULL DEFAULT 1,
      schedule_unit VARCHAR(20) NOT NULL DEFAULT 'minute',
      schedule_time VARCHAR(8) NOT NULL DEFAULT '00:00',
      schedule_at DATETIME NULL,
      schedule_date_type VARCHAR(20) NOT NULL DEFAULT 'daily',
      schedule_date_value INT UNSIGNED NOT NULL DEFAULT 1,
      sync_empty_dir TINYINT(1) NOT NULL DEFAULT 0,
      file_update_rule VARCHAR(20) NOT NULL DEFAULT 'all',
      size_rule_operator VARCHAR(16) NOT NULL DEFAULT 'none',
      size_rule_value INT UNSIGNED NOT NULL DEFAULT 1,
      size_rule_unit VARCHAR(8) NOT NULL DEFAULT 'kb',
      size_rule_action VARCHAR(16) NOT NULL DEFAULT 'include',
      delete_rule VARCHAR(20) NOT NULL DEFAULT 'keep',
      status VARCHAR(20) NOT NULL DEFAULT 'idle',
      last_run_at DATETIME NULL,
      next_run_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_sync_task (user_id, task_id),
      INDEX idx_sync_task_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_task_details (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      task_id VARCHAR(128) NOT NULL,
      detail_message TEXT NOT NULL,
      detail_status VARCHAR(20) NOT NULL DEFAULT 'idle',
      detail_at DATETIME NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_sync_task_detail (user_id, task_id),
      INDEX idx_sync_task_detail_user_time (user_id, detail_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mounts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL DEFAULT 1,
      name VARCHAR(64) NOT NULL,
      type VARCHAR(32) NOT NULL, -- qiniu, aliyun, tencent
      config TEXT NOT NULL, -- JSON config
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mounts_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_monitor_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      request_id VARCHAR(64) NOT NULL,
      method VARCHAR(10) NOT NULL,
      url TEXT NOT NULL,
      status_code INT NOT NULL,
      duration_ms INT NOT NULL,
      user_id INT NULL,
      ip VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_api_monitor_user_time (user_id, created_at),
      INDEX idx_api_monitor_method (method),
      INDEX idx_api_monitor_status (status_code),
      INDEX idx_api_monitor_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS file_operation_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      operation_type VARCHAR(20) NOT NULL,
      file_id INT NULL,
      folder_id INT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size BIGINT NULL,
      file_category VARCHAR(16) NULL,
      user_id INT NOT NULL,
      ip VARCHAR(64) NULL,
      parent_path TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_file_op_user_time (user_id, created_at),
      INDEX idx_file_op_type (operation_type),
      INDEX idx_file_op_created (created_at),
      INDEX idx_file_op_file_id (file_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS file_monitor_stats (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      snapshot_time DATETIME NOT NULL,
      upload_count INT NOT NULL DEFAULT 0,
      download_count INT NOT NULL DEFAULT 0,
      delete_count INT NOT NULL DEFAULT 0,
      share_download_count INT NOT NULL DEFAULT 0,
      share_visit_count INT NOT NULL DEFAULT 0,
      total_operation_count INT NOT NULL DEFAULT 0,
      total_file_count INT NOT NULL DEFAULT 0,
      total_folder_count INT NOT NULL DEFAULT 0,
      today_new_count INT NOT NULL DEFAULT 0,
      yesterday_new_count INT NOT NULL DEFAULT 0,
      text_count INT NOT NULL DEFAULT 0,
      image_count INT NOT NULL DEFAULT 0,
      audio_count INT NOT NULL DEFAULT 0,
      video_count INT NOT NULL DEFAULT 0,
      archive_count INT NOT NULL DEFAULT 0,
      program_count INT NOT NULL DEFAULT 0,
      other_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_snapshot_time (snapshot_time),
      INDEX idx_stats_snapshot_time (snapshot_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_metrics (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      cpu_usage FLOAT NOT NULL DEFAULT 0,
      memory_usage FLOAT NOT NULL DEFAULT 0,
      disk_usage FLOAT NOT NULL DEFAULT 0,
      net_tx_speed BIGINT NOT NULL DEFAULT 0,
      net_rx_speed BIGINT NOT NULL DEFAULT 0,
      timestamp DATETIME NOT NULL,
      INDEX idx_timestamp (timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [users] = await pool.query("SELECT id FROM users ORDER BY id ASC LIMIT 1");
  const isFirstInit = users.length === 0;
  
  await ensureSettingsTable();
  await ensureSettingsDefaultRow();
  
  if (isFirstInit) {
    await pool.query("UPDATE quick_access SET entry_type = 'folder' WHERE entry_type IS NULL OR entry_type = ''");
    await pool.query("UPDATE quick_access SET entry_id = folder_id WHERE entry_id IS NULL AND folder_id IS NOT NULL");
    await pool.query(`
      DELETE qa1
      FROM quick_access qa1
      INNER JOIN quick_access qa2
        ON qa1.user_id = qa2.user_id
        AND qa1.entry_type = qa2.entry_type
        AND qa1.entry_id = qa2.entry_id
        AND qa1.id > qa2.id
    `);
  }

  if (users.length === 0) {
    const adminPasswordHash = await hashPassword("admin");
    await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)", [1, "admin", adminPasswordHash, "admin"]);
    await pool.query("INSERT INTO user_groups (id, name, quota_bytes, max_upload_size_mb, max_upload_file_count) VALUES (1, 'SVIP', 10995116277760, 10240, 1000), (2, 'VIP', 2199023255552, 8192, 800), (3, 'USER', 536870912000, 4096, 500)");
    await pool.query("INSERT INTO user_group_members (user_id, group_id) VALUES (1, 1)");
  } else {
    await pool.query("UPDATE users SET role = 'admin' WHERE id = 1");
  }
  if (isFirstInit) {
    await pool.query(`
      DELETE m
      FROM user_group_members m
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN user_groups g ON g.id = m.group_id
      WHERE u.id IS NULL OR g.id IS NULL
    `);
    await pool.query(`
      DELETE qa
      FROM quick_access qa
      LEFT JOIN users u ON u.id = qa.user_id
      LEFT JOIN folders f ON qa.entry_type = 'folder' AND f.id = qa.entry_id
      LEFT JOIN files fi ON qa.entry_type = 'file' AND fi.id = qa.entry_id
      WHERE u.id IS NULL
        OR qa.entry_id IS NULL
        OR qa.entry_type NOT IN ('folder', 'file')
        OR (qa.entry_type = 'folder' AND (f.id IS NULL OR f.user_id <> qa.user_id OR f.deleted_at IS NOT NULL))
        OR (qa.entry_type = 'file' AND (fi.id IS NULL OR fi.user_id <> qa.user_id OR fi.deleted_at IS NOT NULL))
    `);
    await pool.query(`
      DELETE s
      FROM shares s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE u.id IS NULL
    `);
  }
  
};

module.exports = {
  pool,
  initDatabase
};
