/** Directory containing the self-hosted ocr/ and pdf/ asset directories. */
export interface ReaderOptions { assetBaseUrl?: string | URL; }

/** Resolve at preparation time so importing the package is safe during SSR. */
export function resolveAssetBase(options: ReaderOptions = {}, origin?: string): URL {
  const pageOrigin = origin ?? (typeof location !== 'undefined' ? location.origin : undefined);
  if (!pageOrigin) throw new Error('Local readers require a browser origin.');
  const page = new URL(pageOrigin);
  const base = new URL(options.assetBaseUrl ?? '/', page);
  if (!['https:', 'http:'].includes(base.protocol) || base.origin !== page.origin || base.username || base.password || base.search || base.hash) {
    throw new Error('Reader assets must use a same-origin HTTP(S) directory without credentials, query or fragment.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return base;
}
