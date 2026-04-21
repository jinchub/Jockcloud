const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { CAPTCHA_EXPIRE_MS, LOGIN_PASSWORD_RSA_OAEP_HASH } = require("./constants");

let captchaStore = new Map();
let smsCodeStore = new Map();
let smsIpRateStore = new Map();

const setCaptchaStore = (store) => {
  captchaStore = store;
};

const setSmsCodeStore = (store) => {
  smsCodeStore = store;
};

const setSmsIpRateStore = (store) => {
  smsIpRateStore = store;
};

const createCaptchaCode = () => {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const cleanupRuntimeAuthData = () => {
  const now = Date.now();
  captchaStore.forEach((item, key) => {
    if (!item || item.expiresAt <= now) {
      captchaStore.delete(key);
    }
  });
  smsCodeStore.forEach((item, key) => {
    if (!item || item.expiresAt <= now) {
      smsCodeStore.delete(key);
    }
  });
  smsIpRateStore.forEach((item, key) => {
    if (!item || !Array.isArray(item.timestamps)) {
      smsIpRateStore.delete(key);
      return;
    }
    const validTimestamps = item.timestamps.filter((ts) => now - ts <= item.windowMs);
    if (validTimestamps.length === 0) {
      smsIpRateStore.delete(key);
      return;
    }
    smsIpRateStore.set(key, { ...item, timestamps: validTimestamps });
  });
};

const generateCaptchaSvg = (code) => {
  const width = 100;
  const height = 40;
  
  // 生成验证码字符 - 统一字体大小和颜色，轻微旋转
  let chars = "";
  const charSpacing = width / (code.length + 1);
  const fontSize = 24;
  const fill = "#333333";
  
  for (let i = 0; i < code.length; i++) {
    const x = charSpacing * (i + 1);
    const y = height / 2 + 8;
    // 轻微旋转，增加可读性
    const rotate = (Math.random() - 0.5) * 10;
    chars += `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${fill}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rotate}, ${x}, ${y})">${code[i]}</text>`;
  }
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;height:32px;line-height:30px;margin-top:-10px;">
    ${chars}
  </svg>`;
  
  return svg;
};

const generateCaptcha = () => {
  cleanupRuntimeAuthData();
  const captchaId = crypto.randomBytes(12).toString("hex");
  const captchaCode = createCaptchaCode();
  const captchaSvg = generateCaptchaSvg(captchaCode);
  captchaStore.set(captchaId, {
    code: captchaCode,
    expiresAt: Date.now() + CAPTCHA_EXPIRE_MS
  });
  return { captchaId, captchaSvg, expiresInSeconds: Math.floor(CAPTCHA_EXPIRE_MS / 1000) };
};

const verifyCaptcha = (captchaId, captchaCode) => {
  cleanupRuntimeAuthData();
  const id = String(captchaId || "").trim();
  const code = String(captchaCode || "").trim().toUpperCase();
  if (!id || !code) return false;
  const saved = captchaStore.get(id);
  if (!saved || saved.expiresAt <= Date.now()) {
    captchaStore.delete(id);
    return false;
  }
  if (String(saved.code || "").toUpperCase() !== code) {
    return false;
  }
  captchaStore.delete(id);
  return true;
};

const normalizePhone = (phone) => String(phone || "").replace(/\D/g, "");

const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(String(password), saltRounds);
};

const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(String(password), String(hashedPassword));
};

const makeToken = () => crypto.randomBytes(32).toString("hex");

const decryptLoginPassword = (encryptedPassword, loginPasswordKeyPair) => {
  const encryptedBase64 = String(encryptedPassword || "").trim();
  if (!encryptedBase64) {
    throw new Error("密码加密数据不能为空");
  }
  try {
    const decrypted = crypto.privateDecrypt(
      {
        key: loginPasswordKeyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: LOGIN_PASSWORD_RSA_OAEP_HASH
      },
      Buffer.from(encryptedBase64, "base64")
    );
    return decrypted.toString("utf8");
  } catch (_error) {
    throw new Error("密码解密失败");
  }
};

module.exports = {
  setCaptchaStore,
  setSmsCodeStore,
  setSmsIpRateStore,
  createCaptchaCode,
  cleanupRuntimeAuthData,
  generateCaptcha,
  verifyCaptcha,
  normalizePhone,
  hashPassword,
  verifyPassword,
  makeToken,
  decryptLoginPassword
};
