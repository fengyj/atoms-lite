/**
 * 工作台与 Worker 的真实接线层。
 *
 * 接口：
 * - Agent 类名 `ChatAgent`，实例名 = 项目 ID
 * - 项目索引：GET/POST `${host}/api/projects`，GET `${host}/api/projects/:id`
 * - 项目能力：`${host}/api/projects/:id/versions|files|preview/status`
 * - 预览：`${host}/previews/:id/`
 * - 会话页：`/sessions/:id`（静态导出只有一个 shell，Worker 复用）
 */
import { useCallback, useEffect, useState } from "react";

export const WORKER_HOST =
  process.env.NEXT_PUBLIC_WORKER_HOST ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8787" : "");

export const AGENT_CLASS = "ChatAgent";

export function workerUrl(path: string): string {
  return `${WORKER_HOST}${path}`;
}

export function projectApiUrl(projectId: string, path = ""): string {
  return workerUrl(`/api/projects/${encodeURIComponent(projectId)}${path}`);
}

export type AgentErrorInfo = {
  title: string;
  hint: string;
  detail: string;
};

function describeErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const extra = error as Error & {
      cause?: unknown;
      statusCode?: number;
      responseBody?: unknown;
    };
    const lines = [`${error.name}: ${error.message}`.trim()];
    if (extra.statusCode) lines.push(`status: ${extra.statusCode}`);
    if (extra.responseBody !== undefined) {
      lines.push(
        `response: ${
          typeof extra.responseBody === "string"
            ? extra.responseBody
            : JSON.stringify(extra.responseBody)
        }`,
      );
    }
    if (extra.cause !== undefined && extra.cause !== null) {
      lines.push(
        `cause: ${
          extra.cause instanceof Error
            ? `${extra.cause.name}: ${extra.cause.message}`
            : typeof extra.cause === "string"
              ? extra.cause
              : JSON.stringify(extra.cause)
        }`,
      );
    }
    if (error.stack) lines.push(error.stack);
    const text = lines.filter(Boolean).join("\n");
    return text || String(error) || "未知错误（没有错误信息）";
  }
  if (typeof error === "string") return error || "未知错误（空字符串）";
  try {
    return (
      JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2) ||
      String(error) ||
      "未知错误（空对象）"
    );
  } catch {
    return String(error) || "未知错误";
  }
}

/**
 * 把底层错误转成用户能理解的分类。
 * 不在这里吞掉原始信息：detail 保留给“技术细节”展开。
 */
export function describeAgentError(error: unknown): AgentErrorInfo {
  const detail = describeErrorDetail(error);
  const lower = detail.toLowerCase();

  if (
    lower.includes("daily_token_limit") ||
    detail.includes("额度已用完") ||
    detail.includes("今日模型额度")
  ) {
    return {
      title: "今日模型额度已用完",
      hint: "额度恢复后可以继续；当前项目的内容和版本都已保存。",
      detail,
    };
  }
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("stall") ||
    lower.includes("aborted")
  ) {
    return {
      title: "模型响应超时",
      hint: "这次请求等待太久没有完成。可以直接重试；如果会话很长，先让我压缩上下文会更快。",
      detail,
    };
  }
  if (
    lower.includes("no output") ||
    lower.includes("nooutput") ||
    lower.includes("empty") ||
    lower.includes("did not return") ||
    lower.includes("no object generated")
  ) {
    return {
      title: "模型没有返回内容",
      hint: "可能是上下文过长或模型服务波动。点重试会带上明确指令；反复出现时可以新建会话或压缩上下文。",
      detail,
    };
  }
  if (
    lower.includes("upstream_unavailable") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("503")
  ) {
    return {
      title: "模型服务暂时不可用",
      hint: "上游模型服务暂时不可用，通常几分钟内恢复。可以直接重试；如果持续失败，稍后再试。",
      detail,
    };
  }
  if (
    lower.includes("context") ||
    lower.includes("maximum") ||
    lower.includes("too many tokens") ||
    lower.includes("token limit")
  ) {
    return {
      title: "上下文过长",
      hint: "会话历史已经很长。建议先让我压缩上下文，或新建一个会话继续。",
      detail,
    };
  }
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("econn") ||
    lower.includes("socket")
  ) {
    return {
      title: "网络连接失败",
      hint: "浏览器到服务端的连接中断了。检查网络后直接重试。",
      detail,
    };
  }
  return {
    title: "模型调用失败",
    hint: "这次请求没有完成。可以直接重试；如果反复失败，展开技术细节查看原因。",
    detail,
  };
}

