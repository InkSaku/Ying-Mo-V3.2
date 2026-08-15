# 映墨 Ying-Mo 产品需求文档（PRD V3.2 邀请制与 Collection 成员空间修订）

> 版本：V3.2  
> 状态：邀请制朋友记录空间权威基线  
> 更新时间：2026-08-15
> 产品形态：小规模、邀请码准入、登录后阅读的多人博客与朋友生活记录空间  
> 前端：React + Vite  
> 后端：Flask App Factory + Blueprint + RESTful API  
> 数据层：SQLAlchemy + Flask-Migrate + MySQL  
> 历史冻结基线：`4eaa981d1ad83e37352cedcf16713e532c375caa`  
> 历史版本 Tag：`v1.0-game-life-final`  
> 当前工作分支：`main`
> 文档用途：作为 Ying-Mo V3.2 产品、设计、开发、测试和验收的唯一需求基线。

---

# 0. 文档权威性与重构边界

## 0.1 唯一需求基线

自 V3.2 开始，`docs/product.md` 是 Ying-Mo 当前版本唯一权威产品需求文档。

任何历史 PRD、重构草案、代码注释、测试名称、页面文案、旧接口或旧数据库结构与本文件冲突时，以本文件为准。

历史 V2.x 中以下内容不再属于 V3.2 产品目标：

- 游戏区；
- 游戏目录；
- 地图；
- 英雄；
- 游戏点位；
- 游戏攻略；
- 点位步骤；
- 游戏有效性反馈；
- 游戏相关搜索、推荐、通知、后台与用户统计。

V3.2 中以下业务模型被 V3.2 明确废止：

- 开放注册；
- 注册读者与获准记录者的双层创作身份；
- `can_publish`；
- `can_comment`；
- Collection 的 `owner_only / approved_members` 投稿策略；
- Collection 的 `visibility`；
- Collection 审核、`review_status`、提交审核和拒绝重提流程；
- 内容管理员角色；
- 将举报作为 P0 核心治理能力；
- “所有登录用户都能发现所有共享 Collection”的旧访问假设。

## 0.2 V3.2 的多人边界

Ying-Mo 不是严格单作者博客，而是站长与现实朋友共同使用的长期记录空间。

系统采用统一邀请码控制注册准入。只有知道正确邀请码的人才能完成注册并成为 Ying-Mo 成员。当前产品约定邀请码为：

```text
lyx0811
```

实现要求：

- 注册接口必须校验邀请码；
- 邀请码错误时不得创建账号；
- 邀请码只用于注册，不参与登录和后续内容鉴权；
- 后端从环境变量读取邀请码，建议环境变量名 `REGISTRATION_INVITE_CODE`；
- 前端不得包含用于校验的真实邀请码；
- 注册接口必须有限流；
- 不建设邀请码表、一人一码、一次性邀请码、邀请来源追踪或邀请码后台。

注册成功即代表该用户是可信任的 Ying-Mo 成员。所有正常成员都可以创建自己的 Article、Note、草稿和 Collection，也可以评论、回复、点赞和收藏自己有权读取的内容。

Collection 是朋友共同记录的核心空间。每个 Collection 有且只有一个创建者，并可指定 0..N 个其他成员。**Collection 成员关系同时决定阅读权和投稿权：能发的人就能看，不能发的人也看不到。**

系统不建设：

- 面向陌生互联网用户的开放注册；
- 创作资格审批；
- 评论资格审批；
- 无门槛公开投稿；
- 创作者排行榜；
- 投稿积分；
- 粉丝竞争；
- 流量分发；
- 商业化内容推荐；
- 多租户建站。

核心关系是：

```text
邀请码
↓
可信朋友成为 Ying-Mo 成员
↓
各自记录
+
按成员名单共同记录 Collection
↓
长期内容与生活档案
↓
阅读和轻量互动
```

## 0.3 重构原则

V3.2 不推翻现有技术栈，但允许继续重建旧业务模型。

重构遵循：

```text
邀请码准入
→ 统一成员创作能力
→ 建立 Collection creator + members
→ 统一 Collection 阅读/投稿 ACL
→ 打通 Article / Note / Draft
→ 将权限同步到首页、搜索、归档、用户主页、媒体和通知
→ 删除旧审核、举报和发布资格主链
→ 解除游戏与旧 Life 运行时
```

每次开发只完成一个可以独立验收的小任务，不在同一任务中混入无关重构、依赖升级或部署变更。

## 0.4 历史版本与旧数据

`v1.0-game-life-final` 保存 Git 中可追踪的 V1/V2 代码和静态资源。

当前项目尚未正式上线，没有需要保留的生产业务数据。现有数据库内容、游戏数据、LifePost、LifeChapter、Draft、互动记录和上传媒体均视为可丢弃的测试数据。

V3.2 明确允许：

- 重置开发数据库；
- 删除旧测试数据；
- 删除游戏测试媒体；
- 不执行旧 LifePost 数据回填；
- 不保留 `/life/post/:id` 历史地址兼容；
- 不为测试数据建立生产级恢复方案；
- 直接通过新 migration 删除 `can_publish`、`can_comment`、Collection 审核和旧投稿策略相关字段或表。

但所有 Schema 变化仍必须通过 Alembic / Flask-Migrate 实现，不允许以手工修改未来生产数据库代替迁移。

首次生产上线后，任何 destructive migration 必须重新遵守生产备份、恢复演练和数据保留要求。

---

# 1. 产品概述

## 1.1 产品定位

Ying-Mo 是一个由站长和受邀朋友共同使用的多人博客与生活记录空间。

它用于保存：

- 技术文章；
- 学习笔记；
- 随笔与思考；
- 日常片段；
- 摄影；
- 旅行；
- 校园与成长经历；
- 共同回忆；
- 长期专题与个人合集。

产品同时支持两种使用方式：

```text
个人记录
成员创建自己的 Article / Note
→ 可选加入自己的 Collection
→ 形成个人内容空间
```

```text
朋友共同记录
Collection 创建者选择共同成员
→ creator + members 均可读、可投稿
→ 多个真实作者共同保存一段经历
```

## 1.2 品牌方向

核心语义：

- 文字；
- 影像；
- 时间；
- 朋友；
- 生活；
- 思考；
- 记忆；
- 成长；
- 长期积累。

品牌表达：

> 写字，也和朋友一起记录生活。

视觉和文案减少平台运营感、流量感和竞争感，强调温暖、克制、内容、人与共同经历。

## 1.3 核心价值

### 对 Ying-Mo 成员

- 使用自己的用户名和个人主页建立稳定身份；
- 创建自己的 Article、Note 和 Collection；
- 保存草稿并使用 Markdown、图片、Live Photo、地点和时间记录；
- 创建 Collection 时指定一起记录的朋友；
- 在自己加入的 Collection 中阅读并发表内容；
- 通过 Category、Tag、Collection 和 Archive 组织长期内容；
- 管理自己创建的内容，不被其他普通成员篡改；
- 评论、回复、点赞和收藏自己有权访问的内容。

### 对 Collection 创建者

- 创建并管理自己的 Collection；
- 在创建时选择 0..N 个共同成员；
- 支持一键选择当前所有系统成员；
- 创建后随时增加或移除共同成员；
- 调整 Collection 内展示顺序；
- 将任意 Post 从自己的 Collection 中移除关联；
- 不能编辑、删除或冒用其他作者的 Post。

### 对游客

- 了解 Ying-Mo 是一个邀请制朋友记录空间；
- 在拥有正确邀请码时注册；
- 登录、找回密码和完成邮箱验证；
- 阅读不包含动态用户或作品数据的 About；
- 打开成员内容链接时安全前往登录页，并在登录后返回原地址。

---

# 2. V3.2 目标与非目标

## 2.1 核心闭环

### 注册与个人记录闭环

```text
游客输入 username / nickname / 邮箱 / 密码 / 邀请码
→ 邀请码校验成功
→ 成为 Ying-Mo 成员
→ 创建 Article / Note 草稿
→ 编辑内容和媒体
→ 可选保持独立或加入自己有权限的 Collection
→ 发布
→ 出现在自己和有权成员可见的页面、搜索与归档中
```

### 共同记录闭环

```text
成员创建 Collection
→ 系统自动确定 creator
→ 创建者选择共同成员（可一键全选当前成员）
→ creator + members 获得阅读权和投稿权
→ 成员发布自己的 Note / Article
→ Collection 聚合多个作者的内容
→ 创建者可调整成员和展示顺序
→ 每篇 Post 始终保留真实作者归属
```

### 阅读互动闭环

```text
游客通过邀请码注册并登录
→ 浏览自己有权访问的独立 Post 与 Collection
→ 点赞、收藏、评论或回复
→ 作者收到必要通知
→ 长期沉淀为个人与共同生活档案
```

## 2.2 P0 必须实现

- 邀请码注册、登录、退出和 Token 刷新；
- username / nickname 规则和注册页解释；
- 所有成员默认可创作；
- 多作者 Post；
- Article；
- Note；
- Post 草稿；
- 发布后 Article / Note 类型锁定；
- Markdown；
- 图片与 Live Photo；
- 封面；
- Category；
- Tag；
- Collection；
- Collection 单一 creator；
- Collection 指定成员；
- 创建时一键选择当前所有成员；
- 创建后编辑成员；
- Collection 成员统一阅读/投稿 ACL；
- Collection 内 Post 完全跟随 Collection ACL；
- Post 加入、移动和移出 Collection；
- Collection 删除后的 Post 安全脱离；
- 成员被移除后的历史 Post 作者管理例外；
- 个人主页；
- 首页；
- Article 列表与详情；
- Note 列表与详情；
- Collection 列表与详情；
- Archive；
- Search；
- About；
- 评论和回复；
- 点赞；
- 收藏；
- 必要通知；
- 简化管理后台；
- 成员内容路由门禁；
- 通用无数据 HTML Shell；
- 内容页面 `noindex`；
- 不包含作品地址的 Sitemap；
- 受保护媒体与私密缓存；
- 响应式；
- 深浅主题；
- 生产部署；
- 游戏领域彻底退出运行时。

## 2.3 明确非目标

V3.2 不建设：

- 游戏内容；
- 面向陌生人的开放注册；
- `can_publish` 发布资格审批；
- `can_comment` 评论资格审批；
- Collection 审核；
- Collection 面向非成员展示；
- 举报系统作为 P0/P1 主链；
- 面向互联网公开作品、合集、用户主页、搜索或归档；
- 作品 RSS 订阅；
- 内容 SEO HTML、作品 Open Graph 或面向搜索引擎的内容索引；
- 创作者排行榜；
- 贡献积分；
- 关注与粉丝体系；
- 私信；
- 直播；
- 商业广告；
- 支付；
- 复杂推荐算法；
- 社区论坛；
- 原生移动 App；
- 多租户博客；
- 站内视频上传和视频编辑；
- 多人同时编辑同一篇 Post；
- 完整内容版本控制系统；
- Post 与 Collection 多对多。

---

# 3. 用户角色与权限

## 3.1 游客

允许：

- 访问不展示作品、用户、统计或封面的邀请制空间介绍首页；
- 访问登录、注册、找回密码和邮箱验证；
- 查看 About；
- 注册时提交邀请码；
- 打开成员内容链接后前往登录页，并保留完整原始路径、Query 和 Hash。

不允许：

- 获取任何作品、Collection、用户主页、搜索结果、分类、标签、归档、评论、互动统计或受保护媒体；
- 在邀请码错误时完成注册；
- 创建或编辑内容；
- 创建 Collection；
- 评论、点赞或收藏；
- 访问个人中心和后台。

## 3.2 普通成员

通过正确邀请码注册后即成为普通成员。

所有普通成员允许：

