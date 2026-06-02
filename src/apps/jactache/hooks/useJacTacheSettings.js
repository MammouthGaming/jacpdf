import { useJacSuiteSetting, useJacSuiteBool, useJacSuiteNumber } from '@/shared/hooks/useJacSuiteSetting'

// Bundle des réglages JacTâche : Général + Tâches & défauts + Cloud.
// Toutes les valeurs proviennent de FullSettingsModal (clés jactache_settings_*)
// et se resynchronisent automatiquement via 'jacsuite:settingsChanged'.
export function useJacTacheSettings() {
  return {
    // Général
    defaultView: useJacSuiteSetting('jactache_settings_default_view', 'today'),
    defaultList: useJacSuiteSetting('jactache_settings_default_list', 'inbox'),
    weekStart: useJacSuiteSetting('jactache_settings_week_start', 'monday'),
    openOnLogin: useJacSuiteBool('jactache_settings_open_on_login', false),
    confirmDelete: useJacSuiteBool('jactache_settings_confirm_delete', true),
    reopenLastList: useJacSuiteBool('jactache_settings_reopen_last_list', true),
    // Tâches & défauts
    defaultPriority: useJacSuiteSetting('jactache_settings_default_priority', 'none'),
    defaultDurationMinutes: useJacSuiteNumber('jactache_settings_default_duration', 30),
    todayDefaultTime: useJacSuiteSetting('jactache_settings_today_default_time', 'morning'),
    dateFormat: useJacSuiteSetting('jactache_settings_date_format', 'relative'),
    autoArchiveDays: useJacSuiteSetting('jactache_settings_auto_archive', '7'),
    // Cloud
    backupLocation: useJacSuiteSetting('jactache_settings_backup_location', 'jacsuite'),
    autoSync: useJacSuiteBool('jactache_settings_auto_sync', true),
    offlineCopy: useJacSuiteBool('jactache_settings_offline_copy', true),
    conflictMode: useJacSuiteSetting('jactache_settings_conflict_mode', 'ask'),
  }
}