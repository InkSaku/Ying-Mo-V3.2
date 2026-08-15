# Frontend Integration Baseline

更新时间：2026-08-15

当前阶段、剩余任务和下一次启动步骤见 `docs/frontend/DEVELOPMENT_HANDOFF.md`。

## 基线约定

- 最初业务与后端基线：`8273a531e55eda363f3b1164a08924c6a83f2aca`；当前工作区 Git 基线已推进到 `4d206aa9991f52698a04f56bb38bbeb574eb8d59`，阶段 21/22 仍为未提交修改。
- 前端起点：本地工作区在“前端功能全覆盖与完整联调”任务开始前已经存在的 `frontend/`。
- 用户已明确要求保留该本地前端作为后续开发基线；不得删除重建或用模板覆盖。
- 第一阶段只处理阻塞前端联调的后端契约，不修改现有前端页面。
- 根 `.gitignore` 已限定为只忽略运行时上传目录，避免继续把 `backend/app/uploads/` 源码误当作上传文件忽略。

## 第一阶段契约

- Post、Collection、User 返回可解析的嵌套媒体描述，不再只提供无法映射读取路由的整数媒体 ID。
- Post 详情返回当前绑定的 `bound_media`；作者管理详情额外返回 owner-only 管理路径。
- `DELETE /api/v1/uploads/:media_id/bind` 允许 owner 解绑图片或整组 Live Photo，并同步清理封面或头像引用。
- `GET /api/v1/categories/options` 返回全部 active Category，供 Article 编辑器选择；它不承担 ACL Facet 计数职责。
- `/categories` 与 `/tags` 返回受保护 SPA Shell，使列表页可直接刷新。

后续阶段应继续以 `docs/product.md`、`docs/frontend/SKILL.md` 和 `docs/frontend/DESIGN.md` 为约束，并在每个阶段分别记录构建与真实接口验证结果。

## 第二阶段：认证、会话与受保护媒体

- Access Token 改为仅保存在运行时内存，不再写入 `sessionStorage`；页面重新加载时只通过 HttpOnly Refresh Cookie 恢复登录。
- API 客户端统一处理单次并发刷新、认证失效广播、结构化错误、字段级错误和 Blob 响应。
- 新增受保护媒体 Blob URL 生命周期管理；组件卸载、切换资源、退出登录或认证失效时会释放对象 URL。
- Post、Collection 封面和用户头像已接入鉴权媒体读取，媒体描述中的完整 `/api/v1/...` 路径不会被重复拼接 API 前缀。
- 新增 `/me/sessions` 会话管理页，支持查看当前与其他设备、撤销单一会话、退出当前设备和退出全部设备。
- 高风险会话操作使用可聚焦、可按 Escape 关闭、支持 Tab 焦点循环并能恢复原焦点的确认对话框。
- 注册页支持后端字段级校验反馈；通用错误页在开发环境显示 HTTP 状态、错误码和 Request ID。

## 第二阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 85 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 41 项。
- 隔离数据库 HTTP 端到端验证通过：注册、创建两个会话、撤销其他会话、上传并设置头像、匿名媒体读取返回 401、鉴权媒体读取返回 200、退出全部设备。
- 本阶段未污染仓库自带开发数据库或上传目录；联调服务使用 `/tmp/yingmo-codex.*` 临时目录。

## 第三阶段：Post 作者管理

- `/me/posts` 已接入 `GET /posts/me` 的状态、类型、关键词与分页参数，提供草稿、已发布、已归档的完整作者视图。
- 草稿可通过真实 `POST /posts/:id/publish` 发布；Article 发布确认会收集并校验 Slug，Note 直接遵循服务端内容校验。
- 已发布内容可通过真实 `POST /posts/:id/archive` 归档；所有状态均可编辑，并通过真实 `DELETE /posts/:id` 删除。
- 发布或归档内容的“阅读”操作会先请求普通读取接口并使用服务端 canonical 路径，避免把作者管理权限误当作普通阅读权限。
- 仍绑定在旧 Collection 的作者内容提供“移出合集”操作，调用 `POST /posts/:id/remove-from-collection`，完成被移除成员的最小管理闭环。
- 发布、归档、移出合集和删除均提供明确确认、等待、成功与失败反馈；删除文案区分未发布草稿和发布过的内容。

## 第三阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 85 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 41 项；`scripts/verify_static.py` 通过。
- 隔离数据库真实接口流程通过：筛选草稿、发布 Article、读取 canonical、归档、删除、移除 Collection 成员、普通读取返回 404、作者管理读取返回 200、移出合集后普通读取恢复 200。

## 第四阶段：写作与 Media

- Article 编辑器已补齐标题、摘要、正文、Slug、Category、Tags、封面、Collection 和独立可见性；Note 保持正文、Tags、发生时间、地点、心情、外部视频、媒体、Collection 和独立可见性。
- Category 选择使用 `GET /categories/options`，不会因当前可见内容计数为零而漏掉 active Category。
- 发布前提供类型相关客户端校验；第一次发布后类型控件锁定，最终校验与状态变化仍以服务端响应为准。
- 图片上传使用 `POST /uploads/images`，Live Photo 使用 `POST /uploads/live-photos`，并通过真实 bind API 将普通图片或整组配对绑定到 Post。
- 新内容上传媒体前会先自动创建草稿；已有内容会先保存当前字段，再执行上传与绑定，避免产生没有 Post 上下文的前端假状态。
- 普通图片可以设为、替换或取消封面；媒体移除使用真实 unbind API，Live Photo 会整组解绑。
- 作者编辑器优先使用 `manage_path` / `manage_thumbnail_path`，确保被移出 Collection 后仍可管理自己的历史媒体；普通详情页只使用正常受保护读取路径。
- Post 详情已展示普通图片与 Live Photo 图片/视频，图片和视频均通过带 Authorization 的 Blob 请求读取，并继承统一对象 URL 释放机制。

## 第四阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 88 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 41 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 隔离数据库真实媒体流程通过：Article Category、封面上传与设置、作者 manage 路径、发布详情、匿名封面 401／鉴权封面 200、无正文 Note 图片发布、Live Photo 双文件上传与配对绑定、受保护视频 200、整组解绑后媒体数量正确收敛。

## 第五阶段：Collection 完整管理

- 新增 creator-only 的 `/collections/:slug/manage` 管理页；普通成员只能阅读和投稿，页面入口与实际写操作均受权限约束。
- Collection 创建与管理覆盖标题、简介、Slug、成员和封面；首次共享内容后锁定 Slug，最终规则仍由服务端校验。
- 成员管理接入 `GET /collections/:id/members`、`GET /collections/member-options` 和 `PUT /collections/:id/members`，支持逐人选择、全选快照、移除确认，以及已失效成员提示。
- 内容管理支持提交完整 `post_ids` 顺序进行排序，也支持 creator 将任意作者的 Post 移出 Collection；只对当前用户自己的 Post 显示编辑入口。
- 删除 Collection 使用真实删除接口并明确提示后果：Collection 被删除，原有 Post 解除绑定并按独立可见性规则继续存在。
- Collection 列表补齐分页；创建页补齐成员选项的加载、失败、空状态和重试反馈。

## 第五阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 90 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 41 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 三账号隔离数据库真实接口流程通过：成员列表与候选项、creator 排除、成员新增、封面替换与旧文件解绑、成员鉴权读取封面、共享后 Slug 锁定、非 creator 排序拒绝、creator 排序、移出他人 Post、成员移除后的 ACL 收敛、管理读取兜底、删除 Collection 后 Post 解除绑定并恢复独立可见性。

## 第六阶段：搜索完整化

- 搜索框接入 `GET /search/suggestions`，输入停止 300ms 后发起请求；新的输入会取消上一轮等待或请求，避免旧建议覆盖新关键词。
- 建议面板分别标记 Post 标题和 Collection 名称，并提供加载、空、错误与重试状态；支持上下方向键选择、Enter 搜索、Escape 关闭和鼠标操作。
- 搜索提交与建议选择统一写入 URL `q` 参数并重置页码；Post 结果接入服务端分页元数据，非法超大页码会收敛到最后一页。
- 结果按 Posts、Collections、Users、Categories、Tags 五组展示，Category 与 Tag 使用服务端 ACL 过滤后的 Facet 和计数，不在前端自行聚合。
- 搜索进行中保留搜索框并提供局部 Loading 状态；无关键词、无结果、请求失败均有独立反馈，移动端搜索框与按钮改为单列布局。

## 第六阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 90 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 41 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 三账号隔离数据库真实 HTTP 联调通过：Collection 成员搜索得到 22 条匹配内容和完整 Collection/User/Category/Tag 分组，第二页返回 2 条；非成员仅得到 21 条独立内容，私有标题、Collection、Category 和 Tag 均未出现在结果或建议中；无匹配建议返回两个空数组。
- 当前桌面会话未提供可调用的浏览器控制接口，因此本阶段未执行浏览器点按与视觉回归；键盘建议交互仅完成实现审查与生产构建验证，不记录为已做浏览器验证。

## 第七阶段：Category / Tag 完整入口

