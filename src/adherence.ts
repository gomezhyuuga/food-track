// Cálculo de apego ("a mayor apego, mayor éxito") y rachas.

import { DAILY_TARGETS, type CategoryId } from "./data/plan";
import {
  entryPortionsFor,
  listEntries,
  listLoggedDates,
  loadDay,
  mealTotal,
  type DayLog,
} from "./store";

/** Umbral de apego para que un día cuente en la racha (3 de 4 grupos exactos). */
export const STREAK_THRESHOLD = 0.75;

export interface DayAdherence {
  /** Fracción de grupos con meta cumplida exactamente (0–1). */
  pct: number;
  /** Hubo algo registrado ese día. */
  logged: boolean;
  metGoals: number;
  totalGoals: number;
}

/**
 * Porciones totales de una categoría: las tocadas a mano más las que aportan
 * los alimentos registrados por texto.
 *
 * El total se **redondea** antes de compararlo con la meta. Los alimentos por
 * peso producen fracciones (150 g de pechuga = 3.75 porciones POA) y la regla
 * de apego exige igualdad exacta; sin redondear, `count === 12` sería
 * prácticamente inalcanzable y la racha se rompería para siempre. Redondear
 * conserva la regla de "dar en el blanco" y mantiene comparables los días
 * registrados antes de este cambio.
 */
export function totalPortions(log: DayLog, cat: CategoryId): number {
  return Math.round(mealTotal(log, cat) + entryPortionsFor(log.date, cat));
}

export function dayAdherence(log: DayLog): DayAdherence {
  const targets = (Object.entries(DAILY_TARGETS) as [CategoryId, number][]).filter(
    ([, t]) => t > 0
  );
  let met = 0;
  let logged = log.waterMl > 0 || listEntries(log.date).length > 0;
  for (const [cat, target] of targets) {
    const count = totalPortions(log, cat);
    if (count > 0) logged = true;
    if (count === target) met++;
  }
  return {
    pct: targets.length ? met / targets.length : 0,
    logged,
    metGoals: met,
    totalGoals: targets.length,
  };
}

function qualifies(date: string): boolean {
  const { pct, logged } = dayAdherence(loadDay(date));
  return logged && pct >= STREAK_THRESHOLD;
}

function previousDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
}

export interface Streaks {
  /** Días consecutivos cumplidos hasta ayer; hoy la extiende en vivo si ya califica. */
  current: number;
  best: number;
}

export function computeStreaks(today: string): Streaks {
  // Racha actual: hacia atrás desde hoy (si ya califica) o desde ayer.
  let current = 0;
  let cursor = qualifies(today) ? today : previousDate(today);
  while (qualifies(cursor)) {
    current++;
    cursor = previousDate(cursor);
  }

  // Mejor racha histórica sobre los días registrados.
  const qualifying = new Set(listLoggedDates().filter(qualifies));
  let best = current;
  for (const date of qualifying) {
    if (qualifying.has(previousDate(date))) continue; // no es inicio de racha
    let len = 0;
    let d = date;
    let next = d;
    while (qualifying.has(next)) {
      len++;
      d = next;
      next = nextDate(d);
    }
    if (len > best) best = len;
  }
  return { current, best };
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
