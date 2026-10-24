/** A provider's billing lock is separate from the customer's payment or login. */
export function isImageProviderUnavailable(message: unknown, code?: unknown): boolean {
  return code === 'IMAGE_PROVIDER_UNAVAILABLE' || (typeof message === 'string'
    && /TOP_UP|User is locked|Image generation failed \((?:401|402|403)\)/i.test(message));
}
