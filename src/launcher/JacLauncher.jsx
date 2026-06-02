import React, { useEffect, useState } from 'react'
import './JacLauncher.css'
import { useLauncher } from '../shared/hooks/system/useLauncher'
import { usePremium } from '@/shared/hooks/user/usePremium'
import Settings from '@/shared/components/ui/Settings'
import FriendsModal from '@/shared/components/modals/social/FriendsModal'
import NotificationsModal from '@/shared/components/modals/social/NotificationsModal'
import { socialEnabledStore } from '@/shared/stores/social/socialEnabledStore'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useNotifications } from '@/shared/hooks/social/useNotifications'
import FriendActivityFeed from '@/shared/components/social/FriendActivityFeed'
import { recentFilesStore, entryKey } from '@/apps/jacpdf/stores/user/recentFilesStore'
import { jacdocStore } from '@/apps/jacdoc/stores/jacdocStore'
import RoleOnboardingModal from '@/shared/components/modals/settings/RoleOnboardingModal'
import { isOwner, isTester } from '@/shared/lib/user/userRoles'
import { APP_LOGOS, getApp } from '@/shared/lib/apps/appsCatalog'
import { pinnedAppsStore } from '@/shared/lib/apps/pinnedAppsStore'

// Apps + logos : importés du catalogue central src/shared/lib/apps/appsCatalog.
// `enabled` / `beta` / `alpha` sont dérivés de `status`, le cadenas premium de
// `feature`. Ajouter une app = éditer le catalogue, pas ce fichier.

