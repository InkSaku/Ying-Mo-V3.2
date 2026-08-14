# Ying-Mo Backend V3.2

Ying-Mo V3.2 邀请制朋友记录空间的数据库与后端 Release Candidate。

唯一产品基线是 [docs/product.md](docs/product.md)。逐项验收见 [docs/P0_ACCEPTANCE.md](docs/P0_ACCEPTANCE.md)，真实验证记录见 [docs/VALIDATION.md](docs/VALIDATION.md)。

## 核心边界

- 注册必须提交服务端配置的邀请码；注册成功即是正常成员。
- 仅有 `user` 和 `system_admin`；没有发布资格、评论资格或内容管理员审批链。
- Article / Note 共用 Post，Draft 也是 Post；第一次发布后类型锁定。
- 独立 Post 仅支持 `login_only / private`。
- Collection 只有一个 creator；creator + members 是唯一读写 ACL。
- Collection Post 的 visibility 不影响 Collection ACL。
- 被移除成员无法继续普通读取/投稿，但能从作者管理入口处理自己的历史 Post。
- Post 脱离或 Collection 删除后自动成为独立 private。
- 游客内容 JSON API 统一 401；登录越权对象统一 404。
- 所有列表、搜索、归档、Profile、Facet、总数和媒体在 SQL/对象权限层先过滤。
- 普通内容接口不会因为调用者是 Admin 而扩大读取范围；扩展读取只在 `/admin`。
- 内容 HTML 仅返回无动态数据的通用 Shell；Sitemap 不传播内容 URL；RSS 关闭。

## 技术栈

- Python 3.11+
- Flask App Factory / Blueprint
- SQLAlchemy / Flask-Migrate / Alembic
- MySQL 8 production target；SQLite 仅用于本地开发和独立测试
- Flask-JWT-Extended / Flask-Limiter / Flask-CORS
- Pillow / Markdown / Bleach
- Local private storage（开发）/ S3-compatible private object storage（生产）
- Gunicorn / Redis rate-limit storage
- pytest

## 快速启动

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
flask --app run.py db upgrade
flask --app run.py create-admin
python run.py
```

开发默认地址：`http://127.0.0.1:8000`。

至少配置不同的 32-byte secrets 和邀请码：

```env
SECRET_KEY=<32 bytes or more>
JWT_SECRET_KEY=<a different 32 bytes or more>
REGISTRATION_INVITE_CODE=lyx0811
```

生产要求：

```env
APP_ENV=production
DATABASE_URL=mysql+pymysql://user:password@host:3306/yingmo?charset=utf8mb4
CORS_ORIGINS=https://your-frontend.example
RATELIMIT_STORAGE_URI=redis://redis:6379/0
MEDIA_STORAGE_BACKEND=s3
S3_BUCKET=yingmo-private
S3_REGION=...
SITE_URL=https://your-frontend.example
TRUST_PROXY_COUNT=1
```

S3 credentials 可以通过环境变量配置，也可以使用运行环境提供的 IAM role。Bucket 必须保持私有；后端只通过鉴权代理传输媒体，不返回永久公开 URL。

生产启动：

```bash
flask --app run.py db upgrade
gunicorn --check-config -c gunicorn.conf.py run:app
gunicorn -c gunicorn.conf.py run:app
```

`TRUST_PROXY_COUNT` 必须与真实反向代理层数一致；没有受信任代理时保持 `0`。

## API

统一前缀：`/api/v1`。

### Auth / Session

```text
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/logout-all
GET    /auth/me
GET    /auth/sessions
DELETE /auth/sessions/:id
```

注册字段：`username`、`nickname`、`email`、`password`、`invite_code`。

### Post / Personal content

```text
GET    /posts
GET    /posts/:id
GET    /posts/slug/:slug
POST   /posts
PATCH  /posts/:id
POST   /posts/:id/publish
POST   /posts/:id/archive
POST   /posts/:id/move-collection
POST   /posts/:id/remove-from-collection
DELETE /posts/:id
GET    /posts/me
GET    /posts/me/:id
```

普通列表支持 `post_type`、`author`、`category`、`tag`、`collection`、`sort`、`page`、`page_size`。管理列表额外支持 `status` 和个人搜索。

### Collection

