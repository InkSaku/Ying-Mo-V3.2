# Ying-Mo 后端实现状态

更新时间：2026-08-24

当前状态：**P0、P1 阶段 21–27、V3.3–V3.7 与媒体记忆增强均已实现**。媒体记忆增强包含逻辑媒体、沉浸灯箱、Collection 筛选相册、Live Photo、展示衍生图、深链接与 ACL 撤销。`docs/product.md` 是唯一需求基线；本文件只记录真实实现和验证状态。

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
- [x] 前端可消费的媒体描述、Post `bound_media` 管理清单与 owner 安全解绑；解绑封面或头像时同步清理引用。
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
- [x] 十一个 Alembic migration；空库可升级到 23 张业务表；模型与迁移列集合一致。
- [x] `public → login_only` 有实际数据迁移、数量输出和不会重新公开的安全 downgrade。
- [x] Gunicorn 生产配置、MySQL 8 URL 校验、S3 私有存储和 Redis 限流依赖。

## 第二十一阶段：创作与长文阅读增强

- [x] Markdown 工具栏覆盖标题、引用、无序/有序列表、代码块、脚注及行内/块公式，重复触发和选区恢复有回归保护。
- [x] 安全预览与保存后正文共用 Markdown 渲染链；表格、脚注、公式占位、代码与 XSS 白名单行为一致。
- [x] 草稿在真实变更后自动创建/保存；自动保存、手动保存和发布前保存串行化，失败保留本地正文。
- [x] `edit_version` 前置版本和 SQLAlchemy version column 双层防覆盖，冲突返回 409，服务端最新正文不会被旧窗口覆盖。
- [x] Article Outline、稳定标题 ID、目录、阅读进度、按需语法高亮和宽内容局部滚动完成；Note 不展示目录和阅读进度。

## 第二十二阶段：邮箱可信与账号恢复闭环

- [x] 邀请码注册仍立即获得完整成员能力；注册同时生成邮箱验证令牌，邮件发送失败不会回滚账号或留下不可重试的有效令牌。
- [x] 验证与重置原始令牌只通过邮件 URL fragment 传递；数据库仅保存以服务端密钥 HMAC 的摘要，并校验用途、目标邮箱快照、过期、撤销和单次消费。
- [x] 验证邮件申请需要当前登录身份，并具有重复请求冷却；邮箱验证成功写入 `email_verified_at`，旧验证令牌同时失效。
- [x] 密码重置仅向 active 且邮箱已验证的账号发信；未知、未验证、受限和冷却路径与有效路径统一返回 202，避免账号枚举。
- [x] 重置密码继续使用 8–128 字符策略；成功后消费令牌、撤销其他重置令牌和全部 Refresh Session，并清除当前 Refresh Cookie。
- [x] 测试/开发/生产邮件后端分别支持 memory、console、SMTP + STARTTLS；生产配置强制 SMTP、TLS、HTTPS `SITE_URL` 和必要发件参数。
- [x] Console 与邮件失败日志不输出完整邮箱、完整链接或原始令牌；账户页使用 `no-referrer`，误入 Query 的令牌也会清除。
- [x] 密码重置成功通过无敏感数据的同源事件使其他标签页立即结束本地会话并释放受保护媒体。

## 第二十三阶段：内容浏览完整化

- [x] Article 列表支持作者、Category、Tag、Collection 与发布/更新排序；Note 列表支持作者、Tag、Collection 与发生时间/更新时间排序，全部状态写入可分享 URL。
- [x] 新增 ACL 感知、按 Article/Note 类型裁剪的筛选选项；筛选、总数、分页与越界回退保持一致。
- [x] 统一公开 Post 浏览序列化；Article 卡片补齐发布、更新、Category、Tags、Collection 与阅读时间，Note 卡片补齐发生时间、地点、心情、Tags、Collection 与影像入口。
- [x] Note 无显式封面时，批量选取按绑定时间和 ID 排序的第一张有效图片或 Live Photo 静态图片，隐藏/删除媒体不会成为缩略图。
- [x] Article 详情明确展示发布、更新和阅读时间；Note 详情明确区分记录时间与发布时间，并展示地点、心情、媒体、标签和合集。
- [x] Archive 前端接通作者、Category、Tag、Collection 筛选；年月 Facet 和结果继续统一使用 Article `published_at`、Note `occurred_at ?? published_at`。

## 第二十七阶段：相关阅读增强

- [x] Article 详情页最多展示 4 篇相关阅读；不足时按真实数量展示，无结果时不渲染区块。
- [x] 候选在关系计算前应用统一 Post / Collection ACL，排除草稿、隐藏、删除和无权 Collection 内容；当前仍可读的 archived Article 保持可发现。
- [x] 静态关系严格按 Collection、Category、共同 Tag 数量、同作者轻量加分排序；同分按发布时间与 Post ID 稳定排序。
- [x] 同作者不能单独构成候选资格；不使用阅读、点赞、收藏、热度、画像、AI 相似度或个性化信号。
- [x] 卡片展示由实际命中规则生成的合集、分类、共同标签和同作者原因，不以无关最新内容补位。

