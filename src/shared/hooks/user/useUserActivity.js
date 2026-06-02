import { useEffect, useState } from 'react'
import { setActivity, clearActivity } from "@/shared/lib/user/userActivityRepo"
import { socialPreferencesStore } from "@/shared/stores/social/socialPreferencesStore"
import { socialEnabledStore } from "@/shared/stores/social/socialEnabledStore"

/**
 * Publie l'activité courante de l'utilisateur dans la table user_activity.
 *
 * @param {object} args
 * @param {string|null} args.userId
 * @param {'reading'|'editing'|'idle'} args.type
 * @param {string|null} [args.documentId]
 * @param {string|null} [args.documentName]
 * @param {boolean} [args.enabled=true] — false = ne rien publier (utile pour
 *   les tabs inactifs en multi-tab : seul le tab actif publie).
 */
// Heartbeat 60 s : re-upsert périodique pour bumper updated_at tant que
// l'éditeur est monté et actif. À chaque tick le trigger DB pose
// updated_at = now(), donc useFriendsActivity verra l'ami comme « en ligne »
// (updated_at < 90 s). Quand l'utilisateur ferme l'éditeur (unmount ou
// enabled=false), le heartbeat s'arrête → updated_at fige sur le dernier tick
// → le feed bascule sur « a édité X · il y a N min » jusqu'à 24 h, puis hide.
const HEARTBEAT_MS = 60 * 1000

export function useUserActivity({ userId, type, documentId, documentName, enabled = true }) {
  // Lit le master kill-switch + les préférences sociales granulaires.
  // useState(() => store.get()) + subscribe garantit que le hook réagit
  // aux toggles dans FullSettings sans avoir à remonter le composant.
  const [socialOn, setSocialOn] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialOn), [])
  const [prefs, setPrefs] = useState(() => socialPreferencesStore.get())
  useEffect(() => socialPreferencesStore.subscribe(setPrefs), [])

  // Publie une fois au mount + toutes les 60 s. Pas de clearActivity au
  // unmount classique : on garde la row pour permettre l'affichage
  // « activité récente ». En revanche, si la diffusion devient « muted »
  // (master OFF, broadcastActivity OFF, appearOffline ON, ou
  // activityDetail='none'), on supprime la row existante via clearActivity
  // et on n'écrit plus tant que la mute reste active. Toggle ON ré-écrit
  // immédiatement (heartbeat redeploye).
  useEffect(() => {
    if (!userId || !enabled || !type) return

    const muted = !socialOn
      || !prefs.broadcastActivity
      || prefs.appearOffline
      || prefs.activityDetail === 'none'

    if (muted) {
      clearActivity(userId).catch((err) => {
        if (import.meta.env.DEV) console.warn('[useUserActivity] clearActivity failed', err)
      })
      return
    }

    const presenceOnly = prefs.activityDetail === 'presence'
    const publish = () => {
      setActivity({
        userId,
        type,
        // 'presence' : on garde la row (= dot vert chez l'ami) mais on masque
        // le détail (pas de nom de PDF). 'full' : tout passé normalement.
        documentId: presenceOnly ? null : (documentId || null),
        documentName: presenceOnly ? null : (documentName || null),
      }).catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[useUserActivity] setActivity failed', err)
        }
      })
    }

    publish()
    const interval = setInterval(publish, HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [
    userId, enabled, type, documentId, documentName,
    socialOn, prefs.broadcastActivity, prefs.appearOffline, prefs.activityDetail,
  ])
}