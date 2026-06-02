import ClassroomBanner from './ClassroomBanner'
import ClassroomStreamFeed from './ClassroomStreamFeed'
import ClassroomStreamSidebar from './ClassroomStreamSidebar'

export default function ClassroomStream({
  current,
  showCode,
  copied,
  dueWorkItems,
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
  setShowCode,
  onCopyCode,
  setTab,
  openWorkDetail,
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
    <>
      <ClassroomBanner current={current} />

      <div className="cpp-tab-pane cpp-stream">
        <ClassroomStreamSidebar
          current={current}
          showCode={showCode}
          copied={copied}
          dueWorkItems={dueWorkItems}
          setShowCode={setShowCode}
          onCopyCode={onCopyCode}
          setTab={setTab}
          openWorkDetail={openWorkDetail}
        />

        <ClassroomStreamFeed
          announcementDrafts={announcementDrafts}
          announcements={announcements}
          isTeacher={isTeacher}
          myUserId={myUserId}
          draft={draft}
          composerOpen={composerOpen}
          composerMenuOpen={composerMenuOpen}
          scheduleModalOpen={scheduleModalOpen}
          scheduleAt={scheduleAt}
          composerEditorRef={composerEditorRef}
          editingAnnouncementId={editingAnnouncementId}
          editAnnouncementDraft={editAnnouncementDraft}
          announcementMenuId={announcementMenuId}
          setDraft={setDraft}
          setComposerOpen={setComposerOpen}
          setComposerMenuOpen={setComposerMenuOpen}
          setScheduleModalOpen={setScheduleModalOpen}
          setScheduleAt={setScheduleAt}
          setAnnouncementMenuId={setAnnouncementMenuId}
          setEditAnnouncementDraft={setEditAnnouncementDraft}
          openDraftAnnouncement={openDraftAnnouncement}
          applyComposerCommand={applyComposerCommand}
          postAnnouncement={postAnnouncement}
          saveAnnouncementDraft={saveAnnouncementDraft}
          scheduleAnnouncement={scheduleAnnouncement}
          startEditAnnouncement={startEditAnnouncement}
          cancelEditAnnouncement={cancelEditAnnouncement}
          saveAnnouncementEdit={saveAnnouncementEdit}
          deleteAnnouncement={deleteAnnouncement}
        />
      </div>
    </>
  )
}