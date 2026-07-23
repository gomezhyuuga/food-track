// Plan de alimentación CLIDDI (21/07/26) — Esquema de porciones por comida.

export type CategoryId =
  | "lacteos"
  | "poa"
  | "leguminosas"
  | "cereales"
  | "frutas"
  | "verduras"
  | "grasas"
  | "azucares";

export type MealId = "desayuno" | "colacion1" | "comida" | "colacion2" | "cena";

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  shortName: string;
  color: string;
  /** Sin límite de porciones (verduras). */
  free?: boolean;
  /** Marcado como "evitar" por la nutrióloga (tachado en la lista). */
  avoid?: boolean;
}

export const CATEGORIES: Record<CategoryId, CategoryInfo> = {
  lacteos: { id: "lacteos", name: "Lácteos", shortName: "Lác", color: "#93c5fd" },
  poa: { id: "poa", name: "Prod. de Origen Animal", shortName: "POA", color: "#f87171" },
  leguminosas: {
    id: "leguminosas",
    name: "Leguminosas",
    shortName: "Leg",
    color: "#a78bfa",
    avoid: true,
  },
  cereales: { id: "cereales", name: "Cereales y Tubérculos", shortName: "Cer", color: "#fbbf24" },
  frutas: { id: "frutas", name: "Frutas", shortName: "Fru", color: "#fb923c" },
  verduras: { id: "verduras", name: "Verduras", shortName: "Ver", color: "#4ade80", free: true },
  grasas: { id: "grasas", name: "Grasas", shortName: "Gra", color: "#facc15" },
  azucares: { id: "azucares", name: "Azúcares", shortName: "Azú", color: "#f472b6", avoid: true },
};

export interface MealInfo {
  id: MealId;
  name: string;
  emoji: string;
  /** Hora de inicio (0-23) para auto-seleccionar la comida actual. */
  fromHour: number;
  /** Porciones objetivo por categoría. -1 = libre. */
  targets: Partial<Record<CategoryId, number>>;
}

export const MEALS: MealInfo[] = [
  {
    id: "desayuno",
    name: "Desayuno",
    emoji: "🍳",
    fromHour: 5,
    targets: { poa: 2, verduras: -1 },
  },
  {
    id: "colacion1",
    name: "Colación",
    emoji: "🥛",
    fromHour: 11,
    targets: { lacteos: 1, frutas: 1 },
  },
  {
    id: "comida",
    name: "Comida",
    emoji: "🍽️",
    fromHour: 13,
    targets: { poa: 6, cereales: 2, frutas: 1, verduras: -1 },
  },
  {
    id: "colacion2",
    name: "Colación PM",
    emoji: "🫖",
    fromHour: 17,
    targets: {},
  },
  {
    id: "cena",
    name: "Cena",
    emoji: "🌙",
    fromHour: 19,
    targets: { poa: 4, cereales: 1, verduras: -1 },
  },
];

/** Totales diarios derivados del esquema. -1 = libre. */
export const DAILY_TARGETS: Partial<Record<CategoryId, number>> = MEALS.reduce(
  (acc, meal) => {
    for (const [cat, n] of Object.entries(meal.targets) as [CategoryId, number][]) {
      if (n === -1) acc[cat] = -1;
      else if (acc[cat] !== -1) acc[cat] = (acc[cat] ?? 0) + n;
    }
    return acc;
  },
  {} as Partial<Record<CategoryId, number>>
);

export const WATER = {
  minMl: 2200,
  maxMl: 3400,
  glassMl: 250, // 1 vaso = 250 ml (según la lista de medidas)
};
