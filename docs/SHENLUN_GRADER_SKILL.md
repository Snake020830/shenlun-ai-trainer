# Shenlun Grader Skill V0.1

## 1. 定位

`ShenlunGraderSkill` 是日常申论作答提交的稳定产品入口，不是一段可随意替换的“大提示词”。

调用链：

`PracticeWorkspace → gradingService.grade → ShenlunGraderSkill → active GradingProvider → five-stage workflow → StructuredReview`

Benchmark / calibration 仍可通过 `gradeDetailed()` 直接取得冻结的 workflow artifacts；日常训练必须经过 Skill 的输入预检与质量门禁。

当前版本：`shenlun-grader-skill@0.1.0`。

## 2. 输入契约

必须提供：

- `Question.id`
- 完整题干 / 作答要求
- 至少一则完整材料
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

## 3. 五阶段工作流

### Stage 1 — Material Extraction

只读题目与完整材料，盲抽材料信息点。

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

### Stage 4 — Word Budget / Expression Audit

独立检查：

- 实际字数；
- 是否超限；
- 重复表达；
- 低价值表达；
- 可压缩位置。

模型报告的字符数必须与程序本地字符计数完全一致，否则 fail closed。

### Stage 5 — Optional Reference Cross-check

只有显式存在参考答案时才运行。

参考答案只用于：

- 检查 blind rubric 是否漏维度；
- 记录参考答案独有维度；
- 检查合并 / 拆分差异。

Stage 5 不得自动重写 Stage 1–4 的 rubric、mapping 或 score。

## 4. Skill 二次质量门禁

非 mock provider 返回后，Skill 再检查：

- Stage 1 candidates 非空；
- Stage 2 rubric 非空；
- Stage 3 mapping 数量必须与 rubric 数量一致；
- Stage 4 字符数必须与本地答案字符数一致；
- Stage 4 wordLimit 必须与题目元数据一致。

任何一项不满足均视为失败，不能伪造“成功批改”。

## 5. 输出契约

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

## 6. 分数解释

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

## 7. 与公开真题的关系

公开真题负责提供完整材料和真实作答要求；公开网页上的机构答案不得自动成为 Human Gold。

正式训练推荐链路：

`近10年公开整卷 → parser clean → 本地正式题库 → 用户真实作答 → Shenlun Grader Skill → TrainingRecord → Benchmark Draft → Human Gold / calibration`

## 8. V0.1 可用版退出条件

进入 Feature Freeze 前至少满足：

1. 最近10年主来源可批量扫描；
2. parser-clean 整卷可批量校验、再确认批量导入；
3. 五类主要题型均有真实题进入本地题库；
4. remote provider 在真实 Windows/Tauri 下完成完整五阶段调用；
5. Skill fail-closed 测试通过；
6. 10–20 个真实训练回答进入 regression / benchmark 样本池；
7. 最新阶段 Frontend CI + Desktop CI 通过；
8. 真实 Windows 人工验收通过。
