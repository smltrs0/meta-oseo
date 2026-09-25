<script setup lang="ts">
/**
 * Video real del docente (video-texto, medio "video").
 *
 *  - `<video controls preload="none" playsinline>`, sin autoplay, con las pistas de subtítulos del
 *    contenido (la de `es` activada por defecto) y la transcripción a la vista.
 *  - "Visto" es la suma de las duraciones de `video.played` dividida por la duración REAL del
 *    elemento: saltar con la barra no suma. Al llegar a `UMBRAL_VIDEO_VISTO` se completa
 *    (`via: 'video'`). Quien no puede o no quiere verlo lo completa con "Ya leí la transcripción"
 *    (`via: 'transcripcion'`).
 *  - Un intento a medias restaura la fracción ya vista (el navegador no conserva `played` tras una
 *    recarga): puede repetir tramos ya vistos, pero nunca completa sin ver algo en esta sesión.
 *  - Carga y error tienen texto propio; si el video falla, la transcripción sigue disponible.
 *
 * Como `PanelAnimacion`, solo avisa; `ActividadVideoTexto.vue` decide qué se emite al contrato.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { LoaderCircle, TriangleAlert } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { UMBRAL_VIDEO_VISTO } from '@/activities/types';
import type { DetalleVideoTexto, InteraccionActividad, JsonObjeto } from '@/activities/types';
import type { ConfigVideo } from '@/content/schema';
import { leerInstantaneaVideo } from './instantanea';
import TextoMarkdown from './TextoMarkdown.vue';
import {
  alcanzaUmbral,
  formatearTiempo,
  fraccionVista,
  indicePistaPorDefecto,
  limitarFraccion,
  redondear2,
} from './video';

const props = defineProps<{
  config: ConfigVideo;
  /** Título de la actividad, para el nombre accesible del video. */
  titulo: string;
  /** En `revisar` no se mide ni se ofrece completar. */
  jugando: boolean;
  instantanea?: JsonObjeto;
}>();

const emit = defineEmits<{
  progreso: [avance: number, instantanea: JsonObjeto];
  interaccion: [interaccion: InteraccionActividad];
  completar: [detalle: DetalleVideoTexto];
  anunciar: [mensaje: string];
}>();

const video = ref<HTMLVideoElement | null>(null);
/** Cambia al reiniciar: un `<video>` nuevo empieza con `played` vacío. */
const ejecucion = ref(0);
const estado = ref<'inactivo' | 'cargando' | 'listo' | 'error'>('inactivo');

const base = ref(0);
const visto = ref(0);
let completado = false;
let movido = false;
let ultimoEmitido = -1;

const pistaPorDefecto = computed(() => indicePistaPorDefecto(props.config.subtitulos));
const porcentaje = computed(() => Math.round(visto.value * 100));
const umbralPorcentaje = Math.round(UMBRAL_VIDEO_VISTO * 100);

watch(
  () => props.instantanea,
  (instantanea) => {
    if (movido) return;
    base.value = leerInstantaneaVideo(instantanea) ?? 0;
    visto.value = base.value;
  },
  { immediate: true, deep: true },
);

function finalizar(via: 'video' | 'transcripcion'): void {
  if (completado) return;
  completado = true;
  emit('completar', { medio: 'video', visto: redondear2(visto.value), via });
}

/** Recalcula lo visto a partir de `played` y avisa si cambió o si llegó al umbral. */
function medir(): void {
  const el = video.value;
  if (!el || !props.jugando) return;
  const total = Math.max(
    visto.value,
    limitarFraccion(base.value + fraccionVista(el.played, el.duration)),
  );
  visto.value = total;
  const redondeado = redondear2(total);
  if (alcanzaUmbral(total)) {
    finalizar('video');
    return;
  }
  if (redondeado !== ultimoEmitido) {
    ultimoEmitido = redondeado;
    emit('progreso', limitarFraccion(total / UMBRAL_VIDEO_VISTO), { visto: redondeado });
  }
}

function alReproducir(): void {
  movido = true;
  estado.value = 'listo';
  emit('interaccion', { accion: 'reproduce_video' });
}

function alPausar(): void {
  medir();
}

function alTerminar(): void {
  medir();
}

function alCargar(): void {
  if (estado.value !== 'error') estado.value = 'cargando';
}

function alEstarListo(): void {
  if (estado.value !== 'error') estado.value = 'listo';
}

function alFallar(): void {
  estado.value = 'error';
}

function reintentar(): void {
  estado.value = 'cargando';
  video.value?.load();
}

