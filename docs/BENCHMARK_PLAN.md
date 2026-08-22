# 申论评分 Benchmark / Calibration 方案 v0.2

## 1. 为什么必须有 benchmark

当前 remote workflow 已经可以真实调用模型，但 `equal-rubric-diagnostic@0.1.0` 仍是开发期诊断 policy。

在没有人工 gold set 之前，以下说法都不能成立：

- “模型能准确抽出材料全部要点”；
- “模型会正确合并评分点”；
- “hit / partial / missed 判断稳定”；
- “错误分类准确”；
- “数值分数接近真实阅卷”；
- “更高 reasoning effort 一定更好”。

因此模型、prompt、reasoning effort 和 score policy 都必须在同一套人工 benchmark 上比较。

## 2. 数据对象严格分三层

### Layer A：Benchmark Case / Human Gold

保存题目快照、真实考生答案以及独立人工标注结果。

case 有明确生命周期：

- `annotationStatus: draft`：只完成题目/答案快照，gold 尚未完成；
- `annotationStatus: adjudicated`：人工材料点、rubric、答案映射已经完成 adjudication。

任何 evaluation metric 都拒绝使用 draft case。

### Layer B：Benchmark Model Run

保存模型原始输出，不做 gold 化改写：

- 模型自己的 rubric id / title / evidence；
- 模型自己的 hit / partial / missed；
- 模型自己的 error codes / diagnosis；
- predicted score；
- provider / model / ruleset / scoring policy / generatedAt。

Model Run 是不可变实验记录。人工对齐不得覆盖或修改原始 run。

### Layer C：Human Alignment

在 Model Run 与 Human Gold 之间建立显式对齐。

rubric alignment 与 answer mapping alignment 分开处理，避免把“模型漏 rubric 点”和“考生漏答案点”混为同一错误。

## 3. Gold case 的最小结构

### 题目快照

- 题型；
- 分值；
- 字数限制；
- 题干；
- 完整材料；
- 可选老师/机构参考答案。

### 考生答案

保存原始答案，不先修改、不做标准化重写。

### 人工材料点

每个候选信息点必须有：

- canonical id；
- material id；
- canonical label；
- element type；
- evidence；
- 是否独立信息维度；
- 必要的 adjudication notes。

### 人工 rubric

每个 rubric point 必须回指人工材料点和证据。允许通过 `acceptableMergeGroup` 标记“多种归并方式都合理”的情况，避免把唯一一种人工分组误当成绝对答案。

### 人工答案映射

对每个 gold rubric point 标：

- `hit / partial / missed`；
- expected error taxonomy；
- 可选 answer excerpt；
- adjudication notes。

### 人工分数

允许多个 assessor 独立打分。benchmark 不把第一个人的分数直接当真值；score calibration 默认与该 case 的人工评分均值比较，同时保留原始 observation 以分析阅卷者分歧。

## 4. 数据 split

支持：

- `debug`：用于修 schema、validator、prompt bug；
- `calibration`：用于选择 prompt、reasoning effort、模型和 score policy；
- `holdout`：最终验证，日常调参不得反复查看结果并据此修改 policy。

同一道题的同源答案、轻微改写答案、同一考生的重复版本原则上不得跨 calibration / holdout，以减少信息泄漏。

`score calibration` 只接受：

- `annotationStatus = adjudicated`；
- split 为 `calibration` 或 `holdout`；
- 至少存在一个真实 human score observation。

debug case 即使人为填入分数也不得用于 score calibration。

## 5. Rubric 对齐纪律

模型 rubric 文本不会机械等于人工 canonical label，因此不能直接靠标题字符串相等。

每个 Model Run 必须先声明模型生成的全部 `predictedRubricPointIds`，再建立 `rubricAlignments`。

允许三类关系：

- `match`：1 个 gold ↔ 1 个 predicted；
- `acceptable-merge`：多个 gold ↔ 1 个 predicted；
- `acceptable-split`：1 个 gold ↔ 多个 predicted。

每个 gold/predicted rubric id 只能进入一个 alignment group，避免重复计数。

alignment 可以由：

1. 人工 adjudication；
2. 后续独立 alignment judge + 人工复核；
3. 高置信度规则映射。

低置信度 alignment 不应混入最终自动评价而不做人工检查。

## 6. 核心指标

### A. Rubric 质量

在显式 rubric alignment 后计算：

- gold rubric recall；
- predicted rubric precision；
- rubric F1；
- unmatched gold rubric ids；
- unmatched predicted rubric ids。

这层回答的是：**模型自己构造的评分框架有没有漏点、乱加点。**

例如模型漏掉一个 gold rubric，但对剩余 rubric 的学生答案判断全对：

- rubric recall 会下降；
- mapping accuracy 可以仍然很高；
- 两者不会互相掩盖。

