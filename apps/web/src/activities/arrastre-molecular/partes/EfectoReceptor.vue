<script setup lang="ts">
/**
 * Animación del efecto biológico sobre un receptor (docs/content-schema.md 7.2, "Animaciones del
 * efecto"). Vocabulario cerrado de nueve valores, dibujados solo con CSS (`@keyframes`): sin
 * dependencias, sin temporizadores y sin nada que cancelar al desmontar (si el componente se
 * desmonta a mitad, el navegador descarta las animaciones con los elementos).
 *
 * Es decorativa (`aria-hidden`): el texto del efecto (`titulo`, `descripcion`) siempre se muestra
 * y se anuncia aparte. El anfitrión NO lo renderiza con `prefers-reduced-motion: reduce`; en ese
 * caso el receptor solo muestra su estado final (insignia del efecto), sin movimiento (R3).
 *
 * Al terminar la última animación se quita a sí mismo del DOM (`animationend`), para no dejar
 * elementos invisibles. Se reinicia cambiando la `key` desde fuera.
 */
import { computed, ref } from 'vue';
import type { AnimacionEfecto } from '@/content/schema';

const props = defineProps<{ tipo: AnimacionEfecto }>();

interface Particula {
  i: number;
  dx: number;
  dy: number;
}

const VECTORES: Readonly<Partial<Record<AnimacionEfecto, readonly [number, number][]>>> = {
  crecimiento: [
    [-20, -14],
    [20, -14],
    [0, 20],
  ],
  liberacion: [
    [-26, -30],
    [0, -38],
    [26, -30],
    [-38, -8],
    [38, -8],
  ],
  mineralizacion: [
    [-18, -18],
    [18, -18],
    [-18, 18],
    [18, 18],
  ],
};
const CANTIDAD: Readonly<Record<AnimacionEfecto, number>> = {
  activacion: 2,
  inhibicion: 1,
  cascada: 3,
  union: 1,
  crecimiento: 3,
  transformacion: 1,
  liberacion: 5,
  mineralizacion: 4,
  reabsorcion: 2,
};

const particulas = computed<Particula[]>(() => {
  const vectores = VECTORES[props.tipo];
  return Array.from({ length: CANTIDAD[props.tipo] ?? 1 }, (_, i) => ({
    i,
    dx: vectores?.[i]?.[0] ?? 0,
    dy: vectores?.[i]?.[1] ?? 0,
  }));
});

const terminadas = ref(0);
const visible = computed(() => terminadas.value < particulas.value.length);
function alTerminar(): void {
  terminadas.value += 1;
}
</script>

<template>
  <span v-if="visible" class="fx" :data-fx="tipo" aria-hidden="true">
    <span
      v-for="p in particulas"
      :key="p.i"
      class="p"
      :class="`p-${tipo}`"
      :style="{ '--i': p.i, '--dx': `${p.dx}px`, '--dy': `${p.dy}px` }"
      @animationend="alTerminar"
    />
  </span>
</template>

<style scoped>
.fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.p {
  --t: 10px;
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--t);
  height: var(--t);
  margin: calc(var(--t) / -2) 0 0 calc(var(--t) / -2);
  opacity: 0;
  animation-delay: calc(var(--i) * 0.18s);
  animation-duration: 1.1s;
  animation-fill-mode: both;
  animation-timing-function: ease-out;
}

/* activacion: pulso y anillos de señal */
.p-activacion {
  --t: 44px;
  border: 3px solid var(--success);
  border-radius: 50%;
  animation-name: anillo;
}
@keyframes anillo {
  from {
    opacity: 0.9;
    transform: scale(0.6);
  }
  to {
    opacity: 0;
    transform: scale(2.4);
  }
}

/* inhibicion: aparece un bloqueo sobre el receptor */
.p-inhibicion {
  --t: 44px;
  border: 3px solid var(--destructive);
  border-radius: 50%;
  background: linear-gradient(45deg, transparent 44%, var(--destructive) 44% 56%, transparent 56%);
  animation-name: bloqueo;
  animation-duration: 1.4s;
}
@keyframes bloqueo {
  0% {
    opacity: 0;
    transform: scale(1.6);
  }
  30%,
  75% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

/* cascada: la señal avanza hacia el interior de la célula */
.p-cascada {
  --t: 9px;
  border-radius: 50%;
  background: var(--primary);
  animation-name: descenso;
  animation-duration: 1.2s;
}
@keyframes descenso {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(64px);
  }
}

/* union: encaje neutro con un leve rebote */
.p-union {
  --t: 44px;
  border: 3px solid var(--primary);
  border-radius: 12px;
  animation-name: rebote;
  animation-duration: 0.9s;
  animation-timing-function: ease-in-out;
}
@keyframes rebote {
  0% {
    opacity: 0.9;
    transform: scale(1);
  }
  45% {
    opacity: 0.9;
    transform: scale(1.35);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

/* crecimiento: la estructura crece y se multiplica */
.p-crecimiento {
  --t: 14px;
  border-radius: 50%;
  background: var(--success);
  animation-name: brote;
  animation-duration: 1.3s;
}
@keyframes brote {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0);
  }
  40% {
    opacity: 1;
    transform: translate(var(--dx), var(--dy)) scale(1);
  }
  80% {
    opacity: 1;
    transform: translate(var(--dx), var(--dy)) scale(1.3);
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy)) scale(1.3);
  }
}

/* transformacion: cambio de color y de forma */
.p-transformacion {
  --t: 30px;
  background: var(--primary);
  border-radius: 50%;
  animation-name: metamorfosis;
  animation-duration: 1.4s;
}
@keyframes metamorfosis {
  0% {
    opacity: 0;
    transform: rotate(0) scale(0.6);
    background: var(--primary);
    border-radius: 50%;
  }
  30% {
    opacity: 1;
  }
  75% {
    opacity: 1;
    transform: rotate(180deg) scale(1.1);
    background: var(--eosina);
    border-radius: 6px;
  }
  100% {
    opacity: 0;
    transform: rotate(180deg) scale(1.1);
    background: var(--eosina);
    border-radius: 6px;
  }
}

/* liberacion: partículas que salen de la célula */
.p-liberacion {
  --t: 8px;
  border-radius: 50%;
  background: var(--eosina);
  animation-name: secrecion;
  animation-duration: 1.2s;
  animation-delay: calc(var(--i) * 0.09s);
}
@keyframes secrecion {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy));
  }
}

/* mineralizacion: aparecen cristales pequeños */
.p-mineralizacion {
  --t: 10px;
  background: var(--muted-foreground);
  animation-name: cristal;
  animation-duration: 1.5s;
  animation-delay: calc(var(--i) * 0.12s);
}
@keyframes cristal {
  0% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy)) rotate(45deg) scale(0);
  }
  35%,
  80% {
    opacity: 1;
    transform: translate(var(--dx), var(--dy)) rotate(45deg) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy)) rotate(45deg) scale(1);
  }
}

/* reabsorcion: la estructura se encoge y se disuelve */
.p-reabsorcion {
  --t: 44px;
  border: 3px dashed var(--eosina);
  border-radius: 50%;
  animation-name: encogimiento;
  animation-duration: 1.3s;
}
@keyframes encogimiento {
  0% {
    opacity: 0.9;
    transform: scale(1.8);
  }
  100% {
    opacity: 0;
    transform: scale(0.2);
  }
}
</style>
