// Contrato entre la capa de datos y la interfaz.
//
// Los tipos se escribieron ANTES de paralelizar el trabajo y no han cambiado:
// la interfaz programa contra ellos. Las funciones ya están implementadas y se
// re-exportan desde aquí, así que `./api` sigue siendo el único import que la
// interfaz necesita.

import type { MealId } from "./data/plan";
import type { Certainty, FoodEntry } from "./types";

/* --------------------------------------------------------- interpretación */

/** Un alimento tal como lo devuelve el modelo, antes de guardarse. */
export interface ParsedItem {
  name: string;
  unit: string;
  qty: number;
  kcalPerUnit: number;
  proteinPerUnit: number;
  fatPerUnit: number;
  carbsPerUnit: number;
  /**
   * Porciones CLIDDI por unidad, desglosadas por grupo del plan.
   *
   * Un platillo es UN elemento aunque toque varios grupos: un handroll de toro
   * es `{ poa: 0.75, cereales: 0.5, grasas: 0.2 }`, no tres elementos sueltos.
   */
  portions: FoodEntry["portions"];
  source: Certainty;
  /** El modelo dedujo la cantidad porque el texto no la decía. */
  assumedQty?: boolean;
}

export interface ParseResult {
  meal: MealId;
  items: ParsedItem[];
  /** Fragmento que el modelo no logró interpretar, si lo hubo. */
  unknown?: string;
}

/**
 * Resultado de intentar interpretar un texto.
 *
 * `unknown` existe para que la app **nunca invente comida**: si el modelo no
 * entendió, se admite en vez de fabricar un alimento genérico con números
 * plausibles. `offline` permite guardar lo que la memoria local sí resolvió y
 * dejar el resto en cola.
 */
export type ParseOutcome =
  | { status: "ok"; result: ParseResult }
  | { status: "unknown"; text: string }
  | { status: "offline"; resolved: ParsedItem[]; pending: string }
  | { status: "error"; message: string };

export interface ParseOptions {
  /** Para cancelar cuando el usuario cierra la hoja o reenvía. */
  signal?: AbortSignal;
}

/**
 * Interpreta texto libre. Busca en memoria local antes de salir a la red.
 *
 * Si `options.signal` se aborta, la promesa **rechaza** con un `DOMException`
 * de nombre `AbortError`, igual que `fetch`. Un timeout interno no aborta: eso
 * regresa `{ status: "error" }`.
 */
export { parseText } from "./parse";

/* ---------------------------------------------------------------- guardar */

/**
 * `toEntries(date, meal, items): FoodEntry[]`
 * Convierte lo interpretado en entradas persistibles (con id y createdAt).
 *
 * `commitEntries(entries, remember): Promise<void>`
 * Guarda las entradas del día. `remember` es opt-in: solo entonces los
 * alimentos entran a la memoria.
 */
export { commitEntries, toEntries } from "./entries";

/* --------------------------------------------------------------- repetir */

export interface RepeatShortcut {
  meal: MealId;
  label: string;
  kcal: number;
  items: ParsedItem[];
}

/** Atajos de repetición del historial. Resuelve local, sin red. */
export { repeatShortcuts } from "./entries";

/* --------------------------------------------------------------- memoria */

/** Busca un alimento guardado por el usuario. `undefined` si no lo recuerda. */
export { memoryFor } from "./entries";
