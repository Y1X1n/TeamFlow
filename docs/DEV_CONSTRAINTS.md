# TeamFlow 开发约束与规范（v1.0）

> 本文是团队开发基线，**与代码评审同等效力**。契约优先级：`openapi.yaml` > 本文 > 实现惯例。规范来源：官方文档 + 社区共识（详见 [research/](./research/) 三份调研，共 60+ 来源链接）。
>
> 适用：所有人（含 AI 子代理）。提交代码前必须对照 §18 Definition of Done。

## 1. 语言与工具链（锁定主版本）

| 组件                           | 版本                                | 说明                                  |
| ------------------------------ | ----------------------------------- | ------------------------------------- |
| Node.js                        | 24.x（≥22 可用）                    | CI 与 Docker 使用 node:24-alpine      |
| 包管理器                       | pnpm 10.x                           | 只允许 pnpm；禁止 npm/yarn 生成锁文件 |
| TypeScript                     | 5.6.x                               | strict 全家桶，见 §3                  |
| Next.js                        | 14.2.x + React 18.3.x               | App Router                            |
| NestJS                         | 10.4.x                              | 模块化单体                            |
| Prisma                         | 6.x                                 | PostgreSQL 16                         |
| PostgreSQL / Redis / MinIO     | 16 / 7 / 最新稳定                   | Docker Compose                        |
| BullMQ                         | 5.x                                 | 队列                                  |
| Yjs / Hocuspocus / y-protocols | 13.6.33 / 3.4.4 / 1.0.7（精确锁定） | 实时层；禁止浮动升级                  |
| TipTap                         | 2.x                                 | 富文本                                |
| Tailwind / shadcn/ui           | 3.4.x / latest                      | UI                                    |
| @dnd-kit                       | core 6.x                            | 拖拽                                  |
| TanStack Query                 | 5.x                                 | 客户端数据                            |
| zod                            | 3.x                                 | 共享校验                              |
| ESLint / Prettier              | 8.57 / 3.x                          | 统一格式化                            |
| Vitest / Jest / Playwright     | 2.x / 29.x / 1.4x                   | 测试                                  |

不允许擅自升级主版本；升级单独 PR，附回归说明。官方文档默认展示最新大版本（NestJS ≥11、Prisma 8、BullMQ 6、Hocuspocus 4），查阅规范时必须锁定本文版本对应的文档路径（如 Prisma `/docs/orm/v6/`）。

## 2. Monorepo 与依赖边界

```
apps/api  ──► packages/shared
apps/web  ──► packages/shared
```

1. `packages/shared` 只包含：zod schema、权限目录、枚举常量、纯函数（分数索引/文本提取）；**不得**依赖 React、NestJS、Prisma、Node 专有 API。
2. apps 之间禁止互相 import；共享逻辑一律下沉 shared。
3. 依赖声明就近：`apps/web` 不安装后端依赖，反之亦然；根 package.json 只放工具链。
4. 禁止 barrel 文件（`index.ts` 全量 re-export），直接 import 具体模块（破坏 tree-shaking）。
5. 路径别名：web 用 `@/*` → `src/*`；api 用相对路径；shared 包名 `@teamflow/shared`。

## 3. TypeScript 规范

1. `strict: true`、`noUncheckedIndexedAccess: true`、`verbatimModuleSyntax: true`、`noImplicitOverride`、`noFallthroughCasesInSwitch`、`isolatedModules` 全部开启；`exactOptionalPropertyTypes` 暂不开启（与 RHF/zod 摩擦大）。例外：api 使用 Node16/CJS 输出，`verbatimModuleSyntax` 关闭（ESM-only 依赖用动态 import + `resolution-mode` 类型查询）。
2. 禁止 `any`（ESLint error）。边界数据先用 `unknown` + zod 收窄；确需逃生口用 `// eslint-disable-next-line` 并注明原因。
3. 公共 API（导出函数、service 方法、React 组件 props）必须有显式类型；内部实现允许推断。
4. 禁止 `as` 强制断言（`as const`、测试 mock 除外）；用类型守卫或 zod。
5. 类型导入必须 `import type`。
6. `@ts-ignore` 禁止；`@ts-expect-error` 必须附原因。
7. 枚举：API/DB 枚举用字符串字面量联合 + `as const` 对象；Prisma 生成的 enum 仅限 api 内部使用，出参转换为 shared 类型。

