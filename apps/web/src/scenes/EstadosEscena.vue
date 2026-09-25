<script setup lang="ts">
/**
 * Paneles de estado de una escena 3D: cargando (con progreso), sin WebGL 2, error de carga o de
 * renderizado y contexto WebGL perdido. Se colocan encima del contenedor de la escena (posición
 * absoluta) y no importan three: pueden usarse antes de cargar la escena real. Los errores son
 * `role="alert"` y los textos, en español y sin detalles técnicos.
 */
import { LoaderCircle, TriangleAlert } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import type { EstadoEscena } from './useModeloMandibula';

withDefaults(
  defineProps<{
    estado: EstadoEscena;
    /** Porcentaje entero de la descarga, o null si no se conoce el tamaño. */
    porcentaje?: number | null;
    mensajeError?: string;
    contextoPerdido?: boolean;
    /** Qué sigue funcionando cuando no hay WebGL 2 (cambia según quien use la escena). */
    textoSinWebgl?: string;
  }>(),
  {
    porcentaje: null,
    mensajeError: '',
    contextoPerdido: false,
    textoSinWebgl:
      'Tu navegador no ofrece gráficos 3D (WebGL 2). Prueba con otro navegador o activa la aceleración por hardware en su configuración. El resto de la plataforma sigue funcionando.',
  },
);

defineEmits<{ reintentar: [] }>();
</script>

<template>
  <!-- Carga -->
  <div
    v-if="estado === 'detectando' || estado === 'cargando'"
    class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
  >
    <LoaderCircle class="text-primary size-8 animate-spin" aria-hidden="true" />
    <p class="font-medium">Cargando modelo 3D…</p>
    <div
      class="bg-secondary h-2 w-56 max-w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-label="Progreso de la descarga del modelo 3D"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="porcentaje ?? undefined"
    >
      <div
        class="bg-primary h-full rounded-full transition-[width]"
        :class="porcentaje === null ? 'w-1/3 animate-pulse' : ''"
        :style="porcentaje === null ? undefined : { width: `${porcentaje}%` }"
      />
    </div>
    <p v-if="porcentaje !== null" class="text-muted-foreground text-sm tabular-nums">
      {{ porcentaje }} %
    </p>
  </div>

  <!-- Sin WebGL -->
  <div
    v-else-if="estado === 'sin_webgl'"
    class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
    role="alert"
  >
    <TriangleAlert class="text-destructive size-9" aria-hidden="true" />
    <p class="text-lg font-semibold">Este dispositivo no puede mostrar el modelo 3D</p>
    <p class="text-muted-foreground max-w-sm">{{ textoSinWebgl }}</p>
  </div>

  <!-- Error de carga o de renderizado -->
  <div
    v-else-if="estado === 'error'"
    class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
    role="alert"
  >
    <TriangleAlert class="text-destructive size-9" aria-hidden="true" />
    <p class="text-lg font-semibold">Problema con el modelo 3D</p>
    <p class="text-muted-foreground max-w-sm">{{ mensajeError }}</p>
    <Button @click="$emit('reintentar')">Reintentar</Button>
  </div>

  <!-- Contexto WebGL perdido (memoria de la GPU agotada, cambio de pestaña en algunos móviles) -->
  <div
    v-if="estado === 'listo' && contextoPerdido"
    class="bg-background/85 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center backdrop-blur-sm"
    role="alert"
  >
    <TriangleAlert class="text-destructive size-9" aria-hidden="true" />
    <p class="text-lg font-semibold">Se interrumpió la vista 3D</p>
    <p class="text-muted-foreground max-w-sm">
      El navegador liberó los gráficos. Si no se recupera sola, pulsa el botón.
    </p>
    <Button @click="$emit('reintentar')">Recuperar la vista</Button>
  </div>
</template>
