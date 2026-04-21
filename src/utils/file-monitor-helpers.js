const ensureFileOperationLogsTable = async (pool) => {
  try {
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
    return true;
  } catch (error) {
    console.error('Failed to ensure file_operation_logs table:', error);
    return false;
  }
};

const logFileOperation = async (pool, operation) => {
  try {
    await ensureFileOperationLogsTable(pool);
    
    const {
      operationType,
      fileId = null,
      folderId = null,
      fileName,
      fileSize = null,
      fileCategory = null,
      userId,
      ip = null,
      parentPath = null
    } = operation;

    console.log('Logging file operation:', {
      operationType,
      fileId,
      folderId,
      fileName,
      fileSize,
      fileCategory,
      userId,
      ip,
      parentPath
    });

    const [result] = await pool.query(
      `INSERT INTO file_operation_logs 
       (operation_type, file_id, folder_id, file_name, file_size, file_category, user_id, ip, parent_path) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [operationType, fileId, folderId, fileName, fileSize, fileCategory, userId, ip, parentPath]
    );
    
    console.log('File operation logged successfully, insertId:', result.insertId);
    return result;
  } catch (error) {
    console.error('Failed to log file operation:', error);
    console.error('Operation data:', operation);
    return null;
  }
};

module.exports = {
  logFileOperation,
  ensureFileOperationLogsTable
};