- 新增受保护的 `/categories` 与 `/tags` 列表页，并将分类和标签入口加入桌面与移动端成员导航；两个列表页之间提供一致的切换导航。
- Category 列表使用 `GET /categories`，展示名称、说明和服务端返回的 `visible_post_count`；Tag 列表使用 `GET /tags`，展示名称和同样经过 ACL 过滤的可见内容计数。
- `/categories/:slug` 与 `/tags/:slug` 改为调用各自的专用详情 API，不再绕过 taxonomy 资源直接查询通用 Post 列表。
- 详情页展示真实名称、Category 说明、可见内容总数、Post 列表和服务端分页；页码写入 URL，超出范围时收敛到最后一页。
- 列表和详情均覆盖 Loading、Error 与 Empty 状态；移动端 taxonomy 卡片改为单列，详情计数与标题纵向排列。
- 移动端成员菜单改为内容自适应的可滚动面板，避免增加分类、标签入口后依赖固定高度造成底部操作重叠。

## 第七阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 92 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 41 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 三账号隔离数据库真实 HTTP 联调通过：Collection 成员可见 2 个 Category 与 2 个 Tag，非成员只看到关联独立可读内容的各 1 个；Category 与 Tag 的 21 条可见内容在第二页均精确返回 1 条，列表计数和详情总数一致。
- ACL 边界符合后端既定语义：未登录读取列表为 401；无权 Tag 详情为 404；无权 Collection 内容唯一关联的 Category 不出现在列表，但直接进入 active Category 详情会得到计数 0 的空页面，不泄漏 Post。
- 当前桌面会话仍未提供可调用的浏览器控制接口，因此本阶段未执行浏览器点按与视觉回归；响应式菜单和页面布局仅完成代码审查与生产构建验证。

## 第八阶段：用户主页

- `/users/:username` 完整展示公开头像、nickname、username、简介、地区、当前访问者可见 Post 与共同 Collection，以及两组分别经过 ACL 过滤的总数。
- Profile API 新增兼容查询参数 `posts_page`、`collections_page` 和 `page_size`，并分别返回 `posts_pagination`、`collections_pagination`；旧调用不传参数时仍保持第一页 20 条的行为。
- Posts 与 Collections 在同一主页独立翻页，页码分别写入 URL 且互不覆盖；翻页时保留主页上下文、显示局部更新状态，并尊重 `prefers-reduced-motion`。
- 本人查看自己的主页时提供“编辑公开资料”入口；无简介和无共同内容时提供明确空状态，移动端标题、统计和分组标题改为纵向布局。
- 修复 Profile API 的隐私缺口：独立 `private` Post 不再因为访问者恰好是作者而进入公开用户主页或计数，仍只存在于作者个人管理范围。
- `user` 对象继续只使用 `public_dict()`，不返回 email、role、status、登录时间或其他 self-only 字段。

## 第八阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 92 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 42 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 新增自动化回归覆盖双列表独立分页、公开字段白名单、隐藏 Collection、不合法分页，以及作者本人主页排除独立 private Post。
- 三账号隔离数据库真实 HTTP 联调通过：访问者视角返回 2 篇可见 Post 与 2 个共同 Collection，两个第二页均精确返回 1 条；作者本人主页返回 3 篇主页可见内容与 3 个有权 Collection，private Post 仍未出现。
- 未登录用户主页 API 返回 401，不合法页码返回 422，受保护 `/users/:username` HTML Shell 返回 200 且不嵌入数据。
- 当前桌面会话仍未提供可调用的浏览器控制接口，因此本阶段未执行浏览器点按与视觉回归；响应式布局和双分页交互仅完成代码审查与生产构建验证。

## 第九阶段：个人中心

- 新增统一 `PersonalNav`，在概览、我的内容、我的 Collection、收藏、我的评论、通知、个人资料和登录会话之间提供一致入口；移动端支持横向滚动且保留 active 状态。
- 新增 `/me/collections` 页面并接入 `GET /users/me/collections`，展示创建或参与的 Collection、服务端总数、分页、空状态和创建入口；概览中的 Collection 指标已改为指向该页面。
- 收藏、我的评论和通知从固定前 50 条改为真实分页，页码写入 URL，页面标题展示服务端总数。
- `GET /users/me/comments` 增加 ACL 校验后的最小 Post 描述与 canonical，评论历史不再只显示不可操作的 `Post #id`，Article 与 Note 均可进入真实阅读地址。
- 通知单条已读与全部已读补齐等待、禁用和失败反馈；刷新时保留当前列表上下文。
- 个人资料页完整接入 `GET /users/me/settings` 与 `PATCH /users/me`，补齐首屏 Loading、读取失败重试、保存反馈、客户端空昵称校验和字符计数；头像上传、替换和移除留在紧随其后的独立 Avatar 阶段。

## 第九阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 94 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 42 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 评论互动自动化回归补充验证：已删除评论在个人历史中保留占位，所属 Article 返回 `/articles/:slug` canonical。
- 双账号隔离数据库真实 HTTP 联调通过：概览准确返回 13 个 Collection、21 个收藏和 21 条评论；我的 Collection、收藏、评论、通知四个列表的第二页均精确返回 1 条。
- 真实资料保存后 `nickname`、`bio`、`region` 读取一致；评论记录包含 Note canonical；单条已读和全部已读执行后概览未读通知数归零。
- 未登录个人中心 API 返回 401，受保护 `/me/collections` HTML Shell 返回 200 且不嵌入业务数据。
- 当前桌面会话仍未提供可调用的浏览器控制接口，因此本阶段未执行浏览器点按与视觉回归；统一导航和移动端横向滚动仅完成代码审查与生产构建验证。

## 第十阶段：Avatar 完整管理

- 个人资料页新增 `AvatarManager`，接入真实 `POST /uploads/images` 与 `PATCH /users/me`，不使用 Base64 持久化、公开图片地址或前端假状态。
- 文件选择阶段校验 JPEG、PNG、WebP 和 15 MB 上限，并使用本地 Object URL 展示“待确认预览”；只有点击确认后才上传和设置头像，URL 在更换、取消或卸载时释放。
- 首次设置与替换使用同一工作流；替换成功后调用 `DELETE /uploads/:old_id/bind` 清理旧头像绑定，并同步刷新个人资料页和全局 Auth 用户信息。
- 移除头像使用危险操作确认，先通过真实 unbind 清理媒体绑定，再以 `avatar_media_id: null` 调用 `PATCH /users/me`；成功后个人中心和用户主页回退到昵称首字占位。
- 上传、替换、清理和移除均提供 busy、disabled、成功与失败反馈；文件选择本身不会显示为“已保存”。

## 第十阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 95 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 42 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 头像自动化回归扩展覆盖：首次设置、第二张图片替换、旧媒体解绑、当前头像保持为新媒体、移除后 `avatar_media_id` 与 `avatar_media` 同时归空。
- 双账号隔离数据库真实 HTTP 联调通过：首次头像设置后其他成员读取 200、游客读取 401；替换并解绑后旧头像对其他成员返回 404，非 owner 抢绑返回 404。
- 移除后公开用户主页不再返回头像，解绑后的新头像对其他成员返回 404；伪造 PNG 内容上传返回 422；受保护 `/me/settings` HTML Shell 返回 200。
- 当前桌面会话仍未提供可调用的浏览器控制接口，因此本阶段未执行文件选择、预览和确认对话框的浏览器点按与视觉回归；这些交互仅完成代码审查与生产构建验证。

## 第十一阶段：评论系统完整化

- Post 详情评论区改为按一级评论分页，每页 10 条；标题展示服务端一级评论总数，翻页时保留当前列表并提供局部更新状态。
- 新评论发布后自动进入按服务端正序排列计算出的末页；回复发布后留在当前一级评论页，不依赖前端伪造列表数据。
- 回复任意一级或二级评论均保留明确的回复对象；后端扁平化后的回复继续展示在所属根评论下，并显示“回复某人”的上下文。
- 评论输入、Loading、Error、Empty、提交中、删除中、成功和失败状态已补齐；评论长度使用 Unicode code point 计数，与后端 1–500 字符规则一致，避免 emoji 被 UTF-16 双倍计数。
- 删除本人评论使用危险操作确认：无回复评论直接移除；已有回复的根评论明确提示并保留 `[该评论已删除]` 占位，全部回复继续存在。
- 评论作者可进入真实用户主页；分页或 Post 切换会清理回复目标和过期反馈，移动端缩小回复层级缩进。

## 第十一阶段验证

- `frontend`: `npm run build` 通过，Vite 共转换 95 个模块。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 43 项；`scripts/verify_static.py` 和 `git diff --check` 通过。
- 新增自动化回归覆盖：一级评论 10 条分页、500/501 个 Unicode 字符边界、回复二级回复时归入原根节点、匿名访问拒绝，以及无权访问 private Post 时评论读取和写入均返回 404。
- 三账号隔离数据库真实 HTTP 联调通过：11 条一级评论精确拆分为 10+1；二级回复被正确扁平化且保留回复目标；非本人删除返回 404；删除有回复的根评论后占位正文与两条回复均保留。
- 额外写入 500 个 emoji 后总数和第二页条目同步更新，501 个 emoji 返回 422；匿名评论列表返回 401；受保护 Article HTML Shell 返回 200。
- 当前桌面会话仍未提供可调用的浏览器控制接口，因此本阶段未执行文本输入、回复聚焦、确认对话框和翻页滚动的浏览器点按与视觉回归；这些交互完成了代码审查、响应式样式审查与生产构建验证。

## 第十二阶段：Like / Favorite 完整化

