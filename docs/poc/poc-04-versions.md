# POC-04 版本与回滚

时间盒：**2 小时**。依赖 POC-03。

## 1. 先统一概念（上一轮讨论的结论）

| 对象 | 职责 | 不负责 |
|---|---|---|
| **git commit** | 版本的内容（源码真相） | 持久化、查询、跨项目 |
| **R2 快照** | 崩溃恢复、容器重建 | 用户可见的版本切换 |
| **versions 记录（一行元数据）** | 列表渲染、来源追溯、状态、级联 | 存源码 |

关键约束（**D2：只回滚代码**）：

> 版本切换 = 在当前工作区 `checkout` 某个 commit，**数据库不动**。
> 不能用「恢复整个快照」来实现版本切换，否则会连带回滚数据。

## 2. 要验证的假设

1. 在一个运行中的沙箱工作区内，能可靠地产生 commit、切换 commit、从旧版本继续。
2. 版本列表在**容器已停止**时仍能渲染（只查元数据，不唤醒容器）。
3. 代码回滚后，应用数据保持不变，且旧代码在新数据上不会直接崩（失败时有明确提示）。
4. 回滚不产生历史改写（禁止 `reset --hard` 丢提交）。

## 3. 数据模型（最小）

```
versions
  id            主键
  project_id
  commit        git hash
  parent_id     上一个版本（可空，首次生成）
  session_id
  message_id    哪条消息产生的
  status        draft | verified | failed
  summary       一句话，给 UI 显示
  created_at
```

git tag 可选，**不作为主键**，也不作为对外承诺。

## 4. 步骤

1. 工作区初始化 git，首次提交后写入 version 行。
2. 做一次修改 → 再次提交 → 验证 `parent_id` 链正确。
3. 停止容器 → **只读 versions 表**渲染列表（不调用任何沙箱 API）。
4. 恢复容器 → `checkout` 到旧 commit → 验证：
   - 文件回到旧状态
   - SQLite 数据**未**回滚
   - 应用能启动；若因 schema 不兼容启动失败，UI 给出明确错误
5. 从旧版本继续修改 → 产生新 commit（不是 reset，不是 amend）。

## 5. 通过标准

- [ ] 版本列表在容器停止时可渲染，耗时 < 200ms
- [ ] `parent_id` 链正确，能画出线性历史
- [ ] 切换版本后文件内容与目标 commit 一致（用 `git diff` 验证为空）
- [ ] 切换版本后 DB 行数不变
- [ ] 从旧版本继续产生**新** commit，历史长度 +1，未改写
- [ ] 回滚失败时（例如工作区脏）有明确错误，不静默处理

## 6. Plan B

| 失败点 | 降级 |
|---|---|
| 容器内 git 操作不稳定 | 版本改用「文件树归档 + 内容哈希」，git 只做辅助 |
| checkout 失败（脏工作区） | 先自动提交为临时 checkpoint，再 checkout |
| schema 不兼容导致应用崩 | 版本切换后自动尝试一次 `build`，失败则提示「此版本与当前数据不兼容」 |
| 时间不够 | 只做「列表 + 回滚到上一版」，不做任意版本跳转 |

## 7. 产物

- 版本状态的迁移规则（什么时候写 `draft` / `verified` / `failed`）
- 回滚流程的伪代码（含失败分支）
- spike 删除：`rm -rf spikes/poc-04-versions`

## 8. 风险

- 「只回滚代码」意味着**旧代码 + 新数据**的组合天然可能崩。这不是 bug，是产品语义；但必须在 UI 上表达清楚，否则会被当成缺陷。
- 不要在版本切换时复用旧快照；快照只服务于「容器重建」。
- 版本行写入必须与 commit 在同一轮操作里完成，避免出现「有 commit 无版本」的孤儿。

## 结论

**通过。** 版本列表、代码回滚、数据不回滚、从旧版本分叉，全部符合预期。

### 实测结果（2026-11-18）

| 验证项 | 结果 |
|---|---|
| 版本产生 | ✅ `git commit` 与元数据行一一对应（`ver_1`→`ver_2`→`ver_3`） |
| 容器停止时列表可渲染 | ✅ `containerRunning: false`，查询 0ms，总耗时 33ms，**未唤醒容器** |
| 回滚只回代码 | ✅ 文件 `hello v2` → `hello v1`；`data/state.txt` 内容不变 |
| 回滚不改写历史 | ✅ 历史从 2 条变 3 条，新增 `rollback to ver_1` 提交 |
| 从旧版本继续 | ✅ 新提交 parent 指向 `ver_2`，`parentCommitMatches: true`，4 条历史全部保留 |

版本链：

```
ver_1 (parent=null)
  └─ ver_2 (parent=ver_1)
       ├─ ver_3 (parent=ver_2)  回滚到 ver_1，但作为新提交
       └─ ver_4 (parent=ver_2)  从 ver_2 分叉
```

### 快照体积与耗时（补测）

| 工作区 | 快照大小 | 耗时 |
|---|---|---|
| 空（alpine/git 基础镜像） | 36 MB | 468ms |
| + 200 MB 数据 | 236 MB | 4.9s |

结论：**快照速度约 40 MB/s**。按此推算：

| node_modules 规模 | 预计快照耗时 |
|---|---|
| 300 MB | ~7s |
| 500 MB | ~12s |
| 1 GB | ~25s |

这决定了快照只能发生在**空闲停止 / 显式停止 / 高风险操作前**，并且 UI 必须给进度提示。

### 四个实现坑（已踩）

1. **`commit` 是 SQLite 保留字**，建表直接报 `near "commit": syntax error`。
   列名要写 `git_commit`（`order`、`group` 同理）。
2. **`alpine/git` 的 ENTRYPOINT 是 `git`**，`CMD ["sleep","infinity"]` 会被拼成
   `git sleep infinity`，容器进入重启循环。必须在 Dockerfile 里写 `ENTRYPOINT []`。
3. **`git checkout <commit> -- .` 只恢复已跟踪文件**，不会删除"后来新增"的文件。
   要彻底回滚需配合 `git clean`，但它会连未跟踪的应用数据一起删——必须按路径白名单清理。
4. **分叉默认是 detached HEAD**，提交不在任何分支上。
   产品实现应改为 `git switch -c fork/<versionId> <commit>`，否则依赖 reflog 才找得回来。

### 对主设计的影响

- 版本元数据表结构确认：`id / git_commit / parent_id / summary / status / created_at`。
- 「容器睡着时渲染版本列表」成立，且成本可忽略（33ms）。
- 回滚 = 新提交，`reset --hard` 永远不出现。
- 快照要按体积做预算，基础镜像越小越好（36MB vs 80MB 的差距会翻倍到快照耗时上）。

### Plan B（未触发）

| 失败点 | 降级 |
|---|---|
| 容器内 git 不稳定 | 版本改为「文件树归档 + 内容哈希」，git 只做辅助 |
| checkout 残留文件 | 按白名单 `git clean -fd <paths>`，绝不整目录清理 |
| 分叉丢失 | 全部改为创建命名分支 |
