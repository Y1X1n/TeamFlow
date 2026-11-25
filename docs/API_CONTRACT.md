# TeamFlow API 契约说明（v1.0）

> 机器可读契约：[openapi.yaml](./openapi.yaml)（OpenAPI 3.1）。本文件是契约的人读摘要与鉴权映射；两者冲突时以 openapi.yaml 为准，并立即修复本文。实时通道见 [REALTIME_PROTOCOL.md](./REALTIME_PROTOCOL.md)。

## 1. 通用约定

| 项             | 约定                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Base URL       | `/api/v1`（本地直连 `http://localhost:4000/api/v1`，经 Nginx 走 `http://localhost/api/v1`）               |
| 内容类型       | 请求/响应 `application/json`；错误 `application/problem+json`；上传 `multipart/form-data`                 |
| 认证           | `Authorization: Bearer <accessToken>`；刷新令牌仅通过 HttpOnly Cookie `tf_refresh`（Path=`/api/v1/auth`） |
| Token 生命周期 | Access 15 分钟；Refresh 7 天，单次使用并轮换；登出吊销当前 Refresh                                        |
| 时间           | ISO 8601 UTC，例如 `2026-11-22T10:00:00.000Z`                                                             |
| ID             | cuid 字符串，不透明，禁止解析                                                                             |
| 分页           | 不透明游标：请求 `cursor`，响应 `nextCursor`（null 表示结束）；游标编码禁止依赖前端                       |
| 字段命名       | JSON camelCase；数据库 snake_case                                                                         |
| PATCH          | 缺省字段=不修改；可空字段显式 `null`=清空；空对象 `{}` 视为 400                                           |
| 幂等           | 通知已读、邀请接受、周报生成为幂等；其他写操作非幂等                                                      |
| 请求追踪       | 响应头 `X-Request-Id`；错误体含同值 `requestId`                                                           |
| 版本           | 破坏性变更升 `/api/v2`；MVP 内仅做向前兼容的字段新增                                                      |

## 2. 认证与会话

1. `POST /auth/register`、`POST /auth/login` 返回 `accessToken` 并 `Set-Cookie: tf_refresh=...; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=604800`（生产加 `Secure`）。
2. `POST /auth/refresh` 读取 Cookie，校验成功则吊销旧令牌、签发新 Refresh Cookie 与新 Access Token。并发刷新时仅一次成功，其余返回 401。
3. `POST /auth/logout` 吊销当前 Refresh Token 并 `Set-Cookie` 过期值；幂等返回 204。
4. 前端收到 401 `TOKEN_EXPIRED` 时先静默刷新一次再重放原请求；刷新失败跳转登录。
5. 密码：8–72 字符，至少含字母与数字；scrypt 加盐哈希。登录失败统一 `INVALID_CREDENTIALS`。
6. CORS：开发允许 `http://localhost:3000`；生产白名单域名；`credentials=true`；允许头 `Authorization, Content-Type`；暴露头 `X-Request-Id`。
7. 限流：登录 10 次/15 分钟/IP；注册 5 次/小时/IP；全局 300 次/分钟/用户（`429 RATE_LIMITED`，响应头 `Retry-After`）。

## 3. 端点与权限映射

> 「成员」= 任意项目成员（含 VIEWER）；非成员访问项目资源返回 404（不泄露存在性）。写操作额外要求项目未归档，否则 `409 PROJECT_ARCHIVED`。

### Auth / Users / Permissions

| 方法  | 路径                   | 所需权限       | 说明                |
| ----- | ---------------------- | -------------- | ------------------- |
| POST  | `/auth/register`       | 公开           | 注册并登录          |
| POST  | `/auth/login`          | 公开           | 登录                |
| POST  | `/auth/refresh`        | Refresh Cookie | 轮换令牌            |
| POST  | `/auth/logout`         | 登录           | 登出                |
| GET   | `/users/me`            | 登录           | 当前用户            |
| PATCH | `/users/me`            | 登录           | 改昵称/头像         |
| GET   | `/users/me/tasks`      | 登录           | 跨项目我的任务      |
| GET   | `/permissions/catalog` | 登录           | 权限目录 + 角色预设 |

### Projects

