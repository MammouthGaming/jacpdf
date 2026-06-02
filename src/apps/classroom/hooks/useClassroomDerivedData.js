import { useMemo } from 'react'
import {
  buildDueWorkItems,
  buildNotificationItems,
  buildSubmissionDashboardRows,
  buildTopicGroups,
  getAssignedStudentCount,
  getDueInfo,
} from '../lib/classroomDerivedData'

export function useClassroomDerivedData({
  current,
  classFiles,
  classTopics,
  announcements,
  submissionsByWorkId,
  workCommentsById,
  isTeacher,
  myUserId,
  openWorkDetail,
  setNotificationsPanelOpen,
  setTab,
}) {
  const { topicGroups, ungroupedFiles } = useMemo(
    () => buildTopicGroups({ classTopics, classFiles }),
    [classTopics, classFiles],
  )

  const dueWorkItems = useMemo(
    () => buildDueWorkItems(classFiles),
    [classFiles],
  )

  const notificationItems = useMemo(
    () => buildNotificationItems({
      announcements,
      dueWorkItems,
      classFiles,
      submissionsByWorkId,
      workCommentsById,
      isTeacher,
      myUserId,
      openWorkDetail,
      setNotificationsPanelOpen,
      setTab,
    }),
    [
      announcements,
      dueWorkItems,
      classFiles,
      submissionsByWorkId,
      workCommentsById,
      isTeacher,
      myUserId,
      openWorkDetail,
      setNotificationsPanelOpen,
      setTab,
    ],
  )

  const submissionDashboardRows = useMemo(
    () => buildSubmissionDashboardRows({
      isTeacher,
      classFiles,
      current,
      submissionsByWorkId,
    }),
    [isTeacher, classFiles, current, submissionsByWorkId],
  )

  return {
    topicGroups,
    ungroupedFiles,
    dueWorkItems,
    notificationItems,
    submissionDashboardRows,
    getDueInfo,
    getAssignedStudentCount: (work) => getAssignedStudentCount(work, current),
  }
}