import { useCallback, useSyncExternalStore } from "react";
import type { Observable } from "rxjs";
import type { CategoryId, MealId } from "./data/plan";
import { getDb } from "./db";
import {
  DEFAULT_SETTINGS,
  entryPortionsOf,
  sumMacros,
  type DayLog,
  type FoodEntry,
  type FoodMemory,
  type Macros,
  type Settings,
} from "./types";

// Se re-exporta para no romper los imports existentes (`adherence.ts` y las
// vistas ya importaban `DayLog` desde aquí).
export type { DayLog, FoodEntry, FoodMemory, Settings } from "./types";

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
 * Espejo síncrono de la base, alimentado por las suscripciones de RxDB.
 * Los documentos son pequeños y pocos, así que caben de sobra en memoria; a
 * cambio las vistas y el cálculo de rachas siguen siendo síncronos.
 */
let daySnapshot = new Map<string, DayLog>();
/** Entradas agrupadas por fecha, en orden de registro. */
let entriesByDate = new Map<string, FoodEntry[]>();
let entryById = new Map<string, FoodEntry>();
let foodSnapshot = new Map<string, FoodMemory>();
let settingsSnapshot: Settings = DEFAULT_SETTINGS;

/** Suscribe una colección y resuelve en su primera emisión. */
function firstEmission<T>(observable: Observable<T>, apply: (value: T) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let ready = false;
    observable.subscribe({
      next: (value) => {
        apply(value);
        notify();
        if (!ready) {
          ready = true;
          resolve();
        }
      },
      error: reject,
    });
  });
}

/** Abre la base y deja los snapshots listos antes del primer render. */
export function initStore(): Promise<void> {
  return getDb()
    .then((db) =>
      Promise.all([
        firstEmission(db.days.find().$, (docs) => {
          daySnapshot = new Map(docs.map((doc) => [doc.date, doc.toMutableJSON()]));
        }),
        firstEmission(db.entries.find().$, (docs) => {
          const byDate = new Map<string, FoodEntry[]>();
          const byId = new Map<string, FoodEntry>();
          for (const doc of docs) {
            const entry = doc.toMutableJSON() as FoodEntry;
            byId.set(entry.id, entry);
            const list = byDate.get(entry.date);
            if (list) list.push(entry);
            else byDate.set(entry.date, [entry]);
          }
          for (const list of byDate.values()) list.sort((a, b) => a.createdAt - b.createdAt);
          entriesByDate = byDate;
          entryById = byId;
        }),
        firstEmission(db.foods.find().$, (docs) => {
          foodSnapshot = new Map(docs.map((doc) => [doc.id, doc.toMutableJSON() as FoodMemory]));
        }),
        firstEmission(db.settings.find().$, (docs) => {
          const doc = docs.find((d) => d.id === "user");
          settingsSnapshot = doc ? (doc.toMutableJSON() as Settings) : DEFAULT_SETTINGS;
        }),
      ])
    )
    .then(() => undefined);
}

/* ------------------------------------------------------------------ días */

export function loadDay(date: string): DayLog {
  return daySnapshot.get(date) ?? emptyDay(date);
}

/** Fechas con algo registrado, sea porciones manuales o alimentos. */
export function listLoggedDates(): string[] {
  const dates = new Set([...daySnapshot.keys(), ...entriesByDate.keys()]);
  return [...dates].sort().reverse();
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

/** Re-renderiza cuando cambia cualquier cosa guardada. */
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

/** Porciones de una categoría tocadas a mano en un día. */
export function mealTotal(log: DayLog, cat: CategoryId): number {
  let sum = 0;
  for (const mealLog of Object.values(log.meals)) sum += mealLog[cat] ?? 0;
  return sum;
}

/* -------------------------------------------------------------- alimentos */

export function listEntries(date: string, meal?: MealId): FoodEntry[] {
  const all = entriesByDate.get(date) ?? [];
  return meal ? all.filter((e) => e.meal === meal) : all;
}

export function getEntry(id: string): FoodEntry | undefined {
  return entryById.get(id);
}

/** Totales de kcal y macros de un día. */
export function dayMacros(date: string): Macros {
  return sumMacros(entriesByDate.get(date) ?? []);
}

/**
 * Porciones CLIDDI que aportan los alimentos de un día en una categoría.
 *
 * Un mismo alimento puede sumar a varios grupos (un handroll aporta POA y
 * cereales), así que se recorren todos, no solo los de categoría coincidente.
 */
export function entryPortionsFor(date: string, cat: CategoryId): number {
  let sum = 0;
  for (const entry of entriesByDate.get(date) ?? []) {
    sum += entryPortionsOf(entry, cat);
  }
  return sum;
}

export async function addEntries(entries: FoodEntry[]): Promise<void> {
  if (!entries.length) return;
  const { entries: collection } = await getDb();
  await collection.bulkInsert(entries);
}

export async function updateEntry(id: string, patch: Partial<FoodEntry>): Promise<void> {
  const { entries } = await getDb();
  const doc = await entries.findOne(id).exec();
  if (doc) await doc.incrementalModify((data) => ({ ...data, ...patch }));
}

export async function removeEntry(id: string): Promise<void> {
  const { entries } = await getDb();
  const doc = await entries.findOne(id).exec();
  if (doc) await doc.remove();
}

export async function removeEntries(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => removeEntry(id)));
}

/* --------------------------------------------------------------- memoria */

export function listMemory(): FoodMemory[] {
  return [...foodSnapshot.values()].sort((a, b) => b.useCount - a.useCount);
}

export function lookupFood(id: string): FoodMemory | undefined {
  return foodSnapshot.get(id);
}

export async function rememberFood(food: FoodMemory): Promise<void> {
  const { foods } = await getDb();
  const doc = await foods.findOne(food.id).exec();
  if (doc) {
    await doc.incrementalModify((data) => ({
      ...data,
      ...food,
      useCount: data.useCount + 1,
      updatedAt: Date.now(),
    }));
  } else {
    await foods.insert(food);
  }
}

export async function forgetFood(id: string): Promise<void> {
  const { foods } = await getDb();
  const doc = await foods.findOne(id).exec();
  if (doc) await doc.remove();
}

/* ----------------------------------------------------------------- metas */

export function getSettings(): Settings {
  return settingsSnapshot;
}

export async function saveSettings(patch: Partial<Omit<Settings, "id">>): Promise<void> {
  const { settings } = await getDb();
  const doc = await settings.findOne("user").exec();
  if (doc) await doc.incrementalModify((data) => ({ ...data, ...patch }));
  else await settings.insert({ ...DEFAULT_SETTINGS, ...patch });
}
