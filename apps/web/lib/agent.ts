/**
 * 工作台与 Worker 的真实接线层。
 *
 * 接口已冻结（后端按此实现）：
 * - Agent 类名 `ChatAgent`，会话名固定 `demo`
 * - Worker host：本地开发 `NEXT_PUBLIC_WORKER_HOST ?? "http://localhost:8787"`；
 *   生产 `NEXT_PUBLIC_WORKER_HOST` 为空时用相对路径（同源）
 * - 预览地址 `${host}/previews/demo/`
 * - 版本列表 `GET ${host}/api/workspace/versions`
 * - 文件列表 `GET ${host}/api/workspace/files`
 *
 * 组件只依赖这里导出的类型与数据，不接触后端的原始 DB 结构。
 */
import { useCallback, useEffect, useState } from "react";

export const WORKER_HOST =
  process.env.NEXT_PUBLIC_WORKER_HOST ?? "http://localhost:8787";

export const AGENT_CLASS = "ChatAgent";
export const AGENT_SESSION = "demo";

export function workerUrl(path: string): string {
  return `${WORKER_HOST}${path}`;
}

/** 预览 iframe 指向的地址 */
export const PREVIEW_URL = workerUrl("/previews/demo/");

export const WORKSPACE_VERSIONS_URL = workerUrl("/api/workspace/versions");
export const WORKSPACE_FILES_URL = workerUrl("/api/workspace/files");

/** GET /api/workspace/versions 的条目（冻结接口） */
export type WorkspaceVersion = {
  id: string;
  gitCommit: string;
  summary: string;
  status: string;
  createdAt: number;
  current: boolean;
};

/** GET /api/workspace/files 的条目（冻结接口） */
export type WorkspaceFileEntry = {
  path: string;
  type: string;
  size?: number;
};

type VersionsResponse = { versions?: WorkspaceVersion[] };
type FilesResponse = { entries?: WorkspaceFileEntry[] };

/**
 * 版本列表只读 DO 存储，容器停止时依然可用；
 * 请求失败时抛错，由调用方决定展示。
 */
export async function fetchWorkspaceVersions(
  signal?: AbortSignal
): Promise<WorkspaceVersion[]> {
  const res = await fetch(WORKSPACE_VERSIONS_URL, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as VersionsResponse;
  return data.versions ?? [];
}

export async function fetchWorkspaceFiles(
  signal?: AbortSignal
): Promise<WorkspaceFileEntry[]> {
  const res = await fetch(WORKSPACE_FILES_URL, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as FilesResponse;
  return data.entries ?? [];
}

/** 侧栏数据的统一状态：data 为 null 表示尚未拿到过数据 */
export type Endpoint<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

function useEndpoint<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>
): Endpoint<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcher(controller.signal)
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
  }, [fetcher, tick]);

  return { data, loading, error, refresh };
}

export function useWorkspaceVersions(): Endpoint<WorkspaceVersion[]> {
  return useEndpoint(fetchWorkspaceVersions);
}

export function useWorkspaceFiles(): Endpoint<WorkspaceFileEntry[]> {
  return useEndpoint(fetchWorkspaceFiles);
}

/* ---------------------------------------------------------------- *
 * 展示辅助（只服务于冻结接口的字段，不引入后端概念）
 * ---------------------------------------------------------------- */

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
