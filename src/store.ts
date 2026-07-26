import { useCallback, useSyncExternalStore } from "react";
import type { CategoryId, MealId } from "./data/plan";
import { getDb } from "./db";

export interface DayLog {
  date: string; // YYYY-MM-DD
  meals: Partial<Record<MealId, Partial<Record<CategoryId, number>>>>;
  waterMl: number;
}

export function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyDay(date: string): DayLog {
  return { date, meals: {}, waterMl: 0 };
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

/**
 * Espejo síncrono de la colección, alimentado por la suscripción de RxDB.
 * Los días son documentos pequeños y son pocos, así que caben de sobra en
 * memoria; a cambio las vistas y el cálculo de rachas siguen siendo síncronos.
 */
let snapshot = new Map<string, DayLog>();

/** Abre la base y deja el snapshot listo antes del primer render. */
export function initStore(): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        let ready = false;
        db.days.find().$.subscribe({
          next: (docs) => {
            snapshot = new Map(docs.map((doc) => [doc.date, doc.toMutableJSON()]));
            notify();
            if (!ready) {
              ready = true;
              resolve();
            }
          },
          error: reject,
        });
      })
  );
}

export function loadDay(date: string): DayLog {
  return snapshot.get(date) ?? emptyDay(date);
}

export function listLoggedDates(): string[] {
  return [...snapshot.keys()].sort().reverse();
}

/**
 * Cola de escritura por fecha: los toques rápidos en "+" se solaparían y
 * darían conflictos (409) o incrementos perdidos si corrieran en paralelo.
 * `mutate` recibe siempre el estado más reciente del documento y devuelve uno
 * nuevo — nunca muta el argumento (en dev RxDB congela los objetos).
 */
const queues = new Map<string, Promise<unknown>>();

function mutateDay(date: string, mutate: (log: DayLog) => DayLog): Promise<void> {
  const run = async () => {
    const { days } = await getDb();
    const doc = await days.findOne(date).exec();
    if (doc) await doc.incrementalModify((data) => mutate(data));
    else await days.insert(mutate(emptyDay(date)));
  };
  const next = (queues.get(date) ?? Promise.resolve()).then(run, run);
  queues.set(date, next);
  return next;
}

export function saveDay(log: DayLog): Promise<void> {
  return mutateDay(log.date, (prev) => ({ ...prev, ...log }));
}

/** Re-renderiza cuando cambia cualquier día guardado. */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

export function useDayActions(date: string) {
  const adjust = useCallback(
    (meal: MealId, cat: CategoryId, delta: number) => {
      void mutateDay(date, (log) => {
        const mealLog = { ...(log.meals[meal] ?? {}) };
        const next = Math.max(0, (mealLog[cat] ?? 0) + delta);
        if (next === 0) delete mealLog[cat];
        else mealLog[cat] = next;
        return { ...log, meals: { ...log.meals, [meal]: mealLog } };
      });
    },
    [date]
  );

  const adjustWater = useCallback(
    (deltaMl: number) => {
      void mutateDay(date, (log) => ({
        ...log,
        waterMl: Math.max(0, log.waterMl + deltaMl),
      }));
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