- Post 详情新增独立 `InteractionBar`，在 Article 与 Note 每次进入详情或切换 Post 时显式调用 `GET /interactions/posts/:id`；按钮只在权威状态读取成功后开放，不再依赖首次 Post 详情值长期保持本地状态。
- 喜欢与收藏分别维护 busy、disabled 和 `aria-pressed` 状态；喜欢按钮同时播报权威计数。状态同步、提交成功、提交失败和重试均提供可感知反馈，所有事件入口都会捕获 Promise，不再产生未处理的 API 拒绝。
- toggle 失败后会重新读取权威互动状态；若状态也无法确认，则禁用操作并提供“重新同步”，避免把不确定的前端状态继续当作成功结果。
- `/me/favorites` 为每个可见条目增加真实取消收藏操作，支持行内等待、成功和失败反馈；列表更新和操作期间保持 `aria-busy`，移动端取消按钮使用整行触控区域。
- 收藏页会根据服务端总数收敛非法超大页码；取消最后一页的唯一条目时，按取消后的总数立即回到新的最后一页，并保留成功反馈。
- 新增无依赖 Node 回归测试，覆盖收藏页超大页码收敛和删除末页最后一项后的页码回退；后端回归扩展覆盖权威状态、双账号点赞计数、重复切换、21 条收藏分页、Collection ACL、失权过滤和无点赞通知。

## 第十二阶段验证

- `frontend`: `npm run test:run` 通过，共 2 项；`npm run build` 通过，Vite 共转换 97 个模块，主 JS gzip 107.05 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 44 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- 三账号、隔离 SQLite 数据库、独立临时端口的真实 HTTP 联调通过：匿名互动状态 401；双账号点赞计数从 0 到 2；同一账号连续切换结果为 `true → false → true`；第三账号读取相同权威计数但保持自己的未点赞状态。
- 真实收藏联调创建 21 条收藏，第二页精确为 1 条；取消该条目后服务端 `total_pages` 从 2 收敛为 1，第二页返回空列表，前端页码回退算法另有自动化测试覆盖。
- Collection 非成员读取互动状态为 404；成员被移除后同一接口立即变为 404，个人收藏响应不包含失权 Post ID、标题或 Collection Slug。点赞前后通知列表均不存在 `kind=like`。
- 联调使用 `/tmp/yingmo-stage12.*` 隔离目录、SQLite 文件、独立上传目录和 `18120/18121` 临时端口；服务结束后已停止进程并删除临时目录，未使用仓库开发数据库或上传目录。
- 已完成实现审查、响应式样式审查、真实 API 和生产构建验证。浏览器控制 Skill 虽可读取，但当前会话未暴露其必需的浏览器运行工具，因此浏览器点按、运行时 Console、视觉回归、主题切换和移动端视口不记录为已验证。

## 第十三阶段：Notifications 专项收口

- `/me/notifications` 保留服务端分页，并补齐单条已读、全部已读、目标点击已读的独立 busy、disabled、成功、失败和 `aria-busy` / `role=status` / `role=alert` 状态；所有事件入口都显式收口 Promise。
- 未读通知的目标链接会并行请求真实 `POST /notifications/:id/read`，但导航本身不等待该请求；标记失败会被安全吸收，目标页仍由自身请求执行 ACL 校验，不会产生未处理 Promise 或阻断安全导航。
- 新增无依赖前端回归，分别锁定目标点击已读成功时的同步回调，以及网络失败时 Promise 返回安全结果且不触发伪成功。
- 后端通知序列化继续以当前访问者权限为准：失去 Post 权限时同步清空 `post_id` 与 `comment_id`；失去 Collection 权限时清空 `collection_id`、目标 URL，并将成员加入、成员移除、Post 移出通知替换为不含名称和 Slug 的安全文案。
- 作者收到 `post_removed_from_collection` 时使用 `/write/:id` 管理目标，不把作者管理能力误扩展成普通阅读权限；仍可读的 Article 和 Note 分别返回 `/articles/:slug` 与 `/notes/:id` canonical。
- 新增后端专项回归，覆盖评论、回复、成员加入/移除、成员投稿、移出 Post、系统通知、分页、跨账号已读隔离、个人中心未读计数、ACL 脱敏，以及点赞、发布资格、Collection 审核和举报通知不生成。

## 第十三阶段验证

- `frontend`: `npm run test:run` 通过，共 4 项；`npm run build` 通过，Vite 共转换 98 个模块，主 JS gzip 107.23 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 45 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- 三账号、隔离 SQLite 数据库、独立上传目录和 `18130` 临时端口的真实 HTTP 联调通过；实际生成并读取 `post_comment`、`comment_reply`、`collection_member_added`、`collection_member_removed`、`collection_new_post`、`post_removed_from_collection` 和 `system` 七类通知。
- Article 评论通知目标为 `/articles/http-notify-article`，Note 评论通知目标为 `/notes/1`；目标失权后历史回复通知同步清空 Post、Comment 和 URL，Collection 成员历史通知响应不包含原名称或 Slug，作者的移出通知安全回退到 `/write/1`。
- 评论通知分页先验证 22 条为 20+2；加入两条系统通知后的最终响应为 24 条、20+4。跨账号标记通知已读返回 404；本人单条已读后概览未读数由 22 变为 21，全部已读后归零，系统通知单条已读后仍保持一致。
- 点赞真实 HTTP 请求前后接收方通知总数增量为 0；全部三账号通知类型中不存在 `like`、`publish_permission`、`collection_review` 或 `report`。后端当前也不存在发布资格和 Collection 审核字段，未以兼容旧概念的假通知替代。
- 临时服务已停止，`/tmp/yingmo-stage13.*` 隔离数据库与上传目录已删除，未使用或污染仓库开发数据库和开发上传目录。
- 已完成实现审查、响应式触控区域审查、自动化回归、真实 API 和生产构建验证。当前会话已加载 Browser Skill，但仍未暴露其必需的浏览器控制运行工具，因此浏览器点按、运行时 Console、视觉回归、主题切换和移动端视口明确未验证。

## 第十四阶段：Archive 完整化

- `/archive` 从固定读取 50 条改为服务端每页 20 条，接入统一分页组件，并将 `year`、`month` 和非首页 `page` 写入 URL；全部、年份和月份切换都会重置到第一页。
- 新增归档 URL 纯函数：规范化四位年份、1–12 月和正整数页码，构建 `/archive`、`/archive/:year`、`/archive/:year/:month` 的真实 API 路径；无效参数会收敛到安全 URL，不向后端发送伪造筛选。
- 超大页码根据服务端 `total` 和 `page_size` 收敛到最后一页，收敛期间显示可感知状态，不短暂展示伪空态；分页与筛选加载期间禁用相关按钮并设置页面 `aria-busy`。
- 月份 Facet 按年份分组，年份计数由后端 ACL 后的月份计数相加得到；全部、年份和月份均可选择并使用 `aria-pressed` 标记当前范围。结果区展示当前范围、服务端总数、局部 Loading、Empty 和 Error 状态。
- 保留 Article 使用 `published_at`、Note 使用 `occurred_at ?? published_at` 的后端语义时间；归档卡片继续使用服务端 `semantic_time`，Article 继续使用服务端 canonical Slug。
- 移动端年份与月份导航改为横向可滚动分组，每个选择项保持至少 44px 触控高度；桌面端维持 kami / editorial paper 的左侧年份树和右侧纸面内容流。
- 新增前端纯函数回归，覆盖 URL 规范化、分页 API 路径、范围文案、年份聚合和降序月份；新增后端专项回归覆盖语义时间、20+5 与 20+2 分页、年份/月筛选、archived 内容、private 差异和 Collection ACL Facet。

## 第十四阶段验证

- `frontend`: `npm run test:run` 通过，共 6 项；`npm run build` 通过，Vite 共转换 99 个模块，主 JS gzip 108.15 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 46 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- 三账号、隔离 SQLite 数据库、独立上传目录和 `18140` 临时端口真实 HTTP 联调通过。联调创建 21 条 2024 年 1 月 Note、其他月份 Note、Collection Note、独立 private Note、archived Note 和 Article。
- 全部归档视角分别为 creator 26、Collection member 25、非成员 24；作者可见自己的独立 private Post，另外两个账号均不可见。成员第一页 20、第二页 5；2024 年 1 月为 22 条并精确拆分 20+2，非成员为 21 条，2024 年全年为 23 条。
- Article 归入首次发布时间 `2026-08` 且 `semantic_time == published_at`；archived Note 按 `occurred_at` 归入 `2022-05`。请求第 99 页返回 `total_pages=2` 和空列表，由前端自动化锁定回退算法；非法 13 月返回 422，匿名 API 返回 401。
- 移除 Collection member 后，该账号全部归档从 25 收敛到 24、2024 年 1 月从 22 收敛到 21；响应不包含失权 Post、Collection 名称或 Slug。受保护 `/archive/2024` HTML Shell 返回 200、`noindex,nofollow` 且不嵌入业务内容。
- 临时服务已停止，`/tmp/yingmo-stage14.*` 隔离数据库与上传目录已删除，未使用或污染仓库开发数据库和开发上传目录。
- 已完成实现审查、响应式样式审查、自动化回归、真实 API 和生产构建验证。当前会话未暴露 Browser Skill 必需的浏览器控制运行工具，因此浏览器点按、运行时 Console、视觉回归、主题切换和实际移动端视口明确未验证。

## 第十五阶段：Admin 基础架构、Dashboard 与 Users