```text
GET    /collections
GET    /collections/:slug
POST   /collections
PATCH  /collections/:id
GET    /collections/:id/members
PUT    /collections/:id/members
GET    /collections/member-options
POST   /collections/:id/remove-post
POST   /collections/:id/reorder
DELETE /collections/:id
```

创建或编辑成员可传 `member_ids`，或传 `select_all_members: true` 将当时所有其他 active 成员展开为正式成员记录。

### Discovery / Profile / Personal Center

```text
GET /home
GET /archive
GET /archive/:year
GET /archive/:year/:month
GET /search
GET /search/suggestions
GET /categories
GET /categories/:slug
GET /tags
GET /tags/:slug
GET /users/:username
GET /users/me/overview
GET /users/me/collections
GET /users/me/comments
GET /users/me/settings
```

### Media

```text
POST /uploads/images
POST /uploads/live-photos
POST /uploads/:media_id/bind
GET  /uploads/images/:public_id
GET  /uploads/images/:public_id/thumbnail
GET  /uploads/live-photos/:pair_id
GET  /uploads/manage/images/:public_id
GET  /uploads/manage/images/:public_id/thumbnail
```

普通媒体 URL 始终重新检查 Post/Collection ACL。`manage` 入口只允许媒体 owner，用于草稿和被移除历史作者预览。

### Comments / Interactions / Notifications

```text
GET    /comments?post_id=:id
POST   /comments
DELETE /comments/:id
POST   /interactions/posts/:id/like
POST   /interactions/posts/:id/favorite
GET    /interactions/posts/:id
GET    /interactions/favorites
GET    /notifications
POST   /notifications/:id/read
POST   /notifications/read-all
```

### Admin

```text
GET  /admin/dashboard
GET  /admin/users
GET  /admin/posts
GET  /admin/posts/:id
POST /admin/posts/:id/hide|restore
DELETE /admin/posts/:id
GET  /admin/collections
POST /admin/collections/:id/hide|restore
DELETE /admin/collections/:id
GET  /admin/comments
POST /admin/comments/:id/hide|restore
GET  /admin/categories
GET  /admin/tags
GET  /admin/media
POST /admin/media/:id/hide|restore
DELETE /admin/media/:id
GET|POST /admin/featured
PATCH|DELETE /admin/featured/:id
GET|PUT /admin/settings
POST /admin/notifications
GET /admin/logs
```

Category/Tag 写操作位于受 Admin 角色保护的 `/categories` 和 `/tags` API。隐藏、恢复、删除等高风险操作要求 `reason`，并写入 `admin_logs`。

## HTML 与索引出口

- `/` 与 `/about` 返回无动态内容 Shell，可索引。
- Article、Note、Collection、Profile、Archive、Category、Tag、Search、认证、个人中心和 Admin HTML 返回通用 `noindex,nofollow` Shell。
- 所有 Shell 使用 `private, no-store`，不包含作品、用户、统计、媒体或资源级 Open Graph。
- `/sitemap.xml` 只包含 `/` 和 `/about`。
- `/rss.xml` 返回 404。
- `/life/*`、`/games/*`、`/guide/*` 不注册，返回 404。

## Migration

```bash
flask --app run.py db heads
flask --app run.py db upgrade
```

当前 head：`20260814_0002`。

- `0001`：V3.2 基线业务表。
- `0002`：P0 Release 支撑 Schema、Admin/Featured/Settings/Logs、Session/Media/Slug 强约束，以及实际 `public → login_only` 数据迁移。
- `0002` downgrade 只放宽旧 Schema 兼容，不会把 `login_only` 批量改回 `public`。

## 测试与静态验证

```bash
python -m pytest -q
python -m compileall -q app tests migrations scripts run.py gunicorn.conf.py
python scripts/verify_static.py
python -m pip check
```

测试只能使用独立 `TEST_DATABASE_URL`；默认是 SQLite 内存数据库，不连接开发或生产库。

当前外部限制：此工作区没有真实 MySQL 8、Redis 和 S3 bucket，因此真实基础设施 migration/I/O/压测需在部署环境补跑；仓库内 migration、ACL、HTTP、MySQL dialect DDL 和 production 配置加载验证已完成，未把外部验证伪记为通过。

## 维护命令

```bash
flask --app run.py create-admin
flask --app run.py cleanup-orphan-media --dry-run
flask --app run.py cleanup-orphan-media --delete
flask --app run.py purge-expired-sessions
```