| 方法   | 路径                                   | 所需权限                                         | 说明                                |
| ------ | -------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| GET    | `/projects`                            | 登录                                             | 我参与的项目（含统计）              |
| POST   | `/projects`                            | 登录                                             | 创建项目（自动 3 列，创建者 OWNER） |
| GET    | `/projects/{projectId}`                | 成员                                             | 项目详情                            |
| PATCH  | `/projects/{projectId}`                | `project:update`（归档切换需 `project:archive`） | 更新/归档                           |
| DELETE | `/projects/{projectId}`                | `project:delete`（仅 OWNER）                     | 硬删除                              |
| GET    | `/projects/{projectId}/board`          | 成员                                             | 看板聚合（列/任务/成员/我的权限）   |
| GET    | `/projects/{projectId}/permissions/me` | 成员                                             | 有效权限与覆盖                      |

### Members / Invites

| 方法   | 路径                                       | 所需权限           | 说明                         |
| ------ | ------------------------------------------ | ------------------ | ---------------------------- |
| GET    | `/projects/{projectId}/members`            | 成员               | 成员列表                     |
| PATCH  | `/projects/{projectId}/members/{userId}`   | `member:manage`    | 改角色/覆盖；OWNER 不可变    |
| DELETE | `/projects/{projectId}/members/{userId}`   | `member:manage`    | 移除成员                     |
| GET    | `/projects/{projectId}/invites`            | `member:invite`    | 待处理邀请                   |
| POST   | `/projects/{projectId}/invites`            | `member:invite`    | 生成邀请（返回明文链接一次） |
| DELETE | `/projects/{projectId}/invites/{inviteId}` | `member:invite`    | 撤销邀请                     |
| GET    | `/invites/{token}`                         | 登录               | 邀请预览                     |
| POST   | `/invites/{token}/accept`                  | 登录（邮箱须匹配） | 接受邀请                     |

**邀请规则**

- 同项目同邮箱仅一条有效邀请；新邀请自动撤销旧邀请。
- 有效期 7 天；`INVITE_EXPIRED` / `INVITE_REVOKED` 返回 410；`INVITE_USED` / `ALREADY_MEMBER` 返回 409。
- 接受时登录用户邮箱必须与邀请邮箱一致（大小写不敏感），否则 `403 INVITE_EMAIL_MISMATCH`。
- ADMIN 仅可邀请 MEMBER/VIEWER；OWNER 可邀请 ADMIN。

### Columns

| 方法   | 路径                               | 所需权限       | 说明                                     |
| ------ | ---------------------------------- | -------------- | ---------------------------------------- |
| POST   | `/projects/{projectId}/columns`    | `board:manage` | 新建列（追加最右）                       |
| PATCH  | `/columns/{columnId}`              | `board:manage` | 改名/完成态                              |
| PATCH  | `/columns/{columnId}/move`         | `board:manage` | 调整列顺序                               |
| DELETE | `/columns/{columnId}?moveTasksTo=` | `board:manage` | 删除列；非空必须迁移任务；最后一列不可删 |

### Tasks

| 方法   | 路径                          | 所需权限                                  | 说明                        |
| ------ | ----------------------------- | ----------------------------------------- | --------------------------- |
| POST   | `/projects/{projectId}/tasks` | `task:create`                             | 创建任务（缺省第一列/末尾） |
| GET    | `/tasks/{taskId}`             | 成员                                      | 任务详情                    |
| PATCH  | `/tasks/{taskId}`             | `task:update`；改负责人另需 `task:assign` | 更新字段                    |
| PATCH  | `/tasks/{taskId}/move`        | `task:move`                               | 移动列/排序                 |
| DELETE | `/tasks/{taskId}`             | `task:delete`                             | 软删除                      |

**移动语义**

- 请求 `{ columnId, beforeTaskId? }`；`beforeTaskId=null` 表示目标列末尾。
- `beforeTaskId` 必须属于目标列，否则 `422 TASK_NOT_IN_COLUMN`；跨项目/不存在 → 404。
- 服务端计算分数索引并事务更新；移入 `isDone=true` 列设置 `completedAt`；移出清空并记 `TASK_REOPENED`。
- 成功后广播 WebSocket 事件（见实时协议），响应体为更新后的 TaskCard。

### Comments

