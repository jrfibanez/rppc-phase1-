export const BACKOFF = [5_000, 15_000, 60_000, 300_000]
export const MAX_ATTEMPTS = 10
export const nextDelay = (attempts: number) => BACKOFF[Math.min(Math.max(attempts, 1) - 1, BACKOFF.length - 1)]
