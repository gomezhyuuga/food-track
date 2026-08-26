import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ParsedItem } from "../api";
import { MEALS, type MealId } from "../data/plan";
import type { FoodEntry } from "../types";
import FoodItem from "./FoodItem";
import { approxKcalText, nf, stepFor } from "./format";

/** Lo que la hoja está mostrando. `null` = cerrada. */
export type SheetState =
  | { kind: "loading"; text: string }
  | { kind: "result"; text: string; meal: MealId; items: ParsedItem[]; unknown?: string }
  | { kind: "edit"; entry: FoodEntry }
  | { kind: "unknown"; text: string }
  | { kind: "offline"; text: string; resolved: ParsedItem[]; pending: string }
  | { kind: "error"; text: string; message: string };

interface Props {
  state: SheetState | null;
  onClose: () => void;
  onCommit: (meal: MealId, items: ParsedItem[], remember: boolean) => void;
  onSaveEdit: (entry: FoodEntry, item: ParsedItem, meal: MealId) => void;
  onDelete: (entry: FoodEntry) => void;
  onSavePartial: (items: ParsedItem[], pending: string) => void;
  onRewrite: (text: string) => void;
  onRetry: (text: string) => void;
  onPortionsOnly: () => void;
}

function entryToItem(entry: FoodEntry): ParsedItem {
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

function blankItem(): ParsedItem {
  // Cero calorías a propósito: la app nunca inventa comida, ni siquiera al
  // agregar una fila. El editor abre enseguida para que el usuario la llene.
  return {
    name: "",
    unit: "porción",
    qty: 1,
    kcalPerUnit: 0,
    proteinPerUnit: 0,
    fatPerUnit: 0,
    carbsPerUnit: 0,
    // Sin grupo asignado: igual que las calorías, el usuario lo llena.
    portions: {},
    source: "estimado",
  };
}

const TITLES: Record<SheetState["kind"], string> = {
  loading: "Revisar registro",
  result: "Revisar registro",
  edit: "Editar alimento",
  unknown: "Revisar registro",
  offline: "Sin guardar",
  error: "Sin guardar",
};

function mealName(id: MealId): string {
  return MEALS.find((m) => m.id === id)?.name ?? id;
}

export default function ReviewSheet(props: Props) {
  const { state, onClose } = props;
  const open = state !== null;

  // El contenido sobrevive al cierre para que la hoja alcance a deslizarse.
  const [shown, setShown] = useState<SheetState | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [meal, setMeal] = useState<MealId>(MEALS[0].id);
  const [remember, setRemember] = useState(false);
  const [editing, setEditing] = useState(-1);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!state) return;
    setShown(state);
    setRemember(false); // opt-in: se reinicia en cada registro
    if (state.kind === "result") {
      setItems(state.items);
      setMeal(state.meal);
      setEditing(-1);
    } else if (state.kind === "edit") {
      setItems([entryToItem(state.entry)]);
      setMeal(state.entry.meal);
      setEditing(0);
    } else {
      setItems([]);
      setEditing(-1);
    }
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [state]);

  // Foco al diálogo, fondo `inert`, y foco de vuelta al cerrar.
  useEffect(() => {
    const background = [
      document.querySelector(".app"),
      document.querySelector(".composer-wrap"),
    ].filter((el): el is Element => el !== null);

    if (open) {
      lastFocus.current = document.activeElement as HTMLElement | null;
      background.forEach((el) => el.setAttribute("inert", ""));
      sheetRef.current?.removeAttribute("inert");
      document.body.style.overflow = "hidden";
      sheetRef.current?.focus();
    } else {
      background.forEach((el) => el.removeAttribute("inert"));
      sheetRef.current?.setAttribute("inert", "");
      document.body.style.overflow = "";
      lastFocus.current?.focus();
      lastFocus.current = null;
    }

    return () => {
      background.forEach((el) => el.removeAttribute("inert"));
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const patchItem = (index: number, patch: Partial<ParsedItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const stepItem = (index: number, delta: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const step = stepFor(it.unit);
        return { ...it, qty: Math.max(step, Math.round((it.qty + delta * step) * 100) / 100) };
      })
    );

  const addFood = () => {
    setItems((prev) => [...prev, blankItem()]);
    setEditing(items.length);
  };

  const totals = items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + it.kcalPerUnit * it.qty,
      p: acc.p + it.proteinPerUnit * it.qty,
      g: acc.g + it.fatPerUnit * it.qty,
      c: acc.c + it.carbsPerUnit * it.qty,
    }),
    { kcal: 0, p: 0, g: 0, c: 0 }
  );
  const nuevos = items.filter((it) => it.source !== "recordado").length;

  const itemList = items.map((it, i) => (
    <FoodItem
      key={i}
      item={it}
      open={editing === i}
      onToggle={() => setEditing(editing === i ? -1 : i)}
      onStep={(d) => stepItem(i, d)}
      onPatch={(p) => patchItem(i, p)}
    />
  ));

  let body: ReactNode = null;
  let foot: ReactNode = null;

  if (shown?.kind === "loading") {
    body = (
      <>
        <p className="quote">{shown.text}</p>
        <div className="status" aria-live="polite">
          <span className="spinner" />
          <span>Interpretando…</span>
        </div>
        <div className="skel">
          <div className="skel-line" style={{ width: "62%" }} />
          <div className="skel-line" style={{ width: "38%" }} />
        </div>
        <div className="skel">
          <div className="skel-line" style={{ width: "48%" }} />
          <div className="skel-line" style={{ width: "72%" }} />
        </div>
      </>
    );
    // Salida disponible desde el primer instante: nunca encerrar al usuario.
    foot = (
      <button className="sheet-btn ghost" style={{ flex: 1 }} onClick={onClose}>
        Cancelar
      </button>
    );
  } else if (shown?.kind === "result") {
    body = (
      <>
        {shown.text && <p className="quote">{shown.text}</p>}
        <p className="field-label">Comida</p>
        <div className="meal-picker">
          {MEALS.map((m) => (
            <button
              key={m.id}
              className={`meal-opt ${m.id === meal ? "on" : ""}`}
              aria-pressed={m.id === meal}
              onClick={() => setMeal(m.id)}
            >
              <span aria-hidden="true">{m.emoji}</span>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
        <p className="field-label">Esto entendí</p>
        {itemList}
        {shown.unknown && (
          <div className="partial">
            No entendí <b>«{shown.unknown}»</b>. Si era comida, agrégala abajo o reescribe el texto.
          </div>
        )}
        <button className="add-food" onClick={addFood}>
          + Agregar alimento
        </button>
        <div className="totals-strip" aria-live="polite">
          <span className="t-kcal">{approxKcalText(totals.kcal, nuevos === 0)} kcal</span>
          <span className="t-macros">
            P {nf(Math.round(totals.p))} · G {nf(Math.round(totals.g))} · C{" "}
            {nf(Math.round(totals.c))} g
          </span>
        </div>
        {nuevos > 0 && (
          <label className={`remember-row ${remember ? "on" : ""}`}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span className="rm-box" aria-hidden="true">
              ✓
            </span>
            <span className="rm-text">
              <b>
                Recordar {nuevos === 1 ? "este alimento" : `estos ${nuevos} alimentos`}
              </b>
              <span>
                Solo si los valores ya quedaron bien. La próxima vez los reconozco sin recalcular.
              </span>
            </span>
          </label>
        )}
      </>
    );
    foot = (
      <>
        <button className="sheet-btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="sheet-btn primary"
          onClick={() => props.onCommit(meal, items, remember)}
        >
          Agregar a {mealName(meal)}
        </button>
      </>
    );
  } else if (shown?.kind === "edit") {
    const entry = shown.entry;
    body = <>{itemList}</>;
    foot = (
      <>
        <button className="sheet-btn ghost" onClick={() => props.onDelete(entry)}>
          Eliminar
        </button>
        <button
          className="sheet-btn primary"
          onClick={() => items[0] && props.onSaveEdit(entry, items[0], meal)}
        >
          Guardar cambios
        </button>
      </>
    );
  } else if (shown?.kind === "offline") {
    body = (
      <div className="fail">
        <div className="fail-icon" aria-hidden="true">
          📴
        </div>
        <h3>Sin conexión</h3>
        <p>
          Reconocí {shown.resolved.length}{" "}
          {shown.resolved.length === 1 ? "alimento" : "alimentos"} con lo que ya tengo guardado. El
          resto lo interpreto cuando vuelva el internet.
        </p>
        <div className="partial">
          <b>Listos ahora:</b> {shown.resolved.map((it) => it.name).join(" · ") || "nada"}
          <br />
          <b>Pendiente:</b> «{shown.pending}» — queda en cola
        </div>
      </div>
    );
    foot = (
      <>
        <button className="sheet-btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="sheet-btn primary"
          onClick={() => props.onSavePartial(shown.resolved, shown.pending)}
        >
          Guardar lo que hay
        </button>
      </>
    );
  } else if (shown?.kind === "error") {
    body = (
      <div className="fail">
        <div className="fail-icon" aria-hidden="true">
          ⚠️
        </div>
        <h3>No pude interpretarlo</h3>
        {/* El mensaje del contrato sí sirve al usuario: distingue "el servicio
            no respondió" de "el texto es demasiado largo". */}
        <p>
          {shown.message || "El servicio no respondió."} Tu texto sigue aquí, no se perdió.
        </p>
        <span className="frag">{shown.text}</span>
        <div className="partial">
          Si tienes prisa, puedes registrarlo como porciones del plan y agregarle las calorías
          después.
        </div>
      </div>
    );
    foot = (
      <>
        <button className="sheet-btn ghost" onClick={props.onPortionsOnly}>
          Solo porciones
        </button>
        <button className="sheet-btn primary" onClick={() => props.onRetry(shown.text)}>
          Reintentar
        </button>
      </>
    );
  } else if (shown?.kind === "unknown") {
    body = (
      <div className="fail">
        <div className="fail-icon" aria-hidden="true">
          🤔
        </div>
        <h3>No estoy seguro de esto</h3>
        <p>Entendí que comiste algo, pero no lo suficiente para calcular calorías sin inventarlas.</p>
        <span className="frag">{shown.text}</span>
        <div className="partial">
          Ayúdame con la cantidad o la marca — por ejemplo{" "}
          <b>«2 rebanadas de pan integral Bimbo»</b>. O regístralo solo como porción del plan, que
          es un dato honesto.
        </div>
      </div>
    );
    foot = (
      <>
        <button className="sheet-btn ghost" onClick={props.onPortionsOnly}>
          Solo porciones
        </button>
        <button className="sheet-btn primary" onClick={() => props.onRewrite(shown.text)}>
          Reescribir
        </button>
      </>
    );
  }

  const live =
    shown?.kind === "loading"
      ? "Interpretando tu registro"
      : shown?.kind === "unknown" || shown?.kind === "error"
        ? "No se pudo interpretar el registro"
        : shown?.kind === "offline"
          ? "Sin conexión"
          : "";

  return createPortal(
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={onClose} />
      <div
        className={`sheet ${open ? "show" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet-bar">
          <span className="sheet-title" id="sheet-title">
            {shown ? TITLES[shown.kind] : "Revisar registro"}
          </span>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="sheet-scroll" ref={scrollRef}>
          {body}
        </div>
        <div className="sheet-foot">{foot}</div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {live}
      </span>
    </>,
    document.body
  );
}
