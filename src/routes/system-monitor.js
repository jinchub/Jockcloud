const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pool } = require('../db');

let lastCpuTimes = null;

const getCpuUsage = () => {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const currentCpuTimes = { totalIdle, totalTick };
  let cpuUsagePercent = 0;

  if (lastCpuTimes) {
    const idleDiff = currentCpuTimes.totalIdle - lastCpuTimes.totalIdle;
    const tickDiff = currentCpuTimes.totalTick - lastCpuTimes.totalTick;
    cpuUsagePercent = Math.round(100 - (100 * idleDiff / tickDiff));
  }

  lastCpuTimes = currentCpuTimes;
  return Math.max(0, Math.min(100, cpuUsagePercent));
};

const getDiskUsage = () => {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      try {
        const output = execSync(
          'powershell -Command "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | Select-Object Name, @{N=\'Used\';E={[math]::Round($_.Used/1MB)}}, @{N=\'Free\';E={[math]::Round($_.Free/1MB)}} | ConvertTo-Json"',
          { encoding: 'utf8', maxBuffer: 1024 * 1024 }
        );
        const drives = JSON.parse(output);
        const driveArray = Array.isArray(drives) ? drives : [drives];
        if (driveArray.length > 0) {
          const primaryDrive = driveArray[0];
          return {
            mount: primaryDrive.Name + ':',
            total: (primaryDrive.Used + primaryDrive.Free) * 1024 * 1024,
            used: primaryDrive.Used * 1024 * 1024,
            free: primaryDrive.Free * 1024 * 1024
          };
        }
      } catch (e) {
        console.error('PowerShell disk query failed:', e.message);
      }
    } else {
      try {
        const output = execSync('df -k / | tail -1', { encoding: 'utf8' });
        const parts = output.trim().split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10) * 1024;
          const used = parseInt(parts[2], 10) * 1024;
          const free = parseInt(parts[3], 10) * 1024;
          return {
            mount: '/',
            total,
            used,
            free
          };
        }
      } catch (e) {
        console.error('df command failed:', e.message);
      }
    }

    return {
      mount: '/',
      total: 0,
      free: 0,
      used: 0
    };
  } catch (error) {
    console.error('Failed to get disk usage:', error);
    return {
      mount: '/',
      total: 0,
      free: 0,
      used: 0
    };
  }
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 全局记录网络上次状态
let lastNetworkStats = {
  bytesRx: 0,
  bytesTx: 0,
  timestamp: Date.now()
};

const getNetworkStats = () => {
  let bytesRx = 0;
  let bytesTx = 0;
  const platform = os.platform();
  try {
    if (platform === 'linux') {
      const output = execSync('cat /proc/net/dev', { encoding: 'utf8' });
      const lines = output.split('\n').slice(2);
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10 && !parts[0].startsWith('lo:')) {
          bytesRx += parseInt(parts[1], 10) || 0;
          bytesTx += parseInt(parts[9], 10) || 0;
        }
      });
    } else if (platform === 'win32') {
      const output = execSync('netstat -e', { encoding: 'utf8' });
      const lines = output.split('\n');
      for (let i = 2; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        // 不依赖具体的中文或英文字符，直接匹配结构：3列且后两列为纯数字的第一行，即 Bytes 行
        if (parts.length === 3 && !isNaN(parseInt(parts[1], 10)) && !isNaN(parseInt(parts[2], 10))) {
          bytesRx = parseInt(parts[1], 10) || 0;
          bytesTx = parseInt(parts[2], 10) || 0;
          break;
        }
      }
    } else if (platform === 'darwin') {
      const output = execSync('netstat -ib', { encoding: 'utf8' });
      const lines = output.split('\n').slice(1);
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10 && !parts[0].startsWith('lo')) {
          bytesRx += parseInt(parts[6], 10) || 0;
          bytesTx += parseInt(parts[9], 10) || 0;
        }
      });
    }
  } catch (error) {
    // 忽略网络读取错误
  }
  return { bytesRx, bytesTx, timestamp: Date.now() };
};

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  let result = '';
  if (days > 0) result += `${days}天 `;
  if (hours > 0) result += `${hours}小时 `;
  if (minutes > 0) result += `${minutes}分钟 `;
  result += `${secs}秒`;
  return result.trim();
};

