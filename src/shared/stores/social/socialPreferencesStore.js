// Préférences sociales granulaires. Persistées en localStorage.
// Indépendant du master kill-switch (socialEnabledStore) qui coupe toute
// l'UI sociale d'un coup ; ici on contrôle finement chaque sous-fonction.
//
// Le store ne fait QUE persister la préférence. La mise en application
// (filter une notif, masquer un dot, couper un broadcast Realtime) est
// la responsabilité de chaque consommateur — chacun importe ce store et
// agit selon la valeur lue.

const KEY = 'jacpdf_socialPrefs'

const DEFAULTS = {
  // ── Confidentialité & visibilité ──
  broadcastActivity: true,        // diffuser mon activité sur user_activity
  activityDetail: 'full',         // 'full' | 'presence' | 'none'
  appearOffline: false,           // dot vert masqué même si actif
  whoCanRequest: 'everyone',      // 'everyone' | 'shared' | 'nobody'  (RLS server-side — bientôt)
  whoCanChat: 'friends',          // 'everyone' | 'friends' | 'nobody'  (RLS — bientôt)

  // ── Notifications sociales granulaires ──
  notifFriendRequest: true,
  notifFriendAccepted: true,
  notifChatMessage: true,
  notifSound: true,
  notifPreview: true,             // afficher contenu du message vs « Nouveau message »

  // ── Chat ──
  readReceipts: true,             // ✓✓ visible aux amis
  typingIndicator: true,          // « X écrit… »  (Realtime broadcast — bientôt)
  enterToSend: true,              // Entrée envoie / Shift+Entrée saute ligne
  autoDeleteMessages: 'never',    // 'never' | '7d' | '30d' | '1y'  (cron — bientôt)

  // ── Feed activité (HomeContent FriendActivityFeed) ──
  feedMaxItems: 10,               // nombre d'items affichés dans le feed
  feedFreshness: 60,              // minutes — items plus vieux sont filtrés
  feedRefreshMode: 'realtime',    // 'realtime' | '30s' | 'manual'

  // ── Gestion des amis ──
  autoAcceptShared: false,        // auto-accepter demande de qqun qui m'a déjà partagé un PDF (trigger — bientôt)
}

// Lecture initiale + merge avec les défauts pour gérer les ajouts de clés
// dans une future version sans casser les utilisateurs existants.
let state = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...DEFAULTS, ...raw }
  } catch (err) {
    if (import.meta.env.DEV) console.error('[socialPrefs] read failed', err)
    return { ...DEFAULTS }
  }
})()

const listeners = new Set()

function emit() {
  for (const fn of listeners) {
    try { fn(state) } catch (err) {
      if (import.meta.env.DEV) console.error('[socialPrefs] listener failed', err)
    }
  }
  // Broadcast cross-component — useKeyboardShortcuts, useFriendsActivity et
  // d'autres hooks écoutent cet event pour relire leurs settings sans avoir
  // à se brancher individuellement à ce store.
  try {
    window.dispatchEvent(new Event('jacpdf_settingsChange'))
  } catch (err) {
    if (import.meta.env.DEV) console.error('[socialPrefs] dispatch failed', err)
  }
}

function persist() {
  // Persiste seulement les overrides (diff par rapport aux défauts) pour
  // garder localStorage léger et permettre un futur changement de défaut
  // sans figer les valeurs anciennes.
  const overrides = {}
  for (const [k, v] of Object.entries(state)) {
    if (v !== DEFAULTS[k]) overrides[k] = v
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides))
  } catch (err) {
    if (import.meta.env.DEV) console.error('[socialPrefs] persist failed', err)
  }
}

export const socialPreferencesStore = {
  /** Snapshot complet (lecture). */
  get: () => state,
  /** Lecture d'une clé précise. */
  getKey: (key) => state[key],
  /** Modifie une clé, persiste et notifie les abonnés. */
  set: (key, value) => {
    if (state[key] === value) return
    state = { ...state, [key]: value }
    persist()
    emit()
  },
  /** Modifie plusieurs clés en une seule notification. */
  setMany: (patch) => {
    let changed = false
    const next = { ...state }
    for (const [k, v] of Object.entries(patch)) {
      if (next[k] !== v) { next[k] = v; changed = true }
    }
    if (!changed) return
    state = next
    persist()
    emit()
  },
  /** Reset complet aux valeurs par défaut. */
  reset: () => {
    state = { ...DEFAULTS }
    try { localStorage.removeItem(KEY) } catch (err) {
      if (import.meta.env.DEV) console.error('[socialPrefs] clear failed', err)
    }
    emit()
  },
  /** Abonnement aux changements. Retourne une fonction de désabonnement. */
  subscribe: (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  /** Exposé pour comparaisons éventuelles côté UI. */
  DEFAULTS,
}