- 将 `/admin` 的 `JSON.stringify()` 占位页替换为真实 Dashboard，并新增 `/admin/users`；桌面成员头部、移动端菜单和个人中心只对 `system_admin` 展示管理入口，两个后台路由继续由 `AdminRoute` 守卫。
- 新增可复用 `AdminPageFrame`、`AdminNav`、`AdminStatus` 和 `AdminActionDialog`：统一后台标题、导航、Loading、状态标签和响应式结构；后续高风险操作可直接复用带焦点管理、busy、错误反馈和必填 500 字 reason 的确认对话框。
- Dashboard 使用真实 `GET /admin/dashboard`，展示用户、Post、Article、Note、草稿、Collection、评论和媒体八项指标，以及最近内容、最近评论和运行环境、数据库、媒体存储状态；不再展示发布资格、Collection 审核或举报指标。
- 后端 Dashboard 的最近评论补齐作者公开资料、正文、状态、时间和最小 Post 描述；最近 Post 增加 `deleted_at`，仍不返回正文。系统状态只返回必要的环境、数据库类型和媒体存储后端。
- Users 使用真实 `GET /admin/users`，支持 username/nickname 搜索、角色和账号状态筛选、每页 20 条分页、URL 状态规范化与超大页码收敛；筛选或搜索时重置第一页，Loading、Empty、Error 和移动端单列均有独立状态。
- 用户列表展示 nickname、username、email、bio、region、角色、状态、注册时间、最近登录、Post 数和创建的 Collection 数；后端补齐这些治理所需字段，但不返回密码、`can_publish` 或 `can_comment`。
- 产品明确 V3.2 不建设日常账号停用/恢复流程，后端也没有对应 Admin 写接口，因此本阶段 Users 没有放置假按钮。普通账号访问 Admin API 返回 403；Admin 通过普通 Post API 读取他人 private 内容仍返回 404，扩展读取只存在于 `/admin` API。
- 新增前端回归覆盖 Users URL/筛选/API 路径和 V3.2 Dashboard 指标白名单；新增后端专项回归覆盖权限边界、Dashboard 数据、用户字段、搜索、筛选、20+4 分页和非法参数。

## 第十五阶段验证

- `frontend`: `npm run test:run` 通过，共 8 项；`npm run build` 通过，Vite 共转换 102 个模块，主 JS gzip 110.25 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 47 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- 24 账号、隔离 SQLite 数据库、独立上传目录和 `18150` 临时端口真实 HTTP 联调通过。匿名 Dashboard 返回 401；普通账号访问 Dashboard 和 Users 均返回 403；管理员登录响应角色为 `system_admin`。
- Dashboard 八项真实计数为 users 24、posts 3、articles 1、notes 2、drafts 1、collections 1、comments 1、media 0；最近记录包含 private Post 和结构化评论，但管理员通过普通 `GET /posts/1` 仍得到 404，验证 Admin 扩展读取没有污染成员 ACL。
- Users 总数 24，第一页 20、第二页 4；nickname 搜索精确返回目标账号，`system_admin` 角色和 `banned` 状态筛选各返回 1 条。非法角色、非法状态均为 422；第 99 页返回 `total_pages=2` 和空列表，由前端回归锁定自动收敛。
- 用户响应包含 email、bio、region、内容数量和登录时间，不包含密码、发布资格或评论资格字段。受保护 `/admin/users` HTML Shell 返回 200、`noindex,nofollow` 且不嵌入用户资料。
- 临时服务已停止，`/tmp/yingmo-stage15.*` 隔离数据库与上传目录已删除，未使用或污染仓库开发数据库和开发上传目录。
- 已完成实现审查、响应式样式审查、自动化回归、真实 API 和生产构建验证。当前会话未暴露 Browser Skill 必需的浏览器控制运行工具，因此后台浏览器点按、运行时 Console、对话框焦点实测、主题切换和实际移动端视口明确未验证。

## 第十六阶段：Admin Posts / Collections / Comments

- Admin 导航新增 `/admin/posts`、`/admin/collections` 和 `/admin/comments`，继续复用现有 `AdminPageFrame`、状态标签与必填 reason 确认对话框；三个路由均由 `AdminRoute` 守卫，未提前加入 Categories / Tags。
- Posts 使用真实 `GET /admin/posts`，支持正文关键词、类型、发布状态、可见性、治理状态及 author/category/tag/collection ID 筛选，筛选与页码可由 URL 复现；列表同时标示作者、归属、分类、标签、时间和软删除状态。
- Post 审计预览显式调用 `GET /admin/posts/:id`，展示后端安全渲染正文并产生 `post.preview` 日志；hide、restore 和软删除均提交真实 reason。软删除内容保留审计预览，但不再显示可恢复操作，后端也拒绝对软删除 Post 执行 hide/restore。
- Collections 使用真实搜索、状态筛选和分页，展示创建者、成员、Post 数与删除状态；hide/restore/delete 均交给后端执行。删除文案明确 Post 会解除归属并转为 private；物理删除当前页最后一项时主动退回上一页，所有列表也保留通用超大页码收敛。
- Comments 支持状态与目标 Post ID 筛选，后端补齐作者公开资料、目标 Post 最小上下文和更新时间；管理端严格只提供 hide/restore，没有伪造 delete。成员自行删除的评论作为终态审计记录展示，后端拒绝恢复。
- 后端对三类筛选参数增加枚举和正整数校验；Post、Collection 响应补齐 `deleted_at`。治理写操作不会改变作者，普通内容读取仍完全服从既有 ACL；隐藏 Collection 会同步收口其中 Post，删除 Collection 会由领域服务统一脱离 Post 并改为仅作者可见。
- 三个页面覆盖首屏 Skeleton、局部 Loading、Empty、Error、成功/失败反馈、`aria-busy`、操作按钮 disabled、预览展开状态、确认对话框焦点管理和移动端单列布局；所有事件触发的异步请求均由 `void` + 内部 `try/catch` 收口，不会遗留未处理 Promise。
- 新增前端回归覆盖三类 URL 参数规范化、API 路径、非法枚举/ID 和分页参数；新增后端专项回归覆盖权限边界、扩展读取、筛选、预览日志、reason、隐藏/恢复/删除、普通 ACL、物理/软删除、评论终态和审计原因。

## 第十六阶段验证

- `frontend`: `npm run test:run` 通过，共 10 项；`npm run build` 通过，Vite 共转换 105 个模块，主 JS gzip 114.29 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 49 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- system_admin、内容作者与 Collection 成员三个账号使用隔离 SQLite、独立上传目录和 `18160` 临时端口完成真实 HTTP 联调。匿名 Admin Posts 返回 401，普通账号返回 403；管理员三类筛选各精确返回 1 条，Post 预览返回真实正文并产生审计日志。
- Post hide 后成员读取由 200 收口为 404，restore 后恢复 200；软删除后作者普通读取为 404，后续 restore 为 404。缺失 reason 返回 422，非法 ID 或状态筛选返回 422。
- 评论 hide 后普通评论列表从 1 条变为 0 条，restore 后恢复为 1 条；成员已删除且仍有回复的评论在 Admin deleted 筛选中保留空正文审计记录，Admin restore 返回 404。
- Collection hide 后成员读取 Collection 和其中 Post 均为 404，restore 后恢复 200；含 Post 的 Collection 删除模式为 `soft`，Post 脱离后成员读取 404、作者读取 200。21 个空 Collection 的第二页只有 1 项，物理删除后总数变为 20、总页数从 2 收敛为 1、第二页为空，前端据此回退第一页。
- 审计日志实际包含 `post.preview/hide/restore/soft_delete`、`comment.hide/restore`、`collection.hide/restore/delete` 九类动作及真实 reason；受保护 `/admin/posts` HTML Shell 返回 200 且未嵌入业务标题。
- 临时服务已停止，`/tmp/yingmo-stage16.*` 隔离数据库与上传目录已永久删除且不可恢复，未使用或污染仓库开发数据库和开发上传目录。
- 已完成实现审查、响应式样式审查、自动化回归、真实 API 和生产构建验证。当前会话虽安装了 Browser Skill，但仍未暴露其必需的浏览器控制运行工具，因此后台点按、运行时 Console、对话框焦点实测、主题切换、视觉回归和实际移动端视口明确未验证。

## 第十七阶段：Admin Categories / Tags

- Admin 导航新增 `/admin/categories` 与 `/admin/tags`，继续复用既有后台页面框架、状态标签和 reason 确认对话框；没有提前加入 Media，也没有添加后端不存在的 Category 删除或独立 Tag 创建按钮。
- Categories 使用真实 `GET /admin/categories`、`POST /categories` 和 `PATCH /categories/:id`，覆盖名称、Slug、说明、排序、创建、编辑、停用和恢复；名称/Slug 冲突、长度、整数排序和不支持字段均由后端裁决。
- Tags 使用真实 `GET /admin/tags`、`PATCH /tags/:id` 和 `POST /tags/:source_id/merge`，覆盖名称/Slug 纠正、停用、恢复与重复项合并。Tag 仍由成员在自己的 Post 编辑器中提交创建，Admin 页面不伪造另一个创建入口。
- Category 与 Tag 页面均支持名称、Slug、说明的本地搜索及 active/inactive URL 状态筛选；列表展示全站关联 Post 数、状态、首次发布使用时间、更新时间和 Slug 锁定状态，覆盖 Loading、Empty、Error、成功/失败、busy、disabled 与响应式单列。
- 首次被已发布内容使用后，Category/Tag 的 Slug 在 UI 中禁用且后端继续返回 422；Tag 合并会保留并停用源记录、去重迁移 Post 关系，并把源 `first_used_at` 传播给尚未发布使用的目标 Tag，防止目标在承接历史内容后仍可改 Slug。
- Category/Tag 停用或恢复、Tag 合并现在由后端强制要求 reason；合并目标必须是另一个 active Tag，布尔 ID、未知字段、无 reason 和无效目标均被拒绝。审计日志保存标准化后的 reason、before/after 和迁移数量。
- 停用 taxonomy 不删除 Post 或数据库关系。普通 Post 响应会隐藏 inactive Category/Tag，避免生成指向 404 的标签链接；作者管理和 Admin 扩展响应仍保留 inactive 关系及状态，便于作者移除和管理员审计，恢复后普通响应重新展示。
- 扩展 `AdminActionDialog` 支持在统一 reason 字段前插入额外控件和附加禁用条件，Tag 合并因此可在同一可聚焦确认对话框中选择目标；现有 Posts、Collections、Comments 行为保持不变。
- 新增前端回归覆盖 taxonomy URL 状态规范化、搜索及 active/inactive 过滤；新增后端专项回归覆盖 Admin ACL、Category 创建/去重/编辑、Slug 锁定、停用/恢复、Tag 普通成员创建边界、纠正、停用/恢复、无重复合并、目标 Slug 锁定、前台隐藏和审计日志。

