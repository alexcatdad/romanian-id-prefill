import { useLanguage } from '../i18n';
import { useIdCopy } from '../id-copy';
import type { ReviewedDetails } from './ReviewForm';
/** Shows only reviewed ID data; blank values stay explicitly unknown. */
export function IdDetails({ details }: { details: ReviewedDetails }) {
  const copy = useIdCopy();
  const { t } = useLanguage();
  return <section><h3>{copy('ID details')}</h3><p className="field-hint">{copy('Document and address details are reviewed candidates; no authenticity check is performed.')}</p><dl>
    <dt>{t('Full name')}</dt><dd>{details.fullName}</dd>
    <dt>CNP</dt><dd>{details.cnp}</dd>
    <dt>{copy('Card type')}</dt><dd>{details.cardType && details.cardType !== 'unknown' ? details.cardType : copy('Unknown')}</dd>
    <dt>{copy('Document series')}</dt><dd>{details.documentSeries || copy('Not provided')}</dd>
    <dt>{copy('Document number')}</dt><dd>{details.documentNumber || copy('Not provided')}</dd>
    <dt>{copy('Printed address')}</dt><dd>{details.address?.raw || copy('Not provided')}</dd>
    {(['county', 'village', 'sector', 'locality', 'street', 'number', 'block', 'staircase', 'floor', 'apartment'] as const).map((key) => details.address?.[key] ? <div key={key}><dt>{copy(({ county: 'County', village: 'Village', sector: 'Sector', locality: 'Locality', street: 'Street', number: 'Street number', block: 'Block', staircase: 'Staircase', floor: 'Floor', apartment: 'Apartment' } as const)[key])}</dt><dd>{details.address[key]}</dd></div> : null)}
  </dl></section>;
}
