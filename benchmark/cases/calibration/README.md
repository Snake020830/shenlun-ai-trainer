# Calibration cases

This directory is reserved for **real, independently human-annotated申论 cases** used to tune scoring policy.

A case may enter this directory only after:

1. the original question/materials and one real student answer are snapshotted;
2. at least one human annotator expands material information points without seeing model output;
3. material points are adjudicated into a gold rubric;
4. every gold rubric point is mapped to `hit / partial / missed` for the student answer;
5. error taxonomy labels are adjudicated with evidence;
6. at least one human score observation is recorded for score calibration;
7. `annotationStatus` is changed from `draft` to `adjudicated`;
8. `split` is explicitly set to `calibration`.

## Prohibited shortcuts

- Do not copy model output into gold fields and then call it human annotation.
- Do not treat an institution/teacher reference answer as the only truth source.
- Do not fabricate human scores for synthetic or repository debug questions.
- Do not move a case from `calibration` to `holdout` after examining holdout model performance.
- Do not tune prompts or score policy on holdout cases.

## Recommended scoring evidence

Prefer two independent human scores when practical. If only one score exists, record the assessor/provenance rather than inventing a second observation.

Reference answers may be stored in the question snapshot, but remain Stage-5 cross-check evidence and must not replace material-first gold annotation.
