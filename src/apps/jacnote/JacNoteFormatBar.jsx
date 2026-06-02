// JacNoteFormatBar.jsx
// Format bar style Apple Notes : un seul rail compact sticky au-dessus
// de l'éditeur. Sélecteur de style à gauche, inline markup au centre,
// listes / citation / lien à droite. L'état pressed reflet live
// l'état de la sélection Tiptap via le bumper de transaction.

import React, { useEffect, useState } from 'react'
import './JacNoteFormatBar.css'

function Btn({ label, title, onClick, active, disabled }) {
	return (
		<button
			type="button"
			className={'jacnote-fmt__btn' + (active ? ' is-active' : '')}
			onClick={onClick}
			disabled={disabled}
			title={title}
			aria-label={title}
			aria-pressed={active || undefined}
		>
			{label}
		</button>
	)
}

const STYLE_OPTIONS = [
	{ value: 'title', label: 'Titre' },
	{ value: 'heading', label: 'Sous-titre' },
	{ value: 'subheading', label: 'En-tête' },
	{ value: 'body', label: 'Corps' },
	{ value: 'mono', label: 'Mono' },
]

// Icônes SVG inline, style Lucide/Phosphor. `currentColor` -> elles suivent
// l'état du bouton parent (hover, is-active = accent jaune).
const SVG_PROPS = {
	width: 16,
	height: 16,
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 2,
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
}
const Icons = {
	Bold: () => (
		<svg {...SVG_PROPS} strokeWidth={2.4}>
			<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
			<path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
		</svg>
	),
	Italic: () => (
		<svg {...SVG_PROPS}>
			<line x1="19" y1="5" x2="11" y2="5" />
			<line x1="13" y1="19" x2="5" y2="19" />
			<line x1="15" y1="5" x2="9" y2="19" />
		</svg>
	),
	Underline: () => (
		<svg {...SVG_PROPS}>
			<path d="M6 4v7a6 6 0 0 0 12 0V4" />
			<line x1="5" y1="20" x2="19" y2="20" />
		</svg>
	),
	Strike: () => (
		<svg {...SVG_PROPS}>
			<path d="M16 5H10a3 3 0 0 0-3 3" />
			<path d="M14 12a4 4 0 0 1 0 7H7" />
			<line x1="4" y1="12" x2="20" y2="12" />
		</svg>
	),
	BulletList: () => (
		<svg {...SVG_PROPS}>
			<line x1="9" y1="6" x2="20" y2="6" />
			<line x1="9" y1="12" x2="20" y2="12" />
			<line x1="9" y1="18" x2="20" y2="18" />
			<circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none" />
			<circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
			<circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
		</svg>
	),
	OrderedList: () => (
		<svg {...SVG_PROPS}>
			<line x1="10" y1="6" x2="21" y2="6" />
			<line x1="10" y1="12" x2="21" y2="12" />
			<line x1="10" y1="18" x2="21" y2="18" />
			<path d="M4 4v5" />
			<path d="M3 9h2" />
			<path d="M3 14h3l-3 4h3" />
		</svg>
	),
	TaskList: () => (
		<svg {...SVG_PROPS}>
			<rect x="3" y="4" width="7" height="7" rx="1.2" />
			<path d="m4.5 7.5 1.4 1.4L8.7 6" />
			<rect x="3" y="13" width="7" height="7" rx="1.2" />
			<line x1="13" y1="8" x2="21" y2="8" />
			<line x1="13" y1="17" x2="21" y2="17" />
		</svg>
	),
	Quote: () => (
		<svg {...SVG_PROPS}>
			<path d="M7 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2v1a3 3 0 0 1-3 3" />
			<path d="M18 7h-3a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2v1a3 3 0 0 1-3 3" />
		</svg>
	),
	Link: () => (
		<svg {...SVG_PROPS}>
			<path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
			<path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
		</svg>
	),
}