/** 预览 iframe 指向的地址 */
export function previewUrl(projectId: string): string {
  return workerUrl(`/previews/${encodeURIComponent(projectId)}/`);
}

export const PROJECTS_URL = workerUrl("/api/projects");

export type ProjectVersion = {
  id: string;
  gitCommit: string;
  summary: string;
  createdAt: number;
};

export type TemplateId = "static" | "react-vite" | "fullstack-hono";

export type TemplateSource = "rule" | "model" | "manual" | "fallback";
export type ProjectNameSource = "derived" | "ai" | "user" | "fallback" | "legacy";
export type RuntimeKind = "container" | "browser";
export type TemplateChoice = "auto" | TemplateId;

export type ProjectSummary = {
  id: string;
  name: string;
  prompt: string;
  template: TemplateId;
  runtime: RuntimeKind;
  templateSource: TemplateSource;
  nameSource: ProjectNameSource;
  planReason: string;
  configured: boolean;
  createdAt: number;
  updatedAt: number;
  versionCount: number;
  currentVersion: ProjectVersion | null;
  published: boolean;
  publishedVersionId: string | null;
  deploymentUrl: string | null;
};

/** GET /api/projects/:id/versions 的条目 */
export type WorkspaceVersion = ProjectVersion & {
  parentId: string | null;
  status: string;
  archived?: boolean;
  current: boolean;
  hasArtifacts?: boolean;
  published?: boolean;
  deploymentUrl?: string | null;
  domainError?: string | null;
};

/** GET /api/projects/:id/files 的条目 */
export type WorkspaceFileEntry = {
  path: string;
  type: string;
  size?: number;
};

/** 文件列表响应：默认来自 DO 缓存，running=false 时不启动容器 */
export type WorkspaceFileListing = {
  entries: WorkspaceFileEntry[];
  running: boolean;
  cachedAt: number;
  configured?: boolean;
};

export type PreviewStatus = {
  running: boolean;
  ready: boolean;
  configured?: boolean;
};

export type WorkspaceMeta = {
  template: TemplateId;
  runtime: RuntimeKind;
  configured: boolean;
  instanceTier: string;
  migration: {
    active: boolean;
    sourceTemplate?: string;
    targetTemplate?: string;
    files?: number;
    bytes?: number;
  } | null;
  snapshotError: string | null;
  snapshotAt: number | null;
  versionCount: number;
  currentVersion: ProjectVersion | null;
  published: boolean;
  publishedVersionId: string | null;
  deploymentUrl: string | null;
  designStatus?: string;
  designId?: string | null;
  requirementsStatus?: string | null;
};

export type RequirementsBrief = {
  audience: string;
  job: string;
  mustHave: string[];
  constraints: string[];
  success: string[];
  visual: string[];
  nonGoals: string[];
  summary: string;
};

export type WorkspaceRequirements = {
  status: string;
  brief: RequirementsBrief;
  markdown: string;
  updatedAt: number;
};

export type WorkspaceDesign = {
  id: string;
  title: string;
  thesis: string;
  palette: string;
  status: string;
  files: number;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceDesignListing = {
  status: string;
  selectedId: string | null;
  requirementsStatus: string | null;
  designs: WorkspaceDesign[];
};

export type UsageTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  noCacheTokens: number;
  reasoningTokens: number;
  costUsd: number | null;
};

export type UsageDay = UsageTotals & { day: string };

