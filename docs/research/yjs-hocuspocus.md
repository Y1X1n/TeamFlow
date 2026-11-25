# Yjs + Hocuspocus 生产实践调研（TeamFlow 看板实时协作）

> 调研日期：2026-11-22。标记说明：**[官方]** = yjs.dev / docs.hocuspocus.dev（现跳转 tiptap.dev/docs/hocuspocus）原文；**[源码]** = 官方包源码行为；**[社区]** = GitHub issue / discuss.yjs.dev / 博客经验，非官方承诺。

## 0. 版本矩阵（务必 lockfile 锁定）

| 包                                      | 建议版本                                          | 依据                                                             |
| --------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| @hocuspocus/server                      | **3.4.4**（Node 20 方案）/ 4.9.0（Node 22+ 方案） | 3.4.4 于 2026-01-25 发布；4.9.0 于 2026-11-20 发布，npm `latest` |
| @hocuspocus/provider                    | **3.4.4** / 4.9.0（与 server 同大版本）           | 同一 monorepo 同版本发布                                         |
| yjs                                     | **13.6.33**（2026-09-23）                         | v3/v4 的 peerDependency 均为 `yjs ^13.6.8`                       |
| y-protocols                             | 1.0.7（peer `^1.0.6`）                            | awareness/sync 协议实现                                          |
| @hocuspocus/extension-redis / -database | 与 server 同大版本                                | 扩展包版本号与核心包一致                                         |

- **规则**：`npm i @hocuspocus/server` 现在装到 4.9.0，必须显式写死 `@3.4.4` 或 `@4.9.0`，否则 CI 与新同事会拿到不同大版本。理由：v4 是当前 latest（2026-04-23 起），v3 自 2026-01 后仅维护。来源：npm dist-tags、https://github.com/ueberdosis/hocuspocus/releases/tag/v4.0.0
- **规则**：v2（2.15.3，2025-07-01 后无更新）不要选。理由：v3 已重构为 `new Server()`、移除 `Server.configure()`；v2 无后续修复。来源：[官方] https://tiptap.dev/docs/hocuspocus/getting-started/upgrade
- **规则**：v4 要求 **Node.js ≥ 22**（package `engines`），v3 无此限制；NestJS 10 基线若为 Node 20，选 v3.4.4。理由：硬性运行时要求，跨不过去就是启动失败。来源：[官方] 同上 / https://tiptap.dev/docs/hocuspocus/server/usage
- **规则**：v3 provider 与 v4 server、v4 provider 与 v3 server 线上协议互通（双向兼容），但仍建议同大版本配对。理由：官方发布说明明确兼容，同时提醒 v4 的 `sessionAwareness: true` 对 v3 server 会生成意外文档，必须保持 `false`（默认值）。来源：[官方] v4.0.0 release notes 同上
- **规则**：v4 优先使用场景（若可用 Node 22）：`maxUnauthenticatedQueueSize` 等预认证限额、`flushDelay` 合批、`onTokenSync`、`beforeHandleAwareness` 服务端改写 presence、有序消息处理。理由：这些正是看板最需要的能力。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/configuration

## 1. 认证与权限（onAuthenticate）

