// JacNoteEditor.jsx
// Éditeur Tiptap style Apple Notes pour JacNote.
// Monté à l'intérieur de JacNoteDetail. Format bar sticky au-dessus,
// flux continu en dessous (pas de pages A4 contrairement à JacDoc).
// Autosave dans le store via updateNote, débouncé à 400 ms.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'

import { useJacNoteStore } from './useJacNoteStore'
import { JacNoteFormatBar } from './JacNoteFormatBar'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import './JacNoteEditor.css'

// Doc Tiptap vide — un paragraphe blanc pour démarrer.
const EMPTY_DOC = {
	type: 'doc',
	content: [{ type: 'paragraph' }],
}

// Convertit un content stocké (objet JSON, string JSON, plain text) en
// document Tiptap exploitable. Garde la rétrocompat avec les notes
// créées avant l'éditeur (content = string brute).
function normalizeContent(raw) {
	if (!raw) return EMPTY_DOC
	if (typeof raw === 'object') return raw
	if (typeof raw === 'string') {
		const trimmed = raw.trim()
		if (!trimmed) return EMPTY_DOC
		// Tente parse JSON Tiptap.
		if (trimmed.startsWith('{')) {
			try {
				const parsed = JSON.parse(trimmed)
				if (parsed && parsed.type === 'doc') return parsed
			} catch { /* fallback plain text */ }
		}
		// Texte brut hérité : 1 paragraphe par ligne.
		return {
			type: 'doc',
			content: raw.split(/\r?\n/).map((line) => ({
				type: 'paragraph',
				content: line ? [{ type: 'text', text: line }] : [],
			})),
		}
	}
	return EMPTY_DOC
}

// Apple Notes : le titre = première ligne. On extrait le premier
// paragraphe / heading non vide.
function collectText(node) {
	if (!node) return ''
	if (node.text) return node.text
	if (!node.content) return ''
	return node.content.map(collectText).join('')
}

function extractTitle(doc) {
	if (!doc?.content) return ''
	for (const node of doc.content) {
		const text = collectText(node).trim()
		if (text) return text.slice(0, 120)
	}
	return ''
}

// Formate la date d'une note façon Apple Notes : "22 mai 2026 à 18:46".
function formatNoteDate(iso) {
	if (!iso) return ''
	const d = new Date(iso)
	const date = d.toLocaleDateString('fr-CA', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	})
	const time = d.toLocaleTimeString('fr-CA', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	})
	return `${date} à ${time}`
}

