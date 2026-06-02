import ClassroomAnnouncementComposer from './ClassroomAnnouncementComposer'
import ClassroomAnnouncementDrafts from './ClassroomAnnouncementDrafts'
import ClassroomAnnouncementList from './ClassroomAnnouncementList'

export default function ClassroomStreamFeed({
  announcementDrafts,
  announcements,
  isTeacher,
  myUserId,
  draft,
  composerOpen,
  composerMenuOpen,
  scheduleModalOpen,
  scheduleAt,
  composerEditorRef,
  editingAnnouncementId,
  editAnnouncementDraft,
  announcementMenuId,
  setDraft,
  setComposerOpen,
  setComposerMenuOpen,
  setScheduleModalOpen,
  setScheduleAt,
  setAnnouncementMenuId,
  setEditAnnouncementDraft,
  openDraftAnnouncement,
  applyComposerCommand,
  postAnnouncement,
  saveAnnouncementDraft,
  scheduleAnnouncement,
  startEditAnnouncement,
  cancelEditAnnouncement,
  saveAnnouncementEdit,
  deleteAnnouncement,
}) {
  return (
    <section className="cpp-stream-feed">
      <ClassroomAnnouncementDrafts
        announcementDrafts={announcementDrafts}
        openDraftAnnouncement={openDraftAnnouncement}
      />

      <ClassroomAnnouncementComposer
        draft={draft}
        composerOpen={composerOpen}
        composerMenuOpen={composerMenuOpen}
        scheduleModalOpen={scheduleModalOpen}
        scheduleAt={scheduleAt}
        composerEditorRef={composerEditorRef}
        setDraft={setDraft}
        setComposerOpen={setComposerOpen}
        setComposerMenuOpen={setComposerMenuOpen}
        setScheduleModalOpen={setScheduleModalOpen}
        setScheduleAt={setScheduleAt}
        applyComposerCommand={applyComposerCommand}
        postAnnouncement={postAnnouncement}
        saveAnnouncementDraft={saveAnnouncementDraft}
        scheduleAnnouncement={scheduleAnnouncement}
      />

      <ClassroomAnnouncementList
        announcements={announcements}
        isTeacher={isTeacher}
        myUserId={myUserId}
        editingAnnouncementId={editingAnnouncementId}
        editAnnouncementDraft={editAnnouncementDraft}
        announcementMenuId={announcementMenuId}
        setAnnouncementMenuId={setAnnouncementMenuId}
        setEditAnnouncementDraft={setEditAnnouncementDraft}
        startEditAnnouncement={startEditAnnouncement}
        cancelEditAnnouncement={cancelEditAnnouncement}
        saveAnnouncementEdit={saveAnnouncementEdit}
        deleteAnnouncement={deleteAnnouncement}
      />
    </section>
  )
}