import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import VersionModal from "@/shared/components/modals/system/VersionModal"
import FullSettingsModal from "@/shared/components/modals/settings/FullSettingsModal"
import FsmSelect from "@/shared/components/modals/settings/shared/FsmSelect"
import { getAppVersion, APP_NAME_TO_KEY } from '@/shared/components/modals/settings/shared/appChangelogs'
import FriendsModal from "@/shared/components/modals/social/FriendsModal"
import NotificationsModal from "@/shared/components/modals/social/NotificationsModal"
import ProfileModal from "@/shared/components/modals/social/ProfileModal"
import { useNotifications } from '@/shared/hooks/social/useNotifications'
import { accentColorStore } from '@/shared/stores/ui/accentColorStore'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { usePremium } from '@/shared/hooks/user/usePremium'
import { supabase } from '@/shared/lib/infra/supabase'
import './Settings.css'

// inEditor : true quand le panneau est ouvert depuis l'éditeur (via
// EditorModalsHost). Affiche alors les deux raccourcis Notifications + Amis
// en haut du panneau — absents sur l'accueil pour ne pas dupliquer les
// boutons déjà présents en haut à droite de HomeContent.
//
// disableFullSettings : si true, le bouton « Afficher tous les paramètres »
// est rendu désactivé (gris + cursor not-allowed + tooltip « Bientôt
// disponible ») et FullSettingsModal n'est jamais monté. Utilisé par JacDoc
// qui veut le même panneau Paramètres que JacPDF mais sans la modale
// complète (pas encore portage pour JacDoc).
//
// appName : nom affiché sous le nom utilisateur dans le bandeau du haut.
// Par défaut « JacPDF » pour ne pas casser l'appel existant ; JacDoc passe
// « JacDoc ».
export default function Settings({
  onClose,
  inEditor = false,
  disableFullSettings = false,
  appName = 'JacPDF',
}) {
  const navigate = useNavigate()
  // useAuth s'abonne déjà à onAuthStateChange — quand FullSettingsModal
  // appelle updateUser pour modifier full_name ou avatar_url, le user ici
  // se rafraîchit automatiquement et le menu reflète le changement sans
  // qu'on ait à le rouvrir.
  const { user } = useAuth()
  // Abonnement — statut premium + ouverture de la PremiumModal (montée à la
  // racine via App.jsx). Le libellé du bouton s'adapte : « Gérer mon
  // abonnement » si déjà premium, sinon « Mise à niveau ».
  const { isPremium, tier, openPremiumModal } = usePremium()
  // Mêmes fallbacks que FullSettingsModal pour garder le nom cohérent entre
  // le petit menu et le gros popup Compte. Priorité : full_name (édité ici)
  // > name (provider OAuth) > user_name (Twitter/GitHub) > préfixe email.
  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.user_metadata?.user_name
    || user?.email?.split('@')[0]
    || 'Non connecté'
  // Déconnexion réelle : avant le bouton naviguait juste vers '/' sans
  // appeler signOut → l'utilisateur restait techniquement connecté.
  const handleLogout = async () => {
    await supabase.auth.signOut()
    onClose?.()
    navigate('/', { replace: true })
  }
  const [langue, setLangue] = useState('Français')
  // Source de vérité = accentColorStore. useState juste pour le re-render local
  // quand on clique un dot ; le store gère la persistance + l'application des
  // variables CSS sur :root.
  const [accentColor, setAccentColor] = useState(accentColorStore.get())
  // Persiste en localStorage — sinon le toggle revenait à ON à chaque
  // ouverture de Paramètres et la préférence était perdue au refresh.
  // useKeyboardShortcuts lit la même clé à chaque keydown.
  const [shortcutNotifs, setShortcutNotifs] = useState(() =>
    localStorage.getItem('jacpdf_shortcutNotifs') !== 'false'
  )
  const [showVersion, setShowVersion] = useState(false)
  // Phase 1 (Amis) — modal de gestion des amis. Le bouton 👥 du header
  // (visible uniquement quand inEditor=true) ouvre cette modal.
  const [showFriends, setShowFriends] = useState(false)
  // Phase 2 (Notifications) — modal du centre de notifications. Le bouton 🔔
  // du header (visible uniquement quand inEditor=true) ouvre cette modal.
  // Le hook useNotifications est instancié ici pour partager l'état avec le
  // badge non-lu sur le bouton (un seul channel Realtime).
  const [showNotifs, setShowNotifs] = useState(false)
  const notifsState = useNotifications(user?.id)
  // Master kill-switch social — quand OFF, on cache le bouton Amis dans le
  // header du panneau et on filtre les types friend_request/friend_accepted/
  // chat_message du compteur de notifications.
  const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
  useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])
  // Flag de « raccourci direct vers FullSettingsModal » : posé par d'autres
  // parties de l'app (ex. bouton « Paramètres de sauvegarde » dans le menu
  // DriveSaveIndicator, qui veut ouvrir directement la catégorie Cloud sans
  // passer par le petit panneau intermédiaire). Lu UNE fois au mount via
  // useState lazy : si présent, on ouvre FullSettingsModal tout de suite et
  // on se rappelle d'aussi fermer le petit panneau quand le full se ferme.
  // Le flag lui-même est consommé plus loin par FullSettingsModal pour choisir
  // la catégorie active — on ne le supprime PAS ici.
  const [openedViaShortcut] = useState(() => {
    try { return !!localStorage.getItem('jacpdf_settings_initial_cat') } catch { return false }
  })
  const [showFullSettings, setShowFullSettings] = useState(openedViaShortcut)
  // Nettoyage du flag de raccourci APRÈS le premier render. À ce moment-là
  // FullSettingsModal a déjà été monté (showFullSettings=true) et a eu
  // l'occasion de lire la catégorie initiale via son propre useState lazy.
  // Sans ce cleanup, le flag restait en localStorage et toute réouverture
  // ultérieure du panneau « Réglages » rouvrait aussi FullSettingsModal en
  // même temps que le petit panneau (bug remonté : un clic → deux modales).
  useEffect(() => {
    if (!openedViaShortcut) return
    try { localStorage.removeItem('jacpdf_settings_initial_cat') } catch {}
  }, [openedViaShortcut])
  // Modale Profil — ouverte au clic sur l'avatar/nom dans le bandeau
  // utilisateur ci-dessous. Contenu à définir avec l'utilisateur ;
  // pour l'instant la modale affiche juste un placeholder.
  const [showProfile, setShowProfile] = useState(false)

  // Libellé du bouton de version (et tag dans le popup) — dérivé du
  // changelog central via getAppVersion. Plus jamais à mettre à jour ici :
  // chaque app gère son numéro dans appChangelogs.js et ce composant
  // synchronise automatiquement.
  const versionAppKey = APP_NAME_TO_KEY[appName] || 'jacsuite'
  const versionLabel = `Version ${getAppVersion(versionAppKey)}`

  // Apps dont le bouton paramètres est dans le pied de leur sidebar (bas-
  // gauche de l'écran) : on ouvre le panneau Paramètres juste au-dessus du
  // bouton plutôt qu'en haut à droite. JacPDF/JacDoc/JacSuite gardent le
  // comportement historique (haut-droit, ancré sous la barre d'onglets).
  const isSidebarApp = appName === 'JacTâche' || appName === 'JacCalendrier' || appName === 'JacNote'

  // JacNote permet de basculer la sidebar à droite (réglage Apparence).
  // Quand c'est le cas, le bouton Paramètres bouge en bas-droite et le
  // panneau doit également s'ouvrir là (miroir de bottom-left).
  // Lu depuis localStorage + abonnement à 'jacsuite:settingsChanged' pour
  // un changement en live sans devoir rouvrir le panneau.
  const [jacnoteSidebarPosition, setJacnoteSidebarPosition] = useState(() => {
    try { return localStorage.getItem('jacnote_settings_sidebar_position') || 'left' }
    catch { return 'left' }
  })
  useEffect(() => {
    if (appName !== 'JacNote') return
    const sync = () => {
      try { setJacnoteSidebarPosition(localStorage.getItem('jacnote_settings_sidebar_position') || 'left') }
      catch {}
    }
    window.addEventListener('jacsuite:settingsChanged', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('jacsuite:settingsChanged', sync)
      window.removeEventListener('storage', sync)
    }
  }, [appName])

  const panelVariantClass = isSidebarApp
    ? (appName === 'JacNote' && jacnoteSidebarPosition === 'right'
        ? 'sp-panel sp-panel--bottom-right'
        : 'sp-panel sp-panel--bottom-left')
    : 'sp-panel'

  return (
    <>
      <div className="sp-backdrop" onClick={onClose} />

      <div className={panelVariantClass}>

        {/* User — avatar + nom alimentés par useAuth (Supabase). Reflètent
            en temps réel les changements faits dans FullSettingsModal
            (avatar upload + édition de nom). */}
        <div className="sp-user">
          {/* Avatar + nom cliquables — ouvrent ProfileModal. Style inline
              pour ne pas casser le layout flex existant : le bouton se
              comporte comme une zone flex (avatar + info) avec gap 10px,
              flex:1 pour prendre l'espace restant comme l'ancien sp-user-info. */}
          <button
            type="button"
            className="sp-user-trigger"
            onClick={() => setShowProfile(true)}
            title="Voir mon profil"
            style={ {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: 8,
            } }
          >
            <div className="sp-user-info">
              {/* Nom + médaillon de palier (💎 Premium / ⚡ Pro). Le badge
                  Premium accompagne le cosmétique doré du profil. */}
              <span className="sp-name-row">
                <span className="sp-name">{displayName}</span>
                {tier === 'premium' && (
                  <span className="sp-tier-badge sp-tier-badge--premium" title="Membre Premium">💎</span>
                )}
                {tier === 'pro' && (
                  <span className="sp-tier-badge sp-tier-badge--pro" title="Membre Pro">⚡</span>
                )}
              </span>
              <span className="sp-app">{appName}</span>
            </div>
          </button>
          {/* Raccourcis Notifications + Amis — visibles uniquement quand le
              panneau est ouvert depuis l'éditeur. Placés à côté du bouton de
              déconnexion (style icône neutre, taille identique). Amis branché
              à FriendsModal (Phase 1) ; Notifications encore placeholder
              (Phase 2 à venir). */}
          {inEditor && (() => {
            // Filtre social : quand le kill-switch est OFF, on retire les notifs
            // sociales du compteur ET on cache entièrement le bouton Amis.
            const visibleUnread = socialEnabled
              ? notifsState.unreadCount
              : (notifsState.notifications || []).filter(n =>
                  !n.read_at &&
                  n.type !== 'friend_request' &&
                  n.type !== 'friend_accepted' &&
                  n.type !== 'chat_message'
                ).length
            return (
              <>
                <button
                  className="sp-header-icon-btn"
                  title="Notifications"
                  onClick={() => setShowNotifs(true)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  {visibleUnread > 0 && (
                    <span className="sp-header-icon-badge">
                      {visibleUnread > 9 ? '9+' : visibleUnread}
                    </span>
                  )}
                </button>
                {socialEnabled && (
                  <button
                    className="sp-header-icon-btn"
                    title="Amis"
                    onClick={() => setShowFriends(true)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </button>
                )}
              </>
            )
          })()}
          <button className="sp-logout" onClick={handleLogout} title="Se déconnecter">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>

        <h2 className="sp-title">Paramètres</h2>

        {/* Langue */}
        <div className="sp-section">
          <div className="sp-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span>Langue</span>
          </div>
          <div className="sp-content">
            <FsmSelect
              value={langue}
              onChange={setLangue}
              options={[
                { value: 'Français', label: 'Français', icon: '🇫🇷' },
                { value: 'English', label: 'English', icon: '🇬🇧' },
              ]}
            />
          </div>
        </div>

        {/* Afficher tous les paramètres — ouvre le gros popup style Kami.
            Quand disableFullSettings=true (cas JacDoc), le bouton reste visible
            pour conserver l'UI identique à JacPDF, mais il est disabled,
            grisé, cursor not-allowed et ne monte jamais FullSettingsModal. */}
        <div className="sp-section">
          <button
            type="button"
            className="sp-row sp-row-all"
            onClick={disableFullSettings ? undefined : () => setShowFullSettings(true)}
            disabled={disableFullSettings}
            title={disableFullSettings ? 'Bientôt disponible' : undefined}
            style={disableFullSettings ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            <div className="sp-row-left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"/>
                <polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/>
                <line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
              <span>Afficher tous les paramètres</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Abonnement — ouvre la PremiumModal (root, via App.jsx) qui présente
            tous les plans (Gratuit / Pro / Premium) et leurs fonctionnalités.
            Libellé adaptatif selon le statut premium. */}
        <div className="sp-section">
          <button
            type="button"
            className="sp-row sp-row-all"
            onClick={() => openPremiumModal()}
          >
            <div className="sp-row-left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 2 8.5 12 22 22 8.5 12 2"/>
                <line x1="2" y1="8.5" x2="22" y2="8.5"/>
                <line x1="12" y1="2" x2="12" y2="22"/>
              </svg>
              <span>{isPremium ? 'Gérer mon abonnement' : 'Mise à niveau'}</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Crédits */}
        <div className="sp-section">
          <div className="sp-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span>Crédits</span>
          </div>
          <div className="sp-content sp-credits">
            <div className="sp-credit-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>Jacob Veilleux</span>
            </div>
            <div className="sp-credit-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              <span>Claude Opus 4.8</span>
            </div>
            <button className="sp-version-btn" onClick={() => setShowVersion(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              {versionLabel}
            </button>
            <p className="sp-copyright">© {new Date().getFullYear()} JacSuite — Tous droits réservés</p>
          </div>
        </div>

      </div>

      {showVersion && <VersionModal onClose={() => setShowVersion(false)} appName={appName} />}
      {showFriends && <FriendsModal onClose={() => setShowFriends(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showNotifs && (
        <NotificationsModal
          onClose={() => setShowNotifs(false)}
          state={notifsState}
        />
      )}
      {!disableFullSettings && showFullSettings && (
        <FullSettingsModal
          appName={appName}
          langue={langue}
          setLangue={setLangue}
          accentColor={accentColor}
          setAccentColor={setAccentColor}
          shortcutNotifs={shortcutNotifs}
          setShortcutNotifs={setShortcutNotifs}
          onClose={() => {
            setShowFullSettings(false)
            // Si on a ouvert via le raccourci (ex. « Paramètres de sauvegarde »),
            // l'utilisateur n'a jamais voulu voir le petit panneau Settings
            // — on le ferme aussi pour qu'il revienne directement à l'éditeur.
            if (openedViaShortcut) onClose?.()
          }}
        />
      )}
    </>
  )
}