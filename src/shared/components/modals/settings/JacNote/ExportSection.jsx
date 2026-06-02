import { useRef, useState } from 'react'
import { useJacNoteStore } from '@/apps/jacnote/useJacNoteStore'
import { openConfirm } from '@/apps/jacnote/jacnoteConfirmStore'
import '../FullSettingsModal.css'

// Section Export JacNote — export/import JSON de toutes les notes.
export default function ExportSection() {
	const fileRef = useRef(null)
	const [busy, setBusy] = useState(false)
	const [lastExport, setLastExport] = useState(null)

	const handleExport = () => {
		const state = useJacNoteStore.getState()
		const dump = {
			version: 1,
			exportedAt: new Date().toISOString(),
			notes: state.notes,
			folders: state.folders,
		}
		const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		const date = new Date().toISOString().slice(0, 10)
		a.href = url
		a.download = `jacnote-export-${date}.json`
		a.click()
		URL.revokeObjectURL(url)
		setLastExport(`${state.notes.length} note(s), ${state.folders.length} dossier(s)`)
	}

	const handleImportClick = () => fileRef.current?.click()

	const handleImportFile = async (e) => {
		const file = e.target.files?.[0]
		e.target.value = ''
		if (!file) return
		setBusy(true)
		try {
			const text = await file.text()
			const data = JSON.parse(text)
			if (!Array.isArray(data.notes) || !Array.isArray(data.folders)) {
				throw new Error('Format invalide : le fichier ne contient pas « notes » et « folders ».')
			}
			const ok = await openConfirm({
				title: 'Importer ces données ?',
				message: `Cela ajoutera ${data.notes.length} note(s) et ${data.folders.length} dossier(s) à ton espace actuel.`,
				confirmLabel: 'Importer',
			})
			if (!ok) return
			useJacNoteStore.setState((s) => ({
				notes: [...s.notes, ...data.notes],
				folders: [...s.folders, ...data.folders],
			}))
		} catch (err) {
			await openConfirm({
				title: 'Import impossible',
				message: String(err.message || err),
				confirmLabel: 'OK',
				cancelLabel: 'Fermer',
			})
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">Export</h3>
			<p className="fsm-section-sub">Exporte ou importe toutes tes notes au format JSON.</p>

			<h4 className="fsm-group-title">Export</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Exporter toutes les notes</label>
					<p className="fsm-label-sub">Télécharge un fichier JSON avec tes notes, dossiers, tags et favoris. Tu peux l’importer ailleurs ou le garder en sauvegarde.</p>
					{lastExport && (
						<p className="fsm-label-sub" style={ { color: 'var(--accent)', marginTop: 4 } }>✓ Export réussi — {lastExport}</p>
					)}
				</div>
				<button className="fsm-theme-btn" onClick={handleExport}><span>Exporter…</span></button>
			</div>

			<div className="fsm-divider" />

			<h4 className="fsm-group-title">Import</h4>
			<div className="fsm-toggle-row">
				<div>
					<label className="fsm-label">Importer depuis un fichier</label>
					<p className="fsm-label-sub">Format JSON généré par l’export JacNote. Les notes importées sont ajoutées à ton espace, elles ne le remplacent pas.</p>
				</div>
				<button className="fsm-theme-btn" onClick={handleImportClick} disabled={busy}>
					<span>{busy ? 'Import…' : 'Choisir un fichier…'}</span>
				</button>
				<input
					ref={fileRef}
					type="file"
					accept="application/json"
					style={ { display: 'none' } }
					onChange={handleImportFile}
				/>
			</div>
		</div>
	)
}