export type ProjectUsage = {
  project: UsageTotals;
  session: UsageTotals;
  today: UsageTotals;
  daily: UsageDay[];
  systemToday: UsageTotals & { day: string };
  limit: {
    dailyTokens: number;
    usedTokens: number;
    dailyCostUsd: number;
    usedCostUsd: number;
    reserveCostUsd: number;
    remainingCostUsd: number;
    allowed: boolean;
  };
};

export type UsageStatus = UsageTotals & {
  day: string;
  usedTokens: number;
  tokenLimit: number;
  allowed: boolean;
  costLimitUsd: number;
  costReserveUsd: number;
  remainingCostUsd: number;
};

type ProjectsResponse = { projects?: ProjectSummary[] };
type ProjectResponse = { project?: ProjectSummary };
type VersionsResponse = { versions?: WorkspaceVersion[] };

async function json<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    if (text.trim()) {
      try {
        const body = JSON.parse(text) as {
          error?: unknown;
          message?: unknown;
        };
        if (typeof body.message === "string" && body.message.trim()) {
          detail = body.message.trim();
        } else if (typeof body.error === "string" && body.error.trim()) {
          detail = body.error.trim();
        }
      } catch {
        detail = text.trim();
      }
    }
    throw new Error(
      detail
        ? `${detail.slice(0, 500)}（HTTP ${res.status}）`
        : `${label} 请求失败（HTTP ${res.status}）`
    );
  }
  return (await res.json()) as T;
}

export async function fetchProjects(
  signal?: AbortSignal
): Promise<ProjectSummary[]> {
  const res = await fetch(PROJECTS_URL, { signal });
  return (await json<ProjectsResponse>(res, "projects")).projects ?? [];
}

export async function fetchProject(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectSummary> {
  const res = await fetch(projectApiUrl(projectId), { signal });
  const project = (await json<ProjectResponse>(res, "project")).project;
  if (!project) throw new Error("project not found");
  return project;
}

export type WorkspaceDeployment = {
  id: string;
  versionId: string;
  status: "deploying" | "ready" | "failed";
  url?: string | null;
  worker?: string;
  d1?: string | null;
  schemaVersion?: string | null;
  domainError?: string | null;
  error?: string | null;
};

export type WorkspaceArtifacts = {
  prepared: boolean;
  files: number;
};

export async function prepareVersionArtifacts(
  projectId: string,
  versionId: string,
  signal?: AbortSignal
): Promise<WorkspaceArtifacts> {
  const res = await fetch(`${projectApiUrl(projectId)}/versions/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ versionId }),
    signal,
  });
  const data = (await json<{ artifacts?: WorkspaceArtifacts }>(
    res,
    "prepare version artifacts"
  )) as { artifacts?: WorkspaceArtifacts };
  if (!data.artifacts) throw new Error("prepare did not return artifacts");
  return data.artifacts;
}

export async function publishVersion(
  projectId: string,
  versionId: string,
  signal?: AbortSignal
): Promise<WorkspaceDeployment> {
  const res = await fetch(`${projectApiUrl(projectId)}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ versionId }),
    signal,
  });
  const data = (await json<{ deployment?: WorkspaceDeployment }>(
    res,
    "publish version"
  )) as { deployment?: WorkspaceDeployment };
  if (!data.deployment) throw new Error("publish did not return a deployment");
  return data.deployment;
}

export async function unpublishProject(
  projectId: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; unpublished: boolean }> {
  const res = await fetch(`${projectApiUrl(projectId)}/unpublish`, {
    method: "POST",
    signal,
  });
  return json<{ ok: boolean; unpublished: boolean }>(res, "unpublish");
}

export async function renameProject(
  projectId: string,
  name: string,
  signal?: AbortSignal
): Promise<ProjectSummary> {
  const res = await fetch(projectApiUrl(projectId), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
    signal,
  });
  const project = (await json<ProjectResponse>(res, "rename project")).project;
  if (!project) throw new Error("project was not renamed");
  return project;
}

export async function compactChat(
  projectId: string
): Promise<{ ok: boolean; compacted: boolean }> {
  const res = await fetch(projectApiUrl(projectId, "/compact"), {
    method: "POST",
  });
  return json<{ ok: boolean; compacted: boolean }>(res, "compact chat");
}

