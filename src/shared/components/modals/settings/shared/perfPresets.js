// Métadonnées des 3 presets perf — icône, label, description courte. Les
// valeurs concrètes (renderQuality, historyLimit, etc.) vivent dans
// performanceStore._PRESETS — ici on ne fait que présenter les choix UX.
export const PERF_PRESETS = [
  {
    id: 'beauty',
    icon: '🎨',
    name: 'Beauté',
    desc: 'Qualité de rendu maximale, toutes les animations activées. Idéal sur appareil récent et branché.',
  },
  {
    id: 'balanced',
    icon: '⚖️',
    name: 'Équilibré',
    desc: 'Compromis recommandé entre fluidité et qualité. Bon défaut pour la plupart des usages.',
  },
  {
    id: 'performance',
    icon: '⚡',
    name: 'Performance',
    desc: 'Animations désactivées, rendu allégé. Réactivité et autonomie maximales sur appareil modeste.',
  },
]