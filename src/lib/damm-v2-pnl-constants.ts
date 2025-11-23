// Constants for DAMM v2 P&L tracking
// All magic numbers are defined with clear explanations

// Cache durations (milliseconds)
export const POOL_METRICS_CACHE_DURATION_MS = 3 * 60 * 1000 // 3 minutes (per Meteora API guidelines)
export const TOKEN_PRICE_CACHE_DURATION_MS = 10 * 60 * 1000 // 10 minutes (Jupiter price cache)
export const PNL_DATA_CACHE_DURATION_MS = 60 * 1000 // 1 minute for P&L calculations

// Snapshot settings
export const SNAPSHOT_INTERVAL_HOURS = 1 // Take snapshot every hour
export const MAX_SNAPSHOTS_PER_POSITION = 2160 // 90 days of hourly data (90 * 24)
export const CHART_DATA_POINTS_DEFAULT = 30 // Default number of chart data points

// Tracking thresholds
export const MIN_POSITION_VALUE_USD_TRACKING = 0.01 // Don't track positions below $0.01

// LocalStorage keys
export const STORAGE_KEY_POSITION_ENTRIES = 'damm-v2-position-entries'
export const STORAGE_KEY_POSITION_EXITS = 'damm-v2-position-exits'
export const STORAGE_KEY_POSITION_SNAPSHOTS = 'damm-v2-position-snapshots'
export const STORAGE_KEY_CLAIMED_FEES = 'damm-v2-claimed-fees'

// API endpoints
export const METEORA_DAMM_V2_API_BASE = 'https://amm-v2.meteora.ag' // Base URL for DAMM v2 API
export const JUPITER_PRICE_API_BASE = 'https://lite-api.jup.ag/price/v3' // Jupiter Price API v3 (lite for better availability)

// Timeframe configurations
export const TIMEFRAME_CONFIG = {
  '1H': {
    durationMs: 60 * 60 * 1000, // 1 hour
    intervalMs: 2 * 60 * 1000, // 2-minute intervals
    numPoints: 30,
  },
  '1D': {
    durationMs: 24 * 60 * 60 * 1000, // 1 day
    intervalMs: 30 * 60 * 1000, // 30-minute intervals
    numPoints: 48,
  },
  '1W': {
    durationMs: 7 * 24 * 60 * 60 * 1000, // 1 week
    intervalMs: 4 * 60 * 60 * 1000, // 4-hour intervals
    numPoints: 42,
  },
  '1M': {
    durationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    intervalMs: 24 * 60 * 60 * 1000, // Daily intervals
    numPoints: 30,
  },
  '1Y': {
    durationMs: 365 * 24 * 60 * 60 * 1000, // 1 year
    intervalMs: 7 * 24 * 60 * 60 * 1000, // Weekly intervals
    numPoints: 52,
  },
  MAX: {
    durationMs: 365 * 24 * 60 * 60 * 1000, // Max 1 year for now
    intervalMs: 7 * 24 * 60 * 60 * 1000, // Weekly intervals
    numPoints: 52,
  },
} as const

// React Query retry configuration
export const RETRY_DELAY_MS_BASE = 1000 // Base delay for exponential backoff
export const MAX_RETRY_DELAY_MS = 30000 // Maximum retry delay (30 seconds)
export const MAX_RETRIES = 3 // Maximum number of retries
