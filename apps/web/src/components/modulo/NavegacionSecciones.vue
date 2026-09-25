<script setup lang="ts">
/**
 * Índice de secciones del módulo.
 *
 *  - Desde `md`: lista vertical (columna lateral) con el estado de cada sección.
 *  - En móvil: indicador compacto EN EL FLUJO de la página (nunca fijo, para no tapar el HUD, el menú
 *    circular ni el botón del mentor, que sí lo son): «Sección 2 de 5», puntos de avance y un
 *    selector nativo para saltar.
 *
 * El estado de cada sección se dice con icono y con texto (completada, actual, bloqueada), nunca solo
 * con color. Una sección bloqueada se puede activar: no navega, pero pide a la página que explique
 * qué falta (`bloqueada`), en vez de ser un botón mudo.
 */
import { computed } from 'vue';
import { Check, Lock } from '@lucide/vue';
import type { EstadoSeccion } from '@/content/scoring';
import { textoPlanoDeMarkdown } from '@/content/markdown';

const props = defineProps<{
  secciones: readonly { id: string; titulo: string }[];
  estados: readonly EstadoSeccion[];
  /** Índice de la sección que se está leyendo. */
  indice: number;
}>();

const emit = defineEmits<{
  ir: [indice: number];
  bloqueada: [indice: number];
}>();

const ETIQUETA: Readonly<Record<EstadoSeccion, string>> = {
  completada: 'completada',
  actual: 'pendiente',
  disponible: 'disponible',
  bloqueada: 'bloqueada',
};

const items = computed(() =>
  props.secciones.map((s, i) => {
    const estado = props.estados[i] ?? 'bloqueada';
    return {
      i,
      id: s.id,
      titulo: textoPlanoDeMarkdown(s.titulo),
      estado,
      etiqueta: ETIQUETA[estado],
      bloqueada: estado === 'bloqueada',
      actual: i === props.indice,
    };
  }),
);

function activar(i: number): void {
  if (props.estados[i] === 'bloqueada') emit('bloqueada', i);
  else emit('ir', i);
}

function alElegir(evento: Event): void {
  const i = Number((evento.target as HTMLSelectElement).value);
  if (Number.isInteger(i)) activar(i);
  // El selector vuelve a la sección visible si la elegida está bloqueada.
  (evento.target as HTMLSelectElement).value = String(props.indice);
}
</script>

<template>
  <nav aria-label="Secciones del módulo" data-testid="navegacion-secciones">
    <!-- Escritorio -->
    <ol class="hidden space-y-1 md:block" data-testid="indice-secciones">
      <li v-for="item in items" :key="item.id">
        <button
          type="button"
          :aria-current="item.actual ? 'step' : undefined"
          :aria-disabled="item.bloqueada ? 'true' : undefined"
          :data-estado="item.estado"
          :class="[
            'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
            'focus-visible:ring-ring outline-none focus-visible:ring-2',
            item.actual ? 'bg-secondary text-secondary-foreground font-semibold' : 'hover:bg-muted',
            item.bloqueada && 'text-muted-foreground',
          ]"
          @click="activar(item.i)"
        >
          <span
            :class="[
              'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
              item.estado === 'completada' && 'border-success bg-success-soft text-success',
            ]"
            aria-hidden="true"
          >
            <Check v-if="item.estado === 'completada'" class="size-4" />
            <Lock v-else-if="item.bloqueada" class="size-3.5" />
            <template v-else>{{ item.i + 1 }}</template>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block">{{ item.titulo }}</span>
            <span class="text-muted-foreground block text-xs font-normal">
              {{ item.etiqueta }}
            </span>
          </span>
        </button>
      </li>
    </ol>

    <!-- Móvil -->
    <div class="space-y-2 md:hidden" data-testid="indicador-movil">
      <p class="text-sm font-medium">
        Sección {{ indice + 1 }} de {{ secciones.length }}
        <span class="text-muted-foreground font-normal"> · {{ items[indice]?.titulo }} </span>
      </p>
      <ol class="flex gap-1.5" aria-hidden="true">
        <li
          v-for="item in items"
          :key="item.id"
          :class="[
            'h-2 flex-1 rounded-full',
            item.estado === 'completada' ? 'bg-success' : item.actual ? 'bg-primary' : 'bg-border',
          ]"
        />
      </ol>
      <label class="sr-only" for="ir-a-seccion">Ir a la sección</label>
      <select
        id="ir-a-seccion"
        class="border-input bg-card h-11 w-full rounded-md border px-3 text-base"
        :value="String(indice)"
        @change="alElegir"
      >
        <option v-for="item in items" :key="item.id" :value="String(item.i)">
          {{ item.i + 1 }}. {{ item.titulo }} ({{ item.etiqueta }})
        </option>
      </select>
    </div>
  </nav>
</template>
