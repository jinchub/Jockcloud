# JockCloud 云盘系统

## 项目简介

JockCloud 是一个基于 Node.js + Express + MySQL 构建的私有云盘系统，支持文件上传、下载、分享、同步、用户权限管理等功能。

![JockCloud 云盘系统](cloud.jpg)
### 最近更新：2026-06-10
- **多存储盘与 NFS 支持：** 新增多磁盘管理与容量检测逻辑，支持自动挂载 NFS 远程目录作为存储盘。文件上传时会自动选择可用空间充足的存储盘。
- **用户组方案 (Plan Groups) 重构：** 移除了针对单个用户的独立空间配额设置，改为统一由“用户组”控制（配额、上传限制等），并新增了直观的“用户组方案对比”展示面板。
- **私密空间增强：** “隐藏空间”全面更名为“私密空间 (Private Space)”，并引入了**无操作自动退出**的安全机制。
- **加密文档预览：** 优化了 Office 预览逻辑，当遇到密码保护（加密）的文档时，不再直接抛出错误，而是渲染一个友好的 HTML 提示页面。
- **登录信息追踪：** 数据库新增记录用户的最后登录时间 (`last_login_at`) 和 IP (`last_login_ip`)，并在个人中心展示。
- **系统与日志：** 新增全局日志级别拦截控制 (`installConsoleLogLevel`)，并增加“不限制上传后缀”的全局开关。

### 主要功能

-  **文件管理**：上传、下载、删除、重命名、移动、复制、解压缩（zip/rar/7z 等）
-  **用户管理**：用户注册、用户组管理、角色权限控制（管理员/普通用户）
-  **文件分享**：创建分享链接、设置提取码、有效期管理
-  **文件同步**：本地文件夹与云端双向同步、增量同步、冲突处理
-  **配额管理**：用户/用户组存储空间配额、上传数量限制
-  **回收站**：软删除机制、30 天自动清理、一键恢复
-  **响应式设计**：支持 PC 端和移动端自适应
-  **深色模式**：支持深色/浅色/自动主题切换
-  **系统监控**：CPU、内存、磁盘、网络实时监控
-  **云存储挂载**：支持阿里云 OSS、腾讯云 COS、七牛云作为存储后端
-  **安全机制**：请求速率限制、短信验证码、登录会话管理

## 环境要求

### 必需环境

- **Node.js**: >= 14.x（推荐使用最新 LTS 版本，如 Node.js 18.x 或 20.x）
- **MySQL**: >= 5.7 或 MariaDB >= 10.2
- **npm**: >= 6.x（或使用 yarn/pnpm）

### 可选服务

- **阿里云短信服务**：用于短信验证码登录功能
- **云存储挂载**：
  - 阿里云 OSS
  - 腾讯云 COS
  - 七牛云 Kodo

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 文件并根据实际情况修改配置：

```bash
# 数据库配置
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

# 服务器配置
PORT=3000
HOST=0.0.0.0

# 阿里云短信服务配置（ 个人可用 - 阿里云号码认证（https://dypns.console.aliyun.com/smsServiceOverview））
# 阿里云号码认证
DYPNS_ACCESS_KEY_ID=你的 AccessKey ID
DYPNS_ACCESS_KEY_SECRET=你的 AccessKey Secret
DYPNS_REGION=cn-hangzhou
DYSMS_SIGN_NAME=你的短信签名
DYSMS_TEMPLATE_ID=你的短信模板 ID
```

### 3. 初始化数据库

在 MySQL 中创建数据库，系统会在首次启动时自动创建表结构。

**注意**：首次启动时会自动创建管理员账户：
- 用户名：`admin`
- 密码：`admin`

**请务必在首次登录后立即修改密码！**

### 4. 启动服务


#### 开发环境

```bash
npm run dev
```

#### 生产环境

```bash
npm start
```

启动成功后，访问 `http://localhost:3000` 即可使用。

## 系统架构

### 分层说明

- **接入与启动层**：`server.js` 负责启动服务，`src/app.js` 负责初始化 Express、数据库、日志、静态资源、HTML 模板渲染与定时任务。
- **路由层**：`src/routes/` 按功能拆分接口模块，覆盖认证、文件管理、上传下载、分享、私密空间、系统设置、同步、监控等能力。
- **服务层**：`src/services/` 封装认证运行时、上传中间件、下载限速、同步执行、压缩解压、回收站、分片上传会话等核心业务逻辑。
- **中间件层**：`src/middlewares/` 提供登录鉴权、请求限流、统一错误处理等横切能力，保证接口访问的一致性。
- **配置与工具层**：`src/utils/` 统一管理常量、默认配置、日志、权限、挂载配置、系统设置读写和各类辅助函数。
- **数据与存储层**：MySQL 负责用户、文件、分享、挂载、同步任务、系统设置等持久化；本地磁盘、NFS 挂载目录和对象存储共同承担文件实际存储。

