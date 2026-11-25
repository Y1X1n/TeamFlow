# TypeScript 5.x + Next.js 14 App Router 前端开发规范（TeamFlow）

> 适用版本：next@14.2.x、react@18.3.x、typescript@5.4+、tailwindcss@3.4.x、@tanstack/react-query@5.x、react-hook-form@7.x、zod@3.x、@dnd-kit/core@6.x、vitest@2.x、@playwright/test@1.x
> 标注：**[官方]** = 框架/语言文档的硬约束或明确推荐；**[社区]** = 生态惯例，可协商但有共识。
> 背景约束：后端为 NestJS REST API，Next.js 前端只做 BFF/展示，业务写入一律走 REST。

## 0. 先落地这 8 条硬约束

1. `strict: true`、`noUncheckedIndexedAccess: true`、`verbatimModuleSyntax: true` 三者同开，CI 跑 `tsc --noEmit`。
2. `app/` 只放路由文件与路由私有件；业务代码放 `src/features/<domain>/`。
3. 默认 Server Component；`'use client'` 只加在交互岛（叶子），不加在 `layout.tsx`/Provider 外壳。
4. 任何密钥不得以 `NEXT_PUBLIC_` 开头；服务端专用模块首行 `import 'server-only'`。
5. 浏览器侧所有请求走 TanStack Query + 统一 `queryKey` 工厂，禁止散落 `useEffect + fetch`。
6. 表单 = zod schema 单一事实源 + `zodResolver`；后端 DTO 仍独立校验，前端校验只负责 UX。
7. Tailwind 类名必须整串静态出现，禁止 `` `bg-${color}-500` `` 这类拼接。
8. 业务写操作不用 Server Actions，用 NestJS REST + `useMutation`。

---

## 1. tsconfig：strict 家族与取舍

```jsonc
// tsconfig.json（核心片段）
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"],
}
```

- **TS-1 `strict: true`**｜[官方]｜`create-next-app` 生成的配置即含此项，`next build` 遇类型错误直接失败；不要用 `typescript.ignoreBuildErrors` 绕过，否则等于放弃唯一的全量类型闸门。｜https://nextjs.org/docs/14/app/building-your-application/configuring/typescript
- **TS-2 `noUncheckedIndexedAccess: true`**｜[社区，强共识]｜索引访问返回 `T | undefined`，能在编译期挡掉 `tasks[0].title` 这类真实崩溃；代价是数组/Record 访问都要加守卫，且 TanStack Query 的 `data` 本身可空，需要配合 `if (!data) return` 早返回。若团队嫌噪音大，可先只在 `src/features` 开启，但**新代码不要关**。｜https://www.typescriptlang.org/tsconfig#noUncheckedIndexedAccess
- **TS-3 `verbatimModuleSyntax: true`**｜[官方推荐]｜不做 import 重写，类型导入必须显式 `import type`，避免类型被误打进 bundle、也避免 `isolatedModules` 下的运行时错误；与 Next SWC 编译兼容。迁移成本是机械改 import，一次性。｜https://www.typescriptlang.org/tsconfig#verbatimModuleSyntax
- **TS-4 `exactOptionalPropertyTypes`：暂不开**｜[取舍]｜它区分"属性不存在"与"值为 undefined"，但和 `react-hook-form` 的 `defaultValues`、zod `.optional()`、REST 可选字段三方摩擦很大；等表单层稳定后再评估。｜https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes
- **TS-5 `moduleResolution: "bundler"` + `paths` 别名**｜[官方]｜Next 原生支持 `paths`/`baseUrl`；`@/*` 指向 `src/*`，禁止 `../../../` 相对爬楼。｜https://nextjs.org/docs/14/app/building-your-application/configuring/typescript
- **TS-6 不用 `any`，边界用 `unknown` + zod 收窄**｜[社区]｜REST 响应在 `lib/api` 层过一次 `schema.parse()`，下游全是收窄后的类型；`any` 一进业务层，`strict` 的价值即失效。
- **TS-7 Async Server Component 需要 TS ≥ 5.1.3 与 @types/react ≥ 18.2.8**｜[官方]｜低于此版本会报 `'Promise<Element>' is not a valid JSX element`。｜https://nextjs.org/docs/14/app/building-your-application/configuring/typescript
- **TS-8 启用 Next TS 插件**｜[官方]｜VSCode 选 "Use Workspace Version"，可校验 segment config、`use client` 用法、客户端 Hook 是否误用在 Server Component。｜https://nextjs.org/docs/14/app/building-your-application/configuring/typescript

