import { useEffect, useState } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { toastStore } from '@/shared/stores/ui/toastStore'
import { supabase } from '@/shared/lib/infra/supabase'
import { isOwner, isDev, isPremium, getUserTier } from '@/shared/lib/user/userRoles'
import { getUserPdfCount } from '@/shared/lib/social/friendshipsRepo'

// Formate une date ISO Supabase (user.created_at) en jour-mois-année français.
// Ex. "2025-08-15T10:23:11.000Z" → "15 août 2025". Retourne "—" si l'input
// est null/undefined ou non-parsable.
function formatMemberSince(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('fr-CA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    return '—'
  }
}

// Construit l'objet badge à afficher pour le rôle de l'utilisateur (collecté
// par RoleOnboardingModal → user_metadata.role). Retourne null si l'onboarding
// n'est pas fait — on retombe alors sur le placeholder « Badges à venir ».
// Pour 'ecole', combine le rôle principal avec le sous-rôle (Enseignant /
// Élève / custom).
function getRoleBadge(user) {
  const md = user?.user_metadata
  if (!md?.role) return null
  const { role, custom_role, school_role, custom_school_role } = md
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

const STYLES = `
  .pm-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 1100;
    padding: 24px;
  }
  .pm-card {
    background: #1a1f2e;
    border: 1px solid #2a3347;
    border-radius: 14px;
    width: 100%; max-width: 520px;
    max-height: 85vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    color: #e5e7eb;
    font-family: 'Inter', sans-serif;
  }
  [data-theme="light"] .pm-card {
    background: #ffffff;
    border-color: #e5e7eb;
    color: #0d1117;
  }
  .pm-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #2a3347;
    flex-shrink: 0;
  }
  [data-theme="light"] .pm-header { border-color: #e5e7eb; }
  .pm-title { font-size: 16px; font-weight: 600; margin: 0; }
  .pm-close {
    background: transparent; border: none; color: inherit;
    font-size: 18px; cursor: pointer; padding: 4px 8px;
    border-radius: 4px; line-height: 1;
  }
  .pm-close:hover { background: rgba(255, 255, 255, 0.07); }
  [data-theme="light"] .pm-close:hover { background: rgba(0, 0, 0, 0.06); }
  .pm-body {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column;
    gap: 20px;
    padding: 20px;
  }
  .pm-hero {
    display: flex; align-items: center; gap: 16px;
  }
  .pm-avatar {
    width: 72px; height: 72px;
    border-radius: 50%;
    background: rgba(var(--accent-rgb, 57, 255, 20), 0.13);
    border: 2px solid var(--accent, #39FF14);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0;
    box-sizing: border-box;
  }
  .pm-avatar-img {
    width: 100%; height: 100%;
    object-fit: cover; display: block;
  }
  .pm-avatar-initials {
    font-size: 28px; font-weight: 700;
    color: var(--accent, #39FF14);
  }
  /* ─── Cosmétique exclusif Premium : halo doré autour de l'avatar ───
     Réservé au palier Premium (getUserTier === 'premium'). Le wrapper porte
     le glow animé + le médaillon 💎 ; le box-shadow déborde hors de l'avatar
     (qui est en overflow:hidden pour clipper la photo), donc le halo reste
     visible. Pro/Gratuit n'y ont pas droit — c'est la récompense Premium. */
  .pm-avatar-wrap { position: relative; flex-shrink: 0; display: inline-flex; }
  .pm-avatar--premium {
    border-color: #f5c518 !important;
    animation: pm-premium-glow 2.6s ease-in-out infinite;
  }
  @keyframes pm-premium-glow {
    0%, 100% { box-shadow: 0 0 0 2px rgba(245, 197, 24, 0.40), 0 0 12px 2px rgba(245, 197, 24, 0.38); }
    50%      { box-shadow: 0 0 0 2px rgba(245, 197, 24, 0.60), 0 0 20px 5px rgba(245, 197, 24, 0.55); }
  }
  .pm-avatar-crest {
    position: absolute;
    bottom: -3px; right: -3px;
    width: 26px; height: 26px;
    border-radius: 50%;
    background: linear-gradient(135deg, #fde68a, #f5c518);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; line-height: 1;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.40), 0 0 0 2px #1a1f2e;
    pointer-events: none;
  }
  [data-theme="light"] .pm-avatar-crest {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.20), 0 0 0 2px #ffffff;
  }
  .pm-hero-info {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 4px;
  }
  .pm-name {
    font-size: 18px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .pm-email {
    font-size: 13px; color: #9ca3af;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .pm-header-actions {
    display: flex; align-items: center; gap: 4px;
  }
  .pm-edit-btn {
    background: transparent; border: none; color: inherit;
    cursor: pointer; padding: 6px 8px;
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .pm-edit-btn:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--accent, #39FF14);
  }
  [data-theme="light"] .pm-edit-btn:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  .pm-stats {
    display: flex; flex-direction: column;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid #2a3347;
    border-radius: 10px;
    overflow: hidden;
  }
  [data-theme="light"] .pm-stats {
    background: #fafafa; border-color: #e5e7eb;
  }
  .pm-stat-row {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px;
  }
  .pm-stat-row + .pm-stat-row {
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }
  [data-theme="light"] .pm-stat-row + .pm-stat-row {
    border-top-color: rgba(0, 0, 0, 0.06);
  }
  .pm-stat-icon {
    width: 36px; height: 36px; border-radius: 8px;
    background: rgba(var(--accent-rgb, 57, 255, 20), 0.13);
    color: var(--accent, #39FF14);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .pm-stat-info {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 2px;
  }
  .pm-stat-label {
    font-size: 10px; color: #9ca3af;
    text-transform: uppercase; letter-spacing: 0.06em;
    font-weight: 600;
  }
  .pm-stat-value {
    font-size: 15px; font-weight: 600;
    color: inherit;
    display: inline-flex; align-items: baseline; gap: 6px;
  }
  .pm-stat-pending {
    font-size: 10px; color: #6b7280; font-style: italic;
    font-weight: 400;
  }
  .pm-badges {
    display: flex; gap: 6px; flex-wrap: wrap;
    margin-top: 6px;
  }
  .pm-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.4;
  }
  .pm-badge-pending {
    background: rgba(255, 255, 255, 0.04);
    color: #6b7280;
    border: 1px dashed #2a3347;
    font-style: italic;
  }
  [data-theme="light"] .pm-badge-pending {
    background: #f5f5f5;
    border-color: #e5e7eb;
    color: #9ca3af;
  }
  /* Badges de rôle — une variante de couleur par catégorie pour identifi-
     cation visuelle immédiate. Border 1px (pas dashed comme pending) et
     pas d'italique — c'est de la donnée réelle, pas un placeholder. */
  .pm-badge-role-icon { font-size: 12px; line-height: 1; }
  .pm-badge-role-personnel {
    background: rgba(59, 130, 246, 0.13);
    color: #93c5fd;
    border: 1px solid rgba(59, 130, 246, 0.35);
  }
  [data-theme="light"] .pm-badge-role-personnel {
    background: rgba(59, 130, 246, 0.08);
    color: #1d4ed8;
    border-color: rgba(59, 130, 246, 0.25);
  }
  .pm-badge-role-travail {
    background: rgba(245, 158, 11, 0.13);
    color: #fcd34d;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }
  [data-theme="light"] .pm-badge-role-travail {
    background: rgba(245, 158, 11, 0.10);
    color: #b45309;
    border-color: rgba(245, 158, 11, 0.30);
  }
  .pm-badge-role-ecole {
    background: rgba(168, 85, 247, 0.13);
    color: #d8b4fe;
    border: 1px solid rgba(168, 85, 247, 0.35);
  }
  [data-theme="light"] .pm-badge-role-ecole {
    background: rgba(168, 85, 247, 0.08);
    color: #7e22ce;
    border-color: rgba(168, 85, 247, 0.30);
  }
  .pm-badge-role-autre {
    background: rgba(156, 163, 175, 0.13);
    color: #d1d5db;
    border: 1px solid rgba(156, 163, 175, 0.35);
  }
  [data-theme="light"] .pm-badge-role-autre {
    background: rgba(156, 163, 175, 0.10);
    color: #4b5563;
    border-color: rgba(156, 163, 175, 0.30);
  }
  /* Badge Dev — statut spécial (développeur de l'app). Orange shimmer
     pour le distinguer du badge Owner (or). Source de vérité :
     lib/user/userRoles.js → isDev(). Affiché en PREMIER dans la liste
     car c'est l'identité la plus spécifique — un dev est forcément
     owner de son app, mais pas l'inverse. */
  .pm-badge-dev {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.22), rgba(234, 88, 12, 0.22));
    color: #fed7aa;
    border: 1px solid rgba(249, 115, 22, 0.50);
    box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.10);
  }
  [data-theme="light"] .pm-badge-dev {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(234, 88, 12, 0.18));
    color: #9a3412;
    border-color: rgba(234, 88, 12, 0.50);
  }
  /* Badge Owner — statut spécial (propriétaire de l'app). Or shimmer
     pour le distinguer immédiatement des badges de rôle ordinaires.
     Source de vérité : lib/user/userRoles.js → isOwner(). */
  .pm-badge-owner {
    background: linear-gradient(135deg, rgba(250, 204, 21, 0.20), rgba(245, 158, 11, 0.20));
    color: #fde68a;
    border: 1px solid rgba(250, 204, 21, 0.45);
    box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.10);
  }
  [data-theme="light"] .pm-badge-owner {
    background: linear-gradient(135deg, rgba(250, 204, 21, 0.15), rgba(245, 158, 11, 0.18));
    color: #92400e;
    border-color: rgba(245, 158, 11, 0.45);
  }
  /* Badge Premium — accès payant (mock 1.x). Violet/améthyste shimmer pour
     le distinguer des badges de rôle, du badge owner (or) et du badge dev
     (orange). Source de vérité : lib/user/userRoles.js → isPremium(). Owner
     et dev sont premium d'office, donc ce badge peut coexister avec 👑/🔧. */
  .pm-badge-premium {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(192, 132, 252, 0.22));
    color: #e9d5ff;
    border: 1px solid rgba(192, 132, 252, 0.50);
    box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.10);
  }
  [data-theme="light"] .pm-badge-premium {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(147, 51, 234, 0.18));
    color: #6b21a8;
    border-color: rgba(147, 51, 234, 0.45);
  }
  /* Badge Pro — palier intermédiaire. Cyan/azur pour le distinguer du
     Premium (violet) et de l'Owner (or). Source : getUserTier() === 'pro'. */
  .pm-badge-pro {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(14, 165, 233, 0.22));
    color: #bae6fd;
    border: 1px solid rgba(56, 189, 248, 0.50);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.10);
  }
  [data-theme="light"] .pm-badge-pro {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(2, 132, 199, 0.18));
    color: #075985;
    border-color: rgba(2, 132, 199, 0.45);
  }
  .pm-notes {
    display: flex; flex-direction: column; gap: 8px;
  }
  .pm-notes-label {
    font-size: 10px; color: #9ca3af;
    text-transform: uppercase; letter-spacing: 0.06em;
    font-weight: 600;
    padding: 0 4px;
  }
  .pm-notes-empty {
    padding: 16px;
    border: 1px dashed #2a3347;
    border-radius: 10px;
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
    line-height: 1.5;
  }
  [data-theme="light"] .pm-notes-empty {
    border-color: #e5e7eb;
    color: #9ca3af;
  }
  /* === Mode édition === */
  .pm-save-btn, .pm-cancel-btn {
    background: transparent; border: none; color: inherit;
    cursor: pointer; padding: 6px 8px;
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .pm-save-btn { color: var(--accent, #39FF14); }
  .pm-save-btn:hover {
    background: rgba(var(--accent-rgb, 57, 255, 20), 0.13);
  }
  .pm-save-btn:disabled, .pm-cancel-btn:disabled {
    opacity: 0.5; cursor: not-allowed;
  }
  .pm-cancel-btn:hover { background: rgba(255, 255, 255, 0.07); }
  [data-theme="light"] .pm-cancel-btn:hover { background: rgba(0, 0, 0, 0.06); }
  .pm-avatar-clickable { cursor: pointer; position: relative; }
  .pm-avatar-overlay {
    position: absolute; inset: 0;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    opacity: 0; transition: opacity 0.15s;
  }
  .pm-avatar-clickable:hover .pm-avatar-overlay,
  .pm-avatar-clickable.is-uploading .pm-avatar-overlay { opacity: 1; }
  .pm-avatar-spinner {
    width: 22px; height: 22px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: pm-spin 0.8s linear infinite;
  }
  @keyframes pm-spin { to { transform: rotate(360deg); } }
  .pm-name-input {
    background: #1e2535;
    border: 1px solid var(--accent, #39FF14);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 18px; font-weight: 600;
    color: inherit;
    font-family: inherit;
    width: 100%;
    outline: none;
    box-sizing: border-box;
  }
  [data-theme="light"] .pm-name-input { background: #ffffff; }
  .pm-notes-textarea {
    width: 100%;
    min-height: 100px;
    padding: 12px 14px;
    border: 1px solid var(--accent, #39FF14);
    border-radius: 10px;
    font-size: 13px;
    color: inherit;
    background: #1e2535;
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
    outline: none;
    box-sizing: border-box;
  }
  [data-theme="light"] .pm-notes-textarea { background: #ffffff; }
  .pm-notes-display {
    padding: 14px 16px;
    border: 1px solid #2a3347;
    border-radius: 10px;
    font-size: 13px;
    color: inherit;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.02);
  }
  [data-theme="light"] .pm-notes-display {
    border-color: #e5e7eb;
    background: #fafafa;
  }
  .pm-notes-counter {
    align-self: flex-end;
    font-size: 10px;
    color: #6b7280;
    font-variant-numeric: tabular-nums;
  }
`

export default function ProfileModal({ onClose }) {
  const { user } = useAuth()

  // Mode édition — le crayon est remplacé par ✓/✕ et les champs name/
  // about deviennent éditables. La photo s'upload immédiatement au clic
  // sur l'avatar (indépendant du save/cancel — pattern repris de
  // FullSettingsModal pour ne pas avoir à gérer un fichier orphelin
  // dans Storage en cas d'annulation).
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [aboutDraft, setAboutDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Compteur de PDFs édités par l'user courant (count(*) sur public.documents
  // via la RPC SECURITY DEFINER get_user_pdf_count). Affiché dans la stat
  // « PDF édités avec JacPDF ». null = en cours de chargement, number = prêt.
  const [pdfCount, setPdfCount] = useState(null)
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    getUserPdfCount(user.id).then((n) => {
      if (!cancelled) setPdfCount(n)
    })
    return () => { cancelled = true }
  }, [user?.id])

  // Fermeture via Escape — en mode édition, Esc annule l'édition au lieu
  // de fermer la modale (sinon on perd les drafts en cours par accident).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (editing) {
        setEditing(false)
      } else {
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  // Mêmes fallbacks que Settings.jsx / FullSettingsModal pour garder le nom
  // cohérent partout. Priorité : full_name (édité dans FullSettings) > name
  // (provider OAuth) > user_name (Twitter/GitHub) > préfixe email.
  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.user_metadata?.user_name
    || user?.email?.split('@')[0]
    || 'Non connecté'
  const avatarUrl = user?.user_metadata?.avatar_url
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()
  // Halo doré = cosmétique réservé au palier Premium uniquement (pas Pro).
  const isPremiumTier = getUserTier(user) === 'premium'
  // "about" = texte libre persisté dans user_metadata.about (même pattern
  // que full_name / avatar_url, pas de table dédiée). updateUser fait un
  // merge shallow, donc écrire { about } préserve les autres champs.
  const aboutValue = user?.user_metadata?.about || ''

  const enterEditMode = () => {
    // Pré-remplit les drafts avec les valeurs actuelles. displayName peut
    // valoir "Non connecté" si l'user n'est pas chargé — dans ce cas on
    // démarre avec un input vide plutôt que cette chaîne placeholder.
    setNameDraft(displayName === 'Non connecté' ? '' : displayName)
    setAboutDraft(aboutValue)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  const saveEdit = async () => {
    const trimmedName = nameDraft.trim()
    if (!trimmedName) {
      toastStore?.error?.('Le nom ne peut pas être vide')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: trimmedName,
          about: aboutDraft,
        },
      })
      if (error) throw error
      toastStore?.success?.('Profil mis à jour')
      setEditing(false)
    } catch (err) {
      toastStore?.error?.(`Erreur : ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  // Upload immédiat de la photo — même pattern que FullSettingsModal :
  // 1. Validation type + taille (max 5 Mo).
  // 2. Cleanup des anciens fichiers du dossier ${user.id}/.
  // 3. Upload du nouveau, getPublicUrl, updateUser metadata.avatar_url.
  // useAuth re-render automatiquement (onAuthStateChange) → l'avatar
  // affiché ici se rafraîchit sans qu'on ait à gérer un state local.
  // Prérequis Dashboard : bucket "avatars" public + RLS policies sur
  // storage.objects pour permettre upload/list/delete dans son propre
  // dossier (auth.uid()::text = (storage.foldername(name))[1]).
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      toastStore?.error?.('Le fichier doit être une image')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toastStore?.error?.('Image trop grosse (max 5 Mo)')
      e.target.value = ''
      return
    }
    setUploadingAvatar(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      // Cleanup des anciens fichiers du dossier user.id pour ne pas
      // accumuler une copie par upload (le timestamp dans le nom rend
      // chaque path unique, donc upsert ne suffit pas à écraser l'ancien).
      const { data: oldFiles } = await supabase.storage
        .from('avatars')
        .list(user.id, { limit: 100 })
      if (oldFiles && oldFiles.length > 0) {
        await supabase.storage
          .from('avatars')
          .remove(oldFiles.map((f) => `${user.id}/${f.name}`))
      }
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = data.publicUrl
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      })
      if (metaErr) throw metaErr
      toastStore?.success?.('Photo de profil mise à jour')
    } catch (err) {
      toastStore?.error?.(`Erreur : ${err?.message || err}`)
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  return (
    <>
      <style>{STYLES}</style>
      {/* Overlay : en mode édition on bloque la fermeture par clic
          extérieur pour ne pas perdre les drafts par accident. L'user
          doit explicitement Save (✓), Cancel (✕) ou Échap. */}
      <div
        className="pm-overlay"
        onClick={editing ? undefined : onClose}
        role="presentation"
      >
        <div
          className="pm-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Mon profil"
        >
          <header className="pm-header">
            <h2 className="pm-title">Mon profil</h2>
            <div className="pm-header-actions">
              {editing ? (
                <>
                  {/* Mode édition : ✓ Save + ✕ Cancel. La fermeture (X) et
                      le clic extérieur sont désactivés pour ne pas perdre
                      les drafts. Esc = Cancel ; Entrée dans l'input nom = Save. */}
                  <button
                    className="pm-save-btn"
                    onClick={saveEdit}
                    disabled={saving}
                    aria-label="Enregistrer"
                    title="Enregistrer (Entrée)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </button>
                  <button
                    className="pm-cancel-btn"
                    onClick={cancelEdit}
                    disabled={saving}
                    aria-label="Annuler"
                    title="Annuler (Échap)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="pm-edit-btn"
                    onClick={enterEditMode}
                    aria-label="Éditer le profil"
                    title="Éditer mon profil"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                  </button>
                  <button className="pm-close" onClick={onClose} aria-label="Fermer">✕</button>
                </>
              )}
            </div>
          </header>
          <div className="pm-body">
            {/* Hero — avatar + nom + email. Style à confirmer ; placeholder
                en attendant les directives utilisateur. */}
            <div className="pm-hero">
              {/* Avatar enveloppé : le wrapper porte le halo doré exclusif
                  Premium (cosmétique) + le médaillon 💎 en coin. */}
              <div className={`pm-avatar-wrap ${isPremiumTier ? 'pm-avatar-wrap--premium' : ''}`}>
              {editing ? (
                /* En édition : avatar wrappé dans un <label> qui contient un
                   input file invisible. Click n'importe où sur l'avatar →
                   ouvre le picker de fichier. Overlay 'is-uploading' montre
                   un spinner pendant l'upload. */
                <label
                  className={`pm-avatar pm-avatar-clickable ${isPremiumTier ? 'pm-avatar--premium' : ''} ${uploadingAvatar ? 'is-uploading' : ''}`}
                  title="Cliquer pour changer la photo"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="pm-avatar-img" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="pm-avatar-initials">{avatarInitial}</span>
                  )}
                  <div className="pm-avatar-overlay">
                    {uploadingAvatar ? (
                      <span className="pm-avatar-spinner" />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                    style={ { display: 'none' } }
                  />
                </label>
              ) : (
                <div className={`pm-avatar ${isPremiumTier ? 'pm-avatar--premium' : ''}`}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="pm-avatar-img" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="pm-avatar-initials">{avatarInitial}</span>
                  )}
                </div>
              )}
                {isPremiumTier && (
                  <span className="pm-avatar-crest" title="Membre Premium">💎</span>
                )}
              </div>
              <div className="pm-hero-info">
                {editing ? (
                  <input
                    type="text"
                    className="pm-name-input"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                    }}
                    placeholder="Ton nom"
                    maxLength={60}
                    disabled={saving}
                    autoFocus
                  />
                ) : (
                  <span className="pm-name">{displayName}</span>
                )}
                {user?.email && <span className="pm-email">{user.email}</span>}
                {/* Badges — affiche le rôle collecté pendant l'onboarding
                    (RoleOnboardingModal → user_metadata.role). Si l'user
                    n'a pas encore complété l'onboarding, on retombe sur
                    le placeholder « Badges à venir ». D'autres badges
                    s'ajouteront ici (Premium, Beta tester, Contributeur). */}
                <div className="pm-badges">
                  {/* Badge Dev — affiché EN PREMIER (avant Owner) si l'user
                      est dans DEV_EMAILS ou a is_dev=true dans son
                      user_metadata. C'est l'identité la plus spécifique. */}
                  {isDev(user) && (
                    <span className="pm-badge pm-badge-dev" title="Développeur de JacPDF">
                      <span className="pm-badge-role-icon">🔧</span>
                      Dev
                    </span>
                  )}
                  {/* Badge Owner — affiché si l'user est dans la liste
                      OWNER_EMAILS hardcodée ou a is_owner=true dans son
                      user_metadata (cf. lib/user/userRoles.js). */}
                  {isOwner(user) && (
                    <span className="pm-badge pm-badge-owner" title="Propriétaire de l'application">
                      <span className="pm-badge-role-icon">👑</span>
                      Owner
                    </span>
                  )}
                  {/* Badge Premium — affiché dès qu'isPremium(user) est vrai :
                      owner/dev d'office, OU user_metadata.is_premium (togglé
                      depuis l'admin / le bouton mock), OU le fallback
                      localStorage. Respecte l'override de test « forcer
                      non-premium » → disparaît quand on simule un compte
                      gratuit. */}
                  {(() => {
                    const tier = getUserTier(user)
                    if (tier === 'pro') {
                      return (
                        <span className="pm-badge pm-badge-pro" title="Membre Pro">
                          <span className="pm-badge-role-icon">⚡</span>
                          Pro
                        </span>
                      )
                    }
                    if (tier === 'premium') {
                      return (
                        <span className="pm-badge pm-badge-premium" title="Membre Premium">
                          <span className="pm-badge-role-icon">💎</span>
                          Premium
                        </span>
                      )
                    }
                    return null
                  })()}
                  {(() => {
                    const roleBadge = getRoleBadge(user)
                    if (!roleBadge) {
                      // Si pas de rôle ET pas owner/dev, on affiche le
                      // placeholder. Si dev OU owner mais pas de rôle, on
                      // n'affiche QUE le(s) badge(s) spéciaux (pas le
                      // placeholder, pour ne pas surcharger).
                      if (isOwner(user) || isDev(user) || isPremium(user)) return null
                      return (
                        <span className="pm-badge pm-badge-pending" title="Complète l'onboarding pour afficher ton rôle">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="8" r="7"/>
                            <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                          </svg>
                          Badges à venir
                        </span>
                      )
                    }
                    return (
                      <span
                        className={`pm-badge pm-badge-role-${roleBadge.variant}`}
                        title={`Rôle : ${roleBadge.label}`}
                      >
                        <span className="pm-badge-role-icon">{roleBadge.icon}</span>
                        {roleBadge.label}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>
            {/* Stats — cartes groupées. PDF édités = count(*) sur
                public.documents via la RPC get_user_pdf_count (cf.
                Phase 1 SQL Setup section 7). Membre depuis = user.created_at
                Supabase Auth, dispo nativement. */}
            <div className="pm-stats">
              <div className="pm-stat-row">
                <div className="pm-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <div className="pm-stat-info">
                  <span className="pm-stat-label">PDF édités avec JacPDF</span>
                  <span className="pm-stat-value">
                    {pdfCount === null ? (
                      <>
                        —
                        <span className="pm-stat-pending">(chargement…)</span>
                      </>
                    ) : (
                      pdfCount
                    )}
                  </span>
                </div>
              </div>
              <div className="pm-stat-row">
                <div className="pm-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div className="pm-stat-info">
                  <span className="pm-stat-label">Membre depuis</span>
                  <span className="pm-stat-value">{formatMemberSince(user?.created_at)}</span>
                </div>
              </div>
            </div>
            {/* Notes sur moi — zone texte libre que l'utilisateur peut
                remplir pour décrire ses intérêts / role / contexte. Pour
                l'instant placeholder en attendant le câblage : perséverera
                dans user_metadata.about (Supabase Auth, même pattern que
                full_name) ou une table dédiée si le contenu devient
                volumineux. Édition via le bouton crayon en haut. */}
            <div className="pm-notes">
              <span className="pm-notes-label">Notes sur moi</span>
              {editing ? (
                <>
                  <textarea
                    className="pm-notes-textarea"
                    value={aboutDraft}
                    onChange={(e) => setAboutDraft(e.target.value)}
                    placeholder="Décris-toi en quelques mots — intérêts, rôle, contexte…"
                    maxLength={500}
                    disabled={saving}
                  />
                  <span className="pm-notes-counter">
                    {aboutDraft.length} / 500
                  </span>
                </>
              ) : aboutValue ? (
                <div className="pm-notes-display">{aboutValue}</div>
              ) : (
                <div className="pm-notes-empty">
                  Aucune note pour l'instant — clique sur le crayon en haut pour en ajouter.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}