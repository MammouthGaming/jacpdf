import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import './Spotlight.css'
import { useJacSuiteSetting } from '@/shared/hooks/useJacSuiteSetting'
import { eventToCombo } from '@/shared/hooks/system/useKeyboardShortcuts'
import { recentFilesStore, entryKey } from '@/apps/jacpdf/stores/user/recentFilesStore'
import { jacdocStore } from '@/apps/jacdoc/stores/jacdocStore'
import { clipboardStore } from '@/shared/stores/user/clipboardStore'
import { usePremium } from '@/shared/hooks/user/usePremium'
import { APP_LOGOS } from '@/shared/lib/apps/appsCatalog'

// ──────────────────────────────────────────────────
// Spotlight JacSuite — ÉTAPE 2 : sources fichiers + actions rapides.
//
// ÉTAPE 1 a posé la coquille (overlay, champ, navigation clavier, ouverture
// au raccourci configurable). ÉTAPE 2 enrichit la liste avec trois familles
// de "sources", toutes ramenées à une forme commune :
//   { id, type, tag, label, sublabel, icon, keywords?, timestamp?, run() }
//
//   • Apps     — les apps de la suite (toujours présentes).
//   • Fichiers — PDF récents (recentFilesStore) + documents JacDoc
//               (jacdocStore). Triés par date d'ouverture / màj.
//   • Actions  — commandes rapides (nouveau doc, import, ouvrir cloud…).
//
// IMPORTANT — comment on "ouvre" quelque chose :
// Spotlight est monté à la racine (App.jsx), à côté du <SuiteShell/> routé.
// SuiteShell n'écoute PAS les changements d'URL react-router : il pilote ses
// onglets via des CustomEvents globaux (jacsuite:* / jacpdf:*). On déclenche
// donc ces mêmes événements — exactement ce que font déjà le launcher et les
// menus internes. C'est le contrat d'ouverture officiel de la suite.
// ──────────────────────────────────────────────────

// Petit helper : dispatch d'un CustomEvent global (avec ou sans detail).
const emit = (name, detail) =>
	window.dispatchEvent(detail ? new CustomEvent(name, { detail }) : new CustomEvent(name))

// Normalise une chaîne pour une recherche insensible à la casse ET aux accents
// (« calendrier » matche « Calendrier », « tache » matche « Tâche »).
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Logos des apps importés du catalogue central (src/shared/lib/apps) —
// résolus à un seul endroit, affichés à la place des emojis dans les
// résultats « Applications ». Inclut jacsuite & googleDrive (BRAND_LOGOS).

// ── Source "apps" ──
// Chaque app ouvre via l'événement global déjà écouté par SuiteShell
// (style Chrome : convertit l'onglet courant / focus l'existant).
const APP_RESULTS = [
	{ id: 'app:jacpdf', label: 'JacPDF', sublabel: 'Lire, annoter, organiser tes PDF', logo: APP_LOGOS.jacpdf, subs: ['bureautique'], event: 'jacsuite:openJacPdfHome' },
	{ id: 'app:jacdoc', label: 'JacDoc', sublabel: 'Documents et écriture', logo: APP_LOGOS.jacdoc, subs: ['bureautique'], event: 'jacsuite:openJacDocHome' },
	{ id: 'app:jacnote', label: 'JacNote', sublabel: 'Notes rapides', logo: APP_LOGOS.jacnote, subs: ['bureautique'], event: 'jacsuite:openJacNote' },
	{ id: 'app:jacpaint', label: 'JacPaint', sublabel: 'Dessin et illustration', logo: APP_LOGOS.jacpaint, subs: ['creatif'], event: 'jacsuite:openJacPaintHome' },
	{ id: 'app:jactache', label: 'JacTâche', sublabel: 'Listes de tâches', logo: APP_LOGOS.jactache, subs: ['bureautique'], event: 'jacsuite:openJacTache' },
	{ id: 'app:jaccalendrier', label: 'JacCalendrier', sublabel: 'Agenda et événements', logo: APP_LOGOS.jaccalendrier, subs: ['bureautique'], event: 'jacsuite:openJacCalendrier' },
	{ id: 'app:classroom', label: 'Classroom', sublabel: 'Cours, devoirs et classes', logo: APP_LOGOS.classroom, subs: ['education'], event: 'jacsuite:openClassroom' },
	{ id: 'app:accueil', label: 'Accueil JacSuite', sublabel: 'Revenir au lanceur', logo: APP_LOGOS.jacsuite, subs: [], event: 'jacsuite:openLauncher' },
].map((a) => ({
	...a,
	type: 'app',
	tag: 'App',
	keywords: 'app application ouvrir',
	run: () => emit(a.event),
}))