## 4. 命名与文件组织

| 对象        | 规则                         | 示例                                   |
| ----------- | ---------------------------- | -------------------------------------- |
| 文件        | kebab-case                   | `task-card.tsx`、`permission.guard.ts` |
| React 组件  | PascalCase 导出              | `export function TaskCard()`           |
| 变量/函数   | camelCase                    | `positionBetween`                      |
| 类型/接口   | PascalCase，**不加 I 前缀**  | `BoardColumn`                          |
| 常量        | SCREAMING_SNAKE              | `MAX_ATTACHMENT_SIZE`                  |
| 数据库表/列 | snake_case（`@map/@@map`）   | `project_members`                      |
| 环境变量    | SCREAMING_SNAKE，按前缀分组  | `S3_ENDPOINT`                          |
| HTTP 路由   | 小写复数名词，kebab 连接多词 | `/projects/{id}/members`               |
| 队列/频道   | `kebab.case`                 | `teamflow:board-events`                |

- 前端目录：`app/` 只放路由文件；业务放 `src/features/<domain>/`；通用组件 `components/`；shadcn 生成物 `components/ui/`（仅改 token/尺寸）。
- 后端目录：Nest 模块按领域，`*.module.ts / *.controller.ts / *.service.ts / dto/`；跨模块复用放 `common/`。
- 禁止 4 层以上相对路径；web 使用 `@/`。

## 5. Git 工作流

1. 主干开发（trunk-based）：`main` 始终可发布；功能分支 `feat/<scope>`、修复 `fix/<scope>`、杂务 `chore/<scope>`，生命周期 ≤3 天。
2. Conventional Commits：`feat|fix|refactor|test|docs|chore|perf|build|ci(scope): subject`，subject 英文、≤72 字符、祈使句。
3. 单 PR 聚焦一件事，≤400 行 diff（生成文件除外）；涉及契约变更必须同时更新 openapi.yaml、shared schema、测试。
4. 禁止提交：`.env*`（模板除外）、密钥、`node_modules`、构建产物、日志、临时脚本。
5. 合并前必须：CI 全绿 + 1 人 review + 无 TODO 残留（除带 issue 编号）。
6. 禁止 force-push main；禁止 `--no-verify` 绕过钩子。
7. 数据库迁移文件随 PR 提交，禁止手改已合并迁移。

## 6. 后端（NestJS）规范

### 6.1 分层

- Controller 只做：路由、参数解析、调用 service、返回 DTO；**不写业务**。
- Service 承载业务与事务；不得依赖 `Request`/HTTP 上下文；项目上下文（userId、projectId、permissions）由参数显式传入。
- 跨模块调用走导出 service，不直接查对方表（聚合查询允许 Prisma include，但写操作必须归属模块）。
- 全局管道/过滤器/拦截器在 `AppModule` 注册一次；禁止各 controller 重复实现错误格式。

### 6.2 DTO 与校验

- 请求体/查询参数使用 `packages/shared` 的 zod schema，通过自定义 `ZodValidationPipe` 校验；**单一事实源**，不在后端手写 class-validator DTO。
- zod 校验失败 → 400 `VALIDATION_ERROR`，`errors[]` 含字段路径。
- 响应体由 service 组装显式映射，禁止直接 `return prismaEntity`（避免泄漏 passwordHash 等字段）。
- 分页参数统一 `cursor`/`limit`，limit 默认与上限按契约。

### 6.3 Prisma

