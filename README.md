# 映墨 · Ying-Mo

> 写字，也和朋友一起记录生活。

**映墨（Ying-Mo）** 是一个面向现实朋友的小型、长期、邀请制记录空间。  
它不是公开内容平台，也不以流量、推荐或陌生人社交为目标，而是用于保存文章、随记、照片、旅行、学习记录，以及朋友之间共同经历的内容。

项目采用 **React + Vite** 前端、**Flask + SQLAlchemy** 后端，并围绕「成员准入、内容归属、Collection 权限、私有媒体、长期可维护」完成了完整的全栈实现。

---

## 项目定位

映墨希望解决一个很简单的问题：

> 有些内容值得长期保存，也值得和真正认识的人一起记录，但并不适合公开发布到互联网。

因此，项目从产品层面坚持以下边界：

- **邀请制注册**：只有持有站长邀请码的人能够成为成员。
- **公开页与内容空间分离**：游客只能看到站点介绍，不会看到成员作品、用户列表或内容统计。
- **内容归作者本人所有**：Article、Note、评论、媒体等都保留真实作者归属。
- **Collection 是共同记录空间**：由一个创建者和指定成员共同阅读、共同投稿。
- **权限由后端统一执行**：前端隐藏按钮不是权限边界，真正的 ACL 判断始终发生在服务端。
- **长期记录优先**：支持 Markdown、图片、Live Photo、公式、脚注、代码、归档、搜索与个人内容管理。
- **数据可带走、可恢复**：成员可导出自己的内容与原始媒体，站点维护者可创建、校验并恢复完整备份。

---

## 主要功能

### 内容创作

映墨统一使用 `Post` 承载两种主要内容类型：

- **Article**
  - 适合长文、教程、学习笔记、旅行记录等长期内容
  - 支持标题、摘要、Slug、Category、Tag
  - Markdown 安全渲染
  - 代码高亮
  - 表格
  - 脚注
  - 行内 / 块级数学公式
  - 长文目录与阅读进度

- **Note**
  - 适合短记录、生活片段和即时想法
  - 支持发生时间、地点、心情、外部视频链接
  - 同样支持 Markdown 与媒体内容

创作器支持：

- 草稿创建与编辑
- 约 1.2 秒延迟自动保存
- 手动保存
- 发布 / 归档
- 多窗口编辑冲突检测
- `edit_version` 乐观并发控制
- Markdown 快捷工具栏
- 编辑 / 安全预览切换
- 默认可视化图片块编辑，并保留可切换的 Markdown 源码模式
- 图片拖拽、文件选择和剪贴板粘贴，均按光标位置插入
- 图片块拖动或上下移动排序，以及 ALT、可见图注、尺寸、对齐设置
- 大图上传前浏览器端压缩、逐文件进度、取消与失败重试
- 正文内部媒体占位符（只在源码模式和存储层可见）
- 浏览器离线副本与意外关闭后的草稿恢复

站点同时提供可安装的 PWA 外壳。成员可从「个人资料 → 安装映墨」将站点添加到桌面、Dock、开始菜单或手机主屏幕，并通过应用图标快捷进入写随记、写文章和搜索。PWA 只预缓存无用户数据的前端静态外壳；API、文章内容与受保护媒体不进入 Service Worker 离线缓存。

---

### Collection 共同记录

Collection 用于保存多人共同经历，例如：

- 一次旅行
- 一个长期项目
- 一段共同生活
- 学习计划
- 朋友之间的专题记录

权限模型保持简单：

```text
Collection Creator
        +
Collection Members
        ↓
同时决定阅读权与投稿权
```

核心规则：

- 每个 Collection 只有一个 Creator。
- Creator 可以指定多个系统成员加入。
- Creator + Members 是唯一的普通读写 ACL。
- Collection 内 Post 不通过自身 visibility 扩大访问范围。
- 成员被移除后，立即失去普通读取与投稿权限。
- 作者仍可从个人管理入口处理自己曾发布的历史内容。
- Post 被移出 Collection 后自动成为独立 `private` 内容。
- Collection 删除后，内部 Post 自动脱离并回落为独立 `private`。

---

### 媒体与 Live Photo

媒体不是公开静态文件，而是受权限保护的资源。

支持：

- JPEG
- PNG
- WebP
- HEIC / HEIF
- 图片缩略图
- Post 正文图片
- Post / Collection 封面
- 用户头像
- iPhone Live Photo 图片 + 视频配对

生产环境媒体可存储在：

