<script setup lang="ts">
/**
 * Texto con el Markdown restringido del contenido. ÚNICO lugar de la página de módulo con
 * `v-html`, y solo sobre la salida ya saneada de `renderizarBloque` / `renderizarLinea`
 * (`@/content/markdown`: HTML crudo escapado y lista blanca de etiquetas y atributos).
 *
 * Los enlaces del glosario no navegan: abren la definición (ver `glosario.ts`). Llevan subrayado
 * punteado y `aria-haspopup="dialog"`, así que no dependen solo del color.
 */
/* eslint-disable vue/no-v-html -- solo recibe la salida saneada de @/content/markdown */
import { computed, onMounted, onUpdated, ref } from 'vue';
import { renderizarBloque, renderizarLinea } from '@/content/markdown';
import { interceptarEnlaceGlosario } from './glosario';

const props = withDefaults(
  defineProps<{
    texto: string;
    /** Párrafos, listas y títulos (`bloque`) o una sola línea (`linea`). */
    modo?: 'bloque' | 'linea';
  }>(),
  { modo: 'bloque' },
);

const html = computed(() =>
  props.modo === 'bloque' ? renderizarBloque(props.texto) : renderizarLinea(props.texto),
);
const raiz = ref<HTMLElement | null>(null);

const clases = computed(() => [
  'texto-rico [overflow-wrap:anywhere]',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_a.enlace-glosario]:cursor-help [&_a.enlace-glosario]:decoration-dotted [&_a.enlace-glosario]:decoration-2',
  props.modo === 'bloque' &&
    '[&_h3]:mt-4 [&_h3]:font-serif [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li+li]:mt-1 [&_ol+p]:mt-3 [&_ul+p]:mt-3 [&_p+ol]:mt-3 [&_p+ul]:mt-3',
]);

function marcarEnlaces(): void {
  raiz.value?.querySelectorAll('a[data-glosario]').forEach((enlace) => {
    enlace.setAttribute('aria-haspopup', 'dialog');
  });
}
onMounted(marcarEnlaces);
onUpdated(marcarEnlaces);
</script>

<template>
  <div
    v-if="modo === 'bloque'"
    ref="raiz"
    :class="clases"
    @click="interceptarEnlaceGlosario"
    v-html="html"
  />
  <span v-else ref="raiz" :class="clases" @click="interceptarEnlaceGlosario" v-html="html" />
</template>