- 创建 Article；
- 创建 Note；
- 保存草稿；
- 编辑、归档和删除自己的 Post；
- 创建自己的 Collection；
- 管理自己创建的 Collection；
- 在自己是 creator 或 member 的 Collection 中阅读和投稿；
- 浏览有权读取的 Article、Note、Collection、Category、Tag、Archive、Search 和用户主页；
- 评论和回复有权读取的 Post；
- 点赞和收藏有权读取的 Post；
- 管理头像、昵称、简介和地区；
- 查看自己的 Post、Collection、草稿、收藏、评论和通知。

普通成员不得：

- 编辑或删除其他作者的 Post；
- 冒用其他作者身份；
- 编辑其他人创建的 Collection；
- 擅自把其他作者的独立 Post 加入自己的 Collection；
- 读取自己不是 creator/member 的 Collection；
- 读取其他作者的独立 `private` Post；
- 管理全站 Category；
- 修改首页精选；
- 访问系统管理功能。

## 3.3 Collection 创建者

Collection 创建者是资源级身份，不是独立站点角色。

创建者天然：

- 永久是该 Collection 的管理者和成员；
- 无需在成员复选框中再次选择自己；
- 可以向 Collection 投稿；
- 可以阅读 Collection 及其全部 Post；
- 可以修改名称、简介、封面和成员名单；
- 可以一键选择创建/编辑时当前存在的全部其他成员；
- 可以调整 Collection 内展示顺序；
- 可以将任意 Post 从 Collection 中移除关联；
- 不能编辑、删除、改写署名或修改其他作者正文。

创建者不支持从自己的 Collection 中移除自己。V3.2 不建设 Collection 所有权转让和账号停用后的 creator 接管流程。

## 3.4 Collection 成员

除 creator 外，被 creator 选中的用户记录在 Collection 成员关系中。

成员同时获得：

```text
read = true
contribute = true
```

未被选中的用户同时为：

```text
read = false
contribute = false
```

不存在“只能看不能发”或“能发不能看”的 Collection 成员状态。

成员被移除后：

- 立即失去 Collection 页面读取权限；
- 立即失去新增 Post 到该 Collection 的权限；
- 已发布历史 Post 继续留在 Collection；
- 历史 Post 的作者归属不变；
- 被移除用户仍可从个人管理入口查看和编辑自己的历史 Post；
- 该作者管理例外不得让其读取 Collection 中其他作者内容、成员名单、统计或封面；
- creator 如需移除某篇历史 Post，必须单独执行“从 Collection 移除”。

## 3.5 系统管理员 / 站长

系统管理员是站点维护者，不承担对朋友的日常发布/评论审批。

系统管理员允许：

- 管理 Category 和 Tag；
- 管理首页精选；
- 查看全站 Post 和 Collection 管理列表；
- 在极端情况下隐藏或恢复内容；
- 管理媒体；
- 配置站点信息；
- 查看操作日志；
- 查看用户基础管理信息。

系统管理员不应通过普通成员内容接口隐式扩大读取范围；需要扩展读取时使用独立后台接口并记录日志。

## 3.6 权限矩阵

| 操作 | 游客 | 普通成员 | Collection creator/member | Admin |
|---|---:|---:|---:|---:|
| 访问介绍与认证页 | ✅ | ✅ | ✅ | ✅ |
| 使用正确邀请码注册 | ✅ | — | — | — |
| 创建独立 Post 草稿 | ❌ | ✅ | ✅ | ✅ |
| 发布自己的独立 Post | ❌ | ✅ | ✅ | ✅ |
| 创建 Collection | ❌ | ✅ | ✅ | ✅ |
| 阅读某 Collection | ❌ | 仅属于该 Collection 时 | ✅ | 后台接口 |
| 向某 Collection 投稿 | ❌ | 仅属于该 Collection 时 | ✅ | 按成员身份/后台流程 |
| 编辑自己的 Post | ❌ | ✅ | ✅ | 后台管理操作 |
| 编辑他人 Post | ❌ | ❌ | ❌ | 仅管理操作，不改作者归属 |
| 修改 Collection 成员 | ❌ | 仅 creator | creator ✅ | 后台管理操作 |
| 评论、点赞、收藏 | ❌ | 对有权 Post ✅ | ✅ | ✅ |
| 管理 Category / 首页精选 | ❌ | ❌ | ❌ | ✅ |

所有权限以后端为最终依据。前端隐藏按钮不能替代后端 401、403、404 校验。

---

# 4. 信息架构

## 4.1 游客与成员站点

```text
Ying-Mo
├── 游客首页（邀请制空间介绍）
├── 登录 / 注册 / 找回密码 / 邮箱验证
├── 关于（静态、无动态内容数据）
└── 登录后的成员空间
    ├── 首页
    ├── 文章
    │   ├── 全部有权文章
    │   ├── 分类
    │   ├── 标签
    │   └── 文章详情
    ├── 手记
    │   ├── 全部有权手记
    │   └── 手记详情
    ├── 合集
    │   ├── 我有权访问的合集
    │   └── 合集详情
    ├── 成员主页
    ├── 归档
    │   ├── 年
    │   ├── 月
    │   ├── 分类
    │   └── 标签
    └── 搜索
```

所有列表、数量和筛选均只包含当前用户有权访问的对象。

## 4.2 个人中心

```text
个人中心
├── 概览
├── 我的 Post
├── 我的 Collection
├── 草稿
├── 收藏
├── 评论
├── 通知
└── 设置
```

“我的 Collection”同时包括：

- 我创建的 Collection；
- 我作为 member 加入的 Collection。

## 4.3 管理后台

```text
管理后台
├── Dashboard
├── Post 管理
├── Collection 管理
├── Category 管理
├── Tag 管理
├── 用户
├── 评论
├── 媒体
├── 首页精选
├── 站点设置
└── 操作日志
```

V3.2 不建设发布资格审批、Collection 审核、举报队列和内容管理员专属后台。

---

# 5. 统一内容模型：Post

## 5.1 设计原则

Article 与 Note 使用同一张 `posts` 表：

```text
Post
├── post_type = article
└── post_type = note
```

不建立两套重复的内容、草稿、媒体、互动和权限系统。

## 5.2 核心字段

Post 至少包含：

- `id`
- `author_id`
- `collection_id`，可空
- `post_type`
- `title`
- `summary`
- `body`
- `content_format`
- `cover_media_id`
- `category_id`，可空
- `status`
- `visibility`
- `moderation_status`
- `published_at`
- `occurred_at`
- `location`
- `mood`
- `created_at`
- `updated_at`
- `deleted_at`

Post 与媒体、Tag、互动和 Slug 使用正式关系表。

`visibility` 只在 `collection_id IS NULL` 时决定普通阅读范围；Post 一旦属于 Collection，普通阅读范围完全由 Collection creator/member 关系决定。

## 5.3 Article

适用于：

- 技术文章；
- 教程；
- 学习记录；
- 长文；
- 读书笔记；
- 思考；
- 随笔。

发布要求：

- 标题必填；
- Article Slug 必填；
- 正文必须满足最小发布条件；
- 支持 Summary；
- 支持 Category；
- 支持多个 Tag；
- 支持加入一个 Collection；
- 使用 `published_at` 作为独立文章的主要时间排序；
- 第一次正式发布后 `post_type=article` 永久锁定，不得转换为 Note。

## 5.4 Note

适用于：

- 日常；
- 摄影；
- 旅行；
- 碎片文字；
- 共同经历；
- 某一天的生活片段。

规则：

- 标题可空；
- 图片、文字、外部视频或 Live Photo 至少存在一种；
- 支持 `occurred_at`；
- 支持地点；
- 支持心情；
- 支持 Tag；
- 支持加入一个 Collection；
- 无标题时界面根据时间、摘要或媒体生成展示文本，数据库不伪造标题；
- 第一次正式发布后 `post_type=note` 永久锁定，不得转换为 Article。

Note 的生活时间统一使用：

```text
occurred_at ?? published_at
```

该时间用于 Note 时间流、Archive 和未手动排序 Collection 的默认时间线。

## 5.5 Article / Note 类型生命周期

草稿阶段允许：

```text
Article ↔ Note
```

切换时只保存两种类型都允许的通用字段，并对目标类型专属字段重新执行前端提示和发布校验。

第一次正式发布后：

- `post_type` 锁定；
- 编辑已发布内容不得改变 `post_type`；
- 不建设 Article 与 Note 之间的迁移、URL 重定向或类型转换工具。

## 5.6 作者归属

- `author_id` 创建后不得由普通用户修改；
- Post 只能由作者本人编辑；
- Collection 创建者不拥有投稿者 Post；
- Collection 创建者可以移除关联，但不能删除投稿者 Post；
- 管理员管理操作必须记录日志；
- V3.2 不建设普通账号停用/注销后的复杂内容接管流程。

## 5.7 状态

创作状态：

```text
draft
published
archived
```

管理状态独立为：

```text
active
hidden
```

语义：

- `draft`：仅作者在个人管理入口和有权管理员后台可访问；
- `published`：根据独立 Post visibility 或 Collection 成员 ACL 提供；
- `archived`：仍保留稳定 URL，可通过直接链接、Archive 和 Search 访问，但不进入首页和普通最新流；
- `hidden`：被管理员下架，普通成员访问返回 404；
- `deleted_at != null`：普通成员返回 404，作者或管理员只在管理入口按删除规则处理。

## 5.8 独立 Post 可见性

仅对 `collection_id IS NULL` 的 Post 支持：

```text
login_only
private
```

规则：

- `login_only`：所有有效 Ying-Mo 成员可读；
- `private`：仅作者本人通过普通内容/个人管理入口可读；
- 游客访问任何内容 JSON API 统一返回 401 `AUTHENTICATION_REQUIRED`；
- 有效成员访问其他人的 `private`、草稿、隐藏或删除内容统一返回 404 `RESOURCE_NOT_FOUND`；
- 管理员扩展读取只通过后台接口提供；
- 内容页面不得输出作品级 SEO HTML、Open Graph、结构化数据或可索引正文；
- Sitemap 和 RSS 不得传播作品地址；
- 媒体访问权限跟随 Post 的最终有效权限。

创建草稿默认 `private`。独立 Post 发布时不得把 `private` 静默扩大为 `login_only`；作者必须明确选择“所有 Ying-Mo 成员可见”。后端拒绝任何显式提交的 `public`。

## 5.9 Collection Post 权限

当 `collection_id IS NOT NULL` 时：

- Post 的普通阅读范围完全跟随所属 Collection；
- creator 和当前 Collection members 可读；
- 其他成员统一返回 404；
- Post 自身 `visibility` 不得扩大或缩小 Collection ACL；
- 绑定到 Collection 时后端将 `visibility` 规范化为 `private`，作为将来脱离 Collection 时的安全兜底；
- 作者即使后来被移出 Collection，仍可通过个人管理接口读取和编辑自己的历史 Post，但普通 Collection 阅读接口继续返回 404；
- 该作者管理例外不得返回 Collection 其他 Post、成员名单、封面、统计或其他敏感上下文。

## 5.10 时间语义

- `created_at`：数据库创建时间；
- `updated_at`：最后修改时间；
- `published_at`：第一次正式发布时间；
- `occurred_at`：Note 记录事件真实发生时间；
- 重新编辑不修改首次 `published_at`；
- 可以另外展示最后更新时间；
- Article Archive 使用 `published_at`；
- Note Archive 使用 `occurred_at ?? published_at`。

---

# 6. 草稿设计

## 6.1 唯一方案

V3.2 采用：

> 草稿也是 Post，使用 `posts.status = draft`。

最终不保留独立 `content_drafts` 和 `content_draft_media` 业务模型。

## 6.2 草稿创建

创建草稿时立即生成稳定 Post ID。

草稿允许字段不完整：

