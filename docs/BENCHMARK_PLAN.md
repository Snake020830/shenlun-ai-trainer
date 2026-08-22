# 申论评分 Benchmark / Calibration 方案 v0.3

## 1. 目标

Remote workflow 已具备真实模型调用能力，但 `equal-rubric-diagnostic@0.1.0` 仍是未校准诊断 policy。没有独立人工 benchmark，就不能声称模型能够完整抽取材料、稳定构造 rubric、准确判断答案覆盖或给出接近真实阅卷的数值分。

因此模型、prompt、reasoning effort 和 score policy 必须在版本化、可复现的同一套人工证据上比较。

## 2. 数据对象严格分三层

### Layer A：Benchmark Case / Human Gold

保存：

- 题目、题干、完整材料、字数和分值快照；
- 原始考生答案；
- 可选老师/机构参考答案；
- 人工材料点；
- 人工 rubric；
- 人工 `hit / partial / missed` 映射；
- 人工 error taxonomy；
- 真实 human score observations。

生命周期：

- `annotationStatus: draft`：只有题目/答案快照，gold 尚未完成；
- `annotationStatus: adjudicated`：人工材料点、rubric、答案映射已经 adjudication。

任何 evaluation metric 都拒绝 draft case。

### Layer B：Benchmark Model Run

保存模型一次运行的**原始输出**，包括：

- 模型自己的 rubric id / title / evidence；
- 模型自己的 hit / partial / missed；
- 模型自己的 error codes / diagnosis；
- predicted score；
- provider / model / protocol / reasoning effort；
- ruleset / workflow / promptset / scoring policy 版本；
- generatedAt；
- 是否实际执行 Stage 5 reference cross-check。

**Model Run 是模型判断的唯一真源。**

人工对齐文件不得复制、覆盖或改写模型的 status、error code 或 predicted score。

### Layer C：Human Alignment

Alignment 只保存 ID 关系：

- `caseId`；
- `runId`；
- gold rubric 与 predicted rubric 的对应关系；
- gold answer mapping 与 predicted rubric id 的对应关系；
- 可选 confidence / notes。

Alignment **不保存**模型预测的 status、error code 或 score。指标计算时必须回到对应的 immutable Model Run 读取这些值。

这保证人工对齐只能回答“哪个模型点对应哪个 gold 点”，不能事后修改模型判断来提高指标。

## 3. Gold 标注纪律

人工标注顺序固定：

1. 不看模型输出，先展开材料候选信息点；
2. 区分问题、原因、措施、成效、影响、意义、观点、机制等要素；
3. 多对象先分别识别；
4. 再进行人工 rubric adjudication；
5. 对考生原始答案逐 gold rubric 标 `hit / partial / missed`；
6. 标 error taxonomy 与必要 evidence；
7. 最后记录真实 human score observations。

老师/机构参考答案只能作为辅助交叉验证，不能代替材料优先的人工 gold。

## 4. Split 与准入

- `debug`：修 schema、validator、prompt bug；
- `calibration`：选择 prompt、reasoning effort、模型和 score policy；
- `holdout`：最终验证，不参与日常调参。

`score calibration` 只接受：

- `annotationStatus = adjudicated`；
- split 为 `calibration` 或 `holdout`；
- 至少一个真实 human score observation。

debug case 即使有人为分数也不得进入 score calibration。

同一道题的同源答案、轻微改写版本、同一考生的重复版本原则上不得跨 calibration / holdout。

## 5. Rubric alignment

模型 rubric 文本不会机械等于人工 canonical label，因此禁止直接按标题字符串匹配。

允许：

- `match`：1 gold ↔ 1 predicted；
- `acceptable-merge`：多个 gold ↔ 1 predicted；
- `acceptable-split`：1 gold ↔ 多个 predicted。

每个 gold/predicted rubric id 最多进入一个 alignment group。

对 `acceptable-split`，答案状态从 Model Run 自动聚合：

- 全部 hit → hit；
- 全部 missed → missed；
- 其余组合 → partial。

error codes 取对应 predicted mappings 的并集。人工 Alignment 不能手动指定聚合后的模型状态。

## 6. 核心指标

### Rubric 质量