### 请求处理流程

1. 客户端访问页面或 API。
2. Express 先经过限流、鉴权、监控、参数解析等中间件。
3. 路由模块根据业务类型分发到对应的服务层逻辑。
4. 服务层读写 MySQL、文件系统或云存储，并执行权限、配额、格式、限速等校验。
5. 定时任务在后台持续处理回收站清理、运行时清理和同步调度。

## 目录结构

```
jockcloud/
├── src/                           # 后端源代码目录
│   ├── app.js                     # 应用初始化、依赖装配、任务启动
│   ├── db.js                      # MySQL 连接与表初始化
│   ├── routes/                    # API 路由定义
│   │   ├── auth.js                # 登录、注册、验证码、会话
│   │   ├── entries.js             # 文件/文件夹增删改查
│   │   ├── uploads-basic.js       # 普通上传、分片上传
│   │   ├── downloads.js           # 下载、压缩包处理、预览相关下载
│   │   ├── shares.js              # 分享链接与分享下载
│   │   ├── hidden-space.js        # 私密空间校验与访问
│   │   ├── settings.js            # 系统设置读写
│   │   ├── sync-tasks*.js         # 同步任务与流式事件
│   │   ├── mounts.js              # 云存储挂载管理
│   │   └── ...
│   ├── services/                  # 业务服务层
│   │   ├── auth-runtime.js        # 登录、短信、用户组上传策略
│   │   ├── upload-middlewares.js  # 上传校验、落盘、磁盘选择
│   │   ├── download-runtime.js    # 下载限速
│   │   ├── sync-runner.js         # 单个同步任务执行器
│   │   ├── sync-service.js        # 同步任务调度入口
│   │   └── ...
│   ├── middlewares/               # 中间件
│   │   ├── auth.js                # 登录鉴权与管理员鉴权
│   │   ├── rate-limit.js          # 请求限流
│   │   └── error-handler.js       # 统一错误处理
│   ├── jobs/                      # 定时任务
│   │   ├── recycle-cleanup.job.js # 回收站清理
│   │   ├── runtime-cleanup.job.js # 运行时清理
│   │   └── sync-scheduler.job.js  # 同步调度
│   └── utils/                     # 常量、日志、权限、配置辅助
├── views/                         # 前端页面模板与未压缩 JS 源码
│   ├── js/                        # 前端 JavaScript 源码
│   ├── components/                # HTML 组件片段
│   └── *.html                     # 页面模板
├── public/                        # 静态资源与生成后的压缩 JS
│   ├── css/                       # 样式文件
│   ├── js/                        # 运行时使用的压缩脚本
│   └── avatar/                    # 默认头像 SVG
├── uploads/                       # 普通空间、头像、分片缓存等本地存储
├── hidden-uploads/                # 私密空间文件存储
├── logs/                          # 应用日志与错误日志
├── .env                           # 环境变量配置文件
├── package.json                   # Node.js 项目配置
├── server.js                      # 服务启动入口
└── README.md                      # 项目文档
```

