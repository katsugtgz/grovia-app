/**
 * Global toast notification event dispatcher.
 */
export function triggerToast(message: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('grovia:toast', { detail: message }));
  }
}