- gold rubric recall；
- predicted rubric precision；
- rubric F1；
- unmatched gold rubric ids；
- unmatched predicted rubric ids。

它回答“模型构造的评分框架有没有漏点或乱加点”。

### Answer mapping

- mapping coverage；
- exact status accuracy；
- `hit / partial / missed` confusion matrix。

Rubric recall 与 mapping accuracy 分开报告。模型漏掉一个 gold rubric 时，不能因为剩余点判断正确而掩盖 rubric 漏点。

### Error taxonomy

- micro precision；
- micro recall；
- micro F1；
- FP / FN。

样本量足够后再增加 per-code 指标。

### Score calibration

- MAE；
- RMSE；
- mean signed error；
- normalized MAE。

不能只看相关性。

## 7. Model Run 可复现性

同一份 validation report 中的 Model Runs 必须具有同一实验签名：

- provider；
- model；
- protocol；
- reasoning effort；
- ruleset；
- workflow version；
- promptset version；
- scoring policy；
- reference-cross-check 条件。

混合不同实验签名时 report builder 直接 fail closed。

## 8. Validation Report

`buildValidationReport()` 将同一 split、同一实验签名的 cases / runs / alignments 汇总为版本化报告，包含：

- per-case rubric / mapping / taxonomy 指标；
- aggregate rubric recall/precision/F1；
- aggregate mapping coverage/accuracy/confusion；
- aggregate taxonomy P/R/F1；
- score MAE/RMSE/bias/nMAE；
- 实验签名。

当前报告固定：

`validationStatus = evidence-only`

即使指标很好，也不会自动把应用中的 `calibrationStatus` 改成 `validated`。

## 9. Reference-answer contamination

带参考答案的 case 仍需验证：

- Stage 1–4 输入不包含 reference answer；
- 有/无 reference answer 时前四阶段不应被污染；
- Stage 5 差异不能自动改分。

Model Run 额外记录 `referenceCrossCheckUsed`，避免把有/无 Stage 5 的实验混在同一报告中。

## 10. 当前数据目录

- `benchmark/cases/debug/`：3 个 adjudicated synthetic debug fixtures；无人工分数，不进入 score calibration；
- `benchmark/cases/calibration/`：未来真实独立人工标注的 calibration cases；
- `benchmark/cases/holdout/`：冻结后的独立最终验证 cases。

当前 debug fixtures 覆盖：

- hit / partial / missed；
- `OMISSION`；
- `PARTIAL_COVERAGE`；
- `OVER_ABSTRACTION`；
- `MECHANISM_LOSS`。

## 11. 真实训练记录进入 benchmark

1. 用 `createBenchmarkDraft()` 从真实题目 + 一次真实作答生成 draft；
2. gold 四个区块保持空白；
3. 独立人工材料盲抽；
4. 人工 rubric adjudication；
5. 人工 answer mapping + taxonomy；
6. 记录真实 human scores；
7. 改为 `annotationStatus = adjudicated`；
8. 固定 calibration / holdout split；
9. 运行模型并用 `createBenchmarkModelRun()` 冻结原始输出；
10. 另建 Human Alignment；
11. 计算指标并生成 validation report。

## 12. `validated` 的含义

`calibrationStatus = validated` 不由“程序能跑”触发。至少要有独立 validation report，说明：

- benchmark 覆盖题型、难度和样本量；
- 人工标注者与一致性；
- rubric recall/precision/F1；
- mapping coverage/status accuracy；
- taxonomy 可靠范围；
- score MAE/RMSE/系统偏差；
- holdout 独立性；
- 已知失败边界。

在这些证据形成前，产品继续显示“实验/未校准评分”。

## 13. 当前代码入口

- `src/grading/benchmark/types.ts`：Human Gold / Model Run / Alignment / metrics 类型；
- `createDraft.ts`：真实题目/答案生成 annotation draft；
- `modelRun.ts`：冻结模型原始输出和实验 provenance；
- `validateCase.ts`：gold case 与 annotation lifecycle 检查；
- `metrics.ts`：rubric / mapping / taxonomy / score 指标；
- `validationReport.ts`：同实验签名汇总报告；
- `benchmark/cases/debug/`：debug gold fixtures；
- `src/grading/benchmark/*.test.ts`：全套回归测试。