export async function deleteProject(
  projectId: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(projectApiUrl(projectId), {
    method: "DELETE",
    signal,
  });
  if (!res.ok) throw new Error(`delete project HTTP ${res.status}`);
}

export async function switchRuntime(
  projectId: string,
  template: TemplateId,
  signal?: AbortSignal
): Promise<ProjectSummary> {
  const res = await fetch(projectApiUrl(projectId, "/runtime/switch"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template }),
    signal,
  });
  const project = (await json<ProjectResponse>(res, "switch runtime")).project;
  if (!project) throw new Error("runtime was not switched");
  return project;
}

export async function configureProject(
  projectId: string,
  template: TemplateId,
  signal?: AbortSignal
): Promise<ProjectSummary> {
  const res = await fetch(projectApiUrl(projectId, "/configure"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template }),
    signal,
  });
  const project = (await json<ProjectResponse>(res, "configure project")).project;
  if (!project) throw new Error("project was not configured");
  return project;
}

export async function createProject(
  prompt: string,
  template: TemplateChoice = "auto",
  signal?: AbortSignal
): Promise<ProjectSummary> {
  const res = await fetch(PROJECTS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, template }),
    signal,
  });
  const project = (await json<ProjectResponse>(res, "create project")).project;
  if (!project) throw new Error("project was not created");
  return project;
}

/**
 * 版本列表只读 DO 存储，容器停止时依然可用；
 * 请求失败时抛错，由调用方决定展示。
 */
export async function fetchWorkspaceVersions(
  projectId: string,
  signal?: AbortSignal
): Promise<WorkspaceVersion[]> {
  const res = await fetch(projectApiUrl(projectId, "/versions"), { signal });
  return (await json<VersionsResponse>(res, "versions")).versions ?? [];
}

export async function fetchWorkspaceFile(
  projectId: string,
  path: string,
  signal?: AbortSignal
): Promise<{ content: string; truncated: boolean }> {
  const res = await fetch(projectApiUrl(projectId, "/tools/read"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, offset: 0, limit: 5000 }),
    signal,
  });
  return await json<{ content: string; truncated: boolean }>(res, "file");
}

export async function fetchWorkspaceFiles(
  projectId: string,
  signal?: AbortSignal
): Promise<WorkspaceFileListing> {
  const res = await fetch(projectApiUrl(projectId, "/files"), { signal });
  const data = await json<Partial<WorkspaceFileListing>>(res, "files");
  return {
    entries: data.entries ?? [],
    running: Boolean(data.running),
    cachedAt: Number(data.cachedAt ?? 0),
  };
}

/** 显式同步：会启动（或恢复）沙箱容器 */
export async function refreshWorkspaceFiles(
  projectId: string,
  signal?: AbortSignal
): Promise<WorkspaceFileListing> {
  const res = await fetch(projectApiUrl(projectId, "/files/refresh"), {
    method: "POST",
    signal,
  });
  const data = await json<Partial<WorkspaceFileListing>>(res, "refresh files");
  return {
    entries: data.entries ?? [],
    running: true,
    cachedAt: Number(data.cachedAt ?? 0),
  };
}

/** 启动预览（会启动容器）；幂等 */
export async function startPreview(
  projectId: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(projectApiUrl(projectId, "/preview/start"), {
    method: "POST",
    signal,
  });
  if (!res.ok) throw new Error(`start preview HTTP ${res.status}`);
}

/**
 * 预览健康探测：iframe 的 onError 对 4xx/5xx 不会触发，
 * 因此状态徽标以这个接口为准。
 */
export async function upgradeInstance(projectId: string): Promise<{
  tier: string;
  upgraded: boolean;
  max?: boolean;
  error?: string;
}> {
  const res = await fetch(projectApiUrl(projectId, "/instance/upgrade"), {
    method: "POST",
  });
  if (!res.ok) throw new Error(`upgrade instance HTTP ${res.status}`);
  return (await res.json()) as {
    tier: string;
    upgraded: boolean;
    max?: boolean;
    error?: string;
  };
}

