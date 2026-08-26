// Tipos compartidos entre la base, el store y las vistas.
//
// Viven aquí y no en `store.ts` para romper el ciclo que existía: `db.ts`
// importaba `DayLog` desde `store.ts` y `store.ts` importaba `getDb` desde
// `db.ts`. Con una sola colección el ciclo solo existía en tipos y se borraba
// al compilar; con cuatro colecciones se vuelve frágil.

import type { CategoryId, MealId } from "./data/plan";

/** Qué tan confiable es un valor nutricional. */
export type Certainty =
  /** Viene de la memoria del usuario: es su dato, exacto. */
  | "recordado"
  /** El modelo lo tomó de una base genérica. */
  | "estimado"
  /** El modelo adivinó la cantidad o el alimento. */
  | "aproximado";

/** Un día registrado. Las porciones tocadas a mano viven en `meals`. */
export interface DayLog {
  date: string; // YYYY-MM-DD
  meals: Partial<Record<MealId, Partial<Record<CategoryId, number>>>>;
  waterMl: number;
}

/**
 * Un alimento registrado por texto.
 *
 * Todos los valores nutricionales son **por unidad**, nunca el total: el total
 * se calcula multiplicando por `qty` al mostrar. Guardar totales fue el origen
 * del bug de "562.5 porciones" en el prototipo.
 */
export interface FoodEntry {
  id: string; // uuid
  date: string; // YYYY-MM-DD
  meal: MealId;
  name: string;
  unit: string; // "pieza" | "rebanada" | "taza" | "g" | ...
  qty: number;
  kcalPerUnit: number;
  proteinPerUnit: number;
  fatPerUnit: number;
  carbsPerUnit: number;
  /**
   * Porciones CLIDDI que aporta *una* unidad, desglosadas por grupo.
   *
   * Un platillo es una sola entrada aunque toque varios grupos: un handroll de
   * toro es `{ poa: 0.75, cereales: 0.5, grasas: 0.2 }`, no tres entradas
   * separadas de pescado, arroz y aceite.
   */
  portions: Partial<Record<CategoryId, number>>;
  source: Certainty;
  createdAt: number;
}

/**
 * Un alimento que el usuario pidió recordar explícitamente.
 * Se busca localmente antes de llamar al modelo.
 */
export interface FoodMemory {
  /** Slug normalizado del nombre: "pan de caja" → "pan-de-caja". */
  id: string;
  name: string;
  unit: string;
  kcalPerUnit: number;
  proteinPerUnit: number;
  fatPerUnit: number;
  carbsPerUnit: number;
  portions: Partial<Record<CategoryId, number>>;
  updatedAt: number;
  /** Ordena las sugerencias: lo más usado primero. */
  useCount: number;
}

/**
 * Metas de calorías y macros.
 *
 * Deliberadamente fuera de `DAILY_TARGETS`: `adherence.ts` recorre esa
 * estructura casteando las llaves a `CategoryId`, así que una llave `kcal`
 * ahí haría que esa meta nunca se cumpla y cambiaría el total de metas de 4
 * a 5, alterando todas las rachas históricas.
 */
export interface Settings {
  id: "user";
  kcalGoal: number;
  proteinGoal: number;
  fatGoal: number;
  carbsGoal: number;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "user",
  kcalGoal: 1800,
  proteinGoal: 140,
  fatGoal: 60,
  carbsGoal: 160,
};

/** Totales de calorías y macros. */
export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

/** Suma de un alimento según su cantidad. */
export function entryMacros(entry: FoodEntry): Macros {
  return {
    kcal: entry.kcalPerUnit * entry.qty,
    protein: entry.proteinPerUnit * entry.qty,
    fat: entry.fatPerUnit * entry.qty,
    carbs: entry.carbsPerUnit * entry.qty,
  };
}

/** Porciones de un grupo concreto que aporta un alimento según su cantidad. */
export function entryPortionsOf(entry: FoodEntry, cat: CategoryId): number {
  return (entry.portions[cat] ?? 0) * entry.qty;
}

/** Grupos del plan que toca un alimento, en el orden de `CATEGORY_ORDER`. */
export function entryCategories(entry: FoodEntry): CategoryId[] {
  return (Object.keys(entry.portions) as CategoryId[]).filter(
    (cat) => (entry.portions[cat] ?? 0) > 0
  );
}

/** Total de porciones sumando todos los grupos. Útil para un resumen corto. */
export function entryPortionsTotal(entry: FoodEntry): number {
  return entryCategories(entry).reduce((sum, cat) => sum + entryPortionsOf(entry, cat), 0);
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
  };
}

export function sumMacros(entries: FoodEntry[]): Macros {
  return entries.reduce((acc, e) => addMacros(acc, entryMacros(e)), ZERO_MACROS);
}