---

## 2. App Router：边界、数据、密钥

- **RA-1 默认 Server Component，`'use client'` 是"模块图边界"而非"只跑在浏览器"**｜[官方]｜一旦某文件标记，它 import 的所有模块与直接渲染的子组件都进客户端 bundle。因此只给真正需要 state/effect/事件/浏览器 API 的叶子加。｜https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- **RA-2 把客户端组件"往下推"**｜[官方]｜`layout.tsx` 渲染静态 Logo + 交互 `SearchBar`，只让 `SearchBar` 成为 Client Component，避免整页 JS 体积膨胀。｜https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- **RA-3 禁止在根 layout / 全局 Provider 上随手加 `'use client'`**｜[官方+社区]｜Provider 必须是 Client Component（Context 不支持 RSC），但只能包住 `{children}` 而不是整个 `<html>`；社区高频提问即"根布局加 use client 是否让整条路由变客户端"。｜https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns ｜https://stackoverflow.com/questions/74992326/does-use-client-in-next-js-13-root-layout-make-whole-routes-client-component
- **RA-4 不要把 Server Component import 进 Client Component**｜[官方]｜会要求新一轮服务端请求。正确做法是把 Server Component 作为 `children`/prop 从父级 Server Component 传进 Client Component（slot 模式）。｜https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- **RA-5 Server→Client 的 props 必须可序列化**｜[官方]｜`Date` 在 RSC 内可自由使用，但跨边界传 `Map`/`Set`/class 实例/函数会报错或告警；在 `lib/serializers` 统一转 ISO 字符串。｜https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- **RA-6 数据获取位置（本项目）**｜[官方+项目决策]｜首屏：Server Component 内 `fetch` NestJS（直连内网地址，不经过自身 Route Handler）；交互后：客户端 TanStack Query。禁止在 Server Component 里 `fetch('/api/...')` 打自己的 Route Handler，多一跳。｜https://nextjs.org/docs/14/app/building-your-application/data-fetching/fetching-caching-and-revalidating
- **RA-7 带鉴权的 fetch 必须显式 `cache: 'no-store'`**｜[官方]｜Next 14 默认 `force-cache`，带 `Authorization`/`Cookie` 的个人数据若走默认缓存，会把 A 用户数据发给 B 用户（官方列出的免缓存条件之一即"使用 Authorization/Cookie 且上游有未缓存请求"）。｜https://nextjs.org/docs/14/app/building-your-application/data-fetching/fetching-caching-and-revalidating
- **RA-8 Route Handler 只做 BFF 三件事**｜[官方]｜①聚合多个 NestJS 接口；②隐藏 token / 转发 Cookie；③Webhook 与文件流。业务 CRUD 不在 Next 侧重写一遍。｜https://nextjs.org/docs/14/app/building-your-application/routing/route-handlers
- **RA-9 密钥与 `server-only`**｜[官方]｜任何读取 `process.env.SECRET` 的模块首行 `import 'server-only'`，被 Client Component 引用时构建期即报错；浏览器专用模块用 `client-only`。｜https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- **RA-10 `NEXT_PUBLIC_` = 公开常量，不是"配置项"**｜[官方]｜前缀变量在 `next build` 时被字符串内联进 JS，构建后改值无效；且 `process.env[name]` 动态取值不会被内联。规则：只放 API base URL、埋点 ID、feature flag 默认值。｜https://nextjs.org/docs/14/app/building-your-application/configuring/environment-variables
- **RA-11 `.env*` 管理**｜[官方]｜`.env`/`.env.development`/`.env.production` 入库作默认值；`.env*.local` 必须进 `.gitignore`；`/src` 目录下不放 env 文件，只认项目根目录。加载优先级：`process.env` > `.env.$(NODE_ENV).local` > `.env.local` > `.env.$(NODE_ENV)` > `.env`。｜https://nextjs.org/docs/14/app/building-your-application/configuring/environment-variables
- **RA-12 路由文件职责**｜[官方]｜`layout.tsx` 共享壳（不重渲染、可保留 state）；`page.tsx` 唯一可路由出口；`loading.tsx` = Suspense fallback（流式）；`error.tsx` **必须是 Client Component**（含 `reset()`），只捕获其下子树错误；`not-found.tsx` 由 `notFound()` 触发；`global-error.tsx` 兜根布局。层级：layout → template → error → loading → not-found → page。｜https://nextjs.org/docs/14/app/building-your-application/routing ｜https://nextjs.org/docs/14/app/building-your-application/routing/error-handling
- **RA-13 错误不要吞**｜[官方]｜Server Component 内 `fetch` 非 2xx 直接 `throw`，交给最近的 `error.tsx`；可预期业务错误（404/409）用返回值而非异常，避免整页错误边界。｜https://nextjs.org/docs/14/app/building-your-application/data-fetching/fetching-caching-and-revalidating