## 第十七阶段验证

- `frontend`: `npm run test:run` 通过，共 11 项；`npm run build` 通过，Vite 共转换 106 个模块，主 JS gzip 117.18 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 50 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- system_admin、内容作者与普通成员三个账号使用隔离 SQLite、独立上传目录和 `18170` 临时端口完成真实 HTTP 联调。匿名 Admin Categories 返回 401；普通账号读取 Admin Categories/Tags、创建 Category 或修改 Tag 均为 403。
- Admin 创建 Category 返回 201，标准化重复名称返回 409；已发布使用后的 Category Slug 修改返回 422。停用缺少 reason 返回 422；停用后普通详情为 404、写作 options 中匹配数为 0、普通 Post 的 category 为 null，但作者管理响应保留 `is_active=false` 关系；恢复后详情返回 200。
- 两个 Tag 均通过成员真实 Post 写入产生，Admin 初始关联数分别为 2 和 1。已发布源 Tag 的 Slug 修改和停用缺少 reason 均返回 422；停用后普通详情为 404、普通 Post 的 tags 为空、作者管理响应保留 inactive Tag。
- 源 Tag 合并到目标前缺少 reason 返回 422；成功合并实际迁移 2 个 Post，源变为 `0:false`、目标变为 `2:true`，已同时关联目标的草稿没有重复关系。目标详情按 ACL 返回 1 条已发布内容，源详情为 404；目标承接 `first_used_at` 后修改 Slug 返回 422。
- 审计日志实际包含 1 条 `category.create`、3 条成功的 `category.update`、3 条成功的 `tag.update` 和 1 条 `tag.merge`，合并 reason 与响应迁移数一致。`/admin/categories` 和 `/admin/tags` HTML Shell 均返回 200 且不嵌入业务标题。
- 临时服务已停止，`/tmp/yingmo-stage17.*` 隔离数据库与上传目录已永久删除且不可恢复，未使用或污染仓库开发数据库和开发上传目录。
- 已完成实现审查、响应式样式审查、自动化回归、真实 API 和生产构建验证。Browser Skill 仍缺少当前会话唯一允许使用的浏览器控制运行工具，因此后台点按、运行时 Console、对话框焦点实测、主题切换、视觉回归和实际移动端视口明确未验证。

## 第十八阶段：Admin Media

- Admin 导航新增 `/admin/media`，页面使用真实 `GET /admin/media` 并支持图片/Live Photo、active/hidden、owner ID、Post/Collection/avatar/未绑定筛选和 URL 分页；非法类型、状态、正整数 ID 与绑定类型由前后端分别规范化和校验。
- Admin Media 按逻辑媒体分页：普通图片占一项，Live Photo 的 image/video 两行合并为一项并返回 `pair`、`pair_integrity`、owner 公开资料和绑定目标最小审计上下文，避免两个成员被拆到不同页或只治理一半。
- 新增 Admin-only `GET /admin/media/:id/content`，支持图片缩略图和原文件、Live Photo 图片/视频以及软删除后的审计预览；每次成功读取写入 `media.preview` 日志。普通 `/uploads/images/*` 与 owner-only `/uploads/manage/*` 规则保持不变，system_admin 不会因为角色而从普通路径越权。
- hide、restore、soft delete 继续强制 reason，并对有效 Live Photo 配对原子处理；配对数量、类型、所有者、绑定、状态或删除时间不一致时返回 409，不允许部分修改。软删除是终态，后续 restore 返回 404，底层文件保留供审计和既有清理命令处理。
- 前端展示所有者、Public/Pair ID、绑定对象、文件类型、合计大小、尺寸、创建与软删除时间；提供按需审计预览、成组操作提示、终态按钮收口、首屏 Skeleton、局部 Loading、Empty、Error、成功/失败反馈、`aria-busy`、`aria-expanded`、busy/disabled 和移动端单列预览。
- 预览继续复用鉴权 Blob API 和对象 URL 生命周期组件，图片/视频失败均有就地反馈；列表与操作异步调用均通过 `useAsyncData` 或事件内部 `try/catch` 收口，没有未处理 Promise。所有 API 调用继续统一经过 `frontend/src/lib/api.js`。
- 新增前端回归覆盖 Media URL 筛选规范化、逻辑类型与分页 API；新增后端专项回归覆盖 Admin ACL、逻辑分页、绑定上下文、筛选校验、普通/owner/Admin 三个读取权限域、审计预览、Live Photo hide/重复 hide/restore/delete、配对异常拒绝、终态和存储保留。

## 第十八阶段验证

- `frontend`: `npm run test:run` 通过，共 12 项；`npm run build` 通过，Vite 共转换 107 个模块，主 JS gzip 118.96 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 53 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- system_admin、媒体 owner 与普通成员三个账号使用隔离 SQLite、独立上传目录和 `18180` 临时端口完成真实 HTTP 联调。普通成员读取 Admin Media 返回 403；system_admin 读取 owner 的普通 `/uploads` 路径为 404，独立 Admin 审计预览对正常和已软删除媒体均返回 200。owner manage 路径不向 Admin 放宽为 404 的边界由后端自动化回归验证。
- 真实上传一张图片与一组 Live Photo 后，Admin 列表逻辑总数为 2，Live Photo 只有一个列表项且包含两个配对成员。缺少 reason 的 hide 返回 422；Bob 对绑定到 login-only 已发布 Post 的图片/视频访问依次为 `200/200 → hide 后 404/404 → restore 后 200/200 → soft delete 后 404/404`。
- Admin 审计日志实际包含 2 条 `media.preview` 以及各 1 条 `media.hide`、`media.restore`、`media.soft_delete`；软删除后 5 个隔离存储文件仍完整存在，列表两个 pair 成员均带 `deleted_at`，普通 ACL 没有恢复。
- 临时服务已停止，`/tmp/yingmo-stage18.*` 隔离数据库、HTTP 响应和上传目录已永久删除且不可恢复，未使用或污染仓库开发数据库和开发上传目录。
- 已完成实现审查、响应式样式审查、自动化回归、真实 API 和生产构建验证。Browser Skill 仍缺少当前会话唯一允许使用的浏览器控制运行工具，因此后台点按、运行时 Console、对话框焦点实测、主题切换、视觉回归和实际移动端视口明确未验证。

## 第十九阶段：Admin Featured / Settings / Notifications / Logs

- Admin 导航新增 `/admin/featured`、`/admin/settings`、`/admin/notifications` 和 `/admin/logs`，四个路由继续由 `AdminRoute` 守卫并复用现有后台页面框架、reason 对话框、Loading/Error/Empty/反馈与响应式结构。
- Featured 使用真实 `GET|POST /admin/featured` 和 `PATCH|DELETE /admin/featured/:id`，覆盖 Article/Collection 添加、整数排序、启用、停用和删除。列表补齐目标最小审计上下文、配置人、时间与 `eligible` 状态；创建、修改和删除全部强制 reason，未知字段、布尔排序、双目标、重复目标和不可用目标均由后端拒绝。
- 精选配置不会扩大读取权限：首页查询继续在 SQL 阶段应用当前成员的 Post/Collection ACL。首页前端补上服务端原已返回的“精选 Collection”区块；目标后续被隐藏或失效时即使精选记录仍 active，也不会进入首页结果，重新启用前后端会再次校验资格。
- Settings 使用真实 `GET|PUT /admin/settings`，后端返回五个字段的 schema、默认值、必填、控件类型和长度限制；前端据此生成站点名称、简介、关于、页脚和注册提示表单。保存前进行客户端校验和高风险确认，后端再次校验字符串、长度、必填、未知字段与 reason，并记录完整 before/after。
- Notifications 使用真实 `POST /admin/notifications`，支持全部 active 成员或从真实 Admin Users 搜索结果中选择明确收件人。定向 ID 会去重，空列表、布尔/非正整数、不存在或非 active 账号、未知字段、空消息、超长消息和无 reason 均被拒绝，不再静默部分发送；响应展示权威 scope 与 recipient_count。
- Logs 使用真实分页 `GET /admin/logs`，新增 action、target_type、target_id、request_id、operator_id 和原因/动作/对象/请求 ID 组合搜索；非法 operator 与过长查询返回 422。页面展示操作者、时间、对象、Request ID、reason、幂等键，并用原生 disclosure 折叠结构化 before/after，支持 URL 状态和超大页码收敛。
- 四组写操作全部通过 `frontend/src/lib/api.js` 并由事件内部 `try/catch` 收口；busy、disabled、成功/失败反馈、确认焦点、字符计数、收件人数、不可用目标、日志 Empty/Error、移动端单列与可滚动 JSON 均已实现，没有 Mock、假按钮或未处理 Promise。
- 新增前端回归覆盖日志 URL 规范化/API 路径、schema 表单默认值、通知 scope/ID 去重；新增后端专项回归覆盖四组 Admin ACL、Featured 生命周期与首页 ACL、Settings schema/验证/持久化、系统通知严格收件人、结构化审计和日志筛选分页。