// ── Source "actions" ──
// Commandes rapides. Toutes passent par des événements déjà branchés dans
// SuiteShell (création / import JacDoc, pickers cloud & Drive).
const ACTION_RESULTS = [
	{ id: 'action:new-jacdoc', label: 'Nouveau document JacDoc', sublabel: 'Créer un document vierge', glyph: 'new', event: 'jacsuite:createJacDoc', keywords: 'nouveau new creer document doc vierge' },
	{ id: 'action:import-jacdoc', label: 'Importer un document', sublabel: 'Importer un fichier dans JacDoc', glyph: 'import', event: 'jacsuite:importJacDoc', keywords: 'import importer word docx html fichier' },
	{ id: 'action:jacdoc-cloud', label: 'Ouvrir un document JacCloud', sublabel: 'Parcourir tes documents JacDoc Cloud', logo: APP_LOGOS.jaccloud, event: 'jacsuite:openJacDocCloud', keywords: 'cloud jaccloud ouvrir document distant' },
	{ id: 'action:jacdoc-drive', label: 'Ouvrir un JacDoc depuis Google Drive', sublabel: 'Parcourir Google Drive', logo: APP_LOGOS.googleDrive, event: 'jacsuite:openJacDocGoogleDrive', keywords: 'google drive ouvrir document' },
].map((a) => ({
	...a,
	type: 'action',
	tag: 'Action',
	run: () => emit(a.event),
}))

// Catégories façon Spotlight Apple — barre révélée au mouvement de la souris.
const CATEGORIES = [
	{ id: 'app', label: 'Applications' },
	{ id: 'file', label: 'Fichiers' },
	{ id: 'action', label: 'Actions' },
	{ id: 'clipboard', label: 'Presse-papier' },
]

// Sous-catégories (chips sous la barre). Chaque entrée filtrable porte un
// tableau `subs` ; un chip matche si subs l'inclut ('all' = pas de filtre).
// Applications : par usage. Fichiers : par type (PDF / Documents) ET par
// source (JacCloud / Drive / Local) dans une même rangée.
const APP_SUBCATS = [
	{ id: 'all', label: 'Toutes' },
	{ id: 'bureautique', label: 'Bureautique' },
	{ id: 'creatif', label: 'Créatif' },
	{ id: 'education', label: 'Éducation' },
]

const FILE_SUBCATS = [
	{ id: 'all', label: 'Tous' },
	{ id: 'pdf', label: 'PDF' },
	{ id: 'doc', label: 'Documents' },
	{ id: 'jacpdfCloud', label: 'JacCloud' },
	{ id: 'drive', label: 'Drive' },
	{ id: 'local', label: 'Local' },
]

// Icônes SVG (trait fin, héritent de la couleur du bouton via currentColor)
// — rendu net façon Apple plutôt que des emojis.
function CategoryIcon({ id }) {
	const common = {
		width: 20,
		height: 20,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
	}
	switch (id) {
		case 'app':
			return (
				<svg {...common}>
					<rect x="3" y="3" width="7" height="7" rx="1.5" />
					<rect x="14" y="3" width="7" height="7" rx="1.5" />
					<rect x="3" y="14" width="7" height="7" rx="1.5" />
					<rect x="14" y="14" width="7" height="7" rx="1.5" />
				</svg>
			)
		case 'file':
			return (
				<svg {...common}>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
			)
		case 'action':
			return (
				<svg {...common}>
					<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
				</svg>
			)
		case 'clipboard':
			return (
				<svg {...common}>
					<rect x="8" y="2" width="8" height="4" rx="1" />
					<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
				</svg>
			)
		default:
			return null
	}
}

