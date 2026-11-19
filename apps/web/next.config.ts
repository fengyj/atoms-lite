import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静态导出，由 Worker 的 assets 提供，前后端同源
  output: "export",
  images: {
    unoptimized: true,
  },
  // contracts 直接导出 .ts 源码，交给 Next 编译
  transpilePackages: ["@atoms-lite/contracts"],
  // Playwright / 本地工具常用 127.0.0.1，Next 16 默认拦截跨源 dev 资源
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // 生产由 Worker 把 /sessions/:id 复用到静态 shell；dev 下用 rewrite 模拟
  ...(process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          return [{ source: "/sessions/prj_:id", destination: "/sessions/demo" }];
        },
      }
    : {}),
};

export default nextConfig;
