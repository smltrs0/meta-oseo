<script setup lang="ts">
import { useId } from 'vue';

/**
 * Ilustración decorativa: un osteón (sistema de Havers) visto al microscopio, dentro de un
 * campo circular. Es el motivo visual del OVA: el círculo del campo microscópico se repite
 * en el menú circular y en los números de los módulos. Solo usa tokens de color del tema,
 * por lo que se adapta al modo oscuro. Es decorativa (aria-hidden); no transmite información.
 */
// Id único por instancia: la ilustración puede aparecer más de una vez en la misma página.
const idCampo = `campo-${useId()}`;

const anillos = [30, 41, 52, 63, 74, 85];

// Osteocitos: lagunas alargadas en la dirección de cada lámina, repartidas con el ángulo áureo
// para que no formen radios evidentes. Determinista (sin Math.random) => render estable.
const ANGULO_AUREO = 137.508;
const lagunas = anillos.flatMap((r, i) =>
  Array.from({ length: 5 + i * 2 }, (_, k) => ({
    // A mitad de camino entre dos láminas (separadas 11 unidades).
    r: r + 5.5,
    angulo: (k * 360) / (5 + i * 2) + i * ANGULO_AUREO,
  })),
);
</script>

<template>
  <svg viewBox="0 0 200 200" role="presentation" aria-hidden="true" focusable="false">
    <defs>
      <clipPath :id="idCampo">
        <circle cx="100" cy="100" r="96" />
      </clipPath>
    </defs>

    <g :clip-path="`url(#${idCampo})`">
      <!-- Matriz teñida (eosina) -->
      <rect width="200" height="200" fill="var(--accent)" />

      <!-- Láminas intersticiales de osteones vecinos, cortadas por el borde -->
      <g fill="none" stroke="var(--eosina)" stroke-opacity="0.35" stroke-width="1.4">
        <circle cx="-8" cy="20" r="34" />
        <circle cx="-8" cy="20" r="46" />
        <circle cx="212" cy="190" r="30" />
        <circle cx="212" cy="190" r="42" />
        <circle cx="212" cy="190" r="54" />
      </g>

      <!-- Láminas concéntricas del osteón (hematoxilina) -->
      <g fill="none" stroke="var(--primary)" stroke-width="1.6">
        <circle
          v-for="(r, i) in anillos"
          :key="r"
          cx="100"
          cy="100"
          :r="r"
          :stroke-opacity="0.55 - i * 0.06"
        />
      </g>

      <!-- Lagunas con osteocitos -->
      <g fill="var(--primary)" fill-opacity="0.75">
        <ellipse
          v-for="(l, i) in lagunas"
          :key="i"
          rx="1.7"
          ry="3.6"
          :transform="`rotate(${l.angulo} 100 100) translate(${100 + l.r} 100)`"
        />
      </g>

      <!-- Conducto de Havers -->
      <circle
        cx="100"
        cy="100"
        r="17"
        fill="var(--background)"
        stroke="var(--primary)"
        stroke-width="2.4"
      />
      <circle cx="100" cy="100" r="7" fill="var(--eosina)" fill-opacity="0.55" />
    </g>

    <!-- Borde del ocular -->
    <circle cx="100" cy="100" r="96" fill="none" stroke="var(--primary)" stroke-width="3" />

    <!-- Barra de escala, como en las figuras de histología -->
    <g stroke="var(--foreground)" stroke-width="2" stroke-linecap="square">
      <line x1="128" y1="176" x2="164" y2="176" />
      <line x1="128" y1="172" x2="128" y2="180" />
      <line x1="164" y1="172" x2="164" y2="180" />
    </g>
    <text
      x="146"
      y="168"
      text-anchor="middle"
      font-size="9"
      fill="var(--foreground)"
      font-family="var(--font-sans)"
    >
      100 µm
    </text>
  </svg>
</template>
