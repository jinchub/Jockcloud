// Monitor menu functionality
const monitorAsideList = document.getElementById("monitorAsideList");
const toggleMonitorSidebarBtn = document.getElementById("toggleMonitorSidebarBtn");
const monitorSidebar = document.getElementById("monitorSidebar");
const monitorPanelTitle = document.getElementById("monitorPanelTitle");
const monitorPanelMeta = document.getElementById("monitorPanelMeta");
const monitorSubPanels = {
  system: document.getElementById("monitor-system"),
  resource: document.getElementById("monitor-resource"),
  api: document.getElementById("monitor-api"),
  access: document.getElementById("monitor-access"),
  file: document.getElementById("monitor-file")
};
const MONITOR_MENU_KEYS = ["system", "resource", "api", "access", "file"];
const MONITOR_MENU_KEY_SET = new Set(MONITOR_MENU_KEYS);
const MONITOR_MENU_TITLES = {
  system: "系统监控",
  resource: "资源监控",
  api: "接口监控",
  access: "访问监控",
  file: "文件监控"
};
const MONITOR_MENU_DESCS = {
  system: "实时监控系统运行状态",
  resource: "监控系统资源使用情况",
  api: "监控接口调用情况",
  access: "监控用户访问情况",
  file: "监控文件操作情况"
};
const normalizeMonitorMenuKey = (value, fallback = "system") => {
  const key = String(value || "").trim();
  if (MONITOR_MENU_KEY_SET.has(key)) return key;
  return fallback;
};
const syncMonitorMenuRoute = (replace = false) => {
  const params = new URLSearchParams(window.location.search);
  params.set("main", "monitor");
  params.set("monitorMenu", monitorState.activeMenu);
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
};
const monitorState = {
  activeMenu: "system"
};
const renderMonitorMenu = (activeKey) => {
  const menuItems = monitorAsideList?.querySelectorAll("[data-monitor-menu]");
  menuItems?.forEach((item) => {
    const key = item.dataset.monitorMenu;
    item.classList.toggle("active", key === activeKey);
  });
};
const renderMonitorPanel = (activeKey) => {
  const elMonitorPanelTitle = document.getElementById("monitorPanelTitle");
  const elMonitorPanelMeta = document.getElementById("monitorPanelMeta");
  
  if (elMonitorPanelTitle) elMonitorPanelTitle.textContent = MONITOR_MENU_TITLES[activeKey] || "系统监控";
  if (elMonitorPanelMeta) elMonitorPanelMeta.textContent = MONITOR_MENU_DESCS[activeKey] || "实时监控系统运行状态";
  
  // 动态获取侧边栏元素并处理
  Object.keys(monitorSubPanels).forEach((key) => {
    const el = document.getElementById(`monitor-${key}`);
    if (el) {
      el.style.display = key === activeKey ? "block" : "none";
    }
  });
  renderMonitorMenu(activeKey);
  
  // 绑定刷新按钮事件
  const elSystemRefreshBtn = document.getElementById("refreshSystemMonitorBtn");
  if (elSystemRefreshBtn) {
    elSystemRefreshBtn.onclick = refreshSystemMonitor;
  }
  
  const elResourceRefreshBtn = document.getElementById("refreshResourceMonitorBtn");
  if (elResourceRefreshBtn) {
    elResourceRefreshBtn.onclick = refreshResourceMonitor;
  }
  
  const elApiRefreshBtn = document.getElementById("refreshApiMonitorBtn");
  if (elApiRefreshBtn) {
    elApiRefreshBtn.onclick = refreshApiMonitor;
  }
  
  const elAccessRefreshBtn = document.getElementById("refreshAccessMonitorBtn");
  if (elAccessRefreshBtn) {
    elAccessRefreshBtn.onclick = refreshAccessMonitor;
  }
  
  const elFileRefreshBtn = document.getElementById("refreshFileMonitorBtn");
  if (elFileRefreshBtn) {
    elFileRefreshBtn.onclick = refreshFileMonitor;
  }
  
  // 时间筛选器事件
  const elResourceTimeFilterPreset = document.getElementById("resourceTimeFilterPreset");
  if (elResourceTimeFilterPreset) {
    elResourceTimeFilterPreset.onchange = () => {
      const elTimeRangeCustom = document.getElementById("resourceTimeRangeCustom");
      if (elResourceTimeFilterPreset.value === 'custom') {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'flex';
        // 设置默认时间为最近 5 分钟
        const now = new Date();
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const elStartTime = document.getElementById("resourceStartTime");
        const elEndTime = document.getElementById("resourceEndTime");
        if (elStartTime) {
          // Adjust timezone offset manually for local string
          elStartTime.value = new Date(fiveMinAgo.getTime() - fiveMinAgo.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        if (elEndTime) {
          elEndTime.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
      } else {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'none';
      }
      if (activeKey === "resource") {
        refreshResourceMonitor();
      }
    };
  }

  const elApiTimeFilterPreset = document.getElementById("apiTimeFilterPreset");
  if (elApiTimeFilterPreset) {
    elApiTimeFilterPreset.onchange = () => {
      const elTimeRangeCustom = document.getElementById("apiTimeRangeCustom");
      if (elApiTimeFilterPreset.value === 'custom') {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'flex';
        // 设置默认时间为最近 1 小时
        const now = new Date();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const elStartTime = document.getElementById("apiStartTime");
        const elEndTime = document.getElementById("apiEndTime");
        if (elStartTime) {
          elStartTime.value = oneHourAgo.toISOString().slice(0, 16);
        }
        if (elEndTime) {
          elEndTime.value = now.toISOString().slice(0, 16);
        }
      } else {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'none';
      }
      if (activeKey === "api") {
        refreshApiMonitor();
      }
    };
  }
  
  const elAccessTimeFilterPreset = document.getElementById("accessTimeFilterPreset");
  if (elAccessTimeFilterPreset) {
    elAccessTimeFilterPreset.onchange = () => {
      const elTimeRangeCustom = document.getElementById("accessTimeRangeCustom");
      if (elAccessTimeFilterPreset.value === 'custom') {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'flex';
        // 设置默认时间为最近 1 小时
        const now = new Date();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const elStartTime = document.getElementById("accessStartTime");
        const elEndTime = document.getElementById("accessEndTime");
        if (elStartTime) {
          elStartTime.value = oneHourAgo.toISOString().slice(0, 16);
        }
        if (elEndTime) {
          elEndTime.value = now.toISOString().slice(0, 16);
        }
      } else {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'none';
      }
      if (activeKey === "access") {
        refreshAccessMonitor();
      }
    };
  }
  
  const elFileTimeFilterPreset = document.getElementById("fileTimeFilterPreset");
  if (elFileTimeFilterPreset) {
    elFileTimeFilterPreset.onchange = () => {
      const elTimeRangeCustom = document.getElementById("fileTimeRangeCustom");
      if (elFileTimeFilterPreset.value === 'custom') {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'flex';
        // 设置默认时间为最近 1 小时
        const now = new Date();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const elStartTime = document.getElementById("fileStartTime");
        const elEndTime = document.getElementById("fileEndTime");
        if (elStartTime) {
          elStartTime.value = oneHourAgo.toISOString().slice(0, 16);
        }
        if (elEndTime) {
          elEndTime.value = now.toISOString().slice(0, 16);
        }
      } else {
        if (elTimeRangeCustom) elTimeRangeCustom.style.display = 'none';
      }
      if (activeKey === "file") {
        refreshFileMonitor();
        startFileMonitorAutoRefresh();
      }
    };
  }
  
  // Start/stop auto-refresh and timers based on active menu
  if (activeKey === "system") {
    stopResourceMonitorAutoRefresh();
    stopApiMonitorAutoRefresh();
    stopAccessMonitorAutoRefresh();
    stopFileMonitorAutoRefresh();
    refreshSystemMonitor();
    startSystemMonitorAutoRefresh();
  } else if (activeKey === "resource") {
    stopSystemMonitorAutoRefresh();
    stopApiMonitorAutoRefresh();
    stopAccessMonitorAutoRefresh();
    stopFileMonitorAutoRefresh();
    stopUptimeTimer();
    refreshResourceMonitor();
    startResourceMonitorAutoRefresh();
  } else if (activeKey === "api") {
    stopSystemMonitorAutoRefresh();
    stopResourceMonitorAutoRefresh();
    stopAccessMonitorAutoRefresh();
    stopFileMonitorAutoRefresh();
    stopUptimeTimer();
    setupApiTableSorting();
    refreshApiMonitor();
    startApiMonitorAutoRefresh();
  } else if (activeKey === "access") {
    stopSystemMonitorAutoRefresh();
    stopResourceMonitorAutoRefresh();
    stopApiMonitorAutoRefresh();
    stopFileMonitorAutoRefresh();
    stopUptimeTimer();
    refreshAccessMonitor();
    startAccessMonitorAutoRefresh();
  } else if (activeKey === "file") {
    stopSystemMonitorAutoRefresh();
    stopResourceMonitorAutoRefresh();
    stopApiMonitorAutoRefresh();
    stopAccessMonitorAutoRefresh();
    stopUptimeTimer();
    refreshFileMonitor();
    startFileMonitorAutoRefresh();
  } else {
    stopSystemMonitorAutoRefresh();
    stopResourceMonitorAutoRefresh();
    stopApiMonitorAutoRefresh();
    stopAccessMonitorAutoRefresh();
    stopFileMonitorAutoRefresh();
    stopUptimeTimer();
  }
};
if (monitorAsideList) {
  monitorAsideList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-monitor-menu]");
    if (!target) return;
    const menuKey = normalizeMonitorMenuKey(target.dataset.monitorMenu, monitorState.activeMenu);
    monitorState.activeMenu = menuKey;
    renderMonitorPanel(menuKey);
    syncMonitorMenuRoute();
  });
}
if (toggleMonitorSidebarBtn && monitorSidebar) {
  toggleMonitorSidebarBtn.addEventListener("click", () => {
    monitorSidebar.classList.toggle("collapsed");
    const icon = toggleMonitorSidebarBtn.querySelector("i");
    if (icon) {
      icon.className = monitorSidebar.classList.contains("collapsed") ? "fa-solid fa-angles-right" : "fa-solid fa-angles-left";
    }
  });
}