- **规则**：在 `onAuthenticate({ token, documentName, requestHeaders, requestParameters })` 中校验 JWT，并**查库校验该用户是该项目成员**，把 `{ userId, projectId, role }` 作为返回值写入 `context`；后续所有 hook 从 `context` 取用户，绝不信任客户端参数。理由：官方明确"返回的上下文可在其他 hook 使用"，且 hook 链任一环 reject 即终止。来源：[官方] https://tiptap.dev/docs/hocuspocus/guides/authentication 、https://tiptap.dev/docs/hocuspocus/server/hooks#on-authenticate
- **规则**：拒绝未授权连接的**唯一正确姿势是 `throw`（或 reject）**，不要"连上再发业务消息踢掉"。理由：官方："By way of illustration, if a user isn't allowed to connect: Just throw an error in the onAuthenticate() hook." 反之若用 `onConnect` 拒绝，攻击者可能在拒绝前已拿到部分数据（官方 Laravel 示例中亦有此提醒）。来源：[官方] hooks#the-hook-chain、https://tiptap.dev/docs/hocuspocus/server/examples
- **规则**：`documentName` 采用 `project:<projectId>` 单文档模型；解析后必须同时满足 ①前缀/格式合法 ②projectId 存在 ③JWT 用户是成员，三者缺一即 throw。理由：documentName 完全由客户端构造，且 server 对未加载过的名字会**惰性建文档**，不校验就等于允许任意人刷内存。来源：[官方] hooks（documentName 在 payload 中）+ [社区] https://github.com/ueberdosis/hocuspocus/issues/1181（"onLoadDocument 拒绝未知文档是文档化的做法"）
- **规则**：一个项目**一个文档**（`project:<id>`），不要按列表拆成 `project:<id>:list:<id>`。理由：看板拖拽必然跨列表，单文档内一次 `transact` 即原子迁移；拆文档后跨文档移动需要自己做两阶段提交与失败补偿，而 Hocuspocus 的 subdocument 至今「尚未实现」。来源：[官方] https://tiptap.dev/docs/hocuspocus/guides/multi-subdocuments （"we haven't implemented support yet"；官方推荐 `entity.id` 形式的 documentName，并用同一 yDoc 的不同 fragment 承载多块数据）
- **规则**：只读成员用 `data.connection.readOnly = true`，不要仅靠前端隐藏按钮。理由（源码级）：v3.4.4 `MessageReceiver` 对 `readOnly` 连接的 `messageYjsUpdate` / `SyncStep2` 直接丢弃并回 `syncStatus(false)`，根本不会 apply。来源：[源码] https://cdn.jsdelivr.net/npm/@hocuspocus/server@3.4.4/src/MessageReceiver.ts （官方文档同述：https://tiptap.dev/docs/hocuspocus/guides/authentication#read-only-mode）
- **规则**：v4 中 `requestHeaders` 是 Web 标准 `Headers`，用 `.get('authorization')`；v3 是普通对象 `requestHeaders['authorization']`。理由：v4 破坏性变更，直接把 v3 代码迁到 v4 会拿不到 token。来源：[官方] https://tiptap.dev/docs/hocuspocus/getting-started/upgrade
- **规则**：长连接期间 token 会过期 → 在 `beforeHandleMessage` 里比对 `context.tokenExpiresAt`，过期抛 `{ reason }` 关闭连接；或 v4 用 `onTokenSync` + `provider.sendToken()` 续期。来源：[官方] hooks#before-handle-message、hooks#on-token-sync
- **规则**：把 `@hocuspocus/server` 作为**独立进程/端口**跑（如 1235），NestJS 只管 HTTP/REST；由 Nginx 同域不同 path 暴露。理由：Hocuspocus 自带 http+ws server，NestJS 10 的 HTTP adapter 不暴露原始 `upgrade` 事件，强行共端口容易与 `@nestjs/websockets` 抢 upgrade。来源：[官方] Express/Koa 示例（不调用 `listen()` 时需自行 `handleConnection`）https://tiptap.dev/docs/hocuspocus/server/examples ；进程分离为 [社区] 常见做法（例：https://juejin.cn/post/7628448241537122340 ）

## 2. 持久化（PostgreSQL 为事实源）

