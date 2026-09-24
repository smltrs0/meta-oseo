<script setup lang="ts">
/**
 * Vista provisional de un módulo (F1-08). La página genérica que renderiza content.json y
 * bloquea el avance hasta completar las actividades llega en F2-08.
 */
import { computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { Construction } from '@lucide/vue';
import { moduloPorNumero } from '@/data/modulos';
import type { NumeroModulo } from '@/data/modulos';
import { useContextoStore } from '@/stores/contextoPedagogico';

// La ruta (/modulo/:n([1-6])) ya garantiza un número entre 1 y 6.
const props = defineProps<{ n: number }>();

const contexto = useContextoStore();
const modulo = computed(() => moduloPorNumero(props.n));

watch(
  () => props.n,
  (n) => {
    if (moduloPorNumero(n)) contexto.setModulo(n as NumeroModulo);
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="modulo" class="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
    <p class="text-muted-foreground text-sm">Módulo {{ modulo.numero }} de 6</p>
    <h1 class="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{{ modulo.titulo }}</h1>
    <p class="mt-3 max-w-prose text-lg leading-relaxed">{{ modulo.foco }}</p>

    <div class="bg-card mt-8 flex items-start gap-4 rounded-xl border p-5">
      <Construction class="text-primary mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div class="space-y-2">
        <h2 class="text-xl font-semibold">Este módulo está en construcción</h2>
        <p class="text-muted-foreground">
          Aquí vivirán las secciones y las actividades interactivas. Mientras tanto puedes explorar
          los otros módulos desde el menú.
        </p>
        <RouterLink
          :to="{ name: 'inicio' }"
          class="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        >
          Volver al inicio
        </RouterLink>
      </div>
    </div>
  </div>
</template>
