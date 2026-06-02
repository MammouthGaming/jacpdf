// JacPDF Cloud — adaptateur mince au-dessus du cœur centralisé JacSuite Cloud.
//
// ⚠️ Toute la logique de stockage vit désormais dans
// `@/shared/lib/cloud/jacCloud`. Ce fichier ne fait que :
//   1. lier les fonctions à la source 'jacpdf_cloud' (bucket pdfs-cloud) ;
//   2. réexporter les fonctions globales (dossiers, usage, quota) ;
//   3. garder `markPdfEdited`, une stat propre à JacPDF.
// L'API publique est identique : les écrans JacPDF n'ont rien à changer.

import { supabase } from '@/shared/lib/infra/supabase'
import {
  JacCloudError,
  listFiles as listFilesCore,
  uploadNewFile as uploadNewFileCore,
  // réexports directs (déjà génériques / globaux)
  downloadFile,
  updateFile,
  deleteFile,
  renameFile,
  getStorageUsage,
  deleteAllOwnCloudFiles,
  enforceCloudQuotaByLargest,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFile,
  moveFolder,
  getFolderPath,
} from '@/shared/lib/cloud/jacCloud'

const SOURCE = 'jacpdf_cloud'

// Compat : l'ancien type d'erreur est désormais un alias du type centralisé,
// donc les `instanceof JacpdfCloudError` continuent de matcher ce que lève
// le cœur.
export const JacpdfCloudError = JacCloudError

// Réexports tels quels (génériques / globaux côté cœur).
export {
  downloadFile,
  updateFile,
  deleteFile,
  renameFile,
  getStorageUsage,
  deleteAllOwnCloudFiles,
  enforceCloudQuotaByLargest,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFile,
  moveFolder,
  getFolderPath,
  supabase,
}

/** Liste les PDFs JacPDF Cloud de l'user. Mêmes args qu'avant. */
export function listFiles({ query, folderId } = {}) {
  return listFilesCore({ sourceType: SOURCE, query, folderId })
}

/** Upload un nouveau PDF dans le cloud user. */
export function uploadNewFile({ name, bytes, folderId = null }) {
  return uploadNewFileCore({ sourceType: SOURCE, name, bytes, folderId })
}

/**
 * Marque un PDF comme annoté (stat « PDF édités »). Spécifique JacPDF.
 * Idempotent côté SQL (ON CONFLICT DO NOTHING).
 */
export async function markPdfEdited(source, externalId) {
  if (!source || !externalId) return
  const { error } = await supabase.rpc('mark_pdf_edited', {
    p_source: source,
    p_external_id: externalId,
  })
  if (error) {
    console.warn('[markPdfEdited] erreur RPC:', error)
    throw new JacpdfCloudError('mark edited failed', { details: error })
  }
}