# Codex Quota

跨平台 Electron Codex 额度浮窗，使用 React、TypeScript、Vite 和 pnpm。

## 开发

    pnpm install
    pnpm dev

应用会尝试启动本机的 codex app-server，优先使用：

1. CODEX_EXECUTABLE 环境变量
2. macOS 的 ChatGPT 内置 Codex
3. PATH 中的 codex / codex.exe

## 交互

- 仅标题栏区域支持拖拽，卡片正文点击不会展开详情。
- 悬浮卡片上方箭头可展开或收起详情，箭头方向会随状态变化。
- 详情显示具体的月日和时分重置时间。
- 在“更多设置”中可以切换清透浅色、午夜石墨、暖砂橙和极光蓝紫主题，选择会自动保存。

## 检查和打包

    pnpm typecheck
    pnpm build
    pnpm package:mac
    pnpm package:win

macOS 产物为 DMG/ZIP，Windows 产物为 NSIS 安装包和便携版 EXE。