export async function fetchProjectUsage(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectUsage> {
  const res = await fetch(projectApiUrl(projectId, "/usage"), { signal });
  return json<ProjectUsage>(res, "project usage");
}

export async function fetchUsageStatus(
  signal?: AbortSignal
): Promise<UsageStatus> {
  const res = await fetch(workerUrl("/api/usage/status"), { signal });
  return json<UsageStatus>(res, "usage status");
}

export async function fetchWorkspaceRequirements(
  projectId: string,
  signal?: AbortSignal
): Promise<WorkspaceRequirements | null> {
  const res = await fetch(projectApiUrl(projectId, "/requirements"), { signal });
  const data = (await json<{ requirements?: WorkspaceRequirements | null }>(
    res,
    "workspace requirements"
  )) as { requirements?: WorkspaceRequirements | null };
  return data.requirements ?? null;
}

export async function fetchWorkspaceDesigns(
  projectId: string,
  signal?: AbortSignal
): Promise<WorkspaceDesignListing> {
  const res = await fetch(projectApiUrl(projectId, "/designs"), { signal });
  return json<WorkspaceDesignListing>(res, "workspace designs");
}

export async function selectWorkspaceDesign(
  projectId: string,
  designId: string,
  notes?: string
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(
    projectApiUrl(projectId, `/designs/${encodeURIComponent(designId)}/select`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
    }
  );
  return json<{ ok: boolean; id: string }>(res, "select design");
}

export async function applyWorkspaceDesign(
  projectId: string,
  designId?: string
): Promise<{ ok: boolean; id: string; title: string }> {
  const res = await fetch(
    projectApiUrl(
      projectId,
      designId
        ? `/designs/${encodeURIComponent(designId)}/apply`
        : "/designs/apply"
    ),
    { method: "POST" }
  );
  return json<{ ok: boolean; id: string; title: string }>(res, "apply design");
}

export function designPreviewUrl(projectId: string, designId: string): string {
  return projectApiUrl(
    projectId,
    `/designs/${encodeURIComponent(designId)}/`
  );
}

export type ExecPreference = {
  key: string;
  decision: "allow" | "deny";
  command: string;
  updatedAt: number;
};

export async function fetchExecPreferences(
  projectId: string,
  signal?: AbortSignal
): Promise<ExecPreference[]> {
  const res = await fetch(projectApiUrl(projectId, "/exec/preferences"), {
    signal,
  });
  const data = await json<{ preferences?: ExecPreference[] }>(
    res,
    "exec preferences"
  );
  return data.preferences ?? [];
}

export async function saveExecPreference(
  projectId: string,
  input: { key: string; decision: "allow" | "deny"; command: string }
): Promise<{ ok: boolean }> {
  const res = await fetch(projectApiUrl(projectId, "/exec/preferences"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return json<{ ok: boolean }>(res, "save exec preference");
}

export async function removeExecPreference(
  projectId: string,
  key: string
): Promise<{ ok: boolean }> {
  const res = await fetch(
    projectApiUrl(projectId, "/exec/preferences/delete"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    }
  );
  return json<{ ok: boolean }>(res, "delete exec preference");
}

export async function clearExecPreferences(
  projectId: string
): Promise<{ ok: boolean }> {
  const res = await fetch(
    projectApiUrl(projectId, "/exec/preferences/clear"),
    { method: "POST" }
  );
  return json<{ ok: boolean }>(res, "clear exec preferences");
}

export async function fetchWorkspaceMeta(
  projectId: string,
  signal?: AbortSignal
): Promise<WorkspaceMeta> {
  const res = await fetch(projectApiUrl(projectId, "/meta"), { signal });
  const data = await json<Partial<WorkspaceMeta>>(res, "workspace meta");
  return {
    template: (data.template ?? "static") as TemplateId,
    runtime: data.runtime === "browser" ? "browser" : "container",
    configured: data.configured !== false,
    instanceTier: data.instanceTier ?? "basic",
    migration: data.migration ?? null,
    snapshotError: data.snapshotError ?? null,
    snapshotAt: data.snapshotAt ?? null,
    versionCount: Number(data.versionCount ?? 0),
    currentVersion: data.currentVersion ?? null,
    published: data.published === true,
    publishedVersionId: data.publishedVersionId ?? null,
    deploymentUrl: data.deploymentUrl ?? null,
    designStatus: data.designStatus ?? "none",
    designId: data.designId ?? null,
    requirementsStatus: data.requirementsStatus ?? null,
  };
}

export async function fetchPreviewStatus(
  projectId: string,
  signal?: AbortSignal
): Promise<PreviewStatus> {
  const res = await fetch(projectApiUrl(projectId, "/preview/status"), { signal });
  const data = (await json<Partial<PreviewStatus>>(res, "preview status")) ?? {};
  return { running: Boolean(data.running), ready: Boolean(data.ready) };
}

/** 侧栏数据的统一状态：data 为 null 表示尚未拿到过数据 */
export type Endpoint<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** 显式同步（文件列表会启动容器） */
  refreshLive: () => void;
};

function useEndpoint<T>(
  fetcher: (signal?: AbortSignal, live?: boolean) => Promise<T>
): Endpoint<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(false);

  const refresh = useCallback(() => {
    setLive(false);
    setTick((t) => t + 1);
  }, []);

  const refreshLive = useCallback(() => {
    setLive(true);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcher(controller.signal, live)
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => controller.abort();
  }, [fetcher, tick, live]);

  return { data, loading, error, refresh, refreshLive };
}

export function useProjects(): Endpoint<ProjectSummary[]> {
  return useEndpoint(fetchProjects);
}

export function useProject(projectId: string): Endpoint<ProjectSummary> {
  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchProject(projectId, signal),
    [projectId]
  );
  return useEndpoint(fetcher);
}

