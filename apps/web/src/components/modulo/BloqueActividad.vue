<script setup lang="ts">
/**
 * Anfitrión de una actividad: la dibuja con el componente que da el registro (`registro.ts`), le
 * pasa el estado previo y traduce sus eventos al resto de la aplicación:
 *
 *  - `progreso`     -> instantánea en el navegador (se descarta si llega tarde, tras `completada`).
 *  - `interaccion`  -> `ContextoPedagogico.interaccionesRecientes` y, si selecciona algo,
 *                      `estructuraSeleccionada` / `moleculaSeleccionada` (para el mentor).
 *  - `completada`   -> `POST /api/activities/{id}/result` (con cola de reintento) y el contexto.
 *
 * Una actividad ya superada al abrir la página se muestra en modo `revisar` (respuestas
 * correctas, sin puntuar) con un botón para practicarla de nuevo. El componente se monta solo
 * cuando la página ya tiene el estado del servidor (o agotó la espera): ver `ModuloView.vue`.
 */
import { computed, ref } from 'vue';
import { CircleCheck, CircleDot, RotateCcw } from '@lucide/vue';
import { componenteDeActividad } from '@/activities/registro';
import { describirInteraccion, intentoInicial, seleccionDeInteraccion } from '@/activities/types';
import type {
  EstadoPrevioActividad,
  InteraccionActividad,
  ModoActividad,
  ProgresoActividad,
  ResultadoActividad,
} from '@/activities/types';
import { Button } from '@/components/ui/button';
import { textoPlanoDeMarkdown } from '@/content/markdown';
import { actividadSuperada } from '@/content/scoring';
import type { Actividad } from '@/content/schema';
import type { NumeroModulo } from '@/data/modulos';
import { useActividadesStore } from '@/stores/actividades';
import { useContextoStore } from '@/stores/contextoPedagogico';

const props = defineProps<{ actividad: Actividad; modulo: NumeroModulo }>();

const store = useActividadesStore();
const contexto = useContextoStore();

const componente = computed(() => componenteDeActividad(props.actividad.tipo));
const tituloPlano = computed(() => textoPlanoDeMarkdown(props.actividad.titulo));

const resultado = computed(() => store.resultados[props.actividad.id]);
const conocido = computed(() =>
  resultado.value
    ? { completada: resultado.value.completada, mejorPrecision: resultado.value.precision }
    : undefined,
);
const superada = computed(() => actividadSuperada(props.actividad, conocido.value));
const completada = computed(() => resultado.value?.completada === true);

/** Instantánea del intento a medias, leída UNA vez al montar (no se relee cada vez que se guarda). */
const progresoInicial = ref<ProgresoActividad | undefined>(
  store.leerInstantanea(props.actividad.id),
);
const modo = ref<ModoActividad>(superada.value ? 'revisar' : 'jugar');
const montaje = ref(0);

const estadoPrevio = computed<EstadoPrevioActividad>(() => ({
  servidor: store.servidorDe(props.actividad.id),
  progreso: progresoInicial.value,
}));

/** Intentos que se cuentan en el contexto: el de la ejecución en curso. */
const intentosEnCurso = ref(intentoInicial(estadoPrevio.value));

function marcarActual(intentos: number = intentosEnCurso.value): void {
  intentosEnCurso.value = intentos;
  contexto.setActividad({
    id: props.actividad.id,
    tipo: props.actividad.tipo,
    intentos: Math.max(0, intentos),
    completada: completada.value,
  });
}

function alProgreso(progreso: ProgresoActividad): void {
  if (modo.value !== 'jugar') return;
  store.guardarProgreso(props.actividad.id, progreso);
  intentosEnCurso.value = progreso.intentos;
}

function alInteraccion(interaccion: InteraccionActividad): void {
  if (modo.value !== 'jugar') return;
  contexto.registrarInteraccion(describirInteraccion(interaccion));
  const seleccion = seleccionDeInteraccion(interaccion);
  if (seleccion?.estructura !== undefined) contexto.setEstructura(seleccion.estructura);
  if (seleccion?.molecula !== undefined) contexto.setMolecula(seleccion.molecula);
  marcarActual();
}

function alCompletar(resultadoActividad: ResultadoActividad): void {
  if (modo.value !== 'jugar') return;
  progresoInicial.value = undefined;
  void store.registrarCompletada(props.actividad, props.modulo, resultadoActividad);
  intentosEnCurso.value = resultadoActividad.intentos;
  contexto.setActividad({
    id: props.actividad.id,
    tipo: props.actividad.tipo,
    intentos: resultadoActividad.intentos,
    completada: true,
  });
}

function practicarDeNuevo(): void {
  progresoInicial.value = undefined;
  intentosEnCurso.value = intentoInicial(estadoPrevio.value);
  modo.value = 'jugar';
  montaje.value++;
  contexto.registrarInteraccion(
    describirInteraccion({ accion: 'reinicia_actividad', objeto: props.actividad.id }),
  );
}
</script>

<template>
  <section
    :id="`actividad-${actividad.id}`"
    :aria-label="`Actividad: ${tituloPlano}`"
    class="bg-card scroll-mt-20 space-y-3 rounded-xl border p-4 shadow-xs md:p-5"
    :data-actividad="actividad.id"
    data-testid="bloque-actividad"
    @focusin="marcarActual()"
    @pointerdown.capture="marcarActual()"
  >
    <p
      class="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      data-testid="estado-actividad"
    >
      <span class="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 font-medium">
        {{ actividad.obligatoria ? 'Obligatoria' : 'Opcional' }}
      </span>
      <span v-if="superada" class="text-success inline-flex items-center gap-1 font-medium">
        <CircleCheck class="size-4" aria-hidden="true" />
        Completada · {{ resultado?.puntaje ?? 0 }} de {{ actividad.puntaje_max }} puntos
      </span>
      <span
        v-else-if="completada"
        class="text-eosina inline-flex items-center gap-1 font-medium"
        data-testid="requiere-precision"
      >
        <RotateCcw class="size-4" aria-hidden="true" />
        Terminada, pero necesita al menos
        {{ Math.round((actividad.aprobacion_min ?? 0) * 100) }} % de acierto para contar
      </span>
      <span v-else class="inline-flex items-center gap-1">
        <CircleDot class="size-4" aria-hidden="true" />
        {{ actividad.obligatoria ? 'Pendiente' : 'Sin hacer' }} · vale
        {{ actividad.puntaje_max }} puntos
      </span>
    </p>

    <component
      :is="componente"
      :key="montaje"
      :actividad="actividad"
      :modulo="modulo"
      :modo="modo"
      :estado-previo="estadoPrevio"
      @progreso="alProgreso"
      @interaccion="alInteraccion"
      @completada="alCompletar"
    />

    <div
      v-if="modo === 'revisar'"
      class="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
      data-testid="modo-revisar"
    >
      <p class="text-muted-foreground text-sm">
        Ya la completaste: aquí ves las respuestas correctas. Practicar de nuevo no baja tu puntaje.
      </p>
      <Button variant="outline" @click="practicarDeNuevo">
        <RotateCcw aria-hidden="true" />
        Practicar de nuevo
      </Button>
    </div>
  </section>
</template>
