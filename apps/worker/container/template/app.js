// Placeholder app: reports that the preview server is serving the template.
(function () {
  "use strict";

  var statusText = document.getElementById("status-text");
  var meta = document.getElementById("meta");

  if (statusText) {
    statusText.textContent = "预览服务器已就绪";
  }

  if (meta) {
    var loadedAt = new Date();
    var path = window.location.pathname || "/";
    meta.textContent =
      "路径 " + path + " · 加载于 " + loadedAt.toLocaleTimeString("zh-CN");
    meta.hidden = false;
  }
})();