---

## 3. 目录组织与命名

```
src/
├─ app/                        # 只有路由
│  ├─ (auth)/login/page.tsx    # route group，不进 URL
│  ├─ (app)/projects/[id]/
│  │  ├─ page.tsx
│  │  ├─ loading.tsx
│  │  ├─ error.tsx             # 'use client'
│  │  └─ _components/          # 私有目录，不参与路由
│  └─ layout.tsx
├─ features/
│  └─ tasks/
│     ├─ api/                  # fetcher + queryKey 工厂 + useMutation
│     ├─ components/           # 领域组件（kebab-case 文件）
│     ├─ hooks/
│     ├─ schemas/              # zod
│     └─ types.ts
├─ components/
│  ├─ ui/                      # shadcn 生成，勿手改语义
│  └─ layout/
├─ lib/                        # api client、cn()、env 校验、serializers
└─ test/                       # setup、msw handlers、renderWithProviders
```

- **OR-1 文件名 kebab-case，组件导出 PascalCase**｜[社区]｜`task-card.tsx` → `export function TaskCard()`；与 shadcn CLI 生成物、Next 示例一致，规避 Windows/macOS 大小写不敏感导致的 import 事故。｜https://ui.shadcn.com/docs/installation/next
- **OR-2 `app/` 只放路由与路由私有文件**｜[官方]｜`app` 内文件默认"安全共置"、只有 `page/route` 可公开访问；但把业务组件混进 `app` 会让路由层与领域层耦合。｜https://nextjs.org/docs/14/app/building-your-application/routing/colocation
- **OR-3 私有目录用 `_` 前缀，分组用 `(group)`**｜[官方]｜`_components` 明确退出路由；`(app)`/`(auth)` 分组可给不同区段套不同 layout，且不影响 URL。｜https://nextjs.org/docs/14/app/building-your-application/routing/colocation
- **OR-4 features 优先于按类型分文件夹**｜[社区]｜一个领域（tasks/board/docs）的 api+组件+hooks+schema 同居，新人改需求只动一个目录；跨 feature 不互相 import，在 `app` 层组合。｜https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- **OR-5 单向依赖：`app → features → components/lib`**｜[社区]｜用 ESLint `import/no-restricted-paths` 固化，禁止 features 反向 import app。｜https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- **OR-6 不写 barrel（`index.ts` 全量 re-export）**｜[社区]｜会破坏 tree-shaking、拖慢 dev 编译与 HMR；直接 import 具体文件。｜https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- **OR-7 共享组件"三次法则"**｜[社区]｜同一 UI 出现三次再抽到 `components/`；否则留在 feature 内，避免 `components/` 变成垃圾场。
- **OR-8 Server/Client 分区显式命名**｜[社区]｜客户端交互文件可加 `-client.tsx` 后缀（如 `board-dnd-client.tsx`），code review 时一眼可辨边界，减少误加 `'use client'`。

---

## 4. 表单与数据层

