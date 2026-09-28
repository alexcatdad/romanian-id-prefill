import { useLanguage } from '../i18n';
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog className="privacy-dialog" ref={dialog} onCancel={onClose}>
    <button className="icon-button dialog-close" onClick={onClose} aria-label={t("Close privacy information")}><Icon name="close" /></button>
    <Icon name="shield" className="privacy-symbol" />
    <h2>{t("Only on this device")}</h2>
    <p>{t("The PDF and OCR readers, models, and fonts load from this website before you choose a file. Your PDF, ID image, cropped image, and OCR result stay in browser memory.")}</p>
    <p>{t("Reading makes no network requests. There is no upload endpoint, analytics, account, or saved history. The OCR worker is terminated and image canvases are cleared after each reading, including failed readings.")}</p>
    <p>{t("We read the visible details and check the selected code rows separately. Temporary reading data is cleared afterward.")}</p>
    <p>{t("PDFs are rendered locally without opening links, attachments, forms, or scripts. The PDF reader and document are discarded when you select a page or cancel.")}</p>
    <p>{t("Your editable fields stay only in this tab until you clear them or leave. The app never writes them to browser storage, your clipboard, a download, or a server.")}</p>
    <p>{t("The hosting provider (GitHub Pages or Vercel) may log normal website visits, including IP addresses. Browser extensions, your operating system, and a compromised device are outside this app’s control. Clearing references is not a promise of forensic memory erasure.")}</p>
    <button className="button button-primary" onClick={onClose}>{t("Got it")}</button>
  </dialog>;
}
