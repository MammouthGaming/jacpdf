import { useJacSuiteSetting, useJacSuiteBool, useJacSuiteNumber } from '@/shared/hooks/useJacSuiteSetting'

// Réglages rappels & notifications. 'enabled' est le kill-switch global :
// quand false, tout le pipeline de rappels doit être inactif. Les autres
// valeurs restent persistées pour retrouver les préférences à la réactivation.
// snoozeDurations est exposé brut (string '10-30-60') ET parsé en array de minutes.
export function useJacTacheReminders() {
  const enabled = useJacSuiteBool('jactache_settings_reminders_enabled', true)
  const snoozeRaw = useJacSuiteSetting('jactache_settings_snooze_durations', '10-30-60')
  const snoozeDurations = snoozeRaw.split('-').map((s) => {
    if (s.endsWith('h')) return Number(s.slice(0, -1)) * 60
    if (s.endsWith('d')) return Number(s.slice(0, -1)) * 1440
    return Number(s)
  }).filter((n) => Number.isFinite(n))
  return {
    enabled,
    defaultReminderOffsetMinutes: useJacSuiteNumber('jactache_settings_default_reminder_offset', 15),
    reminderSound: useJacSuiteSetting('jactache_settings_reminder_sound', 'soft'),
    systemNotifications: useJacSuiteBool('jactache_settings_system_notifications', true),
    dailyDigest: useJacSuiteBool('jactache_settings_daily_digest', true),
    dailyDigestTime: useJacSuiteSetting('jactache_settings_daily_digest_time', '08:00'),
    snoozeDurations,
    snoozeDurationsRaw: snoozeRaw,
  }
}