- **规则**：`onStoreDocument` 里只写 `Y.encodeStateAsUpdate(document)` 得到的 `Uint8Array`（Prisma `Bytes`），`onLoadDocument` 原样返回这段二进制；**绝不要把 JSON 反序列化后新建 Y.Doc 再返回**。理由：官方警告"不要存 JSON 再重建 Yjs 二进制，会导致合并异常、新连接内容重复"；社区真实故障即此（重启后内容被追加一遍）。来源：[官方] https://tiptap.dev/docs/hocuspocus/guides/persistence#faq-in-what-format-should-i-save-my-document 、[社区] https://github.com/ueberdosis/hocuspocus/issues/344
- **规则**：`onLoadDocument` 返回 `null/undefined` 表示"新文档"，由 Hocuspocus 建空 `Y.Doc`；返回坏数据会直接拒绝连接。理由：官方 Database 扩展 `fetch` 约定返回 `Uint8Array | null`；v4 起还可直接返回 `Uint8Array`。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/extensions/database
- **规则**：debounce 用默认 `debounce: 2000` / `maxDebounce: 10000` 起步即够；文档级高频拖拽不要逐次入库。理由：官方默认值即为此，`maxDebounce` 保证"最多 10s 必落一次"。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/configuration
- **规则**：MVP 采用「每项目一行快照」而非变更日志；变更日志（snapshot + update 追加）只在需要审计/回放/大文档增量时再上。理由：官方只承诺"存二进制快照"这一条路径；快照行简单、恢复快，缺点是丢失 debounce 窗口内的历史（≤10s）。来源：[官方] https://tiptap.dev/docs/hocuspocus/guides/persistence ；变更日志属 [社区] 进阶模式（https://github.com/FE-square/DocApp/blob/main/readme.md ）
- **规则**：服务重启恢复 = 新进程首次有人连接时 `onLoadDocument` 读快照；进程内还有文档时不要双写。理由：官方生命周期如此，文档在最后一个连接断开后从内存卸载。来源：[官方] hooks#after-unload-document
- **规则**：`store` 必须自己 try/catch + 重试 + 告警，不能"抛出去就算"。理由：v3 早期版本在 `onStoreDocument` reject 时不会卸载文档（内存泄漏）且丢最后一次写入；相关竞态在 3.4.x 才修完。来源：[社区] https://github.com/ueberdosis/hocuspocus/issues/954 、https://github.com/ueberdosis/hocuspocus/issues/995
- **规则**：优雅停机调用 `server.destroy()`（v4 会 flush 待写入的 debounce store）；`SIGTERM` 里先 destroy 再退进程。理由：官方明确 v4 `destroy()` 会冲刷 pending store。来源：[官方] hooks#on-store-document、https://tiptap.dev/docs/hocuspocus/server/usage#stopping-the-server
- **规则**：PostgreSQL 侧只把 Yjs 快照当"同步层真相"，任务标题/负责人/截止日等元数据仍由 REST + Prisma 写；如需列表查询，用 `onStoreDocument` 顺带把 Yjs 投影成 `task_positions` 表（物化视图式）。理由：官方把 Yjs 二进制定位为"主存储"，但它不可 SQL 查询。来源：[官方] https://tiptap.dev/docs/hocuspocus/guides/persistence ；投影方案为 [社区] 混合架构通行做法。

## 3. 扩展与多实例

- **规则**：单实例 MVP **不需要** Redis 扩展。理由：官方定位 Redis 扩展为"水平扩展时同步实例间 update 与 awareness"，单实例无跨实例广播需求。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/extensions/redis
- **规则**：多实例时必须上 `@hocuspocus/extension-redis`，并给每个实例唯一 `name`；awareness **会**经 Redis 同步（不会落库）。理由：官方原文"propagate all received updates to all other instances … sync changes and awareness states through Redis"，且排障时实例名必须唯一。来源：[官方] 同上
- **规则**：不要指望加实例降 CPU —— 官方明确"所有消息会在所有实例上处理，想靠多实例降 CPU 就不要用 Redis 连它们"。理由：Redis 解决的是"用户在 A 实例、同事在 B 实例"的连通性，不是分片。来源：[官方] 同上
- **规则**：Redis 扩展不持久化；必须与 Database 扩展并用，且同一文档的 store 会被加锁避免写冲突。理由：官方原文 + "Once an instance stores a document, it's blocked for all other instances"。来源：[官方] 同上
- **规则**：多实例 + 负载均衡不必强制 sticky session（同一连接天然落一台），但**不要**让同一文档在两个集群间漂移；`awaitInitialSyncTimeout`（默认 1000ms）控制新实例等待对端状态的时长。理由：官方"Consistent state on load"一节。来源：[官方] 同上
- **规则**：已知坑：Redis 扩展的延迟退订曾把**正在加载的新文档**卸载掉，导致重连后更新静默丢失（2.15.3 报，2025-12 关闭）。理由：升级到含修复的版本 + 回归"重连后立刻编辑"用例。来源：[社区] https://github.com/ueberdosis/hocuspocus/issues/971

