// Formato de números, unidades y certeza para el registro por texto.
//
// Vive en la capa de interfaz porque es puramente presentación: cuánto se
// redondea un número depende de qué tan confiable es, no del número en sí.

import type { CategoryId } from "../data/plan";
import type { Certainty } from "../types";

/** Separador de miles y decimales fijos, en es-MX. */
export function nf(n: number, digits = 0): string {
  return n.toLocaleString("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Cantidad "humana": entera si lo es, con un decimal si no. */
export function num(n: number): string {
  return n % 1 ? String(Math.round(n * 10) / 10) : String(n);
}

export function isWeight(unit: string): boolean {
  return unit === "g" || unit === "ml";
}

/** Un toque en +/− mueve 25 g o media pieza: los pasos de 1 g son inútiles. */
export function stepFor(unit: string): number {
  return isWeight(unit) ? 25 : 0.5;
}

const PLURALS: Record<string, string> = {
  pieza: "piezas",
  rebanada: "rebanadas",
  taza: "tazas",
  "porción": "porciones",
  cucharada: "cucharadas",
  cucharadita: "cucharaditas",
  vaso: "vasos",
  paquete: "paquetes",
  unidad: "unidades",
};

/** "2 piezas", "1 rebanada", "125 g" — nunca "2 porcións" ni "150 × g". */
export function unitText(qty: number, unit: string): string {
  if (isWeight(unit)) return `${num(qty)} ${unit}`;
  const label = qty === 1 ? unit : PLURALS[unit] ?? `${unit}s`;
  return `${num(qty)} ${label}`;
}

/** Lo mínimo que necesita el formato: valores *por unidad* más la cantidad. */
export interface Portioned {
  qty: number;
  unit: string;
  kcalPerUnit: number;
  proteinPerUnit: number;
  fatPerUnit: number;
  carbsPerUnit: number;
  portions: Partial<Record<CategoryId, number>>;
  source: Certainty;
}

export function roundTen(n: number): number {
  return Math.round(n / 10) * 10;
}

export function totalKcal(item: Pick<Portioned, "kcalPerUnit" | "qty">): number {
  return item.kcalPerUnit * item.qty;
}

/**
 * Redondeo proporcional a la confianza: lo que no se recuerda se muestra con
 * tilde y redondeado a la decena. "~250 kcal" es honesto; "248 kcal" finge una
 * precisión que el modelo no tiene.
 */
export function kcalText(item: Pick<Portioned, "kcalPerUnit" | "qty" | "source">): string {
  return approxKcalText(totalKcal(item), item.source === "recordado");
}

export function approxKcalText(total: number, exact: boolean): string {
  return exact ? nf(Math.round(total)) : `~${nf(roundTen(total))}`;
}

/** "104 kcal / 100 g" o "75 kcal por pieza". */
export function perUnitText(item: Pick<Portioned, "kcalPerUnit" | "unit">): string {
  return isWeight(item.unit)
    ? `${nf(Math.round(item.kcalPerUnit * 100))} kcal / 100 ${item.unit}`
    : `${nf(Math.round(item.kcalPerUnit))} kcal por ${item.unit}`;
}

/** Porciones de un grupo concreto, escaladas por la cantidad. */
export function portionsOf(
  item: Pick<Portioned, "portions" | "qty">,
  cat: CategoryId
): number {
  return (item.portions[cat] ?? 0) * item.qty;
}

/** Grupos del plan que toca el alimento, solo los que suman algo. */
export function categoriesOf(item: Pick<Portioned, "portions">): CategoryId[] {
  return (Object.keys(item.portions) as CategoryId[]).filter(
    (cat) => (item.portions[cat] ?? 0) > 0
  );
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
