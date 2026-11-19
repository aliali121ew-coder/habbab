import { useState, type ChangeEvent } from 'react';
import { api } from '../../api';

// The delegate's photo: a chosen file (or the current photo) goes to the framer first; what the
// framer returns is the square that is uploaded.
export function useDelegatePhoto(onChanged: () => void) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [framing, setFraming] = useState<Blob | null>(null);

  const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadError('');
    setFraming(file);
  };

  // Re-frame the photo already saved, without choosing it again.
  const reframe = async (avatarUrl: string) => {
    setUploadError('');
    try {
      const response = await fetch(avatarUrl);
      if (!response.ok) throw new Error();
      setFraming(await response.blob());
    } catch {
      setUploadError('تعذّر فتح الصورة الحالية');
    }
  };

  // Called by the framer with the square to save; errors are thrown back so the framer shows them.
  const uploadFramed = async (delegateId: number, framed: Blob) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('image', framed, 'image');
      await api(`/collections/delegates/${delegateId}/photo`, { method: 'POST', form });
      setFraming(null);
      onChanged();
    } finally {
      setUploading(false);
    }
  };

  return { uploading, uploadError, framing, pickPhoto, reframe, uploadFramed, cancelFraming: () => setFraming(null) };
}
