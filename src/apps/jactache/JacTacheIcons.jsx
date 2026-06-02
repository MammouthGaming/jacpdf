// JacTacheIcons.jsx
// Set d'icônes SVG inline pour JacTâche. Toutes les icônes utilisent
// currentColor (héritent de la couleur du parent) et la prop `size`
// (default 16) contrôle width/height en pixels.
//
// Usage : <Icon name="inbox" size={18} />
//
// EMOJI_ALIASES permet de garder la compat avec les projets persistés
// dont la prop `icon` était un emoji (📥, 📁, etc.). Quand l'icône
// fournie n'est ni un nom connu ni un emoji connu, on retombe sur
// l'affichage brut de la string pour ne pas casser l'UX.

import React from 'react'

const ICONS = {
	inbox: (
		<>
			<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
			<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
		</>
	),
	folder: (
		<path d="M4 4h6l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
	),
	list: (
		<>
			<line x1="8" y1="6" x2="21" y2="6" />
			<line x1="8" y1="12" x2="21" y2="12" />
			<line x1="8" y1="18" x2="21" y2="18" />
			<line x1="3" y1="6" x2="3.01" y2="6" />
			<line x1="3" y1="12" x2="3.01" y2="12" />
			<line x1="3" y1="18" x2="3.01" y2="18" />
		</>
	),
	sun: (
		<>
			<circle cx="12" cy="12" r="4" />
			<line x1="12" y1="2" x2="12" y2="4" />
			<line x1="12" y1="20" x2="12" y2="22" />
			<line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
			<line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
			<line x1="2" y1="12" x2="4" y2="12" />
			<line x1="20" y1="12" x2="22" y2="12" />
			<line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
			<line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
		</>
	),
	calendar: (
		<>
			<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
			<line x1="16" y1="2" x2="16" y2="6" />
			<line x1="8" y1="2" x2="8" y2="6" />
			<line x1="3" y1="10" x2="21" y2="10" />
		</>
	),
	'check-circle': (
		<>
			<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
			<polyline points="22 4 12 14.01 9 11.01" />
		</>
	),
	'check-square': (
		<>
			<polyline points="9 11 12 14 22 4" />
			<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
		</>
	),
	pencil: (
		<>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
		</>
	),
	trash: (
		<>
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
			<line x1="10" y1="11" x2="10" y2="17" />
			<line x1="14" y1="11" x2="14" y2="17" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		</>
	),
	'list-checks': (
		<>
			<polyline points="3 7 5 9 9 5" />
			<polyline points="3 17 5 19 9 15" />
			<line x1="13" y1="7" x2="21" y2="7" />
			<line x1="13" y1="17" x2="21" y2="17" />
		</>
	),
	close: (
		<>
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		</>
	),
	info: (
		<>
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="16" x2="12" y2="12" />
			<line x1="12" y1="8" x2="12.01" y2="8" />
		</>
	),
}

// Map des emojis historiques vers les noms d'icônes. Permet que les
// projets persistés (icon: '📥') s'affichent automatiquement en SVG
// sans migration de données.
const EMOJI_ALIASES = {
	'📥': 'inbox',
	'📁': 'folder',
	'📜': 'list',
	'☀️': 'sun',
	'📅': 'calendar',
	'✅': 'check-square',
	'✏️': 'pencil',
	'🗑️': 'trash',
	'🌿': 'check-circle',
}

export function Icon({ name, size = 16, className }) {
	const resolved = EMOJI_ALIASES[name] ?? name
	const renderer = ICONS[resolved]
	if (!renderer) return <span className={className}>{name}</span>
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
			className={className}
		>
			{renderer}
		</svg>
	)
}

export default Icon