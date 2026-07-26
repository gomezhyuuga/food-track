import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initStore } from "./store";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

// RxDB abre de forma asíncrona: se espera al primer snapshot para que las
// vistas puedan seguir leyendo los días de forma síncrona.
initStore().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    ),
  (err) => {
    // Sin base no hay app: mejor decirlo que caer a memoria y perder registros.
    console.error("No se pudo abrir la base de datos local", err);
    root.render(
      <div className="app">
        <main className="content">
          <div className="view">
            <header className="day-header">
              <h1>No se pudo abrir la base</h1>
            </header>
            <section className="card">
              <p className="empty-hint">
                Mi Dieta guarda tus registros en el almacenamiento del navegador (IndexedDB).
                Revisa que no estés en modo privado y que el sitio tenga permiso para guardar
                datos, y vuelve a cargar la página.
              </p>
            </section>
          </div>
        </main>
      </div>
    );
  }
);

if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