- 本地私有目录（开发）
- S3-compatible 私有对象存储
- 腾讯云 COS 等兼容服务

浏览器不会获得永久公开对象存储 URL。  
媒体读取仍会经过后端，并重新检查对应 Post / Collection 的访问权限。

Post、Collection 影像墙、年度回顾、我的媒体和往年今日复用同一套沉浸灯箱。图片以逻辑媒体记忆浏览，Live Photo 的静态图和动态片段只计为一个条目；灯箱支持深链接、键盘/滑动切换、缩放、焦点恢复和原 Post 跳转。列表读取缩略图，灯箱读取去除 EXIF 的授权 WebP 展示图并短时预加载相邻图片，只有媒体所有者可以下载原文件。生产环境建议安装 `ffmpeg`，用于把 Live Photo 动态片段转换为无元数据、浏览器友好的 H.264 MP4；转换或播放失败时仍显示静态照片。

成员可在写作页或媒体抽屉中维护 ALT 文本、可见图注、展示尺寸与对齐，也可在「我的媒体」中检索图片、下载原文件、识别重复文件并批量隐藏或恢复未绑定媒体；所有管理操作仍校验媒体所有权。

### 长期保存与回顾

- Collection 成员可独立选择「全部 / 仅重要 / 静音」通知；成员变化和所有权变更等直接通知不被静音吞掉。
- 「年度回顾」按当前访问权限汇总自己的发布内容、月份、类型、Collection、地点和媒体，不保存额外画像或公开榜单。
- 「数据导出」生成包含 Markdown、JSON 清单和本人原始媒体的 ZIP，不包含其他成员无权导出的数据。
- 运维备份覆盖数据库业务表和私有媒体，并在恢复前校验结构与文件校验和。

---

### 成员与互动

成员登录后可以：

- 浏览首页动态
- 查看 Article / Note
- 查看自己有权限进入的 Collection
- 搜索内容
- 按年月归档浏览
- 浏览 Category / Tag
- 查看成员主页
- 使用 6 种固定表情回应 Post 和评论
- 收藏
- 评论、一级引用回复与 `@` 当前可访问成员
- 接收带回复摘要和评论精确跳转的站内通知
- 管理自己的内容、评论、收藏与 Collection

---

### 账号与安全

账号系统包括：

- 邀请码注册
- 登录 / 登出
- Refresh Session
- 多设备会话管理
- 一键退出全部设备
- 邮箱验证
- 忘记密码
- 密码重置
- 重置后撤销既有 Refresh Session

邮箱验证不会阻断正常成员使用，主要用于建立可信的账号恢复通道。

一次性账号令牌：

- 原始 Token 不写入数据库
- 数据库仅保存 HMAC 摘要
- 支持过期、撤销、单次消费
- 密码重置接口避免邮箱枚举
- 邮件与日志避免输出完整敏感令牌

---

### Admin 后台

系统管理员拥有独立后台，用于站点治理与维护：

- Dashboard
- 用户管理
- Post 管理
- Collection 管理
- 评论管理
- Category / Tag 管理
- 媒体管理
- 首页精选内容管理
- 站点设置
- 系统通知
- Admin 操作日志

高风险操作要求填写 `reason`，并写入 Admin Log。

需要注意：

> `system_admin` 身份不会自动绕过普通内容 API 的 ACL。

管理员扩大读取范围只发生在专用 `/admin` 接口中。

---

## 隐私与访问控制

映墨的权限控制不是仅靠前端路由实现。

普通业务查询会在数据库查询阶段直接应用 ACL，包括：

- 首页
- Post 列表
- Collection
- 搜索
- Archive
- Profile
- Category
- Tag
- Favorite
- 评论
- 媒体

对于无权访问的登录用户，资源级接口通常返回 `404`，避免泄露对象是否存在。

游客访问内容 API 时统一要求认证。

公开 HTML 页面不会输出成员作品或用户私有数据：

```text
/
└── 站点介绍

/about
└── 关于映墨

成员内容
└── 登录 + 后端 ACL 后访问
```

Sitemap 只传播公开介绍页，RSS 默认关闭。

---

## 技术栈

### Frontend

- React 19
- React Router 7
- Vite 7
- Tailwind CSS 4 构建集成
- KaTeX
- highlight.js
- Fontsource Variable Fonts
  - Noto Serif SC Variable
  - JetBrains Mono Variable
- ESLint
- Node.js 原生 Test Runner

前端字体由项目自身打包和提供，避免 macOS、iOS、Android、Windows 因系统字体不同产生明显视觉差异。

