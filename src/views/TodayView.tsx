import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParsedItem, RepeatShortcut } from "../api";
import { CATEGORIES, MEALS, WATER, type CategoryId, type MealId } from "../data/plan";
import {
  listEntries,
  loadDay,
  removeEntry,
  todayKey,
  updateEntry,
  useDayActions,
  useStoreVersion,
} from "../store";
import type { FoodEntry } from "../types";
import { computeStreaks, dayAdherence, STREAK_THRESHOLD } from "../adherence";
import PortionDots from "../components/PortionDots";
import ProgressCard from "../components/ProgressCard";
import Composer from "../components/Composer";
import ReviewSheet, { type SheetState } from "../components/ReviewSheet";
import Toast, { type ToastState } from "../components/Toast";
import { kcalText, nf, plural, unitText } from "../components/format";
// Andamiaje: usa `src/api.ts` si ya está implementado y simula si no.
// Cuando el Worker aterrice, cambiar este import por `../api`.
import { commitEntries, parseText, repeatShortcuts, toEntries } from "../components/__mock__/parseMock";

function currentMealId(): MealId {
  const hour = new Date().getHours();
  let current: MealId = MEALS[0].id;
  for (const meal of MEALS) {
    if (hour >= meal.fromHour) current = meal.id;
  }
  return current;
}

const EXTRA_CATEGORIES: CategoryId[] = ["grasas", "leguminosas", "azucares"];

function entryKcal(entries: FoodEntry[]): number {
  return entries.reduce((sum, e) => sum + e.kcalPerUnit * e.qty, 0);
}

function StreakCard({ date }: { date: string }) {
  const { current, best } = computeStreaks(date);
  const today = dayAdherence(loadDay(date));
  const todayCounts = today.logged && today.pct >= STREAK_THRESHOLD;
  return (
    <section className="card streak-card">
      <div className="streak-main">
        <span className={`streak-flame ${current > 0 ? "lit" : ""}`}>🔥</span>
        <div>
          <div className="streak-count">
            {current} {plural(current, "día", "días")}
          </div>
          <div className="streak-label">racha de apego</div>
        </div>
      </div>
      <div className="streak-side">
        <div className="streak-today" aria-live="polite">
          Hoy: {today.metGoals}/{today.totalGoals} metas {todayCounts ? "✓" : ""}
        </div>
        <div className="streak-best">
          Mejor racha: {best} {plural(best, "día", "días")}
        </div>
      </div>
    </section>
  );
}

