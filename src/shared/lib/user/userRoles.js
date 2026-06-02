import { supabase } from "@/shared/lib/infra/supabase";

// ⚠️ Liste hardcodée des comptes propriétaires de l'application. Ces emails
// sont marqués owner d'office — peu importe leur user_metadata, peu importe
// ce que l'UI tente de modifier. Modification de cette liste = redeploy.
//
// C'est volontaire : un mécanisme purement métadonnées serait contournable
// depuis le client (n'importe qui peut updateUser({ data: { is_owner: true }})
// avec son propre token). Pour avoir une garantie d'identité, soit on
// hardcode (cette liste), soit on stocke server-side dans une table avec
// RLS qui interdit l'ecriture client (pas nécessaire à cette échelle).
//
// La comparaison est case-insensitive (Supabase normalise vers lowercase
// mais on sécurise quand même).
const OWNER_EMAILS = [
  'jacobveilleux09@gmail.com',
  '02.italique_suspect@icloud.com',
]

// =============================================================================
// DEV — comptes du développeur de l'application
// =============================================================================
// DEV_EMAILS — comptes du dev (Jacob). Affiche un badge orange « DEV » partout
// où le profil est rendu : topbar à droite du logo, ProfileModal,
// CollaboratorProfileModal, FriendsModal. Pour l'instant superset d'OWNER_EMAILS
// (Jacob est le seul dev), mais on garde la fonction séparée pour pouvoir
// distinguer plus tard « owner de l'app » (potentiellement plusieurs)
// de « dev actif » (Jacob seul) sans avoir à toucher l'UI.
const DEV_EMAILS = [
  'jacobveilleux09@gmail.com',
  '02.italique_suspect@icloud.com',
]

// Vérifie si un user a le statut dev (auteur de l'app). Combine deux sources :
//   1. Email dans DEV_EMAILS → dev garanti (immuable depuis le client).
//   2. user_metadata.is_dev === true → toggle UI pour tester l'UX dev sur
//      un compte secondaire qui n'est pas dans DEV_EMAILS.
// Retourne false pour user null/undefined ou non-connecté.
export function isDev(user) {
  if (!user) return false
  const email = (user.email || '').toLowerCase()
  if (email && DEV_EMAILS.some((e) => e.toLowerCase() === email)) return true
  if (user.user_metadata?.is_dev === true) return true
  return false
}

// Mirror d'isDev() pour les rows public.profiles (pas d'accès au
// user_metadata d'un autre user). Syncé par le trigger handle_new_user
// (Phase 1 SQL section 8) si on rajoute is_dev à la table un jour. Pour
// l'instant la garantie d'identité vient juste de l'email.
export function isDevFromProfile(profile) {
  if (!profile) return false
  const email = (profile.email || '').toLowerCase()
  if (email && DEV_EMAILS.some((e) => e.toLowerCase() === email)) return true
  if (profile.is_dev === true) return true
  return false
}

// Liste blanche optionnelle de testeurs (parallèle à OWNER_EMAILS, mais sans
// la garantie hardcoded d'identité — un tester c'est juste un user qui voit
// les boutons debug, pas une autorité). Modification = redeploy. La plupart
// des testers seront flagués via user_metadata.is_tester (toggleable depuis
// l'admin UI sans redeploy).
const TESTER_EMAILS = [
  // Ajouter ici les comptes beta-testers de confiance
]

// Vérifie si un user a le statut owner. Combine deux sources :
//   1. Email dans OWNER_EMAILS → owner garanti (immuable depuis le client).
//   2. user_metadata.is_owner === true → owner dev/test (toggle UI).
// Retourne false pour user null/undefined ou non-connecté.
export function isOwner(user) {
  if (!user) return false
  const email = (user.email || '').toLowerCase()
  if (email && OWNER_EMAILS.some((e) => e.toLowerCase() === email)) return true
  if (user.user_metadata?.is_owner === true) return true
  return false
}

// Toggle le flag is_owner dans user_metadata. N'a aucun effet sur les
// comptes hardcodés (ils restent owner via OWNER_EMAILS). Utilisé par le
// bouton debug de la home pour tester l'UX non-owner / owner sur un compte
// secondaire qui n'est pas dans OWNER_EMAILS.
//
// Throws si l'API Supabase échoue. Le caller doit gérer le toast d'erreur.
export async function setOwnerMetadata(value) {
  const { error } = await supabase.auth.updateUser({
    data: { is_owner: !!value },
  })
  if (error) throw error
}

