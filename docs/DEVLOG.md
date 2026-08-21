# DEVLOG

## V0.1 — product shell

- 建立 Tauri 2 + React + TypeScript 工程骨架。
- 建立桌面端左侧导航与训练信息架构。
- 完成今日训练、题库、三栏作答工作台、结构化模拟批改、训练记录。
- 建立 persistence adapter；当前由 localStorage 实现自动草稿和训练记录。
- 错题复盘、设置页保留 V0.2 占位。

### 尚未完成

- 未接入真实 AI 批改。
- 未落 SQLite；需先冻结题目/作答/评分 schema。
- 未做真题导入与 PDF/图片材料解析。
- 未做评分规则或 error-taxonomy 的正式实现。
