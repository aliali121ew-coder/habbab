import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="modal" aria-label={title} onClose={onClose}>
      <header className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="إغلاق" onClick={() => ref.current?.close()}>
          <X size={20} aria-hidden />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
