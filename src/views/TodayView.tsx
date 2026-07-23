import { useMemo, useState } from "react";
import { CATEGORIES, DAILY_TARGETS, MEALS, WATER, type CategoryId, type MealId } from "../data/plan";
import { loadDay, mealTotal, todayKey, useDayActions, useStoreVersion } from "../store";
import { computeStreaks, dayAdherence, STREAK_THRESHOLD } from "../adherence";
import PortionDots from "../components/PortionDots";

function currentMealId(): MealId {
  const hour = new Date().getHours();
  let current: MealId = MEALS[0].id;
  for (const meal of MEALS) {
    if (hour >= meal.fromHour) current = meal.id;
  }
  return current;
}

const EXTRA_CATEGORIES: CategoryId[] = ["grasas", "leguminosas", "azucares"];

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
            {current} {current === 1 ? "día" : "días"}
          </div>
          <div className="streak-label">racha de apego</div>
        </div>
      </div>
      <div className="streak-side">
        <div className="streak-today">
          Hoy: {today.metGoals}/{today.totalGoals} metas {todayCounts ? "✓" : ""}
        </div>
        <div className="streak-best">Mejor racha: {best} {best === 1 ? "día" : "días"}</div>
      </div>
    </section>
  );
}

export default function TodayView() {
  useStoreVersion();
  const date = todayKey();
  const log = loadDay(date);
  const { adjust, adjustWater } = useDayActions(date);
  const [openMeal, setOpenMeal] = useState<MealId>(() => currentMealId());
  const [showExtras, setShowExtras] = useState(false);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  return (
    <div className="view">
      <header className="day-header">
        <h1>Hoy</h1>
        <p className="date-label">{dateLabel}</p>
      </header>

      <StreakCard date={date} />

      <section className="summary card">
        <h2>Resumen del día</h2>
        <div className="summary-grid">
          {(Object.entries(DAILY_TARGETS) as [CategoryId, number][]).map(([cat, target]) => {
            const info = CATEGORIES[cat];
            const count = mealTotal(log, cat);
            const over = target !== -1 && count > target;
            const done = target !== -1 && count === target;
            return (
              <div key={cat} className={`summary-chip ${over ? "over" : done ? "done" : ""}`}>
                <span className="chip-dot" style={{ background: info.color }} />
                <span className="chip-name">{info.shortName}</span>
                <span className="chip-count">
                  {count}
                  {target !== -1 ? `/${target}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </section>

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
          <button className="btn minus" onClick={() => adjustWater(-WATER.glassMl)}>
            −
          </button>
          <button className="btn water-add" onClick={() => adjustWater(WATER.glassMl)}>
            + 1 vaso (250 ml)
          </button>
        </div>
      </section>

      {MEALS.map((meal) => {
        const mealLog = log.meals[meal.id] ?? {};
        const targetCats = Object.keys(meal.targets) as CategoryId[];
        const loggedExtras = (Object.keys(mealLog) as CategoryId[]).filter(
          (c) => !targetCats.includes(c)
        );
        const cats = [...targetCats, ...loggedExtras];
        const isOpen = openMeal === meal.id;
        const totalLogged = Object.values(mealLog).reduce((a, b) => a + b, 0);
        return (
          <section key={meal.id} className={`card meal ${isOpen ? "open" : ""}`}>
            <button
              className="meal-head"
              onClick={() => setOpenMeal(isOpen ? ("" as MealId) : meal.id)}
            >
              <span className="meal-title">
                {meal.emoji} {meal.name}
              </span>
              <span className="meal-count">{totalLogged > 0 ? `${totalLogged} porciones` : ""}</span>
              <span className={`chevron ${isOpen ? "up" : ""}`}>▾</span>
            </button>
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
                        >
                          −
                        </button>
                        <span className="cat-count">{count}</span>
                        <button className="btn plus" onClick={() => adjust(meal.id, cat, +1)}>
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
    </div>
  );
}
