// src/stores/user/classroomStore.js
// JacPDF Classroom — local-first + mirror Supabase.
// - localStorage garde un cache instantané/offline.
// - Supabase devient la source partagée dès qu'une session auth existe.
// - Realtime recharge les classes quand une table Classroom change.

import { supabase } from '@/shared/lib/infra/supabase'

const STORAGE_KEY = 'jacpdf_classrooms'

const DEFAULT_STATE = {
  classrooms: [],
  activeClassroomId: null,
  hydrated: false,
  syncing: false,
  error: null,
}

let state = loadFromStorage()
const listeners = new Set()
// Devoirs créés localement mais pas encore confirmés par Supabase.
// Ça évite le bug « le devoir apparaît puis disparaît » si un hydrate
// Realtime arrive avant que classroom_files ait renvoyé la nouvelle ligne.
const pendingFilesByClassroom = new Map()

function uid(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function generateClassCode(name = '') {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'CLAS'

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${base}-${suffix}`
}

function normalizeStudent(student = {}) {
  return {
    userId: student.userId || student.user_id || student.id || null,
    name: student.name || student.display_name || 'Élève',
    email: student.email || '',
    role: student.role || 'eleve',
    joinedAt: student.joinedAt || student.joined_at || new Date().toISOString(),
    status: student.status || 'offline',
  }
}

function normalizeFile(file = {}) {
  return {
    id: file.id || uid('classroom-file'),
    name: (file.name || '').trim(),
    mode: file.mode || 'normal',
    readOnly: !!(file.readOnly ?? file.read_only),
    allowAnnotations: (file.allowAnnotations ?? file.allow_annotations) !== false,
    instructions: file.instructions || undefined,
    points: file.points ?? undefined,
    dueDate: file.dueDate || file.due_date || undefined,
    topic: file.topic || undefined,
    assignedTo: file.assignedTo || file.assigned_to || undefined,
    attachments: Array.isArray(file.attachments) ? file.attachments : [],
    distributedAt: file.distributedAt || file.distributed_at || new Date().toISOString(),
  }
}

function normalizeClassroom(classroom = {}) {
  return {
    id: classroom.id || uid('classroom'),
    name: (classroom.name || '').trim(),
    subject: (classroom.subject || '').trim(),
    group: (classroom.group ?? classroom.class_group ?? '').trim(),
    code: classroom.code || generateClassCode(classroom.name),
    teacherId: classroom.teacherId || classroom.teacher_id || null,
    teacherName: classroom.teacherName || classroom.teacher_name || '',
    students: Array.isArray(classroom.students)
      ? classroom.students.map(normalizeStudent)
      : [],
    files: Array.isArray(classroom.files)
      ? classroom.files.map(normalizeFile)
      : [],
    submissions: Array.isArray(classroom.submissions) ? classroom.submissions : [],
    examMode: !!(classroom.examMode ?? classroom.exam_mode),
    createdAt: classroom.createdAt || classroom.created_at || new Date().toISOString(),
    updatedAt: classroom.updatedAt || classroom.updated_at || new Date().toISOString(),
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE }

    const parsed = JSON.parse(raw)
    const classrooms = Array.isArray(parsed.classrooms)
      ? parsed.classrooms.map(normalizeClassroom)
      : []

    const activeClassroomId = classrooms.some((item) => item.id === parsed.activeClassroomId)
      ? parsed.activeClassroomId
      : classrooms[0]?.id || null

    return {
      ...DEFAULT_STATE,
      ...parsed,
      classrooms,
      activeClassroomId,
      syncing: false,
      error: null,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function saveToStorage(next) {
  try {
    const persisted = { ...next, syncing: false, error: null }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch (err) {
    console.warn('[classroomStore] localStorage write failed', err)
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

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user || null
}

function classroomToRow(classroom, user) {
  const normalized = normalizeClassroom(classroom)
  return {
    id: normalized.id,
    name: normalized.name,
    subject: normalized.subject || null,
    class_group: normalized.group || null,
    code: normalized.code,
    teacher_id: normalized.teacherId || user?.id || null,
    teacher_name:
      normalized.teacherName ||
      user?.user_metadata?.full_name ||
      user?.email ||
      'Enseignant',
    exam_mode: normalized.examMode,
  }
}

function studentToMemberRow(classroomId, student) {
  const normalized = normalizeStudent(student)
  if (!normalized.userId) return null
  return {
    classroom_id: classroomId,
    user_id: normalized.userId,
    role: normalized.role || 'eleve',
    name: normalized.name,
    email: normalized.email || null,
    status: normalized.status || 'offline',
    joined_at: normalized.joinedAt,
  }
}

function fileToRow(classroomId, file) {
  const normalized = normalizeFile(file)
  return {
    id: normalized.id,
    classroom_id: classroomId,
    name: normalized.name,
    mode: normalized.mode,
    read_only: normalized.readOnly,
    allow_annotations: normalized.allowAnnotations,
    instructions: normalized.instructions || null,
    points: normalized.points ?? null,
    due_date: normalized.dueDate || null,
    topic: normalized.topic || null,
    assigned_to: normalized.assignedTo || null,
    attachments: normalized.attachments || [],
    distributed_at: normalized.distributedAt,
  }
}

function rowsToClassrooms(classroomRows = [], memberRows = [], fileRows = []) {
  return classroomRows.map((row) => {
    const members = memberRows.filter((m) => m.classroom_id === row.id)
    const files = fileRows.filter((f) => f.classroom_id === row.id)

    return normalizeClassroom({
      id: row.id,
      name: row.name,
      subject: row.subject,
      class_group: row.class_group,
      code: row.code,
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      exam_mode: row.exam_mode,
      created_at: row.created_at,
      updated_at: row.updated_at,
      students: members
        .filter((m) => m.role !== 'enseignant')
        .map(normalizeStudent),
      files: files.map(normalizeFile),
    })
  })
}

function rememberPendingFile(classroomId, file) {
  const list = pendingFilesByClassroom.get(classroomId) || []
  pendingFilesByClassroom.set(classroomId, [
    ...list.filter((item) => item.id !== file.id),
    normalizeFile(file),
  ])
}

function mergePendingFiles(classrooms) {
  if (pendingFilesByClassroom.size === 0) return classrooms

  return classrooms.map((classroom) => {
    const pending = pendingFilesByClassroom.get(classroom.id) || []
    if (pending.length === 0) return classroom

    const remoteIds = new Set((classroom.files || []).map((file) => file.id))
    const stillPending = pending.filter((file) => !remoteIds.has(file.id))

    if (stillPending.length === 0) {
      pendingFilesByClassroom.delete(classroom.id)
      return classroom
    }

    pendingFilesByClassroom.set(classroom.id, stillPending)

    return normalizeClassroom({
      ...classroom,
      files: [
        ...stillPending,
        ...(classroom.files || []).filter((file) => !stillPending.some((pendingFile) => pendingFile.id === file.id)),
      ],
    })
  })
}

async function upsertClassroomFileToSupabase(classroomId, file) {
  const row = fileToRow(classroomId, file)

  // RPC SECURITY DEFINER : évite que les policies RLS de dev empêchent
  // l'insertion du devoir. C'est le même principe que delete_classroom_file_everywhere.
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('upsert_classroom_file', {
      p_id: row.id,
      p_classroom_id: row.classroom_id,
      p_name: row.name,
      p_mode: row.mode,
      p_read_only: row.read_only,
      p_allow_annotations: row.allow_annotations,
      p_instructions: row.instructions,
      p_points: row.points,
      p_due_date: row.due_date,
      p_topic: row.topic,
      p_assigned_to: row.assigned_to,
      p_attachments: row.attachments,
      p_distributed_at: row.distributed_at,
    })

  if (rpcData && !rpcError) return rpcData

  // Fallback si la fonction SQL n'a pas encore été exécutée.
  const { error } = await supabase
    .from('classroom_files')
    .upsert(row, { onConflict: 'id' })

  if (error?.message?.includes('attachments')) {
    const { attachments, ...fallbackRow } = row
    const { error: fallbackError } = await supabase
      .from('classroom_files')
      .upsert(fallbackRow, { onConflict: 'id' })
    if (fallbackError) throw fallbackError
    return fallbackRow
  }

  if (error) throw (rpcError || error)
  return row
}

async function syncClassroomToSupabase(classroom) {
  const user = await getCurrentUser()
  if (!user) return null

  const normalized = normalizeClassroom(classroom)

  // Préférence : RPC SECURITY DEFINER. Plus robuste que l'upsert direct
  // quand les policies RLS changent pendant le dev : la classe est écrite
  // côté serveur avec teacher_id = auth.uid().
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('upsert_classroom', {
      p_id: normalized.id,
      p_name: normalized.name,
      p_subject: normalized.subject || null,
      p_class_group: normalized.group || null,
      p_code: normalized.code,
      p_exam_mode: normalized.examMode,
    })

  if (rpcData && !rpcError) {
    const memberRows = normalized.students
      .map((student) => studentToMemberRow(rpcData.id, student))
      .filter(Boolean)
    if (memberRows.length) {
      await supabase
        .from('classroom_members')
        .upsert(memberRows, { onConflict: 'classroom_id,user_id' })
    }

    for (const file of normalized.files) {
      await upsertClassroomFileToSupabase(rpcData.id, file)
    }

    return rpcData
  }

  const { data, error } = await supabase
    .from('classrooms')
    .upsert(classroomToRow(normalized, user), { onConflict: 'id' })
    .select('*')
    .single()

  if (error) throw error

  // Le propriétaire est aussi membre enseignant : pratique pour les policies
  // et pour l'affichage futur « Personnes ».
  await supabase
    .from('classroom_members')
    .upsert({
      classroom_id: data.id,
      user_id: data.teacher_id || user.id,
      role: 'enseignant',
      name: data.teacher_name || user?.user_metadata?.full_name || user.email || 'Enseignant',
      email: user.email || null,
      status: 'offline',
    }, { onConflict: 'classroom_id,user_id' })

  const memberRows = normalized.students
    .map((student) => studentToMemberRow(data.id, student))
    .filter(Boolean)
  if (memberRows.length) {
    await supabase
      .from('classroom_members')
      .upsert(memberRows, { onConflict: 'classroom_id,user_id' })
  }

  for (const file of normalized.files) {
    await upsertClassroomFileToSupabase(data.id, file)
  }

  return data
}

async function syncClassroomPatch(classroomId) {
  const classroom = state.classrooms.find((item) => item.id === classroomId)
  if (!classroom) return
  try {
    setState({ syncing: true, error: null }, { persist: false })
    await syncClassroomToSupabase(classroom)
    setState({ syncing: false, error: null }, { persist: false })
    await hydrateClassrooms()
  } catch (err) {
    console.warn('[classroomStore] sync failed', err)
    setState({ syncing: false, error: err.message || 'Erreur sync Classroom' }, { persist: false })
  }
}

export function getClassroomState() {
  return state
}

export function subscribeClassrooms(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function hydrateClassrooms() {
  const user = await getCurrentUser()
  if (!user) {
    setState({ hydrated: true, syncing: false }, { persist: false })
    return state
  }

  setState({ syncing: true, error: null }, { persist: false })

  try {
    // Migration douce : les classes créées avant Supabase sont poussées une
    // fois dans le cloud si elles appartiennent à l'utilisateur courant.
    const localClassrooms = state.classrooms.filter((c) =>
      !c.teacherId || c.teacherId === user.id
    )
    for (const classroom of localClassrooms) {
      await syncClassroomToSupabase({
        ...classroom,
        teacherId: classroom.teacherId || user.id,
        teacherName:
          classroom.teacherName ||
          user.user_metadata?.full_name ||
          user.email ||
          'Enseignant',
      }).catch((err) => {
        // Si les tables SQL ne sont pas encore installées, on garde le cache
        // local et on affichera l'erreur plus bas.
        if (import.meta.env.DEV) console.warn('[classroomStore] migration skipped', err)
      })
    }

    // Préférence : RPC SECURITY DEFINER. Le compte enseignant doit voir les
    // membres même si une policy RLS de dev masque encore classroom_members.
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_my_classrooms')

    if (rpcData && !rpcError) {
      const classrooms = mergePendingFiles(rowsToClassrooms(
        rpcData.classrooms || [],
        rpcData.members || [],
        rpcData.files || [],
      )).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      const activeClassroomId = classrooms.some((c) => c.id === state.activeClassroomId)
        ? state.activeClassroomId
        : classrooms[0]?.id || null

      setState({
        classrooms,
        activeClassroomId,
        hydrated: true,
        syncing: false,
        error: null,
      })

      return state
    }

    const { data: owned, error: ownedError } = await supabase
      .from('classrooms')
      .select('*')
      .eq('teacher_id', user.id)

    if (ownedError) throw ownedError

    const { data: memberRowsForMe, error: memberError } = await supabase
      .from('classroom_members')
      .select('classroom_id')
      .eq('user_id', user.id)

    if (memberError) throw memberError

    const classroomIds = new Set((owned || []).map((c) => c.id))
    for (const item of memberRowsForMe || []) classroomIds.add(item.classroom_id)

    let allClassrooms = owned || []
    const idsToFetch = [...classroomIds].filter((id) => !allClassrooms.some((c) => c.id === id))
    if (idsToFetch.length) {
      const { data: joined, error: joinedError } = await supabase
        .from('classrooms')
        .select('*')
        .in('id', idsToFetch)

      if (joinedError) throw joinedError
      allClassrooms = [...allClassrooms, ...(joined || [])]
    }

    const ids = [...new Set(allClassrooms.map((c) => c.id))]
    let allMembers = []
    let allFiles = []

    if (ids.length) {
      const { data: members, error: membersError } = await supabase
        .from('classroom_members')
        .select('*')
        .in('classroom_id', ids)

      if (membersError) throw membersError
      allMembers = members || []

      const { data: files, error: filesError } = await supabase
        .from('classroom_files')
        .select('*')
        .in('classroom_id', ids)
        .order('distributed_at', { ascending: false })

      if (filesError) throw filesError
      allFiles = files || []
    }

    const classrooms = mergePendingFiles(rowsToClassrooms(allClassrooms, allMembers, allFiles))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    const activeClassroomId = classrooms.some((c) => c.id === state.activeClassroomId)
      ? state.activeClassroomId
      : classrooms[0]?.id || null

    setState({
      classrooms,
      activeClassroomId,
      hydrated: true,
      syncing: false,
      error: null,
    })

    return state
  } catch (err) {
    console.warn('[classroomStore] hydrate failed', err)
    setState({
      hydrated: true,
      syncing: false,
      error: err.message || 'Erreur Supabase Classroom',
    }, { persist: false })
    return state
  }
}

export async function subscribeClassroomsRealtime() {
  const user = await getCurrentUser()
  if (!user) return () => {}

  let refreshTimer = null
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      hydrateClassrooms()
    }, 250)
  }

  const channel = supabase
    .channel(`classroom-store:${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classrooms' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_members' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_files' }, scheduleRefresh)
    // Même si les annonces sont affichées par le composant Flux, on écoute
    // aussi ici pour garder le store global frais quand une action Classroom
    // arrive depuis un autre compte.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_announcements' }, scheduleRefresh)
    .subscribe()

  return () => {
    clearTimeout(refreshTimer)
    supabase.removeChannel(channel)
  }
}

export function createClassroom(classroom) {
  const normalized = normalizeClassroom(classroom)
  const classrooms = [...state.classrooms, normalized]
  const next = setState({
    classrooms,
    activeClassroomId: state.activeClassroomId || normalized.id,
    error: null,
  })

  syncClassroomPatch(normalized.id)
  return next
}

export function updateClassroom(classroomId, patch) {
  const classrooms = state.classrooms.map((classroom) => (
    classroom.id === classroomId
      ? normalizeClassroom({ ...classroom, ...patch, id: classroom.id, createdAt: classroom.createdAt })
      : classroom
  ))

  const next = setState({ classrooms, error: null })
  syncClassroomPatch(classroomId)
  return next
}

export async function deleteClassroom(classroomId) {
  const classrooms = state.classrooms.filter((classroom) => classroom.id !== classroomId)
  const activeClassroomId = state.activeClassroomId === classroomId
    ? classrooms[0]?.id || null
    : state.activeClassroomId

  const next = setState({ classrooms, activeClassroomId, error: null })

  try {
    const user = await getCurrentUser()
    if (user) {
      // Suppression globale : RPC serveur qui supprime la classe dans
      // Supabase. Les FK `on delete cascade` retirent aussi membres,
      // fichiers, remises, etc. Les autres comptes perdent la classe au
      // prochain hydrate/Realtime au lieu de garder une copie locale stale.
      const { error: rpcError } = await supabase
        .rpc('delete_classroom_everywhere', { p_classroom_id: classroomId })

      if (rpcError) {
        const { error } = await supabase
          .from('classrooms')
          .delete()
          .eq('id', classroomId)

        if (error) throw error
      }

      await hydrateClassrooms()
    }
  } catch (err) {
    console.warn('[classroomStore] delete failed', err)
    setState({ error: err.message || 'Erreur suppression Classroom' }, { persist: false })
  }

  return next
}

export function setActiveClassroom(classroomId) {
  const exists = state.classrooms.some((classroom) => classroom.id === classroomId)
  return setState({ activeClassroomId: exists ? classroomId : null })
}

export function getActiveClassroom() {
  return state.classrooms.find((classroom) => classroom.id === state.activeClassroomId) || null
}

export async function joinClassroomByCode(code, student) {
  const cleanCode = (code || '').trim().toUpperCase()
  if (!cleanCode) return { ok: false, reason: 'missing_code' }

  const user = await getCurrentUser()
  const studentPayload = {
    userId: student.userId || user?.id || `anon-${Date.now()}`,
    name:
      student.name ||
      user?.user_metadata?.full_name ||
      user?.email ||
      'Élève',
    email: student.email || user?.email || '',
    role: 'eleve',
  }

  let classroom = state.classrooms.find((item) => item.code.toUpperCase() === cleanCode)

  if (!classroom && user) {
    // Préférence : RPC SECURITY DEFINER. Ça évite les faux « not_found »
    // causés par RLS quand l'élève n'est pas encore membre de la classe.
    const { data: rpcClassroom, error: rpcError } = await supabase
      .rpc('join_classroom_by_code', { p_code: cleanCode })

    if (rpcClassroom && !rpcError) {
      classroom = normalizeClassroom(rpcClassroom)
    } else {
      // Fallback si la fonction SQL n'a pas encore été installée : tentative
      // directe sur la table (fonctionne avec la policy MVP `or true`).
      const { data, error } = await supabase
        .from('classrooms')
        .select('*')
        .ilike('code', cleanCode)
        .maybeSingle()

      if (error) {
        console.warn('[classroomStore] join lookup failed', rpcError || error)
        return {
          ok: false,
          reason: 'not_found',
          message: (rpcError || error)?.message,
        }
      }

      if (data) classroom = normalizeClassroom(data)
    }
  }

  if (!classroom) return { ok: false, reason: 'not_found' }

  const alreadyJoined = classroom.students.some((item) => item.userId === studentPayload.userId)
  const students = alreadyJoined
    ? classroom.students
    : [
        ...classroom.students,
        {
          ...studentPayload,
          joinedAt: new Date().toISOString(),
          status: 'offline',
        },
      ]

  const existing = state.classrooms.some((item) => item.id === classroom.id)
  const classrooms = existing
    ? state.classrooms.map((item) => item.id === classroom.id ? normalizeClassroom({ ...item, students }) : item)
    : [...state.classrooms, normalizeClassroom({ ...classroom, students })]

  setState({ classrooms, activeClassroomId: classroom.id, error: null })

  if (user) {
    try {
      const { error } = await supabase
        .from('classroom_members')
        .upsert(studentToMemberRow(classroom.id, students.find((s) => s.userId === studentPayload.userId)), {
          onConflict: 'classroom_id,user_id',
        })

      if (error) throw error
      await hydrateClassrooms()
    } catch (err) {
      console.warn('[classroomStore] join sync failed', err)
      setState({ error: err.message || 'Erreur jonction Classroom' }, { persist: false })
    }
  }

  return { ok: true, classroomId: classroom.id }
}

export function addClassroomFile(classroomId, file) {
  const classroom = state.classrooms.find((item) => item.id === classroomId)
  if (!classroom) return state

  const normalizedFile = normalizeFile(file)
  rememberPendingFile(classroomId, normalizedFile)
  const files = [
    ...classroom.files.filter((item) => item.id !== normalizedFile.id),
    normalizedFile,
  ]

  // Important : ne pas passer par updateClassroom() ici. updateClassroom()
  // met à jour la classe, déclenche Realtime sur `classrooms`, puis hydrate
  // parfois avant que le nouveau devoir soit écrit dans `classroom_files`.
  // Résultat visible : le devoir apparaît puis disparaît. On fait donc une
  // écriture optimiste locale + un insert direct du travail côté Supabase.
  const classrooms = state.classrooms.map((item) => (
    item.id === classroomId
      ? normalizeClassroom({ ...item, files, updatedAt: new Date().toISOString() })
      : item
  ))
  const next = setState({ classrooms, error: null })

  ;(async () => {
    try {
      const user = await getCurrentUser()
      if (!user) return

      await upsertClassroomFileToSupabase(classroomId, normalizedFile)
      await hydrateClassrooms()
    } catch (err) {
      console.warn('[classroomStore] add file sync failed', err)
      setState({ error: err.message || 'Erreur publication du devoir' }, { persist: false })
    }
  })()

  return next
}

export async function deleteClassroomFile(classroomId, fileId) {
  const classroom = state.classrooms.find((item) => item.id === classroomId)
  if (!classroom) return state

  const previousClassrooms = state.classrooms
  const files = (classroom.files || []).filter((file) => file.id !== fileId)
  const classrooms = state.classrooms.map((item) => (
    item.id === classroomId
      ? normalizeClassroom({ ...item, files, updatedAt: new Date().toISOString() })
      : item
  ))
  const next = setState({ classrooms, error: null })

  try {
    const user = await getCurrentUser()
    if (user) {
      // Suppression serveur robuste : évite que le sync local-first ré-upsert
      // le devoir supprimé et contourne les surprises de policies RLS.
      const { error: rpcError } = await supabase
        .rpc('delete_classroom_file_everywhere', {
          p_classroom_id: classroomId,
          p_file_id: fileId,
        })

      if (rpcError) {
        const { error } = await supabase
          .from('classroom_files')
          .delete()
          .eq('id', fileId)
          .eq('classroom_id', classroomId)

        if (error) throw error
      }
      await hydrateClassrooms()
    }
  } catch (err) {
    console.warn('[classroomStore] file delete failed', err)
    setState({ classrooms: previousClassrooms }, { persist: true })
    setState({ error: err.message || 'Erreur suppression du travail' }, { persist: false })
  }

  return next
}

export function toggleClassroomExamMode(classroomId) {
  const classroom = state.classrooms.find((item) => item.id === classroomId)
  if (!classroom) return state
  return updateClassroom(classroomId, { examMode: !classroom.examMode })
}

export function resetClassrooms() {
  return setState({ ...DEFAULT_STATE })
}