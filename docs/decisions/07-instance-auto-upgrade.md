# 07 容器实例与自动升级（提案）

状态：**提案，尚未实现**（2026-11-19）

本文只描述自动升级的设计；当前代码里**手动升级已经实现**，自动升级留到后续。

---

## 1. 背景

### 1.1 沙箱、DO 与容器

- **WorkspaceDO**：控制面。持有文件、版本、快照指针、容器生命周期和配置。
- **Sandbox 容器**：真正的隔离运行时。Node、pnpm、Vite、生成代码都在这里执行。
- 容器通过 `scheduling_policy: durable_object` 绑定到 WorkspaceDO。

所以“沙箱就是 DO”并不准确：DO 是控制者，容器是被控制者。容器实例规格属于容器，不属于 DO 本身。

### 1.2 Wrangler 配置与运行期参数

Wrangler 的 `containers[].instance_type` 对 DO 管理的容器会报错：

```text
Unsupported fields for Durable Object-managed Containers: "instance_type"
```

但运行期 `container.start()` 支持 `instance` 参数：

```ts
container.start({
  image: container.images["base"],
  entrypoint: ENTRYPOINT,
  enableInternet: true,
  instance: "basic", // 或 "standard-1" / "standard-2"
});
```

当前实现已经使用这个参数：

| 档位 | vCPU | 内存 | 磁盘 |
|---|---|---|---|
| `basic` | 1/4 | 1 GiB | 4 GB |
| `standard-1` | 1/2 | 4 GiB | 8 GB |
| `standard-2` | 1 | 6 GiB | 12 GB |

- 新项目默认 `basic`
- 手动升级：`basic → standard-1 → standard-2`
- 最高 `standard-2`
- **不支持降级**（避免磁盘容量回退）
- 升级流程：快照 → destroy → 用新实例从快照启动
- 入口：工作区顶栏「升级」、`POST /api/projects/:id/instance/upgrade`、Agent 的 `upgrade_instance` 工具

### 1.3 当前问题

`basic` 对小型静态/React 项目通常够用，但以下情况会失败或很慢：

- 依赖安装或构建 OOM
- 构建时间接近 5 分钟超时
- 大项目磁盘占用接近 4 GB
- 复杂全栈项目在 1/4 vCPU 上构建过慢

用户不应手动盯着 build 日志判断实例是否不够。需要一套**有边界的自动升级**。

---

## 2. 目标与非目标

### 目标

1. 发生**硬性资源失败**时，自动升一级并重试一次，减少用户手动操作。
2. 升级有明确上限：最高 `standard-2`，不降级。
3. 升级前必须成功快照；快照失败则**不升级、不销毁容器**。
4. 升级必须可见：在对话/工作区显示“已升级到 standard-1 并重试”，不能静默增加成本。
5. 软压力（CPU 高但没失败）只提示，不自动升级。
6. 避免代码错误（TypeScript、语法错误）被误判为资源不足。

### 非目标

- 不自动降级。
- 不根据单次 CPU 峰值自动升级。
- 不替换现有手动升级入口。
- 不改 DO/容器调度架构。
- 不做跨项目实例池。

---

## 3. 决策（建议）

### 3.1 默认行为

- 每个容器项目保留一个 `auto_upgrade` 开关，默认 **开启**。
- 只对**硬失败**自动升级，且每个 Agent 回合最多升级一次。
- 升级后重试 build 一次；仍失败则停止自动升级，把完整日志返回给 Agent/用户。
- 软压力只产生 `recommendedTier` 和 UI 提示，不自动执行。

### 3.2 硬失败判定

满足任一条件：

| 信号 | 检测方式 |
|---|---|
| OOM kill | build 进程 `exitCode === 137`，或 `/sys/fs/cgroup/memory.events` 的 `oom_kill` 增加 |
| V8 heap OOM | stderr 包含 `JavaScript heap out of memory` |
| Linux OOM | stderr 包含 `Killed` 且进程非正常退出 |
| 构建超时 + CPU 饱和 | build 超时，且采样窗口内 `cpu.stat` 使用率 > 90% |
| 磁盘接近上限 | build 失败且 `statvfs` 可用空间低于阈值（例如 10%） |

