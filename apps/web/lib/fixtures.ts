/**
 * 设计阶段的假数据。
 * 只服务于 `/`（静态工作台）与 `/design`（组件 gallery）。
 * POC-08 接真实数据时，这里整体删除。
 */

export type VersionStatus = "verified" | "failed" | "draft";

export type MockVersion = {
  id: string;
  commit: string;
  summary: string;
  status: VersionStatus;
  time: string;
  current?: boolean;
};

export type MockArtifact = {
  id: string;
  name: string;
  kind: "web" | "zip" | "log" | "pptx" | "image";
  size: string;
  time: string;
};

export type MockFile = {
  path: string;
  depth: number;
  kind: "dir" | "file";
  change?: "add" | "mod" | "del";
};

export type MockLog = {
  tone: "muted" | "cmd" | "ok" | "err";
  text: string;
};

export type PlanStep = {
  id: string;
  title: string;
  status: "done" | "active" | "todo";
};

export const planSteps: PlanStep[] = [
  { id: "1", title: "读取现有项目结构", status: "done" },
  { id: "2", title: "设计任务数据模型（SQLite）", status: "done" },
  { id: "3", title: "实现看板页面与增删改", status: "active" },
  { id: "4", title: "运行构建并启动预览", status: "todo" },
  { id: "5", title: "创建版本 v4", status: "todo" },
];

export const versions: MockVersion[] = [
  {
    id: "v3",
    commit: "9c4a1f2",
    summary: "修复空列表状态与移动端布局",
    status: "verified",
    time: "12:41",
    current: true,
  },
  {
    id: "v2",
    commit: "3e77b90",
    summary: "加入筛选与已完成分组",
    status: "verified",
    time: "12:18",
  },
  {
    id: "v1",
    commit: "b102d4e",
    summary: "初始版本：任务看板 CRUD",
    status: "verified",
    time: "11:52",
  },
];

export const artifacts: MockArtifact[] = [
  { id: "a1", name: "任务看板", kind: "web", size: "—", time: "12:41" },
  { id: "a2", name: "version-v3.zip", kind: "zip", size: "184 KB", time: "12:41" },
  { id: "a3", name: "build-2026-11-18.log", kind: "log", size: "42 KB", time: "12:40" },
  { id: "a4", name: "cover.png", kind: "image", size: "312 KB", time: "12:39" },
];

export const files: MockFile[] = [
  { path: "app", depth: 0, kind: "dir" },
  { path: "app/page.tsx", depth: 1, kind: "file", change: "mod" },
  { path: "app/layout.tsx", depth: 1, kind: "file" },
  { path: "app/globals.css", depth: 1, kind: "file", change: "mod" },
  { path: "components", depth: 0, kind: "dir" },
  { path: "components/task-board.tsx", depth: 1, kind: "file", change: "add" },
  { path: "components/task-item.tsx", depth: 1, kind: "file" },
  { path: "lib", depth: 0, kind: "dir" },
  { path: "lib/db.ts", depth: 1, kind: "file", change: "add" },
  { path: "data", depth: 0, kind: "dir" },
  { path: "data/app.db", depth: 1, kind: "file" },
  { path: "package.json", depth: 0, kind: "file", change: "mod" },
];

export const logs: MockLog[] = [
  { tone: "cmd", text: "$ pnpm build" },
  { tone: "muted", text: "▲ Next.js 16.4.6 (turbopack)" },
  { tone: "muted", text: "  Creating an optimized production build ..." },
  { tone: "ok", text: "✓ Compiled successfully in 3.2s" },
  { tone: "muted", text: "  Route (app)                 Size" },
  { tone: "muted", text: "  ○ /                        4.1 kB" },
  { tone: "cmd", text: "$ pnpm start --port 3000" },
  { tone: "ok", text: "✓ ready on http://0.0.0.0:3000" },
  { tone: "err", text: "⚠ warning: image optimization disabled" },
];

export const designTokens = [
  { name: "background", className: "bg-background", note: "画布底色" },
  { name: "card", className: "bg-card", note: "面板 / 卡片" },
  { name: "muted", className: "bg-muted", note: "次级块 / 代码底" },
  { name: "accent", className: "bg-accent", note: "悬停 / 选中" },
  { name: "primary", className: "bg-primary", note: "主操作" },
  { name: "destructive", className: "bg-destructive", note: "危险操作" },
  { name: "success", className: "bg-success", note: "通过 / 就绪" },
  { name: "warning", className: "bg-warning", note: "等待 / 降级" },
  { name: "border", className: "bg-border", note: "分隔线" },
] as const;
