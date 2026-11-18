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
};

export default nextConfig;
