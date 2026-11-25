# TeamFlow 技术规范调研：NestJS 10 + Prisma 6 + BullMQ 5

- 调研日期：2026-11-22；范围：模块化单体 REST API、OpenAPI 3.1 契约优先、JWT 认证。
- 版本锚定：**NestJS 10**（官方站点默认展示最新主版本 ≥11，10 的差异需对照 v10 文档）、**Prisma 6**（v6 文档位于 `/docs/orm/v6/...`，默认站点已是 Prisma 8）、**BullMQ 5**（仓库已发布 v6，v5 行为见 `/changelogs/changelog-v5`）。
- 来源分级：〔官方〕= 框架/标准文档；〔社区〕= Stack Overflow、dev.to、GitHub 项目；已剔除内容农场。

## 1. NestJS 10 模块组织与 DI

- **1.1 按领域建 feature module**（users / tasks / files / comments），每个模块内聚 `controller + service + dto`，只 `imports` 真正依赖的模块。理由：模块默认封装 provider，`exports` 即模块的公开 API，边界清晰便于以后拆服务。来源：https://docs.nestjs.com/modules
- **1.2 Controller 薄**：只做路由、参数解析（DTO/Pipe）、调用 service、返回；**禁止** controller 注入 PrismaService 或写业务分支。理由：可测试、可复用，官方明确 controller 不应承载业务。来源：https://docs.nestjs.com/modules
- **1.3 Service 厚，跨模块复用必须走 exports**；不要把同一个 service 在多个模块 `providers` 里重复注册。理由：重复注册会产生**多个实例**，内存翻倍且内部状态不一致（官方原文警告）。来源：https://docs.nestjs.com/modules
- **1.4 全局横切用 token provider 注册**（`APP_PIPE` / `APP_FILTER` / `APP_INTERCEPTOR` / `APP_GUARD`），而不是 `app.useGlobalPipes()`。理由：只有走 DI 才能注入 ConfigService/Logger 等依赖，且便于 e2e 覆写。来源：https://docs.nestjs.com/exception-filters
- **1.5 配置用 ConfigModule + zod**：`ConfigModule.forRoot({ isGlobal: true, cache: true, validate: (raw) => envSchema.parse(raw) })`，业务代码只注入 `ConfigService`，禁止散落 `process.env`。理由：启动即失败（fail-fast）、类型单一出口。来源：https://docs.nestjs.com/techniques/configuration
- **1.6 DI 作用域默认 singleton**；只有真正需要"每请求实例"（多租户上下文）才用 `Scope.REQUEST`，因为 request-scoped 会沿注入链向上传染，影响性能。来源：https://docs.nestjs.com/fundamentals/injection-scopes
- **1.7 生命周期**：`onModuleInit` 做连接/预热，`onApplicationShutdown` 释放 Prisma/Redis/Worker，`main.ts` 调 `app.enableShutdownHooks()`。理由：容器 SIGTERM 时保证优雅退出。来源：https://docs.nestjs.com/fundamentals/lifecycle-events

## 2. 校验方案：class-validator vs zod

- **2.1 契约优先项目选 zod 作为唯一事实源**，用 `nestjs-zod` 的 `createZodDto()` 生成 DTO，Pipe 中 `schema.parse`。理由：同一份 schema 可直接给前端/OpenAPI 复用，避免 DTO 与契约双写漂移。来源：https://www.npmjs.com/package/nestjs-zod （仓库已迁至 BenLorantfy/nestjs-zod，latest 5.6.0）
- **2.2 class-validator 的优势**：Nest 官方默认、`@nestjs/swagger` 装饰器集成最成熟、社区资料最多；劣势是 schema 与类耦合，无法直接输出给前端，且需要 `class-transformer` 配合 `transform`。取舍：团队若已有大量装饰器 DTO，迁移收益不高。来源：https://docs.nestjs.com/techniques/validation
- **2.3 共享 zod 的坑（必须在契约里约定）**：① 前后端 `zod` 大版本必须一致（v3/v4 API 不兼容）；② `Date`/`Decimal` 经 JSON 后是 string，共享 schema 要用 `z.coerce.date()` 或明确 string；③ 文件上传（multipart）不适合 zod 侧校验；④ Swagger 需要 `zod-to-json-schema`/`z.toJSONSchema()` 生成元数据；⑤ 错误文案 i18n 需自行注入。来源：https://stackoverflow.com/questions/79710782
- **2.4 全局 ValidationPipe 仍要开 `whitelist: true`、`forbidNonWhitelisted: true`、`transform: true`**，用 `APP_PIPE` 注册。理由：白名单剥离未知字段，防止 mass-assignment；transform 让 query string 正确转型。来源：https://docs.nestjs.com/techniques/validation
- **2.5 嵌套对象必须显式声明**（class-validator 用 `@ValidateNested({ each: true })` + `@Type()`），这是社区最高频踩坑点（SO 83 赞）。来源：https://stackoverflow.com/questions/53786383
- **社区共识/分歧**：共识是"校验必须在边界层、只做一次、错误结构化"；分歧在实现——Nest 生态主流仍是 class-validator，新项目（尤其契约优先 + 前端复用）明显倾向 zod。禁止两套并存于同一 DTO。

