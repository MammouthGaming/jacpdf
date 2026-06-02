import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { normalizeTopic } from '../lib/classroomUtils'

export function useClassroomTopics({ current }) {
  const [topicModalOpen, setTopicModalOpen] = useState(false)
  const [topicName, setTopicName] = useState('')
  const [topicsByClass, setTopicsByClass] = useState({})
  const [collapsedTopicIds, setCollapsedTopicIds] = useState({})
  const [topicMenuId, setTopicMenuId] = useState(null)

  const classTopics = current ? topicsByClass[current.id] || [] : []

  useEffect(() => {
    if (!current?.id) return

    let cancelled = false

    const loadTopics = async () => {
      const { data, error } = await supabase
        .from('classroom_topics')
        .select('*')
        .eq('classroom_id', current.id)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        if (import.meta.env.DEV) console.warn('[classroom/topics] load failed', error)
        return
      }

      setTopicsByClass((state) => ({
        ...state,
        [current.id]: (data || []).map(normalizeTopic),
      }))
    }

    loadTopics()

    const channelTopic = `classroom-topics:${current.id}:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classroom_topics',
          filter: `classroom_id=eq.${current.id}`,
        },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id

            if (!deletedId) {
              loadTopics()
              return
            }

            setTopicsByClass((state) => ({
              ...state,
              [current.id]: (state[current.id] || []).filter((topic) => topic.id !== deletedId),
            }))
            return
          }

          if (!payload.new) return

          const next = normalizeTopic(payload.new)
          setTopicsByClass((state) => ({
            ...state,
            [current.id]: [
              ...(state[current.id] || []).filter((topic) => topic.id !== next.id),
              next,
            ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
          }))
        },
      )
      .subscribe()

    const intervalId = setInterval(loadTopics, 10000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      try { channel.unsubscribe() } catch {}
      supabase.removeChannel(channel)
    }
  }, [current?.id])

  useEffect(() => {
    if (!topicMenuId) return

    const onPointerDown = (event) => {
      if (event.target?.closest?.('.cpp-topic-actions-wrapper')) return
      setTopicMenuId(null)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setTopicMenuId(null)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [topicMenuId])

  const createTopic = async () => {
    if (!current || !topicName.trim()) return

    const target = current
    const optimisticId = `local-topic-${Date.now()}`
    const topic = {
      id: optimisticId,
      classroomId: target.id,
      name: topicName.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setTopicsByClass((state) => ({
      ...state,
      [target.id]: [...(state[target.id] || []), topic],
    }))

    setTopicName('')
    setTopicModalOpen(false)

    const { data, error } = await supabase
      .from('classroom_topics')
      .insert({
        classroom_id: target.id,
        name: topic.name,
      })
      .select('*')
      .single()

    if (error) {
      if (import.meta.env.DEV) console.warn('[classroom/topics] create failed', error)
      setTopicsByClass((state) => ({
        ...state,
        [target.id]: (state[target.id] || []).filter((item) => item.id !== optimisticId),
      }))
      alert(error.message || 'Impossible de créer le sujet.')
      return
    }

    const saved = normalizeTopic(data)
    setTopicsByClass((state) => ({
      ...state,
      [target.id]: (state[target.id] || []).map((item) =>
        item.id === optimisticId ? saved : item
      ),
    }))
  }

  const toggleTopicCollapsed = (topicId) => {
    setCollapsedTopicIds((state) => ({
      ...state,
      [topicId]: !state[topicId],
    }))
  }

  const renameTopic = async (topic) => {
    if (!current || !topic) return

    const nextName = window.prompt('Renommer le sujet', topic.name || '')
    if (!nextName?.trim()) return

    const target = current
    const previous = topicsByClass[target.id] || []

    setTopicsByClass((state) => ({
      ...state,
      [target.id]: previous.map((item) =>
        item.id === topic.id ? { ...item, name: nextName.trim(), updatedAt: new Date().toISOString() } : item
      ),
    }))

    setTopicMenuId(null)

    const { data, error } = await supabase
      .from('classroom_topics')
      .update({ name: nextName.trim() })
      .eq('id', topic.id)
      .eq('classroom_id', target.id)
      .select('*')
      .single()

    if (error) {
      if (import.meta.env.DEV) console.warn('[classroom/topics] rename failed', error)
      setTopicsByClass((state) => ({ ...state, [target.id]: previous }))
      alert(error.message || 'Impossible de renommer le sujet.')
      return
    }

    const saved = normalizeTopic(data)
    setTopicsByClass((state) => ({
      ...state,
      [target.id]: (state[target.id] || []).map((item) =>
        item.id === saved.id ? saved : item
      ),
    }))
  }

  const deleteTopic = async (topicId) => {
    if (!current || !topicId) return

    const target = current
    const previous = topicsByClass[target.id] || []

    setTopicsByClass((state) => ({
      ...state,
      [target.id]: previous.filter((topic) => topic.id !== topicId),
    }))

    setTopicMenuId(null)

    const { error } = await supabase
      .from('classroom_topics')
      .delete()
      .eq('id', topicId)
      .eq('classroom_id', target.id)

    if (error) {
      if (import.meta.env.DEV) console.warn('[classroom/topics] delete failed', error)
      setTopicsByClass((state) => ({ ...state, [target.id]: previous }))
      alert(error.message || 'Impossible de supprimer le sujet.')
    }
  }

  return {
    classTopics,
    topicModalOpen,
    topicName,
    collapsedTopicIds,
    topicMenuId,
    setTopicModalOpen,
    setTopicName,
    setTopicMenuId,
    setCollapsedTopicIds,
    createTopic,
    toggleTopicCollapsed,
    renameTopic,
    deleteTopic,
  }
}