# Debug benchmark cases

These files are **synthetic debug fixtures**, not calibration data.

They are derived from the repository's built-in questions and are used to verify that the grading pipeline can distinguish:

- complete coverage vs partial coverage vs omission;
- high-level wording vs sufficiently grounded material detail;
- a named mechanism vs a mechanism whose key actors/actions have been dropped;
- viewpoint dimensions that should remain separate instead of being over-merged.

## Important boundary

`gold.humanScores` is intentionally empty in these fixtures. The validator should therefore accept each case with a warning that score calibration cannot use it.

Do not populate synthetic assessor scores just to make MAE/RMSE available. Numeric calibration must use independently human-scored cases in `calibration` / `holdout` splits.

## Current fixtures

- `jqh-001.partial-service.json`: two rubric points hit, project-service mechanism only partially covered.
- `nmy-002.omission-professionalism.json`: propagation and innovation-vs-tradition covered, practitioner professionalism omitted.
- `fp-003.partial-system-analysis.json`: data sharing and collaboration covered, multi-dimensional poverty-cause analysis over-abstracted.
