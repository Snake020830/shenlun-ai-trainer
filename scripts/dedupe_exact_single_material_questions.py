from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


DEFAULT_DATABASE = Path(r"C:\Users\86187\AppData\Roaming\com.shenlun.trainer\shenlun-trainer.db")
DEFAULT_BACKUP_DIR = Path(__file__).resolve().parents[1] / "output" / "question-dedupe-backups"


@dataclass(frozen=True)
class Candidate:
    question_id: str
    title: str
    question_type: str
    prompt: str
    material: str
    tags_json: str
    reference_answer: str | None
    created_at: str
    training_count: int

    @property
    def group_key(self) -> tuple[str, str, str]:
        digest = hashlib.sha256(self.material.strip().encode("utf-8")).hexdigest()
        return digest, self.prompt.strip(), self.question_type

    @property
    def recall_like(self) -> bool:
        haystack = f"{self.title} {self.tags_json}"
        return any(marker in haystack for marker in ("回忆", "网友", "考生"))

    @property
    def keep_priority(self) -> tuple[int, int, int, str, str]:
        return (
            int(self.training_count > 0),
            int(bool(self.reference_answer and self.reference_answer.strip())),
            int(not self.recall_like),
            self.created_at,
            self.question_id,
        )


def load_candidates(connection: sqlite3.Connection) -> list[Candidate]:
    rows = connection.execute(
        """
        WITH single AS (
          SELECT question_id, MIN(content) AS content
          FROM materials
          GROUP BY question_id
          HAVING COUNT(*) = 1
        ), training AS (
          SELECT question_id, COUNT(*) AS training_count
          FROM training_records
          GROUP BY question_id
        )
        SELECT q.id, q.title, q.type, q.prompt, s.content, q.tags_json,
               q.reference_answer_content, q.created_at,
               COALESCE(t.training_count, 0)
        FROM single s
        JOIN questions q ON q.id = s.question_id
        LEFT JOIN training t ON t.question_id = q.id
        """
    ).fetchall()
    return [Candidate(*row) for row in rows]


def select_duplicates(candidates: list[Candidate]) -> tuple[list[Candidate], list[Candidate]]:
    groups: dict[tuple[str, str, str], list[Candidate]] = {}
    for candidate in candidates:
        groups.setdefault(candidate.group_key, []).append(candidate)

    keepers: list[Candidate] = []
    removals: list[Candidate] = []
    for group in groups.values():
        if len(group) < 2:
            continue
        ordered = sorted(group, key=lambda item: item.keep_priority, reverse=True)
        keepers.append(ordered[0])
        removals.extend(ordered[1:])
    return keepers, removals


def print_plan(keepers: list[Candidate], removals: list[Candidate]) -> None:
    print(json.dumps({
        "duplicate_groups": len(keepers),
        "questions_to_remove": len(removals),
        "protected_training_records": sum(item.training_count for item in removals),
        "remove_ids": [item.question_id for item in removals],
    }, ensure_ascii=False, indent=2))


def backup_database(source: sqlite3.Connection, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = backup_dir / f"shenlun-trainer-before-exact-dedupe-{timestamp}.db"
    backup = sqlite3.connect(destination)
    try:
        source.backup(backup)
    finally:
        backup.close()
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit or remove exact duplicate single-material questions.")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    uri = f"file:{args.database.as_posix()}?mode={'rw' if args.apply else 'ro'}"
    connection = sqlite3.connect(uri, uri=True, timeout=10)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        keepers, removals = select_duplicates(load_candidates(connection))
        print_plan(keepers, removals)
        if not args.apply:
            return
        if any(item.training_count > 0 for item in removals):
            raise RuntimeError("Refusing to delete a question that has training history.")
        backup_path = backup_database(connection, args.backup_dir)
        before_count = connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        connection.execute("BEGIN IMMEDIATE")
        try:
            connection.executemany("DELETE FROM questions WHERE id = ?", [(item.question_id,) for item in removals])
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        after_count = connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        _, remaining = select_duplicates(load_candidates(connection))
        print(json.dumps({
            "applied": True,
            "backup": str(backup_path),
            "questions_before": before_count,
            "questions_after": after_count,
            "deleted": before_count - after_count,
            "remaining_exact_duplicates": len(remaining),
        }, ensure_ascii=False, indent=2))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
