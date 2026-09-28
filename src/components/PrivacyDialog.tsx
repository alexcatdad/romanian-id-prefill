import { useLanguage } from '../i18n';
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog className="privacy-dialog" ref={dialog} onCancel={onClose}>
    <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label={t("Close privacy information")}><Icon name="close" /></button>
    <Icon name="shield" className="privacy-symbol" />
    <h2>{t("Read on this device")}</h2>
    <p>{t("The PDF and OCR readers, models, and fonts load from this website before you choose a file. Your PDF, ID image, cropped image, and OCR result stay in browser memory.")}</p>
    <p>{t("The reader makes no network requests while reading. Its OCR workers stop and temporary images are cleared after each reading, including failed readings. Other parts of this website have their own privacy practices.")}</p>
    <p>{t("We read the visible details and check the selected code rows separately. Temporary reading data is cleared afterward.")}</p>
    <p>{t("PDFs are rendered locally without opening links, attachments, forms, or scripts. The PDF reader and document are discarded when you select a page or cancel.")}</p>
    <p>{t("The reader keeps editable fields in memory until cleared or closed. When you confirm, it passes the reviewed details to this app. The app decides whether to keep or send those details; clearing the reader does not erase copies held by the app.")}</p>
    <p>{t("The hosting provider may log website visits, including IP addresses. Browser extensions and your device are outside the reader’s control. Clearing temporary data does not guarantee forensic memory erasure.")}</p>
    <button type="button" className="button button-primary" onClick={onClose}>{t("Got it")}</button>
  </dialog>;
}
