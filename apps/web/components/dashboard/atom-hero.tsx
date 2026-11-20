"use client";

import { useEffect, useRef, useState } from "react";

const ORBIT = {
  rx: 300,
  ry: 108,
};

const INNER_ORBIT = {
  rx: 232,
  ry: 82,
};

function ellipsePath(rx: number, ry: number, reverse = false) {
  const start = `M${360 - rx},360`;
  const sweep = reverse ? 1 : 0;
  return `${start} A${rx},${ry} 0 1,${sweep} ${360 + rx},360 A${rx},${ry} 0 1,${sweep} ${360 - rx},360`;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

/**
 * 首页背景：原子轨道 + 粒子点阵。
 * 电子沿轨道运行，鼠标移动时有轻微视差；纯 SVG / CSS，无图片请求。
 * prefers-reduced-motion 下关闭电子动画和视差。
 */
export function AtomHero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * -10;
        const y = (event.clientY / window.innerHeight - 0.5) * -6;
        root.style.setProperty("--atom-px", `${x.toFixed(2)}px`);
        root.style.setProperty("--atom-py", `${y.toFixed(2)}px`);
      });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="atom-hero pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="atom-grid absolute inset-0" />
      <div className="atom-halo" />

      <svg
        className="atom-art"
        viewBox="0 0 720 720"
        fill="none"
        focusable="false"
      >
        <defs>
          <filter
            id="atom-electron-glow"
            x="-200%"
            y="-200%"
            width="400%"
            height="400%"
          >
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="atom-rotor text-primary">
          <g transform="rotate(-28 360 360)">
            <ellipse
              cx="360"
              cy="360"
              rx={ORBIT.rx}
              ry={ORBIT.ry}
              stroke="currentColor"
              strokeOpacity="0.22"
              strokeWidth="1.2"
            />
            <ellipse
              cx="360"
              cy="360"
              rx={INNER_ORBIT.rx}
              ry={INNER_ORBIT.ry}
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="1.2"
            />

            {!reduced ? (
              <>
                <g className="atom-electron text-success">
                  <animateMotion
                    dur="16s"
                    begin="-3s"
                    repeatCount="indefinite"
                    path={ellipsePath(ORBIT.rx, ORBIT.ry)}
                  />
                  <circle r="9" fill="currentColor" opacity="0.14" />
                  <circle
                    r="3"
                    fill="currentColor"
                    filter="url(#atom-electron-glow)"
                  />
                  <circle r="1.1" fill="white" opacity="0.9" />
                </g>

                <g className="atom-electron text-primary">
                  <animateMotion
                    dur="9s"
                    begin="-6s"
                    repeatCount="indefinite"
                    path={ellipsePath(INNER_ORBIT.rx, INNER_ORBIT.ry, true)}
                  />
                  <circle r="7" fill="currentColor" opacity="0.12" />
                  <circle
                    r="2.4"
                    fill="currentColor"
                    filter="url(#atom-electron-glow)"
                  />
                  <circle r="0.9" fill="white" opacity="0.85" />
                </g>
              </>
            ) : null}

          </g>

          <g transform="rotate(34 360 360)">
            <ellipse
              cx="360"
              cy="360"
              rx={ORBIT.rx}
              ry={ORBIT.ry}
              stroke="currentColor"
              strokeOpacity="0.46"
              strokeWidth="1.3"
            />

            {!reduced ? (
              <g className="atom-electron text-chart-4">
                <animateMotion
                  dur="21s"
                  begin="-11s"
                  repeatCount="indefinite"
                  path={ellipsePath(ORBIT.rx, ORBIT.ry, true)}
                />
                <circle r="10" fill="currentColor" opacity="0.12" />
                <circle
                  r="3.2"
                  fill="currentColor"
                  filter="url(#atom-electron-glow)"
                />
                <circle r="1.2" fill="white" opacity="0.9" />
              </g>
            ) : null}

          </g>

          <g className="atom-nucleus">
            <circle cx="360" cy="360" r="52" fill="currentColor" opacity="0.07" />
            <circle cx="360" cy="360" r="22" fill="currentColor" opacity="0.16" />
            <circle cx="360" cy="360" r="7.5" fill="currentColor" opacity="0.9" />
          </g>

          <circle cx="205" cy="565" r="2.4" fill="currentColor" opacity="0.5" />
          <circle cx="560" cy="120" r="2" fill="currentColor" opacity="0.4" />
          <circle cx="110" cy="230" r="1.8" fill="currentColor" opacity="0.45" />
          <circle cx="620" cy="560" r="2.2" fill="currentColor" opacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