// System monitor functionality
const platformLabels = {
  'aix': 'AIX',
  'darwin': 'macOS',
  'freebsd': 'FreeBSD',
  'linux': 'Linux',
  'openbsd': 'OpenBSD',
  'sunos': 'SunOS',
  'win32': 'Windows'
};

let systemUptimeSeconds = 0;
let systemInfoTimestamp = 0;
let uptimeInterval = null;

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

const startUptimeTimer = () => {
  if (uptimeInterval) clearInterval(uptimeInterval);
  uptimeInterval = setInterval(() => {
    systemUptimeSeconds++;
    const elUptime = document.getElementById("monitorUptime");
    if (elUptime) {
      elUptime.textContent = formatUptime(systemUptimeSeconds);
    }
  }, 1000);
};

const stopUptimeTimer = () => {
  if (uptimeInterval) {
    clearInterval(uptimeInterval);
    uptimeInterval = null;
  }
};

const loadSystemInfo = async () => {
  try {
    // 动态获取元素引用
    const elRefreshBtn = document.getElementById("refreshSystemMonitorBtn");
    const elServerStatus = document.getElementById("monitorServerStatus");
    const elServerLastCheck = document.getElementById("monitorServerLastCheck");
    const elSystemVersion = document.getElementById("monitorSystemVersion");
    const elUptime = document.getElementById("monitorUptime");
    const elNodeVersion = document.getElementById("nodeVersion");
    const elPlatformInfo = document.getElementById("platformInfo");
    const elArchInfo = document.getElementById("archInfo");
    const elStartTime = document.getElementById("startTime");
    const elServerPort = document.getElementById("serverPort");
    const elProgramDir = document.getElementById("programDir");
    const elJsBuildTime = document.getElementById("jsBuildTime");
    const elMemoryUsage = document.getElementById("memoryUsage");
    
    const res = await request("/api/system/info");
    if (!res.ok) {
      throw new Error("获取系统信息失败");
    }
    const data = await res.json();
    
    systemUptimeSeconds = data.uptimeSeconds || 0;
    systemInfoTimestamp = data.timestamp;
    
    if (elSystemVersion) elSystemVersion.textContent = data.systemVersion || "1.0.0";
    if (elServerStatus) elServerStatus.textContent = "运行中";
    if (elServerLastCheck) elServerLastCheck.textContent = `最后检查：${new Date(data.timestamp).toLocaleString()}`;
    if (elUptime) elUptime.textContent = data.uptime;
    if (elNodeVersion) elNodeVersion.textContent = data.nodeVersion;
    if (elPlatformInfo) elPlatformInfo.textContent = platformLabels[data.platform] || data.platform;
    if (elArchInfo) elArchInfo.textContent = data.arch;
    if (elStartTime) elStartTime.textContent = data.appStartTime ? new Date(data.appStartTime).toLocaleString() : "未知";
    if (elServerPort) elServerPort.textContent = data.serverPort || "未知";
    if (elProgramDir) elProgramDir.textContent = data.programDir || "未知";
    if (elJsBuildTime) {
      let timeStr = data.jsBuildTime ? new Date(data.jsBuildTime).toLocaleString() : "未知";
      if (data.jsLatestFile) {
        timeStr += ` (${data.jsLatestFile})`;
      }
      elJsBuildTime.textContent = timeStr;
    }
    if (elMemoryUsage) elMemoryUsage.textContent = `${data.memory.used} / ${data.memory.total}`;
    
    startUptimeTimer();
    
    return data;
  } catch (error) {
    console.error("Failed to load system info:", error);
    const elServerStatus = document.getElementById("monitorServerStatus");
    if (elServerStatus) {
      elServerStatus.textContent = "异常";
      elServerStatus.style.color = "#f53f3f";
    }
    stopUptimeTimer();
    return null;
  }
};

const loadOnlineUsers = async () => {
  try {
    const elOnlineUsers = document.getElementById("monitorOnlineUsers");
    const elTotalUsers = document.getElementById("monitorTotalUsers");
    const res = await request("/api/online-users");
    // 无论响应状态如何，都尝试解析 JSON
    let data;
    try {
      data = await res.json();
    } catch (parseError) {
      console.error("Failed to parse response:", parseError);
      data = { onlineCount: 0, totalCount: 0 };
    }
    
    // 显示在线用户数量和总用户数
    if (elOnlineUsers) {
      const count = data && typeof data.onlineCount === 'number' ? data.onlineCount : 0;
      elOnlineUsers.textContent = count;
    }
    if (elTotalUsers) {
      const count = data && typeof data.totalCount === 'number' ? data.totalCount : 0;
      elTotalUsers.textContent = count;
    }
    
  } catch (error) {
    console.error("Failed to load online users:", error);
    const elOnlineUsers = document.getElementById("monitorOnlineUsers");
    const elTotalUsers = document.getElementById("monitorTotalUsers");
    if (elOnlineUsers) {
      elOnlineUsers.textContent = "0";
    }
    if (elTotalUsers) {
      elTotalUsers.textContent = "0";
    }
  }
};

