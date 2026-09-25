<script setup lang="ts">
/** Estado vacío del chat: invitación a preguntar y tres preguntas de ejemplo tocables. */
const emit = defineEmits<{ preguntar: [texto: string] }>();

const EJEMPLOS = [
  '¿Qué hacen los osteoclastos y los osteoblastos?',
  '¿Cómo se remodela el hueso a lo largo de la vida?',
  '¿Qué diferencia hay entre hueso cortical y trabecular?',
] as const;
</script>

<template>
  <div class="flex flex-col gap-4 px-4 py-6" data-testid="mentor-vacio">
    <div class="space-y-1">
      <p class="font-serif text-xl font-semibold">¿En qué te ayudo?</p>
      <p class="text-muted-foreground text-sm">
        Pregúntame sobre lo que estás viendo. Te guío para que llegues tú a la respuesta.
      </p>
    </div>
    <ul class="flex flex-col gap-2" aria-label="Preguntas de ejemplo">
      <li v-for="pregunta in EJEMPLOS" :key="pregunta">
        <button
          type="button"
          class="border-input bg-card hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring min-h-11 w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2"
          data-testid="mentor-ejemplo"
          @click="emit('preguntar', pregunta)"
        >
          {{ pregunta }}
        </button>
      </li>
    </ul>
  </div>
</template>