// Pictogrammes SVG pour les résultats sans logo d'app (actions, calcul,
// météo, presse-papier) — remplacent les emojis pour un rendu net façon Apple.
function ResultGlyph({ id }) {
	const common = {
		width: 20,
		height: 20,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
	}
	switch (id) {
		case 'new':
			return (
				<svg {...common}>
					<path d="M12 20h9" />
					<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
				</svg>
			)
		case 'import':
			return (
				<svg {...common}>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
			)
		case 'calc':
			return (
				<svg {...common}>
					<rect x="4" y="2" width="16" height="20" rx="2" />
					<line x1="8" y1="6" x2="16" y2="6" />
					<line x1="8" y1="14" x2="8" y2="14" />
					<line x1="12" y1="14" x2="12" y2="14" />
					<line x1="16" y1="14" x2="16" y2="14" />
					<line x1="8" y1="18" x2="8" y2="18" />
					<line x1="12" y1="18" x2="12" y2="18" />
					<line x1="16" y1="18" x2="16" y2="18" />
				</svg>
			)
		case 'weather':
			return (
				<svg {...common}>
					<circle cx="8" cy="8" r="3" />
					<line x1="8" y1="1.5" x2="8" y2="3" />
					<line x1="8" y1="13" x2="8" y2="14.5" />
					<line x1="1.5" y1="8" x2="3" y2="8" />
					<line x1="13" y1="8" x2="14.5" y2="8" />
					<path d="M17.5 20H10a4 4 0 0 1-.5-7.97A5 5 0 0 1 19 13a3.5 3.5 0 0 1-1.5 7z" />
				</svg>
			)
		case 'clipboard':
			return (
				<svg {...common}>
					<rect x="8" y="2" width="8" height="4" rx="1" />
					<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
				</svg>
			)
		default:
			return null
	}
}

// Filtre commun : matche le libellé, le sous-titre ou les mots-clés.
const matches = (entry, q) =>
	norm(entry.label).includes(q) ||
	norm(entry.sublabel).includes(q) ||
	(entry.keywords ? norm(entry.keywords).includes(q) : false)

// ── Résultats "intelligents" (ÉTAPE 3) ──
// Codes météo WMO → emoji + libellé FR (sous-ensemble courant).
const WEATHER_CODES = {
	0: { emoji: '☀️', text: 'Ciel dégagé' },
	1: { emoji: '🌤️', text: 'Plutôt dégagé' },
	2: { emoji: '⛅', text: 'Partiellement nuageux' },
	3: { emoji: '☁️', text: 'Couvert' },
	45: { emoji: '🌫️', text: 'Brouillard' },
	48: { emoji: '🌫️', text: 'Brouillard givrant' },
	51: { emoji: '🌦️', text: 'Bruine légère' },
	53: { emoji: '🌦️', text: 'Bruine' },
	55: { emoji: '🌦️', text: 'Bruine dense' },
	61: { emoji: '🌧️', text: 'Pluie légère' },
	63: { emoji: '🌧️', text: 'Pluie' },
	65: { emoji: '🌧️', text: 'Forte pluie' },
	71: { emoji: '🌨️', text: 'Neige légère' },
	73: { emoji: '🌨️', text: 'Neige' },
	75: { emoji: '🌨️', text: 'Forte neige' },
	80: { emoji: '🌦️', text: 'Averses' },
	81: { emoji: '🌦️', text: 'Averses' },
	82: { emoji: '⛈️', text: 'Fortes averses' },
	95: { emoji: '⛈️', text: 'Orage' },
	96: { emoji: '⛈️', text: 'Orage avec grêle' },
	99: { emoji: '⛈️', text: 'Orage violent' },
}

// Évalue une expression arithmétique simple SANS eval libre : on n'autorise
// QUE chiffres, opérateurs, parenthèses, points et espaces, et il faut au
// moins un opérateur binaire. Retourne un nombre, ou null si ce n'est pas un
// calcul valide.
function evalArithmetic(raw) {
	const expr = (raw || '').trim()
	if (!/[+\-*/%^]/.test(expr)) return null
	if (!/^[\d+\-*/%^().\s]+$/.test(expr)) return null
	try {
		const js = expr.replace(/\^/g, '**')
		// eslint-disable-next-line no-new-func
		const val = Function(`"use strict"; return (${js})`)()
		if (typeof val !== 'number' || !Number.isFinite(val)) return null
		// Arrondi propre pour éviter 0.1 + 0.2 = 0.30000000000000004.
		return Math.round((val + Number.EPSILON) * 1e10) / 1e10
	} catch {
		return null
	}
}

