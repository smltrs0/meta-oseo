<script setup lang="ts">
/** Bloque `texto`: subtítulo opcional (nivel 3) y Markdown restringido. */
import type { BloqueTexto } from '@/content/schema';
import TextoRico from './TextoRico.vue';

defineProps<{ bloque: BloqueTexto }>();
</script>

<template>
  <div :id="`bloque-${bloque.id}`" class="space-y-2" data-testid="bloque-texto">
    <h3 v-if="bloque.titulo" class="font-serif text-xl font-semibold">{{ bloque.titulo }}</h3>
    <TextoRico :texto="bloque.markdown" class="max-w-prose text-base leading-relaxed" />
  </div>
</template>
