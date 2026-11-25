# TeamFlow 全量开发 — 执行计划（多子代理协作版）

范围与上一版一致：U2 AI 拆解、U3/U6 成员职能 + 智能分工、U8–U11 Leader/成员日报周报；先建独立 worktree，再分阶段开发。你已确认“没什么问题，允许多子代理一起开发”。

## 一、执行环境

1. 当前目录无 `.git`，先 `git init`、补 `.gitignore`（`.mimosa/`、`.worktrees/`）、做基线提交。
2. 创建 worktree：`.worktrees/feature-reports-ai`，分支 `feature/reports-ai`。
3. 复制根 `.env` 到 worktree（不提交），`pnpm install`、shared build、`prisma generate`。
4. 停掉主目录 dev server，从 worktree 启动，沿用 3000/4000/1235，共用现有 Postgres/Redis。
5. 主目录保持基线；后续改动默认不自动提交/推送。

## 二、多子代理分工（文件所有权隔离）

主代理负责共享文件与集成，避免冲突：

| 角色 | 负责文件/模块 | 交付 |
|---|---|---|
| 主代理 | `docs/openapi.yaml`、`packages/shared/*`、`lib/types.ts`、`query-keys.ts`、`ai.service.ts` 合并、`task-drawer.tsx` 集成、最终联调 | 契约、共享 schema/枚举、跨模块集成 |
| 子代理 1 | `apps/api/src/modules/reports/*`、`week.ts` 新增周期工具、reports 单测/e2e 片段 | 周期报告后端 |
| 子代理 2 | `apps/web/src/features/reports/*`（新报告区、Markdown/HTML 导出）、reports 页面、样式、My Tasks 入口 | 报告前端 |
| 子代理 3 | `members` 模块 skills、`assignments` 新模块、Prisma skills 迁移、相关单测/e2e | 技能 + 分配建议后端 |
| 子代理 4 | 任务抽屉“智能推荐”弹窗、成员技能编辑 UI、AI 拆解预览/任务分工 UI | 分工与拆解前端 |
| 子代理 5 | 测试补齐、Playwright、文档（PRD/API_CONTRACT/DATA_MODEL/VERIFICATION/README） | 测试与文档 |

共享文件（`ai.service.ts`、`task-drawer.tsx`、`lib/types.ts`）由主代理修改或串行合并；子代理不直接改，避免写冲突。子代理产出先跑各自测试，再由主代理统一跑全量门禁。

## 三、开发阶段

### Phase 0 — Git/worktree（主代理，0.5d）
初始化、基线提交、worktree、依赖安装、dev server 切换。

### Phase 1 — 契约与共享层（主代理，0.5d）
- OpenAPI 升 1.6.0，新增：
  - `GET /projects/{projectId}/reports/period`
  - `POST /projects/{projectId}/reports/period/narrative`
  - `PATCH /projects/{projectId}/members/me/skills`
  - 扩展 `PATCH /projects/{projectId}/members/{userId}`
  - `POST /tasks/{taskId}/assign-suggestions`
  - `POST /tasks/{taskId}/ai-plan`
- 共享 Zod：`periodReportQuerySchema`、`periodReportNarrativeSchema`、`updateMemberSkillsSchema`、`assignSuggestionsSchema`、`aiPlanSchema`
- 共享常量/枚举：技能上限、`MEMBER_SKILLS_CHANGED`
- 前端类型/查询键

### Phase 2 — Leader/成员日报周报（子代理 1+2 并行，4–5d）
- 后端：`periodBounds`/`dayBounds`、`collectPeriod`、`memberStats`、成员过滤、`period()`/`periodNarrative()`、权限边界、两个端点
- AI：`composePeriodNarrative` + 防注入 + 本地降级
- 前端：报告区、日报/周报、团队/我的、成员总览表、Markdown 预览、`.md` + 可打印 `.html` 导出、Tab 改“报告”、My Tasks 入口
- 权限：本人 `report:view`；团队/他人 `report:generate`；非成员 404；归档 GET 可看、POST 409
- 测试：日期边界、摘要、AI 降级、权限矩阵、导出

### Phase 3 — 成员职能 + 智能分工（子代理 3+4，3–4d）
- 迁移：`ProjectMember.skills String[]`、`ActivityType.MEMBER_SKILLS_CHANGED`
- 接口：本人编辑技能、leader 编辑他人、成员列表返回 skills、`assign-suggestions`
- 评分：技能 40% + 负载 30% + 截止 20% + 历史 10%；排除 VIEWER
- AI 只做语义技能推断/理由增强，服务端校验候选人；失败回退规则
- UI：技能编辑、任务抽屉“智能推荐”、候选人弹窗、人工确认后走现有指派接口
- 不自动写库；VIEWER 手动指派保留但警告

### Phase 4 — AI 拆解升级（子代理 4 为主，2–3d）
- 现有 `ai-breakdown`：防注入、项目上下文、预览/勾选/编辑、单测
- 新增 `ai-plan`：返回标题/负责人建议/优先级/截止天数/依赖；服务端校验成员、VIEWER、日期、依赖无环
- UI：“子任务清单 / 任务分工”双模式；任务分工确认后创建正式任务并用现有依赖接口串联
- 本地降级：按负载轮询分配负责人

### Phase 5 — 全量验证与文档（子代理 5 + 主代理，1–2d）
- 文档：PRD v1.5–v1.7、API_CONTRACT、DATA_MODEL、README、VERIFICATION
- 测试：API 单测/e2e、Web 单测、Playwright、`openapi:lint`、lint、typecheck、build
- 主代理最终集成、回归、演示

## 四、默认项

- Leader = 有效 `report:generate` 权限（默认 OWNER/ADMIN）
- 技能预设 + 自定义，最多 6 个
- 任务分工创建正式任务，不改子任务表
- VIEWER 从推荐候选中排除；手动指派保留警告
- 报告按需实时生成，不落库
- 现有历史周报快照可见性不变
- 不做：看板分组/日历/甘特/重复任务/工时估算/批量操作/跨项目报告/服务端 PDF/定时日报

## 五、验收

每阶段跑各自测试；Phase 5 跑全量：
`pnpm openapi:lint`、api test/e2e、web test、Playwright、lint、typecheck、build 全绿。

功能验收：
- Alice（OWNER）可看团队日报/周报与成员总览，导出 .md/.html
- Bob（MEMBER）只看自己的报告，导出正常；请求团队/他人 403
- 成员可编辑技能，推荐按技能+负载排序，VIEWER 不出现，应用指派成功
- AI 拆解先预览再创建；任务分工模式能建任务和依赖
- AI 未配置时全部走本地规则并明确标注

各阶段完成后我停下来给你验收，再进入下一阶段。