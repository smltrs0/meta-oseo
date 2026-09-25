<script setup lang="ts">
/**
 * Definición de un término del glosario en una hoja inferior (`Sheet`, basada en el diálogo de
 * reka-ui: atrapa el foco, se cierra con Escape y con el botón «Cerrar» de 44 px). Al cerrar, el
 * foco vuelve al enlace que la abrió.
 */
import { nextTick } from 'vue';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { TerminoGlosario } from '@/content/schema';
import TextoRico from './TextoRico.vue';

const props = defineProps<{
  termino: TerminoGlosario | null;
  /** Elemento que abrió la hoja, para devolverle el foco. */
  disparador: HTMLElement | null;
}>();

const emit = defineEmits<{ cerrar: [] }>();

function alCambiar(abierto: boolean): void {
  if (!abierto) emit('cerrar');
}

function devolverFoco(evento: Event): void {
  const destino = props.disparador;
  if (destino?.isConnected) {
    evento.preventDefault();
    void nextTick(() => destino.focus());
  }
}
</script>

<template>
  <Sheet :open="termino !== null" @update:open="alCambiar">
    <SheetContent
      side="bottom"
      class="mx-auto max-h-[70dvh] w-full max-w-2xl overflow-y-auto rounded-t-xl px-5 pt-6 pb-8"
      style="padding-bottom: max(2rem, var(--area-segura-abajo))"
      data-testid="hoja-glosario"
      @close-auto-focus="devolverFoco"
    >
      <SheetHeader class="p-0 pr-10">
        <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Glosario</p>
        <SheetTitle class="font-serif text-xl">{{ termino?.termino }}</SheetTitle>
        <SheetDescription as-child>
          <div class="text-foreground text-base leading-relaxed">
            <TextoRico v-if="termino" :texto="termino.definicion" modo="linea" />
          </div>
        </SheetDescription>
      </SheetHeader>
    </SheetContent>
  </Sheet>
</template>
