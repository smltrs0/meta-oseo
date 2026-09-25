<script setup lang="ts">
/**
 * Componente de referencia del contrato de las actividades (activities/types.ts): un quiz mínimo
 * que usa las props, los eventos y la fórmula de puntaje tal como deben usarlos los seis
 * componentes reales. Solo lo usan las pruebas; no entra al build.
 *
 * Sirve además de prueba de que el compilador de `<script setup>` de Vue resuelve
 * `defineProps<PropsActividadQuiz>()` y `defineEmits<EmitsActividadQuiz>()` importados.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { intentoInicial } from '@/activities/types';
import type { EmitsActividadQuiz, ProgresoActividad, PropsActividadQuiz } from '@/activities/types';
import { crearEmisorProgreso } from '@/content/progreso';
import { calcularPuntaje, precisionPregunta, precisionQuiz } from '@/content/scoring';
import type { RespuestaPregunta } from '@/content/scoring';

const props = withDefaults(defineProps<PropsActividadQuiz>(), {
  modo: 'jugar',
  estadoPrevio: undefined,
});
const emit = defineEmits<EmitsActividadQuiz>();

const intentos = ref(intentoInicial(props.estadoPrevio));
// Emisor de `progreso`: agrupa las emisiones, y tras `completada` no emite más (ver types.ts).
const emisor = crearEmisorProgreso<ProgresoActividad>((p) => emit('progreso', p));
onBeforeUnmount(() => emisor.vaciar());
const respuestas = ref<Record<string, RespuestaPregunta>>({});
const anuncio = ref('');
const preguntas = computed(() => props.actividad.config.preguntas);
const jugando = computed(() => props.modo === 'jugar');

// El estado del servidor puede llegar después de montar: hasta la primera interacción, el
// número de intento se recalcula con lo último que se sabe.
watch(
  () => props.estadoPrevio,
  (nuevo) => {
    if (Object.keys(respuestas.value).length === 0) intentos.value = intentoInicial(nuevo);
  },
  { deep: true },
);

function responder(id: string, respuesta: RespuestaPregunta): void {
  if (!jugando.value) return;
  const pregunta = preguntas.value.find((p) => p.id === id);
  if (!pregunta) return;
  respuestas.value = { ...respuestas.value, [id]: respuesta };
  const acierto = precisionPregunta(pregunta, respuesta) === 1;
  anuncio.value = acierto ? 'Respuesta correcta.' : 'Respuesta incorrecta.';
  emit('interaccion', {
    accion: 'responde_pregunta',
    objeto: id,
    resultado: acierto ? 'correcta' : 'incorrecta',
  });
  emisor.emitir({
    avance: Object.keys(respuestas.value).length / preguntas.value.length,
    intentos: intentos.value,
    instantanea: { respondidas: Object.keys(respuestas.value) },
  });
}

function terminar(): void {
  if (!jugando.value) return;
  const precision = precisionQuiz(preguntas.value, respuestas.value);
  const puntaje = calcularPuntaje(props.actividad, { precision, intentos: intentos.value });
  anuncio.value = `Terminaste el quiz: ${puntaje} puntos.`;
  emisor.cerrar();
  emit('completada', {
    puntaje,
    intentos: intentos.value,
    precision,
    detalle: {
      preguntas: Object.fromEntries(
        preguntas.value.map((p) => [
          p.id,
          Math.round(precisionPregunta(p, respuestas.value[p.id]) * 100) / 100,
        ]),
      ),
    },
  });
}

defineExpose({ responder, terminar });
</script>

<template>
  <section>
    <h3>{{ props.actividad.titulo }}</h3>
    <p>{{ props.actividad.instrucciones }}</p>
    <ul>
      <li v-for="pregunta in preguntas" :key="pregunta.id">{{ pregunta.enunciado }}</li>
    </ul>
    <button type="button" data-test="terminar" @click="terminar">Terminar</button>
    <p aria-live="polite" data-test="anuncio">{{ anuncio }}</p>
  </section>
</template>
