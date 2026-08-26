import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => {
  // Red de seguridad: `VITE_PARSE_URL` se incrusta en el bundle en tiempo de
  // build. Si apunta a localhost y se construye para desplegar, producción
  // acabaría llamando a una máquina que no existe — y el error solo aparecería
  // en el navegador del usuario, no aquí.
  const parseUrl = process.env.VITE_PARSE_URL;
  if (command === "build" && parseUrl && /localhost|127\.0\.0\.1/.test(parseUrl)) {
    throw new Error(
      `VITE_PARSE_URL apunta a localhost (${parseUrl}). ` +
        "Borra .env.local antes de construir para desplegar. " +
        "Para probar en local no hace falta: `npm run preview` sirve la app y /parse juntos."
    );
  }

  return {
    plugins: [react()],
    base: "./",
  };
});
