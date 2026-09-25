<script setup lang="ts">
/**
 * Línea de crédito del modelo provisional de la mandíbula (BodyParts3D, CC BY-SA 2.1 Japón). La
 * licencia exige acreditar al autor, enlazar la licencia e indicar que se modificó el modelo:
 * toda pantalla que muestre la mandíbula debe llevarla (docs/atribuciones.md). No importa three.
 */
const URL_ARCHIVO = 'https://commons.wikimedia.org/wiki/File:BodyParts3D_FJ6399_Mandible.stl';
const URL_LICENCIA = 'https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en';
</script>

<template>
  <span data-test="atribucion-mandibula"
    >Modelo:
    <a
      :href="URL_ARCHIVO"
      class="text-primary underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
      >BodyParts3D</a
    >, © The Database Center for Life Science, licencia
    <a
      :href="URL_LICENCIA"
      class="text-primary underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
      >CC BY-SA 2.1 Japón</a
    >; reorientado, centrado y reescalado.</span
  >
</template>
