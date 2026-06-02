import { createElement, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { formatRelative, initialsOf, normalizeWorkComment } from '../lib/classroomUtils'

export function useClassroomWorkComments({
  current,
  selectedWork,
  myUserId,
  myName,
  isTeacher,
}) {
  const [workCommentsById, setWorkCommentsById] = useState({})
  const [classCommentDraft, setClassCommentDraft] = useState('')
  const [privateCommentDraft, setPrivateCommentDraft] = useState('')

  useEffect(() => {
    if (!current?.id) return

    let cancelled = false

    const groupComments = (items = []) => {
      const grouped = {}

      items.map(normalizeWorkComment).forEach((comment) => {
        if (!comment.fileId) return

        grouped[comment.fileId] = [
          comment,
          ...(grouped[comment.fileId] || []).filter((item) => item.id !== comment.id),
        ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      })

      return grouped
    }

    const loadWorkComments = async () => {
      const { data, error } = await supabase
        .from('classroom_work_comments')
        .select('*')
        .eq('classroom_id', current.id)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        if (import.meta.env.DEV) console.warn('[classroom/comments] load failed', error)
        return
      }

      setWorkCommentsById(groupComments(data || []))
    }

    loadWorkComments()

    const channelTopic = `classroom-work-comments:${current.id}:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classroom_work_comments',
          filter: `classroom_id=eq.${current.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldComment = normalizeWorkComment(payload.old || {})

            if (!oldComment.fileId || !oldComment.id) {
              loadWorkComments()
              return
            }

            setWorkCommentsById((state) => ({
              ...state,
              [oldComment.fileId]: (state[oldComment.fileId] || []).filter((item) => item.id !== oldComment.id),
            }))
            return
          }

          if (!payload.new) return

          const next = normalizeWorkComment(payload.new)
          setWorkCommentsById((state) => ({
            ...state,
            [next.fileId]: [
              ...(state[next.fileId] || []).filter((item) => item.id !== next.id),
              next,
            ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
          }))
        },
      )
      .subscribe()

    const intervalId = setInterval(loadWorkComments, 10000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      try { channel.unsubscribe() } catch {}
      supabase.removeChannel(channel)
    }
  }, [current?.id])

  const postWorkComment = async (commentType = 'class') => {
    if (!current || !selectedWork || !myUserId) return

    const draftValue = commentType === 'private' ? privateCommentDraft : classCommentDraft
    const text = draftValue.trim()
    if (!text) return

    const optimistic = normalizeWorkComment({
      id: `local-comment-${Date.now()}`,
      classroom_id: current.id,
      classroom_file_id: selectedWork.id,
      author_id: myUserId,
      author_name: myName,
      author_role: isTeacher ? 'enseignant' : 'eleve',
      comment_type: commentType,
      text,
      created_at: new Date().toISOString(),
    })

    if (commentType === 'private') setPrivateCommentDraft('')
    else setClassCommentDraft('')

    setWorkCommentsById((state) => ({
      ...state,
      [selectedWork.id]: [...(state[selectedWork.id] || []), optimistic],
    }))

    const { data, error } = await supabase
      .from('classroom_work_comments')
      .insert({
        classroom_id: current.id,
        classroom_file_id: selectedWork.id,
        author_id: myUserId,
        author_name: myName,
        author_role: isTeacher ? 'enseignant' : 'eleve',
        comment_type: commentType,
        text,
      })
      .select('*')
      .single()

    if (error) {
      if (import.meta.env.DEV) console.warn('[classroom/comments] post failed', error)

      setWorkCommentsById((state) => ({
        ...state,
        [selectedWork.id]: (state[selectedWork.id] || []).filter((item) => item.id !== optimistic.id),
      }))

      if (commentType === 'private') setPrivateCommentDraft(text)
      else setClassCommentDraft(text)

      alert(error.message || 'Impossible de publier le commentaire.')
      return
    }

    const saved = normalizeWorkComment(data)
    setWorkCommentsById((state) => ({
      ...state,
      [selectedWork.id]: [
        ...(state[selectedWork.id] || []).filter((item) => item.id !== optimistic.id && item.id !== saved.id),
        saved,
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }))
  }

  const renderComment = (comment) =>
    createElement(
      'div',
      { key: comment.id, className: 'cpp-work-comment' },
      createElement('span', { className: 'cpp-work-comment-avatar' }, initialsOf(comment.authorName)),
      createElement(
        'div',
        { className: 'cpp-work-comment-body' },
        createElement(
          'div',
          { className: 'cpp-work-comment-meta' },
          createElement('strong', null, comment.authorName),
          comment.authorRole === 'enseignant' ? createElement('span', null, 'Enseignant') : null,
          createElement('small', null, formatRelative(comment.createdAt)),
        ),
        createElement('p', null, comment.text),
      ),
    )

  return {
    workCommentsById,
    classCommentDraft,
    privateCommentDraft,
    setWorkCommentsById,
    setClassCommentDraft,
    setPrivateCommentDraft,
    postWorkComment,
    renderComment,
  }
}