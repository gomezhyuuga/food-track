import { CATEGORIES, DAILY_TARGETS, type CategoryId } from "../data/plan";
import { totalPortions } from "../adherence";
import { dayMacros, getSettings, listEntries, loadDay } from "../store";
import { nf } from "./format";

function pct(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.min(100, (value / max) * 100).toFixed(1)}%`;
}

interface Props {
  date: string;
}

/**
 * Un solo bloque de "cómo voy": arriba las porciones del plan de la nutrióloga
 * —que es la meta real— y debajo las calorías y macros, que son el detalle.
 */
export default function ProgressCard({ date }: Props) {
  const log = loadDay(date);
  const macros = dayMacros(date);
  const goals = getSettings();
  const estimated = listEntries(date).some((e) => e.source !== "recordado");

  const bars: { name: string; value: number; goal: number; color: string }[] = [
    { name: "Proteína", value: macros.protein, goal: goals.proteinGoal, color: "var(--prot)" },
    { name: "Grasa", value: macros.fat, goal: goals.fatGoal, color: "var(--fat)" },
    { name: "Carbos", value: macros.carbs, goal: goals.carbsGoal, color: "var(--carb)" },
  ];

  return (
    <section className="card progress-card">
      <div className="plan-block">
        <h2>Porciones vs. plan</h2>
        <div className="summary-grid">
          {(Object.entries(DAILY_TARGETS) as [CategoryId, number][]).map(([cat, target]) => {
            const info = CATEGORIES[cat];
            // Mismo número que usa la racha: manual + alimentos, redondeado.
            const count = totalPortions(log, cat);
            const done = target > 0 && count === target;
            const over = target > 0 && count > target;
            return (
              <div key={cat} className={`summary-chip ${over ? "over" : done ? "done" : ""}`}>
                <span className="chip-dot" style={{ background: info.color }} />
                <span className="chip-name">{info.shortName}</span>
                <span className="chip-count">
                  {count}
                  {target > 0 ? `/${target}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="kcal-block">
        <div className="totals-head">
          <span className="kcal-now" aria-live="polite">
            {nf(Math.round(macros.kcal))}
          </span>
          <span className="kcal-goal">de {nf(goals.kcalGoal)} kcal</span>
        </div>
        <div className="bar">
          <div className="bar-fill" style={{ width: pct(macros.kcal, goals.kcalGoal) }} />
        </div>
        <p className="kcal-note">
          Quedan <b>{nf(Math.max(0, Math.round(goals.kcalGoal - macros.kcal)))}</b>
          {estimated ? " · incluye estimaciones" : ""}
        </p>

        <div className="macros">
          {bars.map((b) => (
            <div className="macro-row" key={b.name}>
              <span className="macro-name">{b.name}</span>
              <span className="macro-bar">
                <i style={{ width: pct(b.value, b.goal), background: b.color }} />
              </span>
              <span className="macro-val">
                <b>{nf(Math.round(b.value))}</b> / {nf(b.goal)} g
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
