# 参与开发

感谢参与申论训练助手开发。这个项目是 Windows 优先的 Tauri 桌面应用，提交功能前请尽量保持“本地优先、数据可控、训练流程不被打断”。

## 开始开发

当前产品代码基于 `feat/v0.1-product-shell` 分支：

```powershell
git clone --branch feat/v0.1-product-shell https://github.com/Snake020830/shenlun-ai-trainer.git
cd shenlun-ai-trainer
npm ci
npm test
npm run build
```

开发环境需要 Node.js 24、Rust stable 和 Windows WebView2。前端预览使用 `npm run dev`，桌面版使用 `npm run app:dev`。

## 用 Codex 开发

可以把下面这段提示词直接发给朋友的 Codex：

```text
请在 Windows 上基于公开仓库开发：
https://github.com/Snake020830/shenlun-ai-trainer.git

先切换到 feat/v0.1-product-shell 分支，阅读 README.md、CONTRIBUTING.md 和 docs/RELEASING.md，再检查现有代码结构。我要添加的功能是：在这里补充具体需求。

要求：
1. 先说明你准备修改哪些文件和验证方式，再开始改代码。
2. 保持现有功能兼容；涉及题库、材料、答题和高亮时，先理解现有数据结构。
3. 每项有逻辑风险的修改都补充或更新测试。
4. 完成后运行 npm test 和 npm run build，并报告结果。
5. 不要读取、复制或提交 .tauri、.env、output、个人题库和个人答题数据。
6. 不要执行 git push，除非我明确要求；完成后列出修改文件和使用方法。
```

## 分支和提交

- 每项功能从最新的 `feat/v0.1-product-shell` 或维护者指定分支创建自己的分支，例如 `codex/material-navigation`。
- 不要直接改写或强推 `main`。
- 提交前至少运行 `npm test`；涉及构建或 Tauri 配置时再运行 `npm run build` 或桌面构建。
- Pull Request 请说明：问题背景、修改内容、测试结果、是否需要迁移已有题库数据。

## 数据和密钥

不要提交 API Key、个人答题记录、未确认版权的整套试卷、抓取缓存、`output`、`.playwright-cli`、`.tauri` 或任何本地密钥。自动更新私钥只由维护者保管，参与开发不需要它。

## 发布权限

普通贡献者只需要提交代码和 Pull Request。正式版本发布、更新签名和 GitHub Actions Secret 由仓库维护者处理，流程见 [docs/RELEASING.md](docs/RELEASING.md)。
