# DEVLOG

## V0.1 — product shell

### 已完成

- 建立 Tauri 2 + React + TypeScript + Vite 工程骨架。
- 建立桌面端左侧导航与训练信息架构。
- 完成今日训练、题库、三栏作答工作台、结构化模拟批改。
- 建立 persistence adapter；当前由 localStorage 实现自动草稿、训练记录和本地题目。
- 新增手工题目导入：题型、分值、字数、标签、题干和多段材料可录入本地题库。
- 每次提交保存 review snapshot，训练记录支持进入详情查看原答案与当次反馈。
- 错题复盘从 review snapshot 中提取遗漏/部分覆盖要点形成队列。
- 内置题按各自题型使用不同模拟规则；本地未知题只使用明确标识的通用模拟反馈。
- 建立 SQLite V1 DDL 草案：questions / materials / drafts / training_records。
- 建立 GitHub Actions Frontend CI：安装依赖后执行 TypeScript + Vite build。

### 当前边界

- 模拟批改只用于验证产品交互，不是正式评分结果。
- SQLite 目前只有 schema contract，运行时仍使用 localStorage adapter。
- 设置页暂不放无效配置，等真实 AI/provider 层接入后启用。

### 尚未完成

- 未接入真实 AI 批改与材料级要点识别。
- 未接老师/机构答案的评分后对照。
- 未启用 SQLite adapter、数据库迁移与备份。
- 未做 PDF/图片/OCR 真题导入。
- 未做评分规则、error taxonomy、能力画像与自适应推荐的正式实现。
- 未做整卷模考、倒计时与套题管理。
