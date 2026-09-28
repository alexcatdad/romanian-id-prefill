import { useLanguage } from '../i18n';
import { useState } from 'react';
import type { ScanResult } from '../lib/ocr';
import { validateCnp } from '../lib/cnp';
import { useIdCopy, type IdCopy } from '../id-copy';
import type { PrintedIdFields } from '../lib/printed-id';
import { Icon } from './Icon';

export interface ReviewedDetails { fullName: string; cnp: string; documentSeries?: string; documentNumber?: string; cardType?: PrintedIdFields['cardType']; address?: PrintedIdFields['address']; provenance?: 'mrz-reviewed' | 'printed-reviewed'; }
const addressLabels = { raw: 'Printed address', county: 'County', village: 'Village', sector: 'Sector', locality: 'Locality', street: 'Street', number: 'Street number', block: 'Block', staircase: 'Staircase', floor: 'Floor', apartment: 'Apartment' } as const;

export function ReviewForm({ scan, onConfirm }: { scan: ScanResult | null; onConfirm: (details: ReviewedDetails) => void }) {
  const { t, message } = useLanguage();
  const copy = useIdCopy();
  const printedOnly = scan?.mode === 'printed';
  const fields = scan?.printed?.fields;
  const editable = Boolean(scan && (printedOnly || scan.assessment.mrzValid));
  const mrzValid = scan?.assessment.mrzValid ?? false;
  const [fullName, setFullName] = useState(mrzValid ? scan?.assessment.fullName ?? '' : printedOnly ? fields?.fullName ?? '' : '');
  const [cnp, setCnp] = useState(mrzValid ? scan?.assessment.cnp ?? fields?.cnp ?? '' : printedOnly ? fields?.cnp ?? '' : '');
  const [cardType, setCardType] = useState<PrintedIdFields['cardType']>(fields?.cardType ?? 'unknown');
  const [documentSeries, setDocumentSeries] = useState((mrzValid ? scan?.assessment.documentSeries : null) ?? fields?.documentSeries ?? '');
  const [documentNumber, setDocumentNumber] = useState((mrzValid ? scan?.assessment.documentNumber : null) ?? fields?.documentNumber ?? '');
  const [address, setAddress] = useState<NonNullable<PrintedIdFields['address']>>(fields?.address ?? { raw: '' });
  const [detailsEdited, setDetailsEdited] = useState(false);
  const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const conflicts = mrzValid ? [
    ['Full name', scan?.assessment.fullName, fields?.fullName],
    ['CNP', scan?.assessment.cnp, fields?.cnp],
    ['Document series', scan?.assessment.documentSeries, fields?.documentSeries],
    ['Document number', scan?.assessment.documentNumber, fields?.documentNumber],
  ].filter((entry) => entry[1] && entry[2] && normalized(entry[1]) !== normalized(entry[2])) : [];
  const [reviewed, setReviewed] = useState(false);
  const validation = validateCnp(cnp);
  const nameEdited = Boolean(scan && fullName !== (mrzValid ? scan.assessment.fullName : fields?.fullName ?? ''));
  const cnpEdited = Boolean(scan && cnp !== (mrzValid ? scan.assessment.cnp ?? fields?.cnp ?? '' : fields?.cnp ?? ''));
  const changed = nameEdited || cnpEdited || detailsEdited;
  const expectedSex = /^[1357]/.test(cnp) ? 'M' : /^[2468]/.test(cnp) ? 'F' : null;
  const agreement = Boolean(scan && cnp.slice(1, 7) === scan.assessment.mrzBirthDate && expectedSex !== null && expectedSex === scan.assessment.mrzSex);
  const cnpReady = validation.valid && (printedOnly || agreement);
  const allowed = editable && cnpReady && fullName.trim().length >= 3 && reviewed;
  return <form className="review-form" autoComplete="off" onSubmit={(event) => {
    event.preventDefault();
    if (allowed) onConfirm({ fullName: fullName.trim().replace(/\s+/g, ' '), cnp, documentSeries: documentSeries.trim() || undefined, documentNumber: documentNumber.trim() || undefined, cardType, address: Object.values(address).some((value) => value?.trim()) ? Object.fromEntries(Object.entries(address).map(([key, value]) => [key, value?.trim()])) as PrintedIdFields['address'] : undefined, provenance: printedOnly ? 'printed-reviewed' : 'mrz-reviewed' });
  }}>
    <h2>{t("Review your details")}</h2>
    <p className="panel-description">{scan ? printedOnly ? copy('Printed-text reading only. MRZ structure and check digits were not verified.') : mrzValid ? t("Compare every character with your physical card.") : t("The MRZ could not be validated. Try another photo.") : t("Your fields will appear here after reading.")}</p>
    <div className="review-fields">
      <label htmlFor="full-name">{t("Full name")}{nameEdited ? <span className="field-state">{t("Edited by you")}</span> : null}</label>
      <input id="full-name" name="fullName" type="text" autoComplete="off" spellCheck={false} placeholder={t("Appears after reading")} disabled={!editable} value={fullName} maxLength={180} onChange={(event) => { setFullName(event.target.value); setReviewed(false); }} aria-describedby={scan ? 'name-review-hint' : undefined} />
      {scan && mrzValid ? <p id="name-review-hint" className="field-hint">{t("Names have no MRZ checksum. Restore missing accents or a shortened name from your card.")}</p> : null}
      <label htmlFor="cnp">CNP{scan && editable ? <span className={`field-state ${cnpReady ? 'valid' : 'invalid'}`}>{cnpReady ? printedOnly ? copy("CNP checksum and date passed; no MRZ comparison") : t("Checksum, date & MRZ agree") : t("Needs correction")}</span> : null}</label>
      <input id="cnp" name="cnp" type="text" inputMode="numeric" autoComplete="off" spellCheck={false} placeholder={t("13-digit personal code")} disabled={!editable} value={cnp} maxLength={13} onChange={(event) => { setCnp(event.target.value); setReviewed(false); }} aria-invalid={Boolean(scan && editable && !cnpReady)} aria-describedby={scan && editable && !cnpReady ? 'cnp-issues' : undefined} />
      {scan && editable && !cnpReady ? <div id="cnp-issues" className="field-error">{validation.issues.map((issue) => <p key={message(issue)}>{message(issue)}</p>)}{validation.valid && !printedOnly && !agreement ? <p>{t("The CNP does not agree with the MRZ birth date or sex. Compare it with your card.")}</p> : null}</div> : null}
    </div>
    {scan?.printed ? <p className="field-hint">{copy('Printed-text confidence')}: {Math.round(scan.printed.confidence)}%. {copy('Candidate — check against your card')}</p> : null}
    {scan?.printedError ? <p role="status">{copy('The printed details could not be read. Enter missing details from your card or try another image.')}</p> : null}
    {conflicts.length ? <div className="field-error"><p>{copy('Different readings — compare both with your card before confirming.')}</p>{conflicts.map(([label, mrz, printed]) => <p key={label}>{label === 'Full name' ? t('Full name') : label === 'CNP' ? 'CNP' : copy(label as IdCopy)}: {copy('MRZ')} {mrz}; {copy('Printed text')} {printed}</p>)}</div> : null}
    {scan ? <fieldset disabled={!editable} className="review-fields"><legend>{copy('ID details')}</legend>
      <label htmlFor="card-type">{copy('Card type')}</label><select id="card-type" value={cardType} onChange={(event) => { setCardType(event.target.value as PrintedIdFields['cardType']); setDetailsEdited(true); setReviewed(false); }}><option value="unknown">{copy('Unknown')}</option><option value="CI">CI</option><option value="CEI">CEI</option><option value="CIS">CIS</option></select>
      {([['Document series', documentSeries, setDocumentSeries], ['Document number', documentNumber, setDocumentNumber]] as const).map(([label, value, setter]) => <div key={label}><label htmlFor={label}>{copy(label)}</label><input id={label} autoComplete="off" spellCheck={false} value={value} maxLength={30} placeholder={copy('Not read — optional manual entry')} onChange={(event) => { setter(event.target.value); setDetailsEdited(true); setReviewed(false); }} /><p className="field-hint">{value ? copy('Candidate — check against your card') : copy('Not read — optional manual entry')}</p></div>)}
      <p className="field-hint">{copy('Address may be absent from the card, especially on CEI. Do not infer an address from the CNP.')}</p>
      <div><label htmlFor="address-raw">{copy('Printed address')}</label><textarea id="address-raw" autoComplete="off" rows={3} value={address.raw} maxLength={500} placeholder={copy('Not read — optional manual entry')} onChange={(event) => { setAddress({ raw: event.target.value }); setDetailsEdited(true); setReviewed(false); }} /><p className="field-hint">{copy('Changing the address text clears its components. Review or complete the breakdown separately.')}</p></div>
      <details><summary>{copy('Address components')}</summary><p className="field-hint">{copy('Changing a component clears the full address text to avoid conflicting values.')}</p>{(Object.keys(addressLabels).filter((key) => key !== 'raw') as Array<keyof typeof addressLabels>).map((key) => <div key={key}><label htmlFor={`address-${key}`}>{copy(addressLabels[key])}</label><input id={`address-${key}`} autoComplete="off" value={address[key] ?? ''} maxLength={120} placeholder={copy('Not read — optional manual entry')} onChange={(event) => { setAddress({ ...address, raw: '', [key]: event.target.value }); setDetailsEdited(true); setReviewed(false); }} /></div>)}</details>
    </fieldset> : null}
    <p className="review-hint">{copy('Review every populated field, including document and address details, before confirming. Empty fields remain unknown.')}</p>
    <p className="review-hint">{t("Always compare these details with your card.")}</p>
    <label className="review-checkbox"><input type="checkbox" checked={reviewed} disabled={!editable || !cnpReady || fullName.trim().length < 3} onChange={(event) => setReviewed(event.target.checked)} /><span>{copy('I have checked all populated ID details')}</span></label>
    <button className="button button-primary confirm-button" type="submit" disabled={!allowed}>{t("Use these details")}</button>
    {changed ? <p className="small muted edited-hint"><Icon name="alert" />{t("Your edits need a fresh review. CNP validation checks your edited value.")}</p> : null}
  </form>;
}
