<script setup lang="ts">
/**
 * Tarjeta con el efecto biológico de un acople: quién se unió a quién, el `titulo` y la
 * `descripcion` del efecto y sus indicadores (con flecha Y texto: nunca solo color, R4). Es el
 * texto que acompaña a la animación (R3): la información no depende de que se vea el movimiento.
 */
import { ArrowDown, ArrowUp, Minus } from '@lucide/vue';
import type { EfectoBiologico } from '@/content/schema';
import FormaMolecula from './FormaMolecula.vue';
import TextoLinea from './TextoLinea.vue';

defineProps<{
  molecula: string;
  forma: string;
  receptor: string;
  efecto: EfectoBiologico;
  /** Es el último acople de la ejecución. */
  ultimo?: boolean;
  /** Etiquetas de otras moléculas acopladas en el mismo receptor (competencia). */
  otras?: readonly string[];
}>();

const TEXTO_DIRECCION: Readonly<Record<string, string>> = {
  aumenta: 'aumenta',
  disminuye: 'disminuye',
  sin_cambio: 'sin cambio',
};
const ICONO_DIRECCION = { aumenta: ArrowUp, disminuye: ArrowDown, sin_cambio: Minus } as const;

function icono(direccion: string): typeof ArrowUp {
  return ICONO_DIRECCION[direccion as keyof typeof ICONO_DIRECCION] ?? Minus;
}
</script>

<template>
  <article
    class="border-border bg-card flex min-w-0 flex-col gap-2 rounded-xl border p-3"
    :class="ultimo ? 'border-primary border-2' : ''"
    :data-ultimo="ultimo ? 'true' : undefined"
    data-tarjeta-efecto
  >
    <header class="flex flex-wrap items-center gap-2">
      <FormaMolecula :forma="forma" class="text-primary" />
      <p class="text-foreground min-w-0 text-sm [overflow-wrap:anywhere]">
        <strong>{{ molecula }}</strong> en <strong>{{ receptor }}</strong>
      </p>
      <span
        v-if="ultimo"
        class="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium"
      >
        Último acople
      </span>
    </header>
    <h5 class="text-foreground font-serif text-base font-semibold [overflow-wrap:anywhere]">
      {{ efecto.titulo }}
    </h5>
    <p class="text-foreground text-sm leading-relaxed">
      <TextoLinea :texto="efecto.descripcion" />
    </p>
    <ul v-if="(efecto.indicadores ?? []).length > 0" class="flex flex-col gap-1" role="list">
      <li
        v-for="(indicador, k) in efecto.indicadores"
        :key="k"
        class="text-foreground flex items-center gap-2 text-sm"
      >
        <component :is="icono(indicador.direccion)" class="size-4 shrink-0" aria-hidden="true" />
        <span class="[overflow-wrap:anywhere]">
          {{ indicador.etiqueta }}:
          <strong>{{ TEXTO_DIRECCION[indicador.direccion] ?? indicador.direccion }}</strong>
        </span>
      </li>
    </ul>
    <p v-if="otras && otras.length > 0" class="text-muted-foreground text-xs">
      También se acoplaron en este receptor: {{ otras.join(', ') }}. Aquí se ve el efecto de la
      última.
    </p>
  </article>
</template>
