# C.le. Clip

**C.le. Clip** 是一个面向 Windows 与 macOS 的轻量剪贴板管理器，并内置 Prompt 优化工作区。

## v0.1.0 MVP

- 文本与图片剪贴板自动捕获
- SQLite 本地持久化、去重与容量管理（默认保留 200 条未收藏记录）
- 搜索、收藏、删除、清除未收藏历史、一键重新复制
- `Ctrl + Shift + V`（Windows）/ `⌘ + Shift + V`（macOS）全局呼出
- 系统托盘常驻，关闭窗口或按 `Esc` 时隐藏
- 可选开机启动
- Prompt Lab：智能、简洁、详细、编程、写作、图像、分析模式
- 本地模板优化，不联网即可使用
- 可选 OpenAI-compatible AI Provider
- AI Endpoint 与模型配置保存在本地；API Key 使用系统凭据库保存
- Windows / macOS CI 与 GitHub Release 构建配置

## 技术栈

- Tauri 2
- Rust
- React 19 + TypeScript + Vite
- SQLite / rusqlite
- arboard（跨平台剪贴板）
- keyring（Windows Credential Manager / macOS Keychain）

## 本地开发

需要 Node.js 22、Rust stable，以及对应平台的 Tauri 2 系统依赖。

```bash
npm install
npm run tauri:dev
```

前端单独开发：

```bash
npm run dev
```

## 构建

```bash
npm run tauri:build
```

Windows 可生成桌面安装包；macOS 可生成 `.app` / `.dmg`。未签名的开发构建可能触发系统安全提示，正式发布前需要配置各平台代码签名。

## AI Provider

Prompt Lab 默认使用本地模板，不会自动把剪贴板内容发送到网络。只有切换到 **AI 优化** 并主动点击生成时，当前选中的文字才会发送到所配置的 Endpoint。

默认配置兼容 OpenAI Chat Completions API，也可以填写其他 OpenAI-compatible Endpoint。API Key 不写入 SQLite，也不提交到 Git。

## 隐私原则

剪贴板可能包含敏感信息，因此 C.le. Clip 采用本地优先设计：历史默认保存在设备本地，可随时删除；AI 功能默认关闭联网路径；不应在后台自动上传剪贴板历史。

后续版本还会增加按应用排除、暂停记录与更细粒度的隐私规则。

## 路线图

- [x] 文本剪贴板历史
- [x] 图片剪贴板历史与预览
- [x] SQLite 持久化与去重
- [x] 全局快捷键快速呼出
- [x] 托盘常驻、Esc 隐藏
- [x] 开机启动
- [x] OpenAI-compatible AI Provider
- [x] API Key 系统凭据库保存
- [x] Windows / macOS CI 与 Release 工作流
- [ ] 隐私排除规则与暂停记录
- [ ] Prompt 模板收藏与 Snippets
- [ ] 本地模型 Provider
- [ ] 深色模式
- [ ] 自动更新
- [ ] Windows / macOS 代码签名
