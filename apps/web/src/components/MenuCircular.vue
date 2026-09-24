<script setup lang="ts">
/**
 * STUB de la base (F1-08). El agente de navegación lo reescribe entero en F1-10: menú
 * circular SVG con estados completado / activo / bloqueado. Ruta y nombre fijos: AppShell
 * lo monta sin props. Este stub ya es funcional (lista de enlaces a los seis módulos) para
 * poder navegar mientras tanto; se posiciona con `position: fixed`, como debe hacerlo el real.
 */
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { MODULOS } from '@/data/modulos';
import { useProgresoStore } from '@/stores/progreso';

const abierto = ref(false);
const progreso = useProgresoStore();
</script>

<template>
  <nav
    aria-label="Módulos"
    class="fixed z-40 md:top-1/2 md:-translate-y-1/2"
    style="
      left: max(1rem, var(--area-segura-izquierda));
      bottom: max(1rem, var(--area-segura-abajo));
    "
    data-testid="menu-stub"
  >
    <button
      type="button"
      class="bg-primary text-primary-foreground size-12 rounded-full font-semibold shadow-lg"
      :aria-expanded="abierto"
      aria-controls="menu-stub-lista"
      @click="abierto = !abierto"
    >
      <span class="sr-only">Módulos</span>
      <span aria-hidden="true">{{ abierto ? 'x' : 'M' }}</span>
    </button>
    <ul
      v-show="abierto"
      id="menu-stub-lista"
      class="bg-card absolute bottom-14 left-0 w-64 rounded-xl border p-2 shadow-lg md:top-0 md:bottom-auto md:left-14"
    >
      <li v-for="m in MODULOS" :key="m.numero">
        <RouterLink
          :to="{ name: 'modulo', params: { n: m.numero } }"
          class="hover:bg-secondary flex min-h-11 items-center gap-2 rounded-md px-3"
          @click="abierto = false"
        >
          <span class="font-semibold">{{ m.numero }}</span>
          <span>{{ m.titulo }}</span>
          <span v-if="progreso.estaCompletado(m.numero)" class="sr-only">(completado)</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
