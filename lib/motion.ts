/**
 * Motion utilities and prefers-reduced-motion helper.
 * Aligned with GSAP 3.15+ and Chrome Modern Web Guidance.
 */

export const isReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Collapses durations to 0 when reduced motion is requested,
 * preserving layout and event completion callbacks.
 */
export const $ = (duration: number): number =>
  isReducedMotion() ? 0 : duration;
