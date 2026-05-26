import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Standard shadcn helper. Merges Tailwind class names safely (handles
 * conflicting utilities by keeping the last one).
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
