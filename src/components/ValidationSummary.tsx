import { useLanguage } from '../i18n';
import type { ScanResult } from '../lib/ocr';
import { Icon } from './Icon';
import { validateCnp } from '../lib/cnp';

export function ValidationSummary({ scan }: { scan: ScanResult }) {
  const { t, message } = useLanguage();
  if (scan.mode === 'printed') {
    const cnpValid = validateCnp(scan.printed?.fields.cnp ?? '').valid;
    return <div className="validation-summary">
      <p className="notice warning">{t("Printed details only")}</p>
      <div className="confidence-row"><span>{t("Printed-text reading score")}</span><strong>{scan.printed?.confidence ?? 0}/100</strong></div>
      <p className="small muted">{t("This score estimates how clearly the text was read. It does not prove the details are correct.")}</p>
      <p>{t("CNP validation")}: {cnpValid ? t("Passed") : t("Needs review")}</p>
      <p>{t("We can read the printed details, but cannot cross-check them against the code rows. Please check every field.")}</p>
    </div>;
  }
  return <div className="validation-summary">
    <div className="confidence-row">
      <span>{t("Reading score")}</span>
      <strong>{Number.isFinite(scan.confidence) ? `${scan.confidence}/100` : t("Unavailable")}</strong>
    </div>
    <p className="small muted">{t("This score estimates how clearly the text was read. It does not prove the details are correct.")}</p>
    {scan.confidence < 85 ? <p className="notice warning"><Icon name="alert" />{t("Low confidence. Retake the photo or compare every character carefully.")}</p> : null}
    <div className="validation-overview" aria-label={t("Original reading validation")}>
      <p className={scan.assessment.mrzValid ? 'checked' : 'needs-review'}><Icon name={scan.assessment.mrzValid ? 'check' : 'alert'} /><span>{t("Code-row checks")}</span><strong>{scan.assessment.mrzValid ? t("Passed") : t("Failed")}</strong></p>
      <p className={scan.assessment.valid ? 'checked' : 'needs-review'}><Icon name={scan.assessment.valid ? 'check' : 'alert'} /><span>{t("CNP validation")}</span><strong>{scan.assessment.valid ? t("Passed") : t("Needs review")}</strong></p>
    </div>
    {scan.printed ? <p className="small muted">{t("Printed-text reading score")}: {scan.printed.confidence}/100</p> : null}
    {scan.printedError ? <p className="notice warning">{t("Printed details could not be read. They remain blank.")}</p> : null}
    <p className="small muted">{t("You can see the detailed checks below. Compare all filled fields with your card.")}</p>
    <details className="validation-details">
      <summary>{t("View all validation checks")}</summary>
      <p className="small muted">{t("These checks describe the original reading. Edited details are checked in the review form.")}</p>
    <ul className="validation-list" aria-label={t("Validation results")}>
      {scan.assessment.checks.map((check, index) => <li key={`${message(check.label)}-${index}`} className={`validation-${check.status}`}>
        <span className="validation-icon"><Icon name={check.status === 'pass' ? 'check' : 'alert'} /></span>
        <span>{message(check.label)}{check.detail ? <small>{message(check.detail)}</small> : null}</span>
        <span className="validation-state">{check.status === 'pass' ? t("Passed") : check.status === 'fail' ? t("Failed") : t("Review")}</span>
      </li>)}
    </ul>
    {scan.assessment.issues.length ? <div className="notice warning" role="alert"><div>{scan.assessment.issues.map((issue) => <p key={message(issue)}>{message(issue)}</p>)}</div></div> : null}
    {scan.assessment.warnings.length ? <div className="validation-warnings">{scan.assessment.warnings.map((warning) => <p key={message(warning)}>{message(warning)}</p>)}</div> : null}
    </details>
  </div>;
}
