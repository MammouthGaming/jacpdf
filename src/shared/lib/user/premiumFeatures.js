// Source de vérité unique des fonctionnalités premium de JacSuite.
// Chaque entrée définit une « feature gate » identifiée par une clé stable.
// L'UI vérifie l'accès via le hook usePremium() → isFeatureLocked(key).
//
// ⚠️ MOCK (JacSuite 1.x) : pas encore de vrai paiement. Le statut premium est
// un flag (user_metadata.is_premium ou fallback localStorage) togglé par le
// bouton « Devenir premium » de la PremiumModal. Quand le vrai paiement
// (Stripe) arrivera, SEULE la source du flag changera — les clés et les gates
// ci-dessous restent identiques.
//
// 👉 Pour rendre une nouvelle fonctionnalité premium : ajoute une clé ici,
// puis gate-la au call-site avec usePremium().isFeatureLocked('ta_cle').

export const PREMIUM_FEATURES = {
  // --- Barre latérale d'apps + Spotlight avancé ---
  app_sidebar: {
    label: 'Barre latérale d’apps',
    description: 'Le rail d’apps style Edge : panneau ancré, épinglable, redimensionnable.',
    app: 'jacsuite',
    icon: '🧭',
    tier: 'pro',
  },
  spotlight_advanced: {
    label: 'Spotlight avancé',
    description: 'Calcul, météo, presse-papier, catégories et fichiers récents dans le Spotlight.',
    app: 'jacsuite',
    icon: '🔦',
    tier: 'pro',
  },

  // --- JacPDF : export haute qualité ---
  // Verrou réel (pas une vitrine) : câblé dans ExportModal.jsx sur le sélecteur
  // « Qualité » (rendu raster ×4 pour les exports PNG / image).
  pdf_export_hq: {
    label: 'Export PDF haute qualité',
    description: 'Exporte les pages en haute résolution (rendu raster ×4) pour des PNG et images nets.',
    app: 'jacpdf',
    icon: '📤',
    tier: 'pro',
  },

  // --- JacPDF Cloud : stockage & synchronisation ---
  // Verrou réel : Gratuit = cloud bloqué (palier 'pro' requis). Le quota par
  // palier (Pro 100 Mo, Premium illimité) est défini dans
  // CLOUD_QUOTA_BYTES_BY_TIER et appliqué dans useJacpdfCloud.saveFile.
  cloud_sync: {
    label: 'Stockage cloud JacPDF',
    description: 'Sauvegarde et synchronise tes PDF dans JacPDF Cloud. 100 Mo en Pro, illimité en Premium.',
    app: 'jacpdf',
    icon: '☁️',
    tier: 'pro',
  },

  // --- JacPaint : application complète ---
  jacpaint_app: {
    label: 'JacPaint',
    description: 'L’éditeur de dessin complet : calques, filtres, sélection, export…',
    app: 'jacpaint',
    icon: '🎨',
    tier: 'premium',
  },

  // --- Apps Pro : JacTâche & JacCalendrier ---
  // Verrou réel : Gratuit n'a que les apps de base (JacPDF, JacDoc, JacNote).
  // JacTâche et JacCalendrier demandent le palier Pro. L'entrée dans l'app est
  // bloquée dans SuiteShell (ouverture / conversion d'onglet → paywall).
  app_jactache: {
    label: 'JacTâche',
    description: 'Listes de tâches, sous-tâches, rappels et digest quotidien.',
    app: 'jactache',
    icon: '✅',
    tier: 'pro',
  },
  app_jaccalendrier: {
    label: 'JacCalendrier',
    description: 'Agenda mensuel, événements et tâches à échéance en pastilles.',
    app: 'jaccalendrier',
    icon: '📅',
    tier: 'pro',
  },

  // --- Classroom : application complète (réservée Premium) ---
  // Verrou réel : l'entrée dans Classroom (carte launcher, menu Applications,
  // Spotlight, accueils d'apps) est bloquée dans SuiteShell pour les paliers
  // < Premium → ouverture du paywall.
  classroom_app: {
    label: 'Classroom',
    description: 'Cours, devoirs et classes : distribue et corrige des documents en classe.',
    app: 'jacpdf',
    icon: '🏫',
    tier: 'premium',
  },

  // --- JacPaint : historique de versions (snapshots) ---
  // Verrou réel (pas une vitrine) : câblé dans JacPaintInstance.jsx sur
  // l'ouverture de la modale Snapshots + la création des snapshots auto.
  jacpaint_version_history: {
    label: 'Historique de versions',
    description: 'Snapshots manuels et automatiques d’une toile, avec restauration à tout moment.',
    app: 'jacpaint',
    icon: '🕰️',
    tier: 'pro',
  },

  // --- JacDoc : historique de versions ---
  // Verrou réel (pas une vitrine) : câblé dans JacDocEditor.jsx sur
  // l'ouverture de la vue Historique + la création des snapshots auto.
  jacdoc_version_history: {
    label: 'Historique de versions',
    description: 'Versions automatiques d’un document, avec aperçu et restauration façon Google Docs.',
    app: 'jacdoc',
    icon: '🕰️',
    tier: 'pro',
  },

  // --- Partage & collaboration avancés (transverse) ---
  // Verrou réel (pas une vitrine), PARTAGÉ par toutes les apps qui ont du
  // partage : JacDoc (bouton « Partager » + panneau Commentaires de la topbar)
  // et JacPDF (bouton « Partager » de la topbar éditeur). Gratuit et Pro voient
  // un badge Premium et tombent sur le paywall ; seul Premium peut partager un
  // document et ouvrir les commentaires collaboratifs.
  sharing_collaboration: {
    label: 'Partage & collaboration avancés',
    description: 'Partage de documents et commentaires collaboratifs en temps réel dans JacSuite (JacDoc, JacPDF…).',
    app: 'jacsuite',
    icon: '🤝',
    tier: 'premium',
  },
}

