import { useState, useEffect } from 'react'
import '../FullSettingsModal.css'
import FsmSelect from '../shared/FsmSelect'
import { supabase } from '@/shared/lib/infra/supabase'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import { socialPreferencesStore } from '@/shared/stores/social/socialPreferencesStore'
import { clearActivity } from '@/shared/lib/user/userActivityRepo'
import { deleteAllMyMessages } from '@/shared/lib/social/chatRepo'
import { listFriendships } from '@/shared/lib/social/friendshipsRepo'
import { loadMySocialPreferences, upsertMySocialPreferences, serverRowToStorePatch } from '@/shared/lib/social/socialPreferencesRepo'
import BlockedUsersModal from '@/shared/components/modals/social/BlockedUsersModal'
import ActivityVisibilityModal from '@/shared/components/modals/social/ActivityVisibilityModal'

export default function SocialeSection({ user, setAccountInfo }) {
  // Master kill-switch des fonctionnalités sociales (cf. socialEnabledStore.js).
  // Quand false, l'UI sociale disparaît : activité des amis sur la home,
  // bouton Amis dans la barre du haut, section Amis dans ShareModal, etc.
  // Toggle dans la section Paramètres > Sociale, persisté en localStorage.
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])
  // Préférences sociales granulaires (privacy, notifs, chat, feed, gestion).
  // Indépendant du master kill-switch ci-dessus : reste lisible/modifiable
  // même quand social=off, mais toute la sous-UI est cachée dans ce cas.
  const [socialPrefs, setSocialPrefs] = useState(() => socialPreferencesStore.get())
  useEffect(() => socialPreferencesStore.subscribe(setSocialPrefs), [])
  // Phase B — rehydrate les 4 prefs server-mirrored au mount + à chaque
  // changement d'utilisateur connecté. Si la row n'existe pas encore (user
  // n'a jamais touché à ces réglages), on garde les défauts du store local.
  useEffect(() => {
    if (!user?.id) return
    loadMySocialPreferences().then(row => {
      if (row) socialPreferencesStore.setMany(serverRowToStorePatch(row))
    }).catch(err => {
      if (import.meta.env.DEV) console.warn('[SocialeSection] loadMySocialPreferences failed', err)
    })
  }, [user?.id])
  // Phase B — wrapper pour les 4 prefs server-mirrored : update local +
  // UPSERT server-side. En cas d'erreur server, on log via accountInfo mais
  // on garde la valeur locale (l'UI reste responsive).
  const setServerMirroredPref = async (key, value) => {
    socialPreferencesStore.set(key, value)
    try {
      await upsertMySocialPreferences({ [key]: value })
    } catch (err) {
      setAccountInfo(`Erreur sync préférence : ${err?.message || err}`)
    }
  }
  // State pour la modal Utilisateurs bloqués (ouverte depuis le bouton
  // « Gérer la liste des bloqués » dans la sous-section Gestion des amis).
  const [showBlockedModal, setShowBlockedModal] = useState(false)
  // Phase B Étape 2 — State pour la modal Visibilité d'activité (ouverte
  // depuis le bouton « Choisir qui voit mon activité » dans Confidentialité).
  const [showActivityVisibilityModal, setShowActivityVisibilityModal] = useState(false)

  return (
    <>
      <div className="fsm-section">
        <h3 className="fsm-section-title">Social</h3>
        <p className="fsm-section-sub">Amis, activité, notifications et confidentialité sociale</p>
        {/* Kill-switch master en haut de la section. Quand off, toute
            l'UI sociale est masquée (bouton Amis, activité des amis,
            section Amis dans ShareModal). État géré par socialEnabledStore. */}
        <div className="fsm-toggle-row">
          <div>
            <label className="fsm-label">Fonctionnalités sociales</label>
            <p className="fsm-label-sub">
              {socialEnabled
                ? "Active l'activité des amis, le bouton Amis dans la barre du haut, et la section Amis dans Partager."
                : "Désactivé : aucune section sociale n'apparaît dans l'interface."}
            </p>
          </div>
          <button
            className={`fsm-toggle ${socialEnabled ? 'on' : ''}`}
            onClick={() => socialEnabledStore.toggle()}
          >
            <span className="fsm-toggle-thumb" />
          </button>
        </div>
        {!socialEnabled && (
          <div className="fsm-perf-warning" style={ { marginTop: 16 } }>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <p className="fsm-perf-warning-title">Mode silencieux actif</p>
              <p className="fsm-perf-warning-text">
                L'activité des amis sur l'accueil, le bouton Amis dans la barre du haut et la section Amis dans la modale de partage sont masqués. Les invitations et accès déjà créés restent valides — seules les surfaces UI sociales sont retirées. Réactivable à tout moment.
              </p>
            </div>
          </div>
        )}
        {socialEnabled && (
          <>
            {/* === Confidentialité & visibilité === */}
            <div className="fsm-divider" />
            <h4 className="fsm-group-title">Confidentialité & visibilité</h4>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Diffuser mon activité aux amis</label>
                <p className="fsm-label-sub">Mes amis voient mon activité dans JacSuite. Désactiver = aucune row écrite dans user_activity.</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.broadcastActivity ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('broadcastActivity', !socialPrefs.broadcastActivity)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            {/* Phase B Étape 2 — visibilité d'activité par ami. Filtrage
                server-side via RLS sur user_activity (cf. is_activity_hidden_from). */}
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              style={ { marginTop: 8 } }
              onClick={() => setShowActivityVisibilityModal(true)}
              disabled={!socialPrefs.broadcastActivity}
              title={!socialPrefs.broadcastActivity
                ? "Active d'abord la diffusion d'activité"
                : 'Choisir individuellement quels amis voient mon activité'}
            >
              Choisir qui voit mon activité
            </button>
            <div className="fsm-field">
              <label className="fsm-label">Niveau de détail de l'activité</label>
              <p className="fsm-label-sub">Ce que mes amis voient quand je suis actif.</p>
              <FsmSelect
                value={socialPrefs.activityDetail}
                onChange={(v) => socialPreferencesStore.set('activityDetail', v)}
                disabled={!socialPrefs.broadcastActivity}
                options={[
                  { value: 'full',     label: 'Tout (activité + nom du fichier)' },
                  { value: 'presence', label: 'Présence seule (en ligne)' },
                  { value: 'none',     label: 'Rien' },
                ]}
              />
            </div>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Apparaître hors ligne</label>
                <p className="fsm-label-sub">Mon dot vert ne s'affiche jamais, même si JacSuite est ouvert.</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.appearOffline ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('appearOffline', !socialPrefs.appearOffline)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-field">
              <label className="fsm-label">
                Qui peut m'envoyer une demande d'ami
              </label>
              <p className="fsm-label-sub">Filtre RLS server-side. Synchronisé avec la table social_preferences.</p>
              <FsmSelect
                value={socialPrefs.whoCanRequest}
                onChange={(v) => setServerMirroredPref('whoCanRequest', v)}
                options={[
                  { value: 'everyone', label: 'Tout le monde' },
                  { value: 'shared',   label: 'Personnes qui ont partagé un fichier avec moi' },
                  { value: 'nobody',   label: 'Personne' },
                ]}
              />
            </div>
            <div className="fsm-field">
              <label className="fsm-label">
                Qui peut m'écrire
              </label>
              <p className="fsm-label-sub">Filtre RLS server-side. Synchronisé avec la table social_preferences.</p>
              <FsmSelect
                value={socialPrefs.whoCanChat}
                onChange={(v) => setServerMirroredPref('whoCanChat', v)}
                options={[
                  { value: 'friends',  label: 'Mes amis seulement' },
                  { value: 'everyone', label: 'Tout le monde' },
                  { value: 'nobody',   label: 'Personne' },
                ]}
              />
            </div>

            {/* === Notifications sociales === */}
            <div className="fsm-divider" />
            <h4 className="fsm-group-title">Notifications sociales</h4>
            <p className="fsm-label-sub" style={ { marginTop: -4, marginBottom: 12 } }>
              Granularité fine — en plus du kill-switch master ci-dessus.
            </p>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Demandes d'ami reçues</label>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.notifFriendRequest ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('notifFriendRequest', !socialPrefs.notifFriendRequest)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Demandes d'ami acceptées</label>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.notifFriendAccepted ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('notifFriendAccepted', !socialPrefs.notifFriendAccepted)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Nouveaux messages chat</label>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.notifChatMessage ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('notifChatMessage', !socialPrefs.notifChatMessage)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Son de notification</label>
                <p className="fsm-label-sub">Joue un son discret quand un nouveau message chat arrive.</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.notifSound ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('notifSound', !socialPrefs.notifSound)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Aperçu du contenu</label>
                <p className="fsm-label-sub">Affiche le texte du message dans la notif (sinon juste « Nouveau message »).</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.notifPreview ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('notifPreview', !socialPrefs.notifPreview)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>

            {/* === Chat === */}
            <div className="fsm-divider" />
            <h4 className="fsm-group-title">Chat</h4>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Accusés de lecture (✓✓)</label>
                <p className="fsm-label-sub">Symétrique : mes amis voient quand j'ai lu leurs messages, ET je vois quand ils ont lu les miens. Désactiver = personne ne voit les ✓✓ dans cette conversation.</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.readReceipts ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('readReceipts', !socialPrefs.readReceipts)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">
                  Indicateur de frappe
                </label>
                <p className="fsm-label-sub">Broadcast Realtime via le channel chat. Mes amis voient « X est en train d'écrire… » pendant que je tape (auto-clear après 3 s d'inactivité).</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.typingIndicator ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('typingIndicator', !socialPrefs.typingIndicator)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">Entrée pour envoyer</label>
                <p className="fsm-label-sub">Sinon Shift+Entrée envoie et Entrée saute une ligne.</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.enterToSend ? 'on' : ''}`}
                onClick={() => socialPreferencesStore.set('enterToSend', !socialPrefs.enterToSend)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <div className="fsm-field">
              <label className="fsm-label">
                Auto-supprimer les messages après
              </label>
              <p className="fsm-label-sub">Cron pg_cron tourne toutes les heures et purge mes messages au-delà du TTL configuré.</p>
              <FsmSelect
                value={socialPrefs.autoDeleteMessages}
                onChange={(v) => setServerMirroredPref('autoDeleteMessages', v)}
                options={[
                  { value: 'never', label: 'Jamais' },
                  { value: '7d',    label: '7 jours' },
                  { value: '30d',   label: '30 jours' },
                  { value: '1y',    label: '1 an' },
                ]}
              />
            </div>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              style={ { color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' } }
              onClick={async () => {
                if (!user?.id) return
                if (!window.confirm("Effacer TOUT l'historique de chat ?\n\nMes messages envoyés seront supprimés côté DB et mes notifs chat_message disparaitront du centre. Les messages reçus des amis restent visibles tant qu'eux-mêmes ne les suppriment pas. Cette action est irréversible.")) return
                try {
                  await deleteAllMyMessages(user.id)
                  setAccountInfo("Historique de chat effacé.")
                } catch (err) {
                  setAccountInfo(`Erreur : ${err?.message || err}`)
                }
              }}
            >
              Effacer tout l'historique de chat
            </button>

            {/* === Activité des amis (feed accueil) === */}
            <div className="fsm-divider" />
            <h4 className="fsm-group-title">Activité des amis (feed accueil)</h4>
            <div className="fsm-field">
              <label className="fsm-label">Nombre d'items affichés</label>
              <FsmSelect
                value={String(socialPrefs.feedMaxItems)}
                onChange={(v) => socialPreferencesStore.set('feedMaxItems', Number(v))}
                options={[
                  { value: '5',  label: '5' },
                  { value: '10', label: '10' },
                  { value: '20', label: '20' },
                  { value: '50', label: '50' },
                ]}
              />
            </div>
            <div className="fsm-field">
              <label className="fsm-label">Garder les activités de moins de</label>
              <FsmSelect
                value={String(socialPrefs.feedFreshness)}
                onChange={(v) => socialPreferencesStore.set('feedFreshness', Number(v))}
                options={[
                  { value: '5',    label: '5 minutes' },
                  { value: '60',   label: '1 heure' },
                  { value: '1440', label: '24 heures' },
                ]}
              />
            </div>
            <div className="fsm-field">
              <label className="fsm-label">Rafraîchissement</label>
              <p className="fsm-label-sub">Manuel = il faut recharger la page pour voir les nouvelles activités.</p>
              <FsmSelect
                value={socialPrefs.feedRefreshMode}
                onChange={(v) => socialPreferencesStore.set('feedRefreshMode', v)}
                options={[
                  { value: 'realtime', label: 'Temps réel' },
                  { value: '30s',      label: 'Toutes les 30 secondes' },
                  { value: 'manual',   label: 'Manuel' },
                ]}
              />
            </div>

            {/* === Gestion des amis === */}
            <div className="fsm-divider" />
            <h4 className="fsm-group-title">Gestion des amis</h4>
            <div className="fsm-toggle-row">
              <div>
                <label className="fsm-label">
                  Auto-accepter les demandes des partageurs
                </label>
                <p className="fsm-label-sub">Trigger server-side : si quelqu'un t'a déjà partagé un fichier et a une demande d'ami pending avec toi, elle bascule automatiquement sur acceptée.</p>
              </div>
              <button
                className={`fsm-toggle ${socialPrefs.autoAcceptShared ? 'on' : ''}`}
                onClick={() => setServerMirroredPref('autoAcceptShared', !socialPrefs.autoAcceptShared)}
              >
                <span className="fsm-toggle-thumb" />
              </button>
            </div>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              style={ { marginTop: 8 } }
              onClick={() => setShowBlockedModal(true)}
            >
              Gérer la liste des bloqués
            </button>

            {/* === Données sociales === */}
            <div className="fsm-divider" />
            <h4 className="fsm-group-title" style={ { color: '#f87171' } }>Données sociales</h4>
            <p className="fsm-label-sub" style={ { marginTop: -4, marginBottom: 12 } }>
              Actions irréversibles. À utiliser avec précaution.
            </p>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              onClick={async () => {
                if (!user?.id) return
                try {
                  const all = await listFriendships(user.id)
                  const friends = (all || []).filter(f => f.status === 'accepted')
                  const exported = {
                    exportedAt: new Date().toISOString(),
                    userId: user.id,
                    friendsCount: friends.length,
                    friends,
                  }
                  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `jacsuite-amis-${new Date().toISOString().slice(0, 10)}.json`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                  setAccountInfo(`${friends.length} ami(s) exportés en JSON.`)
                } catch (err) {
                  setAccountInfo(`Erreur export : ${err?.message || err}`)
                }
              }}
            >
              Exporter ma liste d'amis (JSON)
            </button>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              style={ { marginTop: 8, color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' } }
              onClick={async () => {
                if (!user?.id) return
                if (!window.confirm('Réinitialiser mon activité ? Ma row dans user_activity sera effacée — mes amis ne verront plus ce que je faisais. Le heartbeat re-publiera dès la prochaine action si broadcastActivity est activé.')) return
                try {
                  await clearActivity(user.id)
                  setAccountInfo("Activité réinitialisée.")
                } catch (err) {
                  setAccountInfo(`Erreur : ${err?.message || err}`)
                }
              }}
            >
              Réinitialiser mon activité
            </button>
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              style={ { marginTop: 8, color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' } }
              onClick={async () => {
                if (!user?.id) return
                if (!window.confirm('Supprimer TOUTES mes données sociales (messages, notifs sociales, amitiés, activité) des deux côtés de la base ?\n\nLes partages de fichiers restent intacts. Cette action est IRRÉVERSIBLE.')) return
                try {
                  // Phase B — RPC SECURITY DEFINER qui contourne la RLS pour
                  // faire un wipe two-sided complet en une transaction.
                  const { data, error } = await supabase.rpc('wipe_my_social_data')
                  if (error) throw error
                  const summary = data
                    ? `${data.messages_deleted ?? 0} messages, ${data.notifications_deleted ?? 0} notifs, ${data.friendships_deleted ?? 0} amitiés, ${data.activity_deleted ?? 0} activité`
                    : 'OK'
                  setAccountInfo(`Données sociales effacées : ${summary}.`)
                } catch (err) {
                  setAccountInfo(`Erreur : ${err?.message || err}`)
                }
              }}
            >
              Supprimer toutes mes données sociales
            </button>

            {/* === Reset des préférences === */}
            <div className="fsm-divider" />
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              onClick={() => {
                if (window.confirm('Réinitialiser tous les réglages sociaux à leurs valeurs par défaut ?')) {
                  socialPreferencesStore.reset()
                }
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              Réinitialiser tous les réglages sociaux
            </button>
          </>
        )}
      </div>
      {/* Modales sous-modales — déclenchées par les boutons ci-dessus.
          Si l'utilisateur change d'onglet pendant qu'une modale est ouverte,
          elle se ferme avec la section (SocialeSection unmount). Acceptable :
          le bouton qui l'a ouverte n'est plus visible non plus. */}
      {showBlockedModal && (
        <BlockedUsersModal onClose={() => setShowBlockedModal(false)} />
      )}
      {showActivityVisibilityModal && (
        <ActivityVisibilityModal onClose={() => setShowActivityVisibilityModal(false)} />
      )}
    </>
  )
}