function irAHito(segundos: number, titulo: string): void {
  const el = video.value;
  if (!el) return;
  el.currentTime = segundos;
  emit('anunciar', `Video en el minuto ${formatearTiempo(segundos)}: ${titulo}.`);
}

function marcarTranscripcionLeida(): void {
  if (!props.jugando) return;
  movido = true;
  finalizar('transcripcion');
}

function detenerVideo(): void {
  try {
    video.value?.pause();
  } catch {
    // Un elemento sin implementación de `pause` (entornos sin medios) no debe romper el desmontaje.
  }
}

onBeforeUnmount(detenerVideo);

/** Vuelve a empezar: un `<video>` nuevo (sin `played`) y contadores en cero. */
function reiniciar(): void {
  detenerVideo();
  completado = false;
  movido = false;
  base.value = 0;
  visto.value = 0;
  ultimoEmitido = -1;
  estado.value = 'inactivo';
  ejecucion.value += 1;
}

defineExpose({ reiniciar });
</script>

<template>
  <div class="grid gap-4" data-testid="panel-video">
    <div class="relative overflow-hidden rounded-xl border border-input bg-black">
      <video
        :key="ejecucion"
        ref="video"
        controls
        playsinline
        preload="none"
        :poster="config.poster"
        :aria-label="`Video: ${titulo}`"
        class="block h-auto w-full"
        data-testid="video"
        @play="alReproducir"
        @pause="alPausar"
        @ended="alTerminar"
        @timeupdate="medir"
        @seeked="medir"
        @loadstart="alCargar"
        @waiting="alCargar"
        @loadeddata="alEstarListo"
        @canplay="alEstarListo"
        @playing="alEstarListo"
        @error="alFallar"
      >
        <track
          v-for="(pista, i) in config.subtitulos"
          :key="pista.src"
          kind="subtitles"
          :src="pista.src"
          :srclang="pista.idioma"
          :label="pista.etiqueta"
          :default="i === pistaPorDefecto"
        />
        Tu navegador no puede reproducir video. Lee la transcripción de más abajo.
      </video>
    </div>

    <p
      v-if="estado === 'cargando'"
      role="status"
      class="flex items-center gap-2 text-sm text-muted-foreground"
      data-testid="cargando-video"
    >
      <LoaderCircle class="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Cargando el video…
    </p>
    <div
      v-else-if="estado === 'error'"
      role="status"
      class="grid gap-3 rounded-xl border border-destructive p-4 text-sm"
      data-testid="error-video"
    >
      <p class="flex items-start gap-2 font-medium text-destructive">
        <TriangleAlert class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        No se pudo cargar el video.
      </p>
      <p class="text-muted-foreground">
        Revisa tu conexión y vuelve a intentarlo, o lee la transcripción y márcala como leída.
      </p>
      <div>
        <Button type="button" variant="outline" @click="reintentar">Reintentar</Button>
      </div>
    </div>

    <div v-if="jugando" class="grid gap-1" data-testid="avance-video">
      <label for="progreso-video" class="text-sm text-muted-foreground">
        Has visto el {{ porcentaje }} % del video (con {{ umbralPorcentaje }} % se completa).
      </label>
      <progress
        id="progreso-video"
        class="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
        max="100"
        :value="porcentaje"
      />
    </div>

    <nav v-if="config.hitos.length > 0" aria-label="Capítulos del video" class="grid gap-2">
      <p class="text-sm font-medium text-muted-foreground">Capítulos</p>
      <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
        <li v-for="hito in config.hitos" :key="hito.t_seg">
          <Button
            type="button"
            variant="outline"
            data-testid="hito"
            @click="irAHito(hito.t_seg, hito.titulo)"
          >
            <span class="tabular-nums">{{ formatearTiempo(hito.t_seg) }}</span
            >{{ ' ' }}<span aria-hidden="true">·</span>{{ ' ' }}{{ hito.titulo }}
          </Button>
        </li>
      </ul>
    </nav>

    <details class="rounded-xl border border-border bg-card p-4" data-testid="transcripcion">
      <summary class="objetivo-tactil flex cursor-pointer items-center font-medium">
        Transcripción del video
      </summary>
      <div class="mt-3">
        <TextoMarkdown :texto="config.transcripcion" bloque />
      </div>
    </details>

    <div v-if="jugando" class="grid gap-2 rounded-xl border border-border bg-card p-4">
      <p class="text-sm text-muted-foreground">
        ¿No puedes o no quieres ver el video? Lee la transcripción y márcala como leída.
      </p>
      <div>
        <Button
          type="button"
          variant="secondary"
          data-testid="transcripcion-leida"
          @click="marcarTranscripcionLeida"
        >
          Ya leí la transcripción
        </Button>
      </div>
    </div>
  </div>
</template>