const refreshSystemMonitor = async () => {
  const elRefreshBtn = document.getElementById("refreshSystemMonitorBtn");
  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.add("fa-spin");
  }
  
  await Promise.all([loadSystemInfo(), loadOnlineUsers()]);
  
  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.remove("fa-spin");
  }
};

// Auto-refresh system monitor every 30 seconds
let systemMonitorInterval = null;
const startSystemMonitorAutoRefresh = () => {
  if (systemMonitorInterval) clearInterval(systemMonitorInterval);
  systemMonitorInterval = setInterval(refreshSystemMonitor, 30000);
};
const stopSystemMonitorAutoRefresh = () => {
  if (systemMonitorInterval) {
    clearInterval(systemMonitorInterval);
    systemMonitorInterval = null;
  }
  stopUptimeTimer();
};

// Resource monitor functionality
let resourceMonitorInterval = null;

let resourceCharts = {
  cpu: null,
  memory: null,
  disk: null,
  network: null
};

const formatBytesLocal = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const initResourceCharts = () => {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'top' } },
    scales: {
      x: { 
        display: true, grid: { display: false },
        ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true, display: true }
      }
    }
  };

  const createChart = (id, label, color, isBytes = false, yMax = 100) => {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    
    const options = JSON.parse(JSON.stringify(commonOptions));
    options.plugins.tooltip = {
      mode: 'index', intersect: false,
      callbacks: {
        label: function(context) {
          let val = context.parsed.y;
          return context.dataset.label + ': ' + (isBytes ? formatBytesLocal(val) + '/s' : val + '%');
        }
      }
    };
    options.scales.y = {
      beginAtZero: true,
      max: yMax,
      ticks: {
        callback: function(value) { return isBytes ? formatBytesLocal(value) + '/s' : value + '%'; }
      }
    };
    
    if (id === 'networkChart') {
      delete options.scales.y.max;
      return new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [
          { label: '上传 (发送)', data: [], borderColor: '#165dff', backgroundColor: 'rgba(22, 93, 255, 0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true },
          { label: '下载 (接收)', data: [], borderColor: '#00b42a', backgroundColor: 'rgba(0, 180, 42, 0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true }
        ]},
        options
      });
    } else {
      return new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [
          { label: label, data: [], borderColor: color, backgroundColor: color.replace(')', ', 0.1)').replace('rgb', 'rgba'), borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true }
        ]},
        options
      });
    }
  };

  if (resourceCharts.cpu) resourceCharts.cpu.destroy();
  if (resourceCharts.memory) resourceCharts.memory.destroy();
  if (resourceCharts.disk) resourceCharts.disk.destroy();
  if (resourceCharts.network) resourceCharts.network.destroy();

  resourceCharts.cpu = createChart('cpuChart', 'CPU 使用率', 'rgb(22, 93, 255)', false, 100);
  resourceCharts.memory = createChart('memoryChart', '内存使用率', 'rgb(255, 125, 0)', false, 100);
  resourceCharts.disk = createChart('diskChart', '磁盘使用率', 'rgb(245, 63, 63)', false, 100);
  resourceCharts.network = createChart('networkChart', '网络吞吐量', '', true, null);
};

const updateResourceCharts = (metrics, startTime, endTime) => {
  const dataList = metrics || [];
  
  const numBuckets = 60;
  const interval = Math.max(1, (endTime - startTime) / numBuckets);
  
  const labels = [];
  const cpuData = Array(numBuckets).fill(null);
  const memoryData = Array(numBuckets).fill(null);
  const diskData = Array(numBuckets).fill(null);
  const txData = Array(numBuckets).fill(null);
  const rxData = Array(numBuckets).fill(null);
  
  for (let i = 0; i < numBuckets; i++) {
    const bucketTime = startTime + i * interval;
    labels.push(new Date(bucketTime).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }
  
  dataList.forEach(m => {
    if (m.timestamp < startTime || m.timestamp > endTime) return;
    const bucketIdx = Math.min(numBuckets - 1, Math.floor((m.timestamp - startTime) / interval));
    cpuData[bucketIdx] = m.cpu;
    memoryData[bucketIdx] = m.memory;
    diskData[bucketIdx] = m.disk;
    txData[bucketIdx] = m.tx;
    rxData[bucketIdx] = m.rx;
  });

  if (resourceCharts.cpu) {
    resourceCharts.cpu.data.labels = labels;
    resourceCharts.cpu.data.datasets[0].data = cpuData;
    resourceCharts.cpu.update();
  }
  if (resourceCharts.memory) {
    resourceCharts.memory.data.labels = labels;
    resourceCharts.memory.data.datasets[0].data = memoryData;
    resourceCharts.memory.update();
  }
  if (resourceCharts.disk) {
    resourceCharts.disk.data.labels = labels;
    resourceCharts.disk.data.datasets[0].data = diskData;
    resourceCharts.disk.update();
  }
  if (resourceCharts.network) {
    resourceCharts.network.data.labels = labels;
    resourceCharts.network.data.datasets[0].data = txData;
    resourceCharts.network.data.datasets[1].data = rxData;
    resourceCharts.network.update();
  }
};

const getProgressBarColor = (percent) => {
  if (percent < 50) return '#00b42a';
  if (percent < 80) return '#ff7d00';
  return '#f53f3f';
};

const loadResourceInfo = async () => {
  try {
    const elCpuUsage = document.getElementById("cpuUsageValue");
    const elCpuProgress = document.getElementById("cpuProgressBar");
    const elCpuDetails = document.getElementById("cpuDetails");
    const elMemoryUsage = document.getElementById("memoryUsageValue");
    const elMemoryProgress = document.getElementById("memoryProgressBar");
    const elMemoryDetails = document.getElementById("memoryDetails");
    const elDiskUsage = document.getElementById("diskUsageValue");
    const elDiskProgress = document.getElementById("diskProgressBar");
    const elDiskDetails = document.getElementById("diskDetails");
    const elSystemStatus = document.getElementById("systemStatusValue");
    const elLastUpdate = document.getElementById("lastUpdateTime");
    const elDetailTableBody = document.getElementById("resourceDetailTableBody");

    const res = await request("/api/system/resource");
    if (!res.ok) {
      throw new Error("获取资源信息失败");
    }
    const data = await res.json();

    if (elCpuUsage) elCpuUsage.textContent = `${data.cpu.usage}%`;
    if (elCpuProgress) {
      elCpuProgress.style.width = `${data.cpu.usage}%`;
      elCpuProgress.style.background = getProgressBarColor(data.cpu.usage);
    }
    if (elCpuDetails) elCpuDetails.textContent = `核心数: ${data.cpu.cores}`;

    if (elMemoryUsage) elMemoryUsage.textContent = `${data.memory.usage}%`;
    if (elMemoryProgress) {
      elMemoryProgress.style.width = `${data.memory.usage}%`;
      elMemoryProgress.style.background = getProgressBarColor(data.memory.usage);
    }
    if (elMemoryDetails) elMemoryDetails.textContent = `已用: ${data.memory.used} / 总计: ${data.memory.total}`;

    if (elDiskUsage) elDiskUsage.textContent = `${data.disk.usage}%`;
    if (elDiskProgress) {
      elDiskProgress.style.width = `${data.disk.usage}%`;
      elDiskProgress.style.background = getProgressBarColor(data.disk.usage);
    }
    if (elDiskDetails) elDiskDetails.textContent = `已用: ${data.disk.used} / 总计: ${data.disk.total}`;

    if (elSystemStatus) {
      elSystemStatus.textContent = "正常";
      elSystemStatus.style.color = "#00b42a";
    }
    if (elLastUpdate) elLastUpdate.textContent = `最后更新: ${new Date(data.timestamp).toLocaleString()}`;

    if (!resourceCharts.cpu) {
      initResourceCharts();
    }
    
    // Fetch metrics history
    let startTime = 0;
    let endTime = Date.now();
    const preset = document.getElementById("resourceTimeFilterPreset") ? document.getElementById("resourceTimeFilterPreset").value : "5m";
    if (preset === "custom") {
      const customStart = document.getElementById("resourceStartTime").value;
      const customEnd = document.getElementById("resourceEndTime").value;
      if (customStart) startTime = new Date(customStart).getTime();
      if (customEnd) endTime = new Date(customEnd).getTime();
    } else {
      const rangeMap = {
        "5m": 5 * 60 * 1000,
        "30m": 30 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000
      };
      startTime = endTime - (rangeMap[preset] || rangeMap["5m"]);
    }
    
    const metricsRes = await request(`/api/system/metrics?startTime=${startTime}&endTime=${endTime}`);
    if (metricsRes.ok) {
      const metricsData = await metricsRes.json();
      updateResourceCharts(metricsData, startTime, endTime);
    }

    if (elDetailTableBody) {
      let networkInterfacesHtml = '';
      if (data.network && data.network.interfaces) {
        Object.keys(data.network.interfaces).forEach(ifaceName => {
          const ifaceDetails = data.network.interfaces[ifaceName];
          const ipv4Info = ifaceDetails.find(details => details.family === 'IPv4' && !details.internal);
          if (ipv4Info) {
            networkInterfacesHtml += `<tr><td>网卡 IP (${ifaceName})</td><td>${ipv4Info.address}</td></tr>`;
          }
        });
      }
      
      elDetailTableBody.innerHTML = `
        <tr><td>网络速度 (发送)</td><td style="color: #165dff; font-weight: bold;">${data.network.txSpeedStr || '0 B/s'}</td></tr>
        <tr><td>网络速度 (接收)</td><td style="color: #00b42a; font-weight: bold;">${data.network.rxSpeedStr || '0 B/s'}</td></tr>
        ${networkInterfacesHtml}
        <tr><td>CPU 型号</td><td>${data.cpu.model || '未知'}</td></tr>
        <tr><td>内存详情</td><td>已用: ${data.memory.used} / 总计: ${data.memory.total} / 空闲: ${data.memory.free}</td></tr>
        <tr><td>磁盘挂载点</td><td>${data.disk.mount}</td></tr>
        <tr><td>磁盘详情</td><td>已用: ${data.disk.used} / 总计: ${data.disk.total} / 空闲: ${data.disk.free}</td></tr>
        <tr><td>主机名</td><td>${data.network.hostname}</td></tr>
      `;
    }

    return data;
  } catch (error) {
    console.error("Failed to load resource info:", error);
    const elSystemStatus = document.getElementById("systemStatusValue");
    if (elSystemStatus) {
      elSystemStatus.textContent = "异常";
      elSystemStatus.style.color = "#f53f3f";
    }
    return null;
  }
};

const refreshResourceMonitor = async () => {
  const elRefreshBtn = document.getElementById("refreshResourceMonitorBtn");
  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.add("fa-spin");
  }

  await loadResourceInfo();

  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.remove("fa-spin");
  }
};

