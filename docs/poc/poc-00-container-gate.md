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

**通过（Docker 路径）。** 本地容器可用，不需要开通 Workers Paid。

### 最终结果（2026-11-18）

```json
{
  "ok": true,
  "running": true,
  "startedInMs": 1597,          // 冷启动
  "hostname": "1f6182329556",
  "stateText": "persisted-at-1795000352",
  "image": "cloudflare-dev/sandbox-base-03dec61db8d1:ae004255"
}
```

| 指标 | 数值 |
|---|---|
| 冷启动（含容器创建 + exec 就绪） | ~1.6s |
| 热调用（容器已运行） | ~230ms |
| 主容器内存 | 1.7 MiB |
| egress sidecar 内存 | 9.3 MiB |
| 主容器 + sidecar | 均正常 Up |

### 环境前置（已在本机完成）

1. **Docker Engine** 29.1.3（`apt install docker.io`），手动启动，不设开机自启。
2. **buildx 插件**：Ubuntu 的 `docker.io` 不带，缺了会回退 legacy builder 并报
   `unknown flag: --provenance`。无需 sudo 的装法：
   `apt-get download docker-buildx` → `dpkg -x` → 拷到 `~/.docker/cli-plugins/`。
3. **镜像站**：`/etc/docker/daemon.json` 配 `docker.m.daocloud.io`（Docker Hub 直连不通）。
4. **socket 权限**：账号已在 `docker` 组，但已运行的 shell/agent 进程不会重新读取组，
   临时用 `sudo chown eric /var/run/docker.sock`；长期方案是从新登录的 shell 启动。

### 四个关键发现

1. **`setInactivityTimeout()` 必须显式设置。**
   不设置时，实例在两次请求之间就被回收：第二次调用拿到的是**新容器**（hostname 变化、文件丢失）。
   设置 5 分钟后，三次连续调用 hostname 与文件内容都保持一致。
   → 直接影响 POC-03：不设超时，所谓"持久化"是假的。

2. **`start()` 必须先判断 `running`。**
   重复调用会抛 `start() cannot be called on a container that is already running.`

3. **配置必须用 DO 调度策略 + `images` map。**
   ```
   containers[0] = { class_name, scheduling_policy: "durable_object",
                     images: { base: { dockerfile } } }
   ```
   代码里用 `container.images["base"]` 作为 `start({ image })`。
   默认策略下 `ctx.container.start()` 不会真正启动（`running` 恒为 false）。

4. **egress sidecar 是固定组件。**
   `cloudflare/proxy-everything` 承担出站拦截（对应 `interceptOutboundHttp`），
   且需要 `NET_ADMIN`/`NET_RAW`；rootless Podman 给不了，所以那条路走不通。
   wrangler **不使用 docker compose**，它直接调 Docker CLI/API 动态编排（容器名带 session 哈希，用完即删）。

### Podman 负结果（保留备查）

| 环节 | 结果 |
|---|---|
| Podman 5.7 + Docker socket | ✅ |
| `WRANGLER_DOCKER_BIN=podman` | ✅ |
| 镜像构建 | ✅（需 shim 过滤 `--provenance`、把 `-f -` 转临时文件） |
| 拉取 Docker Hub | ⚠️ 需镜像站 |
| egress sidecar | ❌ `setsockoptint: operation not permitted`；加 caps 可手动启动，但 wrangler 下仍启动即退出 |

### 本机环境副作用

- `~/.docker/cli-plugins/docker-buildx`（buildx 0.30.1）
- `/etc/docker/daemon.json`（镜像站）
- `~/.local/bin/runc`、`~/.config/containers/containers.conf`（Podman 时代的，可删）
- `~/.local/bin/runc` / Podman 配置不再需要；`spikes/poc-00-container-gate/bin/docker` 也已无用

### 对后续 PoC 的影响

- POC-02 / 03 / 04 解除阻塞。
- POC-03 需要把「setInactivityTimeout + 快照」作为首要验证点。
