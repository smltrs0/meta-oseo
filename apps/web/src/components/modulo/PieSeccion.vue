<script setup lang="ts">
/**
 * Pie de la sección: avance secuencial (anterior / siguiente). «Siguiente» está en el flujo de la
 * página, no fijo. Mientras falten actividades obligatorias, `aria-disabled` (sigue en el orden de
 * tabulación, a diferencia de `disabled`) y una frase visible explica qué falta, con un botón que
 * lleva a la primera pendiente.
 */
import { ArrowDown, ChevronLeft, ChevronRight } from '@lucide/vue';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  indice: number;
  total: number;
  /** ¿Se puede abrir la sección siguiente? */
  siguienteAbierta: boolean;
  /** Qué falta para abrirla (vacío si nada). */
  textoPendiente: string;
  /** Hay una actividad pendiente en esta sección a la que se puede saltar. */
  hayPendiente: boolean;
}>();

const emit = defineEmits<{
  anterior: [];
  siguiente: [];
  irAPendiente: [];
}>();

function alSiguiente(): void {
  if (props.siguienteAbierta) emit('siguiente');
  else emit('irAPendiente');
}
</script>

<template>
  <nav aria-label="Avance por secciones" class="space-y-3 border-t pt-4" data-testid="pie-seccion">
    <p
      v-if="!siguienteAbierta && textoPendiente"
      id="motivo-bloqueo"
      class="bg-accent text-accent-foreground rounded-md px-3 py-2 text-sm"
      data-testid="motivo-bloqueo"
    >
      {{ textoPendiente }}
      <Button
        v-if="hayPendiente"
        variant="link"
        class="text-accent-foreground h-auto min-h-11 px-1 underline"
        @click="emit('irAPendiente')"
      >
        <ArrowDown aria-hidden="true" />
        Ir a la actividad
      </Button>
    </p>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <Button
        v-if="indice > 0"
        variant="outline"
        data-testid="seccion-anterior"
        @click="emit('anterior')"
      >
        <ChevronLeft aria-hidden="true" />
        Sección anterior
      </Button>
      <span v-else />
      <Button
        v-if="indice < total - 1"
        :aria-disabled="siguienteAbierta ? undefined : 'true'"
        :aria-describedby="siguienteAbierta ? undefined : 'motivo-bloqueo'"
        :class="siguienteAbierta ? '' : 'opacity-60'"
        data-testid="seccion-siguiente"
        @click="alSiguiente"
      >
        Siguiente sección
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  </nav>
</template>
