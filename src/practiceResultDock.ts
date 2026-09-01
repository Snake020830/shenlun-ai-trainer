export const RESULT_DOCK_MIN_HEIGHT = 112;
export const RESULT_DOCK_DEFAULT_HEIGHT = 300;
export const RESULT_DOCK_ANSWER_MIN_HEIGHT = 180;

export function clampResultDockHeight(height: number, paneHeight: number): number {
  const safePaneHeight = Number.isFinite(paneHeight) ? paneHeight : 0;
  const maximum = Math.max(RESULT_DOCK_MIN_HEIGHT, safePaneHeight - RESULT_DOCK_ANSWER_MIN_HEIGHT - 56);
  return Math.round(Math.min(maximum, Math.max(RESULT_DOCK_MIN_HEIGHT, height)));
}

export function resizedResultDockHeight(startHeight: number, startPointerY: number, pointerY: number, paneHeight: number): number {
  return clampResultDockHeight(startHeight + startPointerY - pointerY, paneHeight);
}
