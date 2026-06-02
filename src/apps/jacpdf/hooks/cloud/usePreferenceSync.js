import { useEffect } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import {
  loadUserPreferences,
  saveUserPreferencesDebounced,
  flushPendingUserPreferences,
} from "@/shared/lib/user/userPreferences"
import { themeStore } from "@/shared/stores/ui/themeStore"
import { accentColorStore } from "@/shared/stores/ui/accentColorStore"
import { toolbarSettingsStore } from "@/shared/stores/ui/toolbarSettingsStore"

// Map UI theme labels → DB enum (check constraint sur user_preferences.theme).
const THEME_TO_DB = { 'Sombre': 'dark', 'Clair': 'light', 'Auto': 'auto' }
const THEME_FROM_DB = { dark: 'Sombre', light: 'Clair', auto: 'Auto' }

// Hook de synchronisation des préférences utilisateur entre localStorage et
// Supabase. Au login : hydrate les stores locaux depuis la dernière copie
// cloud. À chaque changement de store : push debounced vers Supabase.
//
// Stratégie : localStorage = source de vérité côté UI (lecture/écriture
// instantanée). Supabase = source de vérité cross-device. À chaque login on
// hydrate localStorage avec ce qui est en DB ; ensuite chaque write local
// est répliqué vers DB en arrière-plan.
//
// Au signup d'un nouveau compte, la rangée user_preferences est créée par le
// trigger handle_new_user avec les défauts du schéma. TODO connu : si le
// localStorage a déjà des valeurs custom (utilisé en mode invité avant
// création du compte), elles seront overwrite par les défauts de la DB au
// premier login. À traiter en Phase 1.5.
export function usePreferenceSync() {
  const { user } = useAuth()

  // Hydratation au login : tire les préférences cloud et les pousse dans les
  // stores locaux. Skippé pour les utilisateurs anonymes (Continuer sans
  // compte) — pas de rangée user_preferences créée pour eux.
  useEffect(() => {
    if (!user || user.is_anonymous) return
    let cancelled = false
    loadUserPreferences(user.id).then((prefs) => {
      if (cancelled || !prefs) return
      if (prefs.theme && THEME_FROM_DB[prefs.theme]) {
        themeStore.set(THEME_FROM_DB[prefs.theme])
      }
      if (prefs.accent_color) {
        accentColorStore.set(prefs.accent_color)
      }
      if (prefs.toolbar_settings) {
        toolbarSettingsStore.set(prefs.toolbar_settings)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [user])

  // Subscriptions sortantes : à chaque changement de store, push debounced
  // vers Supabase. Pas de subscriptions tant qu'aucun user ni quand anonymous.
  useEffect(() => {
    if (!user || user.is_anonymous) return

    const unsubs = []

    unsubs.push(themeStore.subscribe((theme) => {
      const dbTheme = THEME_TO_DB[theme]
      if (dbTheme) {
        saveUserPreferencesDebounced(user.id, { theme: dbTheme })
      }
    }))

    unsubs.push(accentColorStore.subscribe((color) => {
      saveUserPreferencesDebounced(user.id, { accent_color: color })
    }))

    unsubs.push(toolbarSettingsStore.subscribe((settings) => {
      saveUserPreferencesDebounced(user.id, { toolbar_settings: settings })
    }))

    return () => {
      // Flush avant cleanup : si l'user vient de modifier qqchose et qu'on
      // se démonte (logout, refresh, etc.), on veut que la dernière modif
      // arrive en DB.
      flushPendingUserPreferences()
      unsubs.forEach(u => u?.())
    }
  }, [user])
}