// Météo via Open-Meteo (API publique, sans clé) : géocodage de la ville puis
// relevé courant. Annulable via le signal d'un AbortController.
async function fetchWeather(city, signal) {
	const base = 'https://geocoding-api.open-meteo.com/v1/search'
	const geoUrl = base + '?name=' + encodeURIComponent(city) + '&count=1&language=fr&format=json'
	const geo = await fetch(geoUrl, { signal }).then((r) => r.json())
	const place = geo?.results?.[0]
	if (!place) return { status: 'notfound' }
	const fxUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude +
		'&longitude=' + place.longitude +
		'&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto'
	const fx = await fetch(fxUrl, { signal }).then((r) => r.json())
	const cur = fx?.current
	if (!cur) return { status: 'error' }
	return {
		status: 'done',
		name: place.name,
		country: place.country,
		temp: cur.temperature_2m,
		code: cur.weather_code,
		wind: cur.wind_speed_10m,
	}
}

export default function Spotlight() {
	// Premium — le « Spotlight avancé » (calcul, météo, presse-papier,
	// catégories et fichiers récents) est réservé au plan Pro+. En plan Gratuit,
	// le Spotlight reste « basique » : recherche d'apps et d'actions uniquement.
	// Un résultat-teaser verrouillé ouvre le panneau d'abonnement.
	// Owner/dev ne sont jamais verrouillés (isFeatureLocked).
	const { isFeatureLocked, openPremiumModal } = usePremium()
	const spotlightAdvancedLocked = isFeatureLocked('spotlight_advanced')
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [activeIndex, setActiveIndex] = useState(0)
	const inputRef = useRef(null)
	const listRef = useRef(null)
	// Catégorie active (filtre façon Spotlight Apple) : null = recherche libre.
	const [category, setCategory] = useState(null)
	// Barre de catégories : révélée au mouvement de la souris dans le panneau.
	const [catsHover, setCatsHover] = useState(false)
	const catsTimer = useRef(null)
	// Vue liste/grille (Applications & Fichiers) + menu « ••• » à droite.
	const [viewMode, setViewMode] = useState('list')
	const [menuOpen, setMenuOpen] = useState(false)
	// Catégorie survolée (rond) : change le placeholder de la barre, façon Apple.
	const [hoverCat, setHoverCat] = useState(null)
	// Sous-catégorie (chips sous la barre) pour Applications & Fichiers ('all' = tout).
	const [subFilter, setSubFilter] = useState('all')

	// Raccourci configurable (Paramètres JacSuite › Général).
	// Défaut 'ctrl+ ' (= Cmd/Ctrl + Espace) : eventToCombo mappe metaKey →
	// ctrl ET la barre d'espace → ' ', donc Cmd+Espace ET Ctrl+Espace
	// produisent le même combo 'ctrl+ '. NB : Cmd+Espace ouvre aussi le
	// Spotlight macOS au niveau OS → sur Mac, préférer Ctrl+Espace ou un
	// autre combo choisi dans les Paramètres.
	const shortcut = useJacSuiteSetting('jacsuite_spotlightShortcut', 'ctrl+ ')

	// ── Sources fichiers (live) ──
	// PDFs : recentFilesStore (localStorage) — local / Google Drive / JacCloud.
	// JacDocs : jacdocStore.list() depuis IndexedDB — rechargé à chaque
	//   ouverture du Spotlight pour refléter les derniers docs édités.
	const [recentPdfs, setRecentPdfs] = useState(() => recentFilesStore.getAll() || [])
	useEffect(() => {
		// subscribe(fn) peut rappeler fn SANS argument (et souvent
		// immédiatement à l'abonnement) : on re-lit toujours getAll() pour
		// éviter de pousser un undefined dans le state — ce qui faisait
		// planter le rendu de la liste ("juste la barre, aucun résultat").
		const sync = () => setRecentPdfs(recentFilesStore.getAll() || [])
		const unsub = recentFilesStore.subscribe(sync)
		return typeof unsub === 'function' ? unsub : undefined
	}, [])
	const [recentDocs, setRecentDocs] = useState([])
	const refreshDocs = useCallback(() => {
		jacdocStore.list().then((docs) => setRecentDocs(docs || [])).catch(() => {})
	}, [])
	useEffect(() => { refreshDocs() }, [refreshDocs])

	// ── Source presse-papier (live) ──
	const [clips, setClips] = useState(() => clipboardStore.getAll() || [])
	useEffect(() => {
		const sync = () => setClips(clipboardStore.getAll() || [])
		return clipboardStore.subscribe(sync)
	}, [])

	// ── Météo (ÉTAPE 3) ──
	// Déclenchée quand la requête commence par « météo » / « meteo » /
	// « weather » suivi d'une ville. Débounce 400 ms + AbortController pour
	// annuler les fetchs obsolètes quand on tape vite.
	const [weather, setWeather] = useState(null)
	useEffect(() => {
		if (spotlightAdvancedLocked) { setWeather(null); return }
		const m = query.trim().match(/^(?:météo|meteo|weather)\s+(.+)$/i)
		if (!m) { setWeather(null); return }
		const city = m[1].trim()
		if (!city) { setWeather(null); return }
		const controller = new AbortController()
		setWeather({ status: 'loading', city })
		const t = setTimeout(() => {
			fetchWeather(city, controller.signal)
				.then((res) => setWeather({ ...res, city }))
				.catch((e) => { if (e?.name !== 'AbortError') setWeather({ status: 'error', city }) })
		}, 400)
		return () => { clearTimeout(t); controller.abort() }
	}, [query, spotlightAdvancedLocked])

	const close = useCallback(() => {
		setOpen(false)
		setQuery('')
		setActiveIndex(0)
		setCategory(null)
		setCatsHover(false)
		setMenuOpen(false)
		setHoverCat(null)
		setSubFilter('all')
	}, [])

	const toggle = useCallback(() => setOpen((v) => !v), [])

	// Révèle la barre de catégories au mouvement de la souris, puis la masque
	// après une courte inactivité (elle reste si une catégorie est active).
	const revealCats = useCallback(() => {
		// Spotlight avancé verrouillé : pas de barre de catégories (réservé Pro).
		if (spotlightAdvancedLocked) return
		// Dans une catégorie : on ne ré-affiche pas les ronds (façon Apple).
		// On en sort en cliquant l'icône de catégorie (qui efface le filtre).
		if (category) return
		// Pendant qu'on écrit : pas de ronds non plus (ils restent masqués
		// tant qu'il y a du texte).
		if (query.trim()) return
		setCatsHover(true)
		if (catsTimer.current) clearTimeout(catsTimer.current)
		catsTimer.current = setTimeout(() => setCatsHover(false), 2200)
	}, [category, query, spotlightAdvancedLocked])
	useEffect(() => () => { if (catsTimer.current) clearTimeout(catsTimer.current) }, [])

	// Listener global du raccourci — ouverture IMMÉDIATE, façon Apple.
	// On ignore UNIQUEMENT l'auto-répétition clavier (e.repeat) : maintenir la
	// touche ne spamme pas l'ouverture/fermeture. En revanche, appuyer plusieurs
	// fois (en relâchant entre chaque appui) déclenche à chaque fois.
	useEffect(() => {
		const onKey = (e) => {
			const combo = eventToCombo(e)
			if (!combo || combo !== shortcut) return
			e.preventDefault()
			if (e.repeat) return
			toggle()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [shortcut, toggle])

	// À l'ouverture : focus auto + recharge la liste des JacDocs.
	useEffect(() => {
		if (open) {
			setActiveIndex(0)
			refreshDocs()
			requestAnimationFrame(() => inputRef.current?.focus())
		}
	}, [open, refreshDocs])

	// Entrées "fichiers" normalisées + triées par date desc.
	const fileEntries = useMemo(() => {
		const items = []
		for (const p of (recentPdfs || [])) {
			const isCloud = p.source === 'jacpdfCloud' && !!p.jacpdfCloudId
			const srcLabel = p.source === 'jacpdfCloud' ? 'JacCloud'
				: p.source === 'drive' ? 'Google Drive'
				: 'Local'
			items.push({
				id: `pdf:${entryKey(p)}`,
				type: 'pdf',
				tag: srcLabel,
				label: p.name,
				// Les PDF locaux / Drive ne portent pas leurs octets ici : on
				// renvoie l'utilisateur à l'accueil JacPDF (où vivent le picker
				// OS et l'intégration Drive). Les PDF JacCloud s'ouvrent direct.
				sublabel: isCloud ? 'PDF · JacCloud' : `PDF · ${srcLabel} — ouvre l'accueil JacPDF`,
				icon: '📄',
				logo: p.source === 'jacpdfCloud' ? APP_LOGOS.jaccloud
					: p.source === 'drive' ? APP_LOGOS.googleDrive
					: APP_LOGOS.jacpdf,
				subs: ['pdf', p.source === 'jacpdfCloud' ? 'jacpdfCloud' : p.source === 'drive' ? 'drive' : 'local'],
				keywords: `pdf ${srcLabel}`,
				timestamp: p.openedAt,
				run: () => {
					if (isCloud) emit('jacpdf:openCloudFile', { documentId: p.jacpdfCloudId, name: p.name })
					else emit('jacsuite:openJacPdfHome')
				},
			})
		}
		for (const d of recentDocs) {
			items.push({
				id: `jacdoc:${d.id}`,
				type: 'jacdoc',
				tag: 'JacDoc',
				label: d.title || 'Sans titre',
				sublabel: 'Document JacDoc',
				icon: '📝',
				logo: APP_LOGOS.jacdoc,
				subs: ['doc'],
				keywords: 'jacdoc document texte',
				timestamp: d.updatedAt,
				run: () => emit('jacsuite:openJacDoc', { docId: d.id, title: d.title || 'Sans titre' }),
			})
		}
		return items.sort(
			(a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime(),
		)
	}, [recentPdfs, recentDocs])

	// Entrées "presse-papier" normalisées (les plus récentes d'abord).
	const clipboardEntries = useMemo(() => {
		return (clips || []).map((c) => ({
			id: `clip:${c.id}`,
			type: 'clipboard',
			tag: 'Presse-papier',
			label: (c.text || '').replace(/\s+/g, ' ').slice(0, 80),
			sublabel: 'Entrée pour recopier',
			glyph: 'clipboard',
			keywords: 'presse papier clipboard copie copié',
			timestamp: c.time,
			run: () => { try { navigator.clipboard?.writeText(c.text) } catch {} },
		}))
	}, [clips])

	// Résultats "intelligents" : calcul instantané + météo, placés en tête.
	const smartEntries = useMemo(() => {
		const out = []
		const calc = evalArithmetic(query)
		if (calc !== null) {
			const resultStr = String(calc)
			out.push({
				id: 'smart:calc',
				type: 'calc',
				tag: 'Calcul',
				label: `${query.trim()} = ${resultStr}`,
				sublabel: 'Entrée pour copier le résultat',
				glyph: 'calc',
				run: () => { try { navigator.clipboard?.writeText(resultStr) } catch {} },
			})
		}
		if (weather && weather.city) {
			let label = `Météo · ${weather.city}`
			let sublabel = 'Chargement…'
			if (weather.status === 'done') {
				const w = WEATHER_CODES[weather.code] || { emoji: '🌡️', text: '' }
				label = `${w.emoji} ${Math.round(weather.temp)}°C · ${weather.name}${weather.country ? ', ' + weather.country : ''}`
				sublabel = `${w.text}${weather.wind != null ? ` · vent ${Math.round(weather.wind)} km/h` : ''}`
			} else if (weather.status === 'notfound') {
				sublabel = 'Ville introuvable'
			} else if (weather.status === 'error') {
				sublabel = 'Erreur de chargement'
			}
			out.push({
				id: 'smart:weather',
				type: 'weather',
				tag: 'Météo',
				label,
				sublabel,
				glyph: 'weather',
				run: () => {},
			})
		}
		return out
	}, [query, weather])

	// Résultats affichés.
	//  - Recherche vide : AUCUN résultat (liste masquée tant qu'on n'a pas tapé).
	//  - Recherche : résultats intelligents (calcul/météo) puis apps,
	//    fichiers et actions filtrés.
	const results = useMemo(() => {
		const q = norm(query.trim())
		// Spotlight avancé verrouillé (plan Gratuit) : recherche BASIQUE
		// uniquement (apps + actions). Pas de calcul, météo, presse-papier,
		// fichiers récents ni catégories. Un résultat-teaser propose le passage
		// au plan Pro et ouvre le panneau d'abonnement.
		if (spotlightAdvancedLocked) {
			if (!q) return []
			const basic = [
				...APP_RESULTS.filter((e) => matches(e, q)),
				...ACTION_RESULTS.filter((e) => matches(e, q)),
			]
			basic.push({
				id: 'smart:locked',
				type: 'locked',
				tag: 'Pro',
				label: 'Spotlight avancé',
				sublabel: 'Calcul, météo, presse-papier et fichiers récents — passe au plan Pro',
				icon: '🔒',
				run: () => openPremiumModal('spotlight_advanced'),
			})
			return basic
		}
		// Catégorie active : on ne montre QUE cette source (toutes ses entrées
		// si la recherche est vide, sinon filtrées par la requête).
		if (category) {
			const groups = {
				app: APP_RESULTS,
				file: fileEntries,
				action: ACTION_RESULTS,
				clipboard: clipboardEntries,
			}
			let base = groups[category] || []
			// Sous-catégorie active (chips) : Applications & Fichiers seulement.
			if ((category === 'app' || category === 'file') && subFilter !== 'all') {
				base = base.filter((e) => (e.subs || []).includes(subFilter))
			}
			return q ? base.filter((e) => matches(e, q)) : base
		}
		// Pas de catégorie : rien tant qu'on n'a pas tapé.
		if (!q) return []
		return [
			...smartEntries,
			...APP_RESULTS.filter((e) => matches(e, q)),
			...fileEntries.filter((e) => matches(e, q)),
			...ACTION_RESULTS.filter((e) => matches(e, q)),
			...clipboardEntries.filter((e) => matches(e, q)),
		]
	}, [query, category, subFilter, fileEntries, clipboardEntries, smartEntries, spotlightAdvancedLocked, openPremiumModal])

	// Garde l'index sélectionné dans les bornes quand la liste change.
	useEffect(() => {
		setActiveIndex((i) => Math.min(Math.max(0, i), Math.max(0, results.length - 1)))
	}, [results.length])

	const runEntry = useCallback((entry) => {
		if (!entry) return
		try { entry.run?.() } catch {}
		close()
	}, [close])

	const onInputKeyDown = (e) => {
		if (e.key === 'Escape') { e.preventDefault(); close(); return }
		if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); return }
		if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return }
		if (e.key === 'Enter') { e.preventDefault(); runEntry(results[activeIndex]); return }
	}

	// Garde l'élément actif visible quand on navigue au clavier.
	useEffect(() => {
		if (!open) return
		const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`)
		el?.scrollIntoView({ block: 'nearest' })
	}, [activeIndex, open])

	if (!open) return null

	return (
		<div
			className="jac-spotlight"
			role="dialog"
			aria-modal="true"
			aria-label="Spotlight JacSuite"
			onMouseDown={close}
			onMouseMove={revealCats}
		>
			<div className={`jac-spotlight__dock${catsHover ? ' jac-spotlight__dock--active' : ''}`}>
			<div className="jac-spotlight__panel" onMouseDown={(e) => e.stopPropagation()}>
				<div className="jac-spotlight__search">
					{category ? (
						<button
							type="button"
							className="jac-spotlight__search-icon jac-spotlight__search-scope"
							title="Retirer le filtre"
							aria-label="Retirer le filtre"
							onClick={() => { setCategory(null); setActiveIndex(0); setMenuOpen(false); setSubFilter('all') }}
						>
							<CategoryIcon id={category} />
						</button>
					) : (
						<svg className="jac-spotlight__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<circle cx="11" cy="11" r="8" />
							<line x1="21" y1="21" x2="16.65" y2="16.65" />
						</svg>
					)}
					<input
						ref={inputRef}
						className="jac-spotlight__input"
						type="text"
						placeholder={(hoverCat || category) ? CATEGORIES.find((c) => c.id === (hoverCat || category))?.label : 'Recherche Spotlight'}
						value={query}
						onChange={(e) => { setQuery(e.target.value); setCatsHover(false); if (catsTimer.current) clearTimeout(catsTimer.current) }}
						onKeyDown={onInputKeyDown}
						autoComplete="off"
						spellCheck="false"
					/>
					{category && category !== 'action' && (
						<div className="jac-spotlight__menu-wrap">
							<button
								type="button"
								className="jac-spotlight__more"
								title="Options"
								aria-label="Options"
								onClick={() => setMenuOpen((v) => !v)}
							>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
									<circle cx="5" cy="12" r="2" />
									<circle cx="12" cy="12" r="2" />
									<circle cx="19" cy="12" r="2" />
								</svg>
							</button>
							{menuOpen && (
								<div className="jac-spotlight__menu" onMouseDown={(e) => e.stopPropagation()}>
									{category === 'clipboard' ? (
										<button
											type="button"
											className="jac-spotlight__menu-item"
											onClick={() => { clipboardStore.clear(); setMenuOpen(false) }}
										>
											Effacer le presse-papier
										</button>
									) : (
										<>
											<button
												type="button"
												className={`jac-spotlight__menu-item${viewMode === 'list' ? ' jac-spotlight__menu-item--on' : ''}`}
												onClick={() => { setViewMode('list'); setMenuOpen(false) }}
											>
												Vue liste
											</button>
											<button
												type="button"
												className={`jac-spotlight__menu-item${viewMode === 'grid' ? ' jac-spotlight__menu-item--on' : ''}`}
												onClick={() => { setViewMode('grid'); setMenuOpen(false) }}
											>
												Vue grille
											</button>
										</>
									)}
								</div>
							)}
						</div>
					)}
				</div>

				{(category === 'app' || category === 'file') && (
					<div className="jac-spotlight__subcats" onMouseDown={(e) => e.stopPropagation()}>
						{(category === 'app' ? APP_SUBCATS : FILE_SUBCATS).map((s) => (
							<button
								key={s.id}
								type="button"
								className={`jac-spotlight__subcat${subFilter === s.id ? ' jac-spotlight__subcat--active' : ''}`}
								onClick={() => { setSubFilter(s.id); setActiveIndex(0) }}
							>
								{s.label}
							</button>
						))}
					</div>
				)}

				{(results.length > 0 || query.trim()) && (
				<ul className={`jac-spotlight__results${viewMode === 'grid' && (category === 'app' || category === 'file') ? ' jac-spotlight__results--grid' : ''}`} ref={listRef}>
					{query.trim() && results.length === 0 && (
						<li className="jac-spotlight__empty">Aucun résultat pour « {query.trim()} »</li>
					)}
					{results.map((r, idx) => (
						<li
							key={r.id}
							data-idx={idx}
							data-type={r.type}
							className={`jac-spotlight__item${idx === activeIndex ? ' jac-spotlight__item--active' : ''}`}
							onMouseEnter={() => setActiveIndex(idx)}
							onClick={() => runEntry(r)}
						>
							<span className="jac-spotlight__item-icon" aria-hidden="true">
								{r.logo ? <img className="jac-spotlight__item-logo" src={r.logo} alt="" draggable="false" /> : r.glyph ? <ResultGlyph id={r.glyph} /> : r.icon}
							</span>
							<span className="jac-spotlight__item-text">
								<span className="jac-spotlight__item-label">{r.label}</span>
								{r.sublabel && <span className="jac-spotlight__item-sub">{r.sublabel}</span>}
							</span>
							<span className="jac-spotlight__item-tag" data-tag={r.type}>{r.tag}</span>
						</li>
					))}
				</ul>
				)}

			</div>

			{catsHover && (
				<div className="jac-spotlight__cats" onMouseDown={(e) => e.stopPropagation()}>
					{CATEGORIES.map((c, i) => (
						<button
							key={c.id}
							type="button"
							title={c.label}
							aria-label={c.label}
							className={`jac-spotlight__cat${category === c.id ? ' jac-spotlight__cat--active' : ''}`}
							style={ { animationDelay: `${i * 45}ms` } }
							onMouseEnter={() => setHoverCat(c.id)}
							onMouseLeave={() => setHoverCat(null)}
							onClick={() => { setCategory((cur) => (cur === c.id ? null : c.id)); setActiveIndex(0); setCatsHover(false); setHoverCat(null); setSubFilter('all'); if (catsTimer.current) clearTimeout(catsTimer.current) }}
						>
							<span className="jac-spotlight__cat-icon" aria-hidden="true">
								<CategoryIcon id={c.id} />
							</span>
						</button>
					))}
				</div>
			)}
			</div>
		</div>
	)
}