const startResourceMonitorAutoRefresh = () => {
  if (resourceMonitorInterval) clearInterval(resourceMonitorInterval);
  resourceMonitorInterval = setInterval(refreshResourceMonitor, 6000);
};

const stopResourceMonitorAutoRefresh = () => {
  if (resourceMonitorInterval) {
    clearInterval(resourceMonitorInterval);
    resourceMonitorInterval = null;
  }
};

// API monitor functionality
let apiMonitorInterval = null;

const getStatusCodeClass = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return 'status-success';
  if (statusCode >= 300 && statusCode < 400) return 'status-warning';
  if (statusCode >= 400 && statusCode < 500) return 'status-warning';
  return 'status-error';
};

const getMethodClass = (method) => {
  const methodLower = method.toLowerCase();
  if (methodLower === 'get') return 'method-get';
  if (methodLower === 'post') return 'method-post';
  if (methodLower === 'put') return 'method-put';
  if (methodLower === 'delete') return 'method-delete';
  return 'method-other';
};

let apiMonitorSortField = 'timestamp';
let apiMonitorSortDirection = 'desc';
let apiMonitorRecentData = [];
let apiRecentPage = 1;
let apiRecentPerPage = 10;

const renderApiRecentRequests = (requests, page, perPage) => {
  const elRecentRequestsBody = document.getElementById("apiRecentRequestsTableBody");
  const elPageInfo = document.getElementById("apiRecentPageInfo");
  const elSummary = document.getElementById("apiRecentPaginationSummary");
  const elPrevBtn = document.getElementById("apiRecentPrevBtn");
  const elNextBtn = document.getElementById("apiRecentNextBtn");
  
  if (!elRecentRequestsBody) return;
  
  const totalPages = Math.ceil(requests.length / perPage);
  const startIdx = (page - 1) * perPage;
  const endIdx = startIdx + perPage;
  const pageData = requests.slice(startIdx, endIdx);
  
  if (pageData.length === 0) {
    elRecentRequestsBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">暂无数据</td></tr>';
  } else {
    elRecentRequestsBody.innerHTML = pageData.map(request => `
      <tr>
        <td>${new Date(request.timestamp).toLocaleString()}</td>
        <td><span class="api-method ${getMethodClass(request.method)}">${request.method}</span></td>
        <td><span class="api-endpoint">${request.url}</span></td>
        <td><span class="${getStatusCodeClass(request.statusCode)}">${request.statusCode}</span></td>
        <td>${request.durationMs} ms</td>
      </tr>
    `).join('');
  }
  
  // 更新分页信息
  if (elSummary) {
    const start = requests.length > 0 ? startIdx + 1 : 0;
    const end = Math.min(endIdx, requests.length);
    elSummary.textContent = `共 ${requests.length} 条，当前 ${start}-${end}`;
  }
  
  if (elPageInfo) {
    elPageInfo.textContent = `${page} / ${totalPages || 1}`;
  }
  
  // 更新按钮状态
  if (elPrevBtn) elPrevBtn.disabled = page <= 1;
  if (elNextBtn) elNextBtn.disabled = page >= totalPages;
};

const setupApiRecentPagination = () => {
  const elPrevBtn = document.getElementById("apiRecentPrevBtn");
  const elNextBtn = document.getElementById("apiRecentNextBtn");
  const elPageSizeSelect = document.getElementById("apiRecentPageSizeSelect");
  
  if (elPrevBtn) {
    elPrevBtn.onclick = () => {
      if (apiRecentPage > 1) {
        apiRecentPage--;
        const sortedData = sortApiRequests(apiMonitorRecentData, apiMonitorSortField, apiMonitorSortDirection);
        renderApiRecentRequests(sortedData, apiRecentPage, apiRecentPerPage);
      }
    };
  }
  
  if (elNextBtn) {
    elNextBtn.onclick = () => {
      const totalPages = Math.ceil(apiMonitorRecentData.length / apiRecentPerPage);
      if (apiRecentPage < totalPages) {
        apiRecentPage++;
        const sortedData = sortApiRequests(apiMonitorRecentData, apiMonitorSortField, apiMonitorSortDirection);
        renderApiRecentRequests(sortedData, apiRecentPage, apiRecentPerPage);
      }
    };
  }
  
  if (elPageSizeSelect) {
    elPageSizeSelect.onchange = () => {
      apiRecentPerPage = parseInt(elPageSizeSelect.value);
      apiRecentPage = 1;
      const sortedData = sortApiRequests(apiMonitorRecentData, apiMonitorSortField, apiMonitorSortDirection);
      renderApiRecentRequests(sortedData, apiRecentPage, apiRecentPerPage);
    };
  }
};

