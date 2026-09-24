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

## Backend Laravel + Vue

| Repo | Qué reutilizar |
|---|---|
| [laravel/vue-starter-kit](https://github.com/laravel/vue-starter-kit) | Oficial. Vue 3 + TS + Tailwind + shadcn-vue. Usa Inertia, que no queremos en una SPA separada; sirve como referencia de componentes shadcn-vue. |
| [muradyanvano/laravel-vue-spa-starter-kit](https://github.com/muradyanvano/laravel-vue-spa-starter-kit) | **Candidato principal.** SPA sin Inertia: Vue Router + Fortify + Sanctum + Vite + TS. Es exactamente la separación frontend/backend del plan. |
| [gdarko/laravel-vue-starter](https://github.com/gdarko/laravel-vue-starter) | Sanctum cookie-based, Pinia, Tailwind 4, roles/permisos, y trae skills para Claude Code. Alternativa si se quiere panel docente listo. |

**Decisión:** partir de `muradyanvano/laravel-vue-spa-starter-kit` y mover el frontend a `apps/web` en el monorepo.

## Microservicio IA (FastAPI + Claude + RAG)

| Repo | Qué reutilizar |
|---|---|
| [ajimmujawar44/fastapi-claude-ai-streaming-api](https://github.com/ajimmujawar44/fastapi-claude-ai-streaming-api) | Patrón SSE con SDK oficial `anthropic`. Base del endpoint `/chat`. |
| [anshul-20/RaG-CHBT](https://github.com/anshul-20/RaG-CHBT) | FastAPI + LangChain + ChromaDB + Claude, PDF con respuestas citadas. Base de `rag/` e `ingest.py`. Quitar Streamlit. |
| [Harishbabu7047/RAG-Langgraph](https://github.com/Harishbabu7047/RAG-Langgraph) | Ingesta multi-formato (PDF, DOCX). Referencia si el syllabus llega en varios formatos. |
| [chihebnabil/claude-ui](https://github.com/chihebnabil/claude-ui) | Chat UI con Claude en Nuxt. Referencia de UX de chat en Vue. |

**Decisión:** escribir el servicio propio tomando el SSE del primero y la ingesta del segundo. Usar `@ai-sdk/vue` en el frontend; el backend FastAPI debe emitir el protocolo de stream del AI SDK o un SSE simple que consuma un composable propio.

## Frontend de chat

| Repo / doc | Qué reutilizar |
|---|---|
| [vercel/ai](https://github.com/vercel/ai) | `@ai-sdk/vue` con `useChat`. Ver `examples/` para Vue/Nuxt. |
| [AI SDK – Getting started Nuxt](https://ai-sdk.dev/docs/getting-started/nuxt) | Guía oficial de `useChat` en Vue. |

## Lo que NO existe hecho y hay que construir

- El mapa nodo GLB → concepto → prompt para la mandíbula (contenido pedagógico).
- La escena de zoom continuo órgano → tejido → célula (no hay repo; se compone con GSAP + escenas separadas).
- El `ContextoPedagogico` y su inyección en prompts.
- Los quizzes generativos con salida estructurada.
- El tool use que devuelve acciones de cámara al frontend.
