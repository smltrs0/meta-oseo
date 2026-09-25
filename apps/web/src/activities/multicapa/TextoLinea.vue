<script setup lang="ts">
/**
 * Una línea de texto con el Markdown restringido del contenido (negrita, cursiva, enlaces del
 * glosario y https). ÚNICO lugar de la actividad multicapa con `v-html`: el HTML sale de
 * `renderizarLinea` (`@/content/markdown`), que escapa el HTML crudo y filtra etiquetas y atributos
 * con lista blanca. Nunca se le pasa texto sin renderizar.
 *
 * Los enlaces de glosario (`data-glosario`) no navegan: se intercepta el clic y se dispara un
 * `CustomEvent('ova:glosario', { detail: { id } })` que burbujea, para que quien aloja la
 * actividad abra la definición (regla R10). Si nadie lo escucha, no ocurre nada.
 */
/* eslint-disable vue/no-v-html -- solo recibe la salida saneada de @/content/markdown */
import { computed } from 'vue';
import { renderizarLinea } from '@/content/markdown';

const props = defineProps<{ texto: string }>();

const html = computed(() => renderizarLinea(typeof props.texto === 'string' ? props.texto : ''));

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
  <span class="texto-linea" @click="alPulsar" v-html="html" />
</template>

<style scoped>
/* Texto largo o sin espacios (Unicode, ids, fórmulas) no debe desbordar la pantalla del móvil. */
.texto-linea {
  overflow-wrap: anywhere;
}
.texto-linea :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.texto-linea :deep(a.enlace-glosario) {
  text-decoration-style: dotted;
}
</style>