const sortApiRequests = (requests, field, direction) => {
  return [...requests].sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];
    
    if (field === 'timestamp') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    } else if (field === 'statusCode' || field === 'durationMs') {
      aVal = Number(aVal);
      bVal = Number(bVal);
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
};

const updateApiSortIcons = () => {
  const table = document.getElementById("apiRecentRequestsTable");
  if (!table) return;
  
  const headers = table.querySelectorAll('th.sortable');
  headers.forEach(th => {
    const field = th.getAttribute('data-sort');
    th.classList.remove('sorted', 'sorted-asc', 'sorted-desc');
    
    if (field === apiMonitorSortField) {
      th.classList.add('sorted');
      th.classList.add(apiMonitorSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
};

const setupApiTableSorting = () => {
  const table = document.getElementById("apiRecentRequestsTable");
  if (!table) return;
  
  const headers = table.querySelectorAll('th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (apiMonitorSortField === field) {
        apiMonitorSortDirection = apiMonitorSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        apiMonitorSortField = field;
        apiMonitorSortDirection = 'desc';
      }
      
      updateApiSortIcons();
      
      if (apiMonitorRecentData.length > 0) {
        apiRecentPage = 1;
        const sortedData = sortApiRequests(apiMonitorRecentData, apiMonitorSortField, apiMonitorSortDirection);
        renderApiRecentRequests(sortedData, apiRecentPage, apiRecentPerPage);
      }
    });
  });
};

const loadApiMonitorInfo = async () => {
  try {
    const elTotalRequests = document.getElementById("apiTotalRequests");
    const elSuccessRate = document.getElementById("apiSuccessRate");
    const elAvgResponseTime = document.getElementById("apiAvgResponseTime");
    const elErrorRequests = document.getElementById("apiErrorRequests");
    const elTopEndpointsBody = document.getElementById("apiTopEndpointsTableBody");
    const elRecentRequestsBody = document.getElementById("apiRecentRequestsTableBody");
    const elTimeFilterPreset = document.getElementById("apiTimeFilterPreset");
    
    let timeRange = '1h';
    let startTime = null;
    let endTime = null;
    
    if (elTimeFilterPreset) {
      timeRange = elTimeFilterPreset.value;
      
      if (timeRange === 'custom') {
        const elStartTime = document.getElementById("apiStartTime");
        const elEndTime = document.getElementById("apiEndTime");
        if (elStartTime && elEndTime && elStartTime.value && elEndTime.value) {
          startTime = new Date(elStartTime.value).getTime();
          endTime = new Date(elEndTime.value).getTime();
        }
      }
    }

    let url = `/api/system/api-monitor?timeRange=${encodeURIComponent(timeRange)}`;
    if (startTime && endTime) {
      url += `&startTime=${startTime}&endTime=${endTime}`;
    }
    
    const res = await request(url);
    if (!res.ok) {
      throw new Error("获取接口监控信息失败");
    }
    const data = await res.json();

    if (elTotalRequests) elTotalRequests.textContent = data.totalRequests;
    if (elSuccessRate) elSuccessRate.textContent = `${data.successRate}%`;
    if (elAvgResponseTime) elAvgResponseTime.textContent = `${data.avgResponseTime} ms`;
    if (elErrorRequests) elErrorRequests.textContent = data.errorRequests;

    if (elTopEndpointsBody) {
      elTopEndpointsBody.innerHTML = data.topEndpoints.map(endpoint => `
        <tr>
          <td><span class="api-endpoint">${endpoint.endpoint}</span></td>
          <td>${endpoint.count}</td>
          <td>${endpoint.avgDuration} ms</td>
          <td><span style="color: ${endpoint.successRate >= 90 ? '#00b42a' : endpoint.successRate >= 70 ? '#ff7d00' : '#f53f3f'}">${endpoint.successRate}%</span></td>
        </tr>
      `).join('');
    }

    if (elRecentRequestsBody) {
      apiMonitorRecentData = data.recentRequests || [];
      apiRecentPage = 1;
      const sortedData = sortApiRequests(apiMonitorRecentData, apiMonitorSortField, apiMonitorSortDirection);
      renderApiRecentRequests(sortedData, apiRecentPage, apiRecentPerPage);
      updateApiSortIcons();
      setupApiRecentPagination();
    }

    return data;
  } catch (error) {
    console.error("Failed to load api monitor info:", error);
    return null;
  }
};

const refreshApiMonitor = async () => {
  const elRefreshBtn = document.getElementById("refreshApiMonitorBtn");
  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.add("fa-spin");
  }

  await loadApiMonitorInfo();

  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.remove("fa-spin");
  }
};

const startApiMonitorAutoRefresh = () => {
  if (apiMonitorInterval) clearInterval(apiMonitorInterval);
  
  const elTimeFilter = document.getElementById("apiTimeFilterPreset");
  const timeRange = elTimeFilter ? elTimeFilter.value : '1h';
  
  if (timeRange === 'realtime') {
    apiMonitorInterval = setInterval(refreshApiMonitor, 5000);
  }
};

const stopApiMonitorAutoRefresh = () => {
  if (apiMonitorInterval) {
    clearInterval(apiMonitorInterval);
    apiMonitorInterval = null;
  }
};

// Access monitor functionality
let accessMonitorInterval = null;

