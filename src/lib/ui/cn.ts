import clsx, { type ClassValue } from "clsx";

/** Merge conditionnel de classes Tailwind (helper unique du DS MySwarms). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
