import type { Env } from "../env";

export type VersionRow = {
  id: string;
  gitCommit: string;
  parentId: string | null;
  summary: string;
  status: string;
  createdAt: number;
  current: boolean;
};

export type FileEntry = {
  path: string;
  type: "file" | "dir";
  size?: number;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type BuildResult = {
  skipped: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

/**
 * ChatAgent 访问 WorkspaceDO 的唯一入口。
 * 现在走 fetch JSON；以后换 RPC 时保持方法签名不变。
 */
export class WorkspaceClient {
  private readonly stub: DurableObjectStub;

  constructor(env: Env, name = "demo") {
    const id = env.WORKSPACE.idFromName(name);
    this.stub = env.WORKSPACE.get(id);
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.stub.fetch(`https://workspace${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }

    if (!res.ok) {
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `workspace ${path} failed (${res.status})`;
      throw new Error(message);
    }

    return data as T;
  }

  ensure() {
    return this.call<{ ok: boolean; running: boolean }>("/ensure", {});
  }

  meta() {
    return this.call<{
      template: string;
      runtime: string;
      versionCount: number;
      currentVersion: {
        id: string;
        gitCommit: string;
        summary: string;
        createdAt: number;
      } | null;
    }>("/meta");
  }

  build() {
    return this.call<BuildResult>("/tools/build", {});
  }

  installPackages(packages: string[]) {
    return this.call<{
      runtime: string;
      installed?: { name: string; version: string; url: string }[];
      imports?: Record<string, string>;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      error?: string;
    }>("/tools/install", { packages });
  }

  listFiles() {
    return this.call<{ entries: FileEntry[] }>("/tools/list", {});
  }

  readFile(path: string) {
    return this.call<{ content: string; truncated: boolean }>("/tools/read", { path });
  }

  writeFile(path: string, content: string) {
    return this.call<{ path: string; bytes: number }>("/tools/write", { path, content });
  }

  exec(request: { program: string; args?: string[]; cwd?: string }) {
    return this.call<ExecResult>("/tools/exec", request);
  }

  previewStatus() {
    return this.call<{ running: boolean; ready: boolean }>("/preview/status");
  }

  startPreview() {
    return this.call<{ status: string; url: string }>("/preview/start", {});
  }

  stopPreview() {
    return this.call<{ status: string }>("/preview/stop", {});
  }

  snapshot() {
    return this.call<{ ok: boolean; error?: string }>("/snapshot", {});
  }

  createVersion(summary: string) {
    return this.call<{
      versionId: string;
      gitCommit: string;
      skipped?: boolean;
      snapshotOk?: boolean;
      snapshotError?: string;
    }>("/versions", { summary });
  }

  listVersions() {
    return this.call<{ versions: VersionRow[] }>("/versions");
  }

  checkout(versionId: string) {
    return this.call<{
      ok: boolean;
      gitCommit: string;
      buildError?: string | null;
      snapshotOk?: boolean;
      snapshotError?: string;
    }>("/versions/checkout", { versionId });
  }
}