## 3. Prisma 6

- **3.1 命名双轨**：Prisma model 用 PascalCase 单数、字段 camelCase；数据库用 snake_case，通过 `@@map("task_comments")` 与 `@map("created_at")` 解耦。官方原文：@map/@@map 用于"decoupling model and field names from table and column names"。来源：https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/models
- **3.2 migrate 流程**：本地/CI 分支用 `prisma migrate dev`（依赖 shadow database，可能提示 reset）；**生产/测试环境只用 `prisma migrate deploy`**——它不改 schema、不 reset、不生成 client、无 shadow DB。官方建议 deploy 放在自动化 CI/CD，不要本地对生产执行。来源：https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production
- **3.3 需要手改 SQL 时** 用 `migrate dev --create-only` 生成后编辑再 apply；已应用的迁移文件不可再改（deploy 会告警 modified migration）。来源：同上
- **3.4 事务选型**：互不依赖的写操作 → `$transaction([...])` 顺序批量（一次往返）；依赖前一步结果（读-改-写）→ 交互式 `$transaction(async (tx) => ...)`。交互式默认 `maxWait=2s`、`timeout=5s`，官方定位是"escape hatch"，必须短小、不得内含 HTTP 调用。来源：https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions
- **3.5 避免 N+1**：列表接口一律显式 `select`（禁止整行返回）并按需 `include` 关系；**禁止在 `map()` 内发起查询**。官方给出的反例正是 resolver 对每个 user 再查一次 posts。来源：https://www.prisma.io/docs/orm/v6/prisma-client/queries/query-optimization-performance
- **3.6 时间统一 UTC**：列用 `@db.Timestamptz(3)`，应用层只处理 UTC，展示时区交给前端；`timestamptz` 在 PostgreSQL 内部按 UTC 存储、按会话时区输出。理由：跨时区协作 + 夏令时。来源：https://www.postgresql.org/docs/16/datatype-datetime.html
- **3.7 主键**：默认 `cuid()`（由 Prisma 在应用侧生成、无需数据库序列、URL 安全、不泄露记录数量）；`uuid()` v4 随机分布对 B-tree 局部性差，高写入表可用 UUIDv7。取舍：cuid 不可排序、体积略大；若需时间有序选 UUIDv7。来源：https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/models ，https://www.rfc-editor.org/rfc/rfc9562.html
- **3.8 软删除取舍**：用 `deletedAt DateTime?` + Prisma Client Extension 统一注入 `where: { deletedAt: null }`；代价是唯一约束要改成部分唯一索引（`WHERE deleted_at IS NULL`），且所有原生 SQL 需自行过滤。团队协作场景建议软删除（可恢复、可审计），并配定期归档任务。来源：https://stackoverflow.com/questions/73189707 ，https://www.prisma.io/docs/orm/v6/prisma-client/client-extensions/query
- **3.9 PrismaService**：`extends PrismaClient`，`onModuleInit` 里 `$connect()`，全局模块导出；不要在请求内 new 客户端。来源：https://docs.nestjs.com/recipes/prisma

## 4. BullMQ 5

