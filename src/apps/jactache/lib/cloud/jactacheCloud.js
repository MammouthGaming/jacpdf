import { supabase } from '@/shared/lib/infra/supabase'

export const JACTACHE_SOURCE = 'jactache_cloud'

export class JactacheCloudError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'JactacheCloudError'
    this.details = details
  }
}

function cleanText(t, fallback = '') {
  return (t || '').toString().trim() || fallback
}

function roleCanEdit(role) {
  return role === 'owner' || role === 'editor'
}

function normalizeProject(row, currentUserId, shareRole) {
  if (!row) return null
  const isOwner = !!currentUserId && row.user_id === currentUserId
  const role = isOwner ? 'owner' : (shareRole || 'viewer')
  return {
    id: row.id,
    cloudId: row.id,
    name: row.name,
    icon: row.icon || 'folder',
    parentId: row.parent_id ?? null,
    position: row.position ?? 0,
    system: !!row.system,
    ownerId: row.user_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: JACTACHE_SOURCE,
    isShared: !isOwner,
    shareRole: role,
    canEdit: roleCanEdit(role),
  }
}

function normalizeTask(row, currentUserId, shareRole) {
  if (!row) return null
  const isOwner = !!currentUserId && row.user_id === currentUserId
  const role = isOwner ? 'owner' : (shareRole || 'viewer')
  return {
    id: row.id,
    cloudId: row.id,
    projectId: row.project_id ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status || 'todo',
    priority: row.priority || 'medium',
    dueDate: row.due_date,
    dueIsDatetime: !!row.due_is_datetime,
    tags: row.tags || [],
    subtasks: row.subtasks || [],
    recurrence: row.recurrence,
    position: row.position ?? 0,
    classroomId: row.classroom_id ?? null,
    assignmentId: row.assignment_id ?? null,
    revision: row.revision || 1,
    ownerId: row.user_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    syncedAt: row.updated_at,
    source: JACTACHE_SOURCE,
    isShared: !isOwner,
    shareRole: role,
    canEdit: roleCanEdit(role),
  }
}

async function getCurrentProjectRole(projectId, row, currentUserId) {
  if (!projectId || !row || !currentUserId) return 'viewer'
  if (row.user_id === currentUserId) return 'owner'
  const { data, error } = await supabase.rpc('jactache_role_for_current_user', {
    p_project_id: projectId,
  })
  if (error) return 'viewer'
  return data || 'viewer'
}

// ─── Projets ─────────────────────────────────────────

/**
 * Liste tous les projets visibles (propriétaire + partagés via shares).
 * @param {object} [args]
 * @param {'all'|'mine'|'shared'} [args.scope]
 */
export async function listProjects({ scope = 'all' } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null

  let q = supabase
    .from('jactache_projects')
    .select('id, user_id, name, icon, parent_id, position, system, created_at, updated_at')
    .order('parent_id', { ascending: true, nullsFirst: true })
    .order('position', { ascending: true })

  if (scope === 'mine' && currentUserId) q = q.eq('user_id', currentUserId)
  else if (scope === 'shared' && currentUserId) q = q.neq('user_id', currentUserId)

  const { data, error } = await q
  if (error) throw new JactacheCloudError('listProjects failed', { details: error })

  const rows = data || []
  const sharedIds = rows.filter((r) => r.user_id !== currentUserId).map((r) => r.id)
  let roleByProjectId = {}
  if (sharedIds.length > 0 && currentUserId) {
    const userEmail = (user?.email || '').trim().toLowerCase()
    const shareQuery = supabase
      .from('jactache_shares')
      .select('project_id, role, shared_with_user_id, shared_with_email')
      .in('project_id', sharedIds)
    const { data: shareRows } = userEmail
      ? await shareQuery.or(`shared_with_user_id.eq.${currentUserId},shared_with_email.eq.${userEmail}`)
      : await shareQuery.eq('shared_with_user_id', currentUserId)
    roleByProjectId = (shareRows || []).reduce((acc, s) => {
      const next = s.role || 'viewer'
      if (!acc[s.project_id] || roleCanEdit(next)) acc[s.project_id] = next
      return acc
    }, {})
  }

  return rows.map((row) => normalizeProject(
    row,
    currentUserId,
    row.user_id === currentUserId ? 'owner' : roleByProjectId[row.id] || 'viewer',
  ))
}

export async function createProject({ name, icon = 'folder', parentId = null, position = 0, system = false } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JactacheCloudError('not authenticated')

  const { data, error } = await supabase
    .from('jactache_projects')
    .insert({
      user_id: user.id,
      name: cleanText(name, 'Nouveau projet'),
      icon,
      parent_id: parentId,
      position,
      system,
    })
    .select('*')
    .single()

  if (error) throw new JactacheCloudError('createProject failed', { details: error })
  return normalizeProject(data, user.id, 'owner')
}

export async function updateProject(projectId, patch = {}) {
  if (!projectId) throw new JactacheCloudError('projectId is required')
  const updates = { updated_at: new Date().toISOString() }
  if ('name' in patch) updates.name = cleanText(patch.name, 'Sans titre')
  if ('icon' in patch) updates.icon = patch.icon
  if ('parentId' in patch) updates.parent_id = patch.parentId
  if ('position' in patch) updates.position = patch.position

  const { data, error } = await supabase
    .from('jactache_projects')
    .update(updates)
    .eq('id', projectId)
    .select('*')
    .single()

  if (error) throw new JactacheCloudError('updateProject failed', { details: error })

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null
  const role = await getCurrentProjectRole(projectId, data, currentUserId)
  return normalizeProject(data, currentUserId, role)
}

