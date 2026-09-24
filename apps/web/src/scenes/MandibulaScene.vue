<script setup lang="ts">
/**
 * STUB de la base (F1-08). El agente de la escena 3D lo reescribe entero en F1-12: carga de
 * la mandíbula (STL de BodyParts3D o GLB), OrbitControls táctiles, clic por malla, limpieza
 * de recursos. Ruta y nombre fijos: DemoMandibulaView lo monta sin props.
 * Por ahora, un lienzo TresJS vacío con cámara y luz.
 *
 * Nota de tipos (@tresjs/core 5.9 + @types/three 0.186): `Object3D.position` es `readonly`
 * en los tipos de three y TresJS no le aplica su tipo flexible, así que
 * `:position="[0, 0, 5]"` y `:scale="2"` NO compilan con vue-tsc (la documentación de
 * TresJS los admite en ejecución, pero aquí no se comprobó). Formas que sí compilan: una
 * instancia `new Vector3(x, y, z)` o los props por eje (`:position-z="5"`).
 * `rotation` sí acepta arrays.
 */
import { TresCanvas } from '@tresjs/core';
import { Vector3 } from 'three';

const posicionCamara = new Vector3(0, 0, 5);
</script>

<template>
  <TresCanvas clear-color="#efecf6">
    <TresPerspectiveCamera :position="posicionCamara" />
    <TresAmbientLight :intensity="1" />
  </TresCanvas>
</template>