### Backend

- Python 3.11+
- Flask 3
- Flask App Factory
- Flask Blueprint
- SQLAlchemy
- Flask-SQLAlchemy
- Flask-Migrate / Alembic
- Flask-JWT-Extended
- Flask-Limiter
- Flask-CORS
- Pillow
- Python-Markdown
- Bleach
- boto3
- PyMySQL
- Gunicorn
- Redis
- pytest

### Production Infrastructure

推荐生产架构：

```text
                ┌─────────────────────┐
                │      Browser        │
                │ Desktop / iOS /     │
                │ Android             │
                └──────────┬──────────┘
                           │ HTTPS
                           ▼
                ┌─────────────────────┐
                │        Nginx        │
                └─────────┬───────────┘
                          │
             ┌────────────┴────────────┐
             │                         │
             ▼                         ▼
┌────────────────────────┐   ┌────────────────────────┐
│ React / Vite dist      │   │ Flask / Gunicorn      │
│ Static Frontend        │   │ /api/v1               │
└────────────────────────┘   └───────────┬────────────┘
                                        │
                      ┌─────────────────┼─────────────────┐
                      │                 │                 │
                      ▼                 ▼                 ▼
             ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐
             │ MySQL 8        │ │ Redis        │ │ Private Object  │
             │ Business Data  │ │ Rate Limit   │ │ Storage / COS   │
             └────────────────┘ └──────────────┘ └─────────────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │ SMTP Provider   │
                               │ Account Email   │
                               └─────────────────┘
```

---

## 项目结构

```text
Ying-Mo-V3.2/
├── backend/
│   ├── app/                    # Flask 应用与业务模块
│   ├── migrations/             # Alembic 数据库迁移
│   ├── scripts/                # 校验与维护脚本
│   ├── tests/                  # 后端自动化测试
│   ├── .env.example            # 环境变量模板
│   ├── requirements.txt
│   ├── run.py
│   └── gunicorn.conf.py
│
├── frontend/
│   ├── src/
│   │   ├── components/         # 通用组件
│   │   ├── contexts/           # Auth / Theme 等上下文
│   │   ├── hooks/
│   │   ├── lib/                # API、Markdown、媒体等基础逻辑
│   │   ├── pages/              # 页面
│   │   └── styles/
│   ├── scripts/                # 构建产物校验
│   ├── tests/                  # 前端回归测试
│   ├── package.json
│   └── vite.config.js
│
├── docs/
│   ├── product.md              # 产品与业务规则基线
│   ├── backend/
│   │   ├── P0_ACCEPTANCE.md
│   │   ├── P1_ACCEPTANCE.md
│   │   └── VALIDATION.md
│   └── frontend/
│
└── README.md
```

### 文档入口

日常开发先读本 README，再按任务查产品或设计规范。以下目录统一说明现存文档的职责；后续直接维护对应文件，不新增平行规范或重复交接文档。

| 文档 | 作用 |
| --- | --- |
| [产品需求](docs/product.md) | 产品模型、权限、接口与业务规则的唯一需求基线 |
| [前端设计规范](docs/frontend/DESIGN.md) | 视觉、组件、布局及双端验收的唯一设计基线 |
| [前端启动说明](frontend/README.md) | 前端目录内的启动、构建、路由和认证／媒体约束速查 |
| [迁移说明](backend/migrations/README) | 数据库迁移目录入口，具体操作回到本 README |
| [共同回忆方案](docs/SHARED_MEMORY_DEVELOPMENT_PLAN.md) | 关系模型、并发、权限生命周期、测试矩阵及尚待执行的上线条件 |
| [产品审查](docs/PRODUCT_REVIEW_2026-09-08.md) | 2026-09-08 的产品判断、依据和后续方向；建议不自动成为需求 |
| [前端联调历史](docs/frontend/INTEGRATION_BASELINE.md) | 各阶段接口约定、实现细节与真实联调结果，非当前状态快照 |
| [后端验证历史](docs/backend/VALIDATION.md) | 实际命令、数据库／浏览器验证及外部环境缺口 |
| [P0 验收](docs/backend/P0_ACCEPTANCE.md) | 初始核心功能的需求—接口—测试对应矩阵 |
| [P1 验收](docs/backend/P1_ACCEPTANCE.md) | 阶段 21–27 创作、账号恢复、阅读与版本能力的完成定义 |
| [轻量互动验收](docs/backend/V37_ACCEPTANCE.md) | 回应、引用、提及、通知和失权边界的专项历史验收 |
| [媒体记忆验收](docs/backend/MEDIA_MEMORY_ACCEPTANCE.md) | 灯箱、Live Photo、相册和媒体权限的专项历史验收 |
| [原型说明](prototypes/editorial-scrapbook-v1/README.md) | 五张历史原型的索引、占位内容说明及适用边界 |
| [原型提示词](prototypes/editorial-scrapbook-v1/PROMPTS.md) | 原型图片的生成来源与制作意图，不作为当前规范 |

