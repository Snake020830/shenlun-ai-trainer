# 申论训练助手 V0.1 验收清单

这份清单用于验收“真实可运行产品”，不是只看代码或 CI。建议每次重要版本都按同一顺序复测，并把发现的问题记录到 PR / Issue。

## A. 安装与启动

- [ ] 从 GitHub Actions 的 Desktop CI 下载最新 `Shenlun-Trainer-Windows-Preview` artifact。
- [ ] 解压并运行其中的 NSIS `-setup.exe` 安装包。
- [ ] 安装名称显示为“申论训练助手 Preview”，不会覆盖未来正式版。
- [ ] 首次启动无白屏、闪退、控制台错误弹窗。
- [ ] 1440×900 窗口下布局完整；缩到 1080×720 后关键操作仍可见。

## B. 今日训练 / 题库

- [ ] 左侧导航可进入：今日训练、题库、错题复盘、训练记录、设置。
- [ ] 今日训练卡片能进入一道题。
- [ ] 题库搜索可按题目、题型或标签筛选。
- [ ] 点击“导入题目”可以手工录入真实题目。
- [ ] 材料用空行分隔后能正确拆成“材料 1 / 材料 2 …”。
- [ ] 可选老师/机构参考答案能保存，但不会在作答阶段显示。

## C. 作答闭环

- [ ] 作答页是三栏：材料 / 题干与答案 / 批改。
- [ ] 提交前右侧不泄露评分要点。
- [ ] 输入答案后草稿会自动保存；退出再进入能恢复。
- [ ] 字数统计正确，超过字数上限有明显提示。
- [ ] 提交后能看到结构化批改结果。
- [ ] 批改结果明确标识当前是否为 mock / remote，以及 `uncalibrated` 状态。
- [ ] 本次提交进入训练记录，历史记录里的 review 是提交时冻结快照。

## D. 复盘与历史

- [ ] 训练记录能看到原始答案、得分、时间和当时的 review snapshot。
- [ ] 点击“再做一次”可以重新进入题目。
- [ ] 错题复盘只聚合 missed / partial 点，不把已覆盖点当错题。

## E. 本地数据

- [ ] 关闭应用再打开：导入题、训练记录、草稿仍存在。
- [ ] 设置页显示桌面端使用 SQLite。
- [ ] 浏览器开发模式仍能 fallback 到 localStorage，不影响桌面数据设计。

## F. Remote AI 安全验收

> 没有 API key 时，本节可以先跳过，不影响其他功能验收。

- [ ] Remote AI 默认关闭。
- [ ] 浏览器模式不能启用需要密钥的远程评分。
- [ ] 桌面版 API key 保存后输入框立即清空。
- [ ] 应用没有任何“读取并显示明文 API key”的入口。
- [ ] “测试连接”只验证连接与结构化 JSON，不宣称评分质量已验证。
- [ ] Remote workflow 失败时不会伪造成功结果。

## G. Benchmark Lab / Human Gold

- [ ] 只有“手工导入的真实题 + 真实作答”自动进入 Benchmark Draft；内置 synthetic 样题不会自动混入。
- [ ] Benchmark Draft 的题目、材料、原始答案与训练时一致。
- [ ] Human Gold 标注页面不读取 AI review。
- [ ] H1：先做材料信息点盲抽。
- [ ] H2：Rubric 必须回指 H1 材料点。
- [ ] H3：逐 Rubric 标 hit / partial / missed。
- [ ] H4：可录入真实人工评分者与分数，并分配 calibration / holdout。
- [ ] H5：完成盲标前参考答案正文不可见；首次揭示时间被记录。
- [ ] 完成 adjudication 后 case 在普通 Lab 中只读。

## H. Model Run / Human Alignment

> 需要已完成 Human Gold 的 case，并配置可用 remote provider。

- [ ] Draft Human Gold 不能运行 benchmark experiment。
- [ ] 每次模型实验生成新的 immutable Model Run，旧 run 不被覆盖。
- [ ] Model Run 冻结 provider / model / protocol / reasoning / workflow / promptset / scoring policy。
- [ ] 默认实验不注入参考答案；只有显式 Stage 5 实验才注入。
- [ ] Human Alignment 只能建立 ID 对应关系，不能修改模型原始 score / status / error code / diagnosis。
- [ ] 真正的模型漏点可以标为 unmatched Gold；模型额外点可以标为 unmatched Predicted，不能被迫硬匹配。
- [ ] Alignment adjudicated 后锁定。
- [ ] Validation report 只接受 adjudicated Human Gold + immutable Model Run + adjudicated Human Alignment。

## I. 视觉与交互验收

- [ ] 页面没有横向溢出、遮挡、元素重叠或按钮被裁切。
- [ ] 主标题、正文、辅助信息的视觉层级清楚，不像“后台管理模板”。
- [ ] 同类卡片、表单、按钮、状态徽章的圆角、间距、字号一致。
- [ ] 危险操作与普通操作视觉上可区分。
- [ ] 长材料、长答案、长 JSON 都有合理滚动区域，不把整页撑坏。
- [ ] Empty / Loading / Error 状态都有明确文案。
- [ ] 训练主流程保持克制，不因 Benchmark / 开发工具显得拥挤；高级功能主要留在设置页。

## 验收结论建议

每次验收只给三种结论：

1. **通过**：核心流程全部通过，只有不影响使用的视觉微调。
2. **有条件通过**：核心功能可用，但存在明确需要修的非阻断问题。
3. **不通过**：安装、数据持久化、作答闭环、评分安全边界或关键页面存在阻断问题。

不要因为 CI 通过就直接判“通过”；CI 只证明自动化检查，不替代真实桌面环境验收。
