// Forma del contrato HTTP y esquema JSON que se le exige al modelo.

import { CATEGORY_IDS, CERTAINTIES, MEAL_IDS, type CategoryId, type Certainty, type MealId } from "./cliddi.ts";

/** Alimento tal como lo devuelve el modelo. Espeja `ParsedItem` de la PWA. */
export interface ParsedItem {
  name: string;
  unit: string;
  qty: number;
  kcalPerUnit: number;
  proteinPerUnit: number;
  fatPerUnit: number;
  carbsPerUnit: number;
  /** Porciones CLIDDI por unidad, por grupo del plan. */
  portions: Partial<Record<CategoryId, number>>;
  source: Certainty;
  assumedQty?: boolean;
}

export interface ParseResult {
  meal: MealId;
  items: ParsedItem[];
  unknown?: string;
}

/** Memoria del usuario, recortada a lo que el modelo necesita. */
export interface FoodMemoryLite {
  id: string;
  name: string;
  unit: string;
  kcalPerUnit: number;
  proteinPerUnit: number;
  fatPerUnit: number;
  carbsPerUnit: number;
  portions: Partial<Record<CategoryId, number>>;
}

export interface ParseRequest {
  text: string;
  memory: FoodMemoryLite[];
  today: string;
  /**
   * Hora local del dispositivo (0-23). Opcional y añadido sobre el contrato
   * mínimo: sin ella el modelo no puede deducir la comida de un texto que no
   * la menciona ("me comí un plátano") y tendría que adivinar.
   */
  hour?: number;
}

/** Tope de alimentos por petición: un texto normal no pasa de 10. */
export const MAX_ITEMS = 20;
/** Tope del texto libre. Un registro real no llega ni a 500 caracteres. */
export const MAX_TEXT = 2000;
/** Tope de alimentos de memoria que se mandan como contexto. */
export const MAX_MEMORY = 40;

/**
 * Esquema que se manda en `response_format`.
 *
 * `additionalProperties: false` en los items evita que el modelo cuele campos
 * inventados; la validación de `validate.ts` los ignoraría igual, pero así se
 * ahorra tokens.
 */
export const PARSE_SCHEMA = {
  type: "object",
  properties: {
    meal: { type: "string", enum: [...MEAL_IDS] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          unit: { type: "string" },
          qty: { type: "number" },
          kcalPerUnit: { type: "number" },
          proteinPerUnit: { type: "number" },
          fatPerUnit: { type: "number" },
          carbsPerUnit: { type: "number" },
          portions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cat: { type: "string", enum: [...CATEGORY_IDS] },
                perUnit: { type: "number" },
              },
              required: ["cat", "perUnit"],
              additionalProperties: false,
            },
          },
          source: { type: "string", enum: [...CERTAINTIES] },
          assumedQty: { type: "boolean" },
        },
        required: [
          "name",
          "unit",
          "qty",
          "kcalPerUnit",
          "proteinPerUnit",
          "fatPerUnit",
          "carbsPerUnit",
          "portions",
          "source",
        ],
        additionalProperties: false,
      },
    },
    unknown: { type: "string" },
  },
  required: ["meal", "items"],
  additionalProperties: false,
} as const;
