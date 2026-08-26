import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RepeatShortcut } from "../api";
import { nf } from "./format";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onRepeat: (shortcut: RepeatShortcut) => void;
  onMic: () => void;
  shortcuts: RepeatShortcut[];
  /** Cambia de valor para pedir el foco (p. ej. al elegir "Reescribir"). */
  focusToken: number;
}

/**
 * Barra de registro anclada sobre la tab bar. Se monta dentro de
 * `#composer-slot` (lo pinta `App`) para compartir el mismo contenedor fijo que
 * la tab bar: así el fondo entero puede marcarse `inert` cuando abre la hoja.
 */
export default function Composer({
  value,
  onChange,
  onSubmit,
  onRepeat,
  onMic,
  shortcuts,
  focusToken,
}: Props) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("composer-slot"));
  }, []);

  // El alto del pie cambia con los atajos y con el textarea multilínea. Se
  // publica como variable CSS para que el contenido reserve exactamente eso.
  useEffect(() => {
    const wrap = slot?.closest(".composer-wrap");
    if (!wrap) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--composer-h",
        `${wrap.getBoundingClientRect().height}px`
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--composer-h");
    };
  }, [slot]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [value]);

  useEffect(() => {
    if (!focusToken) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusToken]);

  if (!slot) return null;

  const empty = !value.trim();
  const submit = () => {
    if (!empty) onSubmit(value.trim());
  };

  return createPortal(
    <div className="composer-inner">
      {shortcuts.length > 0 && (
        <div className="shortcuts">
          {shortcuts.map((s) => (
            <button key={`${s.meal}-${s.label}`} className="shortcut" onClick={() => onRepeat(s)}>
              <span aria-hidden="true">↺</span>
              {s.label.replace(/^↺\s*/, "")}
              <span className="sc-kcal">{nf(Math.round(s.kcal))} kcal</span>
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          placeholder="¿Qué comiste?"
          aria-label="Describe lo que comiste"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="icon-btn" onClick={onMic} aria-label="Dictar por voz">
          🎙️
        </button>
        <button className="icon-btn send" onClick={submit} disabled={empty} aria-label="Registrar">
          ↑
        </button>
      </div>
    </div>,
    slot
  );
}
