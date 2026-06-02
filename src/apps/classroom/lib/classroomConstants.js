export const TAB_DEFS = [
  { id: 'stream', label: 'Flux' },
  { id: 'classwork', label: 'Travaux' },
  { id: 'people', label: 'Personnes' },
]

export const ASSIGNMENT_SHARE_OPTIONS = [
  { id: 'view', label: 'Les élèves peuvent afficher le fichier' },
  { id: 'edit', label: 'Les élèves peuvent modifier le fichier' },
  { id: 'copy', label: 'Faire une copie pour chaque élève' },
]

export const ASSIGNMENT_DEFAULTS = {
  title: '',
  instructions: '',
  points: 100,
  dueDate: '',
  topic: '',
  attachments: [],
}

export const COURSE_DEFAULTS = {
  name: '',
  subject: '',
  group: '',
}