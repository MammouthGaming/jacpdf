import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import { useJacNoteStore } from '@/apps/jacnote/useJacNoteStore'
import { openConfirm } from '@/apps/jacnote/jacnoteConfirmStore'
import '../FullSettingsModal.css'

// Section Avancé JacNote — mode développeur, sécurité (à venir),
// réinitialisation et zone dangereuse.
export default function PerformanceSection() {
	const [devMode, setDevMode] = useStoredSetting('jacnote_settings_dev_mode', 'false')
	const [lockEnabled, setLockEnabled] = useStoredSetting('jacnote_settings_lock_enabled', 'false')
	const [autoLock, setAutoLock] = useStoredSetting('jacnote_settings_auto_lock_minutes', 'never')
	const [hideLockedPreviews, setHideLockedPreviews] = useStoredSetting('jacnote_settings_hide_locked_previews', 'true')

	const resetAllJacNoteSettings = () => {
		try {
			const keys = []
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i)
				if (k && k.startsWith('jacnote_settings_')) keys.push(k)
			}
			keys.forEach((k) => localStorage.removeItem(k))
			window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
		} catch {}
	}

	const handleResetSettings = async () => {
		const ok = await openConfirm({
			title: 'Réinitialiser les préférences ?',
			message: 'Toutes les préférences JacNote reviendront aux valeurs par défaut. Tes notes ne seront pas touchées.',
			confirmLabel: 'Réinitialiser',
			danger: true,
		})
		if (ok) resetAllJacNoteSettings()
	}

	const handleClearAll = async () => {
		const ok = await openConfirm({
			title: 'Effacer toutes les données JacNote ?',
			message: 'Cette action supprime DEFINITIVEMENT toutes tes notes, tous tes dossiers et toutes les préférences JacNote. Action irréversible.',
			confirmLabel: 'Tout effacer',
			danger: true,
		})
		if (!ok) return
		const again = await openConfirm({
			title: 'Tu es absolument certain ?',
			message: 'Dernière chance avant la suppression définitive.',
			confirmLabel: 'Oui, tout effacer',
			danger: true,
		})
		if (!again) return
		useJacNoteStore.setState((s) => ({
			notes: [],
			folders: s.folders.filter((f) => f.id === 'inbox'),
			selectedFolderId: null,
			selectedNoteId: null,
			filter: null,
		}))
		resetAllJacNoteSettings()
	}

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Avancé</h3>
			<p className="fsm-section-sub">Développement, sécurité et zone dangereuse.</p>

			<h4 className="fsm-group-title">Développement</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Mode développeur</label>
					<p className="fsm-label-sub">Affiche les IDs internes des notes et dossiers, et active des outils de debug.</p>
				</div>
				<button
					className={`fsm-toggle ${devMode === 'true' ? 'on' : ''}`}
					onClick={() => setDevMode(devMode === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">
				Sécurité
				<span className="fsm-version-tag" style={ { marginLeft: 8 } }>Bientôt</span>
			</h4>
			<div className="fsm-toggle-row fsm-perf-row-disabled">
				<div>
					<label className="fsm-label">Verrouiller certaines notes</label>
					<p className="fsm-label-sub">Protège des notes sensibles avec un mot de passe. Le module de chiffrement est en cours d’implémentation.</p>
				</div>
				<button
					className={`fsm-toggle ${lockEnabled === 'true' ? 'on' : ''}`}
					disabled
					onClick={() => setLockEnabled(lockEnabled === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>
			<div className="fsm-field fsm-perf-row-disabled">
				<label className="fsm-label">Verrouillage automatique</label>
				<p className="fsm-label-sub">Reverrouille les notes après un délai d’inactivité.</p>
				<FsmSelect
					value={autoLock}
					onChange={setAutoLock}
					disabled
					options={[
						{ value: 'never', label: 'Jamais' },
						{ value: '1', label: 'Après 1 minute' },
						{ value: '5', label: 'Après 5 minutes' },
						{ value: '15', label: 'Après 15 minutes' },
					]}
				/>
			</div>
			<div className="fsm-toggle-row fsm-perf-row-disabled">
				<div>
					<label className="fsm-label">Cacher l’aperçu des notes verrouillées</label>
					<p className="fsm-label-sub">Dans la liste, les notes verrouillées n’affichent pas leur contenu.</p>
				</div>
				<button
					className={`fsm-toggle ${hideLockedPreviews === 'true' ? 'on' : ''}`}
					disabled
					onClick={() => setHideLockedPreviews(hideLockedPreviews === 'true' ? 'false' : 'true')}
				>
					<span className="fsm-toggle-thumb" />
				</button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Zone dangereuse</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Réinitialiser les préférences JacNote</label>
					<p className="fsm-label-sub">Revient aux réglages par défaut. Garde tes notes et dossiers.</p>
				</div>
				<button className="fsm-theme-btn" onClick={handleResetSettings}><span>Réinitialiser…</span></button>
			</div>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Tout effacer</label>
					<p className="fsm-label-sub">Supprime DEFINITIVEMENT toutes tes notes, tous tes dossiers et toutes les préférences JacNote. Irréversible.</p>
				</div>
				<button
					className="fsm-theme-btn"
					onClick={handleClearAll}
					style={ { color: '#ff4d4f', borderColor: 'rgba(255,77,79,0.4)' } }
				>
					<span>Tout effacer…</span>
				</button>
			</div>
		</div>
	)
}