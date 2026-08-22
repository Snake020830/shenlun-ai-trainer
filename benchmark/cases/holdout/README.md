# Holdout cases

This directory is reserved for adjudicated cases used only for final evaluation.

## Isolation rules

- `annotationStatus` must be `adjudicated`.
- `split` must be `holdout`.
- Cases must contain real human score observations if they are used for score-error metrics.
- Prompt wording, taxonomy definitions, rubric construction rules and score policy must not be tuned after reviewing holdout results.
- Do not move difficult calibration failures into holdout or easy holdout cases into calibration.
- If a holdout gold label is later found wrong, record the correction and reason explicitly; do not silently edit history.

A holdout case may still include a teacher/institution reference answer, but gold annotation remains material-first and independently adjudicated.