验收文档中的通过记录只对应当时执行范围，不代表当前代码或生产环境已通过。依赖清单 `backend/requirements.txt` 是安装输入，不属于可删除的说明文档；pytest 缓存内的 README 是工具生成文件，不进入项目文档体系。

---

## 本地开发

### 1. 克隆仓库

```bash
git clone https://github.com/InkSaku/Ying-Mo-V3.2.git
cd Ying-Mo-V3.2
```

### 2. 启动后端

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate

python -m pip install -r requirements.txt

cp .env.example .env
```

至少修改以下配置：

```env
SECRET_KEY=replace-with-a-strong-secret-at-least-32-bytes
JWT_SECRET_KEY=replace-with-another-strong-secret-at-least-32-bytes
REGISTRATION_INVITE_CODE=replace-with-your-invite-code
```

初始化数据库：

```bash
flask --app run.py db upgrade
```

如需创建系统管理员：

```bash
flask --app run.py create-admin
```

启动：

```bash
python run.py
```

默认后端地址：

```text
http://127.0.0.1:8000
```

---

### 3. 启动前端

新开一个终端：

```bash
cd frontend

npm ci
npm run dev
```

默认前端地址：

```text
http://127.0.0.1:5173
```

开发环境中，Vite 会自动将 `/api` 代理至：

```text
http://127.0.0.1:8000
```

如需修改：

```bash
VITE_DEV_API_PROXY=http://127.0.0.1:8000 npm run dev
```

---

## 环境变量

完整模板见：

```text
backend/.env.example
```

### 基础配置

```env
APP_ENV=development

DATABASE_URL=sqlite+pysqlite:///yingmo_dev.db

SECRET_KEY=...
JWT_SECRET_KEY=...
REGISTRATION_INVITE_CODE=...

CORS_ORIGINS=http://127.0.0.1:5173
SITE_URL=http://127.0.0.1:5173
```

### Production 数据库

```env
APP_ENV=production
DATABASE_URL=mysql+pymysql://user:password@host:3306/yingmo?charset=utf8mb4
```

### Redis

```env
RATELIMIT_STORAGE_URI=redis://127.0.0.1:6379/0
```

### 私有对象存储

```env
MEDIA_STORAGE_BACKEND=s3

S3_BUCKET=your-private-bucket
S3_PREFIX=yingmo-media
S3_ENDPOINT_URL=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

生产 Bucket 应保持私有。

### SMTP

```env
MAIL_BACKEND=smtp
MAIL_FROM=no-reply@example.com

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_USE_TLS=true
```

不要将真实 Secret、数据库密码、COS Key 或 SMTP Password 提交到 Git。

---

## 数据库迁移

查看当前迁移：

```bash
cd backend
flask --app run.py db heads
```

升级：

```bash
flask --app run.py db upgrade
```

当前迁移体系包括：

- V3.2 基线业务表
- P0 Release Schema
- `public → login_only` 数据迁移
- Post `edit_version`
- 邮箱可信与账号恢复相关 Schema
- 长期保存、轻量互动、媒体展示衍生图、图片版式与共同回忆关系 Schema；代码迁移头以 `db heads` 为准，目标数据库版本以 `db current` 为准

生产环境部署新版本前，应先备份数据库，再执行 migration。

---

## 测试与质量门禁

### Backend

```bash
cd backend

python -m pytest -q
python -m compileall -q app tests migrations scripts run.py gunicorn.conf.py
python scripts/verify_static.py
python -m pip check
```

### Frontend

```bash
cd frontend
npm run check
npm run test:e2e
```

`npm run check` 会执行：

```text
ESLint
  ↓
Node 回归测试
  ↓
Vite production build
  ↓
Bundle verification
```

`npm run test:e2e` 会启动隔离的临时后端与 Vite 服务，并用 Playwright Chromium 验证登录、自动保存、按光标插图、图片块设置与排序，以及移动端编辑布局；临时数据库和上传目录会在服务退出后清理。

完整的实际验证记录以：

