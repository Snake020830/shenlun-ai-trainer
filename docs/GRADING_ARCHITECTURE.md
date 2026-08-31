# 申论评分架构 v0.1

## 1. 目的

真实 AI 接入后，不允许把“整段材料 + 考生答案 + 给个分数”作为唯一工作流。

系统采用 **规则层 → 工作流层 → provider 层 → 结构化 review → 持久化快照** 的分层设计。provider 负责模型调用，规则层决定判断纪律，UI 只消费最终结构化结果。

## 2. 五阶段评分流程

### Stage 1：材料盲抽（Material Extraction）

输入：题干、材料、题型、分值、字数限制。

输出：候选信息点集合，每点包含：

- 原始材料定位；
- 主体；
- 动作/状态；
- 对象；
- 初步要素类型；
- 机制/限定；
- 是否可能为独立得分维度。

此阶段不得读取机构/老师参考答案，也不得读取考生答案，避免答案反向塑造评分框架。

### Stage 2：评分框架构造（Rubric Construction）

在盲抽结果上执行：

1. 同类归并；
2. 异类分开；
3. 多对象分别归属；
4. 检查抽象层级；
5. 保留机制层与微观层；
6. 根据题目分值和字数形成可执行 rubric。

此阶段先保证材料覆盖，再考虑压缩，不追求机械的固定条目数。

### Stage 3：答案映射（Answer Mapping）

把考生答案与 rubric 逐点比对，输出：

- `hit`；
- `partial`；
- `missed`；
- 考生对应表达；
- 材料依据；
- 错误 taxonomy；
- 修改方向。

判断基于语义与关系，不以关键词共现替代语义匹配。

### Stage 4：字数与表达审计（Budget & Expression Audit）

独立检查：

- 是否超字数；
- 是否用大量字数重复同一点；
- 是否保留过多例证/背景；
- 是否存在有点无句或有句无点；
- 在字数压力下是否错误删除独立维度。

修改建议遵循“先压点内表达，最后才删独立维度”。

### Stage 5：参考答案交叉验证（Reference Cross-check）

若用户提供机构答案/老师答案，在前四阶段完成后才进入。

作用：

- 找出盲抽可能遗漏的材料维度；
- 比较合理的归类粒度；
- 标记机构答案与材料之间可能存在的取舍；
- 形成差异说明。

参考答案不是唯一真值，不允许把它逐词拆解后反向评分。

## 3. 分层职责

### `rules/`

稳定、模型无关：

- `shenlun-grading.md`：评分方法论；
- `error-taxonomy.json`：错误分类。

### `src/grading/`

运行时 contract：

- `contracts.ts`：`GradingRequest / GradingProvider / StructuredReview` 验证；
- `mockProvider.ts`：V0.1 产品交互模拟器；
- `index.ts`：当前 grading service 入口。

未来真实 provider 必须通过同一 contract，禁止页面直接调用模型 SDK。

### UI

UI 只知道：

```text
question + answer -> gradingService.grade() -> StructuredReview
```

UI 不知道 provider URL、模型名、prompt 格式或 API key。

### Persistence

训练记录保存完整 `StructuredReview` JSON 快照，包括：

- score/maxScore；
- points；
- engine；
- providerId；
- rulesetVersion；
- generatedAt。

规则或模型升级后，不重算既有记录。

## 4. 真实 provider 的最低要求

一个真实 provider 上线前至少满足：

1. 输出通过 `validateReview`；
2. 能标记自身 provider/model 身份；
3. 明确使用的 ruleset 版本；
4. 模型异常、JSON 无效、分数越界时 fail closed，不生成历史记录；
5. API key 不写入源码、Git、训练记录或日志；
6. 参考答案必须作为 Stage 5 输入，而不是 Stage 1 的先验标准；
7. 不向用户展示或持久化模型私有 chain-of-thought，只保存可审计的结构化材料依据和诊断。

## 5. V0.1 与真实 AI 的边界

当前 `mock-v0.1` 仅用于验证：

- 作答流程；
- review UI；
- snapshot；
- 错题复盘；
- provider contract。

它的关键词规则不属于正式评分能力。只有五阶段工作流、规则 contract 和真实模型验证完成后，才能把结果标记为 AI 批改。

## 6. 下一步

1. 为五阶段定义中间结构化 schema；
2. 建立 OpenAI-compatible provider adapter，但默认关闭；
3. 设置页只保存 provider 配置，不保存明文密钥到普通 SQLite；
4. 用人工批改样本做一致性测试；
5. 达到门槛后才允许切换默认 grading provider。