- 仅通过 `PrismaService` 访问数据库；事务使用 `$transaction` 包裹不变量（见 DATA_MODEL §6）。
- 查询必须 `select`/`include` 明确字段；列表接口禁止返回整行大字段（如 description）。
- 禁止在循环中查询（N+1）；批量用 `findMany({ where: { id: { in } } })`。
- 时间一律 UTC；数据库列 `timestamptz`；周报以 Asia/Shanghai 计算周边界后转 UTC 存储。
- 软删除任务的所有查询必须带 `deletedAt: null`；封装 `activeTaskWhere` 复用。
- 原生 SQL 仅在性能必要且有注释说明；必须参数化。
- 迁移：`prisma migrate dev --name <snake_case>`；生产 `migrate deploy`；禁止 `db push` 于共享环境。

### 6.4 认证与授权

- 全局 `JwtAuthGuard`（`@Public()` 白名单：register/login/refresh/health）。
- 项目级路由必须叠加 `PermissionGuard` + `@RequirePermission(action)`；权限键只能来自 shared 目录。
- 资源存在性校验先于权限错误；非成员统一 404，成员但缺权限 403。
- OWNER 不变量在 service 层强制（不能只靠前端）。
- 用户输入不得参与权限判断（角色只从 DB 读取）。

### 6.5 错误处理

- 统一 `ProblemDetailsFilter`（RFC 9457，取代 RFC 7807）：`{type,title,status,detail?,code,errors?,requestId}`；不暴露堆栈/SQL。
- 业务异常用 `DomainError(code, httpStatus, detail)`；禁止 controller 里 `throw new Error('...')` 直接面向用户。
- 错误码必须登记在 API_CONTRACT §6，新增需同步文档。

### 6.6 日志与配置

- 使用 `nestjs-pino`；结构化 JSON；每条请求含 `requestId`；敏感字段（authorization/cookie/password/token）redact。
- 禁止 `console.log`（lint 拦截），临时调试用 `logger.debug` 且合并前删除。
- 配置用 `@nestjs/config` + zod 校验，缺失即启动失败；`process.env` 只在 config 模块出现。
- 队列 jobId 必须幂等且只能含 `[A-Za-z0-9_-]`（BullMQ 禁止冒号/纯数字）：通知用 dedupeKey 的哈希短串，周报用 `report-{projectId}-{weekStart}`；真正的幂等由数据库唯一键兜底（at-least-once 语义）。

## 7. API 契约规范

1. `openapi.yaml` 是唯一契约；任何端点增删改先改契约，再改实现。
2. OpenAPI 使用 3.1；每个 operation 必须有唯一 `operationId`；错误响应引用统一 Problem schema。
3. REST 语义：GET 无副作用；PATCH 部分更新；DELETE 幂等；创建返回 201 + Location 可省略。
4. 状态码：400 参数格式、401 未认证、403 无权限、404 不存在/非成员、409 状态冲突、410 邀请失效、413/415 文件、422 语义校验、429 限流、503 依赖不可用。
5. 列表响应统一 `{items, nextCursor?}`（通知额外 `unreadCount`），禁止裸数组。
6. 时间输出 ISO 8601 UTC；禁止输出本地时区字符串。
7. 布尔命名 `isDone`/`archived`/`read`；计数 `xxxCount`；不用缩写（`desc` 仅用于 description 字段名沿用契约）。
8. 契约变更 PR 必须附「影响面」：后端 DTO、前端调用点、测试、迁移。
9. CI 运行 `pnpm openapi:lint`；新增 operation 未登记 operationId 视为失败。

## 8. 前端（Next.js 14）规范

