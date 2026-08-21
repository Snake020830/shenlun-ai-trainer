# DEVLOG

## V0.1 — product shell

### 已完成

- 建立 Tauri 2 + React + TypeScript + Vite 工程骨架。
- 建立桌面端左侧导航与训练信息架构。
- 完成今日训练、题库、三栏作答工作台、结构化模拟批改。
- 新增手工题目导入：题型、分值、字数、标签、题干和多段材料可录入本地题库。
- 每次提交保存 review snapshot，训练记录支持进入详情查看原答案与当次反馈。
- 错题复盘从 review snapshot 中提取遗漏/部分覆盖要点形成队列。
- 内置题按各自题型使用不同模拟规则；本地未知题只使用明确标识的通用模拟反馈。

### SQLite 与持久化

- persistence adapter 已全部改为异步接口。
- Tauri 桌面运行时已接入 `tauri-plugin-sql` SQLite；浏览器开发模式继续使用 localStorage fallback。
- SQLite V1 包含 `app_meta / questions / materials / drafts / training_records`。
- `materials` 使用 `(question_id, id)` 复合主键，避免不同题目的材料局部 ID 冲突。
- 旧 V0.1 localStorage 题目、草稿和训练记录支持首次启动迁移。
- 迁移完成标记保存在 SQLite `app_meta`，数据库重建后可重新迁移，失败时也允许安全重试。
- 草稿加载增加“先读后写”门禁，避免异步初始化时空答案覆盖旧草稿。
- 启动 hydration 与当前会话数据按 ID 合并，避免初始化覆盖启动期间产生的新题目或新记录。

### 评分架构

- 新增 `rules/shenlun-grading.md`，冻结模型无关的评分方法论 v0.1.0。
- 新增 `rules/error-taxonomy.json`，定义遗漏、要素混淆、过度抽象、机制缺失、情态错置等错误类型。
- 新增 `src/grading/contracts.ts`：`GradingRequest / GradingProvider / StructuredReview` contract 与结果验证。
- 新增 `src/grading/artifacts.ts`：材料盲抽、rubric、答案映射、字数审计、参考答案交叉验证的中间结构 schema。
- 新增 `mockProvider` 并让答题提交通过统一 `gradingService`；页面不再直接调用关键词评分器。
- `StructuredReview` 保存 provider/ruleset/generation provenance；旧 `MockReview` 名称仅保留兼容别名。
- provider 返回非法结构、越界分数或满分不匹配时 fail closed，不生成训练记录。
- 明确不保存模型私有 chain-of-thought，只保留可审计的结构化证据和诊断。

### CI

- Frontend CI：Node 24，执行 TypeScript + Vite build。
- Desktop CI：Windows runner + stable Rust，执行前端 build 与 Tauri `cargo check`。
- 修复过 tsconfig、Node typings、Tauri Windows icon 等真实构建问题。
- SQLite 初始接线版本已通过 Windows Desktop CI。
- 两条 workflow 已加入 concurrency，新提交自动取消同分支旧 run。

### 当前边界

- 模拟批改仍只用于验证产品交互，不是正式 AI 评分。
- 规则 contract 已建立，但真实 provider 尚未接入。
- 设置页暂不放 API key 等无效配置，等安全凭据方案确定后启用。

### 下一阶段

1. 建立默认关闭的 OpenAI-compatible provider adapter；
2. 设计凭据安全存储，不把明文 API key 写入普通 SQLite、源码或日志；
3. 实现五阶段真实评分 workflow；
4. 加入老师/机构答案的 Stage 5 交叉验证；
5. 建立人工标注题集，评估评分一致性、遗漏率和错误分类准确率；
6. 达到验证门槛后才允许真实 AI provider 成为默认评分引擎。

### 尚未完成

- 未接入真实 AI 批改与材料级要点识别。
- 未接老师/机构答案的评分后对照。
- 未做 PDF/图片/OCR 真题导入。
- 未做能力画像、自适应推荐、整卷模考、倒计时与套题管理。
