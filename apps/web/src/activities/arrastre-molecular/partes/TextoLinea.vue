<script setup lang="ts">
/**
 * Una línea de texto con el Markdown restringido del contenido (negrita, cursiva, enlaces del
 * glosario y https). ÚNICO lugar de la actividad con `v-html`: el HTML sale de `renderizarLinea`
 * (`@/content/markdown`), que escapa el HTML crudo y filtra etiquetas y atributos con lista blanca.
 * Nunca se le pasa texto sin renderizar.
 */
import { computed } from 'vue';
import { renderizarLinea } from '@/content/markdown';

const props = defineProps<{ texto: string }>();

const html = computed(() => renderizarLinea(typeof props.texto === 'string' ? props.texto : ''));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- HTML de renderizarLinea (lista blanca), nunca texto crudo -->
  <span class="texto-linea" v-html="html" />
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
