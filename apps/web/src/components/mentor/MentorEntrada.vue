<script setup lang="ts">
/**
 * Campo de entrada del chat: textarea que crece, Enter envía y Shift+Enter salta de línea.
 *
 * - Mientras el mentor responde, el campo queda deshabilitado y el botón de enviar se cambia por
 *   "Detener".
 * - Junto al límite de 8000 caracteres (contados como el backend) aparece un contador; pasado el
 *   límite el envío se bloquea en vez de recortar el texto en silencio.
 * - Tipografía de 16 px: por debajo, iOS hace zoom al enfocar el campo.
 * - Al terminar la respuesta el foco vuelve al campo, salvo en pantallas táctiles (evita que el
 *   teclado virtual reaparezca solo).
 */
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { SendHorizontal, Square } from '@lucide/vue';
import { MAX_CARACTERES, contarCaracteres } from '@/ai/limites';
import { Button } from '@/components/ui/button';

const props = defineProps<{ modelValue: string; ocupado: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [texto: string];
  enviar: [texto: string];
  detener: [];
}>();

/** Desde este número de caracteres se muestra el contador. */
const UMBRAL_CONTADOR = 7000;
/** Altura máxima del campo (10 rem ≈ 6 líneas); después aparece desplazamiento interno. */
const ALTURA_MAXIMA_PX = 160;

const idCampo = useId();
const idContador = useId();
const campo = ref<HTMLTextAreaElement | null>(null);
const raiz = ref<HTMLElement | null>(null);
const tactil = useMediaQuery('(pointer: coarse)');

const cuenta = computed(() => contarCaracteres(props.modelValue));
const excedido = computed(() => cuenta.value > MAX_CARACTERES);
const mostrarContador = computed(() => cuenta.value >= UMBRAL_CONTADOR);
const puedeEnviar = computed(
  () => !props.ocupado && props.modelValue.trim().length > 0 && !excedido.value,
);
const textoContador = computed(() =>
  excedido.value
    ? `Te pasaste por ${cuenta.value - MAX_CARACTERES} caracteres (máximo ${MAX_CARACTERES}).`
    : `${cuenta.value} de ${MAX_CARACTERES} caracteres`,
);

function ajustarAltura(): void {
  const el = campo.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAXIMA_PX)}px`;
}

function alEscribir(evento: Event): void {
  emit('update:modelValue', (evento.target as HTMLTextAreaElement).value);
}

function enviar(): void {
  if (!puedeEnviar.value) return;
  emit('enviar', props.modelValue.trim());
}

function alTeclear(evento: KeyboardEvent): void {
  if (evento.key !== 'Enter' || evento.shiftKey) return;
  // Con un editor de método de entrada (IME) Enter confirma la composición, no envía.
  if (evento.isComposing || evento.keyCode === 229) return;
  evento.preventDefault();
  enviar();
}

function enfocar(): void {
  campo.value?.focus({ preventScroll: true });
}

watch(
  () => props.modelValue,
  () => void nextTick(ajustarAltura),
);
onMounted(ajustarAltura);

// Tras la respuesta, devuelve el foco al campo si se había quedado sin dueño (se deshabilitó).
watch(
  () => props.ocupado,
  async (ahora, antes) => {
    if (!antes || ahora) return;
    await nextTick();
    const activo = document.activeElement;
    const sinDuenio = !activo || activo === document.body || !!raiz.value?.contains(activo);
    if (sinDuenio && !tactil.value) enfocar();
  },
);

defineExpose({ enfocar });
</script>

<template>
  <div
    ref="raiz"
    class="bg-background border-t px-3 pt-2.5"
    style="padding-bottom: max(0.75rem, var(--area-segura-abajo))"
  >
    <form class="flex items-end gap-2" @submit.prevent="enviar">
      <div class="min-w-0 flex-1">
        <label :for="idCampo" class="sr-only">Escribe tu pregunta al mentor</label>
        <textarea
          :id="idCampo"
          ref="campo"
          :value="modelValue"
          rows="1"
          enterkeyhint="send"
          autocomplete="off"
          placeholder="Escribe tu pregunta…"
          class="border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive block max-h-40 min-h-11 w-full resize-none overflow-y-auto rounded-md border px-3 py-2.5 text-base leading-6 shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="ocupado"
          :aria-busy="ocupado ? 'true' : undefined"
          :aria-invalid="excedido ? 'true' : undefined"
          :aria-describedby="mostrarContador ? idContador : undefined"
          data-testid="mentor-campo"
          @input="alEscribir"
          @keydown="alTeclear"
        />
      </div>

      <Button
        v-if="ocupado"
        type="button"
        variant="outline"
        class="shrink-0"
        data-testid="mentor-detener"
        @click="emit('detener')"
      >
        <Square aria-hidden="true" class="fill-current" />
        Detener
      </Button>
      <Button
        v-else
        type="submit"
        size="icon"
        class="shrink-0"
        :disabled="!puedeEnviar"
        data-testid="mentor-enviar"
      >
        <SendHorizontal aria-hidden="true" />
        <span class="sr-only">Enviar</span>
      </Button>
    </form>

    <p
      v-if="mostrarContador"
      :id="idContador"
      class="mt-1 text-xs tabular-nums"
      :class="excedido ? 'text-destructive font-medium' : 'text-muted-foreground'"
      data-testid="mentor-contador"
    >
      {{ textoContador }}
    </p>

    <p class="text-muted-foreground mt-2 text-xs leading-snug">
      Respuestas generadas por IA. Verifica con el material del curso.
    </p>
  </div>
</template>
