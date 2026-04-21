const loginForm = document.getElementById("loginForm");
const smsForm = document.getElementById("smsForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const statusEl = document.getElementById("status");
const tabAccount = document.getElementById("tabAccount");
const tabSms = document.getElementById("tabSms");
const loginTabs = document.querySelector(".login-tabs");
const captchaGroup = document.getElementById("captchaGroup");
const captchaInput = document.getElementById("captchaInput");
const captchaCodeText = document.getElementById("captchaCodeText");
const smsCaptchaGroup = document.getElementById("smsCaptchaGroup");
const smsCaptchaInput = document.getElementById("smsCaptchaInput");
const smsCaptchaCodeText = document.getElementById("smsCaptchaCodeText");
const smsPhoneInput = document.getElementById("smsPhoneInput");
const smsCodeInput = document.getElementById("smsCodeInput");
const smsSendCodeBtn = document.getElementById("smsSendCodeBtn");
const resetForm = document.getElementById("resetForm");
const resetPhoneInput = document.getElementById("resetPhoneInput");
const resetCodeInput = document.getElementById("resetCodeInput");
const resetPasswordInput = document.getElementById("resetPasswordInput");
const resetSendCodeBtn = document.getElementById("resetSendCodeBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");
const resetSuccessModal = document.getElementById("resetSuccessModal");
const resetSuccessMessage = document.getElementById("resetSuccessMessage");
const resetSuccessGoLoginBtn = document.getElementById("resetSuccessGoLoginBtn");

const runtime = {
  loginCaptchaEnabled: false,
  smsLoginEnabled: false,
  loginSessionMinutes: 10080,
  smsSendIntervalSeconds: 60,
  smsCountdownTimer: null,
  smsCountdownRemain: 0,
  resetCountdownTimer: null,
  resetCountdownRemain: 0,
  captchaCode: "",
  captchaId: "",
  activeMode: "account",
  loginEncryptKeyId: "",
  loginEncryptCryptoKey: null
};

const LOGIN_CAPTCHA_LENGTH = 4;

const setStatus = (text, isError = false) => {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#f53f3f" : "#059669";
};

const normalizeCaptchaCode = (value) => String(value || "").trim().toUpperCase().slice(0, LOGIN_CAPTCHA_LENGTH);

const hideResetSuccessDialog = () => {
  if (resetSuccessModal) {
    resetSuccessModal.style.display = "none";
  }
};

const showResetSuccessDialog = (message = "") => {
  if (resetSuccessMessage) {
    resetSuccessMessage.textContent = String(message || "").trim() || "密码重置成功，请重新登录";
  }
  if (resetSuccessModal) {
    resetSuccessModal.style.display = "flex";
  }
};

const hasValidStoredSession = () => {
  const savedLoginAt = Number(localStorage.getItem("jc_login_at") || 0);
  if (!Number.isFinite(savedLoginAt) || savedLoginAt <= 0) return false;
  const storedSessionMinutes = Math.max(
    1,
    Math.min(43200, Math.floor(Number(localStorage.getItem("jc_login_session_minutes")) || runtime.loginSessionMinutes))
  );
  const expireAt = savedLoginAt + storedSessionMinutes * 60 * 1000;
  return expireAt > Date.now();
};

const checkLoggedIn = async () => {
  if (hasValidStoredSession()) {
    window.location.href = "/drive.html";
  }
};

const persistLoginSession = (data = {}) => {
  const sessionMinutes = Math.max(1, Math.min(43200, Math.floor(Number(data.loginSessionMinutes) || runtime.loginSessionMinutes)));
  localStorage.setItem("jc_login_at", String(Date.now()));
  localStorage.setItem("jc_login_session_minutes", String(sessionMinutes));
};

const pemToArrayBuffer = (pem) => {
  const normalizedPem = String(pem || "")
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = window.atob(normalizedPem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const uint8ToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const applyLoginEncryptKey = async (keyInfo = {}) => {
  const keyId = String(keyInfo.keyId || "").trim();
  const publicKey = String(keyInfo.publicKey || "").trim();
  if (!keyId || !publicKey) {
    throw new Error("登录加密配置无效");
  }
  if (runtime.loginEncryptCryptoKey && runtime.loginEncryptKeyId === keyId) {
    return;
  }
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("当前浏览器不支持密码加密");
  }
  const cryptoKey = await window.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  runtime.loginEncryptKeyId = keyId;
  runtime.loginEncryptCryptoKey = cryptoKey;
};

const encryptLoginPassword = async (password) => {
  if (!runtime.loginEncryptCryptoKey || !runtime.loginEncryptKeyId) {
    throw new Error("缺少登录加密密钥");
  }
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    runtime.loginEncryptCryptoKey,
    new TextEncoder().encode(String(password || ""))
  );
  return uint8ToBase64(encryptedBuffer);
};

const updateCodeButton = (button, remain, label = "获取短信验证码") => {
  if (!button) return;
  if (remain > 0) {
    button.textContent = `${remain}s后重发`;
    button.style.pointerEvents = "none";
    button.style.opacity = "0.6";
    return;
  }
  button.textContent = label;
  button.style.pointerEvents = "";
  button.style.opacity = "";
};

const updateSmsSendButton = () => {
  updateCodeButton(smsSendCodeBtn, runtime.smsCountdownRemain);
};

const updateResetSendButton = () => {
  updateCodeButton(resetSendCodeBtn, runtime.resetCountdownRemain);
};

const startSmsCountdown = (seconds) => {
  const total = Math.max(1, Math.floor(Number(seconds) || runtime.smsSendIntervalSeconds || 60));
  runtime.smsCountdownRemain = total;
  if (runtime.smsCountdownTimer) {
    clearInterval(runtime.smsCountdownTimer);
    runtime.smsCountdownTimer = null;
  }
  updateSmsSendButton();
  runtime.smsCountdownTimer = setInterval(() => {
    runtime.smsCountdownRemain -= 1;
    if (runtime.smsCountdownRemain <= 0) {
      runtime.smsCountdownRemain = 0;
      clearInterval(runtime.smsCountdownTimer);
      runtime.smsCountdownTimer = null;
    }
    updateSmsSendButton();
  }, 1000);
};

const startResetCountdown = (seconds) => {
  const total = Math.max(1, Math.floor(Number(seconds) || runtime.smsSendIntervalSeconds || 60));
  runtime.resetCountdownRemain = total;
  if (runtime.resetCountdownTimer) {
    clearInterval(runtime.resetCountdownTimer);
    runtime.resetCountdownTimer = null;
  }
  updateResetSendButton();
  runtime.resetCountdownTimer = setInterval(() => {
    runtime.resetCountdownRemain -= 1;
    if (runtime.resetCountdownRemain <= 0) {
      runtime.resetCountdownRemain = 0;
      clearInterval(runtime.resetCountdownTimer);
      runtime.resetCountdownTimer = null;
    }
    updateResetSendButton();
  }, 1000);
};

const switchToAccount = () => {
  runtime.activeMode = "account";
  if (loginTabs) loginTabs.classList.remove("is-reset");
  tabAccount.classList.add("active");
  tabSms.classList.remove("active");
  loginForm.style.display = "block";
  smsForm.style.display = "none";
  if (resetForm) resetForm.style.display = "none";
  statusEl.textContent = "";
};

const switchToSms = () => {
  runtime.activeMode = "sms";
  if (loginTabs) loginTabs.classList.remove("is-reset");
  tabSms.classList.add("active");
  tabAccount.classList.remove("active");
  smsForm.style.display = "block";
  loginForm.style.display = "none";
  if (resetForm) resetForm.style.display = "none";
  statusEl.textContent = "";
};

const switchToReset = () => {
  runtime.activeMode = "reset";
  if (loginTabs) loginTabs.classList.add("is-reset");
  tabAccount.classList.remove("active");
  tabSms.classList.remove("active");
  loginForm.style.display = "none";
  smsForm.style.display = "none";
  if (resetForm) resetForm.style.display = "block";
  statusEl.textContent = "";
};

const refreshCaptcha = async () => {
  try {
    const res = await fetch("/api/auth/captcha");
    if (!res.ok) throw new Error("验证码加载失败");
    const data = await res.json().catch(() => ({}));
    runtime.captchaId = String(data.captchaId || "").trim();
    if (captchaCodeText) {
      captchaCodeText.innerHTML = data.captchaSvg || "";
    }
    if (smsCaptchaCodeText) {
      smsCaptchaCodeText.innerHTML = data.captchaSvg || "";
    }
  } catch (_error) {
    runtime.captchaId = "";
    if (captchaCodeText) {
      captchaCodeText.innerHTML = "";
    }
    if (smsCaptchaCodeText) {
      smsCaptchaCodeText.innerHTML = "";
    }
  }
};

const applyPublicSettings = (settings = {}) => {
  const system = settings.system && typeof settings.system === "object" ? settings.system : {};
  const login = settings.login && typeof settings.login === "object" ? settings.login : {};
  const siteTitle = String(system.siteTitle || "JockCloud").trim() || "JockCloud";
  const loginTitle = String(system.loginTitle || siteTitle).trim() || siteTitle;
  const siteDescription = String(system.siteDescription || "私人云存储，一键到云端，高效安全快速").trim();
  runtime.loginCaptchaEnabled = Boolean(login.loginCaptchaEnabled);
  runtime.smsLoginEnabled = Boolean(login.smsLoginEnabled);
  runtime.loginSessionMinutes = Math.max(1, Math.min(43200, Math.floor(Number(login.loginSessionMinutes) || 10080)));
  runtime.smsSendIntervalSeconds = Math.max(1, Math.min(3600, Math.floor(Number(login.smsSendIntervalSeconds) || 60)));
  document.title = siteTitle;
  const logoText = document.querySelector(".logo-text");
  const introTitle = document.querySelector(".intro-title");
  const introDesc = document.querySelector(".intro-desc");
  if (logoText) logoText.textContent = siteTitle;
  if (introTitle) introTitle.textContent = loginTitle;
  if (introDesc) introDesc.textContent = siteDescription;
  if (captchaGroup) {
    captchaGroup.style.display = runtime.loginCaptchaEnabled ? "flex" : "none";
  }
  if (smsCaptchaGroup) {
    smsCaptchaGroup.style.display = runtime.loginCaptchaEnabled ? "flex" : "none";
  }
  if (runtime.loginCaptchaEnabled) {
    refreshCaptcha().catch(() => {});
  } else if (captchaInput) {
      captchaInput.value = "";
      if (smsCaptchaInput) smsCaptchaInput.value = "";
      runtime.captchaId = "";
      runtime.captchaCode = "";
      if (captchaCodeText) captchaCodeText.textContent = "";
      if (smsCaptchaCodeText) smsCaptchaCodeText.textContent = "";
  }
  if (!runtime.smsLoginEnabled) {
    tabSms.style.display = "none";
    if (runtime.activeMode === "sms") {
      switchToAccount();
    }
  } else {
    tabSms.style.display = "";
  }
  updateSmsSendButton();
  updateResetSendButton();
};

const loadPublicSettings = async () => {
  try {
    const res = await fetch("/api/public-settings");
    if (!res.ok) return;
    const settings = await res.json();
    applyPublicSettings(settings);
  } catch (_error) {}
};

tabAccount.addEventListener("click", () => {
  switchToAccount();
});

tabSms.addEventListener("click", () => {
  if (!runtime.smsLoginEnabled) {
    switchToAccount();
    return;
  }
  switchToSms();
});

if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", (event) => {
    event.preventDefault();
    switchToReset();
  });
}