const loadAccessMonitorInfo = async () => {
  try {
    const elTotalRequests = document.getElementById("accessTotalRequests");
    const elUniqueUsers = document.getElementById("accessUniqueUsers");
    const elUniqueIps = document.getElementById("accessUniqueIps");
    const elAvgPerUser = document.getElementById("accessAvgPerUser");
    const elTopUsersBody = document.getElementById("accessTopUsersTableBody");
    const elTopIpsBody = document.getElementById("accessTopIpsTableBody");
    const elTopPathsBody = document.getElementById("accessTopPathsTableBody");
    const elTimeFilterPreset = document.getElementById("accessTimeFilterPreset");
    
    let timeRange = '1h';
    let startTime = null;
    let endTime = null;
    
    if (elTimeFilterPreset) {
      timeRange = elTimeFilterPreset.value;
      
      if (timeRange === 'custom') {
        const elStartTime = document.getElementById("accessStartTime");
        const elEndTime = document.getElementById("accessEndTime");
        if (elStartTime && elEndTime && elStartTime.value && elEndTime.value) {
          startTime = new Date(elStartTime.value).getTime();
          endTime = new Date(elEndTime.value).getTime();
        }
      }
    }

    let url = `/api/system/access-monitor?timeRange=${encodeURIComponent(timeRange)}`;
    if (startTime && endTime) {
      url += `&startTime=${startTime}&endTime=${endTime}`;
    }
    
    const res = await request(url);
    if (!res.ok) {
      throw new Error("获取访问监控信息失败");
    }
    const data = await res.json();

    if (elTotalRequests) elTotalRequests.textContent = data.totalRequests;
    if (elUniqueUsers) elUniqueUsers.textContent = data.uniqueUsers;
    if (elUniqueIps) elUniqueIps.textContent = data.uniqueIps;
    if (elAvgPerUser) elAvgPerUser.textContent = data.avgRequestsPerUser;

    if (elTopUsersBody) {
      if (data.topUsers.length === 0) {
        elTopUsersBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: #666;">暂无数据</td></tr>';
      } else {
        elTopUsersBody.innerHTML = data.topUsers.map(user => `
          <tr>
            <td><span class="api-endpoint">${user.username === 'anonymous' ? '未登录用户' : user.username}</span></td>
            <td>${user.count}</td>
          </tr>
        `).join('');
      }
    }

    if (elTopIpsBody) {
      if (data.topIps.length === 0) {
        elTopIpsBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: #666;">暂无数据</td></tr>';
      } else {
        elTopIpsBody.innerHTML = data.topIps.map(ip => `
          <tr>
            <td><span class="api-endpoint">${ip.ip}</span></td>
            <td>${ip.count}</td>
          </tr>
        `).join('');
      }
    }

    const getApiDescription = (path) => {
      const apiDescriptions = {
        '/api/auth/login': '用户登录',
        '/api/auth/captcha': '获取验证码',
        '/api/auth/password-reset/send-code': '发送密码重置验证码',
        '/api/auth/password-reset/reset': '重置密码',
        '/api/auth/sms/send-code': '发送短信验证码',
        '/api/auth/sms/login': '短信登录',
        '/api/auth/logout': '用户登出',
        '/api/auth/me': '获取当前用户信息',
        '/api/auth/view-preference': '更新视图偏好',
        '/api/auth/category-visibility': '更新分类可见性',
        '/api/auth/profile': '更新个人资料',
        '/api/auth/avatar': '上传头像',
        '/api/users': '用户管理列表',
        '/api/user-groups': '用户组列表',
        '/api/stats': '获取存储空间统计',
        '/api/folders': '文件夹管理',
        '/api/folders/:id/path': '获取文件夹路径',
        '/api/quick-access': '快捷方式管理',
        '/api/files': '文件列表',
        '/api/files/:id/zip/entries': '压缩包内容列表',
        '/api/files/:id/zip/entry': '压缩包单文件预览',
        '/api/files/:id/zip/extract': '解压文件',
        '/api/files/:id/download': '文件下载',
        '/api/download/:id': '文件下载',
        '/api/download/batch': '批量下载',
        '/api/download/folder/:id': '文件夹下载',
        '/api/archive/batch': '批量压缩',
        '/api/upload': '文件上传',
        '/api/upload/chunk/init': '分片上传初始化',
        '/api/upload/chunk/:uploadId': '上传分片',
        '/api/upload/chunk/:uploadId/complete': '完成分片上传',
        '/api/upload-tasks': '上传任务管理',
        '/api/sync-tasks': '同步任务管理',
        '/api/sync-tasks/:taskId/start': '开始同步',
        '/api/sync-tasks/:taskId/pause': '暂停同步',
        '/api/sync-tasks/:taskId/run': '执行同步',
        '/api/recycle': '回收站文件列表',
        '/api/recycle/files/:id/restore': '恢复文件',
        '/api/recycle/folders/:id/restore': '恢复文件夹',
        '/api/recycle/files/:id': '删除回收站文件',
        '/api/recycle/folders/:id': '删除回收站文件夹',
        '/api/shares': '分享管理',
        '/api/shares/:shareCode/access-code': '获取分享访问码',
        '/api/share/:shareCode/verify': '验证分享码',
        '/api/share/:shareCode': '获取分享详情',
        '/api/share/:shareCode/entries': '获取分享内容',
        '/api/share/:shareCode/download/file/:fileId': '下载分享文件',
        '/api/share/:shareCode/download/folder/:folderId': '下载分享文件夹',
        '/api/public-settings': '获取公共设置',
        '/api/settings': '系统设置管理',
        '/api/system/info': '系统信息',
        '/api/system/resource': '资源监控',
        '/api/system/api-monitor': '接口监控',
        '/api/system/access-monitor': '访问监控',
        '/api/online-users': '在线用户列表',
        '/api/mounts': '挂载存储管理',
        '/api/mounts/:id/objects': '挂载存储文件列表',
        '/api/mounts/:id/objects/upload': '挂载存储上传',
        '/api/mounts/:id/objects/folder': '挂载存储创建文件夹',
        '/api/mounts/:id/objects/download': '挂载存储下载',
        '/api/mounts/:id/objects/rename': '挂载存储重命名',
        '/api/entries': '条目列表',
        '/api/entries/:type/:id': '获取条目详情',
        '/api/entries/batch': '批量操作条目',
        '/api/preview/:id': '文件预览',
        '/api/hidden-space/status': '隐藏空间状态',
        '/api/hidden-space/setup': '设置隐藏空间',
        '/api/hidden-space/verify': '验证隐藏空间密码',
        '/api/hidden-space/reset-password': '重置隐藏空间密码',
        '/api/hidden-space/reset-password/send-code': '发送隐藏空间密码重置验证码',
        '/api/hidden-space/reset-password/by-sms': '通过短信重置隐藏空间密码',
        '/api/admin/stats': '管理员统计信息'
      };
      
      for (const [apiPath, description] of Object.entries(apiDescriptions)) {
        const normalizedApiPath = apiPath.replace(/:\w+/g, ':id');
        const normalizedPath = path.replace(/\/\d+/g, '/id');
        if (normalizedPath.includes(normalizedApiPath)) {
          return description;
        }
      }
      
      if (path.startsWith('/api/')) {
        const pathParts = path.split('/');
        const module = pathParts[2];
        if (module) {
          const moduleNames = {
            'auth': '认证',
            'users': '用户',
            'files': '文件',
            'folders': '文件夹',
            'upload': '上传',
            'download': '下载',
            'shares': '分享',
            'settings': '设置',
            'system': '系统',
            'recycle': '回收站',
            'mounts': '挂载',
            'preview': '预览',
            'entries': '条目',
            'sync-tasks': '同步任务',
            'upload-tasks': '上传任务',
            'hidden-space': '隐藏空间',
            'admin': '管理',
            'online-users': '在线用户',
            'stats': '统计',
            'quick-access': '快捷访问'
          };
          return `${moduleNames[module] || module}接口`;
        }
      }
      
      return '其他接口';
    };
    
    if (elTopPathsBody) {
      if (data.topPaths.length === 0) {
        elTopPathsBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #666;">暂无数据</td></tr>';
      } else {
        elTopPathsBody.innerHTML = data.topPaths.map(path => `
          <tr>
            <td><span class="api-endpoint">${path.path}</span></td>
            <td style="color: #666;">${getApiDescription(path.path)}</td>
            <td>${path.count}</td>
          </tr>
        `).join('');
      }
    }

    return data;
  } catch (error) {
    console.error("Failed to load access monitor info:", error);
    const elTotalRequests = document.getElementById("accessTotalRequests");
    if (elTotalRequests) elTotalRequests.textContent = '--';
    const elUniqueUsers = document.getElementById("accessUniqueUsers");
    if (elUniqueUsers) elUniqueUsers.textContent = '--';
    const elUniqueIps = document.getElementById("accessUniqueIps");
    if (elUniqueIps) elUniqueIps.textContent = '--';
    const elAvgPerUser = document.getElementById("accessAvgPerUser");
    if (elAvgPerUser) elAvgPerUser.textContent = '--';
    return null;
  }
};

const refreshAccessMonitor = async () => {
  const elRefreshBtn = document.getElementById("refreshAccessMonitorBtn");
  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.add("fa-spin");
  }

  await loadAccessMonitorInfo();

  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.remove("fa-spin");
  }
};

const startAccessMonitorAutoRefresh = () => {
  if (accessMonitorInterval) clearInterval(accessMonitorInterval);
  
  const elTimeFilter = document.getElementById("accessTimeFilterPreset");
  const timeRange = elTimeFilter ? elTimeFilter.value : '1h';
  
  if (timeRange === 'realtime') {
    accessMonitorInterval = setInterval(refreshAccessMonitor, 5000);
  }
};

const stopAccessMonitorAutoRefresh = () => {
  if (accessMonitorInterval) {
    clearInterval(accessMonitorInterval);
    accessMonitorInterval = null;
  }
};

// File monitor functionality
let fileMonitorInterval = null;
let fileRecentPage = 1;
let fileRecentPerPage = 10;
let fileRecentData = [];

let fileOpsChartInstance = null;
let shareOpsChartInstance = null;

