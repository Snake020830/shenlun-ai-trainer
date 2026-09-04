# 开发环境 Setup

本文面向需要从源码运行或参与开发的贡献者。普通用户不需要 Node.js、Rust 或 Git，直接从 GitHub Releases 下载 Windows `setup.exe` 即可。

## Windows 前置条件

- Windows 10/11（桌面版需要 WebView2；Windows 11 通常已预装）
- Node.js 24（建议使用官方安装包，并确认 `node --version` 的主版本为 24）
- Rust stable 和 Cargo（只有运行 Tauri 桌面版或执行 Rust 检查时需要）
- Git

## 首次安装

```powershell
git clone --branch feat/v0.1-product-shell https://github.com/Snake020830/shenlun-ai-trainer.git
cd shenlun-ai-trainer
npm ci
```

也可以在 Windows 中双击 `setup-dev.cmd`。脚本会检查 Node.js 版本、使用锁文件安装依赖，并提示是否检测到 Rust/Cargo；它不会读取或修改 `.env`、`.tauri`、`output` 等本地敏感目录。

## 启动和验证

```powershell
# 浏览器版，适合 UI 和训练流程预览
npm run dev

# Tauri 桌面版，需要 Rust stable
npm run app:dev

# 回归测试与生产构建
npm test
npm run build
```

`start-local-preview.cmd` 会自动选择桌面版或浏览器版；`verify-local.cmd` 会执行测试和生产构建。

## 常见问题

- `npm ci` 报锁文件错误：确认使用 Node.js 24，并删除未完成的 `node_modules` 后重试；不要删除 `package-lock.json`。
- 找不到 `cargo`：先运行浏览器版预览；需要桌面能力时安装 Rust stable 并重新打开终端。
- Windows 首次启动弹出 WebView2 提示：从微软官方渠道安装 WebView2 Runtime 后重试。

## 安装包如何更新

正式 `setup.exe` 由 `.github/workflows/release.yml` 在推送 `v*` 标签后自动构建并发布到 GitHub Releases。合并到 `main`、完成测试并配置 Tauri 签名密钥后，再创建版本标签；源码分支上的提交不会自动替换用户已安装的版本。