// =============================================================================
// PALIERS D'ABONNEMENT — Gratuit < Pro < Premium
// =============================================================================
// Une feature est débloquée si le palier de l'user est >= au palier requis
// par la feature (cf. tierMeetsRequirement). Le palier vient de getUserTier()
// dans userRoles.js (owner/dev, user_metadata.plan, rétro-compat is_premium…).
export const PLAN_TIERS = ['gratuit', 'pro', 'premium']

export const PLAN_RANK = { gratuit: 0, pro: 1, premium: 2 }

export const PLAN_LABELS = { gratuit: 'Gratuit', pro: 'Pro', premium: 'Premium' }

export const DEFAULT_TIER = 'gratuit'

// Palier minimum requis pour débloquer une feature (défaut prudent : 'premium').
export function getFeatureTier(key) {
  return PREMIUM_FEATURES[key]?.tier || 'premium'
}

// True si le palier `userTier` couvre le palier requis `requiredTier`.
export function tierMeetsRequirement(userTier, requiredTier) {
  return (PLAN_RANK[userTier] ?? 0) >= (PLAN_RANK[requiredTier] ?? 0)
}

// Quota de stockage JacPDF Cloud par palier (en octets). Gratuit = 0 (cloud
// bloqué), Pro = 100 Mo, Premium = illimité (Infinity). Câblé dans
// useJacpdfCloud : calcul du quota affiché + blocage des sauvegardes au-delà.
export const CLOUD_QUOTA_BYTES_BY_TIER = {
  gratuit: 0,
  pro: 100 * 1024 * 1024,
  premium: Infinity,
}

// Quota cloud (octets) pour un palier donné. Défaut prudent : 0 (bloqué).
export function getCloudQuotaBytes(tier) {
  return CLOUD_QUOTA_BYTES_BY_TIER[tier] ?? 0
}

// Délai de grâce (ms) avant suppression automatique des fichiers JacPDF Cloud
// quand on repasse au plan Gratuit (quota 0). Pendant ce compte à rebours les
// fichiers sont conservés ; repasser Pro/Premium annule la suppression.
// Ajustable (défaut : 7 jours).
export const CLOUD_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

