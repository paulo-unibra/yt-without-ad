export function sleepDeadline(minutes: number, now = Date.now()): number {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
    throw new Error('Informe um tempo de 1 a 720 minutos.');
  }
  return now + minutes * 60_000;
}

export function remainingSleepSeconds(deadline: number | null, now = Date.now()): number {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function formatSleepTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
