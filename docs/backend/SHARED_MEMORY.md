# 共同回忆开发约束

## 入口与模型

共同回忆将成员自己的补充 Note 关联到同一 Collection 内的原 Article 或 Note；作者、媒体与内容权限仍归各自 Post。再次从补充发起时归一到最初 root，关系只允许单层，不得自关联或跨合集。

- 服务：`backend/app/posts/memory_contributions.py`；模型：`backend/app/models/memory.py`。
- 迁移：`20260908_0013_shared_memory.py`；开关：`MEMORY_CONTRIBUTIONS_ENABLED`，默认关闭。
- UI：`SharedMemorySection.jsx`、`MemoryContributionComposer.jsx`、`WritePage.jsx`；客户端逻辑：`lib/memoryContributions.js`。
- 创建草稿：`POST /api/v1/posts/:id/memory-contributions`，携带 `client_request_id` UUID。
- 读取：`GET /api/v1/posts/:id/memory-thread`；解除：`POST /api/v1/posts/:id/memory-link/detach`。
- 保存、媒体与发布沿用 Post 接口及 `edit_version` 乐观并发控制。

`post_memory_links` 保存补充 Post、root、Collection、作者、请求 UUID、创建时间、失效和解除状态。补充 Post 唯一；`author_id + client_request_id` 唯一，实现重试幂等。同 UUID 指向不同 root 必须冲突。

## 权限与生命周期

- 原记录须已发布或归档、未隐藏删除，发起者须拥有当前合集读写权限。
- 列表、计数、作者聚合、来源信息与通知均要求当前用户可读关系两端及合集。普通 `Post.to_dict()` 不直接暴露关系。
- 补充只能由其作者修改、发布或解除；root 作者不会获得改写补充的权限。
- 草稿不进入回忆列表、人数或通知；同人多次补充合法，条数与去重人数分开计算。
- 原记录移出或删除使相关关系永久失效，补充移出只使自身关系失效；不删除其他人的 Post 或媒体。
- 隐藏、恢复和成员撤销动态影响可见性，不能让已永久失效或解除的关系复活。Revision 不恢复关联。
- 有效关联草稿固定为 Note 和原合集，普通 PATCH、自动保存与完整编辑入口不能绕过范围校验。
- 编辑期间失权或原关系失效时，保留本人草稿；继续作为普通记录发布前由作者显式解除。失权后的来源正文、图片及标识不可泄露。
- 原记录的正文、图注、时间或标签编辑不修改他人的补充。

## 事务与通知

创建、首次发布、成员撤销、Post 移动/删除、合集删除与 Revision 恢复遵循共同的行锁协议：Collection ID 升序 → Post ID 升序 → 关系行。跨合集移动锁两边，取锁后重新读取成员资格、状态和归属。

关系失效或解除同步推进补充 Post 版本；增加别人的补充不推进 root 的编辑版本。唯一请求约束防重复建稿，首次发布的行锁防重复通知。

原作者仍有权限且不是补充者时接收 `memory_contribution_added`；其他成员沿用合集投稿通知，去重收件人。遵守 all / important / muted 偏好；草稿、重试和重复发布不重复通知。通知读取重新校验权限并生成摘要。

## 编辑与保存

- 快速补充支持文字、图片或图文；空内容不发布。上传与删除均遵守媒体所有权，删除正文节点不删除媒体文件。
- Note 的明确发生时间与地点可带入并修改，Article 不用发布时间冒充发生时间。
- 本地恢复键按用户与 root 隔离，记录草稿 ID 和请求 UUID；源记录正文、摘要、头像和图片不写入离线缓存。
- 恢复前检查当前账号、草稿所有权与原记录权限。完整编辑接续同一草稿，不能另建副本。
- 响应丢失后按 Post 状态收敛，版本冲突保留文本，发布失败保留本人草稿与媒体。

## 导出与发布

成员导出只包含本人的补充，以及本人当前可读的有效关联，不扩大到他人正文或媒体。完整备份保留关系与失效状态；旧 Schema 备份在匹配版本的隔离环境恢复后再升级。

开启功能前，在目标 MySQL 环境验证迁移、发布与成员撤销/原记录移动的竞态、同 UUID 并发创建及备份恢复。SQLite 验证不能证明 MySQL 行锁行为。回退时先关闭创建开关，保留既有 Post 与媒体。