export function JacNoteEditor({ noteId }) {
	const note = useJacNoteStore((s) =>
		s.notes.find((n) => n.id === noteId),
	)
	const updateNote = useJacNoteStore((s) => s.updateNote)

	// Réglages JacNote (Édition).
	const [editorFont] = useStoredSetting('jacnote_settings_editor_font', 'sans')
	const [editorSize] = useStoredSetting('jacnote_settings_editor_size', '16')
	const [autosaveDelay] = useStoredSetting('jacnote_settings_autosave_delay', '400')
	const [showWordCount] = useStoredSetting('jacnote_settings_show_word_count', 'true')
	const [spellCheck] = useStoredSetting('jacnote_settings_spell_check', 'true')

	// Initial doc : calculé une fois par noteId. Les updates ultérieurs
	// passent par les transactions Tiptap pour préserver l'undo stack.
	const initialDoc = useMemo(
		() => normalizeContent(note?.content),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[noteId],
	)

	const saveTimerRef = useRef(null)
	const pendingDocRef = useRef(null)
	// Dernier updatedAt qu'on a « vu » / appliqué dans l'éditeur. Sert à
	// détecter les mises à jour externes (Realtime / pull cloud) et à les
	// pousser dans Tiptap sans casser l'undo stack ni boucler avec l'autosave.
	const lastSeenUpdatedAtRef = useRef(note?.updatedAt)

	const editor = useEditor(
		{
			content: initialDoc,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
					codeBlock: false,
				}),
				Typography,
				TaskList,
				TaskItem.configure({ nested: true }),
				Placeholder.configure({
					// Titre fantôme façon Apple Notes uniquement sur le
					// tout premier bloc vide.
					placeholder: ({ pos }) => (pos === 0 ? 'Titre…' : ''),
				}),
			],
			onUpdate: ({ editor }) => {
				pendingDocRef.current = editor.getJSON()
				if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
				saveTimerRef.current = setTimeout(() => {
					if (!pendingDocRef.current) return
					const doc = pendingDocRef.current
					persistNow(doc)
					pendingDocRef.current = null
				}, parseInt(autosaveDelay, 10) || 400)
			},
		},
		[noteId],
	)

	// Synchronise le contenu de l'éditeur quand la note est modifiée « de
	// l'extérieur » : pull initial cloud, Realtime depuis un autre appareil,
	// ou même autosave d'une autre instance dans le même onglet. On compare
	// par updatedAt et on ignore les updates qui correspondent à ce que
	// l'éditeur a déjà en mémoire (évite la boucle avec notre propre save).
	useEffect(() => {
		if (!editor || !note) return
		if (note.updatedAt === lastSeenUpdatedAtRef.current) return

		// S'il y a un draft local non-sauvé en attente, on ne l'écrase pas :
		// la modif locale est plus récente que ce qu'on a en mémoire.
		if (pendingDocRef.current) {
			lastSeenUpdatedAtRef.current = note.updatedAt
			return
		}

		const incomingDoc = normalizeContent(note.content)
		const currentDoc = editor.getJSON()

		// Si le contenu est déjà identique (ex. notre propre save qui revient
		// du store), on enregistre juste le nouveau updatedAt et on sort.
		if (JSON.stringify(currentDoc) === JSON.stringify(incomingDoc)) {
			lastSeenUpdatedAtRef.current = note.updatedAt
			return
		}

		// Vraie mise à jour externe : on écrit dans Tiptap sans émettre
		// onUpdate (sinon on déclenche notre autosave et on ré-écrit dans le
		// store ce qu'on vient d'en lire).
		editor.commands.setContent(incomingDoc, false)
		lastSeenUpdatedAtRef.current = note.updatedAt
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor, note?.updatedAt, note?.content])

	// Reset du tracker quand on change de note (le useMemo recharge le doc).
	useEffect(() => {
		lastSeenUpdatedAtRef.current = note?.updatedAt
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [noteId])

	// Marque notre propre save comme « déjà vu » pour ne pas le retraiter
	// comme un update externe quand il revient du store.
	const persistNow = (doc) => {
		const nextUpdatedAt = new Date().toISOString()
		lastSeenUpdatedAtRef.current = nextUpdatedAt
		updateNote(noteId, {
			content: doc,
			title: extractTitle(doc),
			updatedAt: nextUpdatedAt,
		})
	}

	// Flush au unmount / changement de note : on persiste tout draft en
	// attente sans attendre la fin du debounce.
	useEffect(() => {
		return () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
				saveTimerRef.current = null
			}
			if (pendingDocRef.current) {
				persistNow(pendingDocRef.current)
				pendingDocRef.current = null
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [noteId])

	if (!note) return null

	// Clic n'importe où dans la zone scroll (même en dehors du texte
	// ProseMirror, ex. padding bas ou marge) -> focus à la fin du doc.
	// On utilise mousedown pour ne pas ramer derrière la sélection native
	// quand l'utilisateur clique pile sur le texte (ProseMirror gère déjà).
	const handleSurfaceMouseDown = (e) => {
		if (!editor) return
		// Si la cible du clic est un élément à l'intérieur de ProseMirror,
		// on laisse l'éditeur gérer (placement de caret précis).
		if (e.target.closest('.ProseMirror')) return
		e.preventDefault()
		editor.chain().focus('end').run()
	}

	// Masque la format bar dès qu'on scrolle dans l'éditeur, façon Apple Notes.
	const [scrolled, setScrolled] = useState(false)
	const scrollRef = useRef(null)
	const handleScroll = (e) => {
		setScrolled(e.currentTarget.scrollTop > 8)
	}
	// Reset à chaque changement de note pour ne pas garder un état masqué.
	useEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = 0
		setScrolled(false)
	}, [noteId])

	// Synchronise l'attribut `spellcheck` sur l'élément ProseMirror selon le
	// réglage. ProseMirror ne réagit pas au changement après mount ; on le
	// pose nous-mêmes via le DOM exposé par la vue.
	useEffect(() => {
		if (!editor) return
		editor.view?.dom?.setAttribute('spellcheck', spellCheck === 'true' ? 'true' : 'false')
	}, [editor, spellCheck])

	// Compteur de mots / caractères, mis à jour à chaque transaction.
	const [counts, setCounts] = useState({ words: 0, chars: 0 })
	useEffect(() => {
		if (!editor) return
		const update = () => {
			const text = editor.getText() || ''
			const words = text.trim() ? text.trim().split(/\s+/).length : 0
			setCounts({ words, chars: text.length })
		}
		update()
		editor.on('update', update)
		return () => editor.off('update', update)
	}, [editor])

	return (
		<div
			className="jacnote-editor"
			data-scrolled={scrolled || undefined}
			data-font={editorFont}
			style={ { '--jn-editor-size': `${parseInt(editorSize, 10) || 16}px` } }
		>
			<JacNoteFormatBar editor={editor} />
			<div
				ref={scrollRef}
				className="jacnote-editor__scroll"
				onMouseDown={handleSurfaceMouseDown}
				onScroll={handleScroll}
			>
				<div className="jacnote-editor__date" aria-label="Dernière modification">
					{formatNoteDate(note.updatedAt)}
				</div>
				<EditorContent editor={editor} className="jacnote-editor__content" />
			</div>
			{showWordCount === 'true' && (
				<div className="jacnote-editor__wordcount" aria-live="polite">
					{counts.words} mot{counts.words > 1 ? 's' : ''} · {counts.chars} car.
				</div>
			)}
		</div>
	)
}

export default JacNoteEditor