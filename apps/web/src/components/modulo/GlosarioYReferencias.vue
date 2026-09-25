<script setup lang="ts">
/**
 * Glosario y referencias del módulo, al final de la página, en dos desplegables (`<details>`,
 * accesibles por teclado sin código). Cada término tiene el ancla `#glosario-{id}`. Las referencias
 * que el docente aún no verificó llevan una nota discreta (misma bandera que la nota de revisión).
 */
import { BookMarked, BookText } from '@lucide/vue';
import { MOSTRAR_NOTA_REVISION } from '@/config';
import type { ModuloContenido } from '@/content/schema';
import TextoRico from './TextoRico.vue';

defineProps<{ modulo: ModuloContenido }>();
</script>

<template>
  <div class="mt-10 space-y-3" data-testid="glosario-referencias">
    <details class="bg-card group rounded-xl border" data-testid="glosario">
      <summary
        class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-serif text-lg font-semibold [&::-webkit-details-marker]:hidden"
      >
        <BookText class="text-primary size-5" aria-hidden="true" />
        <h2 class="text-lg font-semibold">Glosario ({{ modulo.glosario.length }} términos)</h2>
      </summary>
      <dl class="space-y-3 border-t px-4 py-3 text-sm">
        <div v-for="t in modulo.glosario" :id="`glosario-${t.id}`" :key="t.id" class="scroll-mt-20">
          <dt class="font-semibold">{{ t.termino }}</dt>
          <dd class="text-muted-foreground">
            <TextoRico :texto="t.definicion" modo="linea" />
          </dd>
        </div>
      </dl>
    </details>

    <details class="bg-card group rounded-xl border" data-testid="referencias">
      <summary
        class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-serif text-lg font-semibold [&::-webkit-details-marker]:hidden"
      >
        <BookMarked class="text-primary size-5" aria-hidden="true" />
        <h2 class="text-lg font-semibold">Referencias ({{ modulo.referencias.length }})</h2>
      </summary>
      <ol class="list-decimal space-y-3 border-t py-3 pr-4 pl-9 text-sm">
        <li v-for="r in modulo.referencias" :id="`referencia-${r.id}`" :key="r.id">
          {{ r.cita }}
          <a
            v-if="r.url"
            :href="r.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary block break-all underline underline-offset-2"
          >
            {{ r.url }}
            <span class="sr-only">(se abre en otra pestaña)</span>
          </a>
          <span
            v-if="MOSTRAR_NOTA_REVISION && !r.verificada"
            class="text-muted-foreground block text-xs"
          >
            Referencia pendiente de verificación por el docente.
          </span>
        </li>
      </ol>
    </details>
  </div>
</template>
