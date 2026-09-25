<script setup lang="ts">
/**
 * Cabecera de la página de módulo: título (el único `h1`), subtítulo, resumen, duración estimada,
 * avance, objetivos de aprendizaje y, mientras el docente no apruebe el contenido, una nota discreta
 * «Contenido en revisión» (se oculta con `MOSTRAR_NOTA_REVISION` de config.ts).
 */
import { computed } from 'vue';
import { Clock, ListChecks, NotebookPen, Trophy } from '@lucide/vue';
import { MOSTRAR_NOTA_REVISION, TOTAL_MODULOS } from '@/config';
import type { ProgresoModulo } from '@/content/scoring';
import type { ModuloContenido } from '@/content/schema';
import { textoDuracion } from './acceso';
import TextoRico from './TextoRico.vue';

const props = defineProps<{
  modulo: ModuloContenido;
  avance: ProgresoModulo;
  puntajeObtenido: number;
}>();

const enRevision = computed(
  () => MOSTRAR_NOTA_REVISION && props.modulo.estado_revision.estado !== 'aprobado',
);
const porcentaje = computed(() => Math.round(props.avance.fraccion * 100));
</script>

<template>
  <header class="space-y-4" data-testid="cabecera-modulo">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p class="text-muted-foreground text-sm">Módulo {{ modulo.numero }} de {{ TOTAL_MODULOS }}</p>
      <p
        v-if="enRevision"
        class="bg-accent text-accent-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
        role="note"
        title="Este contenido es un borrador que el docente aún debe validar."
        data-testid="nota-revision"
      >
        <NotebookPen class="size-3.5" aria-hidden="true" />
        Contenido en revisión
      </p>
    </div>

    <div>
      <h1
        id="titulo-modulo"
        class="text-3xl font-semibold tracking-tight md:text-4xl"
        data-testid="titulo-modulo"
      >
        {{ modulo.titulo }}
      </h1>
      <p class="text-muted-foreground mt-1 text-lg">{{ modulo.subtitulo }}</p>
    </div>

    <TextoRico
      :texto="modulo.resumen"
      modo="linea"
      class="block max-w-prose text-base leading-relaxed"
    />

    <ul class="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-sm" role="list">
      <li class="inline-flex items-center gap-1.5" data-testid="duracion">
        <Clock class="size-4" aria-hidden="true" />
        <span class="sr-only">Duración estimada:</span>
        {{ textoDuracion(modulo.duracion_estimada_min) }}
      </li>
      <li class="inline-flex items-center gap-1.5" data-testid="avance-obligatorias">
        <ListChecks class="size-4" aria-hidden="true" />
        {{ avance.obligatoriasCompletadas }} de {{ avance.obligatoriasTotal }} actividades
        obligatorias ({{ porcentaje }} %)
      </li>
      <li class="inline-flex items-center gap-1.5" data-testid="puntaje-modulo">
        <Trophy class="size-4" aria-hidden="true" />
        {{ puntajeObtenido }} de {{ avance.puntajeMaximo }} puntos
      </li>
    </ul>

    <section aria-labelledby="titulo-objetivos" class="bg-card rounded-xl border p-4">
      <h2 id="titulo-objetivos" class="font-serif text-lg font-semibold">
        Objetivos de aprendizaje
      </h2>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed" data-testid="objetivos">
        <li v-for="objetivo in modulo.objetivos" :key="objetivo">
          <TextoRico :texto="objetivo" modo="linea" />
        </li>
      </ul>
    </section>
  </header>
</template>
