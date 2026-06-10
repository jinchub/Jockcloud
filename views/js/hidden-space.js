(() => {
  const HIDDEN_SPACE_UNLOCKED_STORAGE_KEY = "jc_hidden_space_unlocked";
  const HIDDEN_SPACE_LAST_ACTIVE_AT_STORAGE_KEY = "jc_hidden_space_last_active_at";
  const HIDDEN_SPACE_AUTO_EXIT_MINUTES_STORAGE_KEY = "jc_hidden_space_auto_exit_minutes";
  const DEFAULT_HIDDEN_SPACE_AUTO_EXIT_MINUTES = 10;
  const FILE_SPACE_API_PREFIXES = [
    "/api/stats",
    "/api/folders",
    "/api/files",
    "/api/upload",
    "/api/entries",
    "/api/recycle",
    "/api/quick-access",
    "/api/download",
    "/api/preview",
    "/api/upload-tasks"
  ];
  const HIDDEN_SPACE_ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousedown"];

  const normalizeSpace = (space) => space === "hidden" ? "hidden" : "normal";
  const normalizeAutoExitMinutes = (value) => {
    const minutes = Math.floor(Number(value));
    if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_HIDDEN_SPACE_AUTO_EXIT_MINUTES;
    return Math.max(1, Math.min(1440, minutes));
  };

  window.createHiddenSpaceManager = () => {
    let autoExitTimer = null;
    let autoExitHandler = null;
    let activityEventsBound = false;
    let lastActivityPersistAt = 0;
    let autoExitMinutes = normalizeAutoExitMinutes(localStorage.getItem(HIDDEN_SPACE_AUTO_EXIT_MINUTES_STORAGE_KEY));

    const getAutoExitMs = () => autoExitMinutes * 60 * 1000;

    const clearAutoExitTimer = () => {
      if (autoExitTimer) {
        clearTimeout(autoExitTimer);
        autoExitTimer = null;
      }
    };

    const clearUnlockedStorage = () => {
      localStorage.removeItem(HIDDEN_SPACE_UNLOCKED_STORAGE_KEY);
      localStorage.removeItem(HIDDEN_SPACE_LAST_ACTIVE_AT_STORAGE_KEY);
    };

    const getLastActiveAt = () => {
      const value = Number(localStorage.getItem(HIDDEN_SPACE_LAST_ACTIVE_AT_STORAGE_KEY) || 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };

    const isUnlockedExpired = () => {
      const lastActiveAt = getLastActiveAt();
      return !lastActiveAt || Date.now() - lastActiveAt >= getAutoExitMs();
    };

    const emitAutoExit = () => {
      clearAutoExitTimer();
      clearUnlockedStorage();
      if (typeof autoExitHandler === "function") {
        Promise.resolve(autoExitHandler()).catch(() => {});
      }
    };

    const scheduleAutoExit = () => {
      clearAutoExitTimer();
      if (localStorage.getItem(HIDDEN_SPACE_UNLOCKED_STORAGE_KEY) !== "1") return;
      const lastActiveAt = getLastActiveAt();
      if (!lastActiveAt) {
        emitAutoExit();
        return;
      }
      const remainMs = getAutoExitMs() - (Date.now() - lastActiveAt);
      if (remainMs <= 0) {
        emitAutoExit();
        return;
      }
      autoExitTimer = setTimeout(() => {
        emitAutoExit();
      }, remainMs);
    };

    const recordActivity = (force = false) => {
      if (localStorage.getItem(HIDDEN_SPACE_UNLOCKED_STORAGE_KEY) !== "1") return;
      const now = Date.now();
      if (!force && now - lastActivityPersistAt < 1000) {
        scheduleAutoExit();
        return;
      }
      lastActivityPersistAt = now;
      localStorage.setItem(HIDDEN_SPACE_LAST_ACTIVE_AT_STORAGE_KEY, String(now));
      scheduleAutoExit();
    };

    const handleUserActivity = () => {
      recordActivity(false);
    };

    const bindActivityEvents = () => {
      if (activityEventsBound) return;
      HIDDEN_SPACE_ACTIVITY_EVENTS.forEach((eventName) => {
        window.addEventListener(eventName, handleUserActivity, { passive: true });
      });
      activityEventsBound = true;
    };

    const unbindActivityEvents = () => {
      if (!activityEventsBound) return;
      HIDDEN_SPACE_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity, { passive: true });
      });
      activityEventsBound = false;
    };

    const syncAutoExit = (state, ui = {}, refreshActivity = false) => {
      if (state.hiddenSpaceUnlocked) {
        bindActivityEvents();
        if (refreshActivity || !getLastActiveAt()) {
          recordActivity(true);
        } else {
          scheduleAutoExit();
        }
      } else {
        clearAutoExitTimer();
        unbindActivityEvents();
      }
      updateUi(state, ui);
    };

    const readPromptValue = async (ask, message, defaultValue = "") => {
      if (typeof ask !== "function") return "";
      try {
        const value = await Promise.resolve(ask(message, defaultValue));
        return String(value || "").trim();
      } catch (error) {
        return "";
      }
    };

    const readSelectValue = async (choose, title, options = []) => {
      if (typeof choose !== "function") return "";
      try {
        const value = await Promise.resolve(choose(title, options));
        return String(value || "").trim();
      } catch (error) {
        return "";
      }
    };

    const updateUi = (state, ui = {}) => {
      const { closeBtn, dot, resetBtn, autoExitTip, unlockedIcon } = ui;
      const showActionUi = state.fileSpace === "hidden" && state.hiddenSpaceUnlocked && state.view === "files";
      if (closeBtn) {
        closeBtn.style.display = showActionUi ? "" : "none";
        closeBtn.disabled = !showActionUi;
      }
      if (resetBtn) {
        resetBtn.style.display = showActionUi ? "" : "none";
        resetBtn.disabled = !showActionUi;
      }
      if (autoExitTip) {
        autoExitTip.style.display = showActionUi ? "inline-flex" : "none";
        if (showActionUi) {
          const minutes = Math.max(1, Math.floor(Number(state.hiddenSpaceAutoExitMinutes) || autoExitMinutes || DEFAULT_HIDDEN_SPACE_AUTO_EXIT_MINUTES));
          autoExitTip.textContent = `${minutes} 分钟无操作将自动退出`;
        }
      }
      if (dot) {
        dot.style.display = state.hiddenSpaceEnabled === false ? "inline-flex" : "none";
      }
      if (unlockedIcon) {
        unlockedIcon.style.display = state.hiddenSpaceUnlocked ? "inline-flex" : "none";
      }
    };

    const setUnlocked = (state, unlocked, ui = {}) => {
      state.hiddenSpaceUnlocked = !!unlocked;
      if (state.hiddenSpaceUnlocked) {
        localStorage.setItem(HIDDEN_SPACE_UNLOCKED_STORAGE_KEY, "1");
        localStorage.setItem(HIDDEN_SPACE_LAST_ACTIVE_AT_STORAGE_KEY, String(Date.now()));
      } else {
        clearUnlockedStorage();
      }
      syncAutoExit(state, ui, state.hiddenSpaceUnlocked);
    };

    const getInitialUnlocked = () => {
      const unlocked = localStorage.getItem(HIDDEN_SPACE_UNLOCKED_STORAGE_KEY) === "1";
      if (!unlocked) return false;
      if (isUnlockedExpired()) {
        clearUnlockedStorage();
        return false;
      }
      return true;
    };

    const getRootLabel = (state) => {
      return state.fileSpace === "hidden" ? "私密空间" : "我的文件";
    };

    const appendFileSpaceToUrl = (url, state) => {
      if (!url) return url;
      let parsed;
      try {
        parsed = new URL(String(url), window.location.origin);
      } catch (error) {
        return url;
      }
      const shouldAttach = FILE_SPACE_API_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
      if (!shouldAttach) return url;
      parsed.searchParams.set("space", normalizeSpace(state.fileSpace));
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    };

    const loadStatus = async (apiRequest, state, ui = {}) => {
      const res = await apiRequest("/api/hidden-space/status");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "获取私密空间状态失败");
      }
      const data = await res.json();
      state.hiddenSpaceEnabled = data && data.enabled === true;
      updateUi(state, ui);
    };

    const setup = async (apiRequest, state, ui = {}, notify = window.alert.bind(window), ask = window.prompt.bind(window)) => {
      const password = await readPromptValue(ask, "首次开通私密空间，请设置安全密码（至少4位）", "");
      if (!password) return false;
      const confirmPassword = await readPromptValue(ask, "请再次输入安全密码", "");
      if (!confirmPassword) return false;
      if (password !== confirmPassword) {
        notify("两次输入的密码不一致");
        return false;
      }
      const res = await apiRequest("/api/hidden-space/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.message || "私密空间开通失败");
        return false;
      }
      state.hiddenSpaceEnabled = true;
      setUnlocked(state, true, ui);
      return true;
    };

    const verify = async (apiRequest, state, ui = {}, notify = window.alert.bind(window), ask = window.prompt.bind(window), choose = null, openResetDialog = null) => {
      const password = await readPromptValue(ask, "请输入私密空间安全密码", "");
      if (password === "__RESET_HIDDEN_SPACE_PASSWORD__") {
        const resetSuccess = await resetPassword(apiRequest, state, ui, notify, ask, choose, openResetDialog);
        if (!resetSuccess) return false;
        return verify(apiRequest, state, ui, notify, ask, choose, openResetDialog);
      }
      if (!password) return false;
      const res = await apiRequest("/api/hidden-space/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.message || "密码错误");
        return false;
      }
      setUnlocked(state, true, ui);
      return true;
    };

    const ensureAccess = async (apiRequest, state, ui = {}, notify = window.alert.bind(window), ask = window.prompt.bind(window), choose = null, openResetDialog = null) => {
      await loadStatus(apiRequest, state, ui);
      if (!state.hiddenSpaceEnabled) {
        return setup(apiRequest, state, ui, notify, ask);
      }
      if (state.hiddenSpaceUnlocked) return true;
      return verify(apiRequest, state, ui, notify, ask, choose, openResetDialog);
    };

    const resetPassword = async (apiRequest, state, ui = {}, notify = window.alert.bind(window), ask = window.prompt.bind(window), choose = null, openResetDialog = null) => {
      await loadStatus(apiRequest, state, ui);
      if (!state.hiddenSpaceEnabled) {
        notify("私密空间未开通");
        return false;
      }
      if (typeof openResetDialog === "function") {
        const result = await Promise.resolve(openResetDialog());
        if (!result || typeof result !== "object") return false;
        const method = String(result.method || "").trim();
        const newPassword = String(result.newPassword || "").trim();
        const confirmPassword = String(result.confirmPassword || "").trim();
        if (!newPassword || !confirmPassword) return false;
        if (newPassword !== confirmPassword) {
          notify("两次输入的新密码不一致");
          return false;
        }
        if (method === "current") {
          const oldPassword = String(result.oldPassword || "").trim();
          if (!oldPassword) return false;
          const res = await apiRequest("/api/hidden-space/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPassword, newPassword })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            notify(data.message || "重置私密空间密码失败");
            return false;
          }
          notify(data.message || "私密空间密码重置成功");
          return true;
        }
        if (method === "sms") {
          const code = String(result.code || "").trim();
          if (!code) return false;
          const res = await apiRequest("/api/hidden-space/reset-password/by-sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, newPassword })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            notify(data.message || "重置私密空间密码失败");
            return false;
          }
          notify(data.message || "私密空间密码重置成功");
          return true;
        }
        return false;
      }
      const method = await readSelectValue(choose, "请选择重置方式", [
        { value: "current", label: "验证登录密码" },
        { value: "sms", label: "短信验证码" }
      ]);
      if (!method) return false;
      if (method === "current") {
        const oldPassword = await readPromptValue(ask, "请输入当前账号登录密码", "");
        if (!oldPassword) return false;
        const newPassword = await readPromptValue(ask, "请输入新的私密空间密码（至少4位）", "");
        if (!newPassword) return false;
        const confirmPassword = await readPromptValue(ask, "请再次输入新的私密空间密码", "");
        if (!confirmPassword) return false;
        if (newPassword !== confirmPassword) {
          notify("两次输入的新密码不一致");
          return false;
        }
        const res = await apiRequest("/api/hidden-space/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          notify(data.message || "重置私密空间密码失败");
          return false;
        }
        notify(data.message || "私密空间密码重置成功");
        return true;
      }
      const sendRes = await apiRequest("/api/hidden-space/reset-password/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        notify(sendData.message || "短信验证码发送失败");
        return false;
      }
      notify(sendData.message || "验证码已发送");
      const code = await readPromptValue(ask, "请输入短信验证码", "");
      if (!code) return false;
      const newPassword = await readPromptValue(ask, "请输入新的私密空间密码（至少4位）", "");
      if (!newPassword) return false;
      const confirmPassword = await readPromptValue(ask, "请再次输入新的私密空间密码", "");
      if (!confirmPassword) return false;
      if (newPassword !== confirmPassword) {
        notify("两次输入的新密码不一致");
        return false;
      }
      const res = await apiRequest("/api/hidden-space/reset-password/by-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.message || "重置私密空间密码失败");
        return false;
      }
      notify(data.message || "私密空间密码重置成功");
      return true;
    };

    return {
      getInitialUnlocked,
      clearUnlockedStorage,
      getRootLabel,
      appendFileSpaceToUrl,
      setUnlocked,
      syncAutoExit,
      getAutoExitMinutes() {
        return autoExitMinutes;
      },
      setAutoExitMinutes(value, state = null, ui = {}) {
        autoExitMinutes = normalizeAutoExitMinutes(value);
        localStorage.setItem(HIDDEN_SPACE_AUTO_EXIT_MINUTES_STORAGE_KEY, String(autoExitMinutes));
        if (state && typeof state === "object") {
          state.hiddenSpaceAutoExitMinutes = autoExitMinutes;
          syncAutoExit(state, ui);
        } else {
          scheduleAutoExit();
        }
      },
      setAutoExitHandler(handler) {
        autoExitHandler = typeof handler === "function" ? handler : null;
      },
      updateUi,
      loadStatus,
      ensureAccess,
      resetPassword
    };
  };
})();
