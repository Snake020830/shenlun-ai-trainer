# 袁东老师大作文课程资料整理

本目录把用户提供的 23 份无扩展名 SRT 字幕与《2027 版大作文专项班》讲义进行了只读抽取、去重和章节匹配。

## 主要成果

- [COURSE_MAP.md](COURSE_MAP.md)：字幕—讲义章节映射、课程顺序、重复文件说明。
- [YUANDONG_ESSAY_METHOD.md](YUANDONG_ESSAY_METHOD.md)：课程核心方法、考场流程和 AI 教练转化建议。
- [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md)：课程证据如何进入题库训练、独立评分合同和批改报告。
- [subtitle-metadata.csv](subtitle-metadata.csv)：每份字幕的时长、条目数和开头/结尾片段。
- [lecture-notes-outline.json](lecture-notes-outline.json)：PDF 书签与实际页码。
- [analysis-aids.json](analysis-aids.json)：重复度、关键词页码和 TF-IDF 页面匹配结果。

## 可复现抽取

```powershell
python docs\yuandong-course-research\extract_course.py
python docs\yuandong-course-research\analyze_course.py
```

`corpus/` 保存带时间戳的字幕纯文本；`lecture-notes-pages.txt` 保存逐页提取的讲义文本。源文件始终从下载目录只读读取。
