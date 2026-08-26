import type { ParsedItem } from "../api";
import { CATEGORIES, type CategoryId } from "../data/plan";
import FoodEditor from "./FoodEditor";
import {
  categoriesOf,
  kcalText,
  nf,
  num,
  perUnitText,
  portionsOf,
  stepFor,
  unitText,
} from "./format";

const BADGE: Record<ParsedItem["source"], string> = {
  recordado: "badge-mem",
  estimado: "badge-est",
  aproximado: "badge-apx",
};

interface Props {
  item: ParsedItem;
  open: boolean;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onPatch: (patch: Partial<ParsedItem>) => void;
}

/**
 * Tarjeta de un alimento interpretado. Tocarla abre el editor completo; el
 * borde ámbar marca lo aproximado para que salte a la vista antes de guardar.
 */
export default function FoodItem({ item, open, onToggle, onStep, onPatch }: Props) {
  const cats = categoriesOf(item);
  const step = stepFor(item.unit);

  return (
    <div className={`item${item.source === "aproximado" ? " approx" : ""}`}>
      <button className="item-tap" onClick={onToggle} aria-expanded={open}>
        <div className="item-top">
          <span className="item-name">{item.name || "Alimento sin nombre"}</span>
          <span className={`badge ${BADGE[item.source]}`}>{item.source}</span>
          <span className="item-edit-hint" aria-hidden="true">
            {open ? "▾" : "›"}
          </span>
        </div>
        <div className="item-qty-line">
          <b>{unitText(item.qty, item.unit)}</b>
          {item.assumedQty && <span className="assumed">· cantidad asumida</span>}
        </div>
      </button>

      {open ? (
        <FoodEditor item={item} onPatch={onPatch} onDone={onToggle} />
      ) : (
        <>
          <div className="item-mid">
            <div className="qty">
              <button
                className="btn minus"
                onClick={() => onStep(-1)}
                disabled={item.qty <= step}
                aria-label={`Menos ${item.name}`}
              >
                −
              </button>
              <span className="qty-val">{num(item.qty)}</span>
              <button className="btn plus" onClick={() => onStep(1)} aria-label={`Más ${item.name}`}>
                +
              </button>
            </div>
            <div className="item-kcal">
              <b>{kcalText(item)} kcal</b>
              <span>{perUnitText(item)}</span>
            </div>
          </div>
          <div className="item-bot">
            <span>
              P {nf(item.proteinPerUnit * item.qty)} · G {nf(item.fatPerUnit * item.qty)} · C{" "}
              {nf(item.carbsPerUnit * item.qty)} g
            </span>
            {/* Un platillo puede tocar varios grupos del plan: un handroll
                suma POA, cereales y grasas a la vez. Una píldora por grupo. */}
            {cats.map((c: CategoryId) => (
              <span className="cliddi" key={c}>
                <span className="chip-dot" style={{ background: CATEGORIES[c].color }} />
                {CATEGORIES[c].shortName} ·{" "}
                {num(Math.round(portionsOf(item, c) * 10) / 10)} porc.
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
