<script setup lang="ts">
/**
 * Componente de reserva de una actividad. Se muestra cuando el tipo no tiene componente en
 * `src/activities/<tipo>/` (`registro.ts`) o cuando falla la descarga de su fragmento (entonces
 * Vue le pasa la prop `error`). Recibe las mismas props que una actividad real y las ignora:
 * solo usa `actividad` para nombrarla.
 */
import { computed } from 'vue';
import { CircleAlert } from '@lucide/vue';

const props = defineProps<{
  actividad?: { titulo?: string; tipo?: string };
  /** La pone Vue cuando esta reserva hace de `errorComponent` de una carga asíncrona. */
  error?: unknown;
  // Props de una actividad real que aquí no se usan; se declaran para que no acaben como atributos.
  modulo?: number;
  modo?: string;
  estadoPrevio?: unknown;
}>();

const fallo = computed(() => props.error !== undefined);
</script>

<template>
  <div
    role="status"
    class="border-input bg-muted text-foreground flex items-start gap-3 rounded-lg border border-dashed p-4"
    data-testid="actividad-reserva"
  >
    <CircleAlert class="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
    <div class="space-y-1">
      <p class="font-medium">
        {{ fallo ? 'No pudimos cargar esta actividad.' : 'Esta actividad aún no está disponible.' }}
      </p>
      <p class="text-muted-foreground text-sm">
        <template v-if="fallo">Revisa tu conexión y vuelve a cargar la página.</template>
        <template v-else>
          Estamos terminando de prepararla<template v-if="actividad?.titulo">
            («{{ actividad.titulo }}»)</template
          >. Vuelve a intentarlo más tarde.
        </template>
      </p>
    </div>
  </div>
</template>
