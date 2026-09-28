import { useLanguage } from '../i18n';
import { useState } from 'react';
import type { ScanResult } from '../lib/ocr';
import { validateCnp } from '../lib/cnp';
import { Icon } from './Icon';

export interface ReviewedDetails { fullName: string; cnp: string; }

export function ReviewForm({ scan, onConfirm }: { scan: ScanResult | null; onConfirm: (details: ReviewedDetails) => void }) {
  const { t, message } = useLanguage();
  const mrzValid = scan?.assessment.mrzValid ?? false;
  const [fullName, setFullName] = useState(mrzValid ? scan?.assessment.fullName ?? '' : '');
  const [cnp, setCnp] = useState(mrzValid ? scan?.assessment.cnp ?? '' : '');
  const [reviewed, setReviewed] = useState(false);
  const validation = validateCnp(cnp);
  const nameEdited = Boolean(scan && fullName !== scan.assessment.fullName);
  const cnpEdited = Boolean(scan && cnp !== (scan.assessment.cnp ?? ''));
  const changed = nameEdited || cnpEdited;
  const expectedSex = /^[1357]/.test(cnp) ? 'M' : /^[2468]/.test(cnp) ? 'F' : null;
  const agreement = Boolean(scan && cnp.slice(1, 7) === scan.assessment.mrzBirthDate && expectedSex !== null && expectedSex === scan.assessment.mrzSex);
  const cnpReady = validation.valid && agreement;
  const allowed = mrzValid && cnpReady && fullName.trim().length >= 3 && reviewed;
  return <form className="review-form" autoComplete="off" onSubmit={(event) => {
    event.preventDefault();
    if (allowed) onConfirm({ fullName: fullName.trim().replace(/\s+/g, ' '), cnp });
  }}>
    <h2>{t("Review your details")}</h2>
    <p className="panel-description">{scan ? mrzValid ? t("Compare every character with your physical card.") : t("The MRZ could not be validated. Try another photo.") : t("Your fields will appear here after reading.")}</p>
    <div className="review-fields">
      <label htmlFor="full-name">{t("Full name")}{nameEdited ? <span className="field-state">{t("Edited by you")}</span> : null}</label>
      <input id="full-name" name="fullName" type="text" autoComplete="off" spellCheck={false} placeholder={t("Appears after reading")} disabled={!mrzValid} value={fullName} maxLength={180} onChange={(event) => { setFullName(event.target.value); setReviewed(false); }} aria-describedby={scan ? 'name-review-hint' : undefined} />
      {scan && mrzValid ? <p id="name-review-hint" className="field-hint">{t("Names have no MRZ checksum. Restore missing accents or a shortened name from your card.")}</p> : null}
      <label htmlFor="cnp">CNP{scan && mrzValid ? <span className={`field-state ${cnpReady ? 'valid' : 'invalid'}`}>{cnpReady ? t("Checksum, date & MRZ agree") : t("Needs correction")}</span> : null}</label>
      <input id="cnp" name="cnp" type="text" inputMode="numeric" autoComplete="off" spellCheck={false} placeholder={t("13-digit personal code")} disabled={!mrzValid} value={cnp} maxLength={13} onChange={(event) => { setCnp(event.target.value); setReviewed(false); }} aria-invalid={Boolean(scan && mrzValid && !cnpReady)} aria-describedby={scan && mrzValid && !cnpReady ? 'cnp-issues' : undefined} />
      {scan && mrzValid && !cnpReady ? <div id="cnp-issues" className="field-error">{validation.issues.map((issue) => <p key={message(issue)}>{message(issue)}</p>)}{validation.valid && !agreement ? <p>{t("The CNP does not agree with the MRZ birth date or sex. Compare it with your card.")}</p> : null}</div> : null}
    </div>
    <p className="review-hint">{t("Always compare these details with your card.")}</p>
    <label className="review-checkbox"><input type="checkbox" checked={reviewed} disabled={!mrzValid || !cnpReady || fullName.trim().length < 3} onChange={(event) => setReviewed(event.target.checked)} /><span>{t("I have checked the name and CNP")}</span></label>
    <button className="button button-primary confirm-button" type="submit" disabled={!allowed}>{t("Use these details")}</button>
    {changed ? <p className="small muted edited-hint"><Icon name="alert" />{t("Your edits need a fresh review. CNP validation checks your edited value.")}</p> : null}
  </form>;
}
