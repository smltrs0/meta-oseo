<script setup lang="ts">
/**
 * Panel de módulo completado: felicita, dice si el servidor ya registró el avance, explica un
 * 409 `modulo_incompleto` (qué actividades no llegaron al servidor) y ofrece el siguiente paso:
 * el módulo siguiente o, tras el módulo 6, el certificado (`RUTA_CERTIFICADO`). Si esa página aún
 * no existe se muestra un aviso en vez de un enlace roto.
 */
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { ArrowRight, Award, LoaderCircle, PartyPopper, TriangleAlert } from '@lucide/vue';
import { buttonVariants } from '@/components/ui/button';
import { RUTA_CERTIFICADO, TOTAL_MODULOS } from '@/config';
import { moduloPorNumero } from '@/data/modulos';
import { cn } from '@/lib/utils';

const props = defineProps<{
  numero: number;
  puntajeObtenido: number;
  puntajeMaximo: number;
  /** El servidor ya marcó el módulo como completado. */
  guardado: boolean;
  /** Títulos de las actividades que el servidor dice no tener (409). */
  faltantes: readonly string[];
  /** ¿Se puede abrir el módulo siguiente? (con el bloqueo secuencial, cuando el servidor lo guardó). */
  siguienteAbierto: boolean;
}>();

const router = useRouter();
const siguiente = computed(() => moduloPorNumero(props.numero + 1));
const esUltimo = computed(() => props.numero >= TOTAL_MODULOS);
const hayCertificado = computed(() => {
  const destino = router.resolve(RUTA_CERTIFICADO);
  return destino.matched.length > 0 && destino.name !== 'no_encontrado';
});
</script>

<template>
  <section
    aria-labelledby="titulo-completado"
    class="bg-success-soft mt-8 space-y-3 rounded-xl border p-5"
    data-testid="modulo-completado"
  >
    <div class="flex items-start gap-3">
      <PartyPopper class="text-success mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div class="space-y-1">
        <h2 id="titulo-completado" class="text-foreground font-serif text-xl font-semibold">
          ¡Completaste el módulo {{ numero }}!
        </h2>
        <p class="text-foreground">
          Sumaste {{ puntajeObtenido }} de {{ puntajeMaximo }} puntos posibles en este módulo.
        </p>
      </div>
    </div>

    <p
      v-if="faltantes.length > 0"
      class="text-foreground bg-accent flex items-start gap-2 rounded-md px-3 py-2 text-sm"
      role="status"
      data-testid="modulo-faltantes"
    >
      <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Tu avance aún no está completo en el servidor. Falta el resultado de:
        {{ faltantes.map((f) => `«${f}»`).join(', ') }}. Vuelve a hacer esa actividad para
        registrarla.
      </span>
    </p>
    <p
      v-else-if="!guardado"
      class="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
      data-testid="modulo-guardando"
    >
      <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" />
      Guardando tu avance…
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <template v-if="!esUltimo && siguiente">
        <RouterLink
          v-if="siguienteAbierto"
          :to="{ name: 'modulo', params: { n: siguiente.numero } }"
          :class="cn(buttonVariants())"
          data-testid="siguiente-modulo"
        >
          Módulo {{ siguiente.numero }}: {{ siguiente.titulo }}
          <ArrowRight aria-hidden="true" />
        </RouterLink>
        <p v-else class="text-muted-foreground text-sm" data-testid="siguiente-pendiente">
          El módulo {{ siguiente.numero }} se abrirá en cuanto se guarde tu avance.
        </p>
      </template>
      <template v-else-if="esUltimo">
        <RouterLink
          v-if="hayCertificado"
          :to="RUTA_CERTIFICADO"
          :class="cn(buttonVariants())"
          data-testid="ver-certificado"
        >
          <Award aria-hidden="true" />
          Ver mi certificado
        </RouterLink>
        <p v-else class="text-foreground text-sm" data-testid="certificado-pronto">
          <Award class="mr-1 inline size-4" aria-hidden="true" />
          Terminaste el recorrido. El certificado estará disponible muy pronto.
        </p>
      </template>
      <RouterLink :to="{ name: 'inicio' }" :class="cn(buttonVariants({ variant: 'outline' }))">
        Volver al inicio
      </RouterLink>
    </div>
  </section>
</template>