export function useProjectUsage(projectId: string): Endpoint<ProjectUsage> {
  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchProjectUsage(projectId, signal),
    [projectId]
  );
  return useEndpoint(fetcher);
}

export function useUsageStatus(): Endpoint<UsageStatus> {
  return useEndpoint(fetchUsageStatus);
}

export function useWorkspaceMeta(projectId: string): Endpoint<WorkspaceMeta> {
  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchWorkspaceMeta(projectId, signal),
    [projectId]
  );
  return useEndpoint(fetcher);
}

export function useWorkspaceRequirements(
  projectId: string
): Endpoint<WorkspaceRequirements | null> {
  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchWorkspaceRequirements(projectId, signal),
    [projectId]
  );
  return useEndpoint(fetcher);
}

export function useWorkspaceDesigns(
  projectId: string
): Endpoint<WorkspaceDesignListing> {
  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchWorkspaceDesigns(projectId, signal),
    [projectId]
  );
  return useEndpoint(fetcher);
}

export function useWorkspaceVersions(projectId: string): Endpoint<WorkspaceVersion[]> {
  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchWorkspaceVersions(projectId, signal),
    [projectId]
  );
  return useEndpoint(fetcher);
}

export function useWorkspaceFiles(
  projectId: string
): Endpoint<WorkspaceFileListing> {
  const fetcher = useCallback(
    (signal?: AbortSignal, live?: boolean) =>
      live
        ? refreshWorkspaceFiles(projectId, signal)
        : fetchWorkspaceFiles(projectId, signal),
    [projectId]
  );
  return useEndpoint(fetcher);
}

/* ---------------------------------------------------------------- *
 * 展示辅助（只服务于冻结接口的字段，不引入后端概念）
 * ---------------------------------------------------------------- */

export function templateLabel(template: string): string {
  if (template === "react-vite") return "React";
  if (template === "fullstack-hono") return "全栈";
  return "Static";
}

/** commit 短 hash，如 `9c4a1f2` */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/** `HH:MM`（本地时区） */
export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 字节数的人类可读形式 */
export function formatSize(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
