// Institutions du Québec utilisées par Paramètres > École.
// Liste volontairement légère : autocomplete local, pas une source officielle.
// On pourra l'étendre ou la remplacer par une table Supabase plus tard.

export const QC_INSTITUTIONS = [
  {
    type: 'universite',
    name: 'UQAM',
    aliases: ['Université du Québec à Montréal'],
    city: 'Montréal',
    campus: ['Centre-ville'],
  },
  {
    type: 'universite',
    name: 'Université de Montréal',
    aliases: ['UdeM'],
    city: 'Montréal',
    campus: ['Montréal', 'Laval', 'Saint-Hyacinthe'],
  },
  {
    type: 'universite',
    name: 'McGill University',
    aliases: ['McGill'],
    city: 'Montréal',
    campus: ['Downtown', 'Macdonald'],
  },
  {
    type: 'universite',
    name: 'Concordia University',
    aliases: ['Concordia'],
    city: 'Montréal',
    campus: ['Sir George Williams', 'Loyola'],
  },
  {
    type: 'universite',
    name: 'Université Laval',
    aliases: ['Laval'],
    city: 'Québec',
    campus: ['Québec'],
  },
  {
    type: 'universite',
    name: 'Université de Sherbrooke',
    aliases: ['Sherbrooke', 'UdeS'],
    city: 'Sherbrooke',
    campus: ['Sherbrooke', 'Longueuil'],
  },
  {
    type: 'universite',
    name: 'ÉTS',
    aliases: ['École de technologie supérieure'],
    city: 'Montréal',
    campus: ['Montréal'],
  },
  {
    type: 'universite',
    name: 'HEC Montréal',
    aliases: ['HEC'],
    city: 'Montréal',
    campus: ['Côte-Sainte-Catherine', 'Centre-ville'],
  },
  {
    type: 'universite',
    name: 'Polytechnique Montréal',
    aliases: ['Polytechnique'],
    city: 'Montréal',
    campus: ['Montréal'],
  },
  {
    type: 'universite',
    name: 'UQAR',
    aliases: ['Université du Québec à Rimouski'],
    city: 'Rimouski',
    campus: ['Rimouski', 'Lévis'],
  },
  {
    type: 'universite',
    name: 'UQAC',
    aliases: ['Université du Québec à Chicoutimi'],
    city: 'Saguenay',
    campus: ['Chicoutimi'],
  },
  {
    type: 'universite',
    name: 'UQAT',
    aliases: ['Université du Québec en Abitibi-Témiscamingue'],
    city: 'Rouyn-Noranda',
    campus: ['Rouyn-Noranda', 'Val-d’Or', 'Amos', 'Mont-Laurier', 'Montréal'],
  },
  {
    type: 'universite',
    name: 'UQO',
    aliases: ['Université du Québec en Outaouais'],
    city: 'Gatineau',
    campus: ['Gatineau', 'Saint-Jérôme'],
  },
  {
    type: 'universite',
    name: 'UQTR',
    aliases: ['Université du Québec à Trois-Rivières'],
    city: 'Trois-Rivières',
    campus: ['Trois-Rivières', 'Drummondville', 'Québec', 'L’Assomption'],
  },
  {
    type: 'universite',
    name: 'INRS',
    aliases: ['Institut national de la recherche scientifique'],
    city: 'Québec',
    campus: ['Québec', 'Montréal', 'Laval', 'Varennes'],
  },
  {
    type: 'universite',
    name: 'TÉLUQ',
    aliases: ['Université TÉLUQ'],
    city: 'Québec',
    campus: ['À distance'],
  },

  { type: 'cegep', name: 'Cégep du Vieux Montréal', city: 'Montréal', campus: ['Montréal'] },
  { type: 'cegep', name: 'Collège de Maisonneuve', city: 'Montréal', campus: ['Montréal'] },
  { type: 'cegep', name: 'Collège Ahuntsic', city: 'Montréal', campus: ['Montréal'] },
  { type: 'cegep', name: 'Collège de Rosemont', city: 'Montréal', campus: ['Montréal'] },
  { type: 'cegep', name: 'Collège Édouard-Montpetit', city: 'Longueuil', campus: ['Longueuil', 'ÉNA'] },
  { type: 'cegep', name: 'Cégep Limoilou', city: 'Québec', campus: ['Québec', 'Charlesbourg'] },
  { type: 'cegep', name: 'Cégep Garneau', city: 'Québec', campus: ['Québec'] },
  { type: 'cegep', name: 'Cégep de Sainte-Foy', city: 'Québec', campus: ['Québec'] },
  { type: 'cegep', name: 'Cégep de Lévis', city: 'Lévis', campus: ['Lévis'] },
  { type: 'cegep', name: 'Cégep de Trois-Rivières', city: 'Trois-Rivières', campus: ['Trois-Rivières'] },
  { type: 'cegep', name: 'Cégep de Sherbrooke', city: 'Sherbrooke', campus: ['Sherbrooke'] },
  { type: 'cegep', name: 'Cégep de Saint-Jérôme', city: 'Saint-Jérôme', campus: ['Saint-Jérôme'] },
]

export function findInstitutionByName(name) {
  const query = name?.trim().toLowerCase()
  if (!query) return null

  return QC_INSTITUTIONS.find((institution) => {
    if (institution.name.toLowerCase() === query) return true
    return institution.aliases?.some((alias) => alias.toLowerCase() === query)
  }) || null
}