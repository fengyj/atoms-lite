import { HashRouter, Route, Routes } from "react-router-dom";
import Index from "@/pages/Index";

// 路由 shell：页面统一放在 src/pages，并在 Routes 里注册。
// 使用 HashRouter，避免预览挂在 /previews/:id/ 时浏览器路径与静态资源冲突。
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="*" element={<Index />} />
      </Routes>
    </HashRouter>
  );
}