## V3.3：Collection 时间轴与共同回忆

- [x] Collection 时间轴按 Article `published_at`、Note `occurred_at ?? published_at` 统一语义时间倒序展示。
- [x] 年份、作者、Article / Note 筛选、稳定分页、年份 Facet 和作者选项均在 Collection ACL 后计算。
- [x] 共同影像墙仅返回当前 Collection 有效 Post 绑定的 active 图片与 Live Photo 静态画面，并保留原 Post、作者和受保护媒体路径。
- [x] Creator 可选择并排序最多 6 条关键记录；member 无权修改，Post 移出或移动时自动清除关键状态。
- [x] 非成员及被移除成员访问 Collection 时间轴或媒体墙统一 404，不泄露年份、作者、数量和媒体存在性。
- [x] Alembic `20260822_0007` 增加关键记录排序字段、约束与索引，并覆盖降级和重升。

## V3.4：未来成员自动加入

- [x] Collection 创建与管理支持默认关闭的 `auto_add_future_members` 开关，只有 creator 可修改。
- [x] 新用户注册事务内批量加入开启该设置的正常 Collection，并立即获得与手动成员相同的阅读和投稿权限。
- [x] 现有成员不补加；关闭开关不会移除既有自动成员，被手动移除的成员不会在登录时重新加入。
- [x] 成员关系记录 `manual / future_member_auto` 来源，自动加入产生明确说明读写权限的站内通知。
- [x] Alembic `20260822_0008` 为既有 Collection 和成员安全回填默认值，并覆盖降级、重升与数据保留。

## V3.4：全局通知感知增强

- [x] 新增只返回当前用户未读总数的轻量接口；未认证与受限账号继续服从统一认证规则。
- [x] 桌面导航、移动菜单和菜单按钮显示未读数量，超过 99 时收敛为 `99+`。
- [x] 首次读取不弹历史通知；会话内新增通知通过 60 秒轮询、窗口焦点和页面恢复触发轻量 Toast。
- [x] 单条与全部已读操作会触发角标更新；计数失败不阻断页面，Toast 可关闭并具有无障碍状态播报。
- [x] 用户停留在通知中心时，会话内新通知事件同步刷新当前列表。
- [x] 通知中心以背景、未读标签、边线和字重共同区分状态，移动菜单跳转后自动收起。

## V3.5：Collection Creator 转让

- [x] 当前 creator 可将 Collection 原子转让给一名当前 active member；非 creator、非成员、受限成员和自转让均被拒绝。
- [x] 目标成员成为唯一 creator 并退出普通成员关系；旧 creator 转为普通成员，继续拥有阅读与投稿权，但立即失去 Collection 管理权。
- [x] 条件更新和事务约束保护重复/并发提交，不改变 Post 作者、成员之外的既有关系、排序、关键记录、未来成员策略和 Slug 生命周期。
- [x] 新旧 creator 分别收到站内通知；转让写入包含 request ID 与前后 creator ID 的结构化管理日志。
- [x] 管理页只列出当前 active member，并以高风险区、权限结果说明和二次确认完成操作。

## V3.6：长期保存能力

- [x] 成员 ZIP 数据导出包含个人资料、本人 Post Markdown、关系 JSON 与本人原始媒体。
- [x] 站点完整备份支持创建、校验和显式确认恢复，覆盖 SQLAlchemy 业务表、私有媒体与 SHA-256 完整性清单。
- [x] Collection 通知偏好支持全部、仅重要与静音；直接成员/治理通知始终送达。
- [x] 年度回顾以当前 ACL 汇总本人内容；媒体管理支持 ALT、原件下载、重复检测及安全批处理。
- [x] Alembic `20260823_0009` 新增通知偏好表与媒体长期管理字段。

## V3.7：轻量互动

- [x] Post 与 active 评论支持六种固定回应；每人每目标最多一种，幂等设定/清除接口可安全配合前端乐观更新。
- [x] 既有 Like 表与数据迁移为 `heart` Post 回应；旧 Like API 作为兼容适配保留，Favorite 与回应继续分离且回应不发通知。
- [x] 回复保持一级扁平结构并返回引用目标；评论 UUID 请求标识防止重试重复，删除正文同步移除其提及与回应。
- [x] 提及候选与提交均在 SQL/后端按 Post 当前 ACL 和 active 成员状态裁决；提及关系结构化保存并去重。
- [x] 通知返回当前可读 active 评论摘要和带页码定位能力的精确评论深链；失权后摘要、目标与 ID 脱敏。
- [x] Collection `all / important / muted` 继续控制评论、回复与提及通知，直接治理通知始终送达。
- [x] Alembic `20260824_0010` 增加回应、提及、评论幂等字段与索引，并将既有 Like 安全转换为 heart 回应。