export default function TodayView() {
  const version = useStoreVersion();
  const date = todayKey();
  const log = loadDay(date);
  const { adjust, adjustWater } = useDayActions(date);
  const [openMeal, setOpenMeal] = useState<MealId>(() => currentMealId());
  const [showExtras, setShowExtras] = useState(false);

  const [text, setText] = useState("");
  const [focusToken, setFocusToken] = useState(0);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [flashMeal, setFlashMeal] = useState<MealId | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toastKey = useRef(0);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  // Los atajos salen del historial: cambian cuando cambia lo guardado.
  const shortcuts = useMemo(() => {
    void version;
    try {
      return repeatShortcuts(date);
    } catch {
      return [] as RepeatShortcut[];
    }
  }, [date, version]);

  const showToast = useCallback(
    (message: string, actionLabel?: string, onAction?: () => void) => {
      toastKey.current += 1;
      setToast({ key: toastKey.current, message, actionLabel, onAction });
    },
    []
  );

  const closeSheet = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSheet(null);
  }, []);

  const runParse = useCallback((value: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSheet({ kind: "loading", text: value });
    parseText(value, { signal: controller.signal }).then(
      (outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.status === "ok") {
          setSheet({
            kind: "result",
            text: value,
            meal: outcome.result.meal,
            items: outcome.result.items,
            unknown: outcome.result.unknown,
          });
        } else if (outcome.status === "unknown") {
          setSheet({ kind: "unknown", text: outcome.text });
        } else if (outcome.status === "offline") {
          setSheet({
            kind: "offline",
            text: value,
            resolved: outcome.resolved,
            pending: outcome.pending,
          });
        } else {
          setSheet({ kind: "error", text: value, message: outcome.message });
        }
      },
      (error: unknown) => {
        // Cancelar no es una falla: `parseText` rechaza con `AbortError` (como
        // `fetch`) cuando se aborta la señal, y la hoja ya se cerró o se está
        // reemplazando por otra petición.
        const aborted =
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError");
        if (aborted) return;
        setSheet({
          kind: "error",
          text: value,
          message: error instanceof Error ? error.message : "Falla desconocida",
        });
      }
    );
  }, []);

  // El foco se pide en un turno aparte: al cerrar, la hoja devuelve el foco a
  // quien la abrió y le quita `inert` al fondo. Pedirlo antes no tiene efecto.
  const askFocus = useCallback(() => {
    setTimeout(() => setFocusToken((t) => t + 1), 0);
  }, []);

  const flash = useCallback((meal: MealId) => {
    setFlashMeal(meal);
    setTimeout(() => setFlashMeal(null), 1200);
  }, []);

  const save = useCallback(
    async (meal: MealId, items: ParsedItem[], remember: boolean, note = ""): Promise<boolean> => {
      const entries = toEntries(date, meal, items);
      try {
        await commitEntries(entries, remember);
      } catch {
        // La hoja se queda abierta con el registro intacto: nada se pierde.
        showToast("No se pudo guardar. Inténtalo de nuevo.");
        return false;
      }
      closeSheet();
      setText("");
      flash(meal);
      const kcal = entryKcal(entries);
      showToast(`+${nf(Math.round(kcal))} kcal${note}`, "Deshacer", () => {
        for (const entry of entries) void removeEntry(entry.id).catch(() => {});
      });
      return true;
    },
    [date, closeSheet, flash, showToast]
  );

  const onPortionsOnly = useCallback(() => {
    const meal = currentMealId();
    closeSheet();
    setOpenMeal(meal);
    showToast("Registra las porciones del plan");
    setTimeout(() => {
      document.getElementById(`meal-${meal}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 320);
  }, [closeSheet, showToast]);

  // Limpia la petición en vuelo si la vista se desmonta.
  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="view">
      <header className="day-header">
        <h1>Hoy</h1>
        <p className="date-label">{dateLabel}</p>
      </header>

      <ProgressCard date={date} />

      <StreakCard date={date} />

      {MEALS.map((meal) => {
        const entries = listEntries(date, meal.id);
        const mealLog = log.meals[meal.id] ?? {};
        const targetCats = Object.keys(meal.targets) as CategoryId[];
        const loggedExtras = (Object.keys(mealLog) as CategoryId[]).filter(
          (c) => !targetCats.includes(c)
        );
        const cats = [...targetCats, ...loggedExtras];
        const isOpen = openMeal === meal.id;
        const manual = Object.values(mealLog).reduce((a, b) => a + b, 0);
        const meta = [
          entries.length ? `${nf(Math.round(entryKcal(entries)))} kcal` : "",
          manual > 0 ? `${manual} ${plural(manual, "porción", "porciones")}` : "",
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <section
            key={meal.id}
            id={`meal-${meal.id}`}
            className={`card meal ${isOpen ? "open" : ""} ${flashMeal === meal.id ? "flash" : ""}`}
          >
            <button
              className="meal-head"
              aria-expanded={isOpen}
              onClick={() => setOpenMeal(isOpen ? ("" as MealId) : meal.id)}
            >
              <span className="meal-title">
                {meal.emoji} {meal.name}
              </span>
              <span className="meal-kcal">{meta}</span>
              <span className={`chevron ${isOpen ? "up" : ""}`} aria-hidden="true">
                ▾
              </span>
            </button>

            {entries.length > 0 && (
              <div className="logged">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    className="logged-row"
                    onClick={() => setSheet({ kind: "edit", entry })}
                  >
                    <span className="logged-name">{entry.name}</span>
                    <span className="logged-qty">{unitText(entry.qty, entry.unit)}</span>
                    <span
                      className={`logged-kcal ${entry.source !== "recordado" ? "approx" : ""}`}
                    >
                      {kcalText(entry)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {entries.length === 0 && !isOpen && (
              <p className="meal-empty">Todavía no registras nada aquí</p>
            )}

            {isOpen && (
              <div className="meal-body">
                {cats.length === 0 && <p className="empty-hint">Sin porciones asignadas.</p>}
                {cats.map((cat) => {
                  const info = CATEGORIES[cat];
                  const target = meal.targets[cat] ?? 0;
                  const count = mealLog[cat] ?? 0;
                  return (
                    <div key={cat} className="cat-row">
                      <button
                        className="cat-main"
                        onClick={() => adjust(meal.id, cat, +1)}
                        aria-label={`Agregar porción de ${info.name}`}
                      >
                        <span className="cat-name">
                          {info.name}
                          {info.avoid && <span className="avoid-tag">evitar</span>}
                        </span>
                        <PortionDots count={count} target={target} color={info.color} />
                      </button>
                      <div className="cat-controls">
                        <button
                          className="btn minus"
                          onClick={() => adjust(meal.id, cat, -1)}
                          disabled={count === 0}
                          aria-label={`Quitar porción de ${info.name}`}
                        >
                          −
                        </button>
                        <span className="cat-count">{count}</span>
                        <button
                          className="btn plus"
                          onClick={() => adjust(meal.id, cat, +1)}
                          aria-label={`Agregar porción de ${info.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="extras">
                  <button className="extras-toggle" onClick={() => setShowExtras(!showExtras)}>
                    {showExtras ? "Ocultar otros grupos" : "Registrar otro grupo…"}
                  </button>
                  {showExtras && (
                    <div className="extras-chips">
                      {EXTRA_CATEGORIES.concat(
                        (Object.keys(CATEGORIES) as CategoryId[]).filter(
                          (c) => !EXTRA_CATEGORIES.includes(c)
                        )
                      )
                        .filter((c) => !cats.includes(c))
                        .map((cat) => (
                          <button
                            key={cat}
                            className={`extra-chip ${CATEGORIES[cat].avoid ? "avoid" : ""}`}
                            onClick={() => adjust(meal.id, cat, +1)}
                          >
                            + {CATEGORIES[cat].name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}

      <section className="card water-card">
        <div className="water-head">
          <h2>💧 Agua</h2>
          <span className="water-amount">
            {(log.waterMl / 1000).toFixed(2).replace(/\.?0+$/, "")} L
            <span className="water-goal"> / 2.2–3.4 L</span>
          </span>
        </div>
        <div className="water-bar">
          <div
            className={`water-fill ${log.waterMl >= WATER.minMl ? "ok" : ""}`}
            style={{ width: `${Math.min(100, (log.waterMl / WATER.maxMl) * 100)}%` }}
          />
          <div className="water-min-mark" style={{ left: `${(WATER.minMl / WATER.maxMl) * 100}%` }} />
        </div>
        <div className="water-actions">
          <button
            className="btn minus"
            onClick={() => adjustWater(-WATER.glassMl)}
            aria-label="Quitar un vaso"
            disabled={log.waterMl === 0}
          >
            −
          </button>
          <button className="water-add" onClick={() => adjustWater(WATER.glassMl)}>
            + 1 vaso (250 ml)
          </button>
        </div>
      </section>

      <Composer
        value={text}
        onChange={setText}
        onSubmit={runParse}
        onRepeat={(shortcut: RepeatShortcut) =>
          setSheet({ kind: "result", text: "", meal: shortcut.meal, items: shortcut.items })
        }
        onMic={() => showToast("Dictado por voz — próximamente")}
        shortcuts={shortcuts}
        focusToken={focusToken}
      />

      <ReviewSheet
        state={sheet}
        onClose={closeSheet}
        onCommit={(meal, items, remember) => {
          void save(meal, items, remember, remember ? " · recordado" : "");
        }}
        onSaveEdit={(entry, item) => {
          void updateEntry(entry.id, {
            name: item.name,
            unit: item.unit,
            qty: item.qty,
            kcalPerUnit: item.kcalPerUnit,
            proteinPerUnit: item.proteinPerUnit,
            fatPerUnit: item.fatPerUnit,
            carbsPerUnit: item.carbsPerUnit,
            portions: { ...item.portions },
            source: item.source,
          }).catch(() => showToast("No se pudo guardar el cambio"));
          closeSheet();
          showToast("Cambio guardado");
        }}
        onDelete={(entry) => {
          void removeEntry(entry.id).catch(() => showToast("No se pudo eliminar"));
          closeSheet();
          showToast("Eliminado", "Deshacer", () => {
            void commitEntries([entry], false).catch(() =>
              showToast("No se pudo restaurar el alimento")
            );
          });
        }}
        onSavePartial={(items, pending) => {
          // El fragmento que quedó en cola vuelve al campo: nada se pierde.
          void save(currentMealId(), items, false, " · 1 pendiente").then((ok) => {
            if (!ok) return;
            setText(pending);
            askFocus();
          });
        }}
        onRewrite={(value) => {
          closeSheet();
          setText(value);
          askFocus();
        }}
        onRetry={runParse}
        onPortionsOnly={onPortionsOnly}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
