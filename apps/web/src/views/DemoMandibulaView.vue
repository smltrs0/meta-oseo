<script setup lang="ts">
/**
 * STUB de la base (F1-08). El agente de la escena 3D lo reescribe en F1-12 (título, nota de
 * atribución del modelo, altura completa disponible). Ruta y nombre fijos: el router lo carga
 * de forma perezosa en /demo-mandibula.
 */
import MandibulaScene from '@/scenes/MandibulaScene.vue';
</script>

<template>
  <div class="flex h-[calc(100dvh-4rem)] flex-col">
    <h1 class="px-4 py-3 text-2xl font-semibold">Demo de mandíbula 3D</h1>
    <div class="min-h-0 flex-1">
      <MandibulaScene />
    </div>
  </div>
</template>
