const COS = require("cos-nodejs-sdk-v5");
const qiniu = require("qiniu");
const OSS = require("ali-oss");

let poolInstance = null;

const setMountHelpersPool = (pool) => {
  poolInstance = pool;
};

const parseMountConfig = (raw) => {
  try {
    if (!raw) return {};
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
};

const normalizeCosRegion = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^ap-[a-z0-9-]+$/i.test(raw)) return raw.toLowerCase();
  const matched = raw.match(/cos\.([a-z0-9-]+)\.myqcloud\.com/i);
  if (matched && matched[1]) return matched[1].toLowerCase();
  return raw.toLowerCase();
};

const normalizeQiniuRegion = (value) => String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];

const normalizeOssRegion = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (/^oss-[a-z0-9-]+$/i.test(raw)) return raw;
  if (/^[a-z]{2}-[a-z0-9-]+$/i.test(raw)) return `oss-${raw}`;
  const cleaned = raw.replace(/^https?:\/\//, "").split("/")[0];
  const endpointMatched = cleaned.match(/(?:^|\.)(oss-[a-z0-9-]+(?:-internal)?)\.aliyuncs\.com$/i);
  if (endpointMatched && endpointMatched[1]) return endpointMatched[1].toLowerCase().replace(/-internal$/, "");
  if (/^[a-z]{2}-[a-z0-9-]+$/i.test(cleaned)) return `oss-${cleaned}`;
  return cleaned.replace(/-internal$/, "");
};

const resolveQiniuZone = (value) => {
  const region = normalizeQiniuRegion(value);
  if (!region) return null;
  if (region.includes("z0") || region.includes("cn-east-1") || region.includes("huadong")) return qiniu.zone.Zone_z0;
  if (region.includes("z1") || region.includes("cn-north-1") || region.includes("huabei")) return qiniu.zone.Zone_z1;
  if (region.includes("z2") || region.includes("cn-south-1") || region.includes("huanan")) return qiniu.zone.Zone_z2;
  if (region.includes("na0") || region.includes("us-north-1") || region.includes("beimei")) return qiniu.zone.Zone_na0;
  if (region.includes("as0") || region.includes("ap-southeast-1") || region.includes("xinjiapo")) return qiniu.zone.Zone_as0;
  return null;
};

const normalizeObjectKey = (value) => {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
};

const encodeCosKey = (value) => normalizeObjectKey(value).split("/").map((part) => encodeURIComponent(part)).join("/");

const getMountById = async (id, userId) => {
  if (!poolInstance) {
    throw new Error("Pool not set. Call setPool() first.");
  }
  const [rows] = await poolInstance.query("SELECT * FROM mounts WHERE id = ? AND user_id = ? LIMIT 1", [id, userId]);
  if (rows.length === 0) return null;
  const mount = rows[0];
  return { ...mount, config: parseMountConfig(mount.config) };
};

const createCosClientByMount = (mount) => {
  const config = mount.config || {};
  const bucket = String(config.bucket || "").trim();
  const region = normalizeCosRegion(config.region || config.endpoint);
  const secretId = String(config.ak || "").trim();
  const secretKey = String(config.sk || "").trim();
  if (!bucket || !region || !secretId || !secretKey) {
    return { error: "挂载配置不完整，请检查 bucket、region、SecretId、SecretKey" };
  }
  return {
    bucket,
    region,
    client: new COS({
      SecretId: secretId,
      SecretKey: secretKey,
      Protocol: "https:"
    })
  };
};

const createQiniuClientByMount = (mount) => {
  const config = mount.config || {};
  const bucket = String(config.bucket || "").trim();
  const accessKey = String(config.ak || "").trim();
  const secretKey = String(config.sk || "").trim();
  const zone = resolveQiniuZone(config.region || config.endpoint);
  if (!bucket || !accessKey || !secretKey || !zone) {
    return { error: "挂载配置不完整，请检查 bucket、region、AccessKey、SecretKey" };
  }
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const qiniuConfig = new qiniu.conf.Config();
  qiniuConfig.zone = zone;
  qiniuConfig.useHttpsDomain = true;
  const bucketManager = new qiniu.rs.BucketManager(mac, qiniuConfig);
  const formUploader = new qiniu.form_up.FormUploader(qiniuConfig);
  const putExtra = new qiniu.form_up.PutExtra();
  const downloadDomain = String(config.domain || config.downloadDomain || config.cdnDomain || "").trim().replace(/\/+$/, "");
  return { bucket, mac, bucketManager, formUploader, putExtra, downloadDomain };
};

const createOssClientByMount = (mount) => {
  const config = mount.config || {};
  const bucket = String(config.bucket || "").trim();
  const region = normalizeOssRegion(config.region || config.endpoint);
  const accessKeyId = String(config.ak || "").trim();
  const accessKeySecret = String(config.sk || "").trim();
  const authorizationV4 = config.authorizationV4 === true || String(config.authorizationV4 || "").trim().toLowerCase() === "true";
  if (!bucket || !region || !accessKeyId || !accessKeySecret) {
    return { error: "挂载配置不完整，请检查 bucket、region、AccessKey、SecretKey" };
  }
  return {
    bucket,
    client: new OSS({
      region,
      bucket,
      accessKeyId,
      accessKeySecret,
      ...(authorizationV4 ? { authorizationV4: true } : {})
    })
  };
};

const cosRequest = (client, method, params) => new Promise((resolve, reject) => {
  client[method](params, (error, data) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(data || {});
  });
});

const qiniuBucketRequest = (bucketManager, method, ...args) => new Promise((resolve, reject) => {
  bucketManager[method](...args, (error, body, info) => {
    if (error) {
      reject(error);
      return;
    }
    if (info && Number(info.statusCode || 0) >= 400) {
      const message = body && body.error ? body.error : `请求失败(${info.statusCode})`;
      reject(new Error(message));
      return;
    }
    resolve(body || {});
  });
});

const qiniuUploadRequest = (formUploader, uploadToken, key, body, putExtra) => new Promise((resolve, reject) => {
  formUploader.put(uploadToken, key, body, putExtra, (error, uploadBody, uploadInfo) => {
    if (error) {
      reject(error);
      return;
    }
    if (uploadInfo && Number(uploadInfo.statusCode || 0) >= 400) {
      const message = uploadBody && uploadBody.error ? uploadBody.error : `请求失败(${uploadInfo.statusCode})`;
      reject(new Error(message));
      return;
    }
    resolve(uploadBody || {});
  });
});

const ensureObjectMount = (mount, res) => {
  if (!mount) {
    res.status(404).json({ message: "挂载不存在" });
    return false;
  }
  const type = String(mount.type || "");
  if (type !== "tencent" && type !== "qiniu" && type !== "aliyun") {
    res.status(400).json({ message: "当前挂载类型不支持对象存储操作" });
    return false;
  }
  return true;
};

module.exports = {
  setMountHelpersPool,
  parseMountConfig,
  normalizeCosRegion,
  normalizeQiniuRegion,
  normalizeOssRegion,
  resolveQiniuZone,
  normalizeObjectKey,
  encodeCosKey,
  getMountById,
  createCosClientByMount,
  createQiniuClientByMount,
  createOssClientByMount,
  cosRequest,
  qiniuBucketRequest,
  qiniuUploadRequest,
  ensureObjectMount
};