function currentStyle(editor) {
	if (!editor) return 'body'
	if (editor.isActive('heading', { level: 1 })) return 'title'
	if (editor.isActive('heading', { level: 2 })) return 'heading'
	if (editor.isActive('heading', { level: 3 })) return 'subheading'
	if (editor.isActive('codeBlock')) return 'mono'
	return 'body'
}

function applyStyle(editor, value) {
	if (!editor) return
	const chain = editor.chain().focus()
	switch (value) {
		case 'title':       chain.setHeading({ level: 1 }).run(); break
		case 'heading':     chain.setHeading({ level: 2 }).run(); break
		case 'subheading':  chain.setHeading({ level: 3 }).run(); break
		case 'mono':        chain.setCodeBlock().run(); break
		case 'body':
		default:            chain.setParagraph().run(); break
	}
}

export function JacNoteFormatBar({ editor }) {
	// Force re-render à chaque transaction pour que les pressed states
	// reflètent l'état courant de la sélection.
	const [, setTick] = useState(0)
	useEffect(() => {
		if (!editor) return
		const bump = () => setTick((c) => (c + 1) | 0)
		editor.on('transaction', bump)
		editor.on('selectionUpdate', bump)
		return () => {
			editor.off('transaction', bump)
			editor.off('selectionUpdate', bump)
		}
	}, [editor])

	if (!editor) {
		return <div className="jacnote-fmt jacnote-fmt--empty" aria-hidden />
	}

	const style = currentStyle(editor)

	return (
		<div className="jacnote-fmt" role="toolbar" aria-label="Format">
			<select
				className="jacnote-fmt__select"
				value={style}
				onChange={(e) => applyStyle(editor, e.target.value)}
				title="Style de paragraphe"
			>
				{STYLE_OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>{opt.label}</option>
				))}
			</select>

			<span className="jacnote-fmt__sep" aria-hidden />

			<Btn
				label={<Icons.Bold />}
				title="Gras (Cmd+B)"
				onClick={() => editor.chain().focus().toggleBold().run()}
				active={editor.isActive('bold')}
			/>
			<Btn
				label={<Icons.Italic />}
				title="Italique (Cmd+I)"
				onClick={() => editor.chain().focus().toggleItalic().run()}
				active={editor.isActive('italic')}
			/>
			<Btn
				label={<Icons.Underline />}
				title="Souligné (Cmd+U)"
				onClick={() => {
					const chain = editor.chain().focus()
					if (typeof chain.toggleUnderline === 'function') chain.toggleUnderline().run()
					else chain.toggleMark('underline').run()
				}}
				active={editor.isActive('underline')}
			/>
			<Btn
				label={<Icons.Strike />}
				title="Barré"
				onClick={() => editor.chain().focus().toggleStrike().run()}
				active={editor.isActive('strike')}
			/>

			<span className="jacnote-fmt__sep" aria-hidden />

			<Btn
				label={<Icons.BulletList />}
				title="Liste à puces"
				onClick={() => editor.chain().focus().toggleBulletList().run()}
				active={editor.isActive('bulletList')}
			/>
			<Btn
				label={<Icons.OrderedList />}
				title="Liste numérotée"
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
				active={editor.isActive('orderedList')}
			/>
			<Btn
				label={<Icons.TaskList />}
				title="Liste de tâches"
				onClick={() => editor.chain().focus().toggleTaskList().run()}
				active={editor.isActive('taskList')}
			/>

			<span className="jacnote-fmt__sep" aria-hidden />

			<Btn
				label={<Icons.Quote />}
				title="Citation"
				onClick={() => editor.chain().focus().toggleBlockquote().run()}
				active={editor.isActive('blockquote')}
			/>
			<Btn
				label={<Icons.Link />}
				title="Lien"
				onClick={() => {
					const previous = editor.getAttributes('link')?.href || ''
					const url = window.prompt('URL du lien', previous)
					if (url === null) return
					if (url === '') {
						editor.chain().focus().extendMarkRange('link').unsetLink().run()
						return
					}
					editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
				}}
				active={editor.isActive('link')}
			/>
		</div>
	)
}

export default JacNoteFormatBar