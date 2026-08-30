# 申论 AI Trainer

面向申论日常训练与复盘的本地优先桌面助手。

当前阶段：V0.1 产品骨架与 AI 诊断闭环。远程 AI 批改默认关闭，启用前必须通过当前模型配置的完整批改链自检；未完成 Human Gold 校准前，分数只解释为诊断分。

## 使用

普通用户无需安装 Node.js 或 Rust。Windows 用户从 GitHub Releases 下载最新的 setup.exe 安装包即可。

## 开发

开发环境需要 Node.js 24。首次运行 npm ci，然后使用 npm run dev 预览前端，或使用 npm run app:dev 启动 Tauri 桌面版。

## 发布

发布和自动更新配置见 docs/RELEASING.md。推送形如 v0.1.1 的 Git 标签后，GitHub Actions 会运行测试、构建 Windows NSIS 安装包并创建 Release。
