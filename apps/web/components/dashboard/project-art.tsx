import { cn } from "@/lib/utils";

/**
 * 首页项目卡的抽象封面：同一套线稿语言，6 种构图。
 * 用项目 ID 做确定性哈希，刷新后不会跳变。
 */
export function artVariantFor(projectId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < projectId.length; index += 1) {
    hash ^= projectId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 6;
}

function Orbits() {
  return (
    <>
      <circle cx="300" cy="80" r="92" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.45" />
      <circle cx="300" cy="80" r="58" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.75" />
      <circle cx="300" cy="80" r="18" fill="currentColor" opacity="0.22" />
      <circle cx="208" cy="80" r="3" fill="currentColor" opacity="0.75" />
      <path d="M40 80h132" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </>
  );
}

function Sun() {
  return (
    <>
      <path d="M210 160a90 90 0 0 1 180 0" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.55" />
      <circle cx="300" cy="70" r="48" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.75" />
      <circle cx="300" cy="70" r="7" fill="currentColor" opacity="0.7" />
      {Array.from({ length: 8 }).map((_, index) => (
        <line
          key={index}
          x1="300"
          y1="10"
          x2="300"
          y2="2"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.45"
          transform={`rotate(${index * 45} 300 70)`}
        />
      ))}
      <path d="M40 80h150" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </>
  );
}

function DotGrid() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, column) =>
        Array.from({ length: 4 }).map((_, row) => (
          <circle
            key={`${column}-${row}`}
            cx={40 + column * 45}
            cy={24 + row * 38}
            r="1.7"
            fill="currentColor"
            opacity="0.45"
          />
        ))
      )}
      <circle cx="304" cy="80" r="48" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.55" />
      <circle cx="304" cy="80" r="7" fill="currentColor" opacity="0.75" />
    </>
  );
}

function Waves() {
  return (
    <>
      <path
        d="M-20 100C40 60 100 60 160 100s120 40 180 0 120-40 180 0"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        opacity="0.55"
      />
      <path
        d="M-20 122C40 82 100 82 160 122s120 40 180 0 120-40 180 0"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        opacity="0.35"
      />
      <path
        d="M-20 78C40 38 100 38 160 78s120 40 180 0 120-40 180 0"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        opacity="0.22"
      />
      <circle cx="340" cy="80" r="6" fill="currentColor" opacity="0.65" />
    </>
  );
}

function Frames() {
  return (
    <>
      <rect x="210" y="18" width="150" height="124" rx="10" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.22" />
      <rect x="226" y="34" width="118" height="92" rx="8" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.42" />
      <rect x="242" y="50" width="86" height="60" rx="6" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.68" />
      <circle cx="285" cy="80" r="5" fill="currentColor" opacity="0.7" />
      <path d="M40 80h140" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </>
  );
}

const CONSTELLATION = [
  [60, 122],
  [112, 52],
  [180, 92],
  [242, 30],
  [302, 102],
  [360, 58],
  [390, 122],
] as const;

const CONSTELLATION_LINES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [1, 4],
  [2, 5],
] as const;

function Constellation() {
  return (
    <>
      {CONSTELLATION_LINES.map(([from, to]) => {
        const [x1, y1] = CONSTELLATION[from];
        const [x2, y2] = CONSTELLATION[to];
        return (
          <line
            key={`${from}-${to}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.28"
          />
        );
      })}
      {CONSTELLATION.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" fill="currentColor" opacity="0.68" />
      ))}
      <circle cx="242" cy="30" r="14" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.45" />
    </>
  );
}

const VARIANTS = [Orbits, Sun, DotGrid, Waves, Frames, Constellation];

export function ProjectArt({
  variant,
  className,
}: {
  variant: number;
  className?: string;
}) {
  const Art = VARIANTS[Math.abs(variant) % VARIANTS.length] ?? Orbits;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      className={cn("absolute inset-0 h-full w-full", className)}
    >
      <Art />
    </svg>
  );
}
