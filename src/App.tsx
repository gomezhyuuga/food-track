import { useState } from "react";
import TodayView from "./views/TodayView";
import HistoryView from "./views/HistoryView";
import EquivalentsView from "./views/EquivalentsView";

type Tab = "hoy" | "historial" | "porciones";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "hoy", label: "Hoy", icon: "☀️" },
  { id: "historial", label: "Historial", icon: "📅" },
  { id: "porciones", label: "Porciones", icon: "📖" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("hoy");
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  const showComposer = tab === "hoy";

  return (
    <div className={`app ${showComposer ? "has-composer" : ""}`}>
      <main className="content">
        {tab === "hoy" && <TodayView />}
        {tab === "historial" && (
          <HistoryView selectedDate={historyDate} onSelectDate={setHistoryDate} />
        )}
        {tab === "porciones" && <EquivalentsView />}
      </main>

      {/* La barra de registro y la tab bar comparten contenedor fijo: así el
          fondo completo se puede marcar `inert` mientras la hoja está abierta.
          `#composer-slot` lo llena `Composer` con un portal desde `TodayView`. */}
      <div className="composer-wrap">
        {showComposer && (
          <>
            <div className="composer-fade" />
            <div id="composer-slot" />
          </>
        )}
        <nav className="tabbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
