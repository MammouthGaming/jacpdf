import { useJacSuiteSetting, useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'

// Réglages rappels & notifications du calendrier. 'enabled' est le kill-switch
// global : si false, tout le pipeline de rappels d'événements doit être inactif.
export function useJacCalendrierReminders() {
  return {
    enabled: useJacSuiteBool('jaccalendrier_settings_reminders_enabled', true),
    sound: useJacSuiteSetting('jaccalendrier_settings_reminder_sound', 'default'),
    systemNotifications: useJacSuiteBool('jaccalendrier_settings_system_notifications', true),
    notifyEventStart: useJacSuiteBool('jaccalendrier_settings_notify_event_start', true),
    dailyDigest: useJacSuiteBool('jaccalendrier_settings_daily_digest', false),
    dailyDigestTime: useJacSuiteSetting('jaccalendrier_settings_daily_digest_time', '08:00'),
  }
}