let isMetricsCollectorRunning = false;
const startMetricsCollector = () => {
  if (isMetricsCollectorRunning) return;
  isMetricsCollectorRunning = true;
  
  setInterval(async () => {
    try {
      const cpuUsage = getCpuUsage();
      const totalMemory = os.totalmem();
      const usedMemory = totalMemory - os.freemem();
      const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100);
      
      const diskUsage = getDiskUsage();
      const diskUsagePercent = diskUsage.total > 0 ? Math.round((diskUsage.used / diskUsage.total) * 100) : 0;
      
      const currentNetworkStats = getNetworkStats();
      const timeDiff = (currentNetworkStats.timestamp - lastNetworkStats.timestamp) / 1000;
      let rxSpeed = 0;
      let txSpeed = 0;
      if (timeDiff > 0 && lastNetworkStats.bytesRx > 0 && currentNetworkStats.bytesRx >= lastNetworkStats.bytesRx) {
        rxSpeed = Math.round((currentNetworkStats.bytesRx - lastNetworkStats.bytesRx) / timeDiff);
        txSpeed = Math.round((currentNetworkStats.bytesTx - lastNetworkStats.bytesTx) / timeDiff);
      }
      lastNetworkStats = currentNetworkStats;
      
      await pool.query(
        "INSERT INTO system_metrics (cpu_usage, memory_usage, disk_usage, net_tx_speed, net_rx_speed, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        [cpuUsage, memoryUsagePercent, diskUsagePercent, txSpeed, rxSpeed, new Date()]
      );
      
      // Cleanup metrics older than 7 days
      if (Math.random() < 0.01) {
        await pool.query("DELETE FROM system_metrics WHERE timestamp < DATE_SUB(NOW(), INTERVAL 7 DAY)");
      }
    } catch (err) {
      console.error("Failed to collect system metrics:", err);
    }
  }, 6000);
};

