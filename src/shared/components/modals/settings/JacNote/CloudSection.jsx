import { useEffect, useState } from 'react'
import '../FullSettingsModal.css'
import { useJacNoteCloudStore } from '@/apps/jacnote/jacnoteCloudStore'
import { forceFullSync, refreshCloudStats } from '@/apps/jacnote/useJacNoteCloud'
import { useJacNoteStore } from '@/apps/jacnote/useJacNoteStore'

// Section Cloud & sauvegarde JacNote.
// Branchée sur le store de statut (useJacNoteCloudStore) alimenté par le
// hook useJacNoteCloud monté dans JacNoteApp. Affiche l'état de la sync,
// les stats distantes, et expose un bouton « Forcer la sync ».

function formatDateTime(iso, locale = 'fr-CA') {
	if (!iso) return '—'
	try {
		return new Intl.DateTimeFormat(locale, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(new Date(iso))
	} catch {
		return iso
	}
}

function StatusBadge({ status }) {
	const map = {
		synced:       { label: 'Synchronisé',         color: '#22c55e' },
		syncing:      { label: 'Synchronisation…',    color: '#f59e0b' },
		error:        { label: 'Erreur',              color: '#ef4444' },
		disconnected: { label: 'Non connecté',        color: '#9ca3af' },
		idle:         { label: 'En attente',          color: '#9ca3af' },
	}
	const info = map[status] || map.idle
	return (
		<span style={ {
			display: 'inline-flex', alignItems: 'center', gap: 6,
			fontSize: 13, fontWeight: 600, color: info.color,
		} }>
			<span style={ {
				width: 8, height: 8, borderRadius: '50%',
				background: info.color,
				boxShadow: status === 'syncing' ? `0 0 0 4px ${info.color}33` : 'none',
			} } />
			{info.label}
		</span>
	)
}

export default function CloudSection({ user }) {
	const enabled = useJacNoteCloudStore((s) => s.enabled)
	const status = useJacNoteCloudStore((s) => s.status)
	const lastSyncedAt = useJacNoteCloudStore((s) => s.lastSyncedAt)
	const error = useJacNoteCloudStore((s) => s.error)
	const stats = useJacNoteCloudStore((s) => s.stats)

	// Compteurs locaux pour comparaison (notes actives + corbeille + dossiers).
	const localNoteCount = useJacNoteStore((s) => s.notes.length)
	const localFolderCount = useJacNoteStore((s) => s.folders.filter((f) => !f.system && f.id !== 'inbox').length)

	const [forcing, setForcing] = useState(false)

	// Rafraîchir les stats à l'ouverture (best-effort).
	useEffect(() => {
		if (enabled) refreshCloudStats()
	}, [enabled])

	const handleForceSync = async () => {
		if (forcing) return
		setForcing(true)
		try { await forceFullSync() } catch {}
		finally { setForcing(false) }
	}

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Cloud & sauvegarde</h3>
			<p className="fsm-section-sub">
				Tes notes sont synchronisées automatiquement entre tous tes appareils via Supabase. Connecte-toi avec le même compte sur un autre appareil pour les retrouver.
			</p>

			{/* ─── Bandeau statut ─── */}
			<div
				className="fsm-toggle-row"
				style={ { alignItems: 'flex-start', flexDirection: 'column', gap: 8 } }
			>
				<div style={ { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' } }>
					<div>
						<label className="fsm-label">État de la synchronisation</label>
						<p className="fsm-label-sub">
							{enabled
								? `Connecté en tant que ${user?.email || 'utilisateur Supabase'}`
								: 'Connecte-toi à ton compte JacSuite pour activer la sync cloud.'}
						</p>
					</div>
					<StatusBadge status={status} />
				</div>
				<div style={ { fontSize: 12, color: 'var(--fsm-muted, #6b7280)' } }>
					Dernière sync : {formatDateTime(lastSyncedAt)}
				</div>
				{error && (
					<div style={ { fontSize: 12, color: '#ef4444', wordBreak: 'break-word' } }>
						Erreur : {error}
					</div>
				)}
			</div>

			<div className="fsm-divider" />

			{/* ─── Statistiques ─── */}
			<h4 className="fsm-group-title">Données synchronisées</h4>
			<div style={ {
				display: 'grid',
				gridTemplateColumns: '1fr 1fr',
				gap: 8,
				marginBottom: 12,
			} }>
				<div className="fsm-about-card" style={ { padding: 12 } }>
					<div style={ { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fsm-muted, #6b7280)' } }>
						Notes
					</div>
					<div style={ { fontSize: 22, fontWeight: 700 } }>
						{enabled ? (stats?.noteCount ?? '…') : localNoteCount}
					</div>
					<div style={ { fontSize: 11, color: 'var(--fsm-muted, #6b7280)' } }>
						Local : {localNoteCount}
					</div>
				</div>
				<div className="fsm-about-card" style={ { padding: 12 } }>
					<div style={ { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fsm-muted, #6b7280)' } }>
						Dossiers
					</div>
					<div style={ { fontSize: 22, fontWeight: 700 } }>
						{enabled ? (stats?.folderCount ?? '…') : localFolderCount}
					</div>
					<div style={ { fontSize: 11, color: 'var(--fsm-muted, #6b7280)' } }>
						Local : {localFolderCount}
					</div>
				</div>
			</div>

			{/* ─── Actions ─── */}
			<h4 className="fsm-group-title">Actions</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Forcer la synchronisation</label>
					<p className="fsm-label-sub">
						Recharge les notes et dossiers depuis le cloud, fusionne avec ce qui est local (la version la plus récente gagne), puis pousse l'ensemble.
					</p>
				</div>
				<button
					className="fsm-toggle"
					onClick={handleForceSync}
					disabled={!enabled || forcing || status === 'syncing'}
					style={ {
						width: 'auto',
						height: 'auto',
						padding: '6px 14px',
						borderRadius: 8,
						fontSize: 13,
						fontWeight: 600,
						cursor: (!enabled || forcing) ? 'not-allowed' : 'pointer',
						opacity: (!enabled || forcing) ? 0.5 : 1,
					} }
				>
					{forcing || status === 'syncing' ? 'Sync en cours…' : 'Forcer la sync'}
				</button>
			</div>

			<div className="fsm-divider" />

			{/* ─── Infos techniques ─── */}
			<h4 className="fsm-group-title">À propos de la sync</h4>
			<div className="fsm-about-card">
				<p className="fsm-about-text">
					<strong>Local-first.</strong> Tes notes restent stockées localement et fonctionnent hors ligne. Les modifications sont envoyées au cloud dès que la connexion revient.
				</p>
				<p className="fsm-about-text">
					<strong>Multi-appareils.</strong> Les changements sur un appareil apparaissent en temps réel sur les autres (via Supabase Realtime).
				</p>
				<p className="fsm-about-text">
					<strong>Conflits.</strong> Si une même note est modifiée sur deux appareils en même temps, la version la plus récente est conservée.
				</p>
			</div>
		</div>
	)
}