// Vérifie si un user a le rôle beta-tester. Combine deux sources :
//   1. Email dans TESTER_EMAILS → tester garanti (immuable depuis le client).
//   2. user_metadata.is_tester === true → tester toggleable depuis l'admin.
// Retourne false pour user null/undefined ou non-connecté.
//
// ⚠️ Volontairement indépendant d'isOwner — un owner n'est pas automatique-
// ment tester. Si un bouton doit être visible aux deux, faire le OR au
// call-site : `isOwner(u) || isTester(u)`.
export function isTester(user) {
  if (!user) return false
  const email = (user.email || '').toLowerCase()
  if (email && TESTER_EMAILS.some((e) => e.toLowerCase() === email)) return true
  if (user.user_metadata?.is_tester === true) return true
  return false
}

// Toggle le flag is_tester dans user_metadata. Utilisé par l'admin UI pour
// promouvoir/rétrograder un compte au statut de beta-tester sans redeploy.
//
// Throws si l'API Supabase échoue. Le caller doit gérer le toast d'erreur.
export async function setTesterMetadata(value) {
  const { error } = await supabase.auth.updateUser({
    data: { is_tester: !!value },
  })
  if (error) throw error
}

// Expose la liste hardcodée des testers en lecture seule (pour debug/UI).
export function getHardcodedTesterEmails() {
  return [...TESTER_EMAILS]
}

// Expose la liste hardcodée en lecture seule (pour debug/affichage UI —
// jamais pour modifier la source de vérité).
export function getHardcodedOwnerEmails() {
  return [...OWNER_EMAILS]
}

// =============================================================================
// PREMIUM — accès aux fonctionnalités payantes (MOCK 1.x)
// =============================================================================
// ⚠️ MOCK : pas encore de vrai paiement. Le statut premium vient de 3 sources,
// par ordre de priorité :
//   1. Owner ou Dev de l'app → toujours premium (Jacob garde tout).
//   2. user_metadata.is_premium === true → flag du compte connecté, togglé par
//      le bouton « Devenir premium » (mock) ou, plus tard, par le webhook Stripe.
//   3. localStorage 'jacsuite_premium_mock' === 'true' → fallback pour le mode
//      « Continuer sans compte » (pas de user → pas de metadata).
// Quand Stripe sera branché, seule la source (2) changera de mécanisme ;
// isPremium() et les call-sites restent identiques.
export const PREMIUM_MOCK_STORAGE_KEY = 'jacsuite_premium_mock'

// ⚠️ TEST UNIQUEMENT — override « forcer non-premium ». Quand ce flag local
// est 'true', isPremium() renvoie false POUR TOUT LE MONDE, y compris
// owner/dev. Ça permet à Jacob (toujours premium d'office) de visualiser les
// écrans de verrou et le paywall comme un vrai utilisateur gratuit. Aucun
// effet en prod tant que personne ne pose le flag.
export const PREMIUM_FORCE_OFF_STORAGE_KEY = 'jacsuite_premium_force_off'

function readMockPremiumFlag() {
  try { return localStorage.getItem(PREMIUM_MOCK_STORAGE_KEY) === 'true' }
  catch { return false }
}

function readForceNonPremiumFlag() {
  try { return localStorage.getItem(PREMIUM_FORCE_OFF_STORAGE_KEY) === 'true' }
  catch { return false }
}

// Retourne le palier d'abonnement de l'user : 'gratuit' | 'pro' | 'premium'.
// Sources, par ordre de priorité :
//   0. override de test « forcer non-premium » → 'gratuit' (pour tout le monde).
//   0b. compte anonyme (« Continuer sans compte ») → 'gratuit' d'office (ne doit
//       jamais hériter du flag premium mock laissé par une session précédente).
//   1. owner/dev → 'premium' d'office (Jacob garde tout).
//   2. user_metadata.plan ('gratuit'|'pro'|'premium') — posé par l'admin
//      (RPC admin_set_plan) ou, plus tard, par le webhook Stripe.
//   3. rétro-compat : ancien flag booléen user_metadata.is_premium → 'premium'.
//   4. fallback localStorage 'jacsuite_premium_mock' (mode sans compte) → 'premium'.
export function getUserTier(user) {
  if (readForceNonPremiumFlag()) return 'gratuit'
  // Un compte anonyme (« Continuer sans compte ») est toujours au palier Gratuit :
  // il ne doit jamais reprendre le flag premium mock (localStorage) laissé par une
  // session connectée précédente sur le même appareil.
  if (user?.is_anonymous) return 'gratuit'
  if (isOwner(user) || isDev(user)) return 'premium'
  const plan = user?.user_metadata?.plan
  if (plan === 'gratuit' || plan === 'pro' || plan === 'premium') return plan
  if (user?.user_metadata?.is_premium === true) return 'premium'
  if (readMockPremiumFlag()) return 'premium'
  return 'gratuit'
}

