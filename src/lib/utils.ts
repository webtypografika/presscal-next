// Utility functions

import { type ClassValue, clsx } from 'clsx';

/**
 * Merge Tailwind classes safely (like shadcn/ui cn())
 * Install clsx: npm install clsx
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format currency for Greek market
 */
export function formatEUR(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format number for Greek locale
 */
export function formatNumber(n: number, decimals = 2): string {
  return new Intl.NumberFormat('el-GR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/**
 * Format date for Greek locale
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('el-GR', options ?? {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}
