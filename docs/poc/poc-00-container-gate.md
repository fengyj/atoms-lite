# POC-00 本地容器闸门

时间盒：**30 分钟**。这是唯一一个「不通过就暂停整条运行时泳道」的 PoC。

## 1. 要验证的假设

1. 本机能用 **Podman**（经 docker socket 兼容层）跑起 `wrangler dev` 的 Containers。
2. 本地启动 Containers **不需要** Workers Paid 订阅。
3. 拉起容器到 `Ready` 的耗时在可接受范围（< 60s）。

## 2. 不在范围内

- 不验证 sandbox 的文件 API、预览、快照。
- 不写任何业务代码。

## 3. 步骤

1. 安装 Docker 兼容引擎（若 Podman 不可用）：Colima 优先。
2. 取 `cloudflare/agents` 仓库里任一 sandbox 示例（或官方最小容器示例），**不修改代码**。
3. `wrangler dev` 启动，观察：
   - 是否要求登录 / 要求开通 Containers
   - 镜像构建或拉取是否成功
   - 容器是否真正启动（`docker ps` 可见）
4. 记录三个数字：首次镜像构建时间、后续启动时间、内存占用。

## 4. 通过标准

- [ ] `wrangler dev` 本地成功启动，容器处于 running
- [ ] 全程**未登录** Cloudflare 账号，或登录了但账号未开通 Containers，依然能起
- [ ] 启动耗时 < 60s（后续启动）
- [ ] Podman 与 Docker 二者中至少一条路径可用，并记录是哪条

## 5. Plan B

| 情况 | 处理 |
|---|---|
| Podman 不行 | 装 Colima，结论记为「Podman 不支持」，不继续折腾 |
| 本地需要 Paid | 立刻开通（$5）；记录为硬前置，排期整体后移 |
| 镜像拉取被墙/超时 | 用本地 Dockerfile 构建，不用 Cloudflare Registry 镜像 |
| 完全起不来 | **运行时泳道暂停**。评估退路：本地 Docker + 自写 adapter（工作量 +4~6h），或放弃沙箱改为「静态产物生成」 |

## 6. 产物

- 一段 10 行的结论：哪个引擎可用、是否需要付费、启动耗时。
- 不保留示例代码（`rm -rf spikes/poc-00-container-gate`）。

## 7. 风险

- 这是唯一可能改变整体技术选型的 PoC。**不要跳过，也不要延长**。
- 若结论是「必须付费」，这不是坏消息，只是排期调整；越早知道越好。

## 结论

**不通过（环境限制），Plan B 已明确。**

### 实施记录（2026-11-18）

Podman rootless 下无法跑通 `wrangler dev` 的 Containers。逐项结果：

| 环节 | 结果 |
|---|---|
| Podman 5.7 + Docker socket | ✅ 可用 |
| `WRANGLER_DOCKER_BIN=podman` + `DOCKER_HOST=<podman.sock>` | ✅ wrangler 接受 |
| 镜像构建（Dockerfile） | ✅ 成功（需 shim 过滤 `--provenance`、把 `-f -` 转为临时文件） |
| 拉取 Docker Hub 镜像 | ⚠️ 直连超时，走 `docker.m.daocloud.io` 镜像站成功 |
| egress sidecar（`cloudflare/proxy-everything`） | ❌ 启动 1 秒后退出 |
| `ctx.container.start()` | ❌ `running` 始终为 false，无容器被创建 |

关键错误链：

1. crun + cgroup v2：`cannot set memory swappiness` → 换 runc 解决
2. sidecar 缺权限：`setsockoptint: operation not permitted` → 手动加 `NET_ADMIN`/`NET_RAW` 可启动
3. 但在 wrangler 下 sidecar 仍启动即退出，主容器从未创建 → 无日志可查（容器被自动删除）

判断：**rootless Podman 缺少 wrangler 本地容器网络所需的权限/接口**，继续调参收益很低。

### 本机环境副作用（可回滚）

为这次验证改了三个用户级配置，若要还原：

```bash
rm -f ~/.config/containers/registries.conf.d/dockerhub-mirror.conf
rm -f ~/.config/containers/containers.conf
rm -f ~/.local/bin/runc
```

- `registries.conf.d/dockerhub-mirror.conf`：Docker Hub → daocloud 镜像（**建议保留**，本机直连不通）
- `containers.conf`：`runtime = runc`（技术栈）与 `default_capabilities` 追加 `NET_ADMIN`/`NET_RAW`
- `~/.local/bin/runc`：从 Ubuntu 包中解出的 runc 1.4.0（无 sudo 安装）

### Plan B

| 方案 | 代价 | 建议 |
|---|---|---|
| 安装 Docker Engine（`sudo apt install docker.io`，加入 docker 组） | 需要 sudo，5 分钟 | **推荐** |
| Colima / Docker Desktop | 需要先装 brew/VM，几十 MB~GB | 次选 |
| rootful Podman（`sudo podman` + rootful socket） | 需要 sudo；配置更绕 | 不推荐 |
| 放弃本地容器，直接用远端预览 | 每次改动都要部署，迭代极慢 | 不可接受 |

注意：即使换 Docker，**Docker Hub 直连仍然不通**，镜像站配置需要保留（或打开 VPN）。

### 对后续 PoC 的影响

- POC-02 / 03 / 04 全部阻塞，直到容器可用。
- POC-01（UI）、POC-05（模型）、POC-06（SDK 审计）、POC-07（可观测性）不受影响，继续推进。