## 第十九阶段验证

- `frontend`: `npm run test:run` 通过，共 14 项；`npm run build` 通过，Vite 共转换 111 个模块，主 JS gzip 123.48 KB。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 56 项；`scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- system_admin、Collection creator、Collection member 与非成员四个账号使用隔离 SQLite、独立上传目录和 `18190` 临时端口完成真实 HTTP 联调。普通账号读取 Admin Featured 返回 403；缺失 Featured/Settings reason 均为 422，重复 Featured 为 409，无效通知收件人为 422。
- Admin 真实添加 1 个 Collection Article 与其 Collection 后，成员 Bob 首页精选结果为 `Article 1 / Collection 1`，非成员 Charlie 为 `0 / 0`，响应不含私有标题、Collection 名称或 Slug。Article 停用后 Bob 首页精选 Article 收敛为 0，恢复后重新出现；排序修改与 Collection 精选删除均成功。
- Settings 初始 schema 精确包含 5 个字段和默认站点名“映墨”；保存五项值后读取一致，日志 before 保留默认值、after 保留新值。定向系统通知对重复 ID 去重后精确送达 2 人，全 active 通知送达 4 人，Charlie 只收到全员通知；成员通知响应的系统消息均无目标 URL。
- `featured.create`、`notification.send`、`settings.update` 均使用指定 Request ID、动作、对象、操作者或原因筛选精确返回 1 条；日志响应包含真实 reason、recipient_count、消息正文和设置 before/after。受保护 `/admin/featured` HTML Shell 返回 200 且不嵌入私有精选标题。
- 临时服务已停止，`/tmp/yingmo-stage19.*` 隔离数据库、HTTP 响应和上传目录已永久删除且不可恢复，未使用或污染仓库开发数据库和开发上传目录。
- 已完成实现审查、可见文案复读、响应式样式审查、自动化回归、真实 API 和生产构建验证。Browser Skill 已读取但当前会话仍未暴露其唯一允许使用的浏览器控制运行工具，因此后台点按、运行时 Console、对话框焦点实测、主题切换、视觉回归和实际移动端视口明确未验证。

## 第二十阶段：全功能回归与最终联调

- 所有页面路由改为 React `lazy` + `Suspense` 的真实路由级拆包，Article/Note、Collection、Profile、Admin 等页面不再随入口一次性加载；共享 Shell、认证守卫和统一页面 Skeleton 保留在入口层。
- Vite 开启 manifest，并新增 `frontend/scripts/verify-build.mjs`。校验会要求至少 10 个动态页面入口、单异步页面 JS gzip 不超过 150 KiB、入口加任一首次页面依赖不超过 300 KiB；`npm run check` 现在串联前端测试、生产构建和包体预算，拆包回退会直接失败。
- 横向修复普通 Article/Note 列表、Collection 列表、Search、Category/Tag 详情、我的内容、我的 Collection、我的评论和 Notifications 的页码收敛。API 返回权威总数后，非法、空结果或删除/撤权造成的超大页码会 replace 到最后有效页或第一页；收敛期间使用 `aria-busy`、状态提示和 disabled 分页，不再短暂展示伪 Empty。
- Posts 页的 `page` 参数改为严格正整数解析，非法字符串不会再产生 `page=NaN` API 请求。Favorites、Archive、用户主页和全部 Admin 分页继续保留既有收敛行为。
- 全量静态审计确认业务请求仍只从 `frontend/src/lib/api.js` 进入；未发现 Mock、假按钮、TODO/FIXME、静态 JSON dump 或直接 `fetch`。事件异步操作、通知导航标记和受保护媒体读取均已有 `try/catch`、`void` 安全调用或 hook 内部错误收口。
- 新增 `backend/scripts/verify_full_http.py` 作为可重复的跨模块真实 HTTP 验收脚本，使用真实注册/登录、CRUD、上传、互动、治理和 ACL 响应，不使用 Flask test client、Mock 或前端伪状态。

## 第二十阶段真实 HTTP 验收矩阵

| 分组 | 已验证内容 |
| --- | --- |
| Auth | 匿名 401、管理员/成员登录、三账号注册、`/auth/me`、多会话列表、个人设置更新 |
| Post | Article/Note 创建发布、归档、login-only/private、普通成员 404、Admin 普通读取不越权 |
| Collection | creator + member 创建读取、非成员 404、封面、我的 Collection、成员撤销后的 ACL 收口 |
| Media | 真实 PNG multipart 上传、Collection 封面绑定、成员读取、非成员 404、Admin 独立预览、隐藏/恢复 |
| Search | member 可发现 Collection 内容，非成员搜索与 suggestions 不出现私有标题、摘要或 Slug，撤权后再次收口 |
| Category / Tag | Admin Category 创建、成员前台列表/详情、Post 自动 Tag、Admin 停用/恢复与普通入口恢复 |
| 个人中心 | overview 权威计数、我的内容、公开用户主页、昵称/简介更新与隐私边界 |
| Interactions | `GET /interactions/posts/:id` 权威初始状态、Bob/Charlie 双账号点赞计数、重复取消/恢复、收藏列表、点赞/收藏不产生通知 |
| Comments | 根评论、回复、三账号读取、我的评论列表，以及 Admin hide/restore |
| Notifications | Collection/评论通知、单条已读、全部已读、overview 未读计数、Admin 定向系统通知、撤权目标 URL 脱敏 |
| Archive | Article 与已归档 Note 可见、Collection 私有 Article 对非成员不出现在 items/facet 结果 |
| Admin | Dashboard、Users、Posts/预览/治理、Collections、Comments、Categories、Tags、Media、Featured、Settings、Notifications、Logs 全部真实调用；普通用户 403 |
| ACL 撤权 | Bob 被移出 Collection 后，Post/Collection 为 404；Favorites、Search 和 Notifications 均不泄漏私有内容、标题、摘要或 Slug |

## 第二十阶段验证

- `frontend`: `npm run check` 通过；Node 回归共 14 项，Vite 生产构建转换 112 个模块。产物包含 37 个动态页面入口，最大单页为 WritePage `5.51 KiB gzip`，最重首次路由为 AdminMediaPage `88.73 KiB gzip`，低于产品定义的 `150/300 KiB` 预算且无大包警告。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 56 项；`.venv/bin/python scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- system_admin、Alice creator、Bob member、Charlie 非成员四账号使用全新迁移后的隔离 SQLite、独立上传目录和 `18200` 临时端口完成串行真实 HTTP 联调，脚本最终返回 `FULL_HTTP_VERIFY_OK Auth, Media, Post, Collection, Search, Taxonomy, Personal center, Interactions, Comments, Notifications, Archive, Admin full surface, ACL revocation`。
- 点赞权威计数实际依次为 `0 → 1 → 2 → 1 → 2`；Like/Favorite 前后作者通知总数不变。Bob 同时收藏普通 Article 和 Collection Article，撤销成员权限后收藏列表只保留仍有权普通 Article，搜索和通知目标也同步脱敏。
- Admin 使用独立扩展 API 预览 private/治理对象，但通过普通 `GET /posts/:id` 读取 Alice private Note 仍为 404；Post、Collection、Comment、Media hide/restore、Featured、Settings、系统通知、taxonomy 状态和审计日志全部通过真实写入后回读。
- 临时服务已停止，`/tmp/yingmo-stage20.*` 数据库与上传目录已删除；没有连接或写入仓库开发数据库，也没有使用仓库上传目录。
- 已验证：代码与契约审查、Loading/Empty/Error/Success/busy/disabled 实现、无障碍语义静态审查、路由拆包、体积预算、自动化回归、生产构建、真实多账号 HTTP、ACL 和全量后端测试。
- 受环境限制未验证：当前会话没有 Browser Skill 所需的浏览器控制运行工具，因此未执行真实浏览器逐路由点按、DevTools Console、浅/深色视觉对比、实际 `<768px` 视口、键盘 Tab/对话框焦点和 reduced-motion 运行时测试；这些项目不计为已通过。

## 第二十一阶段：创作与长文阅读增强

本阶段由五个连续工作流组成，分别完成编辑输入、自动保存、脚注、公式和发布后长文阅读闭环。各工作流下方保留其当时的真实验证快照；历史测试数量用于追踪增量，当前权威门禁统一为前端 `55/55`、后端 `88/88`。

### 工作流一：Markdown 快捷操作与渲染完整性

- Markdown 工具栏将原“列表”明确为“无序列表”，新增“有序列表”；有序列表支持多行连续编号、已有编号取消和混合内容重新编号。键盘补齐 `Command/Ctrl + Shift + 7` 有序列表与 `Command/Ctrl + Shift + 8` 无序列表，继续保留加粗与链接组合键。
- 加粗、标题、引用、无序列表、有序列表和代码块在重复触发时不会继续嵌套；格式变化后正文焦点与选区在 React 提交后可靠恢复。代码围栏会避开选中内容中的连续反引号。
- Markdown 有序列表恢复十进制序号并补齐嵌套间距；表格增加表头、单元格、隔行背景和内部横向滚动。编辑器 Grid 子项显式允许收缩，四列表格在 390px 视口内不再把整页撑宽。
- 代码块西文改用 Charter / Georgia / Palatino / Times 栈，行内代码和后台结构化数据仍使用等宽字体，避免扩大本次字体调整范围。
- `ProtectedMarkdown` 过滤 `table/thead/tbody/tr` 内由后端格式化换行产生的纯空白文本节点，保留段落和行内元素之间的有效空格，消除 React 表格结构警告。
- 后端新增 P0 Markdown 矩阵，覆盖标题、段落、无序/有序列表、引用、链接、图片、表格、代码块、站内媒体占位和 XSS；另行锁定 `/posts/preview` 与保存后 Post 使用同一安全渲染结果。

