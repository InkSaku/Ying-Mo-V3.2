# 映墨 · Ying-Mo

写字，也和朋友一起记录生活。面向现实朋友的邀请制记录空间，支持文章、随记、私有媒体、共同合集、互动与回顾。技术栈为 React 19 + Vite、Flask + SQLAlchemy。

## 按需阅读

| 资料 | 用途 |
| --- | --- |
| [产品规范](docs/product.md) | 按章节查业务模型、权限与接口 |
| [UI 规范](docs/frontend/DESIGN.md) | 视觉、组件、布局、动效与响应式 |
| [前端说明](frontend/README.md) | 启动、路由、认证与媒体约束 |
| [共同回忆](docs/backend/SHARED_MEMORY.md) | 关系模型、权限生命周期与并发约束 |
| [续火花](docs/backend/SPARK.md) | 浏览器后台、服务器部署与维护 |
| `designs/`、`docs/frontend/prototypes/`、`docs/assets/` | 按需查看 UI 原型、插画与截图 |
| `skills/yingmo-handdrawn-ui/SKILL.md` | 项目的详细 UI 风格参考 |

## 目录

```text
backend/app/          Flask 业务、权限、媒体、备份与续火花
backend/migrations/   连续增量迁移，数据库升级所需
backend/scripts/      本地续火花启动、UI 演示数据生成
frontend/src/         页面、组件、样式与客户端逻辑
frontend/public/      图标、PWA 和品牌视频
frontend/scripts/     构建产物与包体校验
deploy/              部署脚本与后台 systemd 服务
docs/                产品、设计与必要的开发运维说明
designs/             UI 设计资料
```

## 本地开发

后端（Python 3.11+）：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
# 编辑 .env 后继续
flask --app run.py db upgrade
flask --app run.py create-admin
python run.py
```

`.env` 至少设置不同且各不少于 32 字节的 `SECRET_KEY`、`JWT_SECRET_KEY`，以及 `REGISTRATION_INVITE_CODE`。完整变量见[环境模板](backend/.env.example)。开发默认使用 SQLite；后端监听 `http://127.0.0.1:8000`。

另开终端启动前端：

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

地址为 `http://127.0.0.1:5173`，`/api` 默认代理到后端；`VITE_DEV_API_PROXY` 可覆盖代理地址。

使用续火花还需第三个终端：

```bash
cd backend
.venv/bin/python -m playwright install chromium
.venv/bin/python scripts/run_local_spark.py
```

脚本仅面向本机开发，首次生成并保存固定加密密钥。首次生成后重启网站后端，再打开 `/tools/spark`。详见[续火花说明](docs/backend/SPARK.md)。

## 开发验证

```bash
cd frontend
npm run check
```

依次执行 ESLint、Vite 生产构建、路由包体与 PWA 缓存规则校验。产物位于 `frontend/dist/`；`npm run preview` 可本地预览。历史自动化测试及专用测试工具已移除，修改后按涉及范围验证页面、API 与权限。

后端在 `backend/` 中执行：

```bash
python -m compileall -q app migrations scripts run.py gunicorn.conf.py
python -m pip check
flask --app run.py db heads
```

迁移及写入验证使用临时数据库。

## 数据库迁移与部署

在 `backend/` 执行 `flask --app run.py db heads` 查看代码迁移头，`db current` 查看目标数据库版本，`db upgrade` 升级。迁移目录是数据库升级链，不能作为历史记录删除。部署前先完成并校验备份。

生产环境使用 `APP_ENV=production`、MySQL、共享 Redis 限流、私有 S3 兼容存储和 SMTP。配置明确的 `SITE_URL`、`CORS_ORIGINS` 与安全 Cookie；密钥、数据库及对象存储密码只放环境变量。建议安装 `ffmpeg` 转换 Live Photo 视频。

服务器默认路径为 `/var/www/yingmo`，已有部署环境运行 `bash deploy/deploy.sh`。脚本要求 `main` 分支和干净工作区，更新代码、停止已安装的续火花后台、安装依赖、迁移、重启后端及后台、构建前端并检查 Nginx 与健康端点。首次配置续火花服务见[部署说明](docs/backend/SPARK.md)。

Nginx 提供 `frontend/dist/` 并将 `/api` 转发到 Gunicorn。PWA 要求 HTTPS；`/sw.js` 使用 `Cache-Control: no-cache, no-store, must-revalidate`，`/app.webmanifest` 使用 `Cache-Control: no-cache`；带哈希的静态资源可长期缓存。API、成员内容及受保护媒体不得进入 Service Worker 离线缓存。

## 维护

在 `backend/` 中运行：

```bash
flask --app run.py create-admin
flask --app run.py cleanup-orphan-media --dry-run
flask --app run.py purge-expired-sessions
flask --app run.py backup-create --output /secure/path/ying-mo-backup.zip
flask --app run.py backup-verify --input /secure/path/ying-mo-backup.zip
```

确认孤立媒体后使用 `cleanup-orphan-media --delete`。恢复会覆盖数据库业务数据与媒体，先在隔离环境验证：

```bash
flask --app run.py backup-restore --input /secure/path/ying-mo-backup.zip --confirm RESTORE
```

备份含账号与私有数据，需安全保管。旧 Schema 备份需在匹配旧代码的隔离环境恢复，再升级迁移。

## 关键约束

- 游客仅访问公开介绍与账号流程；成员内容 API 均需登录，统一前缀 `/api/v1`。
- Collection 创建者与成员共同决定普通读写权限；内容移出或合集删除后回落为独立 `private`。
- 作者归属不变；管理员仅在专用后台 API 获得扩展读取权限。
- 媒体通过受保护 API 读取；退出或会话失效时释放本地 Blob URL。
- Access Token 仅存前端内存，Refresh Token 由 HttpOnly Cookie 管理。
- 数据库迁移、备份恢复、续火花浏览器依赖与上游许可证都是运行维护所需文件。

## License

项目未附独立开源许可证，代码、设计与内容保留相应权利。续火花上游代码的 MIT 许可与出处见 `backend/app/spark/vendor/LICENSE` 和 `NOTICE.md`。
