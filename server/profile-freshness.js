export const PROFILE_FRESHNESS_REMINDER_DAYS = [60, 120];
export const PROFILE_FRESHNESS_EXPIRY_DAYS = 180;
export const PROFILE_FRESHNESS_STAGES = [...PROFILE_FRESHNESS_REMINDER_DAYS, PROFILE_FRESHNESS_EXPIRY_DAYS];

export function addDays(dateLike, days) {
  return new Date(new Date(dateLike).getTime() + days * 24 * 60 * 60 * 1000);
}

export function getDaysSince(dateLike, now = new Date()) {
  const elapsedMs = new Date(now).getTime() - new Date(dateLike).getTime();
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
}