1. 默认 Server Component；`'use client'` 只加在交互叶子（拖拽看板、编辑器、表单、Provider）。**禁止**加在根 layout 或整页。
2. 本项目鉴权基于内存 Access Token + HttpOnly Refresh Cookie，**认证后的数据统一用 TanStack Query 客户端获取**；RSC 只负责静态壳与 SEO 无关页面骨架（这是对社区"RSC 优先"的已知取舍，记录于 ARCHITECTURE ADR-010）。
3. 所有请求经 `lib/api-client.ts`：注入 Bearer、401 单次静默刷新、problem+json 解析为 `ApiError`；禁止组件内裸 `fetch`。
4. TanStack Query：
   - 只用 v5 对象签名；
   - queryKey 工厂：`boardKeys.detail(projectId)` 等，key 必须包含全部变量；
   - 失效用前缀，不全量 invalidate；
   - 乐观更新四步（cancel → snapshot → set → rollback），失败回滚并 toast；
   - staleTime：列表 30s、详情 60s、成员/权限 5min；看板断线时 10s 轮询。
5. 表单：zod schema（shared 或 feature 内）+ react-hook-form `mode:'onTouched'`；`defaultValues` 全字段；错误 `aria-invalid`/`aria-describedby`。
6. 样式：Tailwind 类名整串静态出现；条件类名用 `cn()`；变体用 `cva`；主题只使用 CSS 变量，禁止硬编码色值；不用 `@apply` 堆业务样式。
7. shadcn/ui：基础组件可改，但业务样式包装在 feature；弹层/模态必须用 Dialog/Sheet（Radix 焦点管理）。
8. 富文本：TipTap 编辑器 `dynamic(..., {ssr:false})`；渲染评论/描述用受控 schema 渲染器，**禁止 `dangerouslySetInnerHTML`**。
9. 拖拽：启用 `KeyboardSensor` + `sortableKeyboardCoordinates`；中文 `screenReaderInstructions`/`announcements`；拖拽后焦点回到原卡片；`onDragOver` 不发请求，`onDragEnd` 发一次。
10. 错误与空态：每个数据路由提供 loading 骨架、error 边界、空态文案；可预期业务错误（403/409）用 toast 而非整页错误。
11. 性能：大组件不整体 client 化；列表虚拟化仅在 >500 项时引入；图片 `next/image`；字体 `next/font`。
12. 文案：UI 简体中文；代码标识英文；日期展示用 `Intl.DateTimeFormat('zh-CN')`，存储保持 UTC。
13. 禁止浏览器原生 `alert/confirm/prompt`：确认操作统一使用页面内 `ConfirmDialog`（含取消/确认、危险态、加载态），结果反馈使用 `toast`；原生文件选择器除外。
14. 路由切换动效：受保护页面共用 AppShell 布局，分页切换只对内容使用 200–250ms 淡入/位移过渡；项目分页与顶部主导航使用共享滑动指示条（250ms）与 200ms 文字颜色过渡；弹窗/抽屉/下拉/选择器使用 100–240ms 透明度/缩放/位移；按钮按压与卡片悬浮只做轻微位移/阴影，必须兼容 `prefers-reduced-motion`（`motion-safe:` 限定），禁止整页长时间动画、无限装饰动画或阻塞交互。

## 9. 实时层规范（Yjs/Hocuspocus）

