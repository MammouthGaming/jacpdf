// Liste centralisée des catégories de la sidebar Réglages.
// Chaque app filtre cette liste via getVisibleCategories(activeApp, user).
// Les ids sont stables — ne pas renommer, ils sont utilisés comme valeur
// du flag localStorage 'jacpdf_settings_initial_cat' pour ouvrir la modale
// directement sur une catégorie précise.
import { isOwner, isTester } from '@/shared/lib/user/userRoles'

export const CATEGORIES = [
  { id: 'general',      label: 'Général',                 icon: 'general' },
  { id: 'apparence',    label: 'Apparence',               icon: 'theme' },
  { id: 'edition',      label: 'Édition',                 icon: 'edit' },
  { id: 'ia',           label: 'IA / Assistant',          icon: 'ai' },
  { id: 'export',       label: 'Export',                  icon: 'export' },
  { id: 'compte',       label: 'Compte',                  icon: 'user' },
  { id: 'cloud',        label: 'Cloud & sauvegarde',      icon: 'cloud' },
  { id: 'notifications', label: 'Rappels & notifications', icon: 'bell' },
  { id: 'views',        label: 'Vues & filtres',          icon: 'views' },
  { id: 'integrations', label: 'Intégrations',            icon: 'integrations' },
  { id: 'calendriers',  label: 'Calendriers & sources',   icon: 'calendar' },
  { id: 'sociale',      label: 'Social',                  icon: 'social' },
  { id: 'ecole',        label: 'École',                   icon: 'school' },
  { id: 'raccourcis',   label: 'Raccourcis',              icon: 'keyboard' },
  { id: 'performance',  label: 'Avancé',                  icon: 'performance' },
  { id: 'reset',        label: 'Réinitialisation',        icon: 'reset' },
  { id: 'apropos',      label: 'À propos',                icon: 'info' },
  { id: 'admin',        label: 'Admin',                   icon: 'admin' },
]

// Whitelist par app — l'ordre dans CATEGORIES dicte l'ordre d'affichage.
// Les apps en cours de dev (jacslide/jacpaint/jacnote/classe) n'exposent
// que la section « À propos ».
const APP_CATEGORY_WHITELIST = {
  jacsuite:      ['general', 'apparence', 'compte', 'sociale', 'ecole', 'admin', 'apropos'],
  jacpdf:        ['general', 'apparence', 'performance', 'raccourcis', 'cloud', 'apropos'],
  jacdoc:        ['general', 'apparence', 'edition', 'export', 'cloud', 'raccourcis', 'apropos'],
  jactache:      ['general', 'apparence', 'edition', 'notifications', 'views', 'cloud', 'integrations', 'raccourcis', 'apropos'],
  jaccalendrier: ['general', 'apparence', 'edition', 'notifications', 'calendriers', 'cloud', 'integrations', 'raccourcis', 'apropos'],
  jacslide:      ['apropos'],
  jacpaint:      ['general', 'apparence', 'edition', 'export', 'cloud', 'raccourcis', 'performance', 'apropos'],
  jacnote:       ['general', 'apparence', 'edition', 'views', 'export', 'cloud', 'raccourcis', 'performance', 'apropos'],
  classe:        ['apropos'],
}

export function getVisibleCategories(activeApp, user) {
  const userRole = user?.user_metadata?.role
  const whitelist = APP_CATEGORY_WHITELIST[activeApp] || []
  return CATEGORIES.filter((cat) => {
    if (!whitelist.includes(cat.id)) return false
    if (cat.id === 'ecole') return userRole === 'ecole' || isOwner(user) || isTester(user)
    if (cat.id === 'admin') return isOwner(user)
    return true
  })
}