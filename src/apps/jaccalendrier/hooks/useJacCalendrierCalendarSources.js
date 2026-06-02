import { useJacSuiteJson, useJacSuiteSetting } from '@/shared/hooks/useJacSuiteSetting'

// Liste des calendriers (locaux + iCal) + fréquence de refresh iCal.
// La SourcesSection écrit dans 'jaccalendrier_calendars' (JSON array) et
// dispatch settingsChanged. Ce hook expose des sélecteurs prêts à l'emploi.
const DEFAULT_CALENDARS = [
  { id: 'personnel', name: 'Personnel', color: 'blue', visible: true, type: 'local', isPrimary: true },
  { id: 'travail', name: 'Travail', color: 'orange', visible: true, type: 'local' },
]

export function useJacCalendrierCalendarSources() {
  const calendars = useJacSuiteJson('jaccalendrier_calendars', DEFAULT_CALENDARS) || DEFAULT_CALENDARS
  const refreshFrequencyRaw = useJacSuiteSetting('jaccalendrier_settings_ical_refresh_frequency', '60')
  const refreshFrequencyMinutes = refreshFrequencyRaw === 'manual' ? null : Number(refreshFrequencyRaw)
  return {
    calendars,
    visibleCalendars: calendars.filter((c) => c.visible),
    primaryCalendar: calendars.find((c) => c.isPrimary) || calendars[0] || null,
    icalSubscriptions: calendars.filter((c) => c.type === 'ical'),
    refreshFrequencyRaw,
    refreshFrequencyMinutes,
  }
}