| 方法   | 路径                       | 所需权限                   | 说明                     |
| ------ | -------------------------- | -------------------------- | ------------------------ |
| GET    | `/tasks/{taskId}/comments` | 成员                       | 正序游标分页；软删除占位 |
| POST   | `/tasks/{taskId}/comments` | `comment:create`           | 发布评论、解析 @         |
| PATCH  | `/comments/{commentId}`    | 作者                       | 编辑                     |
| DELETE | `/comments/{commentId}`    | 作者 或 `comment:moderate` | 软删除                   |

- 富文本为 ProseMirror JSON；服务端提取纯文本并限制 5000 字符；`mention` 节点 `attrs.id` 仅对项目成员生效。
- 通知：被 @ 者收 `MENTION`；任务负责人（非评论者）收 `TASK_COMMENTED`；均不通知评论者本人。

### Attachments

| 方法   | 路径                                   | 所需权限                      | 说明                  |
| ------ | -------------------------------------- | ----------------------------- | --------------------- |
| GET    | `/tasks/{taskId}/attachments`          | 成员                          | 列表                  |
| POST   | `/tasks/{taskId}/attachments`          | `attachment:upload`           | multipart 上传        |
| DELETE | `/attachments/{attachmentId}`          | 上传者 或 `attachment:delete` | 删除记录 + 异步清对象 |
| GET    | `/attachments/{attachmentId}/download` | 成员                          | 302 → 5 分钟签名 URL  |

- 限制：≤10MB；≤20 个/任务；MIME 白名单：`image/png|jpeg|gif|webp`、`application/pdf`、`text/plain`、`text/markdown`、docx/xlsx/pptx。
- 同时校验扩展名与魔数；不一致 → `415 UNSUPPORTED_FILE_TYPE`；超限 → `413 FILE_TOO_LARGE`；数量超限 → `422 ATTACHMENT_LIMIT_REACHED`。
- 下载为 302：生产指向 S3/MinIO 签名 URL；开发环境（`STORAGE_DRIVER=local`）指向 API 内部 HMAC 签名文件端点，契约与时效（5 分钟）不变。

### Activities / Reports / Notifications

| 方法 | 路径                                     | 所需权限                  | 说明                     |
| ---- | ---------------------------------------- | ------------------------- | ------------------------ |
| GET  | `/projects/{projectId}/activities`       | 成员                      | 倒序游标分页             |
| GET  | `/projects/{projectId}/reports`          | `report:view`             | 周报列表（周倒序）       |
| POST | `/projects/{projectId}/reports/generate` | `report:generate`         | 手动生成（upsert 幂等）  |
| GET  | `/reports/{reportId}`                    | `report:view`（所属项目） | 周报详情                 |
| GET  | `/notifications`                         | 登录（仅本人）            | 倒序游标；含 unreadCount |
| GET  | `/notifications/unread-count`            | 登录                      | 未读数                   |
| POST | `/notifications/{notificationId}/read`   | 本人                      | 单条已读（幂等）         |
| POST | `/notifications/read-all`                | 登录                      | 全部已读，返回更新条数   |

### Ops

| 方法 | 路径       | 认证    | 说明                                                   |
| ---- | ---------- | ------- | ------------------------------------------------------ |
| GET  | `/health`  | 无      | `{status, db, redis, uptime, version}`                 |
| GET  | `/metrics` | 内网/无 | Prometheus 文本格式（不在 OpenAPI 中，Nginx 限制内网） |

## 4. 数据与业务规则摘要

### 4.1 项目

- 名称 1–60、描述 ≤500、颜色 `#RRGGBB`。
- 创建事务：项目 + OWNER 成员 + 3 默认列（待办/进行中/已完成）+ `PROJECT_CREATED` 活动。
- 归档项目对一切写操作返回 `409 PROJECT_ARCHIVED`（含评论/附件/成员）。
- 删除项目仅 OWNER；物理删除级联，附件对象异步清理（24h 内）。

### 4.2 任务

- 标题 1–200；描述 ≤100KB；标签 ≤5 个、单个 1–20；截止时间可为过去。
- `assigneeId` 必须为项目成员 → 否则 `422 ASSIGNEE_NOT_MEMBER`；`null` 表示取消指派。
- 看板单项目最多返回 1000 个未删除任务（超出按列位置截断并在响应头 `X-Board-Truncated: true` 标记）。
- 任务软删除后从所有列表/统计排除；详情返回 404。

### 4.3 周报

- `weekStart` 必须为周一（Asia/Shanghai）；缺省为上一周周一。
- 自动任务：每周一 08:00 生成；同项目同周 upsert；归档项目跳过。
- 手动生成同样走 upsert，并记录 `REPORT_GENERATED` 活动。

