import { CATEGORIES, DAILY_TARGETS, MEALS, WATER, type CategoryId } from "../data/plan";
import { listLoggedDates, loadDay, mealTotal, todayKey, useStoreVersion } from "../store";
import PortionDots from "../components/PortionDots";

function adherence(date: string): { pct: number; logged: boolean } {
  const log = loadDay(date);
  const targets = (Object.entries(DAILY_TARGETS) as [CategoryId, number][]).filter(
    ([, t]) => t > 0
  );
  let met = 0;
  let logged = log.waterMl > 0;
  for (const [cat, target] of targets) {
    const count = mealTotal(log, cat);
    if (count > 0) logged = true;
    if (count === target) met++;
  }
  return { pct: targets.length ? met / targets.length : 0, logged };
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

interface Props {
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
}

export default function HistoryView({ selectedDate, onSelectDate }: Props) {
  useStoreVersion();
  const dates = listLoggedDates().filter((d) => d !== todayKey());

  if (selectedDate) {
    const log = loadDay(selectedDate);
    return (
      <div className="view">
        <header className="day-header">
          <button className="back-btn" onClick={() => onSelectDate(null)}>
            ← Historial
          </button>
          <h1>{formatDate(selectedDate)}</h1>
        </header>
        {MEALS.map((meal) => {
          const mealLog = log.meals[meal.id] ?? {};
          const cats = Object.keys(mealLog) as CategoryId[];
          if (cats.length === 0) return null;
          return (
            <section key={meal.id} className="card">
              <h2>
                {meal.emoji} {meal.name}
              </h2>
              {cats.map((cat) => (
                <div key={cat} className="cat-row readonly">
                  <span className="cat-name">{CATEGORIES[cat].name}</span>
                  <PortionDots
                    count={mealLog[cat] ?? 0}
                    target={meal.targets[cat] ?? 0}
                    color={CATEGORIES[cat].color}
                  />
                </div>
              ))}
            </section>
          );
        })}
        <section className="card">
          <h2>💧 Agua</h2>
          <p className="water-amount">
            {(log.waterMl / 1000).toFixed(2).replace(/\.?0+$/, "")} L{" "}
            <span className="water-goal">/ meta {WATER.minMl / 1000}–{WATER.maxMl / 1000} L</span>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="view">
      <header className="day-header">
        <h1>Historial</h1>
        <p className="date-label">Días anteriores registrados</p>
      </header>
      {dates.length === 0 && (
        <section className="card">
          <p className="empty-hint">
            Aún no hay días anteriores. Los días registrados aparecerán aquí.
          </p>
        </section>
      )}
      {dates.map((date) => {
        const { pct, logged } = adherence(date);
        return (
          <button key={date} className="card history-row" onClick={() => onSelectDate(date)}>
            <span className="history-date">{formatDate(date)}</span>
            <span className="history-meta">
              {logged ? (
                <>
                  <span
                    className={`adherence ${pct >= 1 ? "full" : pct >= 0.5 ? "mid" : "low"}`}
                  >
                    {Math.round(pct * 100)}%
                  </span>
                  <span className="history-hint">apego</span>
                </>
              ) : (
                <span className="history-hint">sin registro</span>
              )}
            </span>
            <span className="chevron">›</span>
          </button>
        );
      })}
    </div>
  );
}
