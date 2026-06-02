import { stripHtml } from './classroomUtils'

export const normalizeTopicKey = (value = '') => value.trim().toLowerCase()

export function buildTopicGroups({ classTopics = [], classFiles = [] }) {
  const topicGroups = classTopics.map((topic) => {
    const topicKey = normalizeTopicKey(topic.name)

    return {
      ...topic,
      files: classFiles.filter((file) => normalizeTopicKey(file.topic || '') === topicKey),
    }
  })

  const groupedTopicKeys = new Set(topicGroups.map((topic) => normalizeTopicKey(topic.name)))
  const ungroupedFiles = classFiles.filter((file) => {
    const topicKey = normalizeTopicKey(file.topic || '')
    return !topicKey || !groupedTopicKeys.has(topicKey)
  })

  return { topicGroups, ungroupedFiles }
}

export function getAssignedStudentCount(work, current) {
  if (!work) return 0

  const assignedTo = Array.isArray(work.assignedTo || work.assigned_to)
    ? work.assignedTo || work.assigned_to
    : []

  return assignedTo.length > 0 ? assignedTo.length : (current?.students || []).length
}

export function getDueInfo(work) {
  if (!work?.dueDate) return { label: 'Sans échéance', tone: 'muted', sortTime: Number.POSITIVE_INFINITY }

  const dueTime = new Date(work.dueDate).getTime()
  if (!dueTime) return { label: 'Sans échéance', tone: 'muted', sortTime: Number.POSITIVE_INFINITY }

  const now = new Date()
  const due = new Date(dueTime)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const dayDiff = Math.round((dueStart - todayStart) / 86400000)

  if (dueTime < Date.now()) return { label: 'En retard', tone: 'late', sortTime: dueTime }
  if (dayDiff === 0) return { label: "Aujourd'hui", tone: 'today', sortTime: dueTime }
  if (dayDiff === 1) return { label: 'Demain', tone: 'soon', sortTime: dueTime }
  if (dayDiff < 7) return { label: `Dans ${dayDiff} jours`, tone: 'soon', sortTime: dueTime }

  return {
    label: due.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' }),
    tone: 'later',
    sortTime: dueTime,
  }
}

export function buildDueWorkItems(classFiles = []) {
  return classFiles
    .filter((work) => !work.readOnly && work.mode !== 'material')
    .map((work) => ({ ...work, dueInfo: getDueInfo(work) }))
    .sort((a, b) => a.dueInfo.sortTime - b.dueInfo.sortTime)
}

export function buildNotificationItems({
  announcements = [],
  dueWorkItems = [],
  classFiles = [],
  submissionsByWorkId = {},
  workCommentsById = {},
  isTeacher,
  myUserId,
  openWorkDetail,
  setNotificationsPanelOpen,
  setTab,
}) {
  return [
    ...announcements
      .filter((announcement) => announcement.authorId !== myUserId)
      .slice(0, 4)
      .map((announcement) => ({
        id: `announcement-${announcement.id}`,
        type: 'Annonce',
        title: 'Nouvelle annonce',
        text: stripHtml(announcement.text) || 'Annonce publiée dans le flux',
        date: announcement.createdAt,
        action: () => {
          setNotificationsPanelOpen(false)
          setTab('stream')
        },
      })),
    ...dueWorkItems
      .filter((work) => work.dueInfo.tone === 'late' || work.dueInfo.tone === 'today' || work.dueInfo.tone === 'soon')
      .slice(0, 5)
      .map((work) => ({
        id: `due-${work.id}`,
        type: work.dueInfo.label,
        title: work.name,
        text: work.dueDate
          ? `Échéance : ${new Date(work.dueDate).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}`
          : 'Travail à faire',
        date: work.dueDate || work.distributedAt,
        tone: work.dueInfo.tone,
        action: () => {
          setNotificationsPanelOpen(false)
          setTab('classwork')
          openWorkDetail(work.id)
        },
      })),
    ...classFiles.flatMap((work) => {
      const submissions = submissionsByWorkId[work.id] || []

      if (isTeacher) {
        return submissions
          .filter((submission) => submission.status === 'submitted')
          .map((submission) => ({
            id: `submission-${work.id}-${submission.studentId}`,
            type: 'Remise',
            title: `${submission.studentName} a remis un devoir`,
            text: work.name,
            date: submission.submittedAt,
            action: () => {
              setNotificationsPanelOpen(false)
              setTab('classwork')
              openWorkDetail(work.id)
            },
          }))
      }

      return submissions
        .filter((submission) => submission.studentId === myUserId && submission.status === 'returned')
        .map((submission) => ({
          id: `returned-${work.id}-${submission.studentId}`,
          type: 'Note',
          title: 'Devoir rendu',
          text: `${work.name}${submission.grade !== null && submission.grade !== undefined ? ` • ${submission.grade}/${work.points ?? 100}` : ''}`,
          date: submission.returnedAt || submission.updatedAt,
          action: () => {
            setNotificationsPanelOpen(false)
            setTab('classwork')
            openWorkDetail(work.id)
          },
        }))
    }),
    ...Object.values(workCommentsById)
      .flat()
      .filter((comment) => comment.commentType === 'private' && comment.authorId !== myUserId)
      .slice(0, 5)
      .map((comment) => {
        const work = classFiles.find((item) => item.id === comment.fileId)

        return {
          id: `private-comment-${comment.id}`,
          type: 'Commentaire privé',
          title: comment.authorName,
          text: comment.text,
          date: comment.createdAt,
          action: () => {
            setNotificationsPanelOpen(false)

            if (work) {
              setTab('classwork')
              openWorkDetail(work.id)
            }
          },
        }
      }),
  ]
    .filter((item) => item.id)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 12)
}

export function buildSubmissionDashboardRows({
  isTeacher,
  classFiles = [],
  current,
  submissionsByWorkId = {},
}) {
  if (!isTeacher) return []

  return classFiles
    .filter((work) => work.mode !== 'material')
    .map((work) => {
      const assignedTo = Array.isArray(work.assignedTo || work.assigned_to)
        ? work.assignedTo || work.assigned_to
        : []
      const assignedStudents = assignedTo.length > 0
        ? (current?.students || []).filter((student) => assignedTo.includes(student.userId))
        : (current?.students || [])
      const submissions = submissionsByWorkId[work.id] || []
      const submittedCount = submissions.filter((submission) =>
        submission.status === 'submitted' || submission.status === 'returned'
      ).length
      const returnedCount = submissions.filter((submission) => submission.status === 'returned').length
      const missingCount = Math.max(assignedStudents.length - submittedCount, 0)

      return {
        work,
        assignedStudents,
        submissions,
        submittedCount,
        returnedCount,
        missingCount,
      }
    })
}