### 4.4 通知

- 类型见 OpenAPI `NotificationType`；`payload` 含跳转信息（projectId/taskId 等）。
- 定时通知以 `dedupeKey` 去重（`overdue:{taskId}:{userId}:{yyyy-mm-dd}`、`due-soon:{taskId}:{userId}:{yyyy-mm-dd}`），24h 一条。
- 通知保留 90 天，活动 180 天（定时清理）。

## 5. 示例

### 5.1 注册

```http
POST /api/v1/auth/register
Content-Type: application/json

{ "email": "alice@example.com", "password": "Passw0rd!", "name": "Alice" }
```

```json
{
  "user": {
    "id": "clx...",
    "email": "alice@example.com",
    "name": "Alice",
    "avatarUrl": null,
    "createdAt": "2026-11-22T10:00:00.000Z"
  },
  "accessToken": "eyJhbGciOi...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

### 5.2 移动任务

```http
PATCH /api/v1/tasks/clt_123/move
Authorization: Bearer <token>
Content-Type: application/json

{ "columnId": "col_done", "beforeTaskId": null }
```

```json
{
  "id": "clt_123",
  "projectId": "clp_1",
  "columnId": "col_done",
  "title": "完成登录页",
  "priority": "HIGH",
  "assignee": { "userId": "clu_2", "name": "Bob", "avatarUrl": null, "role": "MEMBER" },
  "dueDate": "2026-11-25T12:00:00.000Z",
  "labels": ["前端"],
  "position": "z1",
  "completedAt": "2026-11-22T10:05:00.000Z",
  "commentCount": 3,
  "attachmentCount": 1,
  "createdAt": "2026-11-20T08:00:00.000Z",
  "updatedAt": "2026-11-22T10:05:00.000Z"
}
```

### 5.3 错误响应

```http
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json
X-Request-Id: req_01H...

