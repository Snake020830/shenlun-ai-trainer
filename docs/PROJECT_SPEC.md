# 申论 AI Trainer — V0.1 产品规格

## 当前目标

先做一个真正可用的申论训练桌面软件，而不是先做一个聊天式 AI 批改器。

V0.1 验收闭环：

1. 从“今日训练”或“题库”选择题目；
2. 阅读材料并在独立作答区输入答案；
3. 草稿自动保存在本机；
4. 提交后显示结构化模拟批改；
5. 作答记录进入“训练记录”。

真实 AI 评分、错题队列、能力画像、题目导入、SQLite 正式 schema 都留到后续迭代。

## 信息架构

- 今日训练：推荐题、训练连续性、近期状态。
- 题库：题型/标签检索与训练入口。
- 作答工作台：材料、作答、批改三栏；提交前隐藏得分要点。
- 错题复盘：V0.2。
- 训练记录：保存每次作答与得分。
- 设置：V0.2 接模型提供商、本地数据位置等。

## 技术栈

- Desktop: Tauri 2
- Frontend: React + TypeScript + Vite
- Persistence V0.1: persistence adapter + localStorage
- Persistence V0.2: SQLite adapter，保持 UI 调用接口不变
- AI: 后续采用 OpenAI-compatible provider abstraction

## 设计原则

- 正式训练时不提前暴露评分要点，防止提示效应。
- 批改输出必须结构化：分数只是结果，要点—材料依据—修改建议才是核心。
- 所有数据来源、老师答案、模型反馈未来都应保留 provenance。
- UI 不直接依赖具体模型或存储实现。