- **4.1 组织方式**：一个业务域一个 queue（如 `notifications`、`reports`），每域一个 module：`BullModule.registerQueue({ name })` + `@Processor('name') class X extends WorkerHost`；producer（service 注入 `@InjectQueue`）与 worker 可分进程部署。来源：https://docs.bullmq.io/guide/nestjs
- **4.2 Job 幂等与去重**：把业务幂等键写进 `jobId`，同 id 的 job 会被**静默忽略**（不报错）。三条硬约束：不能含 `:`、不能是纯数字、被 `removeOnComplete` 删除后同 id 可再次入队。来源：https://docs.bullmq.io/guide/jobs/job-ids
- **4.3 更精细的重复控制**用 `deduplication: { id, ttl }`（时间窗）或 `{ id, keepLastIfActive: true }`（同一时刻最多 1 个 active + 1 个待跑，取最新数据）。**但投递语义仍是 at-least-once**，worker 内必须再用 DB 唯一键/状态机兜底幂等。来源：https://docs.bullmq.io/guide/jobs/deduplication
- **4.4 重试与退避**：`attempts + backoff: { type: 'exponential', delay: 1000, jitter: 0.5 }`，建议写在 `defaultJobOptions` 统一生效；processor 抛出的**必须是 Error 实例**，否则 BullMQ 行为异常。来源：https://docs.bullmq.io/guide/retrying-failing-jobs
- **4.5 定时任务**：BullMQ 5.16+ 用 **Job Schedulers**（`queue.upsertJobScheduler(id, { pattern: cron, tz })`）替代旧的 `repeat` 选项，天然幂等（重复调用只更新，不会叠加）。来源：https://docs.bullmq.io/guide/job-schedulers
- **4.6 优雅关闭**：在 `onApplicationShutdown` 里先 `await worker.close()`（TypeScript 版会等待活跃 job 结束、**无内置超时**，需自行加 deadline 兜底），再关 Queue 与 Redis 连接；BullMQ 2.0+ 不再需要 QueueScheduler。来源：https://docs.bullmq.io/guide/workers/graceful-shutdown
- **4.7 可视化与指标**：开发/内网用 Bull Board（`@bull-board/nestjs`，必须加认证）；指标用 `queue.getMetrics('completed'|'failed', { start, end })` 或官方 Prometheus 导出。来源：https://docs.bullmq.io/guide/metrics ，https://github.com/felixmosh/bull-board
- **4.8 保留策略**：显式设置 `removeOnComplete: { count: 1000 }`、`removeOnFailed: { age: 7 * 86400 }`，否则 Redis 无限增长（也影响 jobId 去重语义）。来源：https://docs.bullmq.io/guide/queues/auto-removal-of-jobs

## 5. 认证与安全

- **5.1 双 token**：access token 短期（10–15 分钟）无状态 JWT；refresh token 长期（7–30 天）落库并**轮换**。RFC 9700：public client 的 refresh token "MUST be sender-constrained or use refresh token rotation"。来源：https://www.rfc-editor.org/rfc/rfc9700.html
- **5.2 refresh token 只存哈希**：DB 存 `tokenHash`（SHA-256 足够，因为 token 本身是高熵随机串，不需要慢哈希）、`familyId`、`expiresAt`、`revokedAt`、`replacedBy`；检测到已用 token 再次出现 → 判定重放，整族撤销。理由：库泄露不可直接冒用。来源：https://www.rfc-editor.org/rfc/rfc9700.html
- **5.3 密码哈希**：**Argon2id**（19 MiB 内存、迭代 2 次、并行度 1）为首选；scrypt（N=2^17, r=8, p=1）为次选；bcrypt 仅用于遗留系统（72 字节上限、work factor ≥10）。社区已从"默认 bcrypt"转向"默认 Argon2id"。来源：https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html ，https://stackoverflow.com/questions/64220922
- **5.4 限流**：`@nestjs/throttler` 全局 `ThrottlerGuard`，登录/刷新/发信单独收紧；**多实例必须换 Redis storage**，内存存储只在单进程有效。来源：https://docs.nestjs.com/security/rate-limiting
- **5.5 Helmet + CORS**：Helmet 默认开启（纯 JSON API 可关闭 CSP）；CORS 用显式白名单，`credentials: true` 时**不能**用 `origin: '*'`。来源：https://docs.nestjs.com/security/helmet ，https://docs.nestjs.com/security/cors
- **5.6 密钥管理**：secret 全部走 ConfigModule 且启动校验长度；单体起步 HS256 足够（社区常见做法），需要多服务共验签/独立轮换时再上 RS256/EdDSA。来源：https://docs.nestjs.com/security/authentication

## 6. 错误响应

