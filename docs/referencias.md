# Referencias: proyectos de GitHub a reutilizar

Revisado el 2026-09-23. Cada entrada dice qué se toma y qué no. Revisar licencia antes de copiar código.

## 3D anatómico (la pieza más costosa de hacer desde cero)

| Repo | Qué es | Qué reutilizar | Licencia |
|---|---|---|---|
| [AdrianGanJY/human-anatomy-viewer](https://github.com/AdrianGanJY/human-anatomy-viewer) | Explorador 3D con 2.234 meshes de BodyParts3D, selección por clic, búsqueda, capas por sistema, vistas explotadas, aislamiento de estructura, pines de anotación y guardado de escena. React + Three.js + shadcn/ui. | La **pipeline de datos** (`scripts/`, `workers/snap/`) para convertir BodyParts3D a GLB por pieza; el patrón de selección/aislamiento/pines; el esquema de metadatos nombre → concepto. Portar la lógica de escena a TresJS. | Código MIT, datos CC BY 4.0 |
| [ctzurcanu/human-atlas](https://github.com/ctzurcanu/human-atlas) | Variante del anterior que combina Z-Anatomy y Open3DModel (4.391 piezas). | Ver cómo integra Z-Anatomy (mallas retopologizadas, más livianas). | Código MIT, datos CC BY-SA |
| [andreaisabelmontana/3D-Anatomy](https://github.com/andreaisabelmontana/3D-Anatomy) | Herramienta de estudio con estructuras guardadas y presets. React + TS + Three.js. | Idea de "estructuras guardadas" para el progreso del estudiante. | Revisar |
| [Kevin-Mattheus-Moerman/BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D) | Clon de los archivos 3D de BodyParts3D/Anatomography. | **Fuente de la mandíbula** (FJ6399 Mandible) y huesos del cráneo. | CC BY-SA 2.1 JP |
| [Wikimedia: BodyParts3D_FJ6399_Mandible.stl](https://commons.wikimedia.org/wiki/File:BodyParts3D_FJ6399_Mandible.stl) | STL de la mandíbula listo para descargar. | Prototipo rápido de la Fase 1. | CC BY-SA |
| [AnatomyTOOL – mandíbula en corte sagital (Groningen)](https://anatomytool.org/content/groningen-3d-model-anatomy-mandible-and-adjacent-structures-sagittal-cut) | Modelo docente de mandíbula y estructuras adyacentes. | Referencia pedagógica; posible fuente si la licencia lo permite. | Revisar por ítem |

**Decisión:** arrancar con la mandíbula de BodyParts3D, refinarla en Blender separando cóndilo, rama, cuerpo, ángulo y sínfisis como nodos con nombre, exportar GLB con Draco vía `gltf-transform`.

## TresJS y carga de modelos

| Repo / doc | Qué reutilizar |
|---|---|
| [Tresjs/cientos – useGLTF](https://cientos.tresjs.org/guide/loaders/use-gltf.html) | Carga GLB con `draco: true`, acceso a `nodes.value.NombreMesh` para bindear clics por estructura. |
| [Tresjs/cientos – GLTFModel](https://cientos.tresjs.org/guide/loaders/gltf-model) | Componente declarativo si no hace falta acceso a nodos. |
| [OmnomnomTee/gltfvue](https://github.com/OmnomnomTee/gltfvue) | Convierte un GLB en componente Vue/TresJS con cada mesh como elemento propio. Ideal para poner `@click` por nodo de la mandíbula. Equivalente a `gltfjsx` de React. |
| [donmccurdy/three-gltf-viewer](https://github.com/donmccurdy/three-gltf-viewer) | Inspeccionar jerarquía y nombres de nodos del GLB antes de mapearlos. Herramienta, no dependencia. |

## Moléculas (no modelar a mano)

| Repo | Qué reutilizar |
|---|---|
| [molstar/molstar](https://molstar.org/) | Visor de proteínas MIT, TypeScript. Embeber en un componente Vue para RUNX2, BMP-2, RANKL desde PDB. |
| [nglviewer/ngl](https://github.com/nglviewer/ngl) | Alternativa más liviana sobre three.js. `npm install ngl`. |
| [3dmol/3Dmol.js](https://github.com/3dmol/3Dmol.js) | Alternativa simple si solo se necesita mostrar y rotar. |

**Decisión:** Mol* por defecto; NGL si el bundle pesa demasiado.

## Backend FastAPI (único)

| Repo / doc | Qué reutilizar |
|---|---|
| [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) | Plantilla oficial: FastAPI + SQLModel + Alembic + JWT + PostgreSQL + Docker Compose + tests. **Base de `services/api`.** Quitar el frontend React que trae y el flujo de recuperación de contraseña. |
| [SQLModel docs](https://sqlmodel.tiangolo.com/) | Modelos que sirven de tabla y de schema Pydantic a la vez. |
| [WeasyPrint](https://github.com/Kozea/WeasyPrint) | HTML + CSS → PDF para el certificado. |
| [pgvector/pgvector-python](https://github.com/pgvector/pgvector-python) | Integración de pgvector con SQLAlchemy para el RAG en producción. |

**Decisión:** partir de `full-stack-fastapi-template`, simplificar el auth a registro con identificación (sin contraseña por ahora) y añadir los routers de mentor, quiz y RAG dentro del mismo servicio.

**Descartado:** Laravel y sus starter kits (`laravel/vue-starter-kit`, `muradyanvano/laravel-vue-spa-starter-kit`, `gdarko/laravel-vue-starter`). Demasiado pesados para el alcance; el equipo prefiere Python.

## IA y RAG dentro del backend (Claude + ChromaDB/pgvector)

| Repo | Qué reutilizar |
|---|---|
| [ajimmujawar44/fastapi-claude-ai-streaming-api](https://github.com/ajimmujawar44/fastapi-claude-ai-streaming-api) | Patrón SSE con SDK oficial `anthropic`. Base del endpoint `/chat`. |
| [anshul-20/RaG-CHBT](https://github.com/anshul-20/RaG-CHBT) | FastAPI + LangChain + ChromaDB + Claude, PDF con respuestas citadas. Base de `rag/` e `ingest.py`. Quitar Streamlit. |
| [Harishbabu7047/RAG-Langgraph](https://github.com/Harishbabu7047/RAG-Langgraph) | Ingesta multi-formato (PDF, DOCX). Referencia si el syllabus llega en varios formatos. |
| [chihebnabil/claude-ui](https://github.com/chihebnabil/claude-ui) | Chat UI con Claude en Nuxt. Referencia de UX de chat en Vue. |

**Decisión:** tomar el SSE del primero y la ingesta del segundo, e integrarlos como routers `mentor.py` y módulo `rag/` dentro de `services/api`. Usar `@ai-sdk/vue` en el frontend; el backend debe emitir el protocolo de stream del AI SDK o un SSE simple que consuma un composable propio.

## Frontend de chat

| Repo / doc | Qué reutilizar |
|---|---|
| [vercel/ai](https://github.com/vercel/ai) | Solo como referencia de UX de chat. **No se usa `@ai-sdk/vue`**: el proyecto emite un SSE propio (ver `docs/api-contract.md`). |
| [MDN – Using readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams) | Base del composable `useMentor` (`fetch` + `ReadableStream` + `AbortController`). |

## Lo que NO existe hecho y hay que construir

- El mapa nodo GLB → concepto → prompt para la mandíbula (contenido pedagógico).
- La escena de zoom continuo órgano → tejido → célula (no hay repo; se compone con GSAP + escenas separadas).
- El `ContextoPedagogico` y su inyección en prompts.
- Los quizzes generativos con salida estructurada.
- El tool use que devuelve acciones de cámara al frontend.