## 4. Awareness（presence）

- **规则**：字段保持小而扁平，建议：`{ user: { id, name, color }, cursor?: { x, y }, dragging?: { taskId, listId, since } }`；只放"给别人看"的信息，**不放 email、token、角色权限、任务正文**。理由（官方）：awareness 状态会被广播给同文档所有连接，"you are free to pass whatever data you would like to share with other users"；它是公开频道，不是私有存储。来源：[官方] https://tiptap.dev/docs/hocuspocus/guides/awareness 、https://docs.yjs.dev/api/about-awareness
- **规则**：鼠标/拖拽位置在客户端节流到 50–100ms 再 `setLocalStateField`，不要在每个 `mousemove`/`dragover` 上写。理由：每次 awareness 变更都会编码**整份 state** 并广播给全员，官方甚至为 v4 加了 `flushDelay`（合批，建议 500ms 以内）来削峰。来源：[官方] https://tiptap.dev/docs/hocuspocus/provider/configuration#batching-outgoing-updates ；具体 50–100ms 数值为 [社区] 经验值
- **规则**：清理靠三层，不要自己写定时踢人：①y-protocols 30s 未收到心跳即标记 offline；②Hocuspocus 在连接移除时 `removeAwarenessStates`；③客户端 `beforeunload` 主动清本地状态。理由：官方文档明确 30s 超时与 `removeAwarenessStates` 用法，源码确认断连即清。来源：[官方] about-awareness；[源码] https://cdn.jsdelivr.net/npm/@hocuspocus/server@3.4.4/src/Document.ts
- **规则**：对"正在拖拽"要单独设计「软锁」：开始拖拽时写 `dragging`，结束/取消/断线自动消失，服务端不据此做鉴权（仅 UI 提示 + 乐观禁用）。理由：awareness 无历史、无冲突解决、可被客户端伪造，只能当提示信号。来源：[官方] awareness 指南（"has its own CRDT, but does not have a history of updates"）
- **规则**：v4 可用 `beforeHandleAwareness` 用服务端可信用户覆盖客户端自报的 `user` 字段；v3 无此钩子，需在广播侧（自建 relay）或 UI 侧按 userId 从 REST 补齐。理由：v4 官方示例即"stamp a server-verified field over the client value"。来源：[官方] hooks#before-handle-awareness

## 5. 安全边界

- **规则**：把"客户端可构造任意 Yjs update"当作前提：Yjs **没有** schema 校验，恶意客户端可创建任意命名类型、塞入垃圾数据放大所有后续同步（DoS）。理由：维护者与社区共识"YJS lacks validation … validation should be performed on the server"。来源：[社区] https://discuss.yjs.dev/t/validation-security-and-middleware/2229
- **规则**：可落地的四道闸：①`onAuthenticate` 鉴权 + `readOnly`（viewer 直接丢 update）；②`beforeHandleMessage` 抽样检查 update（如 `Y.decodeUpdate` 后核对 top-level type 名与字段白名单，超限即抛错断连）；③`websocketOptions.maxPayload` 限单帧大小；④v4 的 `maxUnauthenticatedQueueSize / maxUnauthenticatedQueueMessages / maxPendingDocuments` 限未认证缓冲。理由：官方 hooks 明确 `beforeHandleMessage` 可用于"check the update message and reject/accept it based on custom rules"，v4 限额源于安全公告。来源：[官方] hooks#before-handle-message、server/configuration；公告 https://github.com/ueberdosis/hocuspocus/security/advisories/GHSA-xwhh-v746-pj9m
- **规则**：只读用户仍然可以发 awareness（presence 需要），若不允许，在 `beforeHandleAwareness` 抛错拒绝；不要把"只读"实现成"连得上但写不进去还没提示"——provider 会收到 `syncStatus(false)`，UI 要提示"无编辑权限"。来源：[源码] MessageReceiver.ts（上述）、[官方] hooks#before-handle-awareness
- **规则**：限流用官方 `Throttle` 扩展或网关层，按「连接数 / 每秒消息数 / 每文档字节数」三个维度，不要只限 IP。理由：官方扩展列表提供 Throttle；看板场景真正的风险是单连接高频 update。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/extensions/overview