## 主要 API 路由

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/captcha` - 获取验证码
- `POST /api/auth/sms-code` - 获取短信验证码

### 文件管理
- `GET /api/entries` - 获取文件列表
- `POST /api/entries` - 创建文件/文件夹
- `PUT /api/entries/:id` - 更新文件信息
- `DELETE /api/entries/:id` - 删除文件
- `POST /api/entries/move` - 移动文件
- `POST /api/entries/copy` - 复制文件

### 上传下载
- `POST /api/uploads` - 上传文件
- `GET /api/downloads/:id` - 下载文件
- `POST /api/upload-tasks` - 创建上传任务
- `GET /api/upload-tasks` - 获取上传任务列表

### 分享功能
- `GET /api/shares` - 获取分享列表
- `POST /api/shares` - 创建分享
- `DELETE /api/shares/:id` - 删除分享
- `GET /api/shares/:token` - 获取分享详情

### 回收站
- `GET /api/recycle` - 获取回收站文件
- `POST /api/recycle/restore` - 恢复文件
- `DELETE /api/recycle` - 彻底删除

### 用户管理
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户信息
- `DELETE /api/users/:id` - 删除用户
- `GET /api/profile` - 获取当前用户信息
- `PUT /api/profile` - 更新当前用户信息

### 系统管理
- `GET /api/admin-stats` - 获取系统统计信息
- `GET /api/system-monitor` - 系统监控
- `GET /api/online-users` - 在线用户
- `GET /api/storage-meta` - 存储元信息
- `GET /api/settings` - 获取系统设置
- `PUT /api/settings` - 更新系统设置

### 同步功能
- `GET /api/sync-tasks` - 获取同步任务列表
- `POST /api/sync-tasks` - 创建同步任务
- `PUT /api/sync-tasks/:id` - 更新同步任务
- `DELETE /api/sync-tasks/:id` - 删除同步任务

## 系统说明与配置

### 配置来源与优先级

系统配置主要来自 4 个层级，推荐按下面顺序理解：

1. **环境变量 (`.env`)**：服务启动参数、数据库连接、短信默认凭证等，应用启动时读取。
2. **系统设置（数据库 `settings` 表）**：运行时配置中心，管理员在页面上修改后立即生效或在下次读取时生效。
3. **代码默认值 (`src/utils/default-settings.js`)**：当数据库未配置时作为兜底值。
4. **代码常量 (`src/utils/constants.js`)**：底层固定常量和运行时边界，通常需要改代码才能调整。

### 环境变量说明

以下配置建议写入 `.env`：

**基础连接**：
- `DB_HOST` - MySQL 地址
- `DB_PORT` - MySQL 端口
- `DB_USER` - 数据库用户名
- `DB_PASSWORD` - 数据库密码
- `DB_NAME` - 数据库名称
- `PORT` - 服务端口，默认 `3000`
- `HOST` - 监听地址，默认 `0.0.0.0`

**可选项**：
- `MAX_UPLOAD_FILE_SIZE_MB` - 全局默认上传大小上限，默认 `10240`
- `LOG_LEVEL` - 日志输出级别，可选 `debug / info / warn / error / silent`
- `DYPNS_ACCESS_KEY_ID` - 阿里云短信/号码认证 AccessKey ID
- `DYPNS_ACCESS_KEY_SECRET` - 阿里云短信/号码认证 AccessKey Secret
- `DYPNS_REGION` - 阿里云号码认证区域
- `DYSMS_SIGN_NAME` - 短信签名
- `DYSMS_TEMPLATE_ID` - 短信模板 ID

**说明**：
- 短信配置优先级：**系统设置 > `.env` > 默认值**
- 日志级别会通过 `installConsoleLogLevel` 统一拦截 `console.log/info/warn/error`

### 系统设置页说明

管理员登录后可通过**系统设置**页面维护以下运行时配置：

**系统基础**：
- 网站标题、站点描述、登录页标题
- 请求速率限制开关、时间窗口和最大请求数
- 预览格式配置（图片、视频、音频、文本、文档）
- 多存储盘配置：本地盘、NFS 挂载目录、默认盘和容量检测

**上传相关**：
- 最大上传大小、最大文件数、最大并发数
- 分片上传阈值
- 上传分类规则（后缀白名单 + 分类大小限制）
- 头像上传大小与允许格式
- 全局“**不限制上传后缀**”开关（`uploadFormatUnlimited`）

**下载相关**：
- 全局下载速度限制
- 按用户组下载速度限制
- 分享下载速度限制

**登录与安全**：
- 登录验证码开关
- 短信验证码登录开关
- 登录会话时长
- 私密空间无操作自动退出时间
- 短信发送间隔、IP 窗口限制和最大次数

**权限与菜单**：
- 菜单可见范围（按用户/用户组）
- 移动端菜单显示控制
- 用户组方案控制上传大小、文件数、下载速度等限制

### 固定常量说明

以下配置属于代码内置边界，默认位于 `src/utils/constants.js`：

- `RECYCLE_RETENTION_DAYS` - 回收站保留天数，默认 30 天
- `RECYCLE_CLEANUP_INTERVAL_MS` - 回收站清理周期，默认 60 分钟
- `DEFAULT_LOGIN_SESSION_MINUTES` - 默认登录会话时长，默认 7 天
- `CAPTCHA_EXPIRE_MS` / `SMS_CODE_EXPIRE_MS` - 验证码过期时间，默认 5 分钟
- `SMS_SEND_INTERVAL_MS` - 短信最小发送间隔，默认 60 秒
- `DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB` - 分片上传阈值，默认 200 MB
- `CHUNK_SESSION_EXPIRE_MS` - 分片会话过期时间，默认 7 天
- `SYNC_SCHEDULER_CRON` - 同步调度周期，默认每 10 秒检查一次
- `PREVIEW_MEDIA_STREAM_CHUNK_BYTES` - 媒体预览流式读取块大小

### 存储与挂载说明

- **本地存储**：普通文件默认写入 `uploads/`，私密空间文件写入 `hidden-uploads/`
- **多存储盘**：系统可配置多个本地/NFS 存储根目录，上传时自动选择可写且空间满足要求的存储盘
- **云存储挂载**：支持阿里云 OSS、腾讯云 COS、七牛云，挂载配置保存在数据库，不依赖环境变量
- **前端资源**：`views/js/` 为源码，`public/js/` 为启动或请求时生成的压缩产物

## 默认配置值

### 文件上传限制
- 默认最大上传文件大小：10240 MB（10GB）
- 最大上传文件数量：100 个
- 最大并发上传数量：3 个
- 分片上传阈值：200 MB
- 头像上传大小限制：4 MB
- 头像支持格式：jpg、png、webp、bmp

### 回收站
- 文件保留天数：**30 天**（固定值，代码常量 `RECYCLE_RETENTION_DAYS`）
- 清理间隔：每小时检查一次

### 会话管理
- 默认登录会话时长：10080 分钟（7 天）
- 验证码过期时间：5 分钟
- 短信验证码发送间隔：60 秒
- 短信 IP 限制窗口：10 分钟
- 短信 IP 限制最大次数：10 次

### 速率限制
- 启用状态：开启
- 时间窗口：60 秒
- 最大请求数：100 次/分钟

## 安全机制

### 认证与授权

**登录认证**（auth.js、auth-runtime.js）：
- 密码加密存储（bcrypt）
- 登录会话管理（基于 Cookie，`cloud_sid`）
- 会话过期自动清理（数据库查询时验证 `expires_at`）
- 支持短信验证码登录（可选，需配置阿里云短信服务）
- RSA 加密传输登录密码（JSEncrypt，支持 PKCS#1 v1.5 和 OAEP 填充）

**权限控制**（permission-helpers.js）：
- 角色权限：管理员（`admin`）/ 普通用户（`user`）
- 文件权限：`upload`（上传）、`download`（下载）、`rename`（重命名）、`delete`（删除）、`move`（移动）、`copy`（复制）、`extract`（解压）、`viewArchive`（查看压缩包）
- 菜单权限：基于用户/用户组配置可访问的菜单项
- 用户组权限：批量管理用户权限（支持多用户组）
- 权限继承：用户组权限 > 默认权限

### 文件安全

- 文件软删除机制（回收站，`deleted_at` 字段标记）
- 存储空间配额限制（用户级 + 用户组级）
- 上传文件类型和大小限制（基于文件分类规则）
- 文件所有权验证（检查 `user_id`）
- 隐藏空间支持（私密文件存储，`space_type='hidden'`）
- 文件夹路径验证（防止路径穿越）

### 接口安全

**速率限制**（[rate-limit.js](file://c:\Users\emucoo\Desktop\jockcloud\src\middlewares\rate-limit.js)）：
- 基于 IP 的请求速率限制
- 可配置时间窗口和最大请求数
- 默认：60 秒内最多 100 次请求
- 支持系统设置界面动态配置

**短信频率限制**（[auth-runtime.js](file://c:\Users\emucoo\Desktop\jockcloud\src\services\auth-runtime.js)）：
- 短信发送间隔限制（默认 60 秒）
- IP 频率限制（默认 10 分钟最多 10 次）
- 验证码过期时间（5 分钟）

**其他防护**：
- 错误信息脱敏（数据库错误统一处理）
- 敏感操作日志记录（文件操作日志）
- 请求参数验证（配额、密码长度等）

### 数据安全

- MySQL 数据库持久化存储
- 支持云存储加密传输（HTTPS）
- 定期备份建议
- 会话 Token 随机生成（`crypto.randomBytes`）

## 日志管理

系统日志位于 `logs/` 目录：

- `app.log` - 应用运行日志（INFO 级别）
- `error.log` - 错误日志（ERROR 级别）


**查看日志**：

```bash
# 实时查看应用日志
tail -f logs/app.log