if (backToLoginBtn) {
  backToLoginBtn.addEventListener("click", (event) => {
    event.preventDefault();
    switchToAccount();
  });
}

if (resetSuccessGoLoginBtn) {
  resetSuccessGoLoginBtn.addEventListener("click", () => {
    hideResetSuccessDialog();
    switchToAccount();
  });
}

if (captchaCodeText) {
  captchaCodeText.addEventListener("click", () => {
    refreshCaptcha().catch(() => {});
  });
}

if (captchaInput) {
  captchaInput.addEventListener("input", () => {
    captchaInput.value = normalizeCaptchaCode(captchaInput.value);
  });
}

if (smsCaptchaCodeText) {
  smsCaptchaCodeText.addEventListener("click", () => {
    refreshCaptcha().catch(() => {});
  });
}

if (smsCaptchaInput) {
  smsCaptchaInput.addEventListener("input", () => {
    smsCaptchaInput.value = normalizeCaptchaCode(smsCaptchaInput.value);
  });
}

if (smsSendCodeBtn) {
  smsSendCodeBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (runtime.smsCountdownRemain > 0) {
      return;
    }
    const phone = String(smsPhoneInput && smsPhoneInput.value ? smsPhoneInput.value : "").trim();
    if (!/^1\d{10}$/.test(phone)) {
      setStatus("请输入正确的手机号", true);
      return;
    }
    if (runtime.loginCaptchaEnabled) {
      const smsCaptchaCode = normalizeCaptchaCode(smsCaptchaInput && smsCaptchaInput.value ? smsCaptchaInput.value : "");
      if (smsCaptchaInput) smsCaptchaInput.value = smsCaptchaCode;
      if (smsCaptchaCode.length !== LOGIN_CAPTCHA_LENGTH || !runtime.captchaId) {
        setStatus("请输入4位验证码", true);
        refreshCaptcha().catch(() => {});
        if (smsCaptchaInput) smsCaptchaInput.value = "";
        return;
      }
    }
    try {
      const res = await fetch("/api/auth/sms/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          captchaId: runtime.captchaId,
          captchaCode: normalizeCaptchaCode(smsCaptchaInput && smsCaptchaInput.value ? smsCaptchaInput.value : "")
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.message || "短信验证码发送失败", true);
        if (runtime.loginCaptchaEnabled) {
          refreshCaptcha().catch(() => {});
          if (smsCaptchaInput) smsCaptchaInput.value = "";
        }
        return;
      }
      setStatus(data.message || "验证码已发送");
      const countdownSeconds = Math.max(1, Math.min(3600, Math.floor(Number(data.sendIntervalSeconds) || runtime.smsSendIntervalSeconds)));
      startSmsCountdown(countdownSeconds);
    } catch (_error) {
      setStatus("网络请求失败，请稍后重试", true);
    }
  });
}

