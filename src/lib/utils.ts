import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 5=Fri

  if (hour >= 5 && hour < 12) {
    if (day === 1) return "Monday. Set your priorities for the week.";
    return "Good morning. Let's focus.";
  }
  if (hour >= 12 && hour < 17) {
    return "Good afternoon. Keep the momentum.";
  }
  if (hour >= 17 && hour < 22) {
    if (day === 5) return "Friday evening. Migrate before the weekend.";
    return "Good evening. Time to wind down.";
  }
  return "It's late. No pressure.";
}

export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getTerminalPrompt(): string {
  if (typeof window === 'undefined' || !window.localStorage) return 'user@bujo.vault';
  return window.localStorage.getItem('bujo:username') || 'user@bujo.vault';
}