{
  "type": "https://teamflow.dev/errors/forbidden",
  "title": "Permission denied",
  "status": 403,
  "detail": "缺少权限 task:move",
  "code": "FORBIDDEN",
  "requestId": "req_01H..."
}
```

## 6. 错误码表

| HTTP | code                                | 含义                                    |
| ---- | ----------------------------------- | --------------------------------------- |
| 400  | `VALIDATION_ERROR`                  | zod 校验失败，`errors[]` 给出字段路径   |
| 401  | `UNAUTHORIZED`                      | 未提供/无效凭证                         |
| 401  | `TOKEN_EXPIRED`                     | Access Token 过期（可刷新）             |
| 401  | `INVALID_CREDENTIALS`               | 登录邮箱或密码错误                      |
| 401  | `REFRESH_TOKEN_INVALID`             | Refresh 无效/已轮换/已吊销              |
| 403  | `FORBIDDEN`                         | 缺少权限                                |
| 403  | `INVITE_EMAIL_MISMATCH`             | 接受邀请邮箱不一致                      |
| 404  | `NOT_FOUND`                         | 资源不存在或无权访问（非成员统一 404）  |
| 409  | `EMAIL_TAKEN`                       | 邮箱已注册                              |
| 409  | `ALREADY_MEMBER`                    | 已是项目成员                            |
| 409  | `PROJECT_ARCHIVED`                  | 项目已归档，禁止写操作                  |
| 409  | `OWNER_IMMUTABLE`                   | 尝试修改/移除 OWNER                     |
| 409  | `ADMIN_CANNOT_MANAGE_ADMIN`         | ADMIN 越级管理                          |
| 409  | `COLUMN_NOT_EMPTY`                  | 删除非空列未提供迁移目标                |
| 409  | `LAST_COLUMN`                       | 不允许删除最后一列                      |
| 409  | `INVITE_USED`                       | 邀请已使用或已加入                      |
| 409  | `TASK_BLOCKED`                      | 任务仍有未完成依赖，禁止标记完成        |
| 409  | `DEPENDENCY_CYCLE`                  | 依赖关系会形成循环                      |
| 410  | `INVITE_EXPIRED` / `INVITE_REVOKED` | 邀请失效                                |
| 413  | `FILE_TOO_LARGE`                    | 文件 >10MB                              |
| 415  | `UNSUPPORTED_FILE_TYPE`             | MIME/魔数不在白名单                     |
| 422  | `ASSIGNEE_NOT_MEMBER`               | 负责人非项目成员                        |
| 422  | `TASK_NOT_IN_COLUMN`                | 移动参考任务不在目标列                  |
| 422  | `DEPENDENCY_SELF`                   | 任务依赖自身                            |
| 422  | `DEPENDENCY_CROSS_PROJECT`          | 跨项目依赖                              |
| 422  | `EMAIL_REJECTED`                    | 邮件被服务端永久拒绝（黑名单/不存在等） |
| 422  | `INVALID_CURRENT_PASSWORD`          | 修改密码时当前密码不正确                |
| 429  | `EMAIL_RATE_LIMITED`                | Agent Mail 触发限频                     |
| 502  | `EMAIL_SEND_FAILED`                 | Agent Mail 服务或网络错误               |
| 503  | `EMAIL_NOT_CONFIGURED`              | 未启用 Agent Mail 或找不到 CLI 入口     |
| 503  | `EMAIL_AUTH_REQUIRED`               | Agent Mail 授权失效                     |
| 504  | `EMAIL_TIMEOUT`                     | Agent Mail 调用超时                     |
| 422  | `ATTACHMENT_LIMIT_REACHED`          | 单任务附件达到 20 个                    |
| 422  | `INVALID_PERMISSION_KEY`            | 覆盖包含未知权限键                      |
| 429  | `RATE_LIMITED`                      | 触发限流                                |
| 500  | `INTERNAL_ERROR`                    | 未预期异常（隐藏细节）                  |
| 503  | `STORAGE_UNAVAILABLE`               | MinIO/S3 不可用                         |
| 503  | `QUEUE_UNAVAILABLE`                 | Redis/队列不可用（写操作回滚）          |

## 7. 契约变更流程

1. 修改 `openapi.yaml` + 本文件 + 相关测试用例（同一次提交）。
2. 运行 `pnpm openapi:lint`（Redocly）与 `pnpm test` 契约示例校验。
3. 前端 `packages/shared` 的 zod schema 同步更新，TypeScript 编译通过。
4. 在 PR 描述附「契约影响面」清单（后端 DTO / 前端调用 / 测试）。

## 8. v1.1 新增端点

### 搜索与模板

| 方法 | 路径                | 权限 | 说明                                                                            |
| ---- | ------------------- | ---- | ------------------------------------------------------------------------------- |
| GET  | `/search?q=&limit=` | 登录 | 在本人参与的项目内搜索项目/任务/成员，q 1–50 字                                 |
| POST | `/projects`         | 登录 | 新增 `template` 字段：`BLANK/COURSE/CLUB/COMPETITION`，后端按模板建列与初始任务 |

### 任务深度

| 方法   | 路径                         | 权限              | 说明                                       |
| ------ | ---------------------------- | ----------------- | ------------------------------------------ |
| GET    | `/tasks/{taskId}/subtasks`   | 成员              | `{items, progress:{total,done}}`           |
| POST   | `/tasks/{taskId}/subtasks`   | `task:update`     | 新增子任务（≤50 个/任务）                  |
| PATCH  | `/subtasks/{subtaskId}`      | `task:update`     | 标题/完成态                                |
| DELETE | `/subtasks/{subtaskId}`      | `task:update`     | 删除                                       |
| POST   | `/tasks/{taskId}/watch`      | 成员（含 VIEWER） | 关注任务                                   |
| DELETE | `/tasks/{taskId}/watch`      | 成员              | 取消关注，均返回 `{watching,watcherCount}` |
| GET    | `/tasks/{taskId}/activities` | 成员              | 任务活动历史，倒序游标分页                 |

TaskCard 新增 `subtaskTotal/subtaskDone`；TaskDetail 新增 `subtasks/watching/watcherCount`。任务创建者与负责人自动关注；评论者自动关注；关注者会收到 `TASK_UPDATED`（同一任务/成员/分钟去重）与评论通知。

### 评论回复与表情

| 方法   | 路径                                     | 权限             | 说明                                              |
| ------ | ---------------------------------------- | ---------------- | ------------------------------------------------- |
| POST   | `/tasks/{taskId}/comments`               | `comment:create` | body 新增可选 `parentId`（单层回复，存根评论 ID） |
| PUT    | `/comments/{commentId}/reactions`        | 成员             | body `{emoji}`，幂等添加                          |
| DELETE | `/comments/{commentId}/reactions?emoji=` | 成员             | 移除自己的回应                                    |

- emoji 白名单：`👍 ❤️ 😄 🎉 👀`。
- Comment 返回 `parentId`、`replyTo{commentId,userId,name}`、`reactions[{emoji,count,reactedByMe,userNames}]`、`replyCount`。
- 通知优先级：`MENTION` > `COMMENT_REPLY`（回复评论作者）> `TASK_COMMENTED`；表情回应通知作者 `COMMENT_REACTION`（同评论/用户/emoji 去重）。

### 通知偏好与实时流

| 方法 | 路径                         | 权限                     | 说明                                              |
| ---- | ---------------------------- | ------------------------ | ------------------------------------------------- |
| GET  | `/notifications/preferences` | 登录                     | 13 种类型开关，缺省 true                          |
| PUT  | `/notifications/preferences` | 登录                     | body `{preferences:{TYPE:boolean}}`，返回完整偏好 |
| GET  | `/notifications/stream`      | 登录（Authorization 头） | SSE：`notification` 事件 + 15s `heartbeat`        |

- SSE 使用 `fetch` 流读取，不使用 EventSource（无法设置 Authorization）。
- 单实例内存推送；服务重启需客户端重连。通知写入后按用户偏好过滤，再入库并推送。
- 通知类型扩容：新增 `TASK_UPDATED`、`COMMENT_REPLY`、`COMMENT_REACTION`。

### AI

| 方法 | 路径                           | 权限          | 说明                                           |
| ---- | ------------------------------ | ------------- | ---------------------------------------------- |
| GET  | `/ai/status`                   | 登录          | `{enabled,provider,model,fallback,costNotice}` |
| POST | `/tasks/{taskId}/ai-breakdown` | `task:update` | 生成 3–6 条子任务建议，限流 10 次/分钟         |

- 服务端读取任务标题/描述，调用配置的 OpenAI 兼容接口；未配置或调用失败时**透明回退本地规则**，`source=local` 并在 `notice` 说明。
- 不自动写库；客户端确认后通过子任务接口创建。
- AI Key 仅存服务端环境变量，前端只显示模型名与费用提示。

### v1.1 版本记录

| 版本  | 日期       | 变更                                                                          |
| ----- | ---------- | ----------------------------------------------------------------------------- |
| 1.0.0 | 2026-11-22 | MVP 基线（49 操作）                                                           |
| 1.1.0 | 2026-11-22 | 搜索、模板、子任务、关注/活动、回复/表情、通知偏好/SSE、AI 拆解（共 64 操作） |

## 9. v1.2 新增端点

### 任务依赖

| 方法   | 路径                                             | 权限          | 说明                                                    |
| ------ | ------------------------------------------------ | ------------- | ------------------------------------------------------- |
| POST   | `/tasks/{taskId}/dependencies`                   | `task:update` | body `{blockedByTaskId}`；同项目、禁止自依赖/循环；幂等 |
| DELETE | `/tasks/{taskId}/dependencies/{blockedByTaskId}` | `task:update` | 移除依赖，返回最新摘要 + `removed`                      |

- 依赖语义：`taskId` 必须等待 `blockedByTaskId` 完成后才能完成。
- `TaskCard` 新增 `blockedByCount`（未完成阻塞数）、`blockingCount`（未完成下游数）。
- `TaskDetail` 新增 `blockedBy[]`、`blocking[]`，元素为 `{taskId,title,columnId,columnName,completed}`。
- 移入完成列时，若存在未完成依赖且未携带 `force:true`，返回 `409 TASK_BLOCKED`。
- 将整列标记为完成列、或删除列并把任务迁入完成列时，同样校验未完成依赖并返回 `409 TASK_BLOCKED`。
- 添加依赖写活动 `TASK_DEPENDENCY_ADDED/REMOVED`，并发布 `task.updated` 让其他客户端刷新。

### 任务复制

| 方法 | 路径                        | 权限          | 说明                                                                 |
| ---- | --------------------------- | ------------- | -------------------------------------------------------------------- |
| POST | `/tasks/{taskId}/duplicate` | `task:create` | 复制描述/优先级/标签/截止时间/子任务；标题追加「（副本）」；返回详情 |

- 子任务副本默认全部未完成；负责人仅在操作者具备 `task:assign` 时复制，否则副本未指派。
- 源任务位于完成列时，副本放入第一个未完成列；写入 `TASK_CREATED` 活动并广播。

### 前端配套（非契约）

- 任务卡片显示阻塞计数，抽屉可管理依赖；拖拽/快捷移动到完成列时使用页面内确认框，确认后带 `force`。
- 看板新增截止时间筛选（已逾期/今天/7 天内/无截止时间）。
- 附件支持多选、拖放与粘贴上传（单文件 10MB，单任务 20 个）。

### v1.2 版本记录

| 版本  | 日期       | 变更                                                               |
| ----- | ---------- | ------------------------------------------------------------------ |
| 1.2.0 | 2026-11-22 | 任务依赖与阻塞校验、任务复制、看板截止筛选、附件拖放（共 67 操作） |

## 10. v1.3 新增端点

### 本周实时汇总

| 方法 | 路径                                    | 权限          | 说明                                                        |
| ---- | --------------------------------------- | ------------- | ----------------------------------------------------------- |
| GET  | `/projects/{projectId}/reports/current` | `report:view` | 实时计算当前周指标、自动摘要、完成/进行中/风险/即将到期列表 |

- 不写库、不需先生成周报；前端每 60 秒刷新。
- `summary` 为基于当前进度生成的确定性文本；任务列表最多各 10 条。
- 历史周报快照生成时也会写入 `summary` 与四类任务列表。

### 智能周报邮件（腾讯 Agent Mail）

| 方法 | 路径                                                  | 权限              | 说明                                                  |
| ---- | ----------------------------------------------------- | ----------------- | ----------------------------------------------------- |
| GET  | `/projects/{projectId}/reports/current/email/status`  | `report:generate` | 返回 `enabled/available/provider/sender/reason`       |
| POST | `/projects/{projectId}/reports/current/email/preview` | `report:generate` | 生成邮件主题/正文预览，不发送；AI 失败回退本地模板    |
| POST | `/projects/{projectId}/reports/current/email/send`    | `report:generate` | 用户确认后发送；`confirm` 必须为 `true`，记录活动审计 |

- 发送通过本机已授权的 `agently-cli`；服务端不保存邮箱密码/OAuth Token。
- 预览请求：`{recipients[], tone?, note?}`；发送请求：`{recipients[], subject, body, confirm:true}`。
- `recipients` 1–20 个合法邮箱，去重；允许项目外邮箱，但必须由用户显式选择。
- Agent Mail 未配置/未授权时，预览仍返回内容且 `emailAvailable=false`，发送返回 503。
- 每次成功发送写 `REPORT_EMAIL_SENT` 活动（主题、收件人数、发件人），不记录正文。
- 发送限流 5 次/分钟，预览限流 10 次/分钟。

### v1.3 版本记录

| 版本  | 日期       | 变更                                                              |
| ----- | ---------- | ----------------------------------------------------------------- |
| 1.3.0 | 2026-11-23 | 本周实时汇总、历史快照任务分组、Agent Mail 智能邮件（共 71 操作） |

## 11. v1.4 账号资料与安全

| 方法  | 路径                 | 权限 | 说明                                                            |
| ----- | -------------------- | ---- | --------------------------------------------------------------- |
| PATCH | `/users/me`          | 登录 | `name` 1–40 字；`avatarUrl` 支持 http(s) 或图片 data URL / null |
| POST  | `/users/me/password` | 登录 | `{currentPassword,newPassword}`，成功后吊销全部 Refresh Token   |

- 头像 data URL 仅允许 `image/png`、`image/jpeg`、`image/webp`，最长 100000 字符；前端自动居中裁剪为 256×256 并压缩。
- 密码至少 8 位、包含字母和数字，且不能与当前密码相同；错误码 `422 INVALID_CURRENT_PASSWORD`。
- 修改密码成功后当前 Access Token 仍可短期使用，但所有 Refresh Token 已被删除，客户端应立即退出并重新登录。
- 未引入新的数据库字段或迁移；头像 data URL 直接存储在既有 `users.avatar_url`。

### v1.4 版本记录

| 版本  | 日期       | 变更                                                       |
| ----- | ---------- | ---------------------------------------------------------- |
| 1.4.0 | 2026-11-23 | 账号设置页、头像裁剪上传、昵称修改、修改密码（共 72 操作） |
