// ─────────────────────────────────────────────────────────────────────────
// Registre central des apps JacSuite — SOURCE DE VÉRITÉ UNIQUE.
//
// Consommé par : JacLauncher, AppsMenu (menu ⋮⋮), Spotlight, les accueils
// (HomeContent JacPDF / JacDoc), FullSettingsModal et le futur App Store.
// Ajouter / modifier une app = éditer CE fichier uniquement.
//
// Les logos sont résolus ICI une seule fois. Avant, chaque consommateur
// refaisait son propre `new URL('../../logo/X.svg', import.meta.url)` avec
// un nombre de `../` différent selon sa profondeur — source de bugs.
// Depuis src/shared/lib/apps/ vers /logo/ : ../../../../logo/
// ─────────────────────────────────────────────────────────────────────────

import { getAppVersion, getAppPublishedDate, getAppLastUpdated } from '@/shared/components/modals/settings/shared/appChangelogs'

const logo = (file) => new URL(`../../../../logo/${file}`, import.meta.url).href

// status : 'stable' | 'beta' | 'alpha' | 'coming-soon'
//   - stable      → app pleinement utilisable
//   - beta        → utilisable mais en développement (badge orange)
//   - alpha        → très précoce / instable
//   - coming-soon → pas encore dispo (carte désactivée, badge « Bientôt »)
// feature : clé de gate premium (cf. premiumFeatures.js) ou null si gratuit.
// openEvent : CustomEvent écouté par SuiteShell pour ouvrir/focus l'app.
// pinnedByDefault : épinglée dans le menu principal au premier lancement.
// ── Champs « fiche App Store » (affichés au clic sur une tuile) ──
// description : texte long présenté sur la fiche détail.
// developer   : éditeur / auteur de l'app.
// category    : catégorie affichée (Productivité, Création, Stockage…).
// version     : tirée du changelog (SOURCE DE VÉRITÉ) via getAppVersion(id),
//               donc toujours synchro. '0.0.0' = app sans release suivie.
// publishedAt : date de la 1ʳᵉ entrée du changelog (la plus ancienne),
//               via getAppPublishedDate(id). null → affiché « — ».
// updatedAt   : date de la dernière entrée du changelog (la plus récente),
//               via getAppLastUpdated(id). null → affiché « — ».
export const APPS_CATALOG = [
	{
		id: 'jacpdf',
		name: 'JacPDF',
		tagline: 'Lire, annoter, organiser tes PDF',
		description:
			`JacPDF est ton lecteur et éditeur de PDF tout-en-un. Annote, surligne, organise et signe tes documents, fusionne ou découpe des pages, et retrouve tous tes fichiers au même endroit. Pensé pour être rapide, fluide et agréable au quotidien.`,
		developer: 'Jacob',
		category: 'Productivité',
		version: getAppVersion('jacpdf'),
		publishedAt: getAppPublishedDate('jacpdf'),
		updatedAt: getAppLastUpdated('jacpdf'),
		icon: '📄',
		logo: logo('JacPDF.svg'),
		color: 'red',
		status: 'stable',
		feature: null,
		openEvent: 'jacsuite:openJacPdfHome',
		pinnedByDefault: true,
	},
	{
		id: 'jacdoc',
		name: 'JacDoc',
		tagline: 'Documents et écriture',
		description:
			`JacDoc est l'éditeur de documents de JacSuite. Rédige des notes structurées, des rapports ou des articles avec une mise en forme riche, des blocs et un mode plein écran sans distraction.`,
		developer: 'Jacob',
		category: 'Productivité',
		version: getAppVersion('jacdoc'),
		publishedAt: getAppPublishedDate('jacdoc'),
		updatedAt: getAppLastUpdated('jacdoc'),
		icon: '📝',
		logo: logo('JacDoc.svg'),
		color: 'blue',
		status: 'stable',
		feature: null,
		openEvent: 'jacsuite:openJacDocHome',
		pinnedByDefault: true,
	},
	{
		id: 'jacnote',
		name: 'JacNote',
		tagline: 'Notes rapides',
		description:
			`JacNote te permet de capturer des idées en un éclair. Des notes rapides, légères et toujours synchronisées, parfaites pour les pense-bêtes et les listes du moment.`,
		developer: 'Jacob',
		category: 'Productivité',
		version: getAppVersion('jacnote'),
		publishedAt: getAppPublishedDate('jacnote'),
		updatedAt: getAppLastUpdated('jacnote'),
		icon: '🗒️',
		logo: logo('JacNote.svg'),
		color: 'green',
		status: 'stable',
		feature: null,
		openEvent: 'jacsuite:openJacNote',
		pinnedByDefault: true,
	},
	{
		id: 'jacpaint',
		name: 'JacPaint',
		tagline: 'Dessin et illustration',
		description:
			`JacPaint est l'atelier de dessin de JacSuite. Croquis, illustrations et schémas avec des pinceaux, des calques et une palette pensée pour la création libre.`,
		developer: 'Jacob',
		category: 'Création',
		version: getAppVersion('jacpaint'),
		publishedAt: getAppPublishedDate('jacpaint'),
		updatedAt: getAppLastUpdated('jacpaint'),
		icon: '🎨',
		logo: logo('JacPaint.svg'),
		color: 'purple',
		status: 'stable',
		feature: 'jacpaint_app',
		openEvent: 'jacsuite:openJacPaintHome',
		pinnedByDefault: false,
	},
	{
		id: 'jactache',
		name: 'JacTâche',
		tagline: 'Listes de tâches',
		description:
			`JacTâche organise tout ce que tu as à faire. Crée des listes, fixe des échéances, coche tes tâches et garde le cap sur tes projets, seul ou en équipe.`,
		developer: 'Jacob',
		category: 'Productivité',
		version: getAppVersion('jactache'),
		publishedAt: getAppPublishedDate('jactache'),
		updatedAt: getAppLastUpdated('jactache'),
		icon: '✅',
		logo: logo('JacTâche.svg'),
		color: 'yellow',
		status: 'stable',
		feature: 'app_jactache',
		openEvent: 'jacsuite:openJacTache',
		pinnedByDefault: false,
	},
	{
		id: 'jaccalendrier',
		name: 'JacCalendrier',
		tagline: 'Agenda et événements',
		description:
			`JacCalendrier réunit ton agenda et tes événements dans une vue claire. Planifie ta semaine, ajoute des rappels et visualise tout ce qui arrive d'un coup d'œil.`,
		developer: 'Jacob',
		category: 'Productivité',
		version: getAppVersion('jaccalendrier'),
		publishedAt: getAppPublishedDate('jaccalendrier'),
		updatedAt: getAppLastUpdated('jaccalendrier'),
		icon: '📅',
		logo: logo('JacCalendrier.svg'),
		color: 'cyan',
		status: 'stable',
		feature: 'app_jaccalendrier',
		openEvent: 'jacsuite:openJacCalendrier',
		pinnedByDefault: false,
	},
	{
		id: 'jaccloud',
		name: 'JacSuite Cloud',
		tagline: 'Tous tes fichiers cloud, centralisés',
		description:
			`JacSuite Cloud centralise tous tes fichiers issus des apps JacSuite. Un hub façon Drive pour retrouver, ouvrir et gérer tes documents où qu'ils soient, avec gestion du quota selon ton abonnement.`,
		developer: 'Jacob',
		category: 'Stockage',
		version: getAppVersion('jaccloud'),
		publishedAt: getAppPublishedDate('jaccloud'),
		updatedAt: getAppLastUpdated('jaccloud'),
		icon: '☁️',
		logo: logo('JacCloud.svg'),
		color: 'blue',
		status: 'stable',
		feature: 'cloud_sync',
		openEvent: 'jacsuite:openJacCloud',
		pinnedByDefault: false,
	},
	{
		id: 'classroom',
		name: 'Classroom',
		tagline: 'Cours, devoirs et classes',
		description:
			`Classroom rassemble cours, devoirs et classes dans un espace dédié. Partage des ressources, suis les rendus et garde le contact avec ta classe. Encore en bêta, de nouvelles fonctions arrivent régulièrement.`,
		developer: 'Jacob',
		category: 'Éducation',
		version: getAppVersion('classroom'),
		publishedAt: getAppPublishedDate('classroom'),
		updatedAt: getAppLastUpdated('classroom'),
		icon: '🏫',
		logo: logo('JacSuite Classroom.svg'),
		color: 'purple',
		status: 'beta',
		feature: 'classroom_app',
		openEvent: 'jacsuite:openClassroom',
		pinnedByDefault: false,
	},
	{
		id: 'jacslide',
		name: 'JacSlide',
		tagline: 'Présentations',
		description:
			`JacSlide te permettra bientôt de créer des présentations élégantes directement dans JacSuite. Diapositives, thèmes et mode présentateur — disponible prochainement.`,
		developer: 'Jacob',
		category: 'Création',
		version: getAppVersion('jacslide'),
		publishedAt: null,
		updatedAt: null,
		icon: '🎞️',
		logo: logo('JacSlide.svg'),
		color: 'orange',
		status: 'coming-soon',
		feature: null,
		openEvent: null,
		pinnedByDefault: false,
	},
	{
		id: 'jacchat',
		name: 'JacChat',
		tagline: 'Messagerie et discussions',
		description:
			`JacChat apportera la messagerie et les discussions à JacSuite. Échange en direct, crée des salons et reste connecté avec ton équipe. Bientôt disponible.`,
		developer: 'Jacob',
		category: 'Communication',
		version: getAppVersion('jacchat'),
		publishedAt: null,
		updatedAt: null,
		icon: '💬',
		logo: logo('JacChat.svg'),
		color: 'green',
		status: 'coming-soon',
		feature: null,
		openEvent: null,
		pinnedByDefault: false,
	},
	{
		id: 'jacform',
		name: 'JacForm',
		tagline: 'Formulaires et sondages',
		description:
			`JacForm te permettra de créer des formulaires et des sondages en quelques clics, de collecter des réponses et d'analyser les résultats. Bientôt disponible.`,
		developer: 'Jacob',
		category: 'Productivité',
		version: getAppVersion('jacform'),
		publishedAt: null,
		updatedAt: null,
		icon: '📋',
		logo: logo('JacForm.svg'),
		color: 'cyan',
		status: 'coming-soon',
		feature: null,
		openEvent: null,
		pinnedByDefault: false,
	},
	{
		id: 'jacconvert',
		name: 'JacConvert',
		tagline: 'Convertir tes fichiers',
		description:
			`JacConvert convertira tes fichiers d'un format à l'autre — documents, images et plus encore — simplement et rapidement. Bientôt disponible.`,
		developer: 'Jacob',
		category: 'Utilitaires',
		version: getAppVersion('jacconvert'),
		publishedAt: null,
		updatedAt: null,
		icon: '🔄',
		logo: logo('JacConvert.svg'),
		color: 'orange',
		status: 'coming-soon',
		feature: null,
		openEvent: null,
		pinnedByDefault: false,
	},
]

// Logos hors-catalogue réutilisés par certains consommateurs (marque
// JacSuite, Google Drive pour les fichiers récents). Gardés ici pour que
// /logo reste résolu à un seul endroit.
export const BRAND_LOGOS = {
	jacsuite: logo('JacSuite.svg'),
	googleDrive: logo('Google Drive.svg'),
}

// ── Helpers dérivés ──

// Map { id: logoHref } — drop-in pour remplacer les anciens APP_LOGOS locaux.
// Inclut aussi les BRAND_LOGOS pour compat (jacsuite, googleDrive).
export const APP_LOGOS = {
	...Object.fromEntries(APPS_CATALOG.map((a) => [a.id, a.logo])),
	...BRAND_LOGOS,
}

// Récupère une app par id.
export const getApp = (id) => APPS_CATALOG.find((a) => a.id === id)

// Apps épinglées par défaut (menu principal au premier lancement) :
// JacPDF, JacDoc, JacNote.
export const PINNED_APPS = APPS_CATALOG.filter((a) => a.pinnedByDefault)

// Apps « ouvrables » (exclut les coming-soon).
export const isComingSoon = (app) => app?.status === 'coming-soon'