- **FD-1 zod schema 是唯一事实源**｜[社区，强共识]｜`const taskSchema = z.object({...}); type TaskInput = z.infer<typeof taskSchema>`，不手写第二份 interface；表单、API 请求体、MSW mock 共用。｜https://react-hook-form.com/docs/useform
- **FD-2 `useForm({ resolver: zodResolver(schema), mode: 'onTouched' })`**｜[官方示例+推荐]｜`mode: 'onTouched'` 是官方给"不确定选哪个"时的默认建议：离开字段才报错，之后随输入更新，避免边打字边红。｜https://react-hook-form.com/docs/useform
- **FD-3 `defaultValues` 必须给全字段**｜[官方]｜缺失默认值会让 `isDirty` 误判、并在受控/非受控间跳变；编辑页用 `values` prop（响应外部数据）而非 `useEffect + reset`。｜https://react-hook-form.com/docs/useform
- **FD-4 resolver 与内置校验不可混用**｜[官方]｜配置 `resolver` 后 `required/min` 等内置规则不生效；所有规则写进 zod，错误信息用 `message` 自定义中文。｜https://react-hook-form.com/docs/useform
- **FD-5 服务端错误回填**｜[官方]｜NestJS 返回 422/400 时用 `setError('title', { message })` 或 `useForm({ errors })`；`errors` 对象需保持引用稳定以免无限重渲染。｜https://react-hook-form.com/docs/useform
- **FD-6 TanStack Query v5 只用对象签名**｜[官方]｜`useQuery({ queryKey, queryFn })`；v4 的位置参数重载已删除。同时 `isLoading` 语义变为 `isPending && isFetching`，判断用 `isPending`。｜https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- **FD-7 queryKey 工厂 + 从泛到具体**｜[官方+社区]｜`taskKeys = { all: ['tasks'], list: (f: Filters) => ['tasks','list',f], detail: (id: string) => ['tasks','detail',id] }`；queryFn 依赖的变量必须进 key，否则缓存串味。key 必须可 `JSON.stringify` 且唯一。｜https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- **FD-8 失效用前缀匹配，不用全量 `invalidateQueries()`**｜[官方]｜`invalidateQueries({ queryKey: taskKeys.all })` 会失效所有 `['tasks', ...]`；`exact` 默认 false 即前缀语义。全量失效会造成整站闪烁。｜https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- **FD-9 乐观更新固定四步**｜[官方]｜`onMutate`: `await cancelQueries` → `getQueryData` 快照 → `setQueryData` 写入 → 返回快照；`onError` 用快照回滚；`onSettled` 必 `invalidateQueries`（并 return Promise 以保持 pending）。单处展示的简单场景可只用 `variables` 渲染半透明占位，代码更少、无需回滚。｜https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
- **FD-10 拖拽排序的写入策略**｜[项目决策]｜`onDragEnd` 先本地重排 + 乐观写缓存，再 `PATCH /tasks/reorder`；失败回滚并 toast。不要每次 `onDragOver` 发请求。
- **FD-11 staleTime 显式设置**｜[官方]｜默认 `staleTime: 0`（挂载/聚焦/重连即重取），默认 `gcTime: 5min`、失败重试 3 次指数退避。TeamFlow 建议：列表 30s、详情 60s、成员/权限 5min；实时性要求高的看板配 `refetchInterval` 或后续接 WebSocket。｜https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- **FD-12 QueryClient 只在 Client Provider 创建一次**｜[社区]｜`useState(() => new QueryClient(...))` 放 `app/providers.tsx`（`'use client'`），避免 RSC 每请求共享实例导致串数据。｜https://tanstack.com/query/latest/docs/framework/react/guides/ssr

---

## 5. Tailwind 3.4 与 shadcn/ui

