import { ASSIGNMENT_SHARE_OPTIONS } from './classroomConstants'

export function hashHue(str = '') {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % 360
}

export function initialsOf(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || '?'
  )
}

export function formatRelative(iso) {
  if (!iso) return ''

  const t = new Date(iso).getTime()
  if (!t) return ''

  const diff = Math.max(0, Date.now() - t)
  const mn = Math.floor(diff / 60000)

  if (mn < 1) return "à l'instant"
  if (mn < 60) return `il y a ${mn} min`

  const h = Math.floor(mn / 60)
  if (h < 24) return `il y a ${h} h`

  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} j`

  return new Date(iso).toLocaleDateString('fr-CA', {
    month: 'short',
    day: 'numeric',
  })
}

export function normalizeAnnouncement(row = {}) {
  return {
    id: row.id,
    authorName: row.authorName || row.author_name || 'JacPDF',
    authorId: row.authorId || row.author_id || null,
    authorRole: row.authorRole || row.author_role || 'eleve',
    text: row.text || '',
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  }
}

export function normalizeTopic(row = {}) {
  return {
    id: row.id,
    classroomId: row.classroomId || row.classroom_id || null,
    name: (row.name || '').trim(),
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    updatedAt:
      row.updatedAt ||
      row.updated_at ||
      row.createdAt ||
      row.created_at ||
      new Date().toISOString(),
  }
}

export function normalizeSubmission(row = {}) {
  return {
    id: row.id,
    classroomId: row.classroomId || row.classroom_id || null,
    fileId: row.fileId || row.classroom_file_id || null,
    studentId: row.studentId || row.student_id || null,
    studentName: row.studentName || row.student_name || 'Élève',
    studentEmail: row.studentEmail || row.student_email || '',
    status: row.status || 'submitted',
    grade: row.grade ?? row.points ?? null,
    feedback: row.feedback || row.private_feedback || '',
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    submittedAt: row.submittedAt || row.submitted_at || row.updated_at || new Date().toISOString(),
    returnedAt: row.returnedAt || row.returned_at || null,
    updatedAt: row.updatedAt || row.updated_at || row.submitted_at || new Date().toISOString(),
  }
}

export function normalizeWorkComment(row = {}) {
  return {
    id: row.id,
    classroomId: row.classroomId || row.classroom_id || null,
    fileId: row.fileId || row.classroom_file_id || null,
    authorId: row.authorId || row.author_id || null,
    authorName: row.authorName || row.author_name || 'JacPDF',
    authorRole: row.authorRole || row.author_role || 'eleve',
    commentType: row.commentType || row.comment_type || 'class',
    text: row.text || '',
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  }
}

export function normalizeStudentCopy(row = {}) {
  return {
    id: row.id,
    classroomId: row.classroomId || row.classroom_id || null,
    fileId: row.fileId || row.classroom_file_id || null,
    studentId: row.studentId || row.student_id || null,
    sourceDocumentId: row.sourceDocumentId || row.source_document_id || null,
    copyDocumentId: row.copyDocumentId || row.copy_document_id || null,
    documentId: row.documentId || row.copy_document_id || null,
    name: row.name || row.copy_name || 'Ma copie',
    source: row.source || 'jacpdf-cloud',
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  }
}

export function stripHtml(html = '') {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || '').replace(/\u00a0/g, ' ').trim()
}

export function isRichTextEmpty(html = '') {
  return !stripHtml(html)
}

export function sanitizeAnnouncementHtml(html = '') {
  const template = document.createElement('template')
  template.innerHTML = html

  const allowedTags = new Set([
    'B',
    'STRONG',
    'I',
    'EM',
    'U',
    'S',
    'BR',
    'DIV',
    'P',
    'UL',
    'OL',
    'LI',
  ])

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowedTags.has(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ''))
          continue
        }

        for (const attr of [...child.attributes]) child.removeAttribute(attr.name)
        walk(child)
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove()
      }
    }
  }

  walk(template.content)

  return template.innerHTML.trim()
}

export function assignmentShareLabel(mode) {
  return (
    ASSIGNMENT_SHARE_OPTIONS.find((option) => option.id === mode)?.label ||
    ASSIGNMENT_SHARE_OPTIONS[0].label
  )
}