不触发升级：

- `tsc` 类型错误
- 语法错误
- 依赖版本不存在
- 端口占用
- 代码逻辑错误

### 3.3 升级步进

```text
basic → standard-1 → standard-2
```

- 每次只升一级
- 同一回合最多一次
- 同一项目连续两次硬失败才提升到下一档？  
  **建议**：OOM/137 是强信号，第一次就升级；超时 + CPU 饱和需要连续两次才升级，避免误判。

### 3.4 升级流程

```text
build 开始
  → 记录 cgroup 基线（memory.events / cpu.stat / statvfs）
  → 执行 pnpm build
  → 读取结束值并分类失败
  → 若是硬失败，且 auto_upgrade 开启，且当前 < standard-2
      → takeSnapshot()
      → 快照失败：返回失败，不升级
      → 持久化新 tier + upgradeReason
      → container.destroy()
      → 从快照用新 instance 启动
      → 等待预览就绪
      → 重试 build 一次
      → 在结果中标记 upgradedTo / upgradeReason
  → 返回 build 结果
```

现有 `upgradeInstance()` 已经实现了快照、destroy、从快照启动，可直接复用；自动升级只是在 build 失败分类后调用它，并重试一次。

### 3.5 可见性

- build 工具返回值增加：

```json
{
  "exitCode": 0,
  "upgradedTo": "standard-1",
  "upgradeReason": "oom_killed",
  "buildAttempts": 2
}
```

- 对话中显示系统提示：`实例已从 basic 升级到 standard-1，正在重试构建`
- 顶栏显示当前 tier；升级后刷新
- `/meta` 增加：

```json
{
  "instanceTier": "standard-1",
  "instanceUpgrade": {
    "reason": "oom_killed",
    "upgradedAt": 1795000000000,
    "attempt": 1
  }
}
```

### 3.6 成本保护

- 最高 `standard-2`
- 每项目每天最多自动升级 2 次（可配置）
- 自动升级只由 build 工具触发，不在普通对话/预览时触发
- 软压力提示由用户确认后才升级
- 不降级

---

## 4. 资源采样

Cloudflare Container binding 的 `inspect()` 只返回 image/labels，没有实时 CPU/内存。采样在容器内完成。

### 4.1 cgroup v2 文件

| 指标 | 文件 |
|---|---|
| 当前内存 | `/sys/fs/cgroup/memory.current` |
| 内存上限 | `/sys/fs/cgroup/memory.max` |
| OOM 次数 | `/sys/fs/cgroup/memory.events`（`oom`, `oom_kill`） |
| CPU 累计 | `/sys/fs/cgroup/cpu.stat`（`usage_usec`） |
| CPU 压力 | `/sys/fs/cgroup/cpu.pressure` |
| 磁盘 | `statvfs("/workspace")` 或 `df` |
| 进程退出 | build 进程 `exitCode` / stderr |

### 4.2 采样策略

- build 前后各读一次（必须）
- 构建超过 60 秒时，每隔 15 秒读一次 CPU/内存
- 不在空闲时持续采样，避免额外唤醒/成本
- 采样只读 cgroup，不引入常驻进程

### 4.3 软压力阈值（建议）

- 内存持续 > 85% 超过 60 秒
- CPU 持续 > 90% 超过 120 秒
- 磁盘使用 > 85%

触发后只设置 `recommendedTier` 并显示提示，不自动升级。

---

## 5. 数据模型（建议）

### `atoms_project_config`

新增字段：

| 字段 | 说明 |
|---|---|
| `instance_tier` | 已有；`basic` / `standard-1` / `standard-2` |
| `auto_upgrade` | 是否允许硬失败自动升级，默认 1 |
| `upgrade_reason` | 最近一次升级原因 |
| `upgraded_at` | 最近一次升级时间 |
| `upgrade_count_today` | 当日自动升级次数 |
| `upgrade_day` | 计数所属日期 |

### `atoms_runtime_status`

新增字段：

