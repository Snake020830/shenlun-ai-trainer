from __future__ import annotations

import csv
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from pypdf import PdfReader


DOWNLOADS = Path(r"C:\Users\86187\Downloads")
PDF_PATH = DOWNLOADS / "2027版大作文专项班.pdf"
SUBTITLE_NAMES = [
    "2ee6d0c8020a290f5402c6a5c6254975",
    "c2aba27d808fd59cbd6f7bb7892131ab",
    "a558a6aa37d057b84319a2c242a38b38",
    "4d5aef0b3416c2c9abf24738dbf25236",
    "38a4c7578e3b2da1fbe2732bb0b9d655",
    "9359c80e209f90d030e4b14876f754cd",
    "9392fe4a49f97a2f595f5e9f092b254d",
    "8804e2e85eb85296581696cda534761d",
    "ace941d73500b200ba644757868f20d6",
    "3070b7c4affa0785d6aa81a88add65c9",
    "711742163ca2b5c4c3296628b02b67e3",
    "e8dfce60cbaf932a17926ed9223d8548",
    "a6236500ad53a88c0d5fbedc0f704e57",
    "fc7eace44901c13b269e4307f9c95409",
    "a292591caa19c9c16b026bce6cfa4698",
    "8e71773dbb65864379a16c51056690ad",
    "eaf199121139c7213f121e7e7e86f5a5",
    "06333a1e0801c80b451e3205bf860ad4",
    "f49086de85b5524923f29f7bceff487a",
    "bfc59652e4f504e81c2181faab7de996",
    "0fca948ccd0d0e26e05c038632ec9662",
    "0fd4fa7627a97421c605b3e443d4d4b0",
    "1fa4688480422da30c81cd4d6ab9ad93",
]

ROOT = Path(__file__).resolve().parent
CORPUS_DIR = ROOT / "corpus"
PDF_TEXT_PATH = ROOT / "lecture-notes-pages.txt"
METADATA_PATH = ROOT / "subtitle-metadata.csv"
OUTLINE_PATH = ROOT / "lecture-notes-outline.json"


TIME_RE = re.compile(
    r"(?P<sh>\d{2}):(?P<sm>\d{2}):(?P<ss>\d{2})[,.](?P<sms>\d{3})"
    r"\s*-->\s*"
    r"(?P<eh>\d{2}):(?P<em>\d{2}):(?P<es>\d{2})[,.](?P<ems>\d{3})"
)


@dataclass
class SubtitleMeta:
    source_name: str
    cue_count: int
    duration_seconds: float
    character_count: int
    first_12_minutes: str
    last_5_minutes: str


def to_seconds(hours: str, minutes: str, seconds: str, millis: str) -> float:
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def parse_srt(path: Path) -> tuple[list[tuple[float, float, str]], str]:
    raw = path.read_text(encoding="utf-8-sig")
    blocks = re.split(r"\r?\n\s*\r?\n", raw.strip())
    cues: list[tuple[float, float, str]] = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        time_index = next((i for i, line in enumerate(lines) if TIME_RE.fullmatch(line)), None)
        if time_index is None:
            continue
        match = TIME_RE.fullmatch(lines[time_index])
        assert match is not None
        start = to_seconds(match["sh"], match["sm"], match["ss"], match["sms"])
        end = to_seconds(match["eh"], match["em"], match["es"], match["ems"])
        text = " ".join(lines[time_index + 1 :]).strip()
        if text and text != "此字幕由AI自动生成":
            cues.append((start, end, text))

    transcript_lines = [f"[{format_time(start)}] {text}" for start, _, text in cues]
    return cues, "\n".join(transcript_lines) + "\n"


def format_time(seconds: float) -> str:
    total = int(seconds)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def join_cues(cues: list[tuple[float, float, str]], start: float, end: float) -> str:
    return "".join(text for cue_start, _, text in cues if start <= cue_start < end)


def extract_subtitles() -> list[SubtitleMeta]:
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[SubtitleMeta] = []
    for name in SUBTITLE_NAMES:
        path = DOWNLOADS / name
        cues, transcript = parse_srt(path)
        (CORPUS_DIR / f"{name}.txt").write_text(transcript, encoding="utf-8")
        duration = max((end for _, end, _ in cues), default=0.0)
        rows.append(
            SubtitleMeta(
                source_name=name,
                cue_count=len(cues),
                duration_seconds=round(duration, 3),
                character_count=sum(len(text) for _, _, text in cues),
                first_12_minutes=join_cues(cues, 0, min(duration, 720)),
                last_5_minutes=join_cues(cues, max(0, duration - 300), duration + 1),
            )
        )

    with METADATA_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(rows[0]).keys()))
        writer.writeheader()
        writer.writerows(asdict(row) for row in rows)
    return rows


def extract_pdf() -> None:
    reader = PdfReader(PDF_PATH)
    with PDF_TEXT_PATH.open("w", encoding="utf-8") as handle:
        for page_index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            handle.write(f"\n\n===== PDF PAGE {page_index} =====\n\n")
            handle.write(text)

    outline = []
    for item in reader.outline:
        if isinstance(item, list):
            continue
        try:
            page_number = reader.get_destination_page_number(item) + 1
        except Exception:
            page_number = None
        outline.append({"title": str(item.get("/Title", "")), "pdf_page": page_number})
    OUTLINE_PATH.write_text(json.dumps(outline, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    rows = extract_subtitles()
    extract_pdf()
    total_hours = sum(row.duration_seconds for row in rows) / 3600
    print(f"Extracted {len(rows)} subtitle files ({total_hours:.2f} hours).")
    print(f"Wrote {PDF_TEXT_PATH.name}, {METADATA_PATH.name}, and {OUTLINE_PATH.name}.")


if __name__ == "__main__":
    main()
