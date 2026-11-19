const ORBIT = {
  rx: 300,
  ry: 108,
};

/**
 * 首页背景：原子轨道 + 粒子点阵。
 * 纯 SVG / CSS，无图片请求；动画在 prefers-reduced-motion 下关闭。
 */
export function AtomHero() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="atom-grid absolute inset-0" />
      <div className="atom-halo" />

      <svg
        className="atom-art"
        viewBox="0 0 720 720"
        fill="none"
        focusable="false"
      >
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
              rx="232"
              ry="82"
              stroke="currentColor"
              strokeOpacity="0.16"
              strokeWidth="1.1"
              strokeDasharray="2 12"
            />
            <g className="text-success">
              <circle cx="660" cy="360" r="14" fill="currentColor" opacity="0.14" />
              <circle cx="660" cy="360" r="5.5" fill="currentColor" />
            </g>
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
            <g className="text-chart-4">
              <circle cx="60" cy="360" r="13" fill="currentColor" opacity="0.14" />
              <circle cx="60" cy="360" r="5" fill="currentColor" />
            </g>
          </g>

          <g transform="rotate(96 360 360)">
            <ellipse
              cx="360"
              cy="360"
              rx={ORBIT.rx}
              ry={ORBIT.ry}
              stroke="currentColor"
              strokeOpacity="0.18"
              strokeWidth="1.1"
            />
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
