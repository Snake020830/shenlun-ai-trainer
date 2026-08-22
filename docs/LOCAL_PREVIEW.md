# 本地低摩擦验收流程

目标：仓库只克隆一次。以后日常 UI / 交互验收不反复下载安装包，只拉取最新代码并启动 Tauri 开发版。

## 推荐工作流

### 第一次：克隆一次仓库

最适合不想记 Git 命令的方式是 GitHub Desktop：

1. 在 GitHub Desktop 登录拥有该私有仓库权限的 GitHub 账号。
2. `File -> Clone repository`。
3. 选择 `Snake020830/shenlun-ai-trainer`。
4. 选择一个固定本地目录，例如 `D:\1_codex\shenlun-ai-trainer`。
5. Clone 完成后切换分支到 `feat/v0.1-product-shell`。

### 第一次：准备桌面开发环境

Tauri 开发预览需要：

- Node.js LTS；
- Rust / Cargo；
- Windows C++ build tools；
- WebView2（现代 Windows 通常已有）。

这些依赖只需要准备一次，不需要每个版本重新安装。

## 日常验收：推荐两种入口

### A. 最简单、最安全

1. GitHub Desktop 打开仓库。
2. 点击 `Fetch origin`；有更新时点击 `Pull origin`。
3. 在资源管理器打开仓库目录。
4. 双击 `start-local-preview.cmd`。

这会直接启动原生 Tauri 开发窗口，不安装 exe。

### B. 一键更新并启动

双击：

`update-and-start-preview.cmd`

脚本会：

1. 确认当前分支是 `feat/v0.1-product-shell`；
2. 使用 `git pull --ff-only` 拉取最新代码；
3. 刷新 npm 依赖；
4. 启动原生 Tauri 开发版。

脚本故意不使用 `reset --hard`、force checkout 等破坏性命令。如果本地出现改动冲突，它会停下并要求人工处理，而不是覆盖本地内容。

## 为什么优先用 Tauri 开发版，而不是浏览器

`npm run ui:dev` 适合快速看布局，但它使用浏览器 fallback，不能完整代表：

- SQLite；
- OS 凭据库；
- Rust secure remote executor；
- Windows/Tauri 的真实字体与 WebView 渲染。

因此申论稿纸、材料字体、高亮持久化、API key、安全网络调用等真实验收优先使用：

`npm run app:dev`

或直接双击 `start-local-preview.cmd`。

## 什么时候还需要 GitHub Actions 安装包

不要每次 UI 微调都下载安装包。安装包只用于阶段性里程碑：

- 首次安装是否正常；
- 升级/覆盖安装行为；
- 正式 Windows bundle 是否缺资源；
- 完整 SQLite migration 是否在干净环境执行；
- SmartScreen / 签名 / 安装目录问题；
- 准备发给其他人测试。

日常高频反馈循环应是：

`ChatGPT 修改 GitHub -> GitHub Desktop Pull -> 双击 start-local-preview.cmd -> 截图/反馈 -> ChatGPT 再改`

## 当前建议的验收节奏

### 高频小迭代

只验收当前改动，例如：

- 材料字号 / 行距；
- 稿纸格对齐；
- 高亮是否顺手；
- 按钮和布局；
- 长文本滚动。

无需每次重跑完整验收清单。

### 阶段冻结

再下载 `Shenlun-Trainer-Windows-Preview`，按 `docs/ACCEPTANCE_CHECKLIST.md` 做完整验收。

## 出错时怎么反馈

如果 `.cmd` 窗口出现错误，不需要自己排查：

1. 不要执行 reset / force / delete；
2. 截图整个命令窗口；
3. 把截图发到当前开发对话；
4. 同时说明你点击的是 `start-local-preview.cmd` 还是 `update-and-start-preview.cmd`。
