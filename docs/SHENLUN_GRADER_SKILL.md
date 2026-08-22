# Shenlun Grader Skill V0.3

## 1. 定位

`ShenlunGraderSkill` 是日常申论作答提交的稳定产品入口，不是一段可随意替换的“大提示词”。

调用链：

`PracticeWorkspace → gradingService.grade → ShenlunGraderSkill → active GradingProvider → staged workflow → StructuredReview`

Benchmark / calibration 仍可通过 `gradeDetailed()` 直接取得冻结的 workflow artifacts；日常训练必须经过 Skill 的输入预检与质量门禁。

当前版本：`shenlun-grader-skill@0.3.0`。

当前 Prompt 条件：`shenlun-stage-prompts@0.3.0`。

## 2. 输入契约

必须提供：

- `Question.id`
- 完整题干 / 作答要求
- 至少一则与该题真实范围一致的材料
- 题型
- 分值
- 字数上限
- 用户原始答案

可选：

- 有 provenance 的老师 / 机构参考答案

Skill 会在调用模型前执行 preflight：

- 空题干 → 拒绝；
- 空材料 → 拒绝；
- 空答案 → 拒绝；
- 非法分值 / 字数 → 拒绝；
- 超字数 → 不阻断，但记录 warning；
- 统计真实材料数、材料字符数、答案字符数并冻结到运行元数据。

公开整卷导入时，小题只携带题干明确引用的材料；文章写作保留整卷材料。不能为了“给模型更多上下文”重新把无关整卷材料塞给小题。

## 3. 题型专用约束

`questionTypeSkill.ts` 为五类题型提供专用批改约束：

### 概括归纳

- 先锁定作答对象、范围和问数；
- 同一对象下展开独立信息维度；
- 问题、原因、做法、成效等不同功能不能混类；
- 多主体 / 多对象先分别归属，再做有依据的上位概括。

### 提出对策

- 区分材料已有做法与根据问题推导的建议；
- 推导型对策必须回指材料中的问题、原因或约束；
- 建议、计划、设想不得改写为已经实施的措施。

### 综合分析

- 明确需要解释的是含义、关系、原因、影响、观点、评价还是作用机制；
- 不能只摘抄材料或机械正反罗列；
- 要保留材料支持的逻辑关系、机制和必要结论。

### 贯彻执行

- 同时识别身份、受众、目的、文种 / 场景和内容任务；
- 内容任务优先于固定公文模板；
- 宣传、汇报、发言、提案、工作指南等场景按实际功能组织信息。

### 文章写作

文章写作的题型规则已经定义，但**当前 remote 小题 workflow 不执行作文数值评分**。现有流程是“材料点 → rubric → 逐点映射”，不适合直接替代作文的立意、论证、结构与表达评分。

因此：

- 作文可以正常入库、阅读和作答；
- remote provider 收到文章写作题时，在模型调用前 fail closed；
- 不允许为了“功能看起来完整”用小题规则输出误导性的作文分数；
- 后续单独实现文章写作 workflow。

## 4. 五阶段小题工作流

### Stage 1 — Material Extraction

只读题目与该题真实材料范围，盲抽材料信息点。

禁止：

- 读取用户答案后反向定义材料点；
- 读取参考答案；
- 用关键词频次代替信息点抽象。

### Stage 2 — Rubric Construction

基于 Stage 1 信息点和题目要求构造 rubric。

每个 rubric 点必须回指 Stage 1 candidate；不能凭空新增没有材料依据的得分点。

### Stage 3 — Answer Mapping

逐 rubric 点判断：

- `hit`
- `partial`
- `missed`

并给出 error taxonomy、诊断和必要修改建议。

#### Error taxonomy 契约

Stage 3 不再只告诉模型“使用系统 taxonomy”，而是同时通过 Prompt 和 JSON Schema 明确正式代码集合。

当前代码来自 `rules/error-taxonomy.json`，包括：

- `OMISSION`
- `PARTIAL_COVERAGE`
- `CATEGORY_CONFUSION`
- `OVER_ABSTRACTION`
- `OVER_MERGE`
- `MECHANISM_LOSS`
- `UNGROUNDED_INFERENCE`
- `MODALITY_SHIFT`
- `OBJECT_CONFUSION`
- `EVIDENCE_NOISE`
- `REDUNDANCY`
- `STRUCTURE_WEAKNESS`
- `WORD_BUDGET_MISALLOCATION`
- `EXPRESSION_AMBIGUITY`