const initFileMonitorCharts = () => {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { position: 'top' } },
    scales: {
      x: { 
        display: true, grid: { display: false },
        ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true, display: true }
      },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  const ctxFile = document.getElementById('fileOpsChart');
  if (ctxFile && !fileOpsChartInstance) {
    fileOpsChartInstance = new Chart(ctxFile, {
      type: 'line',
      data: { labels: [], datasets: [
        { label: '上传', data: [], borderColor: '#165dff', backgroundColor: 'rgba(22, 93, 255, 0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true },
        { label: '下载', data: [], borderColor: '#00b42a', backgroundColor: 'rgba(0, 180, 42, 0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true },
        { label: '删除', data: [], borderColor: '#f53f3f', backgroundColor: 'rgba(245, 63, 63, 0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true }
      ]},
      options: commonOptions
    });
  }

  const ctxShare = document.getElementById('shareOpsChart');
  if (ctxShare && !shareOpsChartInstance) {
    shareOpsChartInstance = new Chart(ctxShare, {
      type: 'line',
      data: { labels: [], datasets: [
        { label: '分享访问', data: [], borderColor: '#ff7d00', backgroundColor: 'rgba(255, 125, 0, 0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true },
        { label: '分享下载', data: [], borderColor: '#722ed1', backgroundColor: 'rgba(114, 46, 209, 0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1, spanGaps: true }
      ]},
      options: commonOptions
    });
  }
};

const updateFileMonitorCharts = (historyData, startTime, endTime) => {
  if (!fileOpsChartInstance || !shareOpsChartInstance) return;
  const dataList = historyData || [];
  
  const numBuckets = 60;
  const interval = Math.max(1, (endTime - startTime) / numBuckets);
  
  const labels = [];
  const uploadData = Array(numBuckets).fill(null);
  const downloadData = Array(numBuckets).fill(null);
  const deleteData = Array(numBuckets).fill(null);
  const shareVisitData = Array(numBuckets).fill(null);
  const shareDownloadData = Array(numBuckets).fill(null);
  
  for (let i = 0; i < numBuckets; i++) {
    const bucketTime = startTime + i * interval;
    labels.push(new Date(bucketTime).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }
  
  dataList.forEach(m => {
    if (m.snapshotTime < startTime || m.snapshotTime > endTime) return;
    const bucketIdx = Math.min(numBuckets - 1, Math.floor((m.snapshotTime - startTime) / interval));
    uploadData[bucketIdx] = m.uploadCount;
    downloadData[bucketIdx] = m.downloadCount;
    deleteData[bucketIdx] = m.deleteCount;
    shareVisitData[bucketIdx] = m.shareVisitCount;
    shareDownloadData[bucketIdx] = m.shareDownloadCount;
  });

  fileOpsChartInstance.data.labels = labels;
  fileOpsChartInstance.data.datasets[0].data = uploadData;
  fileOpsChartInstance.data.datasets[1].data = downloadData;
  fileOpsChartInstance.data.datasets[2].data = deleteData;
  fileOpsChartInstance.update();

  shareOpsChartInstance.data.labels = labels;
  shareOpsChartInstance.data.datasets[0].data = shareVisitData;
  shareOpsChartInstance.data.datasets[1].data = shareDownloadData;
  shareOpsChartInstance.update();
};

const renderFileRecentOperations = (data, page, perPage) => {
  const elRecentOperationsBody = document.getElementById("fileRecentOperationsTableBody");
  const elPageInfo = document.getElementById("fileRecentPageInfo");
  const elSummary = document.getElementById("fileRecentPaginationSummary");
  const elPrevBtn = document.getElementById("fileRecentPrevBtn");
  const elNextBtn = document.getElementById("fileRecentNextBtn");
  
  if (!elRecentOperationsBody) return;
  
  const totalPages = Math.ceil(data.length / perPage);
  const startIdx = (page - 1) * perPage;
  const endIdx = startIdx + perPage;
  const pageData = data.slice(startIdx, endIdx);
  
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const getOperationClass = (type) => {
    const classes = {
      'upload': 'blue',
      'download': 'green',
      'delete': 'red',
      'share_visit': 'yellow',
      'share_download': 'purple'
    };
    return classes[type] || '';
  };
  
  const getOperationLabel = (type) => {
    const labels = {
      'upload': '上传',
      'download': '下载',
      'delete': '删除',
      'share_visit': '分享访问',
      'share_download': '分享下载'
    };
    return labels[type] || type;
  };
  
  if (pageData.length === 0) {
    elRecentOperationsBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">暂无数据</td></tr>';
  } else {
    elRecentOperationsBody.innerHTML = pageData.map(op => `
      <tr>
        <td>${new Date(op.timestamp).toLocaleString()}</td>
        <td><span class="${getOperationClass(op.operationType)}">${getOperationLabel(op.operationType)}</span></td>
        <td>${escapeHtml(op.filename)}</td>
        <td>${escapeHtml(op.user)}</td>
        <td>${op.fileSize ? formatFileSize(op.fileSize) : '-'}</td>
      </tr>
    `).join('');
  }
  
  // 更新分页信息
  if (elSummary) {
    const start = data.length > 0 ? startIdx + 1 : 0;
    const end = Math.min(endIdx, data.length);
    elSummary.textContent = `共 ${data.length} 条，当前 ${start}-${end}`;
  }
  
  if (elPageInfo) {
    elPageInfo.textContent = `${page} / ${totalPages || 1}`;
  }
  
  // 更新按钮状态
  if (elPrevBtn) elPrevBtn.disabled = page <= 1;
  if (elNextBtn) elNextBtn.disabled = page >= totalPages;
};

const setupFileRecentPagination = () => {
  const elPrevBtn = document.getElementById("fileRecentPrevBtn");
  const elNextBtn = document.getElementById("fileRecentNextBtn");
  const elPageSizeSelect = document.getElementById("fileRecentPageSizeSelect");
  
  if (elPrevBtn) {
    elPrevBtn.onclick = () => {
      if (fileRecentPage > 1) {
        fileRecentPage--;
        renderFileRecentOperations(fileRecentData, fileRecentPage, fileRecentPerPage);
      }
    };
  }
  
  if (elNextBtn) {
    elNextBtn.onclick = () => {
      const totalPages = Math.ceil(fileRecentData.length / fileRecentPerPage);
      if (fileRecentPage < totalPages) {
        fileRecentPage++;
        renderFileRecentOperations(fileRecentData, fileRecentPage, fileRecentPerPage);
      }
    };
  }
  
  if (elPageSizeSelect) {
    elPageSizeSelect.onchange = () => {
      fileRecentPerPage = parseInt(elPageSizeSelect.value);
      fileRecentPage = 1;
      renderFileRecentOperations(fileRecentData, fileRecentPage, fileRecentPerPage);
    };
  }
};

const loadFileMonitorInfo = async () => {
  try {
    const elUploadCount = document.getElementById("fileUploadCount");
    const elDownloadCount = document.getElementById("fileDownloadCount");
    const elDeleteCount = document.getElementById("fileDeleteCount");
    const elShareVisitCount = document.getElementById("fileShareVisitCount");
    const elShareDownloadCount = document.getElementById("fileShareDownloadCount");
    const elTotalFileCount = document.getElementById("fileTotalFileCount");
    const elTotalFolderCount = document.getElementById("fileTotalFolderCount");
    const elTodayNewCount = document.getElementById("fileTodayNewCount");
    const elYesterdayNewCount = document.getElementById("fileYesterdayNewCount");
    const elTextCount = document.getElementById("fileTextCount");
    const elImageCount = document.getElementById("fileImageCount");
    const elAudioCount = document.getElementById("fileAudioCount");
    const elVideoCount = document.getElementById("fileVideoCount");
    const elArchiveCount = document.getElementById("fileArchiveCount");
    const elProgramCount = document.getElementById("fileProgramCount");
    const elOtherCount = document.getElementById("fileOtherCount");
    const elRecentOperationsBody = document.getElementById("fileRecentOperationsTableBody");
    const elTopFilesBody = document.getElementById("fileTopFilesTableBody");
    const elTimeFilterPreset = document.getElementById("fileTimeFilterPreset");

    let queryParams = new URLSearchParams();
    const timePreset = elTimeFilterPreset ? elTimeFilterPreset.value : '24h';
    queryParams.set('timeRange', timePreset);
    
    if (timePreset === 'custom') {
      const elStartTime = document.getElementById("fileStartTime");
      const elEndTime = document.getElementById("fileEndTime");
      if (elStartTime && elStartTime.value) {
        queryParams.set('startTime', new Date(elStartTime.value).getTime());
      }
      if (elEndTime && elEndTime.value) {
        queryParams.set('endTime', new Date(elEndTime.value).getTime());
      }
    }

    const res = await request(`/api/system/file-monitor?${queryParams.toString()}`);
    if (!res.ok) {
      throw new Error("获取文件监控信息失败");
    }
    const data = await res.json();

    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (elUploadCount) elUploadCount.textContent = data.uploadCount;
    if (elDownloadCount) elDownloadCount.textContent = data.downloadCount;
    if (elDeleteCount) elDeleteCount.textContent = data.deleteCount;
    if (elShareVisitCount) elShareVisitCount.textContent = data.shareVisitCount;
    if (elShareDownloadCount) elShareDownloadCount.textContent = data.shareDownloadCount;
    if (elTotalFileCount) elTotalFileCount.textContent = data.totalFileCount;
    if (elTotalFolderCount) elTotalFolderCount.textContent = data.totalFolderCount;
    if (elTodayNewCount) elTodayNewCount.textContent = data.todayNewCount;
    if (elYesterdayNewCount) elYesterdayNewCount.textContent = data.yesterdayNewCount;
    if (elTextCount) elTextCount.textContent = data.textCount;
    if (elImageCount) elImageCount.textContent = data.imageCount;
    if (elAudioCount) elAudioCount.textContent = data.audioCount;
    if (elVideoCount) elVideoCount.textContent = data.videoCount;
    if (elArchiveCount) elArchiveCount.textContent = data.archiveCount;
    if (elProgramCount) elProgramCount.textContent = data.programCount;
    if (elOtherCount) elOtherCount.textContent = data.otherCount;

    if (elRecentOperationsBody) {
      fileRecentData = data.recentOperations || [];
      fileRecentPage = 1;
      renderFileRecentOperations(fileRecentData, fileRecentPage, fileRecentPerPage);
      setupFileRecentPagination();
    }

    if (elTopFilesBody) {
      if (data.topFiles.length === 0) {
        elTopFilesBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">暂无数据</td></tr>';
      } else {
        elTopFilesBody.innerHTML = data.topFiles.map(file => `
          <tr>
            <td>${escapeHtml(file.filename)}</td>
            <td>${escapeHtml(file.fileType)}</td>
            <td>${file.accessCount}</td>
            <td>${file.fileSize ? formatFileSize(file.fileSize) : '-'}</td>
          </tr>
        `).join('');
      }
    }

    if (!fileOpsChartInstance || !shareOpsChartInstance) {
      initFileMonitorCharts();
    }
    
    let startTime = 0;
    let endTime = Date.now();
    if (timePreset === 'custom') {
      const elStartTime = document.getElementById("fileStartTime");
      const elEndTime = document.getElementById("fileEndTime");
      if (elStartTime && elStartTime.value) startTime = new Date(elStartTime.value).getTime();
      if (elEndTime && elEndTime.value) endTime = new Date(elEndTime.value).getTime();
    } else {
      const rangeMap = {
        "realtime": 5 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "12h": 12 * 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000
      };
      startTime = endTime - (rangeMap[timePreset] || rangeMap["1h"]);
    }

    const historyRes = await request(`/api/system/file-monitor/history?startTime=${startTime}&endTime=${endTime}`);
    if (historyRes.ok) {
      const historyResData = await historyRes.json();
      updateFileMonitorCharts(historyResData.history, startTime, endTime);
    }

    return data;
  } catch (error) {
    console.error("Failed to load file monitor info:", error);
    const elUploadCount = document.getElementById("fileUploadCount");
    if (elUploadCount) elUploadCount.textContent = '--';
    const elDownloadCount = document.getElementById("fileDownloadCount");
    if (elDownloadCount) elDownloadCount.textContent = '--';
    const elDeleteCount = document.getElementById("fileDeleteCount");
    if (elDeleteCount) elDeleteCount.textContent = '--';
    const elTotalFileCount = document.getElementById("fileTotalFileCount");
    if (elTotalFileCount) elTotalFileCount.textContent = '--';
    const elTotalFolderCount = document.getElementById("fileTotalFolderCount");
    if (elTotalFolderCount) elTotalFolderCount.textContent = '--';
    const elTodayNewCount = document.getElementById("fileTodayNewCount");
    if (elTodayNewCount) elTodayNewCount.textContent = '--';
    const elYesterdayNewCount = document.getElementById("fileYesterdayNewCount");
    if (elYesterdayNewCount) elYesterdayNewCount.textContent = '--';
    const elTextCount = document.getElementById("fileTextCount");
    if (elTextCount) elTextCount.textContent = '--';
    const elImageCount = document.getElementById("fileImageCount");
    if (elImageCount) elImageCount.textContent = '--';
    const elAudioCount = document.getElementById("fileAudioCount");
    if (elAudioCount) elAudioCount.textContent = '--';
    const elVideoCount = document.getElementById("fileVideoCount");
    if (elVideoCount) elVideoCount.textContent = '--';
    const elArchiveCount = document.getElementById("fileArchiveCount");
    if (elArchiveCount) elArchiveCount.textContent = '--';
    const elProgramCount = document.getElementById("fileProgramCount");
    if (elProgramCount) elProgramCount.textContent = '--';
    const elOtherCount = document.getElementById("fileOtherCount");
    if (elOtherCount) elOtherCount.textContent = '--';
    return null;
  }
};

const refreshFileMonitor = async () => {
  const elRefreshBtn = document.getElementById("refreshFileMonitorBtn");
  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.add("fa-spin");
  }

  await loadFileMonitorInfo();

  if (elRefreshBtn) {
    const icon = elRefreshBtn.querySelector("i");
    if (icon) icon.classList.remove("fa-spin");
  }
};

const startFileMonitorAutoRefresh = () => {
  if (fileMonitorInterval) clearInterval(fileMonitorInterval);

  const elTimeFilter = document.getElementById("fileTimeFilterPreset");
  const timeRange = elTimeFilter ? elTimeFilter.value : '1h';

  if (timeRange === 'realtime') {
    fileMonitorInterval = setInterval(refreshFileMonitor, 6000);
  }
};

const stopFileMonitorAutoRefresh = () => {
  if (fileMonitorInterval) {
    clearInterval(fileMonitorInterval);
    fileMonitorInterval = null;
  }
};

window.addEventListener("popstate", () => {
  applyRouteFromUrl();
});
window.addEventListener("resize", () => {
  applyMainMenuVisibility();
  const activeMain = Array.from(mainNavItems).find((item) => item.classList.contains("active"))?.dataset.view || "";
  if (!getRenderableMenus().includes(activeMain)) {
    applyRouteFromUrl();
  }
});
applyRouteFromUrl();
ensureAutoLogoutByStoredSession();
loadPublicSettings();
loadUserInfo();