1. 版本整组精确锁定：`@hocuspocus/server@3.4.4`、`@hocuspocus/provider@3.4.4`、`yjs@13.6.33`、`y-protocols@1.0.7`；禁止单独升级任一包。
2. Hocuspocus 运行在**独立 HTTP/WS 服务（1235）**，不与 Nest HTTP 共享端口/upgrade；Nginx `/collab` → `api:1235`。
3. 服务端在 `onAuthenticate` 中把所有连接设为 `readOnly: true`；禁止客户端 `doc.transact` 写入；文档只由服务端 `openDirectConnection().transact()` 注入。
4. `onAuthenticate` 必须完成：documentName 格式 → JWT → 用户存在 → 项目存在 → 成员关系 → 返回 context；失败直接 throw，禁止先连后踢。
5. 文档是 DB 的只读投影：`onLoadDocument` 从 `board_columns` + `tasks` 构建；**不注册 `onStoreDocument`、不持久化 Yjs 二进制、不建快照表**。
6. Awareness 仅允许 `{ userId, draggingTaskId, selectedTaskId, updatedAt }`；presence 只作公开提示，不参与授权；昵称/头像/颜色由成员列表解析，不放 awareness；服务端钩子（`onAuthenticate` 除外）禁止抛错，避免进程退出。
7. 数据流单向：REST 事务 → PostgreSQL → Redis 事件 → Yjs 注入；禁止 Yjs/awareness 反写数据库，禁止 WS 层直接写库。
8. Token 过期在 `beforeHandleMessage` 校验（4410 关闭）；成员移除/角色变更经 Redis 事件复核连接（4403 关闭）；客户端卸载必须 `provider.destroy()/awareness.destroy()/doc.destroy()`。
9. 前端断线指数退避重连，重连后拉取 `/board` 校准；WS 断开期间 10s 轮询兜底；指标上报连接数、文档数、认证失败数、文档加载耗时、广播延迟。

## 10. 安全规范

1. 密码 scrypt：`N=2^15, r=8, p=3`（maxmem 64MiB，keylen=64），16 字节随机盐，格式 `scrypt$32768$8$3$salt$hash`；校验用 `timingSafeEqual`。
2. JWT：HS256，`JWT_SECRET` ≥32 字节随机；issuer/audience 固定；Access 15 分钟；payload 仅 `sub`、`typ`、`iat/exp`。
3. Refresh：32 字节随机，SHA-256 哈希入库；轮换 + 吊销；检测到已轮换 Token 被重放时吊销该用户全部 Refresh Token；Cookie HttpOnly/SameSite=Lax/Path=`/api/v1/auth`，生产 Secure。
4. 所有项目数据访问必须经权限校验；禁止"前端隐藏即安全"。
5. 上传：大小、扩展名、MIME、魔数四重校验；对象键随机；下载走 5 分钟签名 URL；文件名仅展示不用于路径。
6. 输入：全量 zod；富文本大小限制；字符串长度限制；Prisma 参数化；禁止字符串拼接 SQL。
7. 输出：React 自动转义；禁止 `innerHTML`；CSP 由 Nginx 配置。
8. 限流：登录/注册/全局按契约；429 带 `Retry-After`。
9. CORS 白名单；Helmet；生产禁用 Swagger UI 公网访问。
10. 日志与 Sentry 不记录密码、token、Cookie、附件内容；Sentry `sendDefaultPii=false`。
11. 依赖漏洞：`pnpm audit --prod` 高危必须修复或记录豁免原因。

## 11. 测试规范

| 层级        | 工具                   | 范围                                     | 门槛                |
| ----------- | ---------------------- | ---------------------------------------- | ------------------- |
| shared 单测 | Vitest                 | 分数索引、权限计算、文本提取、zod schema | 行覆盖 ≥90%         |
| API 单测    | Jest                   | service 业务规则、guard、filter          | 关键 service ≥70%   |
| API e2e     | Supertest + 测试数据库 | 认证、权限矩阵、任务移动、邀请、通知去重 | 全部 P0 用例通过    |
| Web 单测    | Vitest + RTL           | 纯函数、乐观更新回滚、同步组件           | 关键 hooks/组件覆盖 |
| E2E         | Playwright             | 登录→建项目→建任务→拖拽→评论→邀请        | 关键旅程全通过      |
| 压测        | k6                     | 看板读取、移动接口、WS 连接              | 满足 NFR 预算       |

1. 测试必须独立可重复：每个 e2e 使用独立种子数据，不依赖执行顺序。
2. 禁止只断言快照；断言用户可见行为（`getByRole` 优先）。
3. 新功能必须带测试；修 bug 必须先写复现测试。
4. 测试不得依赖真实外部服务（MinIO 用内存/假实现或专用桶；邮件不发送）。
5. CI 中 `pnpm test` 串行执行全部单测；e2e 可单独 job。