## 媒体记忆与沉浸灯箱

- [x] 图片与 Live Photo 使用统一逻辑媒体 DTO；配对视频不重复计数，解析器重新裁决 Post / Collection ACL。
- [x] 上传生成去 EXIF、限定尺寸的 WebP 展示图与缩略图；原件保留在私有存储且只允许所有者下载。
- [x] Live Photo 动态片段在可用时转换为去元数据 H.264 MP4；浏览器不支持或转换失败时继续提供静态照片。
- [x] Collection 媒体接口支持年份、作者、图片/Live Photo 筛选和分页，并返回语义时间、地点、作者和原 Post。
- [x] 单媒体解析、Collection 相册、我的媒体和媒体文件读取均使用当前 ACL；成员移除后统一 404。
- [x] Alembic `20260825_0011` 增加展示衍生文件键，既有媒体通过首次授权读取惰性补齐，不破坏原件。

## 验证状态

- [x] 完整 pytest：124/124 passed。
- [x] 前端 `npm run check`：ESLint、83/83 Node 回归、生产构建和包体预算全部通过。
- [x] Python compileall。
- [x] `scripts/verify_static.py`。
- [x] `MANIFEST.sha256` 已按当前后端源码重建，并由静态门禁执行可重复校验；旧重构路径不再冒充当前发布清单。
- [x] Alembic 空库 upgrade 到 `20260825_0011`、legacy visibility upgrade/downgrade、Post 版本回填，以及 Revision `0006` 至媒体记忆 `0011` 的降级/重升与 Schema/Model 对齐。
- [x] MySQL dialect 对 23 张模型表和索引完成 DDL 编译。
- [x] Production 配置加载验证（MySQL URL、S3 adapter、Redis limiter、SMTP/TLS/HTTPS 邮件配置约束）。
- [x] Gunicorn 配置检查、进程启动、Health 和受保护 HTML Shell HTTP smoke。
- [x] 真实 MySQL 实例 migration：从 `20260823_0009` 的 DDL 部分提交状态安全恢复至 `20260824_0010`，已有回应数据保留；隔离测试覆盖正常、改名中断和旧表缺失路径。
- [x] 当前真实 MySQL 已继续升级到 `20260825_0011`，原有两条媒体记录保留并新增展示衍生键。
- [ ] 真实 S3-compatible bucket 上传/读取与真实 Redis 限流压测：当前环境没有相应外部凭证和服务。
- [ ] 真实 SMTP 服务上的 STARTTLS 握手、投递、退信与 SPF/DKIM/DMARC/DNS：当前环境没有可投递域名和凭证。
- [x] 阶段 27 隔离浏览器验收：0/1/2/4 篇、原因文本、卡片跳转、ACL 不泄露、浅深色、1280px/390px 与 Console 均通过；验收中发现并修复紧凑卡片误隐藏原因文本。
- [x] V3.4 通知感知隔离浏览器验收：桌面角标、390px 菜单角标、未读/已读视觉层级、全部已读角标回落和移动菜单收起均通过。
- [x] V3.5 Creator 转让隔离浏览器验收：桌面与 390px、浅深色、候选筛选、二次确认、旧 creator 保留读写、新 creator 管理入口与转让通知均通过，Console 无错误。
- [x] V3.7 轻量互动隔离浏览器验收：六种回应、引用、提及候选、通知摘要/深链、390×844 无横向溢出与 Console 均通过；隔离 HTTP 全表面回归通过。
- [x] 媒体记忆隔离浏览器验收：Post 与 Collection 入口、筛选相册、Live Photo、深链接刷新、键盘切换、双击缩放、390×844 无溢出、无权通用错误与 Console 均通过。
- [ ] 阶段 22 真实浏览器运行验收：此前尝试时桌面策略拒绝本地 HTTP 导航；阶段 27 已可在当前环境运行，但尚未倒推补验阶段 22 的账户恢复流程。

以上外部验证未伪造成“已通过”；代码路径、配置校验、本地私有存储和内存邮件集成测试已完成。P0 逐项验收见 `docs/backend/P0_ACCEPTANCE.md`，阶段 21–27 见 `docs/backend/P1_ACCEPTANCE.md`，命令记录见 `docs/backend/VALIDATION.md`。

## 后续 P1 / 非本次范围

尚未实现且不计入阶段 21–27：举报、多对多 Collection、关注、私信、实时协作和推荐算法。邮箱验证、找回密码、草稿自动保存/版本冲突、数学公式、脚注、阅读统计、内容浏览筛选、Revision、往年今日、Explore、静态相关阅读和 creator 转让已实现，不再列入未完成范围。
