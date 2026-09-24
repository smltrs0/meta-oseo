<script setup lang="ts">
/**
 * STUB de la base (F1-08). El agente de navegación lo reescribe entero en F1-11: píldora
 * compacta (móvil) / barra (escritorio) con puntaje, módulo actual y siguiente logro.
 * Ruta y nombre fijos: AppShell lo monta sin props.
 */
import { onMounted } from 'vue';
import { useProgresoStore } from '@/stores/progreso';

const progreso = useProgresoStore();

onMounted(() => {
  void progreso.load();
});
</script>

<template>
  <div class="flex items-center gap-2 text-sm" data-testid="hud-stub">
    <span class="bg-secondary text-secondary-foreground rounded-full px-3 py-1 font-medium">
      {{ progreso.puntajeTotal }} pts
    </span>
  </div>
</template>