## 12. 性能预算（本地基线）

| 指标                    | 预算           | 测量                     |
| ----------------------- | -------------- | ------------------------ |
| 看板接口（500 任务）P95 | ≤300ms         | k6 / 请求日志            |
| 任务移动接口 P95        | ≤150ms         | k6                       |
| WS 广播端到端 P95       | ≤500ms         | 双浏览器 Playwright 打点 |
| 首屏 LCP（本地，桌面）  | ≤2.5s          | Lighthouse               |
| 看板首屏 JS（gzip）     | ≤350KB         | Next build 报告          |
| API 常驻内存            | ≤512MB（本地） | docker stats             |
| 逾期扫描 1 万任务       | ≤30s           | 单测/脚本                |

超预算的 PR 必须附测量数据与优化方案。

## 13. 可观测性

1. `/metrics` 暴露 `http_request_duration_seconds`（histogram，按 route/status）、`ws_connections`、`queue_jobs{queue,state}`、`board_broadcast_latency_ms`。
2. 每个请求生成 `requestId`（优先取 `X-Request-Id`，否则 UUID），写入日志与错误响应。
3. 业务关键事件（注册、项目创建、邀请接受、任务移动）用 info 级结构化日志。
4. Sentry：API 已集成（DSN 为空则跳过，`sendDefaultPii=false`，错误采样 100%、性能采样 10%）；Web 端预留 `NEXT_PUBLIC_SENTRY_DSN`，接入 Next instrumentation 为后续项。
5. 禁止用日志打印整个请求体/响应体。

## 14. 数据库与迁移

1. 所有 schema 变更走迁移文件；PR 内同时包含迁移与代码。
2. 迁移必须向前兼容一个版本（先加列/表，再改代码，最后清理），避免滚动发布失败。
3. 索引命名：`<table>_<columns>_idx`；唯一约束 `_key`。
4. 删除列/表前确认无代码引用，并单独 PR。
5. 种子数据仅开发环境；禁止在生产执行 `seed`。
6. 大表变更（活动/通知清理）用批量删除 + 限速，避免长事务锁表。

## 15. 环境变量与配置

`.env.example` 必须完整列出（新增变量同步更新）：

**API**

```
NODE_ENV=development
PORT=4000
REALTIME_PORT=1235
APP_URL=http://localhost:3000
API_PUBLIC_URL=http://localhost:4000
DATABASE_URL=postgresql://teamflow:teamflow@localhost:55432/teamflow?schema=public
REDIS_URL=redis://localhost:6380
JWT_SECRET=change-me-32-bytes-minimum
JWT_ACCESS_TTL_SECONDS=900
REFRESH_TTL_DAYS=7
COOKIE_SECURE=false
CORS_ORIGINS=http://localhost:3000
TZ=Asia/Shanghai
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=teamflow
S3_FORCE_PATH_STYLE=true
SENTRY_DSN=
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
AI_TIMEOUT_MS=20000
LOG_LEVEL=info
WORKER_ONLY=false
ENABLE_REALTIME=true
ENABLE_JOBS=true
```

> 本地宿主端口 55432/6380 用于规避 Windows 保留端口与本地 Redis 冲突；容器内固定 5432/6379。

