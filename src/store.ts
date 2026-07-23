import { useCallback, useSyncExternalStore } from "react";
import type { CategoryId, MealId } from "./data/plan";

export interface DayLog {
  date: string; // YYYY-MM-DD
  meals: Partial<Record<MealId, Partial<Record<CategoryId, number>>>>;
  waterMl: number;
}

const PREFIX = "midieta:day:";

export function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyDay(date: string): DayLog {
  return { date, meals: {}, waterMl: 0 };
}

export function loadDay(date: string): DayLog {
  try {
    const raw = localStorage.getItem(PREFIX + date);
    if (raw) return { ...emptyDay(date), ...JSON.parse(raw) };
  } catch {
    // datos corruptos: empezar el día en blanco
  }
  return emptyDay(date);
}

export function listLoggedDates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) dates.push(key.slice(PREFIX.length));
  }
  return dates.sort().reverse();
}

const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function saveDay(log: DayLog) {
  localStorage.setItem(PREFIX + log.date, JSON.stringify(log));
  notify();
}

/** Re-renderiza cuando cambia cualquier día guardado. */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

export function useDayActions(date: string) {
  const adjust = useCallback(
    (meal: MealId, cat: CategoryId, delta: number) => {
      const log = loadDay(date);
      const mealLog = { ...(log.meals[meal] ?? {}) };
      const next = Math.max(0, (mealLog[cat] ?? 0) + delta);
      if (next === 0) delete mealLog[cat];
      else mealLog[cat] = next;
      saveDay({ ...log, meals: { ...log.meals, [meal]: mealLog } });
    },
    [date]
  );

  const adjustWater = useCallback(
    (deltaMl: number) => {
      const log = loadDay(date);
      saveDay({ ...log, waterMl: Math.max(0, log.waterMl + deltaMl) });
    },
    [date]
  );

  return { adjust, adjustWater };
}

export function mealTotal(log: DayLog, cat: CategoryId): number {
  let sum = 0;
  for (const mealLog of Object.values(log.meals)) sum += mealLog[cat] ?? 0;
  return sum;
}
