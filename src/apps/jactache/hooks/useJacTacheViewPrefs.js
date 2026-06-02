import { useJacSuiteSetting, useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'

// Préférences visuelles + comportement des vues/listes (Apparence + Vues & filtres).
// Consommé par JacTacheList, JacTacheItem, JacTacheSidebar.
export function useJacTacheViewPrefs() {
  return {
    // Apparence
    density: useJacSuiteSetting('jactache_settings_density', 'comfortable'),
    showSubtasks: useJacSuiteBool('jactache_settings_show_subtasks', true),
    showProjectAvatar: useJacSuiteBool('jactache_settings_show_project_avatar', true),
    checkboxStyle: useJacSuiteSetting('jactache_settings_checkbox_style', 'rounded'),
    checkAnimation: useJacSuiteBool('jactache_settings_check_animation', true),
    // Vues & filtres
    todaySortBy: useJacSuiteSetting('jactache_settings_today_sort_by', 'time'),
    hideCompleted: useJacSuiteBool('jactache_settings_hide_completed', true),
    defaultGroupBy: useJacSuiteSetting('jactache_settings_default_group_by', 'date'),
    showSidebarCounts: useJacSuiteBool('jactache_settings_show_sidebar_counts', true),
  }
}