## 6. 看板数据建模（关键决策）

- **规则**：列表顺序用 **fractional indexing**（字符串 key，如 `a0` / `a1V` / `Zz`），**不要**用 `Y.Array` + splice 维护顺序，也不要用整数 `position`。理由（官方博客）：排序只改一个对象的 index 值，一次拖拽只产生 1 个字段写入；`Y.Array` 的并发 move 是"删除+插入"，会互相穿插甚至复制/复活元素；整数 position 在并发插入时会撞值。来源：[Figma 官方博客] https://www.figma.com/blog/realtime-editing-of-ordered-sequences/ 、实现库 https://github.com/rocicorp/fractional-indexing
- **规则**：数据结构建议 `board = Y.Map<taskId, { listId, pos, title? }>`；`pos` 由 `generateKeyBetween(prev, next)` 生成，客户端只写自己拖的那一条。理由：Map 的 key 级并发粒度最小，避免整表重排；Figma 同款"每个对象一个 index"。来源：同上
- **规则**：两人同时拖同一任务时，**不要依赖 CRDT 的 LWW 结果做业务判断**。理由：Y.Map 并发写同一 key 的胜者由 clientID/clock 决定，社区明确"应视为实现细节，不能用于业务逻辑，因为客户端可操纵这些值"。来源：[社区] https://discuss.yjs.dev/t/y-map-conflict-resolution-which-side-wins/1952
- **规则**：推荐处理：拖拽开始写 awareness `dragging.taskId` → 他人看到该卡显示"XX 正在移动"并禁用拖拽（软锁）→ 释放后清除；若仍冲突，接受 CRDT 结果并在 UI 提示"任务已被 XX 移动到 <列表>"，不做自动回滚。理由：软锁成本最低、可解释；硬锁需要服务端租约与超时，MVP 不值得。来源：[社区] 组合实践（awareness 软锁 + fractional index 收敛），理论依据同上两条
- **规则**：`pos` 长度会随反复插入增长，需接受；极端场景（同一缝隙反复插）做"重排+重新发 key"的离线任务。理由：Figma 明确列出 drawback "Index length can grow over time"，并说明正常使用不会失控。来源：同上 Figma 博客

## 7. 与 REST CRUD 共存

- **规则**：**单写者原则**：元数据（标题/负责人/截止日）只由 REST 写 Postgres；顺序/列归属只由 Yjs 写；不要两边都写同一字段。理由：双写必然产生"Yjs 里旧值覆盖 REST 新值"的循环覆盖，CRDT 无法判断谁是业务真相。来源：[官方] https://tiptap.dev/docs/hocuspocus/guides/persistence （"see it more as a view on your data, not as your data source"）+ [社区] 经验。
- **规则**：REST 改动若必须立刻反映到看板（如批量改负责人），走**服务端注入**：`const conn = await hocuspocus.openDirectConnection('project:<id>', context); await conn.transact(doc => {...}); await conn.disconnect()`，由 Hocuspocus 广播给在线客户端并触发 `onStoreDocument`。理由：官方提供的正是这条路径（"Editing a document locally … while keeping hooks and syncing running"）。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/examples#editing-a-document-locally 、https://tiptap.dev/docs/hocuspocus/server/usage（methods 表）
- **规则**：`disconnect()` 默认立即持久化并卸载文档；短时间连续注入用 `disconnect({ unloadImmediately: false })` 复用内存中的 doc，但此时"返回即已落库"不再成立。理由：官方原文。来源：同上 examples 页"Keeping the document warm after disconnect"
- **规则**：先写 Postgres 再注入 Yjs 的顺序**只适用于元数据字段**；对 `pos` 这类字段应先算 key → 注入 Yjs → 由 `onStoreDocument` 投影回库。理由：若先写库再由 Yjs 广播，客户端会短暂看到两份真相。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/examples#editing-a-document-locally
- **规则**：REST 侧加乐观并发（`version` / `updatedAt` 条件更新），冲突返回 409 让用户刷新；不要在 REST 里"读 Yjs 快照再整表覆盖"。理由：Yjs 快照是增量合并语义，整表覆盖会抹掉在线用户的未同步改动。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/extensions/database （"do not create a new Ydoc … would lead to a new history"）+ [社区] 实践。

