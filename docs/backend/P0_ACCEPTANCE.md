# Ying-Mo V3.2 P0 后端验收表

基线：`docs/product.md`（PRD V3.2）  
范围：数据库 + 后端  
状态说明：`完成/自动化通过` 表示实现及仓库内自动化验证均完成；`实现完成/外部待验证` 表示代码完成，但当前环境缺少真实外部服务。

| Requirement | Implementation | API | Database | Tests | Status |
|---|---|---|---|---|---|
| 邀请码注册 | 服务端环境变量、常量时间比较、错误不返回正确值、不持久化 | `POST /auth/register` | `users` 无邀请码字段 | invite 成败、零用户断言 | 完成/自动化通过 |
| username / nickname | username 小写、唯一、不可修改；nickname Unicode 可修改 | `/auth/register`, `PATCH /users/me` | username/email 唯一约束 | 规范化、冲突、不可修改 | 完成/自动化通过 |
| 登录/Refresh/Logout/Session | Header Access、HttpOnly Refresh、轮换与撤销、单会话/全部退出 | `/auth/login`, `/refresh`, `/logout`, `/sessions`, `/logout-all` | `refresh_sessions` + JTI 唯一 | 轮换后旧 Access 失效、撤销 | 完成/自动化通过 |
| 安全限流 | 默认 API + 注册/登录/刷新/评论/上传专项限流；生产 Redis | 所有 API | 无 | testing 关闭；production 初始化 | 完成/自动化通过 |
| User 权限 | 仅 user/system_admin；前台不因 Admin 扩权 | member/admin APIs | role/status check | Admin 普通内容读取仍 404 | 完成/自动化通过 |
| 统一 Post / Draft | Article/Note 共表；Draft 为 status | `/posts` | `posts` | 创建、草稿管理 | 完成/自动化通过 |
| 类型锁定 | 草稿可切换；首次发布后锁定 | `PATCH /posts/:id`, `/publish` | `published_at` 生命周期 | 发布后转换 422 | 完成/自动化通过 |
| 独立 visibility | 仅 login_only/private；默认 private | Post APIs | DB check | private 作者可读、他人 404；public DB 拒绝 | 完成/自动化通过 |
| Article Slug 注册表 | 永久占用、单一当前值、历史直接 301、同文恢复 | `/posts/slug/:slug` | `article_slugs`, current_post 唯一 | 历史/恢复/冲突/删除 404 | 完成/自动化通过 |
| Category | Admin CRUD/停用/排序/Slug 锁 | `/categories`, `/admin/categories` | `categories` | ACL 页面、计数 | 完成/自动化通过 |
| Tag | 标准化创建、并发去重、停用/更正/合并 | `/tags`, `/admin/tags` | `tags`, `post_tags` 唯一 | Tag ACL 与隐藏 Facet | 完成/自动化通过 |
| Collection creator/members | 单一 creator，正式成员表，creator 不重复 | `/collections` | `collections`, `collection_members` | creator/member/non-member | 完成/自动化通过 |
| 一键全选当前成员 | `select_all_members` 展开为当前 active user IDs，不保存永久模式 | create/update members | 逐条 membership | 后注册用户不自动加入 | 完成/自动化通过 |
| Collection ACL | creator OR member = read = contribute；统一 predicate | Collection/Post/aggregate APIs | SQL EXISTS scope | 全入口非成员泄漏矩阵 | 完成/自动化通过 |
| Post 加入/移动 | 仅作者；目标必须当前成员；事务提交 | `/posts/:id/move-collection` | `posts.collection_id` | A→B、非 creator 排序拒绝 | 完成/自动化通过 |
| 作者主动移出 | 作者可解除；变独立 private | `/posts/:id/remove-from-collection` | FK 清空 | 历史作者主动移出 | 完成/自动化通过 |
| creator 移除 Post | creator 只能解除关联，不删除/改作者 | `/collections/:id/remove-post` | Post/互动保留 | 核心回归 | 完成/自动化通过 |
| 移除成员历史作者例外 | 普通读取 404；管理入口仅自身正文和最小 collection_id | `/posts/me`, `/posts/me/:id`, PATCH | author_id 不变 | 响应无 Collection 名称/Slug | 完成/自动化通过 |
| 删除 Collection detach | 全部 Post 原子清空 collection_id 并 private | `DELETE /collections/:id` | 软删/空集合物理删 | detach 数据库断言 | 完成/自动化通过 |
| Collection 排序 | 手动值优先；未手动用 Article published/Note occurred fallback | `/collections/:id/reorder` | `collection_sort_order` | creator 顺序与权限 | 完成/自动化通过 |
| Home | 精选/最近 Article/Note/共同 Collection 均重做 ACL | `/home` | `featured_content` | 非成员标题/封面/数量不出现 | 完成/自动化通过 |
| Article/Note 列表详情 | 筛选、语义排序、分页、Canonical、互动；Article 邻接/相关 | `/posts`, `/posts/:id`, `/slug/:slug` | Post 关系 | 详情、401/404、Slug | 完成/自动化通过 |
| Archive | 年/月、筛选、语义时间、ACL 后 Facet/count/page | `/archive[/year[/month]]` | SQL extract/group | 隐藏月份与数量不泄漏 | 完成/自动化通过 |
| Search | Posts/Collections/Users、建议、Category/Tag Facet、精确分页 | `/search`, `/suggestions` | SQL scope before aggregate | secret query total=0 | 完成/自动化通过 |
| Category/Tag 页面数据 | 仅有权 Post、准确 total 和分页；写作选项包含未使用的 active Category | `/categories/:slug`, `/categories/options`, `/tags/:slug` | taxonomy relations | 无权 Tag 404、Category options | 完成/自动化通过 |
| User Profile | 公开资料 + 当前访问者可读内容和准确数量 | `/users/:username` | users/posts/members | Collection Post 泄漏测试 | 完成/自动化通过 |
| Personal Center | overview/posts/drafts/collections/favorites/comments/notifications/settings | `/users/me/*`, `/posts/me`, interaction/notification APIs | 现有实体聚合 | 私密计数与历史管理 | 完成/自动化通过 |
| 图片/Thumbnail | 实际解码、大小校验、缩略图、owner/binding、前端媒体描述与解绑 | `/uploads/images*`, `/bind` | `media` | 上传、401、404、owner preview、解绑清理引用 | 完成/自动化通过 |
| Avatar | 仅本人绑定；有效成员可读；游客 401 | `PATCH /users/me`, media proxy | users avatar FK | member/guest ACL | 完成/自动化通过 |
| Collection Cover | 仅 creator 管理；读取服从 Collection ACL | Collection create/update + media proxy | cover FK/binding | member 200/non-member 404 | 完成/自动化通过 |
| Live Photo | image+MOV/MP4 配对、真实图片/容器签名、成对绑定和代理 | `/uploads/live-photos*` | pair ID/index | manifest/video ACL | 完成/自动化通过 |
| 对象存储 | local private adapter；production S3-compatible private adapter | protected proxy only | storage_key metadata | local HTTP test；production client load | 实现完成/外部待验证 |
| 评论/回复/删除 | 一级回复、长度限制、分页、父占位、不级联回复 | `/comments` | `comments` | 删除父节点保留回复 | 完成/自动化通过 |
| Like/Favorite | Toggle、唯一约束、Favorite 当前 ACL | `/interactions/*` | unique(user,post) | toggle/count/list | 完成/自动化通过 |
| Notifications | 评论/回复/成员变化/投稿/移出/系统；无点赞通知；目标再鉴权 | `/notifications`, Admin send | `notifications` | canonical 与无 like | 完成/自动化通过 |
| Admin Dashboard/Users | 全站维护统计和用户基础信息 | `/admin/dashboard`, `/users` | 聚合 | Admin boundary | 完成/自动化通过 |
| Admin Posts/Collections | 搜索筛选、预览、隐藏恢复、删除/detach | `/admin/posts*`, `/collections*` | moderation/status/deleted | 日志与普通端 404 | 完成/自动化通过 |
| Admin Comments/Media | 列表、隐藏恢复、Media 软删 | `/admin/comments*`, `/media*` | status/deleted | media hide/restore | 完成/自动化通过 |
| Admin Categories/Tags | 列表计数，写操作、锁定与合并 | `/admin/categories`, `/admin/tags`, taxonomy writes | taxonomy | ACL/管理测试 | 完成/自动化通过 |
| Admin Featured/Settings | 精选 CRUD/排序；白名单设置 | `/admin/featured*`, `/settings` | featured/settings | Home 精选与设置 | 完成/自动化通过 |
| Admin Logs | 操作者、request ID、对象、前后值、原因、幂等键 | `/admin/logs` | `admin_logs` | 六类操作日志断言 | 完成/自动化通过 |
| Guest JSON 401 | 在资源查询前由 JWT 边界统一处理 | 所有内容 APIs | 无 | 13 个 API 表面参数化 | 完成/自动化通过 |
| 登录越权 404 | Post/Collection/Media/Slug/Comment/Interaction 统一隐藏存在性 | 对象 APIs | ACL predicates | 多用户矩阵 | 完成/自动化通过 |
| HTML Shell/privacy | 无动态数据、通用 Meta、noindex/no-store | content HTML routes | 无 | 内容字符串不出现 | 完成/自动化通过 |
| Sitemap/RSS | Sitemap 仅 `/`、`/about`；RSS 404 | `/sitemap.xml`, `/rss.xml` | 无 | URL 出口测试 | 完成/自动化通过 |
| 旧业务清理 | 无退休 Blueprint/model/API；旧路径 404 | 无 | 无旧表 | static scan + route test | 完成/自动化通过 |
| Migration/schema | 两步 Alembic；空库建 17 表；模型列对齐 | Flask CLI | 全部 P0 schema | subprocess migration test | 完成/自动化通过 |
| public 兼容迁移 | upgrade 统计并转 login_only；downgrade 不重新公开 | Alembic | visibility check 收紧 | legacy fixture upgrade/downgrade | 完成/自动化通过 |
| MySQL 8 | 生产 URL 强校验、utf8mb4、DDL 编译 | production app | MySQL dialect | 17 表 DDL compile | 实现完成/外部待验证 |
| 生产运行 | Gunicorn、ProxyFix opt-in、Redis limiter、S3 storage、health | `/api/v1/health` | MySQL target | production config load | 实现完成/外部待验证 |

## 外部验收阻塞

当前执行环境未提供真实 MySQL 8、Redis 和 S3-compatible bucket。对应实现、依赖、配置校验、方言编译和本地集成测试均已完成，但真实服务 I/O/压测必须在目标部署环境补跑；本表未将其标记为“自动化通过”。
