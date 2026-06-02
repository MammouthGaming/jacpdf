// src/stores/user/studentProfileStore.js
// Store du profil étudiant — Section École
// Persistance : localStorage (clé jacpdf_studentProfile) + mirror Supabase
// (table student_profiles + bucket privé student-photos).

import { supabase } from '@/shared/lib/infra/supabase'

const STORAGE_KEY = 'jacpdf_studentProfile'
const BUCKET = 'student-photos'

const DEFAULT_PROFILE = {
  // Phase 1 — Profil étudiant
  niveauScolaire: null, // 'secondaire' | 'cegep' | 'bac' | 'maitrise' | 'doctorat' | 'autre'
  programme: '',
  annee: null,
  numeroEtudiant: '',
  courrielInstitutionnel: '',
  photoPath: null,
  photoUrl: null,

  // Phase 2 — Établissement
  typeEtablissement: null, // 'secondaire' | 'cegep' | 'universite' | 'autre'
  nomEcole: '',
  campus: '',
  ville: '',

  hydrated: false,
  syncing: false,
  error: null,
}

let state = loadFromStorage()
const listeners = new Set()

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PROFILE }
    return {
      ...DEFAULT_PROFILE,
      ...JSON.parse(raw),
      syncing: false,
      error: null,
    }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

function saveToStorage(next) {
  try {
    const persisted = { ...next, syncing: false, error: null }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch (e) {
    console.warn('[studentProfileStore] localStorage write failed', e)
  }
}

function emit() {
  for (const fn of listeners) fn(state)
}

function setState(patch, { persist = true } = {}) {
  state = { ...state, ...patch }
  if (persist) saveToStorage(state)
  emit()
  return state
}

function toRow(profile, userId) {
  return {
    user_id: userId,
    niveau_scolaire: profile.niveauScolaire || null,
    programme: profile.programme?.trim() || null,
    annee: profile.annee || null,
    numero_etudiant: profile.numeroEtudiant?.trim() || null,
    courriel_institutionnel: profile.courrielInstitutionnel?.trim() || null,
    photo_path: profile.photoPath || null,

    type_etablissement: profile.typeEtablissement || null,
    nom_ecole: profile.nomEcole?.trim() || null,
    campus: profile.campus?.trim() || null,
    ville: profile.ville?.trim() || null,
  }
}

function fromRow(row) {
  return {
    niveauScolaire: row?.niveau_scolaire || null,
    programme: row?.programme || '',
    annee: row?.annee || null,
    numeroEtudiant: row?.numero_etudiant || '',
    courrielInstitutionnel: row?.courriel_institutionnel || '',
    photoPath: row?.photo_path || null,

    typeEtablissement: row?.type_etablissement || null,
    nomEcole: row?.nom_ecole || '',
    campus: row?.campus || '',
    ville: row?.ville || '',
  }
}

export function getStudentProfile() {
  return state
}

export function subscribeStudentProfile(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function updateStudentProfile(patch, { sync = true } = {}) {
  setState({ ...patch, error: null })

  if (!sync) return state

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return state

  setState({ syncing: true }, { persist: false })

  const { error } = await supabase
    .from('student_profiles')
    .upsert(toRow(state, user.id), { onConflict: 'user_id' })

  if (error) {
    console.warn('[studentProfileStore] upsert failed', error)
    setState({ syncing: false, error: error.message }, { persist: false })
    return state
  }

  setState({ syncing: false, error: null }, { persist: false })
  return state
}

export async function hydrateStudentProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return state

  setState({ syncing: true, error: null }, { persist: false })

  const { data, error } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.warn('[studentProfileStore] hydrate failed', error)
    setState({ syncing: false, hydrated: true, error: error.message }, { persist: false })
    return state
  }

  if (data) {
    setState({ ...fromRow(data), hydrated: true, syncing: false, error: null })
  } else {
    setState({ hydrated: true, syncing: false, error: null })
  }

  if (state.photoPath) {
    await refreshStudentPhotoUrl()
  }

  return state
}

export async function refreshStudentPhotoUrl() {
  if (!state.photoPath) return null

  const { data, error } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrl(state.photoPath, 60 * 60)

  if (error) {
    console.warn('[studentProfileStore] signed url failed', error)
    setState({ photoUrl: null, error: error.message }, { persist: false })
    return null
  }

  setState({ photoUrl: data.signedUrl, error: null })
  return data.signedUrl
}

export async function uploadStudentPhoto(file) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  if (!file?.type?.startsWith('image/')) throw new Error('Le fichier doit être une image')

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${user.id}/photo-${Date.now()}.${ext}`
  const previousPath = state.photoPath

  setState({ syncing: true, error: null }, { persist: false })

  const { error: uploadError } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    setState({ syncing: false, error: uploadError.message }, { persist: false })
    throw uploadError
  }

  if (previousPath && previousPath !== path) {
    await supabase.storage.from(BUCKET).remove([previousPath]).catch(() => {})
  }

  await updateStudentProfile({ photoPath: path, photoUrl: null })
  const signedUrl = await refreshStudentPhotoUrl()
  setState({ syncing: false }, { persist: false })
  return signedUrl
}

export async function removeStudentPhoto() {
  const previousPath = state.photoPath
  if (!previousPath) return state

  setState({ syncing: true, error: null }, { persist: false })
  await supabase.storage.from(BUCKET).remove([previousPath]).catch(() => {})
  await updateStudentProfile({ photoPath: null, photoUrl: null })
  setState({ syncing: false }, { persist: false })
  return state
}

export async function resetStudentProfile() {
  const previousPath = state.photoPath

  setState({ ...DEFAULT_PROFILE, hydrated: true })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return state

  if (previousPath) {
    await supabase.storage.from(BUCKET).remove([previousPath]).catch(() => {})
  }

  const { error } = await supabase
    .from('student_profiles')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    console.warn('[studentProfileStore] reset failed', error)
    setState({ error: error.message }, { persist: false })
  }

  return state
}