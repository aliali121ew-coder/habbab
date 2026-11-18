import { useState, type ChangeEvent } from 'react';
import { api } from '../../api';
import { compressAvatar } from '../../image';

export function useDelegatePhoto(onChanged: () => void) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const changePhoto = async (delegateId: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.set('image', await compressAvatar(file), 'image');
      await api(`/collections/delegates/${delegateId}/photo`, { method: 'POST', form });
      onChanged();
    } catch (failure) {
      setUploadError((failure as Error).message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return { uploading, uploadError, changePhoto };
}
