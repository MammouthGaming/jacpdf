// Logos d'apps : ré-exportés depuis le catalogue central src/shared/lib/apps.
// FullSettingsModal et les sections « À propos » partagent ainsi la même
// source unique. `classe` est un alias historique de `classroom` (id utilisé
// côté Réglages).
import { APP_LOGOS as CATALOG_LOGOS } from '@/shared/lib/apps/appsCatalog'

export const APP_LOGOS = {
  ...CATALOG_LOGOS,
  classe: CATALOG_LOGOS.classroom,
}

export const ACCENT_COLORS = [
  '#39FF14', '#6366F1', '#A855F7', '#EC4899',
  '#F97316', '#06B6D4', '#EAB308', '#EF4444',
]