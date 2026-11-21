/**
 * Streamdown 默认标题是 h1 30px / h2 24px，放进窄聊天栏会压过正文。
 * 这里统一覆盖成聊天内的紧凑层级；h1/h2/h3/h4 用正文附近字号。
 */
export const COMPACT_MARKDOWN_CLASSES = [
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:leading-snug",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-snug",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-snug",
  "[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:leading-snug",
  "[&_h5]:mt-3 [&_h5]:mb-1 [&_h5]:text-xs [&_h5]:font-semibold [&_h5]:uppercase [&_h5]:tracking-wide",
  "[&_h6]:mt-3 [&_h6]:mb-1 [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:text-muted-foreground",
].join(" ");
