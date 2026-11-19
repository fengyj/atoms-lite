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
export type RuntimeKind = "container" | "browser";
export type TemplateChoice = "auto" | TemplateId;

export type ProjectSummary = {
  id: string;
  name: string;
  prompt: string;
  template: TemplateId;
  runtime: RuntimeKind;
  templateSource: TemplateSource;
  planReason: string;
  createdAt: number;
  updatedAt: number;
  versionCount: number;
  currentVersion: ProjectVersion | null;
};

/** GET /api/projects/:id/versions 的条目 */
export type WorkspaceVersion = ProjectVersion & {
  parentId: string | null;
  status: string;
  current: boolean;
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
};

export type PreviewStatus = { running: boolean; ready: boolean };

export type WorkspaceMeta = {
  template: TemplateId;
  runtime: RuntimeKind;
  snapshotError: string | null;
  snapshotAt: number | null;
  versionCount: number;
  currentVersion: ProjectVersion | null;
};

type ProjectsResponse = { projects?: ProjectSummary[] };
type ProjectResponse = { project?: ProjectSummary };
type VersionsResponse = { versions?: WorkspaceVersion[] };

async function json<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
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
export async function fetchWorkspaceMeta(
  projectId: string,
  signal?: AbortSignal
): Promise<WorkspaceMeta> {
  const res = await fetch(projectApiUrl(projectId, "/meta"), { signal });
  const data = await json<Partial<WorkspaceMeta>>(res, "workspace meta");
  return {
    template: (data.template ?? "static") as TemplateId,
    runtime: data.runtime === "browser" ? "browser" : "container",
    snapshotError: data.snapshotError ?? null,
    snapshotAt: data.snapshotAt ?? null,
    versionCount: Number(data.versionCount ?? 0),
    currentVersion: data.currentVersion ?? null,
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

export function useWorkspaceMeta(projectId: string): Endpoint<WorkspaceMeta> {
  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchWorkspaceMeta(projectId, signal),
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
