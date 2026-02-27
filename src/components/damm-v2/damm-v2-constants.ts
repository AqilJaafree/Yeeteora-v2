// src/components/damm-v2/damm-v2-constants.ts

/** Activity thresholds for token categorization */
export const ACTIVITY_THRESHOLDS = {
  HIGH_JUP_DELTA: 20,
  HIGH_TOTAL_DELTA: 200,
  MEDIUM_JUP_DELTA: 10,
  MEDIUM_TOTAL_DELTA: 100,
} as const

/** Organic score thresholds (from Jupiter API) */
export const ORGANIC_SCORE = {
  HIGH_THRESHOLD: 70,
  MEDIUM_THRESHOLD: 40,
} as const

/** Notification settings */
export const NOTIFICATION = {
  COOLDOWN_MS: 30_000, // 30 seconds between alerts per token
  SOUND_PATH: '/sound/noti.mp3',
  ICON_PATH: '/icon.png',
} as const

/** Number formatting thresholds */
export const FORMAT = {
  MILLION: 1_000_000,
  THOUSAND: 1_000,
  LAMPORTS_PER_SOL: 1_000_000_000,
} as const

/** Time constants in seconds */
export const TIME = {
  SECONDS_PER_MINUTE: 60,
  SECONDS_PER_HOUR: 3_600,
} as const
