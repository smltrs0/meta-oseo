<script setup lang="ts">
/**
 * Texto con Markdown restringido del contenido (`@/content/markdown`): el ÚNICO lugar de
 * video-texto donde se usa `v-html`, y solo sobre la salida ya saneada de `renderizarLinea` o
 * `renderizarBloque` (lista blanca de etiquetas, sin HTML crudo).
 *
 * Los enlaces de glosario (`data-glosario`) no navegan: se intercepta el clic y se dispara un
 * `CustomEvent('ova:glosario', { detail: { id } })` que burbujea, para que quien aloja la actividad
 * abra la definición. Si nadie lo escucha, no ocurre nada (el enlace no es un destino real).
 */
/* eslint-disable vue/no-v-html -- solo recibe la salida saneada de @/content/markdown */
import { computed } from 'vue';
import { renderizarBloque, renderizarLinea } from '@/content/markdown';

const props = defineProps<{
  texto: string;
  /** `true` para un bloque (párrafos, listas); por defecto una línea. */
  bloque?: boolean;
}>();

const html = computed(() =>
  props.bloque ? renderizarBloque(props.texto) : renderizarLinea(props.texto),
);

function alPulsar(evento: MouseEvent): void {
  const objetivo = evento.target;
  if (!(objetivo instanceof Element)) return;
  const enlace = objetivo.closest('a[data-glosario]');
  if (!enlace) return;
  evento.preventDefault();
  enlace.dispatchEvent(
    new CustomEvent('ova:glosario', {
      bubbles: true,
      detail: { id: enlace.getAttribute('data-glosario') },
    }),
  );
}
</script>

<template>
  <div
    v-if="bloque"
    class="texto-markdown [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
    data-testid="texto-markdown"
    @click="alPulsar"
    v-html="html"
  />
  <span
    v-else
    class="texto-markdown [&_a]:text-primary [&_a]:underline"
    data-testid="texto-markdown"
    @click="alPulsar"
    v-html="html"
  />
</template>
