<script setup lang="ts">
/**
 * Silueta de una molécula (`circulo`, `hexagono`, `triangulo`, `rombo` o `cuadrado`). La forma
 * distingue a las moléculas sin depender del color (R4): siempre va con el nombre al lado, así que
 * es decorativa (`aria-hidden`). Una forma desconocida (contenido de otra versión) se dibuja como
 * círculo.
 */
import { computed } from 'vue';

const props = defineProps<{ forma: string }>();

const PUNTOS: Readonly<Record<string, string>> = {
  hexagono: '12,2 20.7,7 20.7,17 12,22 3.3,17 3.3,7',
  triangulo: '12,3 22,21 2,21',
  rombo: '12,2 22,12 12,22 2,12',
};

const puntos = computed(() => PUNTOS[props.forma]);
const esCuadrado = computed(() => props.forma === 'cuadrado');
</script>

<template>
  <svg
    class="forma-molecula"
    viewBox="0 0 24 24"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
    :data-forma="puntos || esCuadrado ? forma : 'circulo'"
  >
    <polygon v-if="puntos" :points="puntos" />
    <rect v-else-if="esCuadrado" x="3" y="3" width="18" height="18" rx="3" />
    <circle v-else cx="12" cy="12" r="9" />
  </svg>
</template>

<style scoped>
.forma-molecula {
  flex: none;
  fill: var(--forma-relleno, var(--secondary));
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
}
</style>
