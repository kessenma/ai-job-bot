export const EUR_TO_USD = 1.175

export function parseRange(s: string): { min: number; max: number } | null {
  // Strip commas (thousand separators) first, then replace non-numeric chars with spaces
  const nums = s.replace(/,/g, '').replace(/[^0-9.-]/g, ' ').trim().split(/\s+/).map(Number).filter((n) => !isNaN(n) && n > 0)
  if (nums.length === 0) return null
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: nums[0], max: nums[1] }
}

export function formatRange(min: number, max: number): string {
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
  return min === max ? fmt(min) : `${fmt(min)}-${fmt(max)}`
}
