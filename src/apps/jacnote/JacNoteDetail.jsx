// JacNoteDetail.jsx
// Panneau de droite : juste l'éditeur Tiptap, sans header.
// Le titre est la première ligne de la note (géré par JacNoteEditor,
// façon Apple Notes). Pour changer de note : clic dans la liste.

import React from 'react'
import { useJacNoteStore } from './useJacNoteStore'
import { JacNoteEditor } from './JacNoteEditor'

export function JacNoteDetail() {
	const selectedNoteId = useJacNoteStore((s) => s.selectedNoteId)
	const note = useJacNoteStore((s) =>
		s.notes.find((n) => n.id === selectedNoteId),
	)
	const addNote = useJacNoteStore((s) => s.addNote)
	const selectNote = useJacNoteStore((s) => s.selectNote)

	// Aucune note sélectionnée -> surface vide cliquable, façon Apple Notes :
	// un clic crée une nouvelle note dans le dossier courant et la sélectionne.
	if (!note) {
		const createOnClick = () => {
			const created = addNote({ title: '' })
			selectNote(created.id)
		}
		return (
			<section
				className="jacnote-detail jacnote-detail--empty"
				onClick={createOnClick}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault()
						createOnClick()
					}
				}}
				title="Cliquez pour créer une note"
			>
				<div className="jacnote-detail__empty">
					<p className="jacnote-detail__empty-hint">
						Cliquez pour créer une note
					</p>
				</div>
			</section>
		)
	}

	return (
		<section className="jacnote-detail">
			<JacNoteEditor noteId={note.id} />
		</section>
	)
}

export default JacNoteDetail