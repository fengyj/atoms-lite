import { cn } from "@/lib/utils";

/**
 * 首页项目卡的抽象封面：同一套线稿语言，10 种构图。
 * 卡片按顺序轮换，Featured 使用独立构图。
 */

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

function Arcs() {
  return (
    <>
      <path d="M210 154a100 100 0 0 1 200 0" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5" />
      <path d="M240 154a70 70 0 0 1 140 0" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7" />
      <path d="M270 154a40 40 0 0 1 80 0" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.85" />
      <circle cx="310" cy="154" r="5" fill="currentColor" opacity="0.7" />
      <path d="M40 60h140" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </>
  );
}

function Stripes() {
  return (
    <>
      {Array.from({ length: 9 }).map((_, index) => (
        <line
          key={index}
          x1={228 + index * 18}
          y1={32 + (index % 3) * 11}
          x2={228 + index * 18}
          y2={128 - (index % 4) * 12}
          stroke="currentColor"
          strokeWidth="1"
          opacity={0.25 + (index % 3) * 0.14}
        />
      ))}
      <circle cx="300" cy="80" r="32" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7" />
      <circle cx="300" cy="80" r="5" fill="currentColor" opacity="0.8" />
    </>
  );
}

function Eclipse() {
  return (
    <>
      <circle cx="288" cy="80" r="46" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.55" />
      <circle cx="314" cy="80" r="46" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.55" />
      <circle cx="301" cy="80" r="7" fill="currentColor" opacity="0.75" />
      <path d="M40 80h120" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <path d="M360 80h40" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </>
  );
}

function Terraces() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, index) => (
        <line
          key={index}
          x1={208 + index * 8}
          y1={26 + index * 17}
          x2={390 - index * 7}
          y2={26 + index * 17}
          stroke="currentColor"
          strokeWidth="1"
          opacity={0.22 + (index % 3) * 0.14}
        />
      ))}
      <circle cx="292" cy="80" r="5" fill="currentColor" opacity="0.7" />
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

const VARIANTS = [
  Orbits,
  Sun,
  DotGrid,
  Waves,
  Frames,
  Constellation,
  Arcs,
  Stripes,
  Eclipse,
  Terraces,
];

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

/**
 * Featured 专用构图：把轨道、波纹和星座叠在一起，
 * 和 10 个项目卡封面都不重复。
 */
export function FeaturedArt({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      className={cn("absolute inset-0 h-full w-full", className)}
    >
      <circle cx="300" cy="80" r="96" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
      <circle cx="300" cy="80" r="64" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.48" />
      <circle cx="300" cy="80" r="32" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.65" />
      <path
        d="M-20 132C40 92 100 92 160 132s120 40 180 0 120-40 180 0"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        opacity="0.28"
      />
      <circle cx="300" cy="80" r="8" fill="currentColor" opacity="0.55" />
      <circle cx="120" cy="34" r="2.5" fill="currentColor" opacity="0.55" />
      <circle cx="180" cy="64" r="1.8" fill="currentColor" opacity="0.45" />
      <circle cx="82" cy="118" r="1.8" fill="currentColor" opacity="0.45" />
      <path d="M120 34 180 64 82 118" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.2" />
    </svg>
  );
}
