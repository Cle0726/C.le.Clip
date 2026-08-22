# C.le. Clip

**C.le. Clip** 是一个面向 Windows 与 macOS 的轻量剪贴板管理器，并内置 Prompt 优化工作区。

## 当前 MVP

- 自动捕获文本剪贴板历史
- 本地搜索
- 收藏、复制、删除
- 自动去重，默认最多保留 200 条
- Prompt Lab：智能、简洁、详细、编程、写作、图像、分析模式
- Prompt 优化结果可编辑并一键复制
- 全部历史默认只保存在本机浏览器存储中
- Tauri 2 + Rust 跨平台桌面壳
- C.le. 品牌化浅色 UI

## 技术栈

- Tauri 2
- Rust
- React 19
- TypeScript
- Vite
- arboard（跨平台剪贴板访问）

## 本地开发

需要 Node.js、Rust 与 Tauri 系统依赖。

```bash
npm install
npm run tauri:dev
```

## 构建

```bash
npm run tauri:build
```

Windows 可生成安装包/可执行应用；macOS 可生成 `.app` / `.dmg`（具体产物取决于本机工具链与签名配置）。

## 路线图

- [ ] 图片剪贴板历史与缩略图
- [ ] SQLite 持久化与容量管理
- [ ] 全局快捷键快速呼出
- [ ] 托盘常驻、Esc 隐藏
- [ ] 开机启动
- [ ] 隐私排除规则（密码管理器、验证码等）
- [ ] 云端 AI Provider 接口与 API Key 安全存储
- [ ] 本地模型 Provider
- [ ] Prompt 模板收藏与 Snippets
- [ ] 深色模式
- [ ] GitHub Actions 构建 Windows / macOS 安装包

## 隐私原则

剪贴板属于高敏感数据。默认设计应坚持：本地优先、可清空、可排除应用、AI 发送前明确告知，并避免默认上传任何剪贴板历史。