export const PREMIUM_FEATURE_KEYS = Object.keys(PREMIUM_FEATURES)

// True si la clé correspond à une fonctionnalité premium connue.
export function isPremiumFeature(key) {
  return Object.prototype.hasOwnProperty.call(PREMIUM_FEATURES, key)
}

export function getPremiumFeature(key) {
  return PREMIUM_FEATURES[key] || null
}

// Regroupe les features premium par app (pour l'affichage dans la PremiumModal).
export function getPremiumFeaturesByApp() {
  const byApp = {}
  for (const [key, feat] of Object.entries(PREMIUM_FEATURES)) {
    const app = feat.app || 'jacsuite'
    if (!byApp[app]) byApp[app] = []
    byApp[app].push({ key, ...feat })
  }
  return byApp
}

// Cartes d'abonnement affichées dans la PremiumModal (MOCK : pas de vrai prix
// tant que Stripe n'est pas branché — priceLabel reste '—', sauf le plan « Sur mesure » qui affiche « Nous contacter »).
// `soon: true` = fonctionnalité « vitrine » : affichée mais pas encore gardée
// par une gate réelle (à brancher plus tard).
export const PLANS = [
  {
    id: 'gratuit',
    name: 'Gratuit',
    icon: '🆓',
    tagline: 'Pour commencer',
    priceLabel: '—',
    perks: [
      { label: 'Apps de base : JacPDF, JacDoc, JacNote' },
      { label: 'Recherche Spotlight basique' },
      { label: 'Amis & messagerie' },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: '⚡',
    tagline: 'Pour les utilisateurs réguliers',
    priceLabel: '—',
    featured: true,
    perks: [
      { label: 'Tout le plan Gratuit' },
      { label: 'Toutes les apps sauf JacPaint & Classroom (JacTâche, JacCalendrier…)' },
      { label: 'Barre latérale d’apps' },
      { label: 'Spotlight avancé (calcul, météo, presse-papier…)' },
      { label: 'Export PDF haute qualité' },
      { label: 'Stockage cloud JacPDF (100 Mo)' },
      { label: 'Historique de versions' },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    icon: '💎',
    tagline: 'Tout JacSuite, sans limite',
    priceLabel: '—',
    perks: [
      { label: 'Tout le plan Pro' },
      { label: 'JacPaint — l’éditeur de dessin complet' },
      { label: 'Classroom — cours, devoirs et classes' },
      { label: 'Stockage cloud illimité / sync sans limite' },
      { label: 'Partage & collaboration avancés' },
      { label: 'Badge Premium 💎 + cosmétiques exclusifs' },
      { label: 'Accès anticipé aux nouveautés', soon: true },
    ],
  },
  {
    id: 'custom',
    name: 'Sur mesure',
    icon: '🛠️',
    tagline: 'Une offre taillée pour tes besoins',
    priceLabel: 'Nous contacter',
    perks: [
      { label: 'Tout le plan Premium' },
      { label: 'Quotas & fonctionnalités personnalisés' },
      { label: 'Stockage cloud sur mesure' },
      { label: 'Support prioritaire dédié', soon: true },
      { label: 'Intégrations & déploiement sur demande', soon: true },
    ],
  },
  {
    // Plan « Scolaire » — vitrine (soon) : pas encore activable. Contient
    // Classroom pour l'instant ; d'autres outils scolaires viendront.
    id: 'scolaire',
    name: 'Scolaire',
    icon: '🎓',
    tagline: 'Pour les classes et les profs',
    priceLabel: '—',
    soon: true,
    extra: true,
    perks: [
      { label: 'Classroom — cours, devoirs et classes' },
    ],
  },
]

// Rétro-compat : ancien objet « plan unique » encore importé ailleurs.
export const PREMIUM_PLAN = {
  name: 'JacSuite Premium',
  priceLabel: '—',
  tagline: 'Débloque tout JacSuite',
  perks: PLANS[2].perks.map((p) => p.label),
}