- Article 草稿可以暂时没有标题或 Slug；
- Note 草稿可以暂时没有正文或媒体；
- Category、Tag 和 Collection 可以后补；
- 媒体直接绑定草稿 Post；
- 草稿阶段允许切换 Article / Note。

完整发布校验只在发布操作时执行。

## 6.3 草稿权限

- 只有作者和有权管理员后台可读；
- 不进入成员共享列表、Search、Archive、Sitemap、RSS 或作品级 HTML 元数据；
- 普通用户无法通过 ID 枚举他人的草稿；
- 作者只能编辑自己的草稿；
- 草稿若绑定 Collection，创建和保存时必须校验作者当时是 creator/member；
- 发布动作必须再次校验当前 Collection 成员关系。

如果作者在草稿发布前被移出 Collection：

- 草稿不删除；
- 作者仍可在个人中心继续编辑；
- 不允许继续发布到原 Collection；
- 发布前必须将其变为独立 Post，或移动到作者当前有权限的其他 Collection；
- 改为独立 Post 时 `visibility=private`，由作者随后明确决定是否共享。

## 6.4 自动保存

P0 支持手动保存。

P1 支持草稿自动保存，要求：

- 仅对 `draft` 自动保存；
- 使用 `updated_at`、版本号或 ETag 防止旧请求覆盖新内容；
- 显示保存中、已保存和失败状态；
- 自动保存失败不应清空本地内容；
- Collection 成员变化导致自动保存失败时，不得丢失本地正文，应提示用户切换为独立草稿或其他 Collection。

已发布 Post 第一阶段不进行后台自动覆盖；编辑后由作者显式保存。

## 6.5 删除

- 从未发布的草稿可以物理删除；
- 草稿媒体在确认无其他引用后清理；
- 曾经发布的 Post 只做软删除并永久保留 Slug；
- 删除 Post 不删除 Collection；
- 删除操作只能由 Post 作者本人或有权管理员执行，Collection 创建者的“移出合集”不得等价为删除。

---

# 7. Category

## 7.1 定义

Category 是稳定、低数量、由管理员维护的主分类。

第一阶段：

```text
Post 0..1 → Category
```

Article 通常使用 Category，Note 可以不使用。

## 7.2 字段与约束

至少包含：

- `id`
- `name`
- `slug`
- `description`
- `sort_order`
- `is_active`
- `created_at`
- `updated_at`

要求：

- Name 标准化唯一；
- Slug 在 Category 命名空间唯一；
- 首次被已发布内容使用后 Slug 不允许修改；
- 停用 Category 不删除历史 Post；
- 只有系统管理员可以创建、修改和停用 Category；
- Category 页面和统计必须只聚合当前访问者有权读取的 Post。

---

# 8. Tag

## 8.1 定义与关系

Tag 是自由的横向主题标记。

使用正式关系表：

```text
tags
post_tags

Post N ↔ N Tag
```

禁止把正式 Tag 仅保存为 JSON 数组。

## 8.2 权限

- 所有 Ying-Mo 成员都可以给自己的 Post 关联 Tag；
- 所有成员可以在自己的 Post 编辑器中提交新 Tag 名称；
- 后端统一标准化、去重和生成 Slug；
- 管理员可以合并、停用和纠正 Tag；
- 普通成员不能直接修改其他 Tag 的全局名称、Slug 或状态。

## 8.3 约束

- 标准化 Name 唯一；
- Slug 在 Tag 命名空间唯一；
- 同一 Post 不得重复关联同一 Tag；
- 删除或停用 Tag 不删除 Post；
- 首次被已发布内容使用后 Slug 不允许修改；
- 发布接口必须防止并发创建重复 Tag；
- Tag 页面、使用数量和搜索建议必须只基于当前用户有权读取的 Post 聚合。

---

# 9. Collection

## 9.1 定义

Collection 是由一个创建者建立、并可邀请指定 Ying-Mo 成员共同阅读和记录的一段长期内容空间。

示例：

- 我的研究生日常；
- 我和朋友的杭州旅行；
- 毕业季；
- 摄影记录；
- 全栈学习；
- 一起吃过的店。

Collection 不是公开频道，也不是“所有站内成员默认可见”的分类容器。

## 9.2 关系

第一阶段采用：

```text
Collection 1 → N Post
Post 0..1 → Collection

Collection 1 → 1 creator(User)
Collection N ↔ N member(User)
```

其中 creator 单独保存在 `collections.creator_id`，不重复写入 `collection_members`。

不在 V3.2 P0 建设 Post 与 Collection 多对多。

## 9.3 核心字段

Collection 至少包含：

- `id`
- `creator_id`
- `name`
- `slug`
- `description`
- `cover_media_id`
- `status`
- `created_at`
- `updated_at`
- `deleted_at`
- `first_shared_at`，第一次有内容正式发布或 Collection 首次进入可用状态时记录，具体实现按迁移保持一致

V3.2 删除：

- `visibility`
- `contribution_policy`
- `review_status`
- `sort_order` 作为 Collection 自身全局排序字段的业务依赖（Post 在 Collection 内的顺序使用单独关系/排序字段实现）

## 9.4 Collection 成员关系

建立正式关系表，例如：

```text
collection_members
- collection_id
- user_id
- added_at
```

要求：

- `(collection_id, user_id)` 数据库唯一；
- creator 不写入该表；
- 只有 creator 可以修改成员列表；
- 被选择的 member 与 creator 同时拥有阅读权和投稿权；
- 未被选择的用户既不能读取也不能投稿；
- 不存在只读 member、只写 member 或额外发布资格；
- 后端在所有读取、列表、搜索、统计、媒体和写操作中统一使用成员 ACL。

## 9.5 创建与编辑成员

创建 Collection 时：

- `creator_id` 固定为当前登录用户；
- 创建者不能选择其他人为 creator；
- 创建者可以选择 0..N 个当前系统成员；
- UI 提供“全选所有成员”快捷操作；
- “全选”只把**当前时刻已有成员**逐个加入关系表，不保存 `all_members=true` 等永久模式；
- 未来新注册成员不会自动加入旧 Collection；
- Collection 创建后立即可用，不需要审核。

编辑 Collection 时：

- creator 可以增加 member；
- creator 可以移除 member；
- creator 自己不出现在可取消勾选的 member 列表中；
- creator 不支持移除自己；
- V3.2 不建设 creator 转让。

## 9.6 统一阅读与投稿 ACL

Collection 唯一成员判定：

```text
is_collection_member(user, collection)
=
user.id == collection.creator_id
OR
EXISTS collection_members(collection.id, user.id)
```

结果直接决定：

```text
can_read_collection = is_collection_member
can_contribute_collection = is_collection_member
```

非成员访问：

- Collection 详情返回 404；
- Collection 列表不出现；
- Search 不出现；
- Archive / Category / Tag / 用户主页不通过其 Post 泄漏 Collection；
- 首页不出现；
- 封面和媒体返回 404；
- 不返回成员名单、Post 数量、作者数量、更新时间等可推断信息。

## 9.7 Post 加入 Collection

只有 Post 作者本人可以把自己的 Post：

- 从独立状态加入 Collection；
- 从 Collection A 移到 Collection B。

目标 Collection 必须满足：

```text
当前作者是 creator 或 member
```

Collection creator 不能擅自把其他作者的独立 Post 拉入自己的 Collection。

移动操作必须原子完成：

```text
校验作者
→ 校验目标 Collection ACL
→ 解除旧 Collection 关系（如有）
→ 绑定新 Collection
→ visibility 规范化为 private 安全兜底
```

## 9.8 Post 移出 Collection

以下两方可以移除关联：

- Collection creator：可移出自己 Collection 中任意 Post；
- Post author：可主动把自己的 Post 移出所在 Collection。

移出后：

```text
collection_id = null
visibility = private
```

Post 本身不删除，作者不变，点赞、收藏、评论和媒体继续跟随 Post 保留。

作者之后可以自行决定是否将该独立 Post 改为 `login_only`。

## 9.9 member 被移除

假设成员 B 被 creator 从 Collection 移除：

- B 从保存成功起不能继续新增 Post；
- B 不能再通过普通 Collection 页面读取该 Collection；
- B 已经发布在其中的历史 Post 全部保留；
- 这些 Post 的 `author_id` 仍为 B；
- B 仍可从 `/me/posts` 等作者管理入口查看和编辑自己的历史 Post；
- B 的作者管理接口不得返回 Collection 其他 Post、封面、成员、统计或其他上下文；
- B 编辑自己的历史 Post 后仍不得借此重新获得 Collection 阅读权；
- 若 B 想主动脱离某篇历史 Post，可由 B 自己执行“移出 Collection”；
- creator 也可以逐篇将 B 的历史 Post 移出，但移除 member 本身不自动移除历史 Post。

## 9.10 删除 Collection

删除 Collection 不删除任何 Post。

删除动作必须：

```text
对 Collection 做软删除或按既有删除策略处理
→ 所有关联 Post.collection_id = null
→ 所有关联 Post.visibility = private
→ 保留 Post 作者、状态、Slug、互动和媒体
```

之后每位作者自行决定是否将自己的独立 Post 重新共享为 `login_only`。

从未包含内容且从未进入共享使用的空 Collection 可以物理删除。

## 9.11 Collection 内排序

默认时间线：

- Article 使用 `published_at`；
- Note 使用 `occurred_at ?? published_at`。

Collection creator 可以手动拖拽调整展示顺序。

一旦某 Post 有明确手动排序值，则手动排序优先；未手动排序对象继续按默认时间线稳定排序。

建议使用独立的 Collection-Post 排序字段或关系层排序值，避免把 Collection 自身 `sort_order` 与内部 Post 顺序混为一谈。

---

# 10. URL、Slug 与历史地址规则

## 10.1 Article URL

已发布 Article 的唯一 Canonical URL：

```text
/articles/:slug
```

Article 必须拥有 Slug。

Article Slug 在 Article 命名空间永久唯一。不同资源类型允许使用相同 Slug：

```text
/articles/python
/collections/python
/categories/python
/tags/python
```

两篇不同 Article 不得使用相同 Slug。

## 10.2 Article Slug 生命周期

Slug 从 Article 第一次正式发布时开始永久占用，与可见性取值无关。

即使 Article 后续：

- 修改 Slug；
- 归档；
- 设为私有；
- 被软删除；

该 Slug 也不得分配给其他 Article。

同一 Article 可以重新使用自己曾经使用过的历史 Slug。

草稿阶段的 Slug 只是候选值，不永久占用；发布事务必须通过数据库唯一约束解决并发冲突。

## 10.3 Slug 注册表

后端必须持久化所有已正式发布 Article Slug。

使用独立注册表，例如：

```text
article_slugs
```

至少记录：

```text
id
post_id
slug
is_current
created_at
retired_at
```

要求：

- `slug` 数据库唯一；
- 同一 Article 只能有一个当前 Slug；
- 历史记录不得删除；
- 修改 Slug 在同一事务中完成旧值退役和新值启用；
- 后端同时校验当前和历史使用情况；
- 只要 Slug 属于另一篇已正式发布 Article，就拒绝写入；
- Slug 注册表是永久占用和路由解析的权威来源。

## 10.4 Slug 修改与 301

已发布 Article 修改 Slug 后，旧 Slug 永久保留重定向。

```text
/articles/python-learning
→ 301 Moved Permanently
→ /articles/python-roadmap
```

所有历史 Slug 必须直接重定向到当前 Canonical，不允许形成连续 301 链。

游客访问当前或历史 Article Slug 对应的 JSON API 时先命中认证边界并返回 401，不解析目标是否存在。HTML 文档请求仍只返回通用无数据 SPA Shell。有效登录用户通过受保护 JSON API 解析历史 Slug 时，只有在对当前 Article 有读取权限的情况下才返回 301 与当前 Canonical；React 随后使用 Replace Navigation 切换到当前内容地址。无权、隐藏或已删除内容均返回 404，不泄漏当前地址或资源状态。作者和有权管理员在管理入口查看删除记录时不使用会员阅读路由。