- **ST-1 类名必须整串静态出现**｜[官方]｜Tailwind 用正则扫源码、不执行代码，`` `bg-${color}-500` `` 不会生成 CSS；改为 `const variant = { todo: 'bg-slate-500', done: 'bg-emerald-500' }[status]`。｜https://v3.tailwindcss.com/docs/content-configuration#dynamic-class-names
- **ST-2 条件类名统一走 `cn()`**｜[社区]｜`cn('base', isActive && 'ring-2', className)`（clsx + tailwind-merge）；禁止手写字符串模板拼 class。｜https://ui.shadcn.com/docs/installation/next
- **ST-3 变体用 `cva`，不用 if 分支拼字符串**｜[社区]｜`cva('inline-flex...', { variants: { variant: {...}, size: {...} } })`，类型安全且类名完整可被扫描。
- **ST-4 shadcn 组件是"你的代码"**｜[官方]｜"This is not a component library. It is how you build your component library."——`components/ui/*` 可直接改；但团队约定：**基础组件只改 token/尺寸，业务样式一律在 feature 内包装**，便于后续 `shadcn diff` 对照与升级。｜https://ui.shadcn.com/docs
- **ST-5 组合优先，`asChild` 优于新 API**｜[官方]｜`<Button asChild><Link href>…</Link></Button>` 用 Slot 合并语义与样式，避免"按钮里套链接"的无障碍问题。｜https://ui.shadcn.com/docs/components-json
- **ST-6 主题只用 CSS 变量**｜[官方]｜`components.json` 设 `tailwind.cssVariables: true`，组件写 `bg-background text-foreground border-border`，禁止 `bg-white`/`text-[#111]` 硬编码；`style` 与 `baseColor` 初始化后不可改。｜https://ui.shadcn.com/docs/components-json
- **ST-7 `rsc: true`**｜[官方]｜CLI 会给需要状态的组件自动加 `'use client'`；若手动拷贝组件，需自行确认指令是否齐全。｜https://ui.shadcn.com/docs/components-json
- **ST-8 禁止用 `@apply` 堆业务样式**｜[社区]｜组件样式留在 JSX（可被扫描、可被变体组合）；`@apply` 仅用于第三方库无法改 DOM 的场景。

---

## 6. 测试分工

- **TS-1 单测用 Vitest + RTL + jsdom**｜[官方]｜依赖 `vitest @vitejs/plugin-react jsdom @testing-library/react`，`test.environment = 'jsdom'`；默认 watch 模式，CI 用 `vitest run`。｜https://nextjs.org/docs/14/app/building-your-application/testing/vitest
- **TS-2 async Server Component 不做单测**｜[官方]｜Vitest 尚不支持 async RSC，官方明确建议改用 E2E 覆盖；同步 Server/Client 组件可单测。｜https://nextjs.org/docs/14/app/building-your-application/testing
- **TS-3 Vitest 覆盖对象**｜[社区]｜zod schema 边界、queryKey 工厂、纯函数（排序/权限判断）、`useMutation` 乐观更新回滚逻辑、同步展示组件；断言用 `getByRole` 而非 `data-testid`（顺带测 a11y）。｜https://testing-library.com/docs/queries/about#priority
- **TS-4 Playwright 只覆盖关键用户旅程**｜[官方]｜登录 → 看板 → 新建任务 → 拖拽换列 → 刷新后状态保持 → 文档编辑保存；每个 spec 独立 seed 数据，不依赖执行顺序。｜https://nextjs.org/docs/14/app/building-your-application/testing/playwright
- **TS-5 测试文件就近放置**｜[官方]｜`__tests__/` 或与源码同目录 `*.test.tsx` 均可，`app` 内共置是安全的；E2E 单独 `e2e/`。｜https://nextjs.org/docs/14/app/building-your-application/testing/vitest
- **TS-6 网络用 MSW 而非 jest.mock(fetch)**｜[社区]｜handler 复用真实 REST 形状，单测与本地开发共用一套 mock，减少"mock 与后端漂移"。

---

## 7. 可访问性与性能

