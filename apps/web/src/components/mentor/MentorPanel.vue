<script setup lang="ts">
/**
 * Panel del mentor de IA (F1-13). AppShell lo monta sin props y él se posiciona solo.
 *
 * - Móvil (< 768 px): botón flotante abajo a la derecha que abre una hoja inferior casi a
 *   pantalla completa. Es modal (con fondo atenuado, foco atrapado, Escape cierra) y se ajusta
 *   al teclado virtual.
 * - Escritorio (>= 768 px): el mismo botón abre un panel lateral derecho NO modal: el
 *   estudiante puede seguir usando la escena 3D o el contenido mientras conversa. Se cierra
 *   con su botón o con Escape.
 *
 * El estado de la conversación vive aquí (no dentro de la hoja), así que cerrar el panel no
 * borra el chat ni corta una respuesta en curso; lo hace cerrar sesión o "Nueva conversación".
 * El borrador sin enviar también se conserva.
 *
 * Accesibilidad: título y descripción para el lector de pantalla; el anuncio de la respuesta
 * completa va en una región `aria-live="polite"` (nunca token a token); foco al abrir (en el
 * campo en escritorio; en el título en móvil, para no abrir el teclado sin que el estudiante
 * lo pida) y al cerrar vuelve al botón; objetivos táctiles de al menos 44 px.
 */
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { MessageCircle, SquarePen, TriangleAlert } from '@lucide/vue';
import { useMentor } from '@/ai/useMentor';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import MentorEntrada from './MentorEntrada.vue';
import MentorVacio from './MentorVacio.vue';
import { estiloDeLaHoja } from './geometria';
import { useVisualViewport } from './useVisualViewport';

// La lista de mensajes arrastra markdown-it y DOMPurify (~60 KB gzip): no se descargan hasta que
// se abre el panel por primera vez (se precargan al abrirlo, antes de que el estudiante escriba).
const cargarLista = () => import('./MentorMensajes.vue');
const MentorMensajes = defineAsyncComponent(cargarLista);

const abierto = ref(false);
const esEscritorio = useMediaQuery('(min-width: 768px)');
const esMovil = computed(() => !esEscritorio.value);

const { mensajes, fase, error, ocupado, puedeReintentar, enviar, detener, reintentar, limpiar } =
  useMentor();

/** Texto del campo; vive aquí para sobrevivir al cierre de la hoja. */
const borrador = ref('');

const entrada = ref<InstanceType<typeof MentorEntrada> | null>(null);
const titulo = ref<{ $el?: HTMLElement } | null>(null);

// ---- Aviso de respuesta nueva con el panel cerrado ----------------------------------------
const sinLeer = ref(false);
watch(ocupado, (ahora, antes) => {
  if (antes && !ahora && !abierto.value) sinLeer.value = true;
});
watch(abierto, (valor) => {
  if (valor) {
    sinLeer.value = false;
    void cargarLista();
  }
});

// ---- Anuncios para lectores de pantalla ----------------------------------------------------
// Con el panel abierto, una región viva DENTRO de la hoja avisa que el mentor piensa y, al
// terminar, lee la respuesta completa (nunca token a token). Con el panel cerrado, otra región
// FUERA de la hoja da un aviso corto; la de dentro no sirve entonces porque no existe, y la de
// fuera no sirve con la hoja modal abierta porque queda `aria-hidden`.
const anuncio = ref('');
const avisoCerrado = computed(() =>
  sinLeer.value && !abierto.value
    ? 'El mentor respondió. Abre el panel del mentor para leer la respuesta.'
    : '',
);
watch(fase, (actual) => {
  if (actual === 'thinking') anuncio.value = 'El mentor está pensando.';
});
watch(
  () => {
    const ultimo = mensajes.value.at(-1);
    return ultimo?.role === 'assistant' && ultimo.status === 'completo' ? ultimo : null;
  },
  async (completo) => {
    if (!completo) return;
    // markdown-it ya está cargado (lo usa la lista); se importa aquí para no fijarlo al panel.
    const { textoPlano } = await import('@/ai/markdown');
    anuncio.value = `Respuesta del mentor: ${textoPlano(completo.content)}`;
  },
);

// ---- Envío ---------------------------------------------------------------------------------
function alEnviar(texto: string): void {
  borrador.value = '';
  void enviar(texto);
}

function alPreguntarEjemplo(pregunta: string): void {
  void enviar(pregunta);
}

