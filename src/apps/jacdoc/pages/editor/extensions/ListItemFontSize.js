import { Extension } from '@tiptap/core'

// Extension qui ajoute un attribut `fontSize` aux nodes listItem et
// taskItem. Pourquoi : le `::marker` CSS d'un <li> (= le picot • ou le
// numéro 1.) hérite de la font-size du <li> lui-même, PAS du <span
// style="font-size: 16pt"> qu'on met autour du texte à l'intérieur. Si
// on grossit seulement le texte, le picot reste à 11pt et a l'air
// minuscule à côté d'un texte 32pt. Word et Google Docs règlent ça en
// stockant la font-size au niveau du listItem aussi, et c'est ce que
// fait setFontSize dans TextStyleWithFontSize.js.
export const ListItemFontSize = Extension.create({
  name: 'listItemFontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['listItem', 'taskItem'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) =>
              el.style && el.style.fontSize
                ? el.style.fontSize.replace(/['"]+/g, '')
                : null,
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {}
              return { style: 'font-size: ' + attrs.fontSize }
            },
          },
        },
      },
    ]
  },
})