- **AP-1 dnd-kit 必须保留键盘通道**｜[官方]｜显式启用 `KeyboardSensor` + `sortableKeyboardCoordinates`；activator 必须是可聚焦元素（原生 `<button>` 优先，否则 `tabIndex=0`）。Enter/Space 拾取与放下、方向键移动、Esc 取消是 ARIA 第三规则要求。｜https://dndkit.com/guides/accessibility
- **AP-2 自定义读屏提示（中文）**｜[官方]｜`DndContext` 的 `screenReaderInstructions` 与 `announcements` 默认只有英文；必须本地化，且播报用"第 2 位 / 共 5 位"这类**位置**而非数组下标。｜https://dndkit.com/guides/accessibility
- **AP-3 拖拽后焦点管理**｜[官方+社区]｜拖拽结束把焦点移回被移动项（或新位置项），否则键盘用户焦点丢失、页面滚动跳变；列表容器加 `aria-live="polite"` 播报结果。｜https://dndkit.com/guides/accessibility
- **AP-4 交互元素用语义标签**｜[官方]｜`<button>`/`<a>`/`<label htmlFor>`；禁止 `div onClick`。Next 的 `next/core-web-vitals` 规则集为首次 `next lint` 的 "Strict (recommended)" 选项，构建期错误即失败。｜https://nextjs.org/docs/14/app/building-your-application/configuring/eslint
- **AP-5 表单错误可被朗读**｜[官方示例]｜输入框加 `aria-invalid`、`aria-describedby` 指向错误文本，错误容器 `role="alert"`；`shouldFocusError` 默认 true，提交失败聚焦首个错误字段（要求 ref 真挂在 DOM 上）。｜https://react-hook-form.com/docs/useform
- **AP-6 模态/弹层用 shadcn Dialog/Sheet**｜[社区]｜Radix 自带 focus trap、Esc 关闭、`aria-modal`；自研弹层 90% 会漏焦点回收与滚动锁定。
- **AP-7 大组件不要整体 `'use client'`**｜[官方]｜看板页 = Server Component 取数 + `<BoardDndClient>` 岛屿；表格壳、筛选条文案、空态保持服务端渲染。"把整页标 client"是社区最常见的性能反模式。｜https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
- **AP-8 TipTap 编辑器动态加载**｜[社区]｜`dynamic(() => import('./editor'), { ssr: false })`，编辑器依赖大且强依赖 DOM；外壳与只读渲染（文档预览）仍可服务端出 HTML。
- **AP-9 路由级 loading 与图片/字体**｜[官方]｜每个数据路由配 `loading.tsx`（骨架屏）以获得流式首屏；图片用 `next/image`、字体用 `next/font`，`@next/next/no-img-element` 会在构建期报错。｜https://nextjs.org/docs/14/app/building-your-application/routing

---

## 8. 社区争议与 TeamFlow 的决策

| 争议                      | 社区两派                                                          | TeamFlow 决策                                                                  | 理由                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server Actions vs REST    | 全栈 Next 派主张 Actions 免写接口；分离后端派主张 REST 是唯一契约 | **不用 Actions 写业务**，全部走 NestJS REST                                    | 已有 NestJS 与 DTO 校验；Actions 需在每次调用内重做鉴权，且无法被移动端/第三方复用。官方也明确"应当把 Server Actions 当作公开 API 端点来鉴权"｜https://nextjs.org/docs/14/app/building-your-application/data-fetching/server-actions-and-mutations ｜https://stackoverflow.com/questions/77748391/nextjs-14-server-actions-vs-route-handlers |
| `'use client'` 滥用       | "先加再说" vs "最小岛屿"                                          | **最小岛屿**，CI 用 `no-restricted-syntax`/code review 拦截根级 `'use client'` | 边界会向下传染整棵子树，直接决定首屏 JS；社区反复出现的"根布局加 use client 是否全站变客户端"即此坑｜https://stackoverflow.com/questions/74992326/does-use-client-in-next-js-13-root-layout-make-whole-routes-client-component                                                                                                               |
| RSC fetch vs 客户端 Query | RSC 优先 vs SPA 式 Query 优先                                     | **一页一套**：首屏 RSC，交互后 Query；同一资源不在两处重复取                   | 两套缓存（Next Data Cache + Query Cache）并存会导致"刷新才对/不刷新才对"的玄学 bug｜https://nextjs.org/docs/14/app/building-your-application/data-fetching/fetching-caching-and-revalidating                                                                                                                                                 |
| 类型要不要"够用就行"      | 务实派 vs 严格派                                                  | **strict 全开**，仅 `exactOptionalPropertyTypes` 暂缓                          | 团队规模小、Review 带宽有限，编译期拦截比人肉 review 便宜｜https://www.typescriptlang.org/tsconfig#strict                                                                                                                                                                                                                                    |
| 组件库自研 vs shadcn      | 自研设计系统 vs 复制粘贴                                          | **shadcn 为底座**，只加 token 与业务包装                                       | 无运行时依赖、可读可改；避免早期造轮子拖慢交付｜https://ui.shadcn.com/docs                                                                                                                                                                                                                                                                   |

> 明确不做的三件事：① 用 Server Actions 替代 NestJS 写接口；② 在 `NEXT_PUBLIC_` 放任何 token/密钥；③ 为了"少写 props"把整页设为 Client Component。
