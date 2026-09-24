<script setup lang="ts">
/**
 * Inicio de las rutas autenticadas: introducción y tarjetas de los seis módulos.
 * Los módulos forman una secuencia (el briefing los ordena de la célula al envejecimiento),
 * por eso van numerados y en una lista ordenada.
 */
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Box, CircleCheck } from '@lucide/vue';
import OsteonaIlustracion from '@/components/OsteonaIlustracion.vue';
import { Button } from '@/components/ui/button';
import { MODULOS } from '@/data/modulos';
import { useAuthStore } from '@/stores/auth';
import { useContextoStore } from '@/stores/contextoPedagogico';
import { useProgresoStore } from '@/stores/progreso';

const auth = useAuthStore();
const progreso = useProgresoStore();
const contexto = useContextoStore();

const nombre = computed(() => auth.usuario?.nombre ?? '');
const completados = computed(() => progreso.modulosCompletados.length);

onMounted(() => {
  contexto.setSeccion('inicio');
  void progreso.load();
});
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6 md:py-10">
    <section class="grid items-center gap-6 md:grid-cols-[1fr_auto] md:gap-12">
      <div class="space-y-4">
        <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">Hola, {{ nombre }}</h1>
        <p class="max-w-prose text-lg leading-relaxed">
          Seis módulos te llevan de la célula al hueso: cómo se forma, se mineraliza, se renueva y
          envejece, con la mandíbula como ejemplo.
        </p>
        <p class="text-muted-foreground max-w-prose">
          Para avanzar tendrás que actuar: explorar capas, relacionar conceptos y responder
          preguntas. Si algo no queda claro, pregúntale al mentor con el botón de chat.
        </p>
      </div>
      <OsteonaIlustracion class="hidden w-52 md:block" />
    </section>

    <section aria-labelledby="titulo-modulos" class="mt-8 md:mt-12">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="titulo-modulos" class="text-2xl font-semibold">Módulos</h2>
        <p class="text-muted-foreground text-sm">
          {{ completados }} de {{ MODULOS.length }} completados
        </p>
      </div>

      <p
        v-if="progreso.error"
        role="status"
        class="bg-accent text-accent-foreground mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
      >
        <span>{{ progreso.error }}</span>
        <Button variant="outline" size="sm" @click="progreso.load({ force: true })">
          Reintentar
        </Button>
      </p>

      <ol role="list" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="m in MODULOS" :key="m.numero" class="flex">
          <RouterLink
            :to="{ name: 'modulo', params: { n: m.numero } }"
            class="bg-card hover:border-primary focus-visible:border-primary group flex w-full items-start gap-4 rounded-xl border p-4 transition-colors"
          >
            <span
              class="bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full font-serif text-xl font-semibold transition-colors"
              aria-hidden="true"
            >
              {{ m.numero }}
            </span>
            <span class="min-w-0 space-y-1">
              <span class="block font-serif text-lg leading-snug font-semibold">
                <span class="sr-only">Módulo {{ m.numero }}: </span>{{ m.titulo }}
              </span>
              <span class="text-muted-foreground block text-sm leading-snug">{{ m.foco }}</span>
              <span class="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm">
                <span
                  v-if="m.densidad === 'alta'"
                  class="text-accent-foreground bg-accent rounded-full px-2 py-0.5"
                >
                  Densidad alta
                </span>
                <span
                  v-if="progreso.estaCompletado(m.numero)"
                  class="text-success inline-flex items-center gap-1 font-medium"
                >
                  <CircleCheck class="size-4" aria-hidden="true" />
                  Completado
                </span>
              </span>
            </span>
          </RouterLink>
        </li>
      </ol>
    </section>

    <section class="mt-8 md:mt-12">
      <RouterLink
        :to="{ name: 'demo_mandibula' }"
        class="text-primary inline-flex min-h-11 items-center gap-2 font-medium underline-offset-4 hover:underline"
      >
        <Box class="size-4" aria-hidden="true" />
        Demo técnica: mandíbula en 3D (Fase 1)
      </RouterLink>
    </section>
  </div>
</template>