### 工作流一验证

- `frontend`: `npm run check` 通过，共 31 项 Node 回归；Vite 生产构建转换 118 个模块，包体校验返回 `BUNDLE_VERIFY_OK`，WritePage 首次路由 `94.14 KiB gzip`，低于预算。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 61 项；`.venv/bin/python scripts/verify_static.py` 返回 `STATIC_VERIFY_OK`；`git diff --check` 通过。
- 使用隔离 SQLite、独立上传目录、后端 `18151` 与前端 `5183` 完成真实浏览器回归：macOS 有序列表组合键得到 `1. 甲 / 2. 乙`，再次触发恢复原文；工具栏点按后 textarea 仍为焦点且完整格式选区被保留。
- 安全预览和最终 Article 均实际渲染十进制列表、表格及西文代码字体；恶意 `<script>` 不进入 DOM。390px 视口下工具栏为内部横向滚动，四列表格 `clientWidth=328 / scrollWidth=541`，页面 `clientWidth=390 / scrollWidth=390`。
- 浅色与深色渲染均完成视觉复核；深色表头、正文和代码块保持可读。修复表格纯空白节点后，在全新浏览器标签中分别复测安全预览和最终 Article，Console `error/warn` 均为空。
- 临时服务已停止，隔离目录已移入系统废纸篓且可恢复；没有连接或写入仓库开发数据库和上传目录。

### 工作流二：草稿自动保存与版本冲突保护

- Post 新增持久化 `edit_version`，由 SQLAlchemy 乐观锁在每次更新时递增；迁移 `20260815_0003` 为既有 Post 回填版本 1，并增加正整数约束。管理响应同时返回 `edit_version`，供编辑器提交前置版本。
- 新增专用 `PATCH /posts/:id/autosave`：仅接受 draft、强制 `expected_version`，已发布或归档内容返回 `AUTOSAVE_NOT_ALLOWED`。普通手动 PATCH 也可携带相同前置版本，避免显式保存与后台保存互相覆盖。
- 版本不一致返回 409 `EDIT_CONFLICT` 和当前版本元数据；数据库提交阶段仍由 version column 的条件 UPDATE 兜底真实并发。旧请求失败后不会写入正文，也不会把服务器正文回填到编辑器。
- 编辑器在表单发生变化 1200 ms 后自动保存，所有自动/手动/发布前保存进入同一串行队列。状态覆盖“有未保存修改、正在自动保存、已自动保存、失败、冲突”；失败保留本地内容并可重试，冲突停止后续后台请求。
- 冲突恢复提供显式“重新载入服务器版本”操作，并在覆盖本地内容前展示危险确认对话框；取消对话框不会改变编辑器正文。
- Collection 成员权限变化返回专门的 `COLLECTION_UNAVAILABLE`，编辑器明确提示切换为独立草稿或其他 Collection；失败请求不修改数据库正文。改选有效归属后，后续本地变化可以重新触发保存。
- 新草稿只有发生真实表单变化后才会自动创建；创建成功后 URL replace 到 `/write/:id` 并保留“已自动保存”状态。从已有编辑页切换到新建 Article/Note 会重置 route generation，旧页面的排队请求不能污染新编辑器。
- 已发布内容完全停止后台自动保存，侧栏明确显示“已发布内容仅手动保存”；发布操作先串行保存当前编辑器快照，再调用发布端点。
- 自动保存错误提示在窄屏断点改为纵向按钮布局；代码块继续使用系统西文衬线栈，未因本阶段状态 UI 回退。

### 工作流二验证

- `backend`: `pytest -q backend/tests` 通过，共 65 项；新增专项回归覆盖版本递增、旧正文拒绝、自动保存必填版本、发布状态拒绝、手动保存前置版本和 Collection 撤权后正文不变。空库 Alembic 升级与模型列一致性通过，`verify_static.py` 返回 `STATIC_VERIFY_OK`。
- `frontend`: `npm run check --prefix frontend` 通过，共 34 项 Node 回归；Vite 生产构建转换 119 个模块，包体校验返回 `BUNDLE_VERIFY_OK`，WritePage 首次路由 `95.30 KiB gzip`。
- 使用隔离 SQLite、独立上传目录、后端 `8011` 与前端 `5181` 完成真实浏览器联调。新 Note 输入后自动创建为 `/write/2`，页面最终显示“已自动保存”；从已发布编辑页进入新建路由时，类型和正文正确重置。
- 两个浏览器标签从同一版本开始编辑：标签 A 自动保存“服务器最新正文”成功；标签 B 随后提交旧版本得到 409 并保留“旧窗口试图覆盖”，第三个标签回读仍为“服务器最新正文”。冲突确认框打开后选择取消，本地旧窗口正文保持不变。
- Article 发布后在编辑器修改正文并等待超过自动保存延迟，服务端回读仍是发布时正文，侧栏显示“已发布内容仅手动保存”。最终 Article 的代码块计算字体为 `Charter, Georgia, Palatino, Times New Roman, serif`。
- 自动创建、双窗口冲突、发布后编辑和路由切换全程浏览器 Console error/warn 为空。临时服务已停止，隔离目录已移入系统废纸篓且可恢复；没有连接或写入仓库开发数据库和上传目录。

### 工作流三：Markdown 脚注

- 后端 Markdown 渲染链启用 Python-Markdown `footnotes` 扩展，支持 `[^id]` 引用、`[^id]: 定义`、同一脚注多次引用、定义内加粗与链接；安全预览、草稿管理响应和最终 Post 继续共用唯一 `render_safe_markdown`。
- Sanitization 只增加脚注实际需要的 `div` 与 `sup` 标签，并通过属性回调精确限制 `footnote/footnote-ref/footnote-backref` 类、`fn/fnref` ID、锚点属性与 fenced-code language class；事件、style、伪造 class 和 `javascript:` 链接仍会被清除。
- `ProtectedMarkdown` 增加对应安全节点和属性映射，正文引用可跳转到脚注定义，脚注返回链接可跳回每个引用位置；返回链接 title 本地化为“返回正文中的脚注 N”。
- Markdown 工具栏新增“脚注”。无选区时插入可读引用占位与定义，选中文字时保留正文文字并紧跟引用；定义使用下一个未占用的数字 ID，插入后焦点移动到脚注内容并选中占位文字，方便直接输入。
- 脚注区使用较小字号、分隔线和品牌色链接；正文引用与定义均设置 sticky header 对应的 scroll margin，目标获得轻量高亮。长 URL 或连续文本使用 `overflow-wrap:anywhere`，不扩大页面宽度；移动端继续复用工具栏内部横向滚动。

### 工作流三验证

- `backend`: `pytest -q backend/tests` 通过，共 68 项；专项回归覆盖重复引用、两个返回链接、嵌套 Markdown、中文返回 title、危险属性/链接清理，以及脚注安全预览与保存后 HTML 完全一致。`verify_static.py` 返回 `STATIC_VERIFY_OK`。
- `frontend`: `npm run check --prefix frontend` 通过，共 36 项 Node 回归；脚注快捷操作覆盖选中文字、定义选区和已有编号递增。Vite 生产构建转换 119 个模块，`BUNDLE_VERIFY_OK`，WritePage 首次路由 `95.50 KiB gzip`。
- 使用隔离 SQLite、独立上传目录、后端 `8012` 与前端 `5182` 完成真实浏览器验证。工具栏实际插入引用与定义后 textarea 仍为 active，选区精确落在“脚注内容”。
- 安全预览实际生成 `fnref:1/fnref2:1`、两个 `footnote-ref` 和两个 `footnote-backref`；点击引用后 URL fragment 为 `#fn:1`，点击返回链接后为 `#fnref:1`。脚注容器 `overflow-wrap=anywhere`，当前内容区 `clientWidth/scrollWidth=742/742`。
- 发布后的 Article 保留与预览相同的引用、重复返回链接、加粗和安全外链，DOM 中没有 `script`；浏览器 Console error/warn 为空。临时服务已停止，隔离目录已移入系统废纸篓且可恢复；没有连接或写入仓库开发数据库和上传目录。

### 工作流四：Markdown 数学公式

- 编辑器支持 `$...$` 行内公式、单行 `$$...$$` 与独占多行 `$$` 块公式。后端先保护 fenced code、行内代码和缩进代码，再识别公式；货币金额 `$5`、包含边界空格的歧义写法和未闭合定界符保持普通文本，避免误解析正文。
- 后端不直接生成公式 HTML，而是输出经过 Bleach 精确白名单约束的 `span.math-inline` / `div.math-block` 占位，只允许 class 和实体转义后的 `data-math`。安全预览、草稿管理响应与最终 Post 继续共用同一 Markdown 渲染链。
- 前端按公式节点懒加载 KaTeX 及字体资源，正常页面不会提前加载公式引擎。输出同时包含可视 HTML 与 MathML；渲染固定关闭 trust，并限制宏展开、尺寸和输入长度。非法公式不吞掉正文，而是显示原始 TeX 错误占位。
- Markdown 工具栏新增“行内公式”和“块公式”。行内操作支持 `$...$` 包裹/取消，块操作支持 `$$` 围栏包裹/取消；触发后继续恢复 textarea 焦点并选中公式正文，便于直接替换。
- 行内公式随正文排版；块公式居中并拥有独立横向滚动区域。超宽公式只扩大自身 `scrollWidth`，不会撑宽预览容器、最终文章或整个页面。