模型不得自造错误码；本地 validator 对未知代码继续 fail closed。`hit` 且无实质错误时允许 `errorCodes: []`。

### Stage 4 — Word Budget / Expression Audit

独立检查：

- 实际字数；
- 是否超限；
- 重复表达；
- 低价值表达；
- 可压缩位置。

程序使用本地确定性字符计数作为最终 charCount；模型不能改变题目字数上限。

### Stage 5 — Optional Reference Cross-check

只有显式存在参考答案时才运行。

参考答案只用于：

- 检查 blind rubric 是否漏维度；
- 记录参考答案独有维度；
- 检查合并 / 拆分差异。

Stage 5 不得自动重写 Stage 1–4 的 rubric、mapping 或 score。

## 5. Skill 二次质量门禁

非 mock provider 返回后，Skill 再检查：

- Stage 1 candidates 非空；
- Stage 2 rubric 非空；
- Stage 3 mapping 数量必须与 rubric 数量一致；
- 每个 rubric 必须恰有一个 mapping；
- error code 必须来自正式 taxonomy；
- Stage 4 字符数必须与本地答案字符数一致；
- Stage 4 wordLimit 必须与题目元数据一致。

任何一项不满足均视为失败，不能伪造“成功批改”。

## 6. Provider 完整自检

设置页的“快速测试连接”只验证网络和简单结构化 JSON。

正式启用 remote AI 前使用“完整自检并启用 AI 批改”：

1. 使用短内置调试题；
2. 真实调用 remote provider；
3. 运行 Stage 1—4；
4. 验证 candidates / rubric / mappings / word budget；
5. 不写入 TrainingRecord；
6. 不进入 Human Gold；
7. 只有全部通过后才自动启用 remote AI。

完整自检通过只代表 provider 能执行当前 Skill 协议，不代表评分已经完成 Human Gold 校准。

## 7. 输出契约

日常 UI 获得 `StructuredReview`，包括：

- score / maxScore
- coverage
- classification
- expression
- redundancy
- summary
- rubric-level review points
- optional reference cross-check
- provider / ruleset / scoring policy
- calibration status
- generatedAt
- `skillVersion`
- `scoreInterpretation`
- `skillWarnings`

这些字段随 TrainingRecord 的 review snapshot 冻结，历史记录不受以后 Skill / prompt 更新影响。

## 8. 分数解释

当前允许三种：

- `mock-diagnostic`
- `ai-diagnostic-uncalibrated`
- `validated`

在独立 Human Gold 校准完成前，remote AI 的 score 只能解释为**诊断评分**，主要用于：

- 要点覆盖程度；
- 漏点；
- 部分覆盖；
- 分类错误；
- 机制丢失；
- 表达和冗余；
- 同一评分协议下的纵向训练比较。

不得宣传为官方阅卷等值分。

## 9. 与公开真题的关系

公开真题负责提供真实材料和真实作答要求；公开网页上的机构答案不得自动成为 Human Gold。

正式训练推荐链路：

`近10年公开整卷 → parser clean → 按题干材料范围拆题 → 本地正式题库 → 用户真实作答 → Shenlun Grader Skill → TrainingRecord → Benchmark Draft → Human Gold / calibration`

第一套固定端到端验收样本为 2025 国考副省级申论卷；仓库只记录 URL 和结构预期，不提交第三方整卷正文。

## 10. 当前可用版退出条件

进入 Feature Freeze 前至少满足：

1. 最近10年主来源可批量扫描 / 一键初始化；
2. parser-clean 整卷可批量校验并稳定拆题导入；
3. 2025 国考副省级固定真实样本完成桌面端到端验收；
4. 四类小题均有真实题进入本地题库并完成至少一次真实作答；
5. remote provider 在真实 Windows/Tauri 下通过完整 Stage 1—4 自检；
6. 至少一道真实非作文题完成 remote Skill 实际批改；
7. Skill fail-closed、taxonomy contract 和 reference isolation 测试通过；
8. 10–20 个真实训练回答进入 regression / benchmark 样本池；
9. 最新阶段 Frontend CI + Desktop CI 通过；
10. 真实 Windows 人工验收通过。
