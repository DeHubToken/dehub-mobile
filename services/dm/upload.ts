import { apiClient } from '../../libs';
import { getFileName, guessMime } from '../../libs/assets.util';

export type RnFile = { uri: string; name: string; type: string };

export type UploadDmMediaParams = {
  conversationId: string;
  senderId: string;
  files: RnFile[]; // send 1 for now
  caption?: string;
  isPaid?: boolean;
  purchaseOptions?: any;
};

export type UploadDmMediaResponse = any; // backend returns created message or an envelope

/**
 * POST /dm/upload endpoint wrapper.
 * Expects multipart FormData with field name 'files' for each file.
 */
export async function uploadDmMedia(params: UploadDmMediaParams): Promise<UploadDmMediaResponse> {
  const { conversationId, senderId, files, caption, isPaid, purchaseOptions } = params;

  const form = new FormData();
  files.forEach((f) => {
    const name = f?.name && String(f.name).trim() ? f.name : getFileName(f.uri, 'file');
    const type = f?.type && String(f.type).includes('/') ? f.type : guessMime(f.uri, 'application/octet-stream');
    form.append('files', { uri: f.uri, name, type } as any);
  });
  form.append('conversationId', String(conversationId));
  form.append('senderId', String(senderId));
  if (caption) form.append('content', caption);
  if (typeof isPaid !== 'undefined') form.append('isPaid', String(!!isPaid));
  if (typeof purchaseOptions !== 'undefined') form.append('purchaseOptions', JSON.stringify(purchaseOptions));

  return apiClient.post<UploadDmMediaResponse>('/dm/upload', form, { isAuthRequired: true });
}
