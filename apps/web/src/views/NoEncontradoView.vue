<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-4 py-10">
    <h1 class="text-3xl font-semibold tracking-tight">No encontramos esa página</h1>
    <p class="text-muted-foreground text-lg">
      La dirección no existe o cambió de lugar. Vuelve al inicio para seguir con los módulos.
    </p>
    <RouterLink
      :to="{ name: 'inicio' }"
      class="bg-primary text-primary-foreground inline-flex h-11 w-fit items-center rounded-md px-5 font-medium"
    >
      Ir al inicio
    </RouterLink>
  </main>
</template>
