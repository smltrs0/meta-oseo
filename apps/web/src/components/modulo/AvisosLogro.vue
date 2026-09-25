<script setup lang="ts">
/**
 * Avisos de logro nuevo. Una región `aria-live="polite"` siempre presente anuncia cada logro con
 * su nombre y descripción (un solo mensaje por logro). Visualmente es una tarjeta bajo la cabecera
 * fija del shell (arriba, lejos del menú y del mentor, que están abajo), con icono y texto, que
 * desaparece sola a los 9 s o con el botón «Cerrar» (44 px). Con `prefers-reduced-motion` no hay
 * animación de entrada.
 */
import { onBeforeUnmount, watch } from 'vue';
import { Trophy, X } from '@lucide/vue';
import { useActividadesStore } from '@/stores/actividades';

const DURACION_MS = 9000;

const store = useActividadesStore();
const temporizadores = new Map<number, ReturnType<typeof setTimeout>>();

watch(
  () => store.avisosLogro.map((a) => a.clave),
  (claves) => {
    for (const clave of claves) {
      if (temporizadores.has(clave)) continue;
      temporizadores.set(
        clave,
        setTimeout(() => {
          temporizadores.delete(clave);
          store.descartarAviso(clave);
        }, DURACION_MS),
      );
    }
  },
  { immediate: true },
);

function cerrar(clave: number): void {
  clearTimeout(temporizadores.get(clave));
  temporizadores.delete(clave);
  store.descartarAviso(clave);
}

onBeforeUnmount(() => {
  for (const t of temporizadores.values()) clearTimeout(t);
  temporizadores.clear();
});
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    aria-atomic="false"
    class="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-3"
    style="top: calc(var(--area-segura-arriba) + 4.25rem)"
    data-testid="avisos-logro"
  >
    <div
      v-for="aviso in store.avisosLogro"
      :key="aviso.clave"
      class="bg-card text-card-foreground border-eosina pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border-2 p-3 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2"
      data-testid="aviso-logro"
    >
      <Trophy class="text-eosina mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <p class="min-w-0 flex-1 text-sm">
        <strong class="block text-base">Logro desbloqueado: {{ aviso.nombre }}</strong>
        <span v-if="aviso.descripcion" class="text-muted-foreground">{{ aviso.descripcion }}</span>
      </p>
      <button
        type="button"
        class="hover:bg-muted focus-visible:ring-ring -m-1 flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2"
        @click="cerrar(aviso.clave)"
      >
        <X class="size-4" aria-hidden="true" />
        <span class="sr-only">Cerrar aviso de logro</span>
      </button>
    </div>
  </div>
</template>
