import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // contracts 直接导出 .ts 源码，交给 Next 编译
  transpilePackages: ["@atoms-lite/contracts"],
};

export default nextConfig;
