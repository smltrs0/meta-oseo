<script setup lang="ts">
/**
 * Página de módulo (F2-08, F2-10, F2-11): el anfitrión que orquesta secciones, bloques y
 * actividades a partir del `content.json` del módulo.
 *
 *  - Carga el contenido (`cargarModulo`), el progreso y los resultados guardados. NO monta nada
 *    hasta tener el estado previo de las actividades o hasta agotar `ESPERA_ESTADO_PREVIO_MAX_MS`
 *    (contrato de `activities/types.ts`).
 *  - Con `BLOQUEO_SECUENCIAL`, las actividades obligatorias condicionan el avance: la sección
 *    siguiente se abre al superarlas y el módulo siguiente al completar este. Un módulo o una
 *    sección ya completados nunca se vuelven a cerrar. Lo bloqueado se explica, no rebota.
 *  - Persistencia y envíos a la API: `stores/actividades.ts`. Tiempo y sección actual:
 *    `useTiempoModulo`. Contexto del mentor: `stores/contextoPedagogico.ts`.
 *  - La sección abierta vive en la URL (`?s=id_seccion`): el botón «atrás» funciona y se puede
 *    compartir el enlace.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { CircleAlert, LoaderCircle, Lock, Info } from '@lucide/vue';
import { ESPERA_ESTADO_PREVIO_MAX_MS } from '@/activities/types';
import AvisosLogro from '@/components/modulo/AvisosLogro.vue';
import BloqueActividad from '@/components/modulo/BloqueActividad.vue';
import BloqueCallout from '@/components/modulo/BloqueCallout.vue';
import BloqueImagen from '@/components/modulo/BloqueImagen.vue';
import BloqueTabla from '@/components/modulo/BloqueTabla.vue';
import BloqueTexto from '@/components/modulo/BloqueTexto.vue';
import CabeceraModulo from '@/components/modulo/CabeceraModulo.vue';
import GlosarioHoja from '@/components/modulo/GlosarioHoja.vue';
import GlosarioYReferencias from '@/components/modulo/GlosarioYReferencias.vue';
import ModuloCompletado from '@/components/modulo/ModuloCompletado.vue';
import NavegacionSecciones from '@/components/modulo/NavegacionSecciones.vue';
import PieSeccion from '@/components/modulo/PieSeccion.vue';
import TextoRico from '@/components/modulo/TextoRico.vue';
import {
  decidirAccesoModulo,
  mensajeModuloBloqueado,
  pendientesDeSeccion,
  textoPendientes,
  titulosDeActividades,
} from '@/components/modulo/acceso';
import { EVENTO_GLOSARIO } from '@/components/modulo/glosario';
import { useTiempoModulo } from '@/components/modulo/useTiempoModulo';
import { Button } from '@/components/ui/button';
import { BLOQUEO_SECUENCIAL } from '@/config';
import { idDeBloque, visibleParaNivel } from '@/content/consultas';
import { textoPlanoDeMarkdown } from '@/content/markdown';
import { cargarModulo } from '@/content/registry';
import type { ResultadoCarga } from '@/content/registry';
import {
  estadoDeSecciones,
  idsSuperadas,
  moduloCompletado,
  progresoDeModulo,
  puntajeObtenidoModulo,
} from '@/content/scoring';
import type { ModuloContenido, TerminoGlosario } from '@/content/schema';
import { moduloPorNumero } from '@/data/modulos';
import type { NumeroModulo } from '@/data/modulos';
import { useActividadesStore } from '@/stores/actividades';
import { SECCION_INICIAL, useContextoStore } from '@/stores/contextoPedagogico';
import { useProgresoStore } from '@/stores/progreso';

// La ruta (/modulo/:n([1-6])) ya garantiza un número entre 1 y 6.
const props = defineProps<{ n: number }>();

const route = useRoute();
const router = useRouter();
const store = useActividadesStore();
const progreso = useProgresoStore();
const contexto = useContextoStore();

/* -------------------------------------------------------------------------------------------
 * Carga
 * ----------------------------------------------------------------------------------------- */