export default function JacLauncher({ userName, onChoose }) {
	const { openApp } = useLauncher()
	const { isFeatureLocked } = usePremium()
	// Phase 4 — si `onChoose` est fourni (par SuiteShell quand le launcher
	// est rendu dans un onglet), il prend précédence sur openApp (qui mute
	// launcherStore + redirige l'app entire). Permet au launcher de servir
	// à la fois en plein écran (legacy) et dans un onglet du shell.
	const handleSelect = (appId) => {
		if (typeof onChoose === 'function') onChoose(appId)
		else openApp(appId)
	}

	// ── Apps épinglées (menu principal personnalisable) ──
	// Le lanceur n'affiche que les apps épinglées (par défaut JacPDF, JacDoc,
	// JacNote — cf. pinnedByDefault du catalogue). Tout le reste est accessible
	// via « Obtenir plus d'apps » → App Store. L'épinglage est persisté en
	// localStorage (jacsuite_pinned_apps) et synchronisé entre onglets.
	const [pinnedIds, setPinnedIds] = useState(() => pinnedAppsStore.get())
	useEffect(() => pinnedAppsStore.subscribe(setPinnedIds), [])
	const pinnedApps = pinnedIds.map(getApp).filter(Boolean)

	// Ouvre l'App Store (onglet plein écran géré par SuiteShell — Phase 4).
	const handleOpenAppStore = () => {
		window.dispatchEvent(new CustomEvent('jacsuite:openAppStore'))
	}

	// ── Boutons en haut à droite ──
	// Repris de HomeContent (accueil JacPDF) — Notifications, Amis et
	// Profil/Paramètres. On omet volontairement le menu « Applications »
	// (grille ⋮⋮) qui est spécifique à JacPDF.
	const [showSettings, setShowSettings] = useState(false)
	const [showFriends, setShowFriends] = useState(false)
	const [showNotifs, setShowNotifs] = useState(false)
	// Bouton de test debug (owner / tester) — déplacé ici depuis l'accueil
	// JacPDF. Force l'ouverture de RoleOnboardingModal sans recréer un compte.
	const [showOnboarding, setShowOnboarding] = useState(false)
	const [forcedOnboarding, setForcedOnboarding] = useState(false)
	const [socialEnabled, setSocialEnabled] = useState(() => socialEnabledStore.get())
	useEffect(() => socialEnabledStore.subscribe(setSocialEnabled), [])
	const { user: currentUser } = useAuth()
	const notifsState = useNotifications(currentUser?.id)
	const displayName = currentUser?.user_metadata?.full_name
		|| currentUser?.user_metadata?.name
		|| currentUser?.user_metadata?.user_name
		|| currentUser?.email?.split('@')[0]
		|| 'Utilisateur'
	const avatarUrl = currentUser?.user_metadata?.avatar_url
	const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
	// Quand le kill-switch social est OFF, on retire les notifs sociales
	// du compteur — sinon le badge afficherait un nombre alors que la modal
	// Notifications masque déjà ces types côté rendu.
	const visibleUnread = socialEnabled
		? notifsState.unreadCount
		: (notifsState.notifications || []).filter((n) =>
				!n.read_at
				&& n.type !== 'friend_request'
				&& n.type !== 'friend_accepted'
				&& n.type !== 'chat_message'
				&& n.type !== 'pdf_access_request',
			).length

	// ── Récents combinés (PDFs + JacDocs) ──
	// PDFs : recentFilesStore (localStorage) — local / Google Drive / JacPDF Cloud.
	// JacDocs : jacdocStore.list() depuis IndexedDB — appel one-shot au mount,
	//   ré-appelé sur visibilitychange pour rattraper les modifs faites dans un
	//   autre onglet du shell.
	const [recentPdfs, setRecentPdfs] = useState(() => recentFilesStore.getAll())
	useEffect(() => recentFilesStore.subscribe(setRecentPdfs), [])
	const [recentDocs, setRecentDocs] = useState([])
	useEffect(() => {
		let cancelled = false
		const refresh = () => {
			jacdocStore.list().then((docs) => {
				if (!cancelled) setRecentDocs(docs || [])
			}).catch(() => {})
		}
		refresh()
		const onVisibility = () => {
			if (document.visibilityState === 'visible') refresh()
		}
		document.addEventListener('visibilitychange', onVisibility)
		return () => {
			cancelled = true
			document.removeEventListener('visibilitychange', onVisibility)
		}
	}, [])

	// Normalise les deux sources dans une seule liste triée par timestamp desc.
	// Cap à 15 entrées pour ne pas faire scroller la page sans fin.
	const combinedRecents = (() => {
		const items = []
		for (const p of recentPdfs) {
			items.push({
				key: `pdf:${entryKey(p)}`,
				kind: 'pdf',
				name: p.name,
				source: p.source,
				timestamp: p.openedAt,
				jacpdfCloudId: p.jacpdfCloudId || null,
				driveFileId: p.driveFileId || null,
				pdfRemoveKey: entryKey(p),
			})
		}
		for (const d of recentDocs) {
			items.push({
				key: `jacdoc:${d.id}`,
				kind: 'jacdoc',
				name: d.title || 'Sans titre',
				source: 'jacdoc',
				timestamp: d.updatedAt,
				docId: d.id,
			})
		}
		return items
			.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
			.slice(0, 15)
	})()

	// Click sur une entrée des récents.
	//  - JacDoc → dispatch jacsuite:openJacDoc (SuiteShell focus-or-create).
	//  - PDF Cloud → bascule l'onglet courant en accueil JacPDF (HomeContent
	//    monte → enregistre son listener) puis dispatch jacpdf:openCloudFile.
	//  - PDF Drive/Local → bascule simplement en accueil JacPDF ; l'utilisateur
	//    recliquera l'entrée depuis ses récents (les hooks Drive / picker OS
	//    sont montés là-bas).
	const handleRecentClick = (entry) => {
		if (entry.kind === 'jacdoc') {
			window.dispatchEvent(new CustomEvent('jacsuite:openJacDoc', {
				detail: { docId: entry.docId, title: entry.name },
			}))
			return
		}
		if (typeof onChoose === 'function') onChoose('jacpdf')
		if (entry.source === 'jacpdfCloud' && entry.jacpdfCloudId) {
			// Délai court pour laisser HomeContent monter et brancher son
			// listener avant que l'event ne soit dispatché.
			setTimeout(() => {
				window.dispatchEvent(new CustomEvent('jacpdf:openCloudFile', {
					detail: { documentId: entry.jacpdfCloudId, name: entry.name },
				}))
			}, 80)
		}
	}

	// Format relatif (« à l'instant », « il y a 5 min »…). Dupliqué ici pour
	// ne pas créer de dépendance croisée avec lib/jacpdf (cf. HomeContent).
	const formatRelative = (iso) => {
		if (!iso) return ''
		const t = new Date(iso).getTime()
		if (!t) return ''
		const diff = Math.max(0, Date.now() - t)
		const mn = Math.floor(diff / 60000)
		if (mn < 1) return "à l'instant"
		if (mn < 60) return `il y a ${mn} min`
		const h = Math.floor(mn / 60)
		if (h < 24) return `il y a ${h} h`
		const d = Math.floor(h / 24)
		if (d === 1) return 'hier'
		if (d < 7) return `il y a ${d} j`
		return new Date(iso).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' })
	}

	return (
		<div className="jac-launcher">
			{(isOwner(currentUser) || isTester(currentUser)) && (
				<button
					className="jac-launcher__debug-onboarding-btn"
					onClick={() => { setForcedOnboarding(true); setShowOnboarding(true) }}
					title="Forcer l'ouverture de la modal d'onboarding rôle (test) — réservé owner / tester"
				>
					🧪 Tester onboarding rôle
				</button>
			)}
			<div className="jac-launcher__top-actions">
				<button
					className="jac-launcher__top-btn"
					title="Notifications"
					aria-label="Notifications"
					onClick={() => setShowNotifs(true)}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
						<path d="M13.73 21a2 2 0 0 1-3.46 0"/>
					</svg>
					{visibleUnread > 0 && (
						<span className="jac-launcher__top-badge">
							{visibleUnread > 99 ? '99+' : visibleUnread}
						</span>
					)}
				</button>
				{socialEnabled && (
					<button
						className="jac-launcher__top-btn"
						title="Amis"
						aria-label="Amis"
						onClick={() => setShowFriends(true)}
					>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
							<circle cx="9" cy="7" r="4"/>
							<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
							<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
						</svg>
					</button>
				)}
				<button
					className="jac-launcher__top-btn jac-launcher__profile-btn"
					title="Paramètres"
					aria-label="Paramètres"
					onClick={() => setShowSettings(true)}
				>
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt=""
							className="jac-launcher__profile-img"
							referrerPolicy="no-referrer"
							onError={(e) => { e.currentTarget.style.display = 'none' }}
						/>
					) : (
						<span className="jac-launcher__profile-initial">{avatarInitial}</span>
					)}
				</button>
			</div>
			<div className="jac-launcher__inner">
				<header className="jac-launcher__header">
					<div className="jac-launcher__brand" aria-label="JacSuite">
						<img
							className="jac-launcher__brand-logo"
							src={APP_LOGOS.jacsuite}
							alt=""
							draggable="false"
						/>
						<span className="jac-launcher__brand-name">JacSuite</span>
					</div>
					<h1 className="jac-launcher__title">
						Bienvenue{userName ? `, ${userName}` : ''} 👋
					</h1>
					<p className="jac-launcher__subtitle">
						Choisis une application pour commencer.
					</p>
				</header>

				<div className="jac-launcher__grid">
					{pinnedApps.map((a) => {
						// Cadenas si l'app est réservée à un palier que l'user n'a pas
						// encore. La carte reste cliquable : SuiteShell ouvre le paywall
						// à l'entrée (gratuit = apps de base ; JacTâche & JacCalendrier
						// en Pro ; JacPaint en Premium).
						const enabled = a.status !== 'coming-soon'
						const locked = enabled && a.feature && isFeatureLocked(a.feature)
						return (
						<button
							key={a.id}
							type="button"
							className={`jac-app-card jac-app-card--${a.color}${enabled ? '' : ' jac-app-card--disabled'}${locked ? ' jac-app-card--locked' : ''}`}
							onClick={() => {
								if (enabled) handleSelect(a.id)
							}}
							aria-disabled={!enabled}
							disabled={!enabled}
						>
							<span className="jac-app-card__icon" aria-hidden="true">
								<img src={APP_LOGOS[a.id]} alt="" draggable="false" />
							</span>
							<span className="jac-app-card__name">{a.name}</span>
							<span className="jac-app-card__tagline">{a.tagline}</span>
							{!enabled && (
								<span className="jac-app-card__badge">Bientôt</span>
							)}
							{locked && (
								<span className="jac-app-card__badge jac-app-card__badge--lock" title="Réservé à un abonnement">🔒</span>
							)}
							{enabled && a.status === 'alpha' && (
								<span className="jac-app-card__badge jac-app-card__badge--alpha">Alpha</span>
							)}
							{enabled && a.status === 'beta' && (
								<span className="jac-app-card__badge jac-app-card__badge--beta">Beta</span>
							)}
						</button>
						)
					})}
					<button
						type="button"
						className="jac-app-card jac-app-card--more"
						onClick={handleOpenAppStore}
						title="Voir toutes les applications"
					>
						<span className="jac-app-card__icon" aria-hidden="true">
							<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
								<line x1="12" y1="5" x2="12" y2="19"/>
								<line x1="5" y1="12" x2="19" y2="12"/>
							</svg>
						</span>
						<span className="jac-app-card__name">Obtenir plus d'apps</span>
						<span className="jac-app-card__tagline">Parcourir toutes les applications</span>
					</button>
				</div>

				<FriendActivityFeed />

				{combinedRecents.length > 0 && (
					<div className="jac-launcher__recents">
						<div className="jac-launcher__recents-header">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="12" cy="12" r="10"/>
								<polyline points="12 6 12 12 16 14"/>
							</svg>
							<span>Fichiers récents</span>
						</div>
						<ul className="jac-launcher__recents-list">
							{combinedRecents.map((r) => {
								const iconSrc = r.source === 'jacpdfCloud' ? APP_LOGOS.jaccloud
									: r.source === 'drive' ? APP_LOGOS.googleDrive
									: r.source === 'jacdoc' ? APP_LOGOS.jacdoc
									: APP_LOGOS.jacpdf
								const sourceLabel = r.source === 'jacpdfCloud' ? 'JacCloud'
									: r.source === 'drive' ? 'Google Drive'
									: r.source === 'jacdoc' ? 'JacDoc'
									: 'Local'
								return (
									<li
										key={r.key}
										className="jac-launcher__recent-item"
										role="button"
										tabIndex={0}
										onClick={() => handleRecentClick(r)}
										onKeyDown={(e) => { if (e.key === 'Enter') handleRecentClick(r) }}
										title={`Ouvrir « ${r.name} »`}
									>
										<span className="jac-launcher__recent-icon">
											<img src={iconSrc} alt="" draggable="false" />
										</span>
										<div className="jac-launcher__recent-meta">
											<span className="jac-launcher__recent-name">{r.name}</span>
											<span className="jac-launcher__recent-sub">
												{sourceLabel}{r.timestamp ? ` · ${formatRelative(r.timestamp)}` : ''}
											</span>
										</div>
										{r.kind === 'pdf' && (
											<button
												className="jac-launcher__recent-remove"
												title="Retirer des récents"
												onClick={(e) => { e.stopPropagation(); recentFilesStore.remove(r.pdfRemoveKey) }}
											>
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
													<line x1="18" y1="6" x2="6" y2="18"/>
													<line x1="6" y1="6" x2="18" y2="18"/>
												</svg>
											</button>
										)}
									</li>
								)
							})}
						</ul>
					</div>
				)}
			</div>

			{showSettings && <Settings onClose={() => setShowSettings(false)} appName="JacSuite" />}
			{showFriends && (
				<FriendsModal onClose={() => setShowFriends(false)} />
			)}
			{showNotifs && (
				<NotificationsModal
					onClose={() => setShowNotifs(false)}
					state={notifsState}
				/>
			)}
			{showOnboarding && (
				<RoleOnboardingModal
					forced={forcedOnboarding}
					onClose={() => { setShowOnboarding(false); setForcedOnboarding(false) }}
					onComplete={() => { setShowOnboarding(false); setForcedOnboarding(false) }}
				/>
			)}
		</div>
	)
}