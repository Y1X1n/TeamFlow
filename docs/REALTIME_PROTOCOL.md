# TeamFlow 实时协作协议（v1.1）

> 组件与版本（**整组锁定，禁止浮动**）：`@hocuspocus/server@3.4.4`、`@hocuspocus/provider@3.4.4`、`yjs@13.6.33`、`y-protocols@1.0.7`。不选 v4：发布仅数月且 2026-11 仍有卸载竞态修复，MVP 优先稳定性；v2 已停止维护。
>
> 拓扑：Hocuspocus 作为**独立 HTTP/WS 服务（端口 1235）**由 API 进程引导启动，**不与 NestJS HTTP 共享端口/upgrade**。开发直连 1235，生产经 Nginx `/collab` 代理。文档是 PostgreSQL 的**只读内存投影**，不持久化 Yjs 二进制。

## 1. 连接

| 项         | 值                                                                                    |
| ---------- | ------------------------------------------------------------------------------------- |
| URL        | 开发 `ws://localhost:1235`；生产 `wss://{domain}/collab`（Nginx → `api:1235`）        |
| 文档名     | `project:{projectId}`；格式校验（前缀 + 合法 ID）后才允许加载                         |
| 认证       | Hocuspocus `token`（provider 的 `token` 选项 / Authentication 消息），值为 Access JWT |
| 超时       | 认证 5s；服务端 ping 30s（无 pong 断开，v3 关闭码 4408）；空闲连接 120s 回收          |
| 客户端权限 | **所有连接** `readOnly: true`，仅允许发送 Awareness；文档更新由服务端写入             |
| 多标签页   | 允许；presence 展示按 `userId` 去重                                                   |

### 1.1 认证流程

```
Client                          Hocuspocus onAuthenticate
  │ connect(documentName, token)       │
  │────────────────────────────────────►│
  │                                     │ 1. 解析 project:<id>，格式非法 → throw
  │                                     │ 2. 校验 JWT 签名/issuer/audience/过期
  │                                     │ 3. 查 User 存在
  │                                     │ 4. 查 Project 存在且未删除
  │                                     │ 5. 查 ProjectMember（任意角色）
  │◄────────────────────────────────────│ 6. 返回 context { userId, projectId }
  │                                     │    + data.connection.readOnly = true
```

- 失败一律在 `onAuthenticate` 中 **throw**（唯一正确姿势），不先建连接再踢。
- `documentName` 完全由客户端构造，必须校验且禁止"惰性建任意文档"（防止内存耗尽攻击）。
- **Token 过期**：`beforeHandleMessage` 比对 `context.tokenExpiresAt`，过期则关闭连接（4410）；客户端先刷新 Access Token 再重连。
- **成员移除/角色变更**：API 发布 `project.member.changed`，实时层复核连接，失效者在 5s 内以 4403 断开。
- 项目归档：允许观看（只读），REST 写操作由 API 拒绝。
- 权限判定（能否拖动）由 REST 的 `PermissionGuard` 负责；WS 层只校验"是否成员"，不重复实现细粒度权限。

## 2. Yjs 文档结构（只读投影）

```ts
// 服务端权威文档；客户端不可写
doc
  .getMap('board') // Y.Map
  .get('tasks') //   Y.Map<taskId, TaskPosition>
  .get('columns') //   Y.Map<columnId, ColumnPosition>
  .get('meta'); //   Y.Map: { schemaVersion: 1, lastEvent?: {...} }

type TaskPosition = { columnId: string; position: string; updatedAt: number };
type ColumnPosition = { position: string; updatedAt: number };
```

### 2.1 加载与生命周期

- `onLoadDocument`：按 `projectId` 查询 `board_columns` + 未删除 `tasks`，新建 `Y.Doc` 并填充；**不读取任何 Yjs 快照**。
- **不注册 `onStoreDocument`**：不持久化 `Y.encodeStateAsUpdate`，不建快照表。数据库已包含全部事实。
- 文档在最后一个连接断开后卸载；下次连接重新从 DB 构建（≤1000 任务，毫秒级）。
- `meta.schemaVersion` 仅用于排障；结构不兼容升级时直接重建文档。
- 文档中禁止存放任务标题/负责人/评论/文件名/邮箱等元数据或敏感信息。

### 2.2 单一写入方向

```
REST 事务提交（PostgreSQL 为事实源）
  → Redis 发布 board-events
  → 实时层 openDirectConnection(`project:{id}`, context).transact(...)
  → Hocuspocus 广播 Yjs 更新
```