type Fase = 'cargando' | 'listo' | 'error' | 'sin_contenido';

const fase = ref<Fase>('cargando');
const modulo = ref<ModuloContenido | null>(null);
const mensajeError = ref('');
/** Sección con la que se abrió el módulo cuando la URL no trae `?s=`. */
const indiceBase = ref<number | null>(null);
let cargaActual = 0;

const modulosData = computed(() => moduloPorNumero(props.n));

/** Espera `promesa` como máximo `ms`; nunca rechaza. */
async function esperarComoMaximo(promesa: Promise<unknown>, ms: number): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, ms);
  });
  try {
    await Promise.race([promesa.catch(() => undefined), limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

async function cargar(): Promise<void> {
  const mia = ++cargaActual;
  const n = props.n;
  fase.value = 'cargando';
  modulo.value = null;
  indiceBase.value = null;
  mensajeError.value = '';
  contexto.setModulo(n as NumeroModulo);
  contexto.limpiarInteracciones();
  store.iniciar();

  const [resultado] = await Promise.all([
    cargarModulo(n).catch((): ResultadoCarga => ({
      ok: false,
      motivo: 'error_de_carga',
      mensaje:
        'No pudimos cargar el contenido de este módulo. Revisa tu conexión e inténtalo de nuevo.',
      errores: [],
    })),
    // Nunca rechazan: si la API falla se usa el respaldo local.
    progreso.load(),
  ]);
  if (mia !== cargaActual) return;

  if (!resultado.ok) {
    mensajeError.value = resultado.mensaje;
    fase.value = resultado.motivo === 'sin_contenido' ? 'sin_contenido' : 'error';
    return;
  }

  // El contrato de las actividades: no se montan sin el estado del servidor (o su espera máxima).
  await esperarComoMaximo(store.cargarResultados(n), ESPERA_ESTADO_PREVIO_MAX_MS);
  if (mia !== cargaActual) return;
  modulo.value = resultado.modulo;
  // La sección de arranque (la primera sin terminar) se fija ahora: completar una actividad no
  // debe llevar al estudiante a otra sección por su cuenta.
  indiceBase.value = indiceActual.value;
  fase.value = 'listo';
}

watch(
  () => props.n,
  () => void cargar(),
  { immediate: true },
);

/* -------------------------------------------------------------------------------------------
 * Acceso al módulo
 * ----------------------------------------------------------------------------------------- */

const acceso = computed(() =>
  decidirAccesoModulo(props.n, progreso.modulosCompletados, {
    bloqueoSecuencial: BLOQUEO_SECUENCIAL,
    progresoConocido: progreso.loaded,
  }),
);
const moduloAbierto = computed(() => acceso.value.permitido);
const moduloYaCompletado = computed(() => progreso.estaCompletado(props.n));

/** Aviso al llegar redirigido por el guard de ruta (`?bloqueado=n`). */
const redirigidoDesde = computed(() => {
  const q = route.query.bloqueado;
  const n = Number(Array.isArray(q) ? q[0] : q);
  return Number.isInteger(n) && n !== props.n && moduloPorNumero(n) ? n : null;
});
const textoRedirigido = computed(() => {
  const n = redirigidoDesde.value;
  const requerido = n === null ? undefined : moduloPorNumero(n - 1);
  return n !== null && requerido ? mensajeModuloBloqueado(n, requerido) : '';
});
const textoModuloBloqueado = computed(() => {
  const a = acceso.value;
  return a.permitido ? '' : mensajeModuloBloqueado(props.n, a.requerido);
});
const destinoBloqueo = computed(() => {
  const a = acceso.value;
  return a.permitido ? props.n : a.destino;
});

/* -------------------------------------------------------------------------------------------
 * Estado de secciones
 * ----------------------------------------------------------------------------------------- */

const superadas = computed(() =>
  modulo.value ? idsSuperadas(modulo.value, store.conocidos) : new Set<string>(),
);
/** Un módulo ya completado nunca se vuelve a cerrar. */
const bloqueoActivo = computed(() => BLOQUEO_SECUENCIAL && !moduloYaCompletado.value);

const estados = computed(() =>
  modulo.value
    ? estadoDeSecciones(modulo.value, superadas.value, { bloqueoSecuencial: bloqueoActivo.value })
    : [],
);
const avance = computed(() =>
  modulo.value ? progresoDeModulo(modulo.value, superadas.value) : null,
);
const puntajeObtenido = computed(() =>
  modulo.value ? puntajeObtenidoModulo(modulo.value, store.puntajes) : 0,
);
const completoLocal = computed(() =>
  modulo.value ? moduloCompletado(modulo.value, superadas.value) : false,
);
const secciones = computed(() => modulo.value?.secciones ?? []);

const indiceSolicitado = computed(() => {
  const q = route.query.s;
  const id = Array.isArray(q) ? q[0] : q;
  if (!id) return null;
  const i = secciones.value.findIndex((s) => s.id === id);
  return i >= 0 ? i : null;
});
const indiceActual = computed(() => {
  const i = estados.value.indexOf('actual');
  return i >= 0 ? i : 0;
});
const indice = computed(() => indiceSolicitado.value ?? indiceBase.value ?? indiceActual.value);
const seccion = computed(() => secciones.value[indice.value] ?? null);
const seccionBloqueada = computed(() => estados.value[indice.value] === 'bloqueada');
const mostrando = computed(
  () => fase.value === 'listo' && moduloAbierto.value && !seccionBloqueada.value,
);
const idSeccionMostrada = computed(() => (mostrando.value ? (seccion.value?.id ?? null) : null));

const bloquesVisibles = computed(() =>
  (seccion.value?.bloques ?? []).filter((b) => visibleParaNivel(b, contexto.nivel)),
);

/** Actividades obligatorias que faltan en la sección abierta, en orden. */
const pendientes = computed(() =>
  seccion.value ? pendientesDeSeccion(seccion.value, superadas.value, store.conocidos) : [],
);
/** Pendientes de la sección `actual` (la que hay que terminar para abrir las demás). */
const pendientesActual = computed(() => {
  const s = secciones.value[indiceActual.value];
  return s ? pendientesDeSeccion(s, superadas.value, store.conocidos) : [];
});
const siguienteAbierta = computed(() => {
  const e = estados.value[indice.value + 1];
  return e !== undefined && e !== 'bloqueada';
});

/* ----- Ir a una sección ----- */

function irA(i: number): void {
  const destino = secciones.value[i];
  if (!destino) return;
  avisoBloqueo.value = '';
  void router.push({ name: 'modulo', params: { n: props.n }, query: { s: destino.id } });
}

const avisoBloqueo = ref('');

function alIntentarSeccionBloqueada(i: number): void {
  const s = secciones.value[i];
  const primera = secciones.value[indiceActual.value];
  const falta = textoPendientes(pendientesActual.value);
  avisoBloqueo.value =
    `La sección «${textoPlanoDeMarkdown(s?.titulo ?? '')}» todavía está bloqueada.` +
    (primera
      ? ` Primero termina la sección «${textoPlanoDeMarkdown(primera.titulo)}». ${falta}`
      : '');
}

function irAlPrimeroPendiente(): void {
  const primera = pendientes.value[0];
  if (!primera) return;
  const el = document.getElementById(`actividad-${primera.id}`);
  if (!el) return;
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  desplazarA(el);
}

function preferirMenosMovimiento(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function desplazarA(el: HTMLElement): void {
  el.scrollIntoView?.({ block: 'start', behavior: preferirMenosMovimiento() ? 'auto' : 'smooth' });
}

/* ----- Foco al cambiar de sección ----- */

const tituloSeccion = ref<HTMLElement | null>(null);

watch(indice, (nuevo, previo) => {
  if (nuevo === previo || fase.value !== 'listo') return;
  // Tras el foco que el shell da a <main> al cambiar la ruta.
  setTimeout(() => {
    const el = tituloSeccion.value;
    if (!el) return;
    el.focus({ preventScroll: true });
    desplazarA(el);
  }, 0);
});

/* -------------------------------------------------------------------------------------------
 * Contexto pedagógico
 * ----------------------------------------------------------------------------------------- */

watch(
  idSeccionMostrada,
  (id) => {
    if (id) contexto.setSeccion(id);
  },
  { immediate: true },
);

/* -------------------------------------------------------------------------------------------
 * Tiempo y sección actual (PUT /api/progress/{n})
 * ----------------------------------------------------------------------------------------- */

useTiempoModulo({
  modulo: computed(() => props.n),
  seccion: idSeccionMostrada,
  activo: mostrando,
});

/* -------------------------------------------------------------------------------------------
 * Completar el módulo
 * ----------------------------------------------------------------------------------------- */

/**
 * Si el módulo está completo según los resultados y el servidor aún no lo sabe, pide el `PUT`
 * (el store lo envía cuando no queda ningún `POST` de este módulo pendiente). También reenvía al
 * abrir un módulo que se dejó completo sin que el `PUT` llegara. Tras un 409 se vuelve a pedir
 * cuando la cola de resultados se vacía otra vez (el estudiante repitió lo que faltaba).
 */
watch(
  () =>
    [
      fase.value === 'listo' && completoLocal.value && !moduloYaCompletado.value,
      store.pendientes,
    ] as const,
  ([debeEnviar]) => {
    if (debeEnviar) void store.solicitarCompletar(props.n);
  },
  { immediate: true },
);

const titulosFaltantes = computed(() =>
  modulo.value
    ? titulosDeActividades(modulo.value.secciones, store.faltantesDeModulo(props.n))
    : [],
);
const mostrarCompletado = computed(
  () => mostrando.value && completoLocal.value && indice.value === secciones.value.length - 1,
);
const siguienteModuloAbierto = computed(() => !BLOQUEO_SECUENCIAL || moduloYaCompletado.value);

/* ----- Anuncios para lectores de pantalla (aria-live moderado) ----- */

const mensajeVivo = ref('');
watch(completoLocal, (ahora, antes) => {
  if (fase.value === 'listo' && ahora && !antes) {
    mensajeVivo.value = `Completaste el módulo ${props.n}.`;
  }
});
watch(
  () => estados.value.filter((e) => e === 'completada').length,
  (ahora, antes) => {
    if (fase.value !== 'listo' || ahora <= antes || completoLocal.value) return;
    mensajeVivo.value = BLOQUEO_SECUENCIAL
      ? 'Sección completada. Ya puedes abrir la siguiente.'
      : 'Sección completada.';
  },
);

/* -------------------------------------------------------------------------------------------
 * Glosario
 * ----------------------------------------------------------------------------------------- */

const terminoAbierto = ref<TerminoGlosario | null>(null);
const disparadorGlosario = ref<HTMLElement | null>(null);

function alPedirGlosario(evento: Event): void {
  const id = (evento as CustomEvent<{ id?: string }>).detail?.id;
  const termino = modulo.value?.glosario.find((t) => t.id === id);
  if (!termino) return;
  disparadorGlosario.value = evento.target instanceof HTMLElement ? evento.target : null;
  terminoAbierto.value = termino;
}

function cerrarGlosario(): void {
  terminoAbierto.value = null;
}

onMounted(() => document.addEventListener(EVENTO_GLOSARIO, alPedirGlosario));

/* -------------------------------------------------------------------------------------------
 * Desmontaje
 * ----------------------------------------------------------------------------------------- */

onBeforeUnmount(() => {
  cargaActual++;
  document.removeEventListener(EVENTO_GLOSARIO, alPedirGlosario);
  store.detener();
  // El mentor deja de ver una sección o actividad de un módulo que ya no está en pantalla.
  contexto.setSeccion(SECCION_INICIAL);
});
</script>

<template>
  <div
    class="mx-auto w-full max-w-6xl px-4 py-6 md:py-10"
    :aria-busy="fase === 'cargando' ? 'true' : undefined"
    data-testid="modulo-view"
  >
    <!-- Cargando -->
    <div
      v-if="fase === 'cargando'"
      role="status"
      class="text-muted-foreground flex min-h-40 items-center justify-center gap-3"
      data-testid="modulo-cargando"
    >
      <LoaderCircle class="size-5 motion-safe:animate-spin" aria-hidden="true" />
      Cargando el módulo…
    </div>

    <!-- Error de carga -->
    <div
      v-else-if="fase === 'error'"
      role="alert"
      class="bg-card mx-auto flex max-w-3xl items-start gap-4 rounded-xl border p-5"
      data-testid="modulo-error"
    >
      <CircleAlert class="text-destructive mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div class="space-y-3">
        <h1 class="text-xl font-semibold">No pudimos abrir este módulo</h1>
        <p class="text-muted-foreground">{{ mensajeError }}</p>
        <div class="flex flex-wrap gap-3">
          <Button data-testid="reintentar-carga" @click="cargar">Intentar de nuevo</Button>
          <Button as-child variant="outline">
            <RouterLink :to="{ name: 'inicio' }">Volver al inicio</RouterLink>
          </Button>
        </div>
      </div>
    </div>

    <!-- Módulo sin contenido -->
    <div v-else-if="fase === 'sin_contenido'" class="mx-auto max-w-3xl" data-testid="modulo-vacio">
      <p class="text-muted-foreground text-sm">Módulo {{ n }} de 6</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
        {{ modulosData?.titulo }}
      </h1>
      <p v-if="modulosData" class="mt-3 max-w-prose text-lg leading-relaxed">
        {{ modulosData.foco }}
      </p>
      <div class="bg-card mt-8 flex items-start gap-4 rounded-xl border p-5">
        <Info class="text-primary mt-0.5 size-6 shrink-0" aria-hidden="true" />
        <div class="space-y-2">
          <h2 class="text-xl font-semibold">Este módulo aún no tiene contenido</h2>
          <p class="text-muted-foreground">
            Todavía lo estamos preparando. Mientras tanto puedes estudiar los otros módulos desde el
            menú.
          </p>
          <RouterLink
            :to="{ name: 'inicio' }"
            class="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
          >
            Volver al inicio
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Módulo bloqueado (el guard de ruta falló abierto y el progreso llegó después) -->
    <div
      v-else-if="fase === 'listo' && !moduloAbierto"
      class="bg-card mx-auto flex max-w-3xl items-start gap-4 rounded-xl border p-5"
      data-testid="modulo-bloqueado"
    >
      <Lock class="text-muted-foreground mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div class="space-y-3">
        <h1 class="text-xl font-semibold">Este módulo todavía está bloqueado</h1>
        <p>{{ textoModuloBloqueado }}</p>
        <Button as-child>
          <RouterLink :to="{ name: 'modulo', params: { n: destinoBloqueo } }">
            Ir al módulo {{ destinoBloqueo }}
          </RouterLink>
        </Button>
      </div>
    </div>

    <!-- Módulo -->
    <template v-else-if="modulo && avance">
      <p
        v-if="textoRedirigido"
        class="bg-accent text-accent-foreground mb-6 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        role="status"
        data-testid="aviso-redirigido"
      >
        <Lock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{{ textoRedirigido }}</span>
      </p>

      <CabeceraModulo :modulo="modulo" :avance="avance" :puntaje-obtenido="puntajeObtenido" />

      <p
        v-if="store.errorEnvio"
        class="text-foreground bg-accent mt-4 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        role="status"
        data-testid="error-envio"
      >
        <CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{{ store.errorEnvio }}</span>
      </p>

      <div class="mt-8 gap-8 md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
        <div class="mb-6 md:sticky md:top-20 md:mb-0">
          <NavegacionSecciones
            :secciones="secciones"
            :estados="estados"
            :indice="indice"
            @ir="irA"
            @bloqueada="alIntentarSeccionBloqueada"
          />
          <p
            v-if="avisoBloqueo"
            class="bg-accent text-accent-foreground mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
            role="status"
            data-testid="aviso-seccion-bloqueada"
          >
            <Lock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{{ avisoBloqueo }}</span>
          </p>
        </div>

        <div class="min-w-0">
          <!-- Sección bloqueada: se explica qué falta -->
          <section
            v-if="seccion && seccionBloqueada"
            class="bg-card space-y-3 rounded-xl border p-5"
            aria-labelledby="titulo-seccion"
            data-testid="seccion-bloqueada"
          >
            <h2
              id="titulo-seccion"
              ref="tituloSeccion"
              tabindex="-1"
              class="flex items-center gap-2 font-serif text-2xl font-semibold outline-none"
            >
              <Lock class="text-muted-foreground size-5" aria-hidden="true" />
              Esta sección todavía está bloqueada
            </h2>
            <p>
              Las secciones se estudian en orden. Antes de abrir «{{
                textoPlanoDeMarkdown(seccion.titulo)
              }}» termina la sección «{{
                textoPlanoDeMarkdown(secciones[indiceActual]?.titulo ?? '')
              }}».
            </p>
            <p class="text-muted-foreground">{{ textoPendientes(pendientesActual) }}</p>
            <Button data-testid="ir-a-seccion-actual" @click="irA(indiceActual)">
              Ir a la sección «{{ textoPlanoDeMarkdown(secciones[indiceActual]?.titulo ?? '') }}»
            </Button>
          </section>

          <!-- Sección abierta -->
          <section
            v-else-if="seccion"
            :key="seccion.id"
            class="min-w-0 space-y-6"
            aria-labelledby="titulo-seccion"
            data-testid="seccion"
            :data-seccion="seccion.id"
          >
            <header class="space-y-1">
              <h2
                id="titulo-seccion"
                ref="tituloSeccion"
                tabindex="-1"
                class="scroll-mt-20 font-serif text-2xl font-semibold outline-none md:text-3xl"
              >
                {{ seccion.titulo }}
              </h2>
              <p v-if="seccion.resumen" class="text-muted-foreground max-w-prose">
                <TextoRico :texto="seccion.resumen" modo="linea" />
              </p>
            </header>

            <template v-for="bloque in bloquesVisibles" :key="idDeBloque(bloque)">
              <BloqueTexto v-if="bloque.tipo === 'texto'" :bloque="bloque" />
              <BloqueCallout v-else-if="bloque.tipo === 'callout'" :bloque="bloque" />
              <BloqueImagen v-else-if="bloque.tipo === 'imagen'" :bloque="bloque" />
              <BloqueTabla v-else-if="bloque.tipo === 'tabla'" :bloque="bloque" />
              <BloqueActividad
                v-else-if="bloque.tipo === 'actividad'"
                :actividad="bloque.actividad"
                :modulo="n as NumeroModulo"
              />
            </template>

            <PieSeccion
              :indice="indice"
              :total="secciones.length"
              :siguiente-abierta="siguienteAbierta"
              :texto-pendiente="textoPendientes(pendientes)"
              :hay-pendiente="pendientes.length > 0"
              @anterior="irA(indice - 1)"
              @siguiente="irA(indice + 1)"
              @ir-a-pendiente="irAlPrimeroPendiente"
            />

            <ModuloCompletado
              v-if="mostrarCompletado"
              :numero="n"
              :puntaje-obtenido="puntajeObtenido"
              :puntaje-maximo="avance.puntajeMaximo"
              :guardado="moduloYaCompletado"
              :faltantes="titulosFaltantes"
              :siguiente-abierto="siguienteModuloAbierto"
            />
          </section>
        </div>
      </div>

      <GlosarioYReferencias :modulo="modulo" />
      <GlosarioHoja
        :termino="terminoAbierto"
        :disparador="disparadorGlosario"
        @cerrar="cerrarGlosario"
      />
    </template>

    <AvisosLogro />
    <p class="sr-only" role="status" aria-live="polite" data-testid="anuncio-vivo">
      {{ mensajeVivo }}
    </p>
  </div>
</template>
