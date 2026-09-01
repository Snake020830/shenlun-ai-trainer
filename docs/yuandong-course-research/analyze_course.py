from __future__ import annotations

import json
import re
from itertools import combinations
from pathlib import Path

from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from extract_course import PDF_PATH, ROOT


KEYWORDS = [
    "种树",
    "摘果",
    "轻车",
    "壮马",
    "每件小事",
    "阳光照亮",
    "多样性",
    "创造力",
    "吹得准",
    "吹得响",
    "吹得久",
    "善治",
    "大美",
    "乐居",
    "目标",
    "传统",
    "现代",
    "流动",
    "新生",
    "社区治理",
    "小切口",
    "健康",
    "理论",
    "实践",
    "问题清单",
    "动能",
    "活力",
    "把脉",
    "开方",
    "守正",
    "创新",
]

SECTIONS = [
    ("标题+总论点", 5, 41),
    ("大作文开头", 42, 97),
    ("分论点润色", 98, 108),
    ("寻找分论点", 109, 161),
    ("分论点论证", 162, 183),
    ("大作文结尾", 184, 201),
    ("真题实战1·单主题", 202, 214),
    ("真题实战2·单主题", 215, 225),
    ("真题实战3·单主题", 226, 237),
    ("真题实战4·双主题", 238, 247),
    ("真题实战5·双主题", 248, 258),
    ("真题实战6·双主题", 259, 267),
    ("真题实战7·多主题", 268, 278),
    ("真题实战8·多主题", 279, 288),
    ("真题实战9·多主题", 289, 299),
    ("课后作业1", 300, 313),
    ("课后作业2", 314, 323),
    ("课后作业3", 324, 333),
    ("课后作业4", 334, 344),
]


def normalized_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"\[\d{2}:\d{2}:\d{2}\]", "", text)
    return "".join(re.findall(r"[\u4e00-\u9fff]", text))


def shingles(text: str, width: int = 8) -> set[str]:
    return {text[i : i + width] for i in range(max(0, len(text) - width + 1))}


def transcript_similarity() -> list[dict[str, object]]:
    paths = sorted((ROOT / "corpus").glob("*.txt"))
    sets = {path.stem: shingles(normalized_text(path)) for path in paths}
    matches = []
    for left, right in combinations(sets, 2):
        union = sets[left] | sets[right]
        score = len(sets[left] & sets[right]) / len(union) if union else 0.0
        if score >= 0.15:
            matches.append({"left": left, "right": right, "jaccard_8gram": round(score, 4)})
    return sorted(matches, key=lambda row: row["jaccard_8gram"], reverse=True)


def pdf_keyword_matches() -> dict[str, list[int]]:
    reader = PdfReader(PDF_PATH)
    pages = [(page.extract_text() or "") for page in reader.pages]
    return {
        keyword: [index + 1 for index, text in enumerate(pages) if keyword in text]
        for keyword in KEYWORDS
    }


def tfidf_page_matches() -> list[dict[str, object]]:
    reader = PdfReader(PDF_PATH)
    page_texts = [(page.extract_text() or "") for page in reader.pages]
    transcript_paths = sorted((ROOT / "corpus").glob("*.txt"))
    transcript_texts = [path.read_text(encoding="utf-8") for path in transcript_paths]
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(3, 5), min_df=2, sublinear_tf=True)
    matrix = vectorizer.fit_transform(page_texts + transcript_texts)
    similarities = cosine_similarity(matrix[len(page_texts) :], matrix[: len(page_texts)])

    results = []
    for path, page_scores in zip(transcript_paths, similarities, strict=True):
        top_page_indices = page_scores.argsort()[::-1][:10]
        top_pages = [
            {"pdf_page": int(index + 1), "score": round(float(page_scores[index]), 4)}
            for index in top_page_indices
        ]
        section_scores = []
        for title, start, end in SECTIONS:
            scores = sorted(page_scores[start - 1 : end], reverse=True)
            section_scores.append(
                {
                    "section": title,
                    "score": round(float(sum(scores[: min(3, len(scores))]) / min(3, len(scores))), 4),
                }
            )
        section_scores.sort(key=lambda row: row["score"], reverse=True)
        results.append(
            {
                "source_name": path.stem,
                "top_pages": top_pages,
                "top_sections": section_scores[:5],
            }
        )
    return results


def main() -> None:
    result = {
        "near_duplicate_subtitles": transcript_similarity(),
        "pdf_keyword_pages": pdf_keyword_matches(),
        "tfidf_page_matches": tfidf_page_matches(),
    }
    output = ROOT / "analysis-aids.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {output.name}.")


if __name__ == "__main__":
    main()