export async function renameProject(projectId, name) { return updateProject(projectId, { name }) }
export async function moveProject(projectId, parentId) { return updateProject(projectId, { parentId }) }

export async function deleteProject(projectId) {
  const { error } = await supabase
    .from('jactache_projects')
    .delete()
    .eq('id', projectId)
  if (error) throw new JactacheCloudError('deleteProject failed', { details: error })
}

// ─── Tâches ─────────────────────────────────────────

/**
 * Liste les tâches visibles.
 *
 * @param {object} [args]
 * @param {string|null} [args.projectId] - filtre par projet (null = orphelines).
 * @param {'todo'|'done'} [args.status]
 * @param {'all'|'mine'|'shared'} [args.scope]
 * @param {number} [args.limit]
 */
export async function listTasks({ projectId, status, scope = 'all', limit = 500 } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null

  let q = supabase
    .from('jactache_tasks')
    .select('*')
    .limit(limit)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (scope === 'mine' && currentUserId) q = q.eq('user_id', currentUserId)
  else if (scope === 'shared' && currentUserId) q = q.neq('user_id', currentUserId)

  if (projectId !== undefined) {
    q = projectId === null ? q.is('project_id', null) : q.eq('project_id', projectId)
  }
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) throw new JactacheCloudError('listTasks failed', { details: error })
  return (data || []).map((row) => normalizeTask(
    row,
    currentUserId,
    row.user_id === currentUserId ? 'owner' : 'viewer',
  ))
}

export async function getTask(taskId) {
  if (!taskId) return null
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null
  const { data, error } = await supabase
    .from('jactache_tasks')
    .select('*')
    .eq('id', taskId)
    .single()
  if (error) throw new JactacheCloudError('task not found', { details: error })
  return normalizeTask(
    data,
    currentUserId,
    data.user_id === currentUserId ? 'owner' : 'viewer',
  )
}

export async function createTask(payload = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JactacheCloudError('not authenticated')

  const insert = {
    user_id: user.id,
    project_id: payload.projectId ?? null,
    title: cleanText(payload.title, 'Nouvelle tâche'),
    description: payload.description ?? null,
    status: payload.status || 'todo',
    priority: payload.priority || 'medium',
    due_date: payload.dueDate ?? null,
    due_is_datetime: !!payload.dueIsDatetime,
    tags: payload.tags || [],
    subtasks: payload.subtasks || [],
    recurrence: payload.recurrence ?? null,
    position: payload.position ?? 0,
    classroom_id: payload.classroomId ?? null,
    assignment_id: payload.assignmentId ?? null,
  }

  const { data, error } = await supabase
    .from('jactache_tasks')
    .insert(insert)
    .select('*')
    .single()

  if (error) throw new JactacheCloudError('createTask failed', { details: error })
  return normalizeTask(data, user.id, 'owner')
}

export async function updateTask(taskId, patch = {}) {
  if (!taskId) throw new JactacheCloudError('taskId is required')
  const updates = { updated_at: new Date().toISOString() }
  if ('projectId' in patch) updates.project_id = patch.projectId
  if ('title' in patch) updates.title = cleanText(patch.title, 'Sans titre')
  if ('description' in patch) updates.description = patch.description
  if ('status' in patch) {
    updates.status = patch.status
    updates.completed_at = patch.status === 'done' ? new Date().toISOString() : null
  }
  if ('priority' in patch) updates.priority = patch.priority
  if ('dueDate' in patch) updates.due_date = patch.dueDate
  if ('dueIsDatetime' in patch) updates.due_is_datetime = !!patch.dueIsDatetime
  if ('tags' in patch) updates.tags = patch.tags || []
  if ('subtasks' in patch) updates.subtasks = patch.subtasks || []
  if ('recurrence' in patch) updates.recurrence = patch.recurrence
  if ('position' in patch) updates.position = patch.position
  if ('classroomId' in patch) updates.classroom_id = patch.classroomId
  if ('assignmentId' in patch) updates.assignment_id = patch.assignmentId

  // Bump revision pour observateurs Realtime.
  const { data: existing, error: existingErr } = await supabase
    .from('jactache_tasks')
    .select('revision')
    .eq('id', taskId)
    .single()
  if (existingErr) throw new JactacheCloudError('task not found', { details: existingErr })
  updates.revision = (existing?.revision || 1) + 1

  const { data, error } = await supabase
    .from('jactache_tasks')
    .update(updates)
    .eq('id', taskId)
    .select('*')
    .single()

  if (error) throw new JactacheCloudError('updateTask failed', { details: error })

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null
  return normalizeTask(
    data,
    currentUserId,
    data.user_id === currentUserId ? 'owner' : 'viewer',
  )
}

export async function toggleTask(taskId) {
  const current = await getTask(taskId)
  if (!current) return null
  const next = current.status === 'done' ? 'todo' : 'done'
  return updateTask(taskId, { status: next })
}

export async function deleteTask(taskId) {
  const { error } = await supabase
    .from('jactache_tasks')
    .delete()
    .eq('id', taskId)
  if (error) throw new JactacheCloudError('deleteTask failed', { details: error })
}

/**
 * Sauvegarde hybride : si cloudId/taskId existe → update, sinon → create.
 */
export async function saveTask(payload = {}) {
  const id = payload.cloudId || payload.taskId || payload.id
  if (id) {
    const { cloudId, taskId, id: _i, ...rest } = payload
    return updateTask(id, rest)
  }
  return createTask(payload)
}