## 10.5 Note URL

Note 第一阶段不使用 Slug。

Canonical 固定为：

```text
/notes/:id
```

Note ID 创建后永久稳定。修改标题、正文、时间、地点或 Collection 不改变 URL。

## 10.6 其他 Slug

Canonical：

```text
Collection  /collections/:slug
Category    /categories/:slug
Tag         /tags/:slug
```

Collection 在第一次包含正式发布 Post 后不允许修改 Slug；Category 和 Tag 在首次被已发布内容使用后不允许修改 Slug。V3.2 不为它们建设历史 Slug 重定向链。

## 10.7 301、401、404 与归档

```text
游客访问内容 HTML                    → 200 通用无数据 SPA Shell，前端跳转登录
游客访问内容 JSON API                → 401 Authentication Required
有权成员解析 Article 历史 Slug API     → 301 并返回当前 Canonical
普通成员访问软删除、隐藏或无权资源      → 404 Not Found
资源从未存在                          → 404 Not Found
login_only + archived                → 200，保留稳定地址
```

禁止把删除地址重定向到首页或无关内容。

## 10.8 旧 Life URL

项目未上线且旧测试数据全部放弃，因此 V3.2 不保留：

```text
/life/post/:id
/life/chapter/:slug
```

这些旧地址统一按从未存在处理，返回 404。

---

# 11. 媒体系统

## 11.1 保留能力

- 图片；
- 缩略图；
- Live Photo；
- 封面；
- 正文媒体；
- 外部视频链接；
- 媒体所有权；
- 媒体绑定；
- 对象存储；
- 受权限保护的访问。

## 11.2 上传规则

第一阶段支持：

- JPG / JPEG；
- PNG；
- WebP；
- 现有 Live Photo 所需媒体类型。

单文件默认上限 15 MB，后端必须校验实际内容而不是只相信扩展名和 MIME 声明。

必须验证：

- 上传者身份；
- 文件真实类型；
- 文件大小；
- 媒体所有权；
- 绑定状态；
- Post 或 Collection 归属；
- 访问者是否有权读取关联内容。

读取规则：

- 游客读取作品图片、缩略图、Collection 封面、Live Photo、播放地址或用户头像时返回 401 `AUTHENTICATION_REQUIRED`；
- 独立 `login_only` Post 媒体对所有有效成员可读；
- 独立 `private` Post 媒体仅作者可读；
- Collection 封面与 Collection Post 媒体仅 creator / 当前 members 可读；
- 被移除 member 即使仍是某历史 Post 作者，也只能通过作者管理/预览流程读取自己 Post 的媒体，不得因此读取 Collection 其他媒体；
- 有效登录用户读取其他无权媒体统一返回 404；
- 内容媒体继续使用受保护代理或短期签名地址，不提供永久公开存储 URL；
- 签名播放地址必须绑定访问者身份、目标资源、权限上下文和短有效期，并在真正传输文件时重新检查权限；
- 作品媒体、Collection 封面和用户头像响应使用 `Cache-Control: private, no-store`；Logo、字体和通用站点装饰资源可以保持公开缓存；
- 退出登录或会话失效后，前端必须撤销 Blob URL、播放地址和内容内存缓存。

## 11.3 绑定

- 草稿媒体直接绑定 Post ID；
- 媒体不能被其他作者越权绑定；
- 独立 Post 封面必须属于作者；
- Collection 封面只能由 creator 管理；
- Post 加入或移出 Collection 不改变媒体所有者，只改变有效读取权限；
- 删除关系前检查其他引用；
- 数据库提交和对象存储删除失败必须可重试；
- 孤立媒体清理由后台任务或维护命令完成。

## 11.4 旧媒体

旧游戏与旧 Life 测试媒体无需迁移。删除前只需确认其未被 V3 新内容引用，不需要建立生产级归档。

---

# 12. 创作与编辑器

## 12.1 创作入口

所有正常 Ying-Mo 成员都显示创作入口。

入口可以位于：

- 顶部“写作”；
- 头像菜单；
- 个人中心；
- Collection 详情的“在这里记录”。

最终路由：

```text
/write
/write/:id
```

## 12.2 编辑器能力

- Article / Note 类型；
- 标题；
- Summary；
- Markdown 正文；
- 安全预览；
- 图片上传和插入；
- Live Photo；
- 外部视频链接；
- 拖拽上传；
- 剪贴板粘贴；
- 封面；
- Category；
- Tag；
- Collection；
- 独立 Post 可见性；
- 发布时间；
- occurred_at；
- 地点；
- 心情；
- 草稿保存；
- 发布；
- 归档；
- 编辑已发布内容。

草稿阶段 Article / Note 可切换；第一次正式发布后类型选择控件锁定。

## 12.3 Collection 选择

编辑器只展示当前作者可投稿的 Collection：

```text
作者创建的 Collection
+
作者当前作为 member 加入的 Collection
```

后端必须再次验证，不能相信前端下拉列表。

规则：

- 选择 Collection 后，独立 Post 的 visibility 控件隐藏或禁用，并明确提示“阅读权限由合集成员决定”；
- 从 Collection 切换为“不加入合集”时，visibility 强制恢复为 `private`，作者再主动选择是否共享；
- 已发布 Post 可以由作者本人加入或移动到其他有权限 Collection；
- Collection creator 不能通过编辑 Collection 强制移动他人 Post；
- 如果保存/发布时作者已不再属于目标 Collection，应阻止操作并保留编辑器内容。

## 12.4 Markdown

P0 支持：

- 标题；
- 段落；
- 列表；
- 引用；
- 链接；
- 图片；
- 表格；
- 代码块；
- 站内媒体占位；
- XSS Sanitization。

P1 支持：

- 数学公式；
- 脚注；
- 更完整的 Markdown 扩展。

---

# 13. 首页

## 13.1 职责

游客首页只表达：

- Ying-Mo 是一个需要邀请码注册、登录后使用的朋友记录空间；
- 品牌与共同记录理念；
- 登录、注册和 About 入口。

游客首页不得展示作品标题、摘要、作者、用户列表、统计、封面、媒体或动态活动数据。

有效登录后的首页表达：

- Ying-Mo 的品牌；
- 站长与朋友共同记录的氛围；
- 当前用户有权读取的精选 Article；
- 当前用户有权读取的最近 Article；
- 当前用户有权读取的最近 Note；
- 当前用户属于的共同 Collection；
- 时间与生活感。

不展示游戏入口、地图、英雄、点位或游戏推荐。

## 13.2 推荐结构

```text
Hero
↓
精选 Article
↓
最近 Article
↓
朋友们的最近 Note
↓
我的共同 Collection
↓
关于 Ying-Mo
```

不再设置与“最近 Article / 最近 Note”重复的独立“最近更新”模块。

首页不得一次加载全部历史内容。

所有首页聚合必须在 SQL 查询阶段先应用：

- 独立 Post visibility；
- Collection creator/member ACL；
- status / moderation_status / deleted_at。

## 13.3 顶部导航

游客导航：

```text
首页
关于
登录
注册
```

有效登录后的成员导航：

```text
首页
文章
手记
合集
归档
关于
```

右侧：

- 搜索；
- 深浅主题；
- 头像；
- 所有成员可见的“写作”。

---

# 14. Article 阅读

## 14.1 列表

展示：

- 标题；
- Summary；
- 作者；
- 封面；
- Category；
- Tag；
- 发布时间；
- 更新时间；
- 阅读时间估算。

支持分页、作者筛选、Category、Tag、Collection 和发布时间排序。

## 14.2 详情

至少展示：

- 标题；
- Summary；
- 作者；
- 发布时间；
- 更新时间；
- Category；
- Tag；
- Collection；
- 封面；
- Markdown 正文；
- 图片与媒体；
- TOC；
- 阅读进度；
- 上一篇 / 下一篇；
- 相关文章；
- 点赞；
- 收藏；
- 评论。

上一篇、下一篇默认在同一作者且当前访问者有权读取的已发布 Article 中计算，避免不同作者内容关系混乱或私密信息泄漏。

## 14.3 TOC 与代码块

- Heading Anchor 稳定；
- URL Hash 可定位；
- 标题不足时不展示空 TOC；
- 移动端可收起；
- 代码正确转义；
- 支持语法高亮和横向滚动；
- 代码块不得撑破移动端布局。

---

补充权限规则：

- Article 列表只包含当前用户有权读取的独立 Article 和 Collection Article；
- 上一篇 / 下一篇和相关文章必须排除当前用户无权访问的 Collection Article；
- 作者被移出 Collection 后，通过普通 Article 阅读 URL 仍按 Collection ACL 返回 404；作者编辑自己的历史 Article 使用个人管理入口。

# 15. Note 阅读

## 15.1 列表

Note 使用时间流和影像流展示：

- 作者；
- 图片或 Live Photo 缩略图；
- 短正文；
- `occurred_at`；
- 地点；
- 心情；
- Tag；
- Collection。

支持按作者、Collection、Tag 和时间筛选。

## 15.2 详情

展示：

- 作者；
- 正文；
- 图片和 Live Photo；
- occurred_at；
- published_at；
- 地点；
- 心情；
- Tag；
- Collection；
- 点赞；
- 收藏；
- 评论。

---

补充权限规则：

- Note 列表与时间流只包含当前用户有权读取的对象；
- Collection Note 必须校验当前用户是 creator/member；
- Note 在 Archive 和生活时间流中统一使用 `occurred_at ?? published_at`；
- 作者被移出 Collection 后，通过普通 Note URL 仍按 Collection ACL 返回 404；作者管理自己的历史 Note 使用个人管理入口。

# 16. 用户主页

成员用户主页路由：

```text
/users/:username
```

## 16.1 username 与 nickname

注册页必须同时解释两个字段：

**username（用户名）**

- 用于稳定个人主页地址；
- 全站唯一；
- 建议只允许小写英文字母、数字、`-`、`_`；
- 建议长度 3–32；
- 注册时标准化为小写；
- 注册成功后不可修改；
- 示例：`icesakura` → `/users/icesakura`。

**nickname（昵称）**

- 用于页面展示；
- 支持 Unicode；
- 可以与别人重复；
- 注册后可以修改；
- 示例：`易轩`。

注册页面文案必须让非技术用户理解“用户名用于网址且不能改，昵称只是展示名且以后能改”。

## 16.2 主页展示

至少展示：

- 头像；
- nickname；
- username；
- 简介；
- 地区；
- 当前访问者有权读取的独立 `login_only` Article；
- 当前访问者有权读取的独立 `login_only` Note；
- 当前访问者与该用户共同有权限的 Collection Post；
- 当前访问者自己也是 creator/member 的、由该用户创建或参与的 Collection；
- 权限过滤后的共享内容数量。

不展示：

- 邮箱；
- 私密独立 Post 数量；
- 当前访问者无权 Collection 的名称、数量或存在性；
- 收藏；
- 登录状态；
- 管理权限；
- 草稿。

用户主页必须登录后访问。About 页面可以对游客开放，但不得读取或嵌入动态用户、作品、统计或媒体数据。

---

# 17. Archive 与 Explore

## 17.1 Archive

Archive 采用内容语义时间：

```text
Article → published_at
Note    → occurred_at ?? published_at
```

按：

```text
年
└── 月
```

组织。

支持：

- 全站有权内容时间归档；
- 按作者归档；
- Category；
- Tag；
- Collection。

权限要求：

- 独立 `login_only` Post 对所有成员可进入 Archive；
- 独立 `private` 仅作者个人管理范围可见；
- Collection Post 只有 creator/member 可以在 Archive 中看到；
- Archive 月份、数量、Facet 必须先应用权限后再聚合；
- 不得通过空月份、计数或筛选项泄漏无权 Collection 内容。

