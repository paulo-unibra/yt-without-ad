export function shouldCaptureMiniPlayerDrag(dx: number, dy: number): boolean {
  return dy > 12 && dy > Math.abs(dx) * 1.4;
}

export function shouldMinimizePlayer(dy: number, vy: number): boolean {
  return dy >= 64 || (dy >= 28 && vy > 0.7);
}
