# 申论评分 Benchmark / Calibration 方案 v0.1

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

## 2. Gold case 的最小结构

每个 case 固定保存：

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

## 3. 数据 split

支持：

- `debug`：用于修 schema、validator、prompt bug；
- `calibration`：用于选择 prompt、reasoning effort、模型和 score policy；
- `holdout`：最终验证，日常调参不得反复查看结果并据此修改 policy。

同一道题的同源答案、轻微改写答案、同一考生的重复版本原则上不得跨 calibration / holdout，以减少信息泄漏。

## 4. Rubric 对齐纪律

模型生成的 rubric 文本不会机械等于人工 canonical label。

因此正式指标计算前必须建立：

`predicted rubric point -> gold rubric point`

的显式 alignment。

alignment 可以由：

1. 人工 adjudication；
2. 后续独立 alignment judge + 人工复核；
3. 高置信度规则映射。

完成，但不能直接靠标题字符串相等。

每条 alignment 可记录：

- predictedRubricPointId；
- goldRubricPointId；
- confidence：high / medium / low；
- alignment notes。

低置信度 alignment 不应混入最终自动评价而不做人工检查。

## 5. 核心指标

### A. 材料与 rubric 层

首阶段先做人工审计型指标：

- 独立信息维度遗漏；
- 无材料依据的新增维度；
- 过度合并；
- 不合理拆分；
- 要素类型错误；
- 机制/限定丢失。

这部分不能仅靠字符串匹配，第一版以人工 adjudication 为主。

### B. 答案映射层

对完成 gold alignment 的 rubric points 计算：

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

对具有人类分数 observation 的 case 计算：

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

## 6. 比较模型/推理强度

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

## 7. Calibration 与 holdout

score policy 只能在 calibration split 上调整。

进入 holdout 前冻结：

- ruleset；
- stage prompts；
- schema；
- model/provider；
- reasoning effort；
- score policy。

holdout 结果不理想时，应记录失败原因并进入下一版本开发，而不是在同一 holdout 上反复调到好看。

## 8. `validated` 的含义

`calibrationStatus = validated` 不应由“程序能跑”触发。

至少需要形成一份版本化 validation report，回答：

- benchmark 覆盖哪些题型和难度；
- 有多少独立人工标注；
- 人工标注者一致性如何；
- 模型在哪些维度表现可靠；
- 哪些 error taxonomy 仍不可靠；
- score MAE/RMSE/系统偏差是多少；
- holdout 是否独立；
- 当前已知失败边界是什么。

在这些证据形成前，应用只能显示“实验/未校准评分”。

## 9. 当前代码入口

- `src/grading/benchmark/types.ts`：gold case、aligned prediction、指标类型；
- `src/grading/benchmark/validateCase.ts`：gold case 完整性检查；
- `src/grading/benchmark/metrics.ts`：mapping、taxonomy、score calibration 指标；
- `src/grading/benchmark/benchmark.test.ts`：validator 与指标回归测试。

下一步不是先追求大样本数量，而是先用少量高质量 case 把标注协议、对齐规则和 adjudication 流程跑通，再扩大 benchmark。