- **禁止**从 Yjs 文档/awareness 反写数据库；禁止 REST 侧"读文档整表覆盖"。
- 服务端注入必须使用官方 `openDirectConnection().transact()`，保证 hook 链与广播正常运行。
- 事件应用失败：重试 3 次后记录 error 指标；下一位客户端重连/加载时自动从 DB 纠正。
- 任务/列已不存在时，事件为幂等的 no-op（删除不存在的键不报错）。

## 3. Presence（Awareness）

客户端 `awareness.setLocalStateField` 仅允许以下字段：

```ts
type Presence = {
  userId: string; // 必填；必须与连接 context.userId 一致
  draggingTaskId: string | null; // 正在拖拽的任务（软锁提示）
  selectedTaskId: string | null; // 已打开任务抽屉
  updatedAt: number;
};
```

- 昵称、头像、颜色**不放入 awareness**；客户端用 `/board` 返回的成员列表按 `userId` 解析；颜色由 `hash(userId) % palette.length` 稳定生成。
- 服务端将 awareness 视为**公开提示通道**：v3 的 `onAwarenessUpdate` 会收到文档内所有客户端状态，无法可靠归属到当前连接，因此不做连接级断言（避免误杀与进程崩溃）。安全边界是只读文档与 REST 权限；客户端忽略成员列表之外的 `userId`，presence 不参与任何授权判断。
- 节流：拖拽/选中变化 ≥50ms 一次（≤20 次/秒）；每次 awareness 会编码整份 state 并广播，禁止绑定 `mousemove`。
- 清理：y-protocols 30s 无心跳标记过期；连接关闭时服务端 `removeAwarenessStates`；客户端卸载时主动清空。
- `draggingTaskId` 仅用于 UI 软锁（其他用户看到"XX 正在拖动"并禁用该卡拖拽），**不参与业务判定**。

## 4. 服务端内部事件（Redis）

频道：`teamflow:board-events`（发布/订阅；MVP 单实例仍使用，便于横向扩展）。

```jsonc
{
  "v": 1,
  "eventId": "01J...", // ULID，用于日志与去重
  "projectId": "clp_xxx",
  "type": "task.moved",
  "occurredAt": "2026-11-22T10:05:00.000Z",
  "payload": { "...": "..." },
}
```

| type                     | 触发              | 注入 Yjs 的 payload                                       |
| ------------------------ | ----------------- | --------------------------------------------------------- |
| `task.created`           | 创建任务          | `{ taskId, columnId, position }`                          |
| `task.moved`             | 移动任务          | `{ taskId, columnId, position, completedAt }`             |
| `task.updated`           | 字段更新          | `{ taskId }`（写入 `meta.lastEvent`，客户端刷新详情缓存） |
| `task.deleted`           | 删除任务          | `{ taskId }`                                              |
| `column.created`         | 新建列            | `{ columnId, position }`                                  |
| `column.updated`         | 改名/完成态       | `{ columnId }`（写入 `meta.lastEvent`）                   |
| `column.moved`           | 列排序            | `{ columnId, position }`                                  |
| `column.deleted`         | 删除列            | `{ columnId }`                                            |
| `project.member.changed` | 成员移除/角色变更 | `{ projectId, userId? }`                                  |

处理规则：

1. 实时层订阅频道，过滤非本进程负责的项目（单实例即全部）。
2. 通过 `openDirectConnection(documentName, { source: 'redis-bridge' })` 获取连接并 `transact`；完成后 `disconnect({ unloadImmediately: false })` 避免频繁重建（无人连接时文档自然卸载）。
3. 事件乱序无需特别处理：payload 携带完整目标状态（columnId+position），重复应用幂等；最终以 DB 为准。
4. 元数据类事件（`task.updated`、`column.updated`）写入 `meta.lastEvent`；客户端观察到变化后使对应查询缓存失效（500ms 节流）。
5. 客户端不消费 Redis，只接收 Yjs 更新。

## 5. 客户端流程

### 5.1 建立连接

```
1. GET /projects/{id}/board 渲染基线（含列/任务/成员/我的权限）
2. new HocuspocusProvider({ url, name: `project:${id}`, token: accessToken })
3. onSynced → 应用 doc 位置（覆盖基线位置；元数据仍来自 REST）
4. awareness.setLocalStateField('presence', { userId, draggingTaskId: null, selectedTaskId: null, updatedAt: Date.now() })
5. 每 30s 更新 updatedAt（心跳）；页面隐藏时暂停
6. useEffect cleanup: provider.destroy() → awareness.destroy() → doc.destroy()
```

### 5.2 拖拽（乐观 + 收敛）

