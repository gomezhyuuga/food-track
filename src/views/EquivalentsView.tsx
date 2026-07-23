import { useState } from "react";
import { CATEGORIES, type CategoryId } from "../data/plan";
import { EQUIVALENTS, FREE_FOODS, MEASURES } from "../data/equivalents";

const ORDER: CategoryId[] = [
  "poa",
  "cereales",
  "frutas",
  "verduras",
  "lacteos",
  "grasas",
  "leguminosas",
  "azucares",
];

export default function EquivalentsView() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<CategoryId | null>("poa");
  const q = query.trim().toLowerCase();

  return (
    <div className="view">
      <header className="day-header">
        <h1>Porciones</h1>
        <p className="date-label">Lista de equivalentes — 1 porción de cada grupo</p>
      </header>

      <input
        className="search"
        type="search"
        placeholder="Buscar alimento… (ej. atún, manzana)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {ORDER.map((cat) => {
        const info = CATEGORIES[cat];
        const items = (EQUIVALENTS[cat] ?? []).filter(
          (item) => !q || item.name.toLowerCase().includes(q)
        );
        if (q && items.length === 0) return null;
        const isOpen = q ? true : open === cat;
        return (
          <section key={cat} className="card">
            <button
              className="meal-head"
              onClick={() => setOpen(open === cat ? null : cat)}
            >
              <span className="meal-title">
                <span className="chip-dot" style={{ background: info.color }} /> {info.name}
                {info.avoid && <span className="avoid-tag">evitar</span>}
                {info.free && <span className="free-tag">libre</span>}
              </span>
              <span className={`chevron ${isOpen ? "up" : ""}`}>▾</span>
            </button>
            {isOpen && (
              <ul className="food-list">
                {items.map((item) => (
                  <li
                    key={item.name}
                    className={`food-item ${item.status === "avoid" ? "avoid" : ""} ${
                      item.status === "star" ? "star" : ""
                    }`}
                  >
                    <span className="food-name">
                      {item.status === "star" && "⭐ "}
                      {item.name}
                      {item.note && <span className="food-note"> ({item.note})</span>}
                    </span>
                    <span className="food-portion">{item.portion}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {!q && (
        <>
          <section className="card">
            <h2>✅ Consumo libre</h2>
            <ul className="food-list">
              {FREE_FOODS.map((f) => (
                <li key={f} className="food-item">
                  <span className="food-name">{f}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2>📏 Medidas</h2>
            <ul className="food-list">
              {MEASURES.map((m) => (
                <li key={m} className="food-item">
                  <span className="food-name">{m}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