### 工作流四验证

- `backend`: `pytest -q backend/tests` 通过，共 72 项；专项回归覆盖行内/块公式、代码保护、货币与歧义定界符、属性转义、伪造公式标记清理，以及安全预览与保存后 HTML 完全一致。`verify_static.py` 返回 `STATIC_VERIFY_OK`。
- `frontend`: `npm run check --prefix frontend` 通过，共 40 项 Node 回归；覆盖工具栏选区、有效/无效公式、超长输入和不可信链接命令。Vite 生产构建转换 123 个模块，`BUNDLE_VERIFY_OK`；KaTeX 被拆为按需异步公式块，常规共享块没有吸收其体积。
- 使用隔离 SQLite、独立上传目录、后端 `8013` 与前端 `5184` 完成真实浏览器验证。预览实际生成 3 个 KaTeX 节点、1 个 display 节点与 3 个 MathML 节点；货币文本和行内代码原样保留，非法公式显示错误占位，不可信链接没有生成可点击 URL 或外部资源请求。
- 80 项超宽块公式在预览中为 `clientWidth/scrollWidth=740/3103`，预览容器保持 `742/742`，页面保持 `1280/1280`；发布后公式区为 `758/3103`，页面仍为 `1280/1280`。浏览器 Console error/warn 为空。临时服务已停止，隔离目录已移入系统废纸篓且可恢复；没有连接或写入仓库开发数据库和上传目录。

### 工作流五：发布页长文阅读增强

- 后端将安全 HTML 与 Article Outline 合并为同一次 Markdown 转换结果，避免目录再次解析正文而产生 ID 漂移。TOC 使用 Unicode 友好的稳定 Slug，重复标题自动获得唯一后缀；只返回正文 `h2-h4` 的 ID、层级和纯文本标签，Note 明确返回空 Outline。
- 发布页只在有效标题不少于两个时显示目录。桌面端目录位于正文右侧并随页面吸顶，滚动时高亮当前章节；窄屏目录位于文章标题之后、正文之前，默认折叠，展示章节数，展开后选择章节会自动收起。
- 目录链接保留标准 URL Hash，可以复制、刷新、前进和后退；异步数据加载后的直接 Hash 仍会重新定位。标题设置 sticky header 对应的 scroll margin，并对亚像素边界保留容差，避免落点停在上一节。
- Article 增加固定阅读进度条，进度以正文可阅读区间计算并限制在 `0-100`；滚动、窗口变化、Hash 变化和代码/公式异步块引起的正文尺寸变化都会重新计算。Note 不增加目录或阅读进度。
- 代码块使用 Highlight.js core 并仅注册 Bash、C/C++、CSS、HTML/XML、Java、JavaScript、JSON、Markdown、Python、Rust、SQL、TypeScript 和 YAML；常用别名被规范化，未知语言或超过 50,000 字符的代码安全回退为纯文本，不进行自动猜测。
- 语法高亮组件按代码块懒加载，生成的 token HTML 来自已转义的代码文本；主题色使用站点浅色/深色变量。代码正文继续使用 Charter / Georgia / Palatino / Times 西文衬线栈，没有恢复为 Q 版字体；代码块继续内部横向滚动且不扩大页面。

### 工作流五验证

- `backend`: `pytest -q` 通过，共 74 项；新增回归覆盖 Unicode/重复标题稳定 ID、`h2-h4` 层级过滤、预览与 Article Outline 一致以及 Note Outline 为空。`verify_static.py` 返回 `STATIC_VERIFY_OK`。
- `frontend`: `npm run check` 通过，共 47 项 Node 回归；新增回归覆盖 Outline 规范化、少于两个标题隐藏目录、阅读进度边界、章节跟随、语言别名、高亮转义、未知语言和超长代码回退。Vite 生产构建转换 143 个模块，`BUNDLE_VERIFY_OK`；代码高亮独立异步块为 `26.30 KiB gzip`，PostDetail 页面块为 `5.93 KiB gzip`。
- 使用全新迁移后的隔离 SQLite、独立上传目录、后端 `8014` 与前端 `5185` 发布真实长 Article。1280px 页面正文宽 760px、页面 `clientWidth/scrollWidth=1280/1280`，右侧目录为 sticky；四个目录项与正文 ID 精确对应 `起点/中段-代码之后/深入一层/终点`。
- 点击“中段”后标题落在视口顶部 96px，URL Hash 与当前高亮同步，阅读进度为 38%；直接打开 `#终点` 后标题仍落在 96px，当前章节为“终点”，阅读进度为 100%。Python 代码实际生成 6 个高亮 token，计算字体为 `Charter, Georgia, Palatino, Times New Roman, serif`。
- 深色模式下代码背景、正文、关键字和目录均使用可读主题色。通过同源 390×844 真实 iframe 运行窄视口媒体查询，内部页面 `clientWidth/scrollWidth=390/390`，目录默认折叠且切换按钮可见，展开和章节跳转后恢复折叠；代码块 `clientWidth/scrollWidth=356/356`，未撑宽页面。直接应用标签页 Console error/warn 为空。临时验收页面已删除，服务已停止，隔离目录已移入系统废纸篓且可恢复；没有连接或写入仓库开发数据库和上传目录。

## 第二十二阶段：邮箱可信与账号恢复闭环

- 注册继续要求服务端邀请码，成功后立即登录并拥有正常成员能力；邮箱是否已验证只决定该邮箱能否作为恢复通道，不参与内容 ACL 或成员能力判断。
- 注册会创建邮箱验证令牌并尝试投递，响应带 `verification_email_sent` 供页面反馈；邮件失败发生在账户事务提交之后，不回滚已创建账号，未投递令牌会撤销以允许立即重试。
- 登录成员可从设置页或 `/verify-email` 重新申请验证邮件；后端对重复请求设置冷却。确认成功写入 `email_verified_at` 并撤销同用途旧令牌，页面可展示验证状态和时间。
- `/forgot-password` 只收集邮箱并始终展示相同受理反馈；后端对存在、未知、未验证、受限和冷却中的邮箱统一返回 202，只有 active 且邮箱已验证的账号会产生重置邮件。
- `/reset-password` 沿用 8–128 字符密码策略。成功后前端结束本地认证状态并释放受保护媒体 Blob URL；后端消费令牌、撤销其他重置令牌和该账号全部 Refresh Session，并清除 Refresh Cookie。
- 原始邮箱验证/密码重置令牌只出现在邮件 URL fragment。页面只从 `#token=...` 读取并立即通过 History API 清除，不读取 query 或 path；数据库只保存服务端 HMAC 摘要，不保存原始令牌。
- 页面和后端 Shell 统一使用 `no-referrer`；误入 Query 的令牌会被主动清除但不被消费。Console 适配器及邮件失败日志只记录脱敏事件，不输出完整邮箱、完整链接或原始令牌。
- 密码重置完成后，前端以不含令牌、邮箱或内容的同源存储事件通知其他标签页立即结束本地会话并释放受保护媒体；后端会话撤销仍是最终安全边界。
- 新增统一账户安全页面框架和三个公开 lazy route；登录页增加忘记密码入口，注册完成按验证状态导航，个人设置显示验证状态、验证时间、重发反馈和状态入口。
- 邮件层提供测试 memory Outbox、开发 console 和生产 SMTP + STARTTLS adapter；生产配置强制 HTTPS `SITE_URL`、SMTP、TLS、发件地址与主机。真实外部 SMTP 投递不在本地自动化结论内。

## 第二十二阶段验证

- `frontend`: `npm run check` 通过；ESLint、Node 回归 `55/55`、Vite 生产构建与 `BUNDLE_VERIFY_OK` 全部通过。新增回归覆盖精确公开路由、账户 API 路径、fragment-only 令牌、Fragment/Query 清理、`no-referrer`、统一防枚举反馈和无敏感信息的跨标签页失效事件。
- `backend`: `.venv/bin/python -m pytest -q` 通过，共 `88/88`；`compileall`、`scripts/verify_static.py`、依赖检查和 Alembic head `20260815_0004` 验证通过。
- 后端专项覆盖注册发信、令牌 HMAC 摘要/用途绑定/轮换/过期/单次消费、目标邮箱快照、配置 URL 抵抗 Host 注入、防枚举统一响应、冷却、投递失败、日志脱敏、SMTP TLS adapter、密码更新、旧 Access/Refresh Session 失效和 production 配置拒绝不安全邮件设置。
- 已按 Browser Skill 尝试 `/forgot-password`、`/verify-email`、`/reset-password` 运行验收，但当前桌面安全策略拒绝本地 HTTP 导航，隔离后端/前端服务的启动权限也不可用；按策略未绕过。页面点按、真实 Console、浅/深色和移动端运行验证未计为通过。
- 当前环境没有真实 SMTP 账号、可投递域名或 DNS 控制权，因此 STARTTLS 握手、实际到信、退信、垃圾邮件评分及 SPF/DKIM/DMARC 未验证；真实 MySQL 8 migration、S3 I/O 和 Redis 分布式限流也仍属于部署环境门禁。
