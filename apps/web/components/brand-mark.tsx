import { cn } from "@/lib/utils";

/**
 * atoms-lite 品牌标记：两条交叉轨道 + 原子核 + 电子。
 * 使用 currentColor，外框/底色由调用方决定。
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4", className)}
    >
      <g stroke="currentColor" strokeWidth="2">
        <ellipse
          cx="16"
          cy="16"
          rx="12"
          ry="3.6"
          transform="rotate(50 16 16)"
        />
        <ellipse
          cx="16"
          cy="16"
          rx="12"
          ry="3.6"
          transform="rotate(-50 16 16)"
        />
      </g>
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
      <circle cx="26.2" cy="7" r="1.6" fill="currentColor" />
    </svg>
  );
}