**Web**

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:1235
NEXT_PUBLIC_SENTRY_DSN=
```

规则：`NEXT_PUBLIC_` 仅放公开常量；密钥绝不加该前缀；配置 zod 校验失败即退出。

## 16. Docker / CI

1. Dockerfile 多阶段构建、非 root 用户、`HEALTHCHECK`；镜像不包含 devDependencies。
2. `docker-compose.yml` 一键起 PG/Redis/MinIO/API/Web/Nginx/Prometheus/Grafana；数据卷持久化；健康检查依赖顺序。
3. GitHub Actions `ci.yml`：install → lint → typecheck → unit tests（PG/Redis service）→ build → OpenAPI lint；main 分支额外跑 Playwright。
4. 缓存 pnpm store；锁文件冻结安装（`--frozen-lockfile`）。
5. 迁移在部署前由 init 容器执行；健康检查通过后再切流量。

## 17. 代码质量门禁

- ESLint：`no-explicit-any`、`no-console`、`import/order`、`@typescript-eslint/no-floating-promises`、`no-restricted-imports`（禁止跨 app）、`no-restricted-syntax`（禁止根级 `use client` 误用需人工评审）。
- Prettier：单引号、尾逗号、100 列宽；`prettier --check` 进 CI。
- 禁止 `eslint-disable` 大面积关闭；单行禁用需注明原因。
- 复杂度：单函数 ≤80 行、圈复杂度 ≤15；超出拆分。
- TODO 格式：`// TODO(#issue): ...`。

## 18. Definition of Done（DoD）

- [ ] 功能符合 PRD 验收标准与 OpenAPI 契约
- [ ] 新增/修改端点已更新 openapi.yaml、API_CONTRACT（如涉及）
- [ ] shared zod schema 与类型同步，前后端编译通过
- [ ] 单测/接口测试覆盖新增逻辑；e2e 关键路径通过
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全绿
- [ ] 无 `any`、无 console、无密钥、无 TODO 残留
- [ ] 权限用例：至少覆盖"有权限成功 + 无权限 403"两条
- [ ] 性能预算未回退（涉及看板/移动/实时）
- [ ] UI 变更：键盘可操作、空态/错误态/加载态完整，附截图
- [ ] 日志/指标无敏感信息
- [ ] 文档同步（README/迁移说明/环境变量）

## 19. 明确禁止（红线）

1. 客户端写 Yjs 文档或伪造 awareness 身份。
2. 用 Next.js Server Actions 写业务数据。
3. 前端隐藏代替服务端鉴权。
4. `SELECT *` 式暴露整行（含 passwordHash/token）。
5. 手拼 Tailwind 动态类名、`dangerouslySetInnerHTML` 渲染富文本。
6. 在生产使用 `prisma db push` 或运行 seed。
7. 提交密钥、`.env`、token、数据库转储。
8. 在循环内查询数据库（N+1）。
9. 使用 `any` 或全局 `eslint-disable`。
10. 直接修改已合并的迁移文件。
11. 关闭 TLS 校验、CORS 通配 `*` 携带凭证、CSP 全放行（生产）。
12. 跳过 Git hooks（`--no-verify`）或绕过 CI 合并。

## 20. 评审清单（Reviewer 快速对照）

1. 契约：路由/状态码/错误码/字段与 openapi 一致？
2. 权限：每个新端点是否有 guard + 资源归属校验？非成员是否 404？
3. 事务：多表写入是否在同一事务？失败是否回滚？
4. 输入：长度/枚举/大小限制？富文本/标签边界？
5. 输出：是否泄漏敏感字段？时间是否 UTC？
6. 前端：`'use client'` 范围是否最小？queryKey 是否含全部变量？乐观回滚是否完整？
7. 实时：是否只经 REST→DB→Redis→Yjs 单向流？
8. 测试：有权限/无权限、空/错误/边界用例？
9. 性能：列表是否 select 必要字段？是否新增 N+1？
10. 可观测：错误是否可定位（requestId/日志）？

## 21. 参考调研

- [typescript-nextjs.md](./research/typescript-nextjs.md)：tsconfig、RSC 边界、TanStack Query、Tailwind/shadcn、测试分工、可访问性（60 来源）。
- [nestjs-prisma-bullmq.md](./research/nestjs-prisma-bullmq.md)：Nest 模块化、zod 校验取舍、Prisma 事务/命名、BullMQ 幂等、安全、可观测。
- [yjs-hocuspocus.md](./research/yjs-hocuspocus.md)：Hocuspocus 认证/持久化/扩展、awareness 安全、看板排序模式。