```
onDragStart: awareness.draggingTaskId = taskId
onDragEnd:
  快照本地状态 → 乐观更新（立即显示）
  PATCH /tasks/{id}/move
    成功 → 等待 WS doc 更新；2s 未收到则重新拉取 /board
    失败 → 回滚快照 + toast（403/409/网络错误）
收到 doc 更新:
  与本地乐观值比较（taskId/columnId/position 三元组）；不同则以 doc 为准
onDragEnd 后: 清除 draggingTaskId（无论成败）
```

- 不依赖 CRDT 的 LWW 结果做业务判断；同一任务被并发拖动时以最后到达的 doc 更新为准，UI 不弹冲突框。
- 其他用户拖拽中的卡片显示软锁提示，不允许同时拖拽（尽力而为；最终仍由服务端顺序决定）。

### 5.3 断线与重连

- 指数退避：1s、2s、4s、8s、16s、30s（上限），±20% 抖动；页面隐藏时暂停，恢复时立即重试一次。
- 断线期间看板使用 TanStack Query 每 10s 轮询 `/board`；REST 写操作不受影响。
- 重连成功：`onSynced` 以服务端文档为准，并后台重新拉取 `/board` 校准元数据。
- 认证失败（`onAuthenticationFailed`）：刷新 Token 重试一次，仍失败跳登录。
- 连续 5 次失败：显示"实时连接已断开，正在重试"横幅。

## 6. 关闭码与错误

| 关闭码 | 含义                         | 客户端行为             |
| ------ | ---------------------------- | ---------------------- |
| 1000   | 正常关闭                     | 不重连                 |
| 4408   | 心跳超时（v3 默认）          | 指数退避重连           |
| 4410   | Token 过期（服务端主动关闭） | 刷新 Token 后重连      |
| 4403   | 成员被移除/身份不一致        | 停止重连，跳转项目列表 |
| 4404   | 项目不存在/已删除            | 停止重连，跳转项目列表 |
| 1011   | 服务端内部错误               | 指数退避重连           |

认证失败以 provider 的 `onAuthenticationFailed` 事件为准（Hocuspocus 默认拒绝路径可能返回 4401）；客户端按上述策略处理，不硬编码单一关闭码。

## 7. 安全要求

1. `onAuthenticate` 完成 JWT + 用户 + 项目 + 成员四重校验；未认证连接不得加载文档。
2. 所有客户端强制 `readOnly: true`；伪造的 update 消息被 Hocuspocus 丢弃（`syncStatus(false)`），前端需提示只读状态。
3. Awareness 字段白名单；`userId` 仅用于客户端展示解析，presence 属于公开提示通道，不作为鉴权依据；昵称/头像/颜色由 REST 成员数据解析。
4. 文档名格式校验；禁止任意文档名触发建文档。
5. 注意：v3 的钩子抛错不会被 Hocuspocus 捕获，可能导致进程退出；除 `onAuthenticate` 外，钩子内不得抛错，过期连接通过定时器关闭。
6. Nginx：`/collab` 仅允许 Upgrade 请求；单 IP 并发连接上限 20；不在文档/awareness 中放置敏感数据。
7. 项目删除：关闭该文档所有连接，清理内存文档。

## 8. Nginx 参考配置

```nginx
upstream teamflow_realtime {
    server api:1235;
    keepalive 32;
}

location /collab {
    proxy_pass http://teamflow_realtime;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
}
```

## 9. 运维与压测

- 指标：`ws_connections`、`ws_documents`（getDocumentsCount）、`ws_auth_failures_total`、`ws_doc_load_ms`、`board_broadcast_latency_ms`（Redis 发布→注入完成）。
- 内存关注：文档是否在最后一个连接断开后卸载（Hocuspocus v3 存在历史卸载竞态，锁定 3.4.4 并回归"断开后重连"用例）。
- 优雅停机：`SIGTERM` 时先 `server.destroy()` 关闭连接并停止接收，再关闭 Redis/Prisma 连接退出。
- 压测场景：40 个并发连接（2 项目 × 20）、每 2s awareness、每 5s 移动任务；验收广播 P95 ≤500ms。
- 故障演练：realtime 端口不可用（前端轮询兜底）、Redis 重启（事件丢失，重连拉基线）、Token 过期（4410 重连）、成员被移除（4403）。

## 10. 版本升级规则

- 整组升级 `server/provider/yjs/y-protocols`，一次 PR；先阅读 Hocuspocus upgrade guide 的 breaking 清单。
- 回归用例：认证失败、只读用户、拖拽广播、断线重连、成员移除、Token 过期、文档卸载后重连。
- 禁止单独升级 `yjs` 或 provider 造成 peer 版本漂移。
