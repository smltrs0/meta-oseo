<script setup lang="ts">
/**
 * STUB de la base (F1-08). El agente del mentor lo reescribe entero en F1-13 (más
 * subcomponentes en esta carpeta): en móvil, botón flotante que abre una hoja inferior; en
 * escritorio, panel lateral derecho. Ruta y nombre fijos: AppShell lo monta sin props y el
 * panel se posiciona a sí mismo con `position: fixed`.
 */
import { ref } from 'vue';
import { MessageCircle } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useMentor } from '@/ai/useMentor';

const abierto = ref(false);
const { mensajes } = useMentor();
</script>

<template>
  <Sheet v-model:open="abierto">
    <SheetTrigger as-child>
      <Button
        size="icon-lg"
        class="fixed z-40 rounded-full shadow-lg"
        style="
          right: max(1rem, var(--area-segura-derecha));
          bottom: max(1rem, var(--area-segura-abajo));
        "
        data-testid="mentor-stub"
      >
        <MessageCircle aria-hidden="true" />
        <span class="sr-only">Abrir al mentor</span>
      </Button>
    </SheetTrigger>
    <SheetContent side="bottom" class="max-h-[85dvh]">
      <SheetHeader>
        <SheetTitle>Mentor</SheetTitle>
        <SheetDescription>El chat con el mentor de IA llega en la tarea F1-13.</SheetDescription>
      </SheetHeader>
      <p class="text-muted-foreground px-4 pb-6 text-sm">
        Mensajes en esta sesión: {{ mensajes.length }}
      </p>
    </SheetContent>
  </Sheet>
</template>
