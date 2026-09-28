import type { ScanResult } from '../lib/ocr';
import { Icon } from './Icon';

export function ValidationSummary({ scan }: { scan: ScanResult }) {
  return <div className="validation-summary">
    <div className="confidence-row">
      <span>OCR confidence</span>
      <strong>{Number.isFinite(scan.confidence) ? `${scan.confidence}/100` : 'Unavailable'}</strong>
    </div>
    <p className="small muted">An OCR estimate, not a probability that your details are correct.</p>
    {scan.confidence < 85 ? <p className="notice warning"><Icon name="alert" />Low confidence. Retake the photo or compare every character carefully.</p> : null}
    <div className="validation-overview" aria-label="Original reading validation">
      <p className={scan.assessment.mrzValid ? 'checked' : 'needs-review'}><Icon name={scan.assessment.mrzValid ? 'check' : 'alert'} /><span>MRZ checks</span><strong>{scan.assessment.mrzValid ? 'Passed' : 'Failed'}</strong></p>
      <p className={scan.assessment.valid ? 'checked' : 'needs-review'}><Icon name={scan.assessment.valid ? 'check' : 'alert'} /><span>CNP validation</span><strong>{scan.assessment.valid ? 'Passed' : 'Needs review'}</strong></p>
    </div>
    <details className="validation-details">
      <summary>View all validation checks</summary>
      <p className="small muted">These checks describe the original reading. Edited details are checked in the review form.</p>
    <ul className="validation-list" aria-label="Validation results">
      {scan.assessment.checks.map((check, index) => <li key={`${check.label}-${index}`} className={`validation-${check.status}`}>
        <span className="validation-icon"><Icon name={check.status === 'pass' ? 'check' : 'alert'} /></span>
        <span>{check.label}{check.detail ? <small>{check.detail}</small> : null}</span>
        <span className="validation-state">{check.status === 'pass' ? 'Passed' : check.status === 'fail' ? 'Failed' : 'Review'}</span>
      </li>)}
    </ul>
    </details>
    {scan.assessment.issues.length ? <div className="notice warning" role="alert"><div>{scan.assessment.issues.map((issue) => <p key={issue}>{issue}</p>)}</div></div> : null}
    {scan.assessment.warnings.length ? <div className="validation-warnings">{scan.assessment.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
  </div>;
}