## 17.2 Explore

Explore 为 P1，可包含：

- 随机 Article；
- 随机 Note；
- 精选 Collection；
- 往年今日；
- Tag 漫游；
- 最近加入的成员。

所有候选内容必须先经过当前访问者权限过滤。

禁止建设创作者排名、贡献榜和流量竞争榜。

---

# 18. Search

## 18.1 搜索对象

成员 Search 可以搜索：

- 当前用户有权读取的 Post；
- 当前用户是 creator/member 的 Collection；
- 基于有权 Post 产生的 Category；
- 基于有权 Post 产生的 Tag；
- 活跃成员。

会员 Search 不搜索游戏对象、他人的草稿、他人的独立 private 内容、隐藏或删除内容，以及当前用户无权访问的 Collection 和其 Post。

## 18.2 Post 结果

至少显示：

- Article / Note 类型；
- 标题或摘要；
- 作者；
- 语义时间；
- Category；
- Tag；
- Collection（仅当前用户有权时）；
- 缩略图。

Article 时间使用 `published_at`，Note 可展示 `occurred_at ?? published_at`。

## 18.3 权限

- 游客访问 Search API 返回 401，搜索页面跳转登录；
- 独立 `login_only` 内容可被所有成员搜索；
- Collection 与 Collection Post 仅 creator/member 可搜索；
- 作者可以在个人中心搜索自己的草稿和独立 private 内容；
- 被移出 Collection 的作者不得通过普通 Search 找到原 Collection，但个人管理搜索可找到自己仍在其中的历史 Post；
- 管理搜索与成员搜索使用不同权限范围；
- 查询参数不得扩大调用者原有权限；
- 搜索建议、Facet 和总数同样先做权限过滤。

---

# 19. 互动系统

## 19.1 目标类型

V3.2 互动目标统一为：

```text
post
```

P0 多态值注册表至少覆盖：

```text
comments.target_type
content_likes.target_type
content_favorites.target_type
notifications.target_type
featured_content.target_type
media.bound_type
admin_logs.target_type
search scope
```

举报不是 V3.2 P0/P1 主链；若未来实现，在 P2 独立设计 `reports`，不得让旧 `life_post` 或 `game_guide` 语义重新扩散。

## 19.2 点赞

- 登录成员可以点赞有权访问的 Post；
- 同一用户同一 Post 只能点赞一次；
- 再次操作取消；
- 不能点赞自己无权读取的内容；
- P0 不发送逐条点赞通知，页面展示点赞状态和计数即可；
- 内容后续失去访问权限时，不得通过点赞列表或计数详情泄漏正文。

## 19.3 收藏

- 登录成员可以收藏有权访问的 Post；
- 收藏列表仅本人可见；
- 取消收藏不影响 Post；
- 内容失去访问权限后不得在收藏列表泄漏正文、封面或 Collection 信息；
- 对已无权内容可显示通用“内容暂不可访问”占位或直接从可见收藏列表中过滤。

## 19.4 评论与回复

P0 支持：

- 一级评论；
- 一级回复；
- 分页；
- 作者删除自己的评论；
- 管理员在极端情况下隐藏评论。

评论正文长度固定为 1–500 个 Unicode 字符。

所有正常成员只要有权读取目标 Post 即可评论，不存在 `can_comment`。

删除一级评论时：

- 若没有回复，可以物理删除或按现有策略删除；
- 若已有回复，保留评论节点并显示 `[该评论已删除]`；
- 不得因为父评论作者删除自己的内容而级联删除其他成员回复。

## 19.5 举报

举报系统降为 P2，V3.2 P0/P1 不要求实现：

- 举报 Post；
- 举报评论；
- 举报用户；
- 举报原因枚举；
- 举报队列；
- 举报处理通知。

极端内容问题由 Admin 使用现有内容隐藏/恢复能力处理。

---

# 20. 通知

P0 保留对朋友共同记录真正有价值的通知：

- 有人评论我的 Post；
- 有人回复我的评论；
- 我被加入某个 Collection；
- 我被移出某个 Collection；
- 我创建的 Collection 收到其他成员的新 Post；
- 我的 Post 被 Collection creator 移出关联；
- 系统通知。

P0 不发送：

- 单条点赞通知；
- 发布资格变化通知；
- Collection 审核通知；
- 举报处理通知。

通知权限规则：

- 通知目标指向 Post 时，根据 Article / Note 生成正确 Canonical URL；
- 接收者点击时必须重新检查当前权限；
- 被移出 Collection 的用户收到“已被移出”通知后，不得因为通知链接继续访问 Collection；
- “我的 Post 被移出 Collection”可以链接到作者自己的管理页；
- 通知正文不得包含接收者当前已无权读取的其他 Collection 内容摘要。

---

# 21. 管理后台

## 21.1 Dashboard

展示：

- 用户数；
- Post 总数；
- Article 数；
- Note 数；
- 草稿数；
- Collection 数；
- 评论数；
- 最近内容；
- 最近互动；
- 必要系统状态。

不再展示：

- 获准记录者数；
- 待审核 Collection；
- 待处理举报。

## 21.2 用户

支持：

- 搜索用户；
- 查看 username、nickname、注册时间和基础资料；
- 查看治理/维护所需的内容数量；
- 不提供 `can_publish`、`can_comment` 开关；
- V3.2 不建设日常账号停用/恢复业务流程。

## 21.3 Post 管理

- 搜索；
- 作者筛选；
- 类型筛选；
- 状态筛选；
- 独立 visibility 筛选；
- Category、Tag、Collection 筛选；
- 内容预览；
- 隐藏；
- 恢复；
- 设置精选；
- 软删除高风险操作确认。

管理员不得在无日志情况下改变作者归属。

## 21.4 Collection 管理

- 搜索 Collection；
- 查看 creator；
- 查看成员列表；
- 查看内容数量；
- 查看状态；
- 极端情况下隐藏/恢复或删除；
- 不建设审核、拒绝、重新提交或发布资格管理。

普通成员的 Collection 成员编辑仍只由 creator 在成员端编辑页完成，后台不替代日常使用流程。

## 21.5 Category / Tag

- 创建和编辑 Category；
- 停用 Category；
- 查看权限过滤后的使用数量；
- 合并重复 Tag；
- 停用违规/错误 Tag；
- 保持历史 URL 稳定。

## 21.6 首页精选

只有 Admin 可以设置或取消首页精选。

精选对象可以是 Article 或 Collection，但实际首页返回时必须再次应用当前访问者权限：

- 当前用户无权的 Collection 不展示；
- 当前用户无权的 Collection Article 不展示；
- 不得因为 Admin 标记“精选”而扩大内容权限。

## 21.7 操作日志

高风险操作记录：

- 操作者；
- 请求 ID；
- 时间；
- 对象；
- 修改前；
- 修改后；
- 原因；
- 幂等键（适用时）。

至少覆盖 Admin 的隐藏、恢复、软删除、作者相关高风险操作和站点配置变化。

---

# 22. 游客 HTML、索引与订阅出口

## 22.1 技术方案

保持 React + Vite + Flask。

当前 Access Token 保存在前端内存中，浏览器刷新会员内容地址时，HTML 文档请求不会携带 API 使用的 Authorization Header。因此 Flask 不得直接用文档请求判断会员身份，也不得继续输出内容相关 SEO HTML。

Article、Note、Collection、用户主页、Category、Tag、Archive 和 Search 的首次 HTTP 响应统一为：

> 不包含任何动态内容数据的通用 SPA Shell，React 恢复会话后再访问受保护 JSON API。

通用 SPA Shell 必须：

- 不包含作品标题、摘要、正文、作者、用户资料、统计、封面或媒体地址；
- 使用通用站点 `<title>`、Description 和 Open Graph；
- 输出 `noindex,nofollow`；
- 使用 `Cache-Control: private, no-store`；
- 能加载 React、恢复登录状态并显示安全加载状态；
- 未登录时由前端跳转 `/login`，保留完整原始路径、Query 和 Hash；
- 登录成功后返回原地址。

`/` 可以输出会员空间介绍，`/about` 可以输出静态说明；二者都不得包含动态用户或作品数据。通用品牌 Logo、字体和装饰资源不属于会员内容，可以公开缓存。

## 22.2 索引规则

允许索引的页面仅限：

- 不包含动态内容的会员空间介绍首页；
- 不包含动态内容的 About。

Article、Note、Collection、用户主页、Category、Tag、Archive、Search、评论、互动、草稿、个人中心、认证页面和管理后台全部禁止索引。`robots.txt` 只能辅助减少抓取，不能替代鉴权、无数据 HTML 和 API 权限裁决。

## 22.3 Sitemap

Sitemap 只允许包含无动态内容的首页和 About，不得包含 Article、Note、Collection、Category、Tag、Archive、Search、用户主页、认证页面、个人中心或管理后台地址。

## 22.4 RSS

作品 RSS 停用。`/rss.xml` 返回 404，且不得通过其他 Feed、JSON Feed、Atom、站点地图或发现链接传播内容地址。

隐私模型切换时必须清理或失效曾缓存的内容 HTML、Open Graph、Sitemap、RSS、封面、头像和媒体响应；无法立即从第三方搜索缓存移除的历史信息必须登记为上线风险，不得宣称即时消失。

---

# 23. 前端路由

```text
/                               首页

/articles                       Article 列表
/articles/:slug                 Article 详情及历史 Slug 解析

/notes                          Note 列表
/notes/:id                      Note 详情

/collections                    Collection 列表
/collections/:slug              Collection 详情

/users/:username                会员用户主页

/archive                        归档
/archive/:year                  年归档
/archive/:year/:month           月归档

/categories/:slug               Category 页面
/tags/:slug                     Tag 页面

/search                         搜索
/about                          关于

/login                          登录
/register                       注册

/write                          创建草稿
/write/:id                      编辑自己的 Post

/me                             个人中心
/me/posts                       我的 Post
/me/collections                 我的 Collection
/me/drafts                      我的草稿
/me/favorites                   收藏
/me/comments                    评论
/me/notifications               通知
/me/settings                    设置

/admin                          管理后台
```

游客可直接访问的前端路由仅包括 `/`、`/login`、`/register`、`/forgot-password`、`/verify-email`、`/reset-password` 和 `/about`。Article、Note、Collection、用户主页、Category、Tag、Archive、Search、互动、个人中心、创作与后台路由全部要求先确认有效登录；认证状态尚未确认时只显示加载状态，不提前请求内容。

旧 `/life/*`、`/games/*` 和 `/guide/*` 不属于最终路由。

---

# 24. 后端 API

统一前缀：

```text
/api/v1
```

最终接口组：

```text
/auth
/home
/users
/posts
/collections
/categories
/tags
/archive
/uploads
/comments
/interactions
/notifications
/search
/admin
```

V3.2 P0/P1 不注册 `/reports` 业务组。

## 24.1 Auth

注册至少接受：

```text
username
nickname
email
password
invite_code
```

要求：

- `invite_code` 必须与服务端环境变量配置一致；
- 校验失败返回统一参数/业务错误，不返回正确邀请码；
- 注册成功后不保存用户输入的邀请码；
- username 标准化后全站唯一；
- nickname 仅作为展示名；
- 邀请码只参与注册，不进入 Access/Refresh Token Claims。

P1 账户可信与恢复接口：

```text
POST /auth/email-verification/request
POST /auth/email-verification/confirm
POST /auth/password-reset/request
POST /auth/password-reset/confirm
```

要求：