[`docs/backend/VALIDATION.md`](docs/backend/VALIDATION.md)

为准。

---

## Production Build

前端：

```bash
cd frontend

npm ci
npm run check
```

成功后生产文件位于：

```text
frontend/dist/
```

可直接由 Nginx 提供。

构建同时生成：

```text
app.webmanifest
sw.js
workbox-*.js
pwa-192.png
pwa-512.png
pwa-maskable-512.png
```

PWA 在生产环境要求 HTTPS。建议让 Nginx 对 Service Worker 和 Web App Manifest 使用可重新验证的缓存策略：

```nginx
location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    try_files $uri =404;
}

location = /app.webmanifest {
    default_type application/manifest+json;
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}
```

其余带内容哈希的前端静态资源仍可长期缓存。部署脚本会在重新加载 Nginx 前检查 PWA 清单、Service Worker 和 HTML manifest 元数据是否存在。

后端：

```bash
cd backend

python -m pip install -r requirements.txt
flask --app run.py db upgrade

gunicorn --check-config -c gunicorn.conf.py run:app
gunicorn -c gunicorn.conf.py run:app
```

生产环境建议通过 systemd、Supervisor 或其他进程管理器托管 Gunicorn，而不是直接保持终端进程。

---

## 推荐上线流程

```text
Local Development
      ↓
Run Tests / Build
      ↓
git commit
      ↓
git push origin main
      ↓
Production Server
      ↓
git pull origin main
      ↓
Install Changed Dependencies
      ↓
Database Migration
      ↓
Frontend Build
      ↓
Restart Backend When Needed
      ↓
Smoke Test
```

常用流程：

```bash
# backend
cd backend
python -m pip install -r requirements.txt
flask --app run.py db upgrade

# frontend
cd ../frontend
npm ci
npm run check
```

只有 Nginx 配置发生变化时才需要重新加载 Nginx；单纯替换新的 `dist` 静态产物通常无需修改 Nginx 配置。

---

## 维护命令

创建管理员：

```bash
flask --app run.py create-admin
```

检查孤立媒体：

```bash
flask --app run.py cleanup-orphan-media --dry-run
```

删除确认后的孤立媒体：

```bash
flask --app run.py cleanup-orphan-media --delete
```

清理过期 Session：

```bash
flask --app run.py purge-expired-sessions
```

创建并校验完整备份：

```bash
flask --app run.py backup-create --output /secure/path/ying-mo-backup.zip
flask --app run.py backup-verify --input /secure/path/ying-mo-backup.zip
```

恢复会覆盖当前数据库业务数据和媒体目录，必须先在隔离环境验证，并显式确认：

```bash
flask --app run.py backup-restore --input /secure/path/ying-mo-backup.zip --confirm RESTORE
```

备份含密码哈希、账户资料及私有内容。生成文件权限会收紧为仅所有者可读写，但仍应存放在加密、受访问控制的目录或备份系统中。

---

## API

业务 API 统一位于：

```text
/api/v1
```

主要模块：

```text
/auth
/posts
/collections
/uploads
/comments
/interactions
/notifications
/search
/archive
/categories
/tags
/users
/admin
```

具体接口行为以代码、产品文档和测试为准，不建议把 README 当作 API Schema 的唯一来源。

---

## 设计原则

映墨没有试图成为“大而全”的内容社区。

项目刻意不引入：

- 公共内容广场
- 推荐算法
- 粉丝 / 关注体系
- 热榜
- 陌生人社交
- 复杂创作者等级
- 一人一码的邀请码追踪系统
- 普通成员之间的细粒度发布 / 评论资格体系

它更关注的是：

```text
长期保存
+
真实作者
+
朋友共同记录
+
清晰权限
+
私有媒体
+
可靠账号恢复
+
跨设备一致体验
```

---

## 项目状态

当前主线：

```text
main
```

项目已完成核心产品闭环，并进入以稳定性、部署维护和细节优化为主的阶段。

如需判断某项能力是否已经过真实自动化或外部基础设施验证，请查看：

```text
docs/backend/VALIDATION.md
```

README 只描述当前项目能力，不替代实际验证记录。

---

## License

当前仓库未附带独立开源许可证文件。

除非仓库后续明确加入 `LICENSE`，否则代码、设计与项目内容默认保留相应权利，不应视为自动授予复制、分发或商业使用许可。

---

<p align="center">
  <strong>映墨 · Ying-Mo</strong><br />
  写字，也和朋友一起记录生活。
</p>