if (resetSendCodeBtn) {
  resetSendCodeBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (runtime.resetCountdownRemain > 0) {
      return;
    }
    const phone = String(resetPhoneInput && resetPhoneInput.value ? resetPhoneInput.value : "").trim();
    if (!/^1\d{10}$/.test(phone)) {
      setStatus("请输入正确的手机号", true);
      return;
    }
    try {
      const res = await fetch("/api/auth/password-reset/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.message || "短信验证码发送失败", true);
        return;
      }
      setStatus(data.message || "验证码已发送");
      const countdownSeconds = Math.max(1, Math.min(3600, Math.floor(Number(data.sendIntervalSeconds) || runtime.smsSendIntervalSeconds)));
      startResetCountdown(countdownSeconds);
    } catch (_error) {
      setStatus("网络请求失败，请稍后重试", true);
    }
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    setStatus("请输入账号和密码", true);
    if (submitBtn) submitBtn.disabled = false;
    return;
  }
  if (runtime.loginCaptchaEnabled) {
    const inputCode = normalizeCaptchaCode(captchaInput && captchaInput.value ? captchaInput.value : "");
    if (captchaInput) captchaInput.value = inputCode;
    if (inputCode.length !== LOGIN_CAPTCHA_LENGTH || !runtime.captchaId) {
      setStatus("请输入4位验证码", true);
      refreshCaptcha().catch(() => {});
      if (captchaInput) captchaInput.value = "";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
  }
  try {
    const makeBasePayload = () => ({
      username,
      captchaId: runtime.captchaId,
      captchaCode: normalizeCaptchaCode(captchaInput && captchaInput.value ? captchaInput.value : "")
    });
    const sendLoginRequest = async (payload) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({ message: "登录失败" }));
      return { response, data };
    };
    let loginPayload = makeBasePayload();
    if (runtime.loginEncryptCryptoKey && runtime.loginEncryptKeyId) {
      loginPayload = {
        ...loginPayload,
        encryptedPassword: await encryptLoginPassword(password),
        passwordKeyId: runtime.loginEncryptKeyId
      };
    }
    let { response, data } = await sendLoginRequest(loginPayload);
    if (response.status === 428 && data && data.requireEncryptedPassword) {
      await applyLoginEncryptKey(data);
      const encryptedPassword = await encryptLoginPassword(password);
      ({ response, data } = await sendLoginRequest({
        ...makeBasePayload(),
        encryptedPassword,
        passwordKeyId: runtime.loginEncryptKeyId
      }));
    }
    if (!response.ok) {
      setStatus(data.message || "登录失败", true);
      if (runtime.loginCaptchaEnabled) {
        refreshCaptcha().catch(() => {});
      }
      if (captchaInput) captchaInput.value = "";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    persistLoginSession(data);
    setStatus("登录成功，正在跳转");
    window.location.href = "/drive.html";
  } catch (_error) {
    setStatus("网络请求失败，请稍后重试", true);
    if (runtime.loginCaptchaEnabled) {
      refreshCaptcha().catch(() => {});
    }
    if (submitBtn) submitBtn.disabled = false;
  }
});

smsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = smsForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  const phone = String(smsPhoneInput && smsPhoneInput.value ? smsPhoneInput.value : "").trim();
  const code = String(smsCodeInput && smsCodeInput.value ? smsCodeInput.value : "").trim();
  if (!/^1\d{10}$/.test(phone)) {
    setStatus("请输入正确的手机号", true);
    if (submitBtn) submitBtn.disabled = false;
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    setStatus("请输入6位短信验证码", true);
    if (submitBtn) submitBtn.disabled = false;
    return;
  }
  try {
    const res = await fetch("/api/auth/sms/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.message || "短信登录失败", true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    persistLoginSession(data);
    setStatus("登录成功，正在跳转");
    window.location.href = "/drive.html";
  } catch (_error) {
    setStatus("网络请求失败，请稍后重试", true);
    if (submitBtn) submitBtn.disabled = false;
  }
});

if (resetForm) {
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = resetForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const phone = String(resetPhoneInput && resetPhoneInput.value ? resetPhoneInput.value : "").trim();
    const code = String(resetCodeInput && resetCodeInput.value ? resetCodeInput.value : "").trim();
    const newPassword = String(resetPasswordInput && resetPasswordInput.value ? resetPasswordInput.value : "");
    if (!/^1\d{10}$/.test(phone)) {
      setStatus("请输入正确的手机号", true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setStatus("请输入6位短信验证码", true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (newPassword.length < 6) {
      setStatus("新密码至少6位", true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    try {
      const res = await fetch("/api/auth/password-reset/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.message || "重置密码失败", true);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      setStatus("");
      showResetSuccessDialog(data.message || "密码重置成功，请重新登录");
      if (resetPhoneInput) resetPhoneInput.value = "";
      if (resetCodeInput) resetCodeInput.value = "";
      if (resetPasswordInput) resetPasswordInput.value = "";
      if (submitBtn) submitBtn.disabled = false;
    } catch (_error) {
      setStatus("网络请求失败，请稍后重试", true);
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

(async () => {
  await loadPublicSettings();
  await checkLoggedIn();
})();