| 字段 | 说明 |
|---|---|
| `last_oom_at` | 最近 OOM 时间 |
| `last_build_timeout_at` | 最近构建超时时间 |
| `recommended_tier` | 软压力建议档位 |
| `pressure` | 最近一次采样摘要（JSON 字符串） |

### 事件

建议在 Agent 消息流中发一条系统消息，而不是只写日志：

```text
实例升级：basic → standard-1（原因：构建 OOM），正在重试
```

这样前端和模型都能看到，不需要额外轮询。

---

## 6. UI

- 顶栏已有 tier badge 和「升级」按钮
- 增加：
  - 「自动升级」开关
  - 升级中状态
  - 升级成功/失败提示
  - 软压力提示：「构建接近资源上限，建议升级到 standard-1」
- 不弹阻塞式对话框；用顶栏 badge + 对话系统消息

---

## 7. Agent 行为

现有 `upgrade_instance` 工具保留。自动升级后：

- 不要求模型再次调用 `upgrade_instance`
- build 工具返回 `upgradedTo` / `buildAttempts`
- Prompt 规则：
  - 若 build 因 OOM/超时失败，优先让系统自动升级
  - 手动升级只作为兜底
  - 不得尝试降级

---

## 8. 测试计划

### 单元/集成

1. 失败分类：
   - exit 137 → OOM
   - `oom_kill` 增加 → OOM
   - timeout + CPU 90% → CPU
   - tsc 错误 → 不升级
2. 快照失败：不 destroy、不升级、返回错误
3. 已到 standard-2：不再升级，返回 `max`
4. 自动升级后 build 成功：返回 `upgradedTo`
5. 自动升级后 build 仍失败：不二次升级
6. 当日升级次数上限

### 本地

- 用可控的构建失败（例如人为 `node --max-old-space-size=64` 触发 OOM）验证分类和升级链路
- 验证升级后文件 marker、版本、预览、/data 数据保留

### 生产

- 仅在必须时做一次真实升级 smoke，避免频繁重建
- 验证 `instance` 参数和新档位实际生效（已手动验证 basic → standard-1 → standard-2）

---

## 9. 被否方案

| 方案 | 原因 |
|---|---|
| 所有项目固定 standard-2 | 成本高，绝大多数项目不需要 |
| CPU 一高就自动升级 | 构建天然 CPU-bound，误判多 |
| 自动降级 | 磁盘容量可能不足；用户明确不希望 |
| 在 Wrangler 配置写 `instance_type` | DO 管理的容器不支持 |
| 后台常驻监控进程 | 额外内存/复杂度；build 前后采样足够 |
| 把实例规格和 DO 绑定死 | 失去运行期动态升级能力 |

---

## 10. 实施顺序（建议）

**Phase 1：硬失败自动升级**

1. build 前后读取 cgroup 基线
2. 实现失败分类
3. 复用 `upgradeInstance()`，升级后重试一次
4. 返回 `upgradedTo` / `upgradeReason`
5. UI 系统消息 + 开关
6. 数据字段与每日上限

**Phase 2：软压力提示**

1. 构建期间采样 CPU/内存/磁盘
2. 写入 `recommendedTier`
3. UI 提示，不自动升级

**Phase 3（可选）：后台采样**

- 仅在明确需要时增加常驻监控，避免额外成本

---

## 11. 待确认问题

1. 自动升级默认开启还是关闭？
2. 超时 + CPU 饱和需要连续几次才升级？
3. 每日自动升级次数上限是多少？
4. 是否允许用户把上限锁在 standard-1？
5. 软压力提示是否需要邮件/外部通知？
6. 升级时是否要暂停正在进行的 Agent 回合，还是等本轮结束？

---

## 12. 当前代码状态

已实现：

- `instance` 参数启动容器
- 默认 `basic`
- 手动升级 basic → standard-1 → standard-2
- 不可降级
- 升级前快照，失败不升级
- 升级后从快照启动，数据保留
- 顶栏/API/Agent 工具入口
- browser runtime 返回结构化“不支持”

未实现：

- 自动失败分类
- build 后自动升级重试
- cgroup 采样
- 软压力提示
- 自动升级开关/每日上限

本文作为后续实现的依据；当前没有自动升级逻辑。
