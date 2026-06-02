import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  listProjects, createProject, updateProject, renameProject, moveProject, deleteProject,
  listTasks, getTask, createTask, updateTask, toggleTask, deleteTask, saveTask,
} from '@/apps/jactache/lib/cloud/jactacheCloud'

/**
 * Hook cloud JacTâche.
 *
 * Surface API calquée sur useJacdocCloud : groupes `projects` et `tasks`
 * + alias à plat pour matcher le style des composants existants.
 *
 * Le store Zustand reste source de vérité local-first ; ce hook est
 * branché par les composants Drive-like / pickers / paramètres Cloud
 * pour pousser/récupérer depuis Supabase.
 */
export function useJacTacheCloud() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Session Supabase partagée avec le reste du JacSuite.
  useEffect(() => {
    let mounted = true

    const detect = (session) => {
      if (!mounted) return
      setConnected(!!session?.user)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      detect(session)
      if (mounted) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      detect(session)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const safeCall = useCallback(async (fn) => {
    try {
      setError(null)
      return await fn()
    } catch (err) {
      setError(err)
      throw err
    }
  }, [])

  const projects = useMemo(() => ({
    list: (args) => safeCall(() => listProjects(args)),
    create: (args) => safeCall(() => createProject(args)),
    update: (id, patch) => safeCall(() => updateProject(id, patch)),
    rename: (id, name) => safeCall(() => renameProject(id, name)),
    move: (id, parentId) => safeCall(() => moveProject(id, parentId)),
    remove: (id) => safeCall(() => deleteProject(id)),
  }), [safeCall])

  const tasks = useMemo(() => ({
    list: (args) => safeCall(() => listTasks(args)),
    get: (id) => safeCall(() => getTask(id)),
    create: (args) => safeCall(() => createTask(args)),
    update: (id, patch) => safeCall(() => updateTask(id, patch)),
    toggle: (id) => safeCall(() => toggleTask(id)),
    remove: (id) => safeCall(() => deleteTask(id)),
    save: (args) => safeCall(() => saveTask(args)),
  }), [safeCall])

  return {
    connected,
    loading,
    error,

    // API groupée.
    projects,
    tasks,

    // Alias à plat (matche le style useJacpdfCloud / useJacdocCloud).
    listProjects: projects.list,
    createProject: projects.create,
    updateProject: projects.update,
    renameProject: projects.rename,
    moveProject: projects.move,
    removeProject: projects.remove,

    listTasks: tasks.list,
    openTask: tasks.get,
    createTask: tasks.create,
    updateTask: tasks.update,
    toggleTask: tasks.toggle,
    removeTask: tasks.remove,
    saveTask: tasks.save,
  }
}