## 8. 连接、内存与反代

- **规则**：客户端卸载必须 `provider.destroy()` + `awareness.destroy()` + `doc.destroy()`，并在 React `useEffect` cleanup 中执行；切换项目时尤其容易漏。理由：官方 issue 记录 provider 未销毁 awareness 会残留监听器导致进程无法退出（Node 侧）/内存增长。来源：[社区] https://github.com/ueberdosis/hocuspocus/issues/769
- **规则**：v3 服务端心跳就是 WebSocket ping：每 `timeout`（默认 30000ms）ping 一次，未收到 pong 即关闭连接（4408 Connection Timeout）；客户端 `messageReconnectTimeout` 默认 30s 判定断线。理由：源码 `ClientConnection.check()`；默认值在 `defaultConfiguration`。来源：[源码] https://cdn.jsdelivr.net/npm/@hocuspocus/server@3.4.4/src/ClientConnection.ts 、Hocuspocus.ts
- **规则**：Nginx 反代必须显式透传 upgrade：`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;`，并把 `proxy_read_timeout` 调到 **> 60s**（建议 120s）。理由：官方说明 Upgrade/Connection 是 hop-by-hop 头，不显式设置就不会转发；且默认 60s 无数据即断，会与 30s ping 打擦边。来源：[官方] https://nginx.org/en/docs/http/websocket.html
- **规则**：Nginx `location` 用独立 path（如 `/collab`）指向 Hocuspocus 端口，前端 `url = wss://<host>/collab`；不要复用 REST 的 `/api`。理由：Hocuspocus 的 WS 端点即根路径，混用会导致 upgrade 与普通 HTTP 路由互相抢。来源：[官方] https://tiptap.dev/docs/hocuspocus/server/examples （`server.on('upgrade', ...)` 自行接管）+ [社区] 部署经验。
- **规则**：监控三件事：`getDocumentsCount()` / `getConnectionsCount()`（官方方法）、`onStoreDocument` 失败率与耗时、单文档内存。理由：文档不卸载是这类服务最常见的泄漏形态，而官方在 2025–2026 修了多起卸载竞态。来源：[官方] server/usage（methods）；[社区] #954 / #995 / #1169（https://github.com/ueberdosis/hocuspocus/issues/1169 ，v4.7 卸载竞态，2026-11-19 修复）
- **规则**：升级前必读 upgrade guide 的 breaking 清单（v4：Headers、`onStoreDocument` 的 `context→lastContext`、`transactionOrigin` 结构化、`websocketOptions` 内移、CloseEvent 去掉 target/type）。理由：这些都是编译期或运行期静默失败点。来源：[官方] https://tiptap.dev/docs/hocuspocus/getting-started/upgrade

## 9. 给 TeamFlow 的落地结论

1. 依赖锁定：`@hocuspocus/server@3.4.4` + `@hocuspocus/provider@3.4.4` + `yjs@13.6.33` + `y-protocols@1.0.7`（Node 20）；若能升 Node 22，整体换 4.9.x 以获得预认证限额与 `flushDelay`。
2. 独立协作进程（1235 端口）+ Nginx `/collab`，documentName 固定 `project:<projectId>`，`onAuthenticate` 内查 Prisma 校验成员并写 `context`，viewer 设 `readOnly`。
3. Yjs 只存"看板布局层"：`taskId → { listId, pos }`；元数据留在 PostgreSQL；`onStoreDocument` 写二进制快照，并顺带投影 `task_positions` 供列表查询。
4. presence 只放 `user{id,name,color}`、`cursor`、`dragging{taskId}`，50–100ms 节流，拖拽软锁；不依赖 CRDT 的 LWW 判定"谁拖赢了"。
5. REST 写元数据后通过 `openDirectConnection().transact()` 注入实时层；禁止 REST 整表覆盖 Yjs 快照。
6. 上线前压测：重连风暴、`onStoreDocument` 注入失败、Redis 实例重启、Nginx 60s 空闲断连四种场景。
