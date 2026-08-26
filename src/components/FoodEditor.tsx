import { useId } from "react";
import type { ParsedItem } from "../api";
import { CATEGORIES, type CategoryId } from "../data/plan";
import { isWeight, stepFor } from "./format";

const BASE_UNITS = ["pieza", "rebanada", "taza", "porción", "cucharada", "g", "ml"];

interface Props {
  item: ParsedItem;
  onPatch: (patch: Partial<ParsedItem>) => void;
  onDone: () => void;
}

/**
 * Editor completo de un alimento. Todo es editable siempre: el modelo propone,
 * el usuario decide.
 *
 * En unidades de peso los campos se muestran **por 100 g/ml** aunque el dato se
 * guarde por unidad. Un yoghurt de 125 g tiene 1.04 kcal/g: pedirle al usuario
 * ese número invita a teclear "104" y multiplicar las calorías por cien.
 */
/** Campos numéricos escalares del editor. `portions` va aparte: es un mapa. */
type NumericField =
  | "kcalPerUnit"
  | "proteinPerUnit"
  | "fatPerUnit"
  | "carbsPerUnit";

export default function FoodEditor({ item, onPatch, onDone }: Props) {
  const id = useId();
  const weight = isWeight(item.unit);
  const scale = weight ? 100 : 1;
  const per = weight ? ` / 100 ${item.unit}` : "/u";
  const step = stepFor(item.unit);

  // Corregir un campo convierte la suposición en dato del usuario.
  const patch = (p: Partial<ParsedItem>) => onPatch({ ...p, source: "recordado", assumedQty: false });

  const numberField = (
    key: NumericField,
    label: string,
    fieldStep: number
  ) => (
    <div className="fld" key={key}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        id={`${id}-${key}`}
        // Remonta al cambiar la escala (por unidad ↔ por 100 g) para que el
        // valor mostrado corresponda a la etiqueta.
        key={`${key}-${scale}`}
        type="number"
        inputMode="decimal"
        step={fieldStep}
        min={0}
        defaultValue={Math.round(item[key] * scale * 1000) / 1000}
        onChange={(e) => patch({ [key]: (parseFloat(e.target.value) || 0) / scale } as Partial<ParsedItem>)}
      />
    </div>
  );

  const units = BASE_UNITS.includes(item.unit) ? BASE_UNITS : [item.unit, ...BASE_UNITS];

  return (
    <div className="editor">
      <div className="editor-grid">
        <div className="fld full">
          <label htmlFor={`${id}-name`}>Alimento</label>
          <input
            id={`${id}-name`}
            type="text"
            value={item.name}
            placeholder="Nombre del alimento"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <div className="fld">
          <label htmlFor={`${id}-qty`}>Cantidad</label>
          <input
            id={`${id}-qty`}
            key={`qty-${step}`}
            type="number"
            inputMode="decimal"
            step={step}
            min={step}
            defaultValue={item.qty}
            onChange={(e) => patch({ qty: Math.max(0, parseFloat(e.target.value) || 0) })}
          />
        </div>

        <div className="fld">
          <label htmlFor={`${id}-unit`}>Unidad</label>
          <select
            id={`${id}-unit`}
            value={item.unit}
            onChange={(e) => patch({ unit: e.target.value })}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        {numberField("kcalPerUnit", weight ? `Kcal / 100 ${item.unit}` : `Kcal por ${item.unit}`, 1)}

        {/* Porciones por grupo del plan. Un platillo compuesto llena varios
            (un handroll: POA + cereales + grasas); 0 significa "no aplica". */}
        <div className="fld full">
          <label>Porciones del plan, por unidad</label>
          <div className="portions-grid">
            {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => (
              <label className="portion-cell" key={c}>
                <span className="portion-name">
                  <span className="chip-dot" style={{ background: CATEGORIES[c].color }} />
                  {CATEGORIES[c].shortName}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={0.25}
                  min={0}
                  aria-label={`Porciones de ${CATEGORIES[c].name}`}
                  defaultValue={item.portions[c] ?? 0}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    const next = { ...item.portions };
                    if (value > 0) next[c] = value;
                    else delete next[c];
                    patch({ portions: next });
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        {numberField("proteinPerUnit", `Proteína g${per}`, 0.1)}
        {numberField("fatPerUnit", `Grasa g${per}`, 0.1)}
        {numberField("carbsPerUnit", `Carbos g${per}`, 0.1)}
      </div>
      <button className="editor-done" onClick={onDone}>
        Listo
      </button>
    </div>
  );
}