- 正确邀请码注册后仍立即成为正常成员；邮箱未验证不得变成额外的登录、创作或 Collection 审批门禁；
- 邮箱验证与密码重置使用有过期时间、单次消费、可撤销的随机令牌，数据库只保存摘要；
- 邮件链接中的令牌放在 URL Fragment，由前端读取后立即从地址栏清除，不进入服务端 Path、Query 和访问日志；
- 忘记密码对不存在、未验证、受限和处于冷却期的账号返回相同状态与响应，不泄漏账号存在性或验证状态；
- 密码重置只向 active 且已验证邮箱发送；成功后撤销该用户全部 Refresh Session，不自动登录；
- 生产邮件链接只能由配置的 HTTPS `SITE_URL` 构造，生产邮件投递必须使用 TLS SMTP。

## 24.2 Posts

至少支持：

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
```

`POST /posts` 创建 `draft`。

成员查询支持：

- `post_type`
- `author`
- `category`
- `tag`
- `collection`
- `page`
- `page_size`
- `sort`

普通成员查询必须自动应用独立 visibility 和 Collection ACL。

`status`、`visibility`、`moderation_status` 的扩展筛选仅作者个人中心或后台接口允许。

`move-collection`：

- 只能由 Post author 调用；
- 目标 Collection 必须是 author 当前可读可投稿的 Collection；
- 移动后 `visibility=private` 安全兜底；
- 已发布 Article / Note 类型不变。

`remove-from-collection`：

- Post author 可以调用；
- 当前 Collection creator 也可以通过 Collection 管理接口移除；
- 移除后 `collection_id=null`、`visibility=private`。

## 24.3 Collections

至少支持：

```text
GET    /collections
GET    /collections/:slug
POST   /collections
PATCH  /collections/:id
GET    /collections/:id/members
PUT    /collections/:id/members
POST   /collections/:id/remove-post
DELETE /collections/:id
```

规则：

- `GET /collections` 只返回当前用户是 creator/member 的 Collection；
- `GET /collections/:slug` 非成员返回 404；
- `POST /collections` 自动使用当前用户为 creator；
- 创建时可提交 `member_ids[]`；
- `PUT /collections/:id/members` 仅 creator；
- creator 不允许出现在待移除 member 集合；
- `remove-post` 仅 creator，且只解除关联不删除 Post；
- 删除 Collection 时所有 Post 原子脱离并变为 `private`；
- 不存在 `submit-review`；
- 不校验 `can_publish`、`review_status` 或 `contribution_policy`。

## 24.4 Categories / Tags

- 读取接口要求有效登录；
- Category 写操作仅系统管理员；
- 所有成员可以在自己的 Post 中提交 Tag；
- 管理员负责 Tag 合并与停用；
- Category / Tag 聚合结果必须先做内容权限过滤。

## 24.5 用户

- 注册成功用户立即具备正常创作能力；
- 用户名 username 注册后不可修改；
- nickname 可修改；
- 成员用户接口不返回邮箱和管理敏感字段；
- 用户内容列表必须应用独立 Post 和 Collection ACL；
- 用户主页统计不得包含当前访问者无权对象。

## 24.6 响应与错误

所有接口统一：

- JSON 响应结构；
- 错误码；
- 参数校验；
- UTC ISO 8601 时间；
- 分页元数据；
- 401、403、404、409、422 语义，以及仅在明确管理流程中使用的 410；
- 请求 ID。

---

# 25. API 可见性与访问裁决

## 25.1 匿名访问

游客访问所有内容相关 JSON API 时，必须在查询资源是否存在之前统一返回：

```text
HTTP 401
error.code = AUTHENTICATION_REQUIRED
```

范围包括：首页内容聚合、Post、Collection、用户主页与用户作品、Category、Tag、Archive、Search 与建议词、评论读取、互动读取、媒体、缩略图、播放地址、历史 Slug、重定向解析和通知目标。

注册接口例外允许匿名调用，但必须校验邀请码并限流。

无效、过期或撤销 Token 沿用现有 401 Token 错误码。JSON API 不使用 302，浏览器导航由前端路由处理。

## 25.2 独立 Post 读取

当 `collection_id IS NULL`：

普通成员可以读取：

```text
moderation_status = active
deleted_at IS NULL
status IN (published, archived)
AND (
  visibility = login_only
  OR author_id = current_user.id
)
```

首页和普通最新流只展示 `published`；Archive、Search 和直接详情可以展示有权的 `archived`。

其他人的 `private`、草稿、隐藏或删除内容统一返回 404 `RESOURCE_NOT_FOUND`。

## 25.3 Collection 与 Collection Post 读取

Collection 普通成员读取条件：

```text
collection.deleted_at IS NULL
AND collection.status = active
AND (
  collection.creator_id = current_user.id
  OR EXISTS collection_members(collection.id, current_user.id)
)
```

Collection Post 普通阅读条件必须同时满足：

- Post 状态允许读取；
- Post 未隐藏、未删除；
- 所属 Collection 满足上述成员条件。

Collection Post 的 `posts.visibility` 不参与普通成员范围扩大或缩小。

非成员访问当前或历史 Collection Post、Collection 详情、封面或成员信息统一 404，不泄漏是否存在。

## 25.4 被移除作者管理例外

如果 Post 作者已经不再是所属 Collection 的 creator/member：

普通内容接口仍按 Collection ACL 返回 404。

作者个人管理接口可以读取：

- 自己 Post 的正文和元数据；
- 自己绑定的媒体；
- 当前 `collection_id` 的最小管理必要标识；
- “移出 Collection”操作能力。

作者管理接口不得返回：

- Collection 其他 Post；
- Collection 封面；
- 当前成员名单；
- Collection 总 Post 数；
- 其他作者信息聚合；
- 搜索/Archive 中的 Collection 上下文。

## 25.5 列表、Search、Archive、主页与统计

所有列表、分页总数、搜索建议、Category / Tag / Archive Facet、用户统计、首页聚合、精选和推荐结果必须在 SQL 查询阶段先应用权限，再聚合和分页。

统一原则：

```text
独立 Post
→ visibility + author

Collection
→ creator/member

