import { useJacSuiteSetting, useJacSuiteBool, useJacSuiteNumber } from '@/shared/hooks/useJacSuiteSetting'

// Préférences visuelles. hourHeight pilote la hauteur d'une heure dans les
// vues Jour/Semaine (px) — consommé par JacCalendrierTimedView. gridStyle
// et highlightCurrentTime sont consommés par les vues timed/month.
export function useJacCalendrierViewPrefs() {
  return {
    density: useJacSuiteSetting('jaccalendrier_settings_density', 'normal'),
    showWeekNumbers: useJacSuiteBool('jaccalendrier_settings_show_week_numbers', true),
    showWeekends: useJacSuiteBool('jaccalendrier_settings_show_weekends', true),
    hourHeight: useJacSuiteNumber('jaccalendrier_settings_hour_height', 60),
    defaultEventColor: useJacSuiteSetting('jaccalendrier_settings_default_event_color', 'blue'),
    gridStyle: useJacSuiteSetting('jaccalendrier_settings_grid_style', 'normal'),
    highlightCurrentTime: useJacSuiteBool('jaccalendrier_settings_highlight_current_time', true),
  }
}