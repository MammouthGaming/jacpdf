import { useJacSuiteSetting, useJacSuiteBool, useJacSuiteNumber } from '@/shared/hooks/useJacSuiteSetting'

// Bundle des réglages JacCalendrier : Général + Événements & défauts + Cloud
// + flags d'intégration. Toutes les valeurs proviennent de FullSettingsModal
// (clés jaccalendrier_settings_*) et se resynchronisent live.
export function useJacCalendrierSettings() {
  return {
    // Général
    defaultView: useJacSuiteSetting('jaccalendrier_settings_default_view', 'week'),
    weekStart: useJacSuiteSetting('jaccalendrier_settings_week_start', 'monday'),
    dayStartHour: useJacSuiteNumber('jaccalendrier_settings_day_start_hour', 7),
    dayEndHour: useJacSuiteNumber('jaccalendrier_settings_day_end_hour', 22),
    timeFormat: useJacSuiteSetting('jaccalendrier_settings_time_format', '24h'),
    openOnLogin: useJacSuiteBool('jaccalendrier_settings_open_on_login', false),
    rememberLastView: useJacSuiteBool('jaccalendrier_settings_remember_last_view', true),
    // Événements & défauts
    defaultEventDurationMinutes: useJacSuiteNumber('jaccalendrier_settings_default_event_duration', 30),
    defaultReminderOffsetMinutes: useJacSuiteSetting('jaccalendrier_settings_default_reminder_offset', '15'),
    defaultCalendar: useJacSuiteSetting('jaccalendrier_settings_default_calendar', 'primary'),
    rememberLastLocation: useJacSuiteBool('jaccalendrier_settings_remember_last_location', true),
    multidayDisplay: useJacSuiteSetting('jaccalendrier_settings_multiday_display', 'continuous'),
    // Cloud
    backupLocation: useJacSuiteSetting('jaccalendrier_settings_backup_location', 'jacsuite'),
    autoSync: useJacSuiteBool('jaccalendrier_settings_auto_sync', true),
    offlineCopy: useJacSuiteBool('jaccalendrier_settings_offline_copy', true),
    conflictMode: useJacSuiteSetting('jaccalendrier_settings_conflict_mode', 'ask'),
    // Intégrations (lus aussi par les bridges JacTâche/JacDoc/Classe)
    integrateJactache: useJacSuiteBool('jaccalendrier_settings_integrate_jactache', true),
    integrateJacdoc: useJacSuiteBool('jaccalendrier_settings_integrate_jacdoc', true),
    integrateClasse: useJacSuiteBool('jaccalendrier_settings_integrate_classe', false),
    integrateJacsuiteNotifs: useJacSuiteBool('jaccalendrier_settings_integrate_jacsuite_notifs', true),
  }
}