# 实时查看错误日志
tail -f logs/error.log

# 查看最近的错误
grep "ERROR" logs/error.log | tail -n 50
```

## 定时任务

系统内置以下后台定时任务：

### 1. 回收站清理任务
- **执行频率**：每天执行一次
- **功能**：清理超过 30 天的软删除文件
- **配置项**：`RECYCLE_RETENTION_DAYS`（默认 30 天）

### 2. 运行时清理任务
- **执行频率**：每 5 分钟执行一次
- **功能**：
  - 清理过期的上传会话（7 天未使用）
  - 清理临时文件
  - 清理过期的登录会话
  - 清理验证码缓存

### 3. 同步调度器
- **执行频率**：每 10 秒检查一次（`*/10 * * * * *`）
- **功能**：
  - 检查到期的同步任务
  - 执行计划同步
  - 处理同步冲突

**注意**：定时任务在应用启动后自动运行，无需额外配置。

## 故障排查

### 常见问题

#### 1. 数据库连接失败
- 检查 MySQL 服务是否启动
- 验证 `.env` 中的数据库配置
- 确认数据库用户权限

#### 2. 文件上传失败
- 检查 `uploads/` 目录权限
- 验证文件大小限制配置
- 查看磁盘剩余空间

#### 3. 短信验证码无法发送
- 检查系统设置中的短信配置是否完整
- 检查 `.env` 中的阿里云短信服务配置
- 确认 AccessKey 和 SecretKey 有效性
- 验证短信签名和模板 ID 是否正确
- 检查阿里云账户余额是否充足

#### 4. 端口被占用
- 修改 `.env` 中的 `PORT` 配置
- 或关闭占用端口的其他服务

### 查看日志

```bash
# 查看应用日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log
```

## 开发指南

### 技术栈

**后端**：
- Node.js + Express.js
- MySQL 2 (mysql2)
- bcrypt (密码加密)
- multer (文件上传)
- archiver (文件压缩)
- node-cron (定时任务)

**前端**：
- 原生 JavaScript (ES6+)
- HTML5 + CSS3
- FontAwesome (图标库)
- Chart.js (图表库)
- Monaco Editor (代码编辑器)


### 添加新功能

**1. 添加 API 路由**：

在 `src/routes/` 创建路由文件，例如 `api-demo.js`：

```javascript
module.exports = (app) => {
  app.get("/api/demo", authRequired, async (req, res) => {
    try {
      res.json({ message: "Hello" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};
```

在 `src/routes/register-all-routes.js` 中注册路由。

**2. 实现业务逻辑**：

在 `src/services/` 创建服务文件，封装业务逻辑。

**3. 添加前端界面**：

- 在 `views/components/` 添加 HTML 组件
- 在 `views/js/` 添加 JavaScript 逻辑
- 在 `src/app.js` 中注册静态资源路由


### 常用工具函数

```javascript
const utils = require("./utils");

// 加载环境变量
utils.loadEnvFile();

// 获取数据库配置
const dbConfig = utils.getDbConfig();

// 密码加密
const hash = await utils.hashPassword("password123");

// 验证密码
const valid = await utils.verifyPassword("password123", hash);
```


### PM2 部署示例

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name jockcloud

# 开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs jockcloud
```

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 许可证

MIT License

---

## 附录：数据库表结构说明

### 主要数据表

**users** - 用户表
- `id` - 用户 ID
- `username` - 用户名
- `password_hash` - 密码哈希
- `quota_bytes` - 存储配额（-1 为无限制）
- `role` - 角色（admin/user）
- `avatar` - 头像路径

**folders** - 文件夹表
- `id` - 文件夹 ID
- `user_id` - 所属用户
- `parent_id` - 父文件夹 ID
- `name` - 文件夹名称
- `space_type` - 空间类型（normal/hidden）

**files** - 文件表
- `id` - 文件 ID
- `folder_id` - 所属文件夹
- `original_name` - 原始文件名
- `storage_name` - 存储文件名
- `size` - 文件大小
- `file_category` - 文件分类

**shares** - 分享表
- `token` - 分享令牌
- `file_id` - 分享文件 ID
- `expire_at` - 过期时间
- `password` - 提取码

**sync_tasks** - 同步任务表
- `source_path` - 源路径
- `target_mount_id` - 目标挂载 ID
- `cron` - Cron 表达式

**settings** - 系统设置表
- `config_key` - 配置键
- `config_value` - 配置值（JSON）

**mounts** - 云存储挂载表
- `type` - 类型（tencent/qiniu/aliyun）
- `config` - 配置（JSON）

---

**注意**：
- 生产环境部署时，请务必修改默认密码和密钥
- 定期更新依赖包以修复安全漏洞
- 建议配置 HTTPS 以保证数据传输安全
- 定期备份数据库和上传文件
