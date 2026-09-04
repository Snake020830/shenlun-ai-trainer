from __future__ import annotations

import csv
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bailu_extract", ROOT / "extract_corpus.py")
extractor = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(extractor)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    manifest_path = ROOT / "corpus-manifest.csv"
    conversion_path = ROOT / "legacy-conversion-manifest.csv"
    manifest = read_csv(manifest_path)
    conversions = {
        row["RelativePath"]: row
        for row in read_csv(conversion_path)
        if row["Status"] == "已转换"
    }

    success = 0
    failed = 0
    for row in manifest:
        conversion = conversions.get(row["RelativePath"])
        if row["Status"] != "待转换" or not conversion:
            continue
        converted = Path(conversion["ConvertedPath"])
        digest = conversion["SHA256"]
        target = extractor.CORPUS_DIR / extractor.safe_name(row["RelativePath"], digest)
        try:
            text, units = extractor.extract_docx(converted)
            header = (
                f"来源：{row['RelativePath']}\n"
                f"课程：{row['Course']}\n"
                f"资料角色：{row['Role']}\n"
                f"SHA256（原 DOC）：{digest}\n"
                "说明：本语料由旧版 DOC 的只读 DOCX 副本抽取；〔色/高亮/粗体〕标记来自原文字格式。\n\n"
            )
            target.write_text(header + text, encoding="utf-8")
            row["Status"] = "已抽取（DOC转换）"
            row["Units"] = str(units)
            row["Characters"] = str(len(text))
            row["SHA256"] = digest
            row["CorpusFile"] = str(target.relative_to(ROOT))
            success += 1
        except Exception as exc:
            row["Status"] = f"DOC抽取失败:{type(exc).__name__}:{exc}"
            failed += 1

    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=extractor.MANIFEST_FIELDS)
        writer.writeheader()
        writer.writerows(manifest)
    print(f"legacy_extracted={success} failed={failed}")


if __name__ == "__main__":
    main()
