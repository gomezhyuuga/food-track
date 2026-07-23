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

  return (
    <div className="app">
      <main className="content">
        {tab === "hoy" && <TodayView />}
        {tab === "historial" && (
          <HistoryView selectedDate={historyDate} onSelectDate={setHistoryDate} />
        )}
        {tab === "porciones" && <EquivalentsView />}
      </main>
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
  );
}