module.exports = (app, deps) => {
  startMetricsCollector();
  
  const { authRequired, adminRequired, apiMonitorStore } = deps;

  // System resource monitor
  app.get("/api/system/info", authRequired, adminRequired, async (req, res) => {
    try {
      const uptime = os.uptime();
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      
      let jsBuildTime = null;
      let jsLatestFile = null;
      try {
        const publicJsDir = path.join(__dirname, "../../public/js");
        if (fs.existsSync(publicJsDir)) {
          const files = fs.readdirSync(publicJsDir);
          if (files.length > 0) {
            let latestMtime = 0;
            for (const file of files) {
              const filePath = path.join(publicJsDir, file);
              const stat = fs.statSync(filePath);
              if (stat.mtimeMs > latestMtime) {
                latestMtime = stat.mtimeMs;
                jsLatestFile = file;
              }
            }
            jsBuildTime = latestMtime;
          }
        }
      } catch(e) {
        console.error("Failed to read js build time", e);
      }
      
      let systemVersion = "1.0.0";
      try {
        const pkgPath = path.join(process.cwd(), "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.version) systemVersion = pkg.version;
        }
      } catch(e) {
        console.error("Failed to read package.json version", e);
      }

      res.json({
        nodeVersion: process.version,
        systemVersion,
        platform: os.platform(),
        arch: os.arch(),
        uptime: formatUptime(uptime),
        uptimeSeconds: Math.floor(uptime),
        jsBuildTime,
        jsLatestFile,
        appStartTime: Date.now() - Math.floor(process.uptime() * 1000),
        serverPort: process.env.PORT || 3000,
        programDir: process.cwd(),
        memory: {
          used: formatBytes(memoryUsage.rss),
          usedBytes: memoryUsage.rss,
          heapTotal: formatBytes(memoryUsage.heapTotal),
          heapTotalBytes: memoryUsage.heapTotal,
          heapUsed: formatBytes(memoryUsage.heapUsed),
          heapUsedBytes: memoryUsage.heapUsed,
          external: formatBytes(memoryUsage.external),
          externalBytes: memoryUsage.external,
          total: formatBytes(totalMemory),
          totalBytes: totalMemory,
          free: formatBytes(freeMemory),
          freeBytes: freeMemory
        },
        cpus: os.cpus().map(cpu => ({
          model: cpu.model,
          speed: cpu.speed,
          times: cpu.times
        })),
        loadavg: os.loadavg(),
        hostname: os.hostname(),
        networkInterfaces: os.networkInterfaces(),
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to get system info:', error);
      res.status(500).json({ message: '获取系统信息失败' });
    }
  });

  app.get("/api/system/metrics", authRequired, adminRequired, async (req, res) => {
    try {
      const { startTime, endTime } = req.query;
      let query = "SELECT cpu_usage, memory_usage, disk_usage, net_tx_speed, net_rx_speed, timestamp FROM system_metrics WHERE 1=1";
      const params = [];
      
      if (startTime) {
        query += " AND timestamp >= ?";
        params.push(new Date(Number(startTime)));
      }
      if (endTime) {
        query += " AND timestamp <= ?";
        params.push(new Date(Number(endTime)));
      }
      
      query += " ORDER BY timestamp ASC LIMIT 2000";
      
      const [rows] = await pool.query(query, params);
      
      res.json(rows.map(r => ({
        cpu: r.cpu_usage,
        memory: r.memory_usage,
        disk: r.disk_usage,
        tx: r.net_tx_speed,
        rx: r.net_rx_speed,
        timestamp: r.timestamp.getTime()
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to get metrics" });
    }
  });

  app.get("/api/system/resource", authRequired, adminRequired, async (req, res) => {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      
      const cpuUsage = getCpuUsage();
      const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100);
      const diskUsage = getDiskUsage();
      const diskUsagePercent = diskUsage.total > 0 ? Math.round((diskUsage.used / diskUsage.total) * 100) : 0;

      // 网络速度计算
      const currentNetworkStats = getNetworkStats();
      const timeDiff = (currentNetworkStats.timestamp - lastNetworkStats.timestamp) / 1000;
      let rxSpeed = 0;
      let txSpeed = 0;
      if (timeDiff > 0 && lastNetworkStats.bytesRx > 0 && currentNetworkStats.bytesRx >= lastNetworkStats.bytesRx) {
        rxSpeed = Math.round((currentNetworkStats.bytesRx - lastNetworkStats.bytesRx) / timeDiff);
        txSpeed = Math.round((currentNetworkStats.bytesTx - lastNetworkStats.bytesTx) / timeDiff);
      }
      lastNetworkStats = currentNetworkStats;

      res.json({
        cpu: {
          usage: cpuUsage,
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'Unknown'
        },
        memory: {
          usage: memoryUsagePercent,
          used: formatBytes(usedMemory),
          usedBytes: usedMemory,
          total: formatBytes(totalMemory),
          totalBytes: totalMemory,
          free: formatBytes(freeMemory),
          freeBytes: freeMemory
        },
        disk: {
          usage: diskUsagePercent,
          mount: diskUsage.mount,
          used: formatBytes(diskUsage.used),
          usedBytes: diskUsage.used,
          total: formatBytes(diskUsage.total),
          totalBytes: diskUsage.total,
          free: formatBytes(diskUsage.free),
          freeBytes: diskUsage.free
        },
        network: {
          interfaces: os.networkInterfaces(),
          hostname: os.hostname(),
          rxSpeed,
          txSpeed,
          rxSpeedStr: formatBytes(rxSpeed) + '/s',
          txSpeedStr: formatBytes(txSpeed) + '/s'
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to get resource info:', error);
      res.status(500).json({ message: '获取资源信息失败' });
    }
  });

  app.get("/api/system/api-monitor", authRequired, adminRequired, async (req, res) => {
    try {
      const { pool } = req.app.locals;
      const timeRange = req.query.timeRange || '1h';
      const startTimeParam = req.query.startTime;
      const endTimeParam = req.query.endTime;
      
      let startTime;
      let recentRequests;
      let now = new Date();
      if (timeRange === 'custom' && startTimeParam && endTimeParam) {
        startTime = new Date(parseInt(startTimeParam));
        const endTime = new Date(parseInt(endTimeParam));
        // 使用自定义时间范围
        const [dbLogs] = await pool.query(
          "SELECT * FROM api_monitor_logs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT 100",
          [startTime, endTime]
        );
        
        recentRequests = dbLogs.map(row => ({
          id: row.request_id,
          method: row.method,
          url: row.url,
          statusCode: row.status_code,
          durationMs: row.duration_ms,
          timestamp: row.created_at.getTime(),
          userId: row.user_id,
          ip: row.ip
        }));
      } else {
        // 使用预设时间范围
        now = new Date();
        if (timeRange === 'realtime') {
          startTime = new Date(Date.now() - 10 * 60 * 1000);
        } else if (timeRange === '1h') {
          startTime = new Date(Date.now() - 60 * 60 * 1000);
        } else if (timeRange === '6h') {
          startTime = new Date(Date.now() - 6 * 60 * 60 * 1000);
        } else if (timeRange === '12h') {
          startTime = new Date(Date.now() - 12 * 60 * 60 * 1000);
        } else if (timeRange === '24h') {
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        } else {
          startTime = new Date(Date.now() - 60 * 60 * 1000);
        }
        
        const [dbLogs] = await pool.query(
          "SELECT * FROM api_monitor_logs WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100",
          [startTime]
        );
        
        recentRequests = dbLogs.map(row => ({
          id: row.request_id,
          method: row.method,
          url: row.url,
          statusCode: row.status_code,
          durationMs: row.duration_ms,
          timestamp: row.created_at.getTime(),
          userId: row.user_id,
          ip: row.ip
        }));
      }

      const totalRequests = recentRequests.length;
      const successRequests = recentRequests.filter(r => r.statusCode >= 200 && r.statusCode < 400).length;
      const errorRequests = recentRequests.filter(r => r.statusCode >= 400).length;
      const avgResponseTime = totalRequests > 0 
        ? Math.round(recentRequests.reduce((sum, r) => sum + r.durationMs, 0) / totalRequests)
        : 0;

      const endpointStats = new Map();
      recentRequests.forEach(request => {
        const urlParts = request.url.split('?')[0];
        const endpoint = `${request.method} ${urlParts}`;
        
        if (!endpointStats.has(endpoint)) {
          endpointStats.set(endpoint, {
            endpoint,
            count: 0,
            totalDuration: 0,
            successCount: 0,
            errorCount: 0
          });
        }
        
        const stats = endpointStats.get(endpoint);
        stats.count++;
        stats.totalDuration += request.durationMs;
        
        if (request.statusCode >= 200 && request.statusCode < 400) {
          stats.successCount++;
        } else {
          stats.errorCount++;
        }
      });

      const topEndpoints = Array.from(endpointStats.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(stats => ({
          endpoint: stats.endpoint,
          count: stats.count,
          avgDuration: Math.round(stats.totalDuration / stats.count),
          successRate: Math.round((stats.successCount / stats.count) * 100)
        }));

      res.json({
        totalRequests,
        successRequests,
        errorRequests,
        successRate: totalRequests > 0 ? Math.round((successRequests / totalRequests) * 100) : 0,
        avgResponseTime,
        topEndpoints,
        recentRequests: recentRequests.slice(0, 50),
        timestamp: now.getTime()
      });
    } catch (error) {
      console.error('Failed to get api monitor info:', error);
      res.status(500).json({ message: '获取接口监控信息失败' });
    }
  });

  app.get("/api/system/access-monitor", authRequired, adminRequired, async (req, res) => {
    try {
      const { pool } = req.app.locals;
      const timeRange = req.query.timeRange || '1h';
      const startTimeParam = req.query.startTime;
      const endTimeParam = req.query.endTime;
      
      let recentRequests;
      let now = new Date();
      
      if (timeRange === 'custom' && startTimeParam && endTimeParam) {
        const startTime = new Date(parseInt(startTimeParam));
        const endTime = new Date(parseInt(endTimeParam));
        // 使用自定义时间范围
        const [dbLogs] = await pool.query(
          "SELECT * FROM api_monitor_logs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT 1000",
          [startTime, endTime]
        );
        
        recentRequests = dbLogs.map(row => ({
          id: row.request_id,
          method: row.method,
          url: row.url,
          statusCode: row.status_code,
          durationMs: row.duration_ms,
          timestamp: row.created_at.getTime(),
          userId: row.user_id,
          ip: row.ip
        }));
      } else {
        // 使用预设时间范围
        let startTime;
        now = new Date();
        if (timeRange === 'realtime') {
          startTime = new Date(Date.now() - 10 * 60 * 1000);
        } else if (timeRange === '1h') {
          startTime = new Date(Date.now() - 60 * 60 * 1000);
        } else if (timeRange === '6h') {
          startTime = new Date(Date.now() - 6 * 60 * 60 * 1000);
        } else if (timeRange === '12h') {
          startTime = new Date(Date.now() - 12 * 60 * 60 * 1000);
        } else if (timeRange === '24h') {
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        } else {
          startTime = new Date(Date.now() - 60 * 60 * 1000);
        }
        
        const [dbLogs] = await pool.query(
          "SELECT * FROM api_monitor_logs WHERE created_at >= ? ORDER BY created_at DESC LIMIT 1000",
          [startTime]
        );
        
        recentRequests = dbLogs.map(row => ({
          id: row.request_id,
          method: row.method,
          url: row.url,
          statusCode: row.status_code,
          durationMs: row.duration_ms,
          timestamp: row.created_at.getTime(),
          userId: row.user_id,
          ip: row.ip
        }));
      }

      const userStats = new Map();
      const ipStats = new Map();
      const pathStats = new Map();
      const hourlyStats = new Array(24).fill(0);

      recentRequests.forEach(request => {
        const userId = request.userId || 'anonymous';
        const ip = request.ip || 'unknown';
        const path = request.url.split('?')[0];
        const hour = new Date(request.timestamp).getHours();

        userStats.set(userId, (userStats.get(userId) || 0) + 1);
        ipStats.set(ip, (ipStats.get(ip) || 0) + 1);
        pathStats.set(path, (pathStats.get(path) || 0) + 1);
        hourlyStats[hour]++;
      });

      const topUsers = Array.from(userStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      const topUsersWithNames = [];
      for (const [userId, count] of topUsers) {
        let username = userId;
        if (userId !== 'anonymous') {
          try {
            const [userRows] = await pool.query("SELECT username, name FROM users WHERE id = ? LIMIT 1", [userId]);
            if (userRows.length > 0) {
              username = userRows[0].name || userRows[0].username;
            }
          } catch (err) {
            console.error('Failed to get username:', err);
          }
        }
        topUsersWithNames.push({ userId, username, count });
      }

      const topIps = Array.from(ipStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }));

      const topPaths = Array.from(pathStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path, count }));

      const totalRequests = recentRequests.length;
      const uniqueUsers = userStats.size;
      const uniqueIps = ipStats.size;
      const avgRequestsPerUser = uniqueUsers > 0 ? Math.round(totalRequests / uniqueUsers) : 0;

      res.json({
        totalRequests,
        uniqueUsers,
        uniqueIps,
        avgRequestsPerUser,
        topUsers: topUsersWithNames,
        topIps,
        topPaths,
        hourlyStats,
        timestamp: now.getTime()
      });
    } catch (error) {
      console.error('Failed to get access monitor info:', error);
      res.status(500).json({ message: '获取访问监控信息失败' });
    }
  });

  app.get("/api/system/file-monitor", authRequired, adminRequired, async (req, res) => {
    try {
      const { pool } = req.app.locals;
      const timeRange = req.query.timeRange || '1h';
      const startTimeParam = req.query.startTime;
      const endTimeParam = req.query.endTime;
      
      let recentOperations;
      let now = new Date();
      
      if (timeRange === 'custom' && startTimeParam && endTimeParam) {
        const startTime = new Date(parseInt(startTimeParam));
        const endTime = new Date(parseInt(endTimeParam));
        const [dbLogs] = await pool.query(
          "SELECT * FROM file_operation_logs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT 100",
          [startTime, endTime]
        );
        
        recentOperations = dbLogs.map(row => ({
          id: row.id,
          operationType: row.operation_type,
          fileId: row.file_id,
          folderId: row.folder_id,
          filename: row.file_name,
          fileSize: row.file_size,
          fileCategory: row.file_category,
          userId: row.user_id,
          ip: row.ip,
          parentPath: row.parent_path,
          timestamp: row.created_at.getTime()
        }));
      } else {
        let startTime;
        now = new Date();
        if (timeRange === 'realtime') {
          startTime = new Date(Date.now() - 10 * 60 * 1000);
        } else if (timeRange === '1h') {
          startTime = new Date(Date.now() - 60 * 60 * 1000);
        } else if (timeRange === '6h') {
          startTime = new Date(Date.now() - 6 * 60 * 60 * 1000);
        } else if (timeRange === '12h') {
          startTime = new Date(Date.now() - 12 * 60 * 60 * 1000);
        } else if (timeRange === '24h') {
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        } else {
          startTime = new Date(Date.now() - 60 * 60 * 1000);
        }
        
        const [dbLogs] = await pool.query(
          "SELECT * FROM file_operation_logs WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100",
          [startTime]
        );
        
        recentOperations = dbLogs.map(row => ({
          id: row.id,
          operationType: row.operation_type,
          fileId: row.file_id,
          folderId: row.folder_id,
          filename: row.file_name,
          fileSize: row.file_size,
          fileCategory: row.file_category,
          userId: row.user_id,
          ip: row.ip,
          parentPath: row.parent_path,
          timestamp: row.created_at.getTime()
        }));
      }

      const uploadCount = recentOperations.filter(op => op.operationType === 'upload').length;
      const downloadCount = recentOperations.filter(op => op.operationType === 'download').length;
      const deleteCount = recentOperations.filter(op => op.operationType === 'delete').length;
      const shareDownloadCount = recentOperations.filter(op => op.operationType === 'share_download').length;
      const shareVisitCount = recentOperations.filter(op => op.operationType === 'share_visit').length;
      const totalCount = recentOperations.length;

      // 获取总文件数和总目录数
      let totalFileCount = 0;
      let totalFolderCount = 0;
      let textCount = 0;
      let imageCount = 0;
      let audioCount = 0;
      let videoCount = 0;
      let archiveCount = 0;
      let programCount = 0;
      let otherCount = 0;
      let todayNewCount = 0;
      let yesterdayNewCount = 0;
      
      try {
        // 查询未删除的文件（deleted_at IS NULL 表示未删除）
        const [fileRows] = await pool.query("SELECT COUNT(*) as count FROM files WHERE deleted_at IS NULL");
        totalFileCount = fileRows[0].count;
        
        // 查询文件夹（deleted_at IS NULL 表示未删除）
        const [folderRows] = await pool.query("SELECT COUNT(*) as count FROM folders WHERE deleted_at IS NULL");
        totalFolderCount = folderRows[0].count;
        
        // 计算今日和昨日的开始时间
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        
        // 查询今日新增文件数
        const [todayRows] = await pool.query(
          "SELECT COUNT(*) as count FROM files WHERE deleted_at IS NULL AND created_at >= ?",
          [todayStart]
        );
        todayNewCount = todayRows[0].count;
        
        // 查询昨日新增文件数
        const [yesterdayRows] = await pool.query(
          "SELECT COUNT(*) as count FROM files WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?",
          [yesterdayStart, yesterdayEnd]
        );
        yesterdayNewCount = yesterdayRows[0].count;
        
        // 获取文件分类统计
        const [categoryRows] = await pool.query(
          "SELECT file_category, COUNT(*) as count FROM files WHERE deleted_at IS NULL GROUP BY file_category"
        );
        
        categoryRows.forEach(row => {
          const category = row.file_category || 'other';
          const count = row.count;
          
          switch (category) {
            case 'doc':
            case 'text':
              textCount += count;
              break;
            case 'image':
              imageCount += count;
              break;
            case 'audio':
              audioCount += count;
              break;
            case 'video':
              videoCount += count;
              break;
            case 'archive':
              archiveCount += count;
              break;
            case 'program':
              programCount += count;
              break;
            default:
              otherCount += count;
          }
        });
      } catch (err) {
        console.error('Failed to get file counts:', err);
      }

      const fileStats = new Map();
      recentOperations.forEach(op => {
        const key = `${op.fileId || op.folderId}-${op.filename}`;
        if (!fileStats.has(key)) {
          fileStats.set(key, {
            filename: op.filename,
            fileType: op.fileCategory || '未知',
            accessCount: 0,
            fileSize: op.fileSize || 0
          });
        }
        const stats = fileStats.get(key);
        stats.accessCount++;
        if (op.fileSize) {
          stats.fileSize = op.fileSize;
        }
      });

      const topFiles = Array.from(fileStats.values())
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, 10);

      const operationsWithUsernames = [];
      for (const op of recentOperations) {
        let username = op.userId;
        try {
          const [userRows] = await pool.query("SELECT username, name FROM users WHERE id = ? LIMIT 1", [op.userId]);
          if (userRows.length > 0) {
            username = userRows[0].name || userRows[0].username;
          }
        } catch (err) {
          console.error('Failed to get username:', err);
        }
        operationsWithUsernames.push({
          ...op,
          user: username
        });
      }

      const statsData = {
        uploadCount,
        downloadCount,
        deleteCount,
        shareDownloadCount,
        shareVisitCount,
        totalCount,
        totalFileCount,
        totalFolderCount,
        todayNewCount,
        yesterdayNewCount,
        textCount,
        imageCount,
        audioCount,
        videoCount,
        archiveCount,
        programCount,
        otherCount,
        recentOperations: operationsWithUsernames.slice(0, 50),
        topFiles,
        timestamp: now.getTime()
      };
      
      // 保存统计数据到数据库（每分钟保存一次）
      try {
        const snapshotTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0);
        await pool.query(
          `INSERT INTO file_monitor_stats 
           (snapshot_time, upload_count, download_count, delete_count, share_download_count, share_visit_count, 
            total_operation_count, total_file_count, total_folder_count, today_new_count, yesterday_new_count,
            text_count, image_count, audio_count, video_count, archive_count, program_count, other_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           upload_count = VALUES(upload_count),
           download_count = VALUES(download_count),
           delete_count = VALUES(delete_count),
           share_download_count = VALUES(share_download_count),
           share_visit_count = VALUES(share_visit_count),
           total_operation_count = VALUES(total_operation_count),
           total_file_count = VALUES(total_file_count),
           total_folder_count = VALUES(total_folder_count),
           today_new_count = VALUES(today_new_count),
           yesterday_new_count = VALUES(yesterday_new_count),
           text_count = VALUES(text_count),
           image_count = VALUES(image_count),
           audio_count = VALUES(audio_count),
           video_count = VALUES(video_count),
           archive_count = VALUES(archive_count),
           program_count = VALUES(program_count),
           other_count = VALUES(other_count)`,
          [
            snapshotTime,
            uploadCount,
            downloadCount,
            deleteCount,
            shareDownloadCount,
            shareVisitCount,
            totalCount,
            totalFileCount,
            totalFolderCount,
            todayNewCount,
            yesterdayNewCount,
            textCount,
            imageCount,
            audioCount,
            videoCount,
            archiveCount,
            programCount,
            otherCount
          ]
        );
      } catch (saveErr) {
        console.error('Failed to save file monitor stats:', saveErr);
      }
      
      res.json(statsData);
    } catch (error) {
      console.error('Failed to get file monitor info:', error);
      res.status(500).json({ message: '获取文件监控信息失败' });
    }
  });

  // 查询文件监控历史统计数据
  app.get("/api/system/file-monitor/history", authRequired, adminRequired, async (req, res) => {
    try {
      const { pool } = req.app.locals;
      const startTimeParam = req.query.startTime;
      const endTimeParam = req.query.endTime;
      
      let query = "SELECT * FROM file_monitor_stats";
      let params = [];
      
      if (startTimeParam && endTimeParam) {
        const startTime = new Date(parseInt(startTimeParam));
        const endTime = new Date(parseInt(endTimeParam));
        query += " WHERE snapshot_time >= ? AND snapshot_time <= ?";
        params.push(startTime, endTime);
      } else if (startTimeParam) {
        const startTime = new Date(parseInt(startTimeParam));
        query += " WHERE snapshot_time >= ?";
        params.push(startTime);
      } else if (endTimeParam) {
        const endTime = new Date(parseInt(endTimeParam));
        query += " WHERE snapshot_time <= ?";
        params.push(endTime);
      }
      
      query += " ORDER BY snapshot_time DESC LIMIT 100";
      
      const [rows] = await pool.query(query, params);
      
      const historyData = rows.map(row => ({
        id: row.id,
        snapshotTime: row.snapshot_time.getTime(),
        uploadCount: row.upload_count,
        downloadCount: row.download_count,
        deleteCount: row.delete_count,
        shareDownloadCount: row.share_download_count,
        shareVisitCount: row.share_visit_count,
        totalOperationCount: row.total_operation_count,
        totalFileCount: row.total_file_count,
        totalFolderCount: row.total_folder_count,
        todayNewCount: row.today_new_count,
        yesterdayNewCount: row.yesterday_new_count,
        textCount: row.text_count,
        imageCount: row.image_count,
        audioCount: row.audio_count,
        videoCount: row.video_count,
        archiveCount: row.archive_count,
        programCount: row.program_count,
        otherCount: row.other_count,
        createdAt: row.created_at.getTime()
      }));
      
      res.json({
        history: historyData,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to get file monitor history:', error);
      res.status(500).json({ message: '获取文件监控历史数据失败' });
    }
  });
};
