# 发布申论训练助手

本项目采用“GitHub 源码仓库 + GitHub Release 安装包 + Tauri 自动更新”的方式分发。

## 第一次公开仓库前

1. 将 GitHub 仓库设置为 Public。
2. 检查待提交文件，不要提交 API Key、个人数据、output、.playwright-cli、抓取的第三方试卷全文或 .tauri 目录。
3. 保留 .tauri 目录在本机。它包含自动更新私钥，绝不能提交到 GitHub 或发送给朋友。
4. 在 GitHub 仓库中添加 MIT License。
5. 检查仓库的 About、README 和默认分支，默认分支建议使用 main。

当前项目的自动更新公钥已经写入 src-tauri/tauri.conf.json。对应的私钥位于本机 .tauri/shenlun-updater.key，当前生成时未设置密码。

## 配置 GitHub Secrets

在 GitHub 仓库进入 Settings → Secrets and variables → Actions，新增：

- TAURI_SIGNING_PRIVATE_KEY：填写本机 .tauri/shenlun-updater.key 文件的完整内容。
- TAURI_SIGNING_PRIVATE_KEY_PASSWORD：当前密钥没有密码时留空即可。

私钥只放在 GitHub Actions Secret 中，不要写进 workflow、README、Issue 或公开代码。

## 发布新版本

1. 修改 package.json、src-tauri/tauri.conf.json 和 src-tauri/Cargo.toml 中的版本号，三处保持一致。
2. 本地运行 npm test 和 npm run build。
3. 将确认过的源码、配置和文档提交到 main。当前工作区有较多历史改动，不建议未经检查直接执行 git add .。
4. 推送 main。
5. 创建并推送版本标签，例如 v0.1.1。

示例命令如下；提交前请把 `git add` 后面的路径替换成你确认过的文件：

```powershell
git add README.md LICENSE package.json package-lock.json src-tauri .github docs/RELEASING.md
git commit -m "chore: prepare public release"
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

推送 v* 标签后，.github/workflows/release.yml 会在 Windows runner 上重新运行测试，生成 NSIS setup.exe、签名更新包和 latest.json，并自动创建 GitHub Release。

## 朋友如何使用

朋友只需打开 GitHub 仓库的 Releases 页面，下载最新版本的 setup.exe 并安装。普通使用不需要 Node.js、Rust 或 Git。

第一次安装时 Windows 可能显示 SmartScreen 提示，因为当前还没有购买 Windows 代码签名证书。可以先使用“更多信息 → 仍要运行”，正式对外发布后再考虑购买代码签名证书。

## 自动更新机制

应用启动后会在后台检查 GitHub Releases。发现新版本时，右上角会显示更新提示；用户点击立即更新后下载并安装，Windows 会自动重启到新版本。

更新签名依赖同一把私钥。私钥或密码丢失后，已经安装旧版本的用户将无法继续接收自动更新，因此必须单独备份。