Collection Post
→ Collection creator/member
```

不能先查出无权数据后在 Python 或前端逐条过滤。

不得通过标题、摘要、作者、封面、媒体 URL、计数、历史 Slug、通知、重定向或错误差异泄漏无权 Collection。

## 25.6 写入裁决

后端必须最终验证：

- 用户为有效登录成员；
- Post author；
- Article / Note 发布后类型锁定；
- Collection creator；
- Collection member 关系；
- Post 加入/移动 Collection 只能由 author 发起；
- Collection creator 移出 Post 只解除关联；
- 媒体所有权；
- Tag 和 Category 合法性；
- Slug 当前与历史占用；
- 独立 Post visibility；
- 重复互动。

Post 写接口只接受独立 Post 的 `login_only` 和 `private`，显式提交 `public` 返回参数校验错误。

Collection 不接受 `visibility`、`contribution_policy`、`review_status`、`can_publish` 等 V3.2 字段。

## 25.7 管理读取

系统管理员只通过独立后台接口获得角色允许的私密、草稿、隐藏或删除记录。

普通成员内容接口不得因为访问者是 Admin 而无条件扩大结果集，避免前台行为和后台行为混淆。

后台读取、预览、恢复、下架和删除继续遵守操作日志和高风险操作确认。

---

# 26. 游戏与旧 Life 领域退役

## 26.1 最终运行时必须消失

- Games Blueprint；
- Guides Blueprint；
- 游戏 Seed；
- Overwatch 导入脚本；
- Game / GameHero / GameMap；
- GameGuide / GameGuideStep；
- GuideValidityFeedback；
- 游戏搜索；
- 游戏通知；
- 游戏后台；
- 游戏媒体权限分支；
- 游戏前端路由、页面、组件、API 和 CSS。

## 26.2 旧 Life 语义

最终运行时统一使用：

```text
post
collection
```

不再使用：

```text
life_post
life_chapter
```

现有 LifePost / LifeChapter 测试数据不迁移。旧 Collection 的投稿策略、审核和可见性语义不迁移；V3.2 统一按 `creator_id + collection_members` 重新建立 Collection 权限并覆盖测试。

## 26.3 删除顺序

```text
建立 Post / Collection 新主链
→ 打通创作和会员读取
→ 会员内容服务切换为 post
→ 前端切换
→ 解除旧 Blueprint 和模型引用
→ 删除游戏与旧 Life 运行时代码
→ 通过迁移删除旧表
→ 清理旧测试媒体
```

## 26.4 V1 静态参考

仓库根目录的 `index.html`、`style.css`、`script.js` 和 `assets/` 继续作为 V1 静态视觉参考，除非后续独立任务明确完成迁移和归档，不在本轮重构中删除或改写。

---

# 27. 数据库与迁移策略

## 27.1 当前数据处置

当前所有业务数据均为未上线测试数据，可以放弃。

V3.2 不要求：

- LifePost 回填；
- LifeChapter 转换；
- 游戏数据导出；
- 互动数据迁移；
- 旧 URL 映射；
- 测试媒体恢复；
- V3.2 Collection 审核数据兼容；
- V3.2 `can_publish / can_comment` 测试数据保留。

## 27.2 Migration 要求

- 所有表和约束变化必须有 Alembic migration；
- 每次 migration 单一目的；
- MySQL DDL 按非完整事务能力设计；
- 删除旧表/字段前应用不得再引用旧模型；
- migration 必须验证空数据库 `upgrade head`；
- migration 必须验证已有开发数据库可以按明确方式重置或升级；
- 不允许测试连接开发或生产数据库。

## 27.3 V3.2 Collection Schema

至少建立：

```text
collections
collection_members
```

`collections`：

- `creator_id` 非空外键；
- 删除 `visibility`；
- 删除 `contribution_policy`；
- 删除 `review_status`；
- 保留稳定 Slug、状态、时间和软删除能力。

`collection_members`：

- `collection_id`；
- `user_id`；
- `added_at`；
- `(collection_id, user_id)` 唯一；
- 外键按明确删除策略设计；
- creator 不重复写入。

Post 仍使用 `collection_id` 表示最多属于一个 Collection。

## 27.4 用户 Schema

- 删除 `can_publish` 业务字段及相关索引/后台依赖；
- 删除 `can_comment` 业务字段及相关索引/后台依赖；
- `username` 标准化后唯一且不可修改；
- `nickname` 为可修改展示字段；
- 邀请码不写入 users 表。

## 27.5 索引与约束

至少包含：

- `users(username)` 唯一；
- `posts(author_id, published_at)`；
- `posts(post_type, status, visibility, published_at)`；
- `posts(collection_id, published_at)`；
- `posts(category_id, published_at)`；
- `article_slugs.slug` 唯一；
- `post_tags(post_id, tag_id)` 唯一；
- `collections.slug` 唯一；
- `collections(creator_id, created_at)`；
- `collection_members(collection_id, user_id)` 唯一；
- `collection_members(user_id, collection_id)` 辅助反向查询；
- 互动表用户与目标唯一约束。

## 27.6 `public` 可见性迁移

独立 Post 继续只支持：

```text
login_only
private
```

移除历史 `public` 必须通过 migration 完成：

- 迁移前统计历史 `public` 数量；
- Upgrade 将历史 `public` Post 改为 `login_only`；
- 数据库检查约束收敛为 `login_only` 与 `private`；
- 服务端停止写入 `public`；
- Downgrade 不得把 `login_only` 批量重新公开；
- 迁移后数据库和服务端都拒绝再次写入 `public`。

Collection 已不具有 visibility，因此旧 Collection `public/login_only/private` 在迁移到 V3.2 时不保留其可见性语义；Collection 的最终访问完全由 creator + `collection_members` 决定。

## 27.7 首次生产前 Baseline

V3.2 功能和 Schema 稳定后、首次生产上线前，可以执行独立 migration squash 任务，生成干净的 V3 初始 Schema。

要求：

- 旧迁移历史仍可通过 Git Tag 查阅；
- squash 必须独立评审；
- 新空数据库可以完整创建；
- 模型与 Schema 对齐；
- 索引、外键和约束完整；
- 不把开发数据库或测试数据带入生产。

首次生产上线后禁止随意重写 migration 历史。

---

# 28. 技术约束

## 28.1 前端

继续使用：

- React；
- Vite；
- React Router；
- Axios；
- 现有主题体系；
- Motion；
- 现有响应式和 Reduced Motion 基础。

要求：

- 路由级 Lazy Loading；
- Article、Note、Collection、Profile 和 Admin 分包；
- 不把全部页面打进单个 Chunk；
- 不使用静态假数据冒充已接通业务；
- 迁移期 Mock 统一放在 `frontend/src/mocks/` 并标明用途；
- Collection 成员选择器支持搜索、逐个选择和一键全选当前成员；
- creator 不出现在可取消选择列表；
- username / nickname 注册说明必须明确可理解；
- Collection Post 编辑器必须明确提示权限跟随 Collection。

## 28.2 后端

继续使用：

- Flask App Factory；
- Blueprint；
- SQLAlchemy；
- Flask-Migrate；
- JWT；
- CORS；
- 统一错误响应；
- 环境变量；
- 请求日志；
- 限流。

最终模块：

```text
app/
├── auth/
├── users/
├── posts/
├── collections/
├── taxonomy/
├── uploads/
├── interactions/
├── comments/
├── notifications/
├── search/
├── admin/
└── common/
```

V3.2 P0/P1 不要求 `reports/` 业务模块。

后端应抽取统一权限函数/查询谓词：

- `can_read_independent_post`；
- `is_collection_member`；
- `can_read_collection_post`；
- `can_manage_post_as_author`；
- `can_manage_collection_as_creator`。

不得在多个 Blueprint 中各自复制不一致的 Collection 权限逻辑。

## 28.3 数据库

- 生产 MySQL；
- 测试使用独立 `TEST_DATABASE_URL`；
- 不允许测试误连开发或生产数据库；
- 数据库只保存媒体元数据和存储键；
- 所有时间按 UTC 存储并以 ISO 8601 输出。

---

# 29. 安全要求

必须保留或实现：

- 密码哈希；
- Access Token；
- Refresh Token；
- Token 轮换和撤销；
- 注册邀请码服务端校验；
- 注册接口限流；
- 邀请码从环境变量读取；
- 前端不包含邀请码校验值；
- username 唯一与规范化校验；
- 后端权限校验；
- Collection creator/member ACL；
- 被移除作者管理例外与普通阅读 ACL 隔离；
- Markdown Sanitization；
- XSS 防护；
- SQLAlchemy 参数化查询；
- 文件真实类型校验；
- 文件大小限制；
- 媒体所有权与 Collection 权限；
- API 限流；
- 评论和注册防刷；
- 管理接口隔离；
- 环境变量密钥；
- 安全响应头；
- 请求 ID；
- 操作日志；
- 外部 URL 校验；
- 分页参数上限；
- 私密内容防枚举；
- 游客内容 API 统一 401；
- 登录越权内容统一 404；
- 内容 HTML 无动态数据并 `noindex`；
- 内容 JSON、媒体和头像私密且禁止公共缓存；
- 会话失效和退出后清除内容内存缓存、Blob URL 与播放地址；
- Slug 并发唯一性；
- Post 加入/移动 Collection 由 author 发起；
- Collection 成员变更只由 creator 发起；
- 删除 Collection 时 Post 安全脱离为 private。

邀请制准入不替代后续鉴权。即使注册入口有邀请码，任何内容 API、媒体和 Collection 仍必须按登录身份和对象 ACL 做最终裁决。

邮箱验证和找回密码属于 P1，且必须保留以下安全边界：

- 注册成功与邮箱验证解耦，不能把验证状态改造成创作资格审批；
- 请求接口同时实施 IP 限流与账号级冷却；
- 验证、重置和密码变更邮件投递失败不得回滚已经完成的账号或密码事务；
- 密码重置必须在同一事务内消费令牌、更新密码并撤销全部会话；
- 应用日志、开发邮件适配器和邮件失败日志不得输出原始令牌、完整安全链接或完整收件邮箱；
- 安全页面使用 `no-referrer`，并主动清除误入 Query 的令牌；密码重置成功后通过无敏感信息的同源事件立即清理其他标签页会话；
- 未执行真实 SMTP、TLS 和域名投递验证时，不得把外部邮件能力记为已通过。

---

# 30. 性能要求

## 30.1 页面与媒体

- 首页分页或限量加载；
- Article 和 Collection 列表分页；
- Note 分页或增量加载；
- 图片列表使用缩略图；
- 原图和 Live Photo 按需加载；
- 首屏不加载不可见重媒体；
- 搜索和筛选必须有分页上限。

## 30.2 前端 Bundle

生产构建目标：

- 首次路由加载 JS 总 gzip 不高于 300 KB；
- 单个异步页面 Chunk gzip 不高于 150 KB；
- 游戏领域删除后不保留无用依赖；
- 构建不得出现未解释的超大 Chunk 警告。

如因编辑器或语法高亮依赖超出预算，必须按需加载并在任务汇报中说明。

## 30.3 查询

- 首页不得产生逐条 N+1 查询；
- Post 列表批量加载作者、Collection 和统计；
- 互动计数使用聚合或缓存策略；
- Slug 解析使用唯一索引；
- 搜索结果必须限制页大小。

---

# 31. 可访问性与响应式

必须：

- 键盘可操作；
- Focus 可见；
- 图片 Alt；
- 正确 Heading 层级；
- 表单 Label；
- 错误提示可感知；
- 按钮有语义；
- 支持 `prefers-reduced-motion`；
- 移动端正文可读；
- 代码块不溢出；
- 点击区域合理；
- Lightbox 可关闭并恢复焦点；
- 颜色对比度满足基本可读性。

---

# 32. 测试基线

## 32.1 前端任务

至少执行：

```text
npm run lint
npm run test:run
npm run build
```

业务测试覆盖：

- 游客；
- 邀请码错误注册；
- 邀请码正确注册；
- 普通成员；
- Collection creator；
- Collection member；
- Collection 非成员；
- 被移除的历史作者；
- 管理员；
- 加载、空状态和错误状态；
- 路由刷新；
- 登录前访问内容并在登录后返回完整原地址；
- Token 刷新失败后进入匿名态并跳转登录；
- 退出登录和浏览器后退不能从缓存恢复内容；
- 响应式与关键可访问性；
- 邮箱验证与密码恢复的无令牌、有效、过期、重放、网络失败和成功状态；
- 邮件令牌不会残留在 Path、Query、浏览历史当前地址或 Referrer 中；
- 密码重置后当前标签和其他会话都进入匿名态，受保护媒体 Blob 被释放。

## 32.2 后端任务

至少执行：

```text
pytest
flask db heads
flask db upgrade
```

必须使用专用 `TEST_DATABASE_URL`。

每项业务至少覆盖：

- 成功路径；
- 邮箱验证与密码恢复的摘要存储、过期、单次消费、轮换、反枚举、冷却和会话撤销；
- 参数错误；
- 未登录；
- 邀请码错误；
- username 冲突；
- 作者权限；
- Collection creator 权限；
- Collection member 权限；
- Collection 非成员 404；
- member 被移除后的权限变化；
- 被移除作者仍能管理自己历史 Post；
- 作者管理例外不能读取其他 Collection 数据；
- Post 加入、移动、移出 Collection；
- 删除 Collection 后 Post 变独立 private；
- 草稿发布前成员资格被移除；
- Article / Note 发布后禁止转换；
- 关键边界；
- 并发唯一性；
- 数据库约束。

## 32.3 URL 测试

必须验证：

- 有权成员访问 Article 当前 Slug API 返回 200；
- 历史 Slug 301 且无重定向链；
- 其他 Article 不能复用历史 Slug；
- 同一 Article 可以恢复自己的历史 Slug；
- 游客访问任意当前或历史内容 HTML 只得到 200 通用无数据 SPA Shell；
- 游客访问任意当前或历史内容 JSON API 返回 401；
- 有权成员通过历史 Slug API 得到 301 和当前 Canonical；
- 非 Collection member 解析 Collection Article 当前或历史 Slug 返回 404，不泄漏当前 Canonical；
- 普通成员访问已删除 Article 当前和历史 Slug 返回 404；
- 普通成员访问已删除 Note ID 返回 404；
- 从未存在返回 404；
- 无权访问返回 404；
- Canonical 始终指向当前地址。

## 32.4 Collection ACL 测试矩阵

至少验证：

- creator 能读能发；
- 当前 member 能读能发；
- 非 member 看不到 Collection 列表项；
- 非 member 详情 404；
- 非 member 不能从 Search / Archive / 用户主页 / Category / Tag / 首页发现 Collection Post；
- 非 member 媒体 404；
- 创建时“全选”只加入当时已有成员；
- 后注册用户不会自动加入旧 Collection；
- creator 可以增加/移除 member；
- creator 不能移除自己；
- member 被移除后立即不能新增 Post 和读取 Collection；
- member 的历史 Post 保留且作者不变；
- 被移除作者可通过个人管理入口编辑自己的历史 Post；
- 被移除作者无法通过管理例外读取 Collection 其他信息；
- creator 移出他人 Post 不删除 Post；
- author 可以主动移出自己的 Post；
- 移出后 Post 为独立 `private`；
- 删除 Collection 后全部 Post 独立且 `private`。

## 32.5 内容隐私测试矩阵

每一种内容入口至少覆盖：

- 游客请求 JSON API 返回 401 `AUTHENTICATION_REQUIRED`，且响应差异不能表明资源是否存在；
- 普通成员可读取其他用户独立 `login_only + published` 内容；
- 普通成员读取他人独立 `private`、草稿、隐藏或删除内容返回 404；
- Collection 内容只向 creator/member 提供；
- 作者在个人管理入口可读取自己的草稿、独立 private、归档和被移出成员后的历史 Collection Post；
- Admin 只在后台入口获得扩展读取；
- Search、建议词、用户统计、Facet、分页总数、评论和互动数量不包含无权对象；
- 已知媒体 UUID、缩略图和头像不能绕过权限；
- 通用内容 HTML、Meta、Open Graph、结构化数据、Sitemap、RSS 和缓存不包含成员内容；
- 数据库拒绝写入 `public`；
- 退出登录、Token 过期、刷新失败、浏览器后退和 BFCache 恢复后不能继续显示内容。

---

# 33. V3.2 核心验收标准

## 33.1 邀请制成员准入

- 注册页面包含 username、nickname、邮箱、密码和邀请码；
- 页面解释 username 与 nickname 的区别；
- username 唯一且注册后不可修改；
- nickname 可修改；
- 邀请码错误不能注册；
- 当前邀请码由后端配置并按产品约定为 `lyx0811`；
- 邀请码只控制注册，不参与登录与内容鉴权；
- 注册成功成员无需管理员再次授予发布或评论资格；
- 最终业务无 `can_publish` 和 `can_comment`；
- 注册成功后可验证邮箱，但未验证状态不阻断正常成员登录、创作和互动；
- 找回密码对账号存在性、验证状态和受限状态使用相同响应；
- 验证与重置令牌不会明文入库或进入服务端 URL 日志，过期、撤销和已消费令牌均不能重放；
- 重置密码后旧密码、旧 Access Token 和全部旧 Refresh Session 均失效。

## 33.2 多人记录

- 所有成员都可以创建 Article、Note 和草稿；
- 用户只能编辑自己的 Post；
- 所有成员都可以创建自己的 Collection；
- Collection 只有一个 creator；
- creator 可选择 0..N 个当前成员；
- 支持一键选择创建/编辑时的当前所有其他成员；
- 后注册用户不自动加入旧 Collection；
- creator/member 同时拥有阅读权和投稿权；
- 非 member 既不能看也不能发；
- Collection creator 不能编辑投稿者正文；
- 投稿始终保留真实作者。

## 33.3 Collection 生命周期

- creator 创建后可修改成员；
- member 被移除后不能继续读取和投稿；
- 被移除 member 的历史 Post 保留且作者不变；
- 被移除作者仍可从个人管理入口编辑自己的历史 Post；
- 作者管理例外不泄漏 Collection 其他内容；
- creator 与 Post author 都可移除 Post 关联；
- creator 不能删除别人的 Post；
- 独立 Post 可由 author 加入/移动到自己有权限的 Collection；
- Collection creator 不能擅自拉入他人 Post；
- 移出 Collection 后 Post 自动变为独立 `private`；
- 删除 Collection 不删除 Post，所有 Post 变为独立 `private`。

## 33.4 草稿与类型

- 草稿是 Post；
- 草稿可以不完整；
- 草稿阶段 Article / Note 可切换；
- 第一次正式发布后 `post_type` 锁定；
- 发布时执行完整校验；
- 草稿不进入成员共享表面；
- 草稿媒体正确绑定；
- 草稿发布前作者被移出 Collection 时，草稿保留但不得继续发布到原 Collection；
- 未发布草稿可安全删除；
- 最终无独立 Draft 业务表。

## 33.5 内容组织与时间

- Article 和 Note 共用 Post；
- Category 唯一且由管理员维护；
- Tag 使用关系表并可去重；
- Post 最多属于一个 Collection；
- Article Archive 使用 `published_at`；
- Note Archive 使用 `occurred_at ?? published_at`；
- Collection 默认时间线使用 Article 发布时间和 Note 生活时间；
- creator 手动排序后手动顺序优先。

## 33.6 URL、游客 HTML 与索引

- Article Slug 永久保留；
- 有权成员访问历史 Slug 301；
- Collection 非成员访问当前/历史 Collection Article Slug 均 404；
- 游客访问内容 HTML 只得到 200 通用无数据 SPA Shell，访问内容 JSON API 得到 401；
- 普通成员访问删除、隐藏或无权资源 404；
- 从未存在 404；
- Flask 对成员内容路径只输出无动态数据、`noindex`、`no-store` 的通用 SPA Shell；
- Sitemap 只包含无动态内容的首页与 About；
- RSS 返回 404；
- HTML、Open Graph、Sitemap、RSS、媒体和缓存均不泄漏成员内容。

## 33.7 媒体

- 图片和 Live Photo 可用；
- 媒体只能由所有者绑定；
- 独立 Post 媒体跟随 visibility；
- Collection Post 和封面媒体跟随 Collection creator/member ACL；
- 游客不能读取作品媒体、Collection 封面或用户头像；
- 非 member 不能读取 Collection 媒体；
- 内容媒体使用受保护代理或短期签名地址，响应禁止公共缓存；
- 删除关系不误删仍被引用对象；
- 旧游戏媒体清理不影响 V3 媒体。

## 33.8 互动、通知与管理

- 点赞不重复；
- 收藏可取消；
- 所有有权成员均可评论，无 `can_comment`；
- 删除有回复的父评论不级联删除他人回复；
- P0 不发送逐条点赞通知；
- Collection 加入/移除成员和新投稿通知正确；
- 发布资格、Collection 审核和举报通知不存在于 P0；
- 首页精选由 Admin 设置但不能扩大权限；
- 隐藏、恢复、删除等高风险管理操作有日志。

## 33.9 旧领域退役

- 运行时无 Game / Guide Blueprint；
- 前端无游戏页面、路由、API 和文案；
- Search、互动、通知、媒体和后台无游戏分支；
- 运行时业务命名统一为 Post / Collection；
- 旧测试数据已放弃；
- 根目录 V1 静态参考仍按协作规则保留。

---

# 34. 分阶段实施路线

| 阶段 | 独立任务 | 核心验收 |
|---|---|---|
| 0 | V3.2 PRD | 本文件成为唯一需求基线 |
| 1 | 邀请制注册与用户身份 | 邀请码、username、nickname、统一成员创作能力完成 |
| 2 | 删除旧权限主链 | 移除 `can_publish`、`can_comment`、发布资格后台和相关测试 |
| 3 | Post 与 Draft Schema | Article、Note、统一草稿、类型锁定和状态完成 |
| 4 | Article Slug 注册表 | 永久占用、301、匿名 401、越权与删除 404 完成 |
| 5 | Category 与 Tag | 正式表、关系、去重和权限过滤完成 |
| 6 | Collection Schema | creator + collection_members，删除审核/visibility/投稿策略 |
| 7 | Collection 成员管理 | 创建选择、全选、编辑成员、移除成员完成 |
| 8 | Collection Post 生命周期 | 加入、移动、移出、删除 Collection 安全脱离完成 |
| 9 | 创作垂直切片 | 草稿、媒体、发布、编辑和成员变化冲突处理完成 |
| 10 | 成员阅读 | Article、Note、Collection、Profile 统一 ACL 完成 |
| 11 | 首页、Archive、Search | 所有聚合和计数先应用权限；Note 生活时间完成 |
| 12 | 互动与通知 | 评论、点赞、收藏和精简通知完成 |
| 13 | 个人中心与后台 | 作者管理例外、Collection 管理和简化 Admin 完成 |
| 14 | 游客 HTML 与索引出口 | 通用无数据 Shell、noindex、精简 Sitemap、RSS 404 完成 |
| 15 | 游戏和旧 Life 退役 | 运行时代码、测试数据和旧表删除 |
| 16 | 性能与全量验证 | 分包、测试、迁移、响应式完成 |
| 17 | 首次生产 Baseline | 可选 migration squash 和生产上线 |

## 34.1 权限切换顺序

```text
加入邀请制注册并验证 username / nickname
→ 删除 can_publish / can_comment 前后端依赖
→ 建立 collection_members
→ 将旧 Collection 权限迁移为 creator + members
→ 停止读取/写入 Collection visibility、review_status、contribution_policy
→ 切换 Post / Search / Archive / Profile / Home 到统一 Collection ACL
→ 切换媒体与历史 Slug 权限
→ 清理举报、审核、发布资格通知与后台
→ 执行 public → login_only 的独立 Post 迁移
→ 清理旧缓存
→ 完成匿名泄漏扫描、双用户/多用户 ACL 矩阵和浏览器回归
```

由于项目尚未正式上线且旧业务数据均可丢弃，实施阶段优先保证最终 Schema 和权限语义干净，不为测试数据增加无意义兼容层。

生产切换后回滚必须遵循“宁可暂时不可见，也不能意外扩大阅读范围”。

---

# 35. 优先级

## P0

- 邀请码注册；
- username / nickname；
- 统一成员创作能力；
- 删除 `can_publish` / `can_comment`；
- Post；
- Article；
- Note；
- Post 草稿；
- 发布后类型锁定；
- Article Slug 注册表；
- Category；
- Tag；
- Collection creator；
- Collection 指定 members；
- 创建/编辑成员和一键全选当前成员；
- Collection 统一读写 ACL；
- Post 加入、移动、移出 Collection；
- member 被移除后的历史作者管理；
- 删除 Collection 后 Post 安全脱离；
- 编辑器；
- 媒体；
- 用户主页；
- 首页；
- 列表与详情；
- Archive；
- Search；
- 评论、点赞、收藏；
- 精简通知；
- 简化后台；
- 成员内容路由门禁；
- 通用无数据 HTML Shell、内容 `noindex`、精简 Sitemap、RSS 404；
- `public → login_only` 独立 Post 兼容迁移与安全回滚；
- 游戏和旧 Life 退役；
- 全量测试和生产部署。

## P1

- 草稿自动保存；
- 邮箱验证；
- 找回密码；
- Explore；
- 数学公式；
- 脚注；
- 往年今日；
- 阅读统计；
- Tag 合并工具；
- 更完整相关文章；
- 内容编辑 Revision。

当前实现进度：草稿自动保存、邮箱验证、找回密码、数学公式、脚注和 Tag 合并工具已完成；Explore、往年今日、阅读统计和内容编辑 Revision 仍待后续阶段。相关文章已具备 ACL 过滤后的基础实现，更完整的相关性策略仍属于 P1。

## P2

- 举报系统；
- Post 与 Collection 多对多；
- 多人实时协作编辑；
- 关注；
- 私信；
- 推荐算法；
- 原生 App；
- 站内视频上传；
- 多作者团队空间；
- Collection creator 转让；
- 只读 Collection 成员或更复杂 ACL。

P2 不能改变“邀请码准入、现实朋友共同记录、非开放流量社区”的 V3.2 核心边界，除非另行更新权威 PRD。

---

# 36. 最终产品原则

1. **Ying-Mo 是站长与受邀朋友共同使用的多人记录空间。**
2. **注册必须通过统一邀请码；当前产品约定邀请码为 `lyx0811`。**
3. **注册成功即成为正常成员，不再设置发布资格和评论资格。**
4. **所有成员都可以拥有自己的 Article、Note、草稿和 Collection。**
5. **Article 与 Note 统一使用 Post；草稿阶段可切换，第一次正式发布后类型锁定。**
6. **草稿也是 Post，不保留第二套 Draft 内容模型。**
7. **独立 Post 由作者在 `login_only / private` 中决定阅读范围。**
8. **Collection 不使用 visibility；creator + members 是唯一阅读与投稿 ACL。**
9. **Collection 中能发的人一定能看，不能发的人也一定看不到。**
10. **Collection creator 唯一，成员可以创建时选择并在之后编辑。**
11. **“全选所有成员”只选择当时已有成员，不自动包含未来注册用户。**
12. **共同投稿不改变 Post 的真实作者归属。**
13. **Collection 管理权不等于对他人 Post 的编辑权。**
14. **只有 Post 作者本人可以主动把自己的已有 Post 加入或移动到 Collection。**
15. **Collection creator 和 Post author 都可以移除关联，但移除不删除 Post。**
16. **Post 脱离 Collection 后默认变为独立 `private`，由作者决定是否重新共享。**
17. **成员被移出 Collection 后不能继续读取或投稿，但其历史 Post 保留、作者不变。**
18. **被移除成员仍可通过作者管理入口编辑自己的历史 Post，但不得借此读取 Collection 其他内容。**
19. **删除 Collection 不删除 Post，所有关联 Post 安全脱离并转为 `private`。**
20. **Article Archive 使用发布时间，Note Archive 使用 `occurred_at ?? published_at`。**
21. **Category、Tag、Collection 职责清晰；一个 Post 第一阶段最多属于一个 Collection。**
22. **username 是稳定 URL 身份且注册后不可修改；nickname 是可修改展示名。**
23. **Article Slug 永久占用，历史地址不形成重定向链。**
24. **匿名 401、有权历史 Slug 301、登录越权与删除 404 具有明确且可测试的语义。**
25. **首页、Search、Archive、用户主页、计数、Facet、通知和媒体都必须在服务端先应用对象权限。**
26. **管理员是站点维护者，不是朋友日常创作的审批者。**
27. **举报、Collection 审核、发布资格和评论资格不属于 V3.2 P0。**
28. **所有作品、Collection、用户主页、搜索、统计与受保护媒体必须先登录后读取。**
29. **旧测试数据全部放弃，不为未上线数据增加无意义迁移成本。**
30. **游戏域最终从生产运行时彻底消失。**
31. **Git Tag 保留旧代码历史，根目录 V1 静态参考按协作规则保留。**
32. **成员内容拥有稳定 URL，但不得被游客、搜索引擎、RSS 或公共缓存读取。**
33. **阅读和记录体验优先于流量、排名和功能数量。**
34. **少一些平台运营感，多一些人与生活。**
35. **少一些竞争，多一些共同记忆。**
36. **让文字、影像、时间和朋友成为 Ying-Mo 的中心。**
