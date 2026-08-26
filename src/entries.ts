// De lo interpretado a lo guardado, y atajos de repetición.
//
// Nada de esto toca la red: `repeatShortcuts` se arma con el snapshot que el
// store ya tiene en memoria, para que la pantalla de registro pueda ofrecer
// "repetir" sin esperar a nadie.

import type { ParsedItem, RepeatShortcut } from "./api";
import { MEALS, type MealId } from "./data/plan";
import { normalizeFoodId } from "./foods";
import {
  addEntries,
  listEntries,
  listLoggedDates,
  lookupFood,
  rememberFood,
} from "./store";
import { entryMacros, type FoodEntry, type FoodMemory } from "./types";

/** Días hacia atrás que se miran para armar atajos. */
const DAYS_BACK = 21;
/** Atajos que se ofrecen como máximo. */
const MAX_SHORTCUTS = 6;
/** Nombres que caben en la etiqueta de un atajo antes de resumir. */
const LABEL_NAMES = 3;

const MEAL_IDS: MealId[] = MEALS.map((meal) => meal.id);

/** uuid v4. `crypto.randomUUID` existe en todo navegador con IndexedDB moderno. */
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Respaldo: 36 caracteres, el máximo que admite el esquema de RxDB.
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${random()}${random()}-${random()}-${random()}-${random()}-${random()}${random()}${random()}`;
}

/* --------------------------------------------------------------- guardar */

/**
 * Convierte lo interpretado en entradas persistibles.
 *
 * `createdAt` lleva el índice sumado: el store ordena las entradas de un día
 * por ese campo y varias entradas guardadas en el mismo milisegundo quedarían
 * en orden indefinido, no en el orden en que el usuario las escribió.
 */
export function toEntries(date: string, meal: MealId, items: ParsedItem[]): FoodEntry[] {
  const now = Date.now();
  return items.map((item, index) => ({
    id: newId(),
    date,
    meal,
    name: item.name.trim(),
    unit: item.unit.trim(),
    qty: item.qty,
    kcalPerUnit: item.kcalPerUnit,
    proteinPerUnit: item.proteinPerUnit,
    fatPerUnit: item.fatPerUnit,
    carbsPerUnit: item.carbsPerUnit,
    portions: { ...item.portions },
    source: item.source,
    createdAt: now + index,
  }));
}

function toMemory(entry: FoodEntry): FoodMemory {
  return {
    id: normalizeFoodId(entry.name),
    name: entry.name,
    unit: entry.unit,
    kcalPerUnit: entry.kcalPerUnit,
    proteinPerUnit: entry.proteinPerUnit,
    fatPerUnit: entry.fatPerUnit,
    carbsPerUnit: entry.carbsPerUnit,
    portions: { ...entry.portions },
    updatedAt: Date.now(),
    useCount: 1,
  };
}

/**
 * Guarda las entradas del día.
 *
 * Las entradas se escriben primero: si recordar falla, el registro del día ya
 * quedó a salvo. `remember` es opt-in — la memoria solo crece cuando el
 * usuario lo pide explícitamente.
 */
export async function commitEntries(entries: FoodEntry[], remember: boolean): Promise<void> {
  if (!entries.length) return;
  await addEntries(entries);
  if (!remember) return;

  const seen = new Set<string>();
  for (const entry of entries) {
    const memory = toMemory(entry);
    // Un mismo alimento repetido en el texto no debe contar dos usos.
    if (!memory.id || seen.has(memory.id)) continue;
    seen.add(memory.id);
    await rememberFood(memory);
  }
}

/* --------------------------------------------------------------- repetir */

function toParsedItem(entry: FoodEntry): ParsedItem {
  return {
    name: entry.name,
    unit: entry.unit,
    qty: entry.qty,
    kcalPerUnit: entry.kcalPerUnit,
    proteinPerUnit: entry.proteinPerUnit,
    fatPerUnit: entry.fatPerUnit,
    carbsPerUnit: entry.carbsPerUnit,
    portions: { ...entry.portions },
    source: entry.source,
  };
}

function label(entries: FoodEntry[]): string {
  const names = entries.map((entry) => entry.name);
  if (names.length <= LABEL_NAMES) return names.join(", ");
  return `${names.slice(0, LABEL_NAMES).join(", ")} +${names.length - LABEL_NAMES}`;
}

/** Dos comidas son "la misma" si traen los mismos alimentos en las mismas cantidades. */
function signature(meal: MealId, entries: FoodEntry[]): string {
  const parts = entries
    .map((entry) => `${normalizeFoodId(entry.name)}:${entry.qty}:${entry.unit}`)
    .sort();
  return `${meal}|${parts.join(",")}`;
}

/**
 * Atajos de repetición del historial reciente. Todo local, sin red.
 *
 * Se ordenan por cuántas veces se repitió esa combinación y, a igualdad, por
 * qué tan reciente es: lo que el usuario come siempre queda arriba.
 */
export function repeatShortcuts(today: string): RepeatShortcut[] {
  const dates = listLoggedDates()
    .filter((date) => date < today)
    .slice(0, DAYS_BACK);

  const groups = new Map<
    string,
    { meal: MealId; label: string; kcal: number; items: ParsedItem[]; count: number; last: string }
  >();

  for (const date of dates) {
    for (const meal of MEAL_IDS) {
      const entries = listEntries(date, meal);
      if (!entries.length) continue;

      const key = signature(meal, entries);
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        // `dates` viene de más reciente a más antiguo, así que `last` ya es el
        // más reciente; no hace falta compararlo.
        continue;
      }

      groups.set(key, {
        meal,
        label: label(entries),
        kcal: Math.round(entries.reduce((sum, entry) => sum + entryMacros(entry).kcal, 0)),
        items: entries.map(toParsedItem),
        count: 1,
        last: date,
      });
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, MAX_SHORTCUTS)
    .map(({ meal, label: text, kcal, items }) => ({ meal, label: text, kcal, items }));
}

/* --------------------------------------------------------------- memoria */

/** Busca un alimento en la memoria por nombre, con la normalización del slug. */
export function memoryFor(name: string): FoodMemory | undefined {
  return lookupFood(normalizeFoodId(name));
}