### B. 答案映射层

只对 rubric alignment 已覆盖的 gold points 计算：

- mapping coverage；
- exact status accuracy；
- `hit / partial / missed` confusion matrix。

重点观察危险错误：

- gold missed -> predicted hit；
- gold partial -> predicted hit；
- gold hit -> predicted missed。

### C. Error taxonomy

按 aligned rubric point 计算：

- micro precision；
- micro recall；
- micro F1；
- FP/FN 数量。

后续样本足够后再增加 per-code F1，避免小样本时输出误导性百分比。

### D. Score calibration

对具有人类分数 observation 的 adjudicated calibration/holdout case 计算：

- MAE；
- RMSE；
- mean signed error（系统性偏严/偏松）；
- normalized MAE（除以题目满分）。

不能只看相关系数：高度相关但整体偏高/偏低仍然是错误评分器。

### E. 稳定性

同一 case 在相同模型/规则下重复运行，检查：

- rubric 维度是否剧烈变化；
- hit/partial/missed 是否反复跳变；
- score 波动；
- error taxonomy 波动。

### F. Reference-answer contamination

对带参考答案的 case 验证：

- Stage 1–4 输入不包含 reference answer；
- 同一题在有/无 reference answer 条件下，前四阶段结果应保持一致；
- Stage 5 差异不得自动重算分数。

当前代码已经有静态请求隔离测试；真实 provider benchmark 仍需验证实际输出隔离。

## 7. 当前数据目录

- `benchmark/cases/debug/`：仓库内置模拟题形成的 adjudicated debug fixtures；无人工分数，不参与 score calibration。
- `benchmark/cases/calibration/`：真实、独立人工标注并用于调参的 case。
- `benchmark/cases/holdout/`：冻结后只做最终验证的 case。

当前 debug fixtures 已覆盖：

- hit；
- partial；
- missed；
- `OMISSION`；
- `PARTIAL_COVERAGE`；
- `OVER_ABSTRACTION`；
- `MECHANISM_LOSS`。

## 8. 真实题进入 benchmark 的流程

1. 从真实训练题目和一次真实答案生成 benchmark draft；
2. draft 只保存题目、材料、答案、参考答案快照，gold 保持空白；
3. 人工材料盲抽；
4. 人工 rubric adjudication；
5. 人工 answer mapping + taxonomy；
6. 记录真实 human score observations；
7. `annotationStatus` 改为 `adjudicated`；
8. 固定 split；
9. 运行模型，保存 immutable Model Run；
10. 人工完成 rubric alignment；
11. 再计算 rubric/mapping/taxonomy/score 指标。

## 9. 比较模型/推理强度

比较模型时固定：

- ruleset version；
- benchmark split；
- prompt/schema version；
- score policy；
- provider protocol；
- reference-answer 条件。

再分别比较：

- provider/model；
- reasoning effort；
- 运行成本/延迟；
- 失败率；
- 结构化 JSON 合规率；
- 上述质量指标。

不能因为某模型“写得更像老师”就认定更好。

## 10. Calibration 与 holdout

score policy 只能在 calibration split 上调整。

进入 holdout 前冻结：

- ruleset；
- stage prompts；
- schema；
- model/provider；
- reasoning effort；
- score policy。

holdout 结果不理想时，应记录失败原因并进入下一版本开发，而不是在同一 holdout 上反复调到好看。

## 11. `validated` 的含义

`calibrationStatus = validated` 不应由“程序能跑”触发。

至少需要形成一份版本化 validation report，回答：

- benchmark 覆盖哪些题型和难度；
- 有多少独立人工标注；
- 人工标注者一致性如何；
- rubric recall/precision/F1；
- mapping coverage 与 status accuracy；
- 哪些 error taxonomy 可靠、哪些仍不可靠；
- score MAE/RMSE/系统偏差；
- holdout 是否独立；
- 当前已知失败边界。

在这些证据形成前，应用只能显示“实验/未校准评分”。

## 12. 当前代码入口

- `src/grading/benchmark/types.ts`：gold case、model run、alignment 与指标类型；
- `src/grading/benchmark/createDraft.ts`：真实题目/答案生成 annotation draft；
- `src/grading/benchmark/modelRun.ts`：冻结模型原始 rubric/mapping/score 输出；
- `src/grading/benchmark/validateCase.ts`：gold case 完整性与 annotation lifecycle 检查；
- `src/grading/benchmark/metrics.ts`：rubric、mapping、taxonomy、score calibration 指标；
- `src/grading/benchmark/*.test.ts`：validator、fixture、draft、model-run 与指标回归测试。

下一步不是追求 case 数量，而是把少量真实训练记录按上述流程完整走一遍，再扩大 benchmark。
