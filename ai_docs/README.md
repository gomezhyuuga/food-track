# ai_docs

Documentación de **Mi Dieta** escrita para que un LLM obtenga contexto rápido
antes de tocar el código.

No repite lo que el código ya dice. Recoge las decisiones, los contratos y las
trampas que no se deducen leyendo archivos sueltos.

## Orden de lectura

| Archivo | Cuándo leerlo |
|---|---|
| [00-overview.md](00-overview.md) | Siempre. Qué es el proyecto y su modelo mental. |
| [01-modelo-de-datos.md](01-modelo-de-datos.md) | Antes de tocar RxDB, tipos o apego. |
| [02-pipeline-llm.md](02-pipeline-llm.md) | Antes de tocar el Worker, el prompt o el modelo. |
| [03-frontend.md](03-frontend.md) | Antes de tocar componentes o UX. |
| [04-despliegue.md](04-despliegue.md) | Antes de desplegar, o para probar en local. |
| [05-trampas.md](05-trampas.md) | **Antes de depurar cualquier cosa.** |

Si solo vas a leer uno, lee `05-trampas.md`. Son errores que ya costaron tiempo
en este repo, con su causa y su señal de diagnóstico.

## Documentación para humanos

- `README.md` en la raíz: cómo correr el proyecto.
- `docs/arquitectura.md`: diagramas del sistema.
- `docs/previews.md`: entornos por rama.
- `worker/README.md`: endpoint y despliegue del Worker.
- `CLAUDE.md`: reglas de trabajo, en corto.

## Convenciones

Todo se escribe en español. Los identificadores del código y los mensajes de
commit van en inglés.