// Vérifie si un user a accès à un plan payant (Pro ou Premium). Owner/dev
// toujours premium — SAUF si l'override de test « forcer non-premium » est
// actif. Délègue à getUserTier pour rester cohérent avec le modèle de paliers.
export function isPremium(user) {
  return getUserTier(user) !== 'gratuit'
}

// Active/désactive l'override de test « forcer non-premium ». Pose le flag
// localStorage et dispatch 'jacsuite:settingsChanged' pour resynchroniser
// usePremium() + tous les gates en live (sans reload). Réservé au debug.
export function setPremiumForceOff(value) {
  try {
    localStorage.setItem(PREMIUM_FORCE_OFF_STORAGE_KEY, value ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
  } catch {}
}

// Mirror d'isPremium() pour les rows public.profiles (amis / collaborateurs).
export function isPremiumFromProfile(profile) {
  if (!profile) return false
  if (isOwnerFromProfile(profile)) return true
  return profile.is_premium === true
}

// Active/désactive le premium (MOCK). Pose le flag localStorage immédiatement
// (réaction instantanée de l'UI + couvre le mode sans compte), puis persiste
// dans user_metadata si un compte est connecté. Dispatch 'jacsuite:settingsChanged'
// pour que usePremium() et les gates se resynchronisent en live.
//
// Throws seulement si la persistance Supabase échoue alors qu'un user est passé.
// Le flag local est posé dans tous les cas — l'UX reste cohérente même hors-ligne.
export async function setPremiumMock(value, user) {
  const on = !!value
  try {
    localStorage.setItem(PREMIUM_MOCK_STORAGE_KEY, on ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
  } catch {}
  if (user) {
    const { error } = await supabase.auth.updateUser({
      data: { is_premium: on },
    })
    if (error) throw error
  }
}

// =============================================================================
// Helpers pour profils d'AMIS (lecture depuis public.profiles)
// =============================================================================
// auth.users.raw_user_meta_data n'est pas accessible aux autres users — donc
// pour afficher les badges d'un ami on lit depuis la table publique profiles
// où les champs sont synchronisés par le trigger handle_new_user (cf. Phase 1
// SQL Setup section 8). Toute évolution de la logique des badges doit être
// mirrorée dans ProfileModal.jsx::getRoleBadge() (qui lit user_metadata).

// Mirror de getRoleBadge() (ProfileModal) mais lit depuis une row profiles.
// Retourne null si l'ami n'a pas complété l'onboarding.
export function getRoleBadgeFromProfile(profile) {
  if (!profile?.role) return null
  const { role, custom_role, school_role, custom_school_role } = profile
  if (role === 'personnel') return { variant: 'personnel', icon: '🏠', label: 'Personnel' }
  if (role === 'travail')   return { variant: 'travail',   icon: '💼', label: 'Travail' }
  if (role === 'ecole') {
    let sub = ''
    if (school_role === 'enseignant') sub = 'Enseignant'
    else if (school_role === 'eleve') sub = 'Élève'
    else if (school_role === 'autre' && custom_school_role) sub = custom_school_role
    return { variant: 'ecole', icon: '🎓', label: sub ? `École · ${sub}` : 'École' }
  }
  if (role === 'autre') return { variant: 'autre', icon: '✨', label: custom_role || 'Autre' }
  return null
}

// Mirror d'isOwner() mais lit depuis une row profiles. Combine :
//   1. Email dans OWNER_EMAILS hardcodé (immuable, source de vérité).
//   2. profiles.is_owner = true (mirror de user_metadata.is_owner via le
//      trigger handle_new_user — sert au mode debug 👑).
export function isOwnerFromProfile(profile) {
  if (!profile) return false
  const email = (profile.email || '').toLowerCase()
  if (email && OWNER_EMAILS.some((e) => e.toLowerCase() === email)) return true
  if (profile.is_owner === true) return true
  return false
}