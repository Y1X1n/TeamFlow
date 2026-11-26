# TeamFlow

面向学生团队、社团与小型工作室的实时项目协作平台：实时看板、细粒度权限、事件驱动自动化（逾期提醒 / 活动时间线 / 周报）。

## 功能概览

- 实时看板：多人在线拖拽、presence、断线轮询兜底；列内快速新建、卡片快捷操作、任务复制、截止时间筛选
- 看板分组：按负责人/优先级/标签分组浏览，分组视图暂停拖拽，切回不分组即可排序
- 批量操作：多选任务批量设置负责人/优先级、移入完成列，失败任务保留选中并汇总提示
- 工时估算：任务可设置预计工时，看板卡片展示，项目概览按成员汇总未完成预估工时
- 任务导出：按当前搜索/筛选结果导出看板任务 CSV（含工时估算），UTF-8 BOM 兼容 Excel
- 任务列表视图：看板/列表切换，按截止时间、优先级、更新时间排序，复用筛选、批量选择与任务抽屉
- 项目日历：月视图按截止日期聚合任务、无截止任务清单、导出 `.ics` 到系统日历
- 任务可视化：标签稳定配色、停滞任务（≥3 天未更新）提醒
- 任务协作：富文本描述、子任务清单、任务依赖/阻塞校验、评论单层回复、表情回应、@ 自动补全、附件预览与拖放/粘贴上传、任务关注与活动历史
- 报告中心：团队/成员日报与周报按需实时计算，Markdown 预览，导出 `.md` 与可打印 `.html`
- 成员职能与智能分工：成员维护职能标签，按技能匹配/负载/截止/历史推荐任务负责人，人工确认后指派
- 效率入口：`Ctrl/Cmd+K` 全局搜索、我的任务页、项目模板（课程/社团/竞赛）、项目概览与成员工作负载
- 账号设置：右上角账户菜单、头像裁剪上传、昵称修改、修改密码与通知偏好
- 自动化：逾期/到期通知、本周实时汇总、周报快照与 Markdown 导出、时间线 CSV 导出、通知偏好、SSE 实时收件箱
- AI（可选）：任务智能拆解与分工建议（预览/编辑后创建）、负责人推荐排序、报告叙述、周报邮件智能撰写；未配置模型时透明回退本地规则，不自动指派或创建任务
- 智能邮件（可选）：腾讯 Agent Mail 发送周报，页面内预览+确认后发送，默认关闭、不自动群发
- 安全与治理：JWT 轮换、17 项细粒度权限、上传校验、通知去重、审计时间线

## 文档

- [产品需求 PRD](./docs/PRD.md)
- [架构设计](./docs/ARCHITECTURE.md)
- [数据模型](./docs/DATA_MODEL.md)
- [API 契约（OpenAPI 3.1）](./docs/openapi.yaml) / [契约说明](./docs/API_CONTRACT.md)
- [实时协议](./docs/REALTIME_PROTOCOL.md)
- [开发约束](./docs/DEV_CONSTRAINTS.md)
- [文档验收记录](./docs/VERIFICATION.md)

## 技术栈

Next.js 14 · NestJS 10 · PostgreSQL 16 · Prisma 6 · Redis 7 · BullMQ 5 · Yjs + Hocuspocus · MinIO · Docker Compose

## 本地开发

```bash
cp .env.example .env
docker compose up -d postgres redis   # 宿主端口 55432 / 6380（规避本地端口占用）
pnpm install
pnpm --filter @teamflow/shared build
pnpm --filter @teamflow/api db:generate
pnpm --filter @teamflow/api db:deploy
pnpm --filter @teamflow/api db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- Realtime: ws://localhost:1235
- 附件默认使用本地磁盘驱动（`STORAGE_DRIVER=local`，目录 `./storage`），无需 MinIO 即可开发。
- 如需 S3/MinIO：`docker compose --profile s3 up -d minio minio-init`，并设置 `STORAGE_DRIVER=s3`（MinIO 控制台 http://localhost:9001）。

演示账号（seed 后）：`alice@example.com` / `Passw0rd!`、`bob@example.com` / `Passw0rd!`。

### AI 配置（可选）

在 `.env` 中设置 OpenAI 兼容服务即可启用任务智能拆解、报告叙述、负责人推荐与任务分工；未配置时使用本地规则并在 UI 明确提示（AI 不会自动指派或创建内容）：

```
AI_BASE_URL=https://your-openai-compatible/v1
AI_API_KEY=...
AI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=20000
# 仅本地开发可设为 true，允许 AI_BASE_URL 指向 loopback（127.0.0.1/::1/localhost）；
# 生产环境始终拒绝 loopback、私有与保留地址。
AI_ALLOW_LOOPBACK=false
```

本地代理示例：`AI_BASE_URL=http://127.0.0.1:3425/v1`，并设置 `AI_ALLOW_LOOPBACK=true`（仅开发）。服务端在每次调用前校验协议与主机，并拒绝私有/保留地址；开发环境允许 loopback 仅用于本机代理。

### Agent Mail 配置（可选）

周报页的“智能发送邮件”通过腾讯 `agently-cli` 发送。默认关闭，需先在本机完成指定邮箱授权：

```bash
npm install -g @tencent-qqmail/agently-cli
agently-cli auth login
agently-cli +me
```

然后在 `.env` 设置并重启 API：

```
AGENT_MAIL_ENABLED=true
# 指向全局安装的 scripts/run.js；Windows 示例：
AGENT_MAIL_CLI_ENTRY=C:/Users/<you>/AppData/Roaming/npm/node_modules/@tencent-qqmail/agently-cli/scripts/run.js
```

- 发送前必须在页面内预览并二次确认；后端不会自动群发。
- OAuth 凭据由 CLI 存入系统凭据库，TeamFlow 不保存邮箱密码或 Token。
- 未配置/未授权时仍可生成邮件预览，但发送按钮禁用。

## 测试

```bash
pnpm --filter @teamflow/shared test          # 共享纯函数单测
pnpm --filter @teamflow/api test             # API 单测
pnpm --filter @teamflow/api test:e2e         # Supertest 端到端（需 PG）
pnpm --filter @teamflow/web test             # 前端单测
pnpm --filter @teamflow/web exec playwright install chromium
pnpm --filter @teamflow/web test:e2e         # Playwright（需 Web/API 运行且已 seed）
pnpm openapi:lint                            # 契约校验
k6 run tests/k6/board.js                     # 看板读接口压测（需 k6）
```

## 一键容器启动

```bash
cp .env.example .env
docker compose up --build -d
# 打开 http://localhost
```

监控（可选）：`docker compose --profile monitoring up -d`，Prometheus http://localhost:9090，Grafana http://localhost:3001（admin/admin）。

## 常用脚本

| 命令                           | 说明                        |
| ------------------------------ | --------------------------- |
| `pnpm dev`                     | 并行启动 web + api（watch） |
| `pnpm build`                   | 全仓构建                    |
| `pnpm lint / typecheck / test` | 质量门禁                    |
| `pnpm openapi:lint`            | 校验契约                    |
| `pnpm db:migrate / db:seed`    | 数据库迁移 / 种子           |
