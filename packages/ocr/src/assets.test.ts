import { describe, expect, it } from 'vitest';
import { resolveAssetBase } from './assets';
describe('self-hosted reader assets', () => {
  it('resolves root, Pages and custom directory bases', () => {
    expect(resolveAssetBase({}, 'https://example.test').href).toBe('https://example.test/');
    expect(resolveAssetBase({ assetBaseUrl: '/app/assets' }, 'https://example.test').href).toBe('https://example.test/app/assets/');
    expect(resolveAssetBase({ assetBaseUrl: new URL('https://example.test/assets/') }, 'https://example.test').href).toBe('https://example.test/assets/');
  });
  it.each(['https://other.test/assets/', '//other.test/', 'data:text/plain,hi', 'file:///assets/', 'https://user:pass@example.test/assets/', '/assets/?secret=x', '/assets/#x'])('rejects unsafe base %s', assetBaseUrl => {
    expect(() => resolveAssetBase({ assetBaseUrl }, 'https://example.test')).toThrow();
  });
  it('requires a browser only when resolving assets', () => {
    expect(() => resolveAssetBase()).toThrow('browser origin');
  });
});
