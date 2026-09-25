<script setup lang="ts">
/** Mientras se descarga el fragmento del componente de una actividad (carga perezosa). */
import { LoaderCircle } from '@lucide/vue';
</script>

<template>
  <p
    role="status"
    class="text-muted-foreground flex min-h-11 items-center gap-2 py-4 text-sm"
    data-testid="actividad-cargando"
  >
    <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" />
    Cargando la actividad…
  </p>
</template>
