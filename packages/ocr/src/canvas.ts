/** Reject malformed JS inputs before accepting ownership or changing reader state. */
export function assertCanvas(value: unknown): asserts value is HTMLCanvasElement {
  if (!value || typeof value !== 'object' ||
    !('toDataURL' in value) || typeof value.toDataURL !== 'function' ||
    !('getContext' in value) || typeof value.getContext !== 'function' ||
    !('width' in value) || !Number.isSafeInteger(value.width) || (value.width as number) < 1 ||
    !('height' in value) || !Number.isSafeInteger(value.height) || (value.height as number) < 1 ||
    (value.width as number) * (value.height as number) > 40_000_000) {
    throw new Error('Supply a nonempty canvas of at most 40 megapixels.');
  }
}