- **6.1 采用 RFC 9457（Problem Details，已废弃 RFC 7807）**：`application/problem+json`，字段 `type`/`title`/`status`/`detail`/`instance`，可扩展 `code`、`errors[]`、`traceId`。理由：机器可读、跨语言通用、不必自造格式。来源：https://www.rfc-editor.org/rfc/rfc9457.html
- **6.2 统一 ExceptionFilter**（`APP_FILTER`）做三件事：`HttpException` → 映射 status/title；ValidationPipe 的 BadRequest → `errors[]`（字段路径 + 消息）；Prisma 已知错误（P2002 唯一冲突→409、P2025 未找到→404）与未知错误 → 500。来源：https://docs.nestjs.com/exception-filters
- **6.3 业务错误码独立于 HTTP 状态**：`AUTH_INVALID_CREDENTIALS`、`TASK_NOT_FOUND` 等稳定字符串（或 `域_数字`），随 `code` 返回并在 OpenAPI 中枚举；同一 HTTP 状态可对应多个业务码。理由：前端分支判断不依赖文案。
- **6.4 不泄露内部信息**：5xx 只返回通用 detail + `traceId`，堆栈只进日志；校验错误不回显敏感字段值。来源：https://www.rfc-editor.org/rfc/rfc9457.html

## 7. 测试

- **7.1 单测（Jest）**：service 单测 mock 掉 PrismaService（`jest-mock-extended` 的 `mockDeep<PrismaClient>()`），只断言业务分支；不为 controller 写"转发测试"式空测。来源：https://docs.nestjs.com/fundamentals/testing
- **7.2 e2e（Supertest）**：`Test.createTestingModule({ imports: [AppModule] })` + `request(app.getHttpServer())`，跑真实 Postgres（docker compose service），启动前执行 `prisma migrate deploy`。来源：https://docs.nestjs.com/fundamentals/testing
- **7.3 隔离策略**：每个测试文件独立 database schema（`?schema=test_<uuid>`，migrate deploy 后 drop）或 template database；用单 worker 串行避免并行污染；每例前 `TRUNCATE ... RESTART IDENTITY CASCADE`。来源：https://www.prisma.io/docs/orm/v6/prisma-client/testing
- **7.4 不要用 SQLite 替代 Postgres**：`timestamptz`、部分索引、`citext`、约束行为差异会让 e2e 失去意义。来源：https://www.prisma.io/docs/orm/v6/prisma-client/testing

## 8. 可观测性

- **8.1 日志用 nestjs-pino**：结构化 JSON、自动 request id、`redact` 掉 authorization/cookie/password；本地用 `pino-pretty`，生产关闭。来源：https://docs.nestjs.com/recipes/pino
- **8.2 指标用 prom-client**：暴露 `/metrics`（默认进程指标 + HTTP 直方图 + BullMQ 队列深度/失败数），该端点只在内网或带鉴权。来源：https://docs.nestjs.com/recipes/metrics
- **8.3 健康检查用 @nestjs/terminus**：拆分 `/health/live`（进程存活）与 `/health/ready`（Prisma `SELECT 1` + Redis ping）；就绪探针只指向 ready。来源：https://docs.nestjs.com/recipes/terminus
- **8.4 关联性**：日志、错误响应、队列 job 都带同一个 `requestId`/`traceId`，否则排障时无法把 API 请求与异步 job 串起来。

## 9. 共识、分歧与风险提示

- **社区共识**：controller 薄 / service 厚；时间一律 UTC；生产只跑 `migrate deploy`；队列必须"attempts + backoff + 幂等键"三件套；密码用 Argon2id；错误用 Problem Details；e2e 跑真实 Postgres。
- **社区分歧**：① 校验层 zod vs class-validator（新项目偏 zod，存量偏 class-validator）；② 软删除 vs 硬删除+归档表；③ HS256 vs RS256；④ BullMQ worker 与 API 同进程（简单）vs 独立进程（隔离、独立扩容）；⑤ 日志用 pino 拦截器 vs 中间件。
- **版本漂移风险（重要）**：三个官方站点的默认文档都已前进一个大版本（NestJS ≥11、Prisma 8、BullMQ 6）。查阅时必须锁定：Prisma 用 `/docs/orm/v6/` 前缀，BullMQ 对照 `/changelogs/changelog-v5`，NestJS 对照 v10 分支文档，否则会把新版变更当成 6.x 行为——例如 Prisma 7 起必须使用 driver adapter，Prisma 8 用 `db migrate` 取代 `migrate deploy` 并取消了 `$transaction`；BullMQ 6 亦有破坏性变更。