## 22. v1.1 功能约束

### AI

1. 只能在服务端调用模型；`AI_API_KEY` 不得出现在前端、日志、错误响应或契约示例。
2. 未配置或调用失败必须**透明回退**本地规则，并在响应 `source=local`、`notice` 说明；UI 不允许把规则结果标成 AI。
3. 调用前 UI 必须显示模型名与“可能产生费用/数据将发送至模型服务”的提示；用户确认后才调用。
4. AI 只生成子任务建议，不自动写库；写入仍需走 `task:update` 权限与子任务接口。
5. 端点限流 10 次/分钟；标题/描述仅取必要文本（≤2000 字）；禁止发送附件/评论全文。
6. AI 失败不得影响主流程；记录 warn 日志但不记录 prompt 正文。

### 实时通知（SSE）

1. 使用 fetch 流 + `Authorization` 头，禁止把 access token 放 URL 查询参数。
2. 通知先按用户偏好过滤再入库；SSE 只推送成功入库的通知。
3. 客户端断线指数退避（1s→30s），401 先刷新 Token；卸载必须 abort。
4. 单实例内存推送；多实例需 Redis pub/sub，MVP 文档明确限制。
5. 不使用浏览器 Notification API，只用页面内 Toast/Dialog。

### 搜索与协作

1. 搜索只覆盖当前用户参与的项目，`q` ≤50 字；前端 250ms 防抖。
2. 评论回复仅单层；`parentId` 存根评论 ID；表情只允许 `REACTION_EMOJIS` 白名单。
3. 关注为任意成员可用的轻量订阅；任务创建者/负责人/评论者自动关注；通知去重键必须稳定。
4. 所有删除/危险操作仍使用页面内 `ConfirmDialog`，禁止原生弹窗；新增文件预览不得使用裸 `<img>`（用 Next Image unoptimized 或受控 object URL）。

## 23. v1.3 周报与邮件约束

1. 本周实时汇总必须由当前数据库状态即时计算，不得依赖前端硬编码或未落库的临时状态；自动摘要只能引用汇总事实，不得编造数字/任务。
2. 邮件发送默认关闭；必须使用用户指定并在本机完成 OAuth 授权的邮箱，禁止使用未指定账号做测试发送。
3. 发送必须经过“生成预览 → 页面内确认”两步；服务端要求 `confirm=true`，不提供自动群发/定时群发入口。
4. Agent Mail 调用使用 `execFile/spawn` 参数数组，禁止 `shell:true` 拼接命令；主题禁止换行，收件人必须校验邮箱，正文通过临时文件传入。
5. 不记录邮件正文、完整收件人列表、OAuth Token 或 AI prompt；活动审计仅记录主题、收件人数与发件人。
6. 邮件不可用或发送失败时，UI 不得显示“已发送”；预览可继续使用但发送按钮必须禁用。
7. AI 邮件生成失败必须透明回退本地模板，禁止把本地模板标记为 AI；任务标题只作为数据，忽略其中任何指令。

## 24. v1.4 账号资料约束

1. 头像只允许 PNG/JPEG/WebP data URL（≤100000 字符）或 http(s) 外链；禁止 SVG/HTML/data:text，避免脚本注入。
2. 客户端上传前必须居中裁剪到 256×256 并压缩；原图限制 5MB，处理失败给出页面内提示。
3. 修改昵称/头像后必须更新 AuthProvider 并标记相关查询失效，让右上角、成员列表与任务卡片一致。
4. 修改密码必须校验当前密码；成功后删除该用户全部 Refresh Token，客户端立即退出登录。
5. 新密码不得与当前密码相同；密码字段不得进入日志或错误响应。

> 规范冲突处理：官方文档 > 本文件 > 社区文章；发现冲突在 PR 中提出并更新本文，不允许"按我的习惯来"。