function nuevaConversacion(): void {
  limpiar();
  borrador.value = '';
  void nextTick(() => {
    if (esEscritorio.value) entrada.value?.enfocar();
  });
}

// ---- Foco y cierre -------------------------------------------------------------------------
function alAbrir(evento: Event): void {
  // Se decide el foco a mano: en móvil el campo no debe abrir el teclado sin que se toque.
  evento.preventDefault();
  void nextTick(() => {
    if (esEscritorio.value) entrada.value?.enfocar();
    else titulo.value?.$el?.focus({ preventScroll: true });
  });
}

function alInteractuarFuera(evento: Event): void {
  // Panel lateral no modal: tocar la escena 3D o el contenido no lo cierra.
  if (esEscritorio.value) evento.preventDefault();
}

// ---- Geometría según el dispositivo ---------------------------------------------------------
const hojaMovilAbierta = computed(() => abierto.value && esMovil.value);
const medidasTeclado = useVisualViewport(hojaMovilAbierta);

const estiloHoja = computed(() => estiloDeLaHoja(esEscritorio.value, medidasTeclado.value));
</script>

<template>
  <Sheet v-model:open="abierto" :modal="esMovil">
    <SheetTrigger as-child>
      <Button
        size="icon-lg"
        class="fixed z-40 rounded-full shadow-lg"
        :tabindex="abierto ? -1 : undefined"
        style="
          right: max(1rem, var(--area-segura-derecha));
          bottom: max(1rem, var(--area-segura-abajo));
        "
        data-testid="mentor-abrir"
      >
        <MessageCircle aria-hidden="true" />
        <span class="sr-only">Abrir al mentor de IA</span>
        <template v-if="sinLeer">
          <span
            class="bg-eosina ring-background absolute -top-0.5 -right-0.5 size-3.5 rounded-full ring-2"
            aria-hidden="true"
            data-testid="mentor-sin-leer"
          />
          <span class="sr-only">, hay una respuesta nueva</span>
        </template>
      </Button>
    </SheetTrigger>

    <SheetContent
      :side="esMovil ? 'bottom' : 'right'"
      class="gap-0 overflow-hidden p-0"
      :class="esMovil ? 'rounded-t-2xl' : ''"
      :style="estiloHoja"
      data-testid="mentor-panel"
      @open-auto-focus="alAbrir"
      @interact-outside="alInteractuarFuera"
    >
      <SheetHeader class="flex-row items-center gap-2 border-b py-2 pr-16 pl-4">
        <div class="min-w-0 flex-1">
          <SheetTitle
            ref="titulo"
            tabindex="-1"
            class="font-serif text-lg leading-tight outline-none"
          >
            Mentor de IA
          </SheetTitle>
          <SheetDescription class="text-xs leading-snug">
            Pregunta sobre lo que estás estudiando.
          </SheetDescription>
        </div>
        <Button
          v-if="mensajes.length > 0"
          type="button"
          variant="ghost"
          size="icon"
          class="shrink-0"
          title="Nueva conversación"
          data-testid="mentor-nueva"
          @click="nuevaConversacion"
        >
          <SquarePen aria-hidden="true" />
          <span class="sr-only">Nueva conversación</span>
        </Button>
      </SheetHeader>

      <MentorVacio
        v-if="mensajes.length === 0"
        class="flex-1 overflow-y-auto"
        @preguntar="alPreguntarEjemplo"
      />
      <MentorMensajes v-else :mensajes="mensajes" />

      <div
        v-if="error"
        role="alert"
        class="bg-accent text-accent-foreground mx-3 mb-2 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        data-testid="mentor-error"
      >
        <TriangleAlert aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
        <p class="min-w-0 flex-1">{{ error }}</p>
        <Button
          v-if="puedeReintentar"
          type="button"
          size="sm"
          variant="outline"
          class="shrink-0"
          data-testid="mentor-reintentar"
          @click="reintentar()"
        >
          Reintentar
        </Button>
      </div>

      <MentorEntrada
        ref="entrada"
        v-model="borrador"
        :ocupado="ocupado"
        @enviar="alEnviar"
        @detener="detener"
      />

      <!-- Región viva: se lee una vez, al terminar la respuesta; nunca token a token. -->
      <div
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="mentor-anuncio"
      >
        {{ anuncio }}
      </div>
    </SheetContent>
  </Sheet>

  <div
    class="sr-only"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    data-testid="mentor-aviso-cerrado"
  >
    {{ avisoCerrado }}
  </div>
</template>
