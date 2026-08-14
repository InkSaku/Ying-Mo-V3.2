# Ying-Mo V3.2 后端实现状态

更新时间：2026-08-14

当前状态：**P0 后端 Release Candidate**。`docs/product.md` 是唯一需求基线；本文件只记录真实实现和验证状态。

## P0 已实现

### 身份、会话与安全

- [x] 邀请码注册；邀请码仅从服务端环境变量读取，使用常量时间比较，不入库、不进入 Token Claim。
- [x] username 小写标准化、3–32 字符、唯一且注册后不可修改；nickname 支持 Unicode、可重复、可修改。
- [x] 登录、Access Token、HttpOnly Refresh Cookie、Refresh 轮换、Session 撤销、单会话撤销、全部退出。
- [x] 注册、登录、Refresh、评论、上传专项限流和 API 默认限流；生产强制共享限流存储。
- [x] `user / system_admin` 权限；普通内容接口不会因 Admin 身份扩大读取范围。
- [x] 请求 ID、统一错误结构、安全响应头、CORS、生产密钥校验和可信反向代理配置。

### Post、Draft、Slug 与 Taxonomy

- [x] Article / Note 统一 Post；Draft 使用 `posts.status=draft`。
- [x] 草稿阶段类型可切换；首次发布后类型锁定；发布时间不因编辑改变。
- [x] 独立 Post 仅 `login_only / private`；数据库和服务端拒绝 `public`。
- [x] Article / Note 发布校验、Markdown 安全渲染、外部 URL 校验、归档、作者编辑和删除语义。
- [x] Article Slug 注册表、永久占用、数据库级单一当前 Slug、历史 301、同文章恢复历史 Slug、删除/越权 404。
- [x] Category 管理、停用、名称唯一、首次使用后 Slug 锁定。
- [x] Tag 标准化创建、并发去重、关系表、停用、首次使用后 Slug 锁定和 Admin 合并。

### Collection 与统一 ACL

- [x] 单一 creator、`collection_members`、创建/编辑成员和 `select_all_members` 当前成员快照。
- [x] creator/member 同时获得读取与投稿权限；非成员统一 404。
- [x] 统一 SQL ACL predicate 被 Home、Post、Collection、Search、Archive、Profile、Category、Tag、Favorite 和媒体复用。
- [x] Post 由作者加入/移动 Collection；绑定后 visibility 规范化为 private。
- [x] 作者与 creator 均可移出关联；移出不删除 Post，作者和互动不变。
- [x] 成员移除后历史 Post 保留；普通读取 404；作者管理接口仅返回最小 Collection 标识。
- [x] Collection 删除原子 detach 全部 Post 并设为 private；空且从未共享 Collection 可物理删除。
- [x] Collection 内默认语义时间和 creator 手动排序。

### 阅读、聚合与个人中心

- [x] Home：权限过滤后的精选 Article/Collection、最近 Article、最近 Note、共同 Collection。
- [x] Article / Note 列表筛选、排序、分页、详情、Canonical、互动状态；Article 上下篇和相关文章再次应用 ACL。
- [x] Archive 年/月路由、语义时间、筛选、SQL 权限过滤后的月份 Facet 和分页总数。
- [x] Search Post/Collection/User、建议、Category/Tag Facet 和精确分页总数。
- [x] Category / Tag 页面数据 API、权限过滤后的使用数与分页。
- [x] User Profile 与权限过滤后的准确 Post/Collection 数量。
- [x] Personal Center 概览、我的 Post/草稿/Collection/收藏/评论/通知/设置，以及历史作者管理详情。

### 媒体、互动与通知

- [x] JPG/PNG/WebP 真实解码、15 MB 单文件限制、缩略图、所有权和绑定校验。
- [x] Live Photo 图片/视频双文件配对、MP4/MOV 容器签名校验、原子绑定和受保护播放代理。
- [x] Post 图片、Thumbnail、Avatar、Collection Cover 与历史作者媒体管理入口。
- [x] 媒体 ACL 跟随独立 Post 或 Collection；游客 401、登录越权 404、`private, no-store`。
- [x] 本地私有存储适配器和生产 S3-compatible 私有对象存储适配器；不生成永久公开 URL。
- [x] Like/Favorite toggle 与唯一约束；Favorite 列表重新应用当前 ACL。
- [x] 一级评论/回复、1–500 字符、分页、带回复父评论删除占位、Admin 隐藏。
- [x] 评论/回复、Collection 成员变化、新投稿、移出关联和系统通知；无点赞通知；通知目标重新裁决 ACL。

### Admin、隐私出口与工程

- [x] Dashboard、Users、Posts、Collections、Comments、Categories、Tags、Media、Featured、Settings、Logs。
- [x] Post/Collection/Comment/Media 隐藏与恢复；Post/Collection/Media 高风险删除。
- [x] 高风险操作日志：操作者、请求 ID、时间、对象、前后值、原因和幂等键。
- [x] 通用无数据 SPA Shell、内容/认证/Admin `noindex,nofollow`、私密缓存。
- [x] Sitemap 仅 `/` 与 `/about`；RSS 404；旧 Life/Game/Guide 路由 404。
- [x] 运行时无 Game、Guide、旧 Life、Reports、发布资格、评论资格、Collection 审核与投稿策略代码。
- [x] 两个 Alembic migration；空库可升级到 17 张业务表；模型与迁移列集合一致。
- [x] `public → login_only` 有实际数据迁移、数量输出和不会重新公开的安全 downgrade。
- [x] Gunicorn 生产配置、MySQL 8 URL 校验、S3 私有存储和 Redis 限流依赖。

## 验证状态

- [x] 完整 pytest：38 passed。
- [x] Python compileall。
- [x] `scripts/verify_static.py`。
- [x] Alembic 空库 upgrade、legacy visibility upgrade/downgrade、Schema/Model 对齐。
- [x] MySQL dialect 对 17 张模型表和索引完成 DDL 编译。
- [x] Production 配置加载验证（MySQL URL、S3 adapter、Redis limiter）。
- [x] Gunicorn 配置检查、进程启动、Health 和受保护 HTML Shell HTTP smoke。
- [ ] 真实 MySQL 8 实例执行 migration：当前环境没有可连接的 MySQL 服务。
- [ ] 真实 S3-compatible bucket 上传/读取与真实 Redis 限流压测：当前环境没有相应外部凭证和服务。

以上三项外部验证未伪造成“已通过”；代码路径、配置校验和本地私有存储集成测试已完成。详细逐项验收见 `docs/P0_ACCEPTANCE.md`，命令记录见 `docs/VALIDATION.md`。

## 非 P0

尚未实现且不计入本次 P0：邮箱验证、找回密码、自动保存/ETag、Explore、数学公式、脚注、往年今日、阅读统计、Revision、举报、多对多 Collection、关注、私信、实时协作、推荐算法和 creator 转让。
