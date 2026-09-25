<script setup lang="ts">
/**
 * Demo de la Fase 1 (F1-12): "hola mandíbula". Muestra el modelo 3D provisional con la
 * escena a la altura completa disponible y la atribución que exige su licencia.
 * Ruta: /demo-mandibula (carga perezosa, es la única que arrastra three.js).
 */
import AtribucionMandibula from '@/scenes/AtribucionMandibula.vue';
import MandibulaScene from '@/scenes/MandibulaScene.vue';
</script>

<template>
  <section class="vista-demo" aria-labelledby="titulo-demo-mandibula">
    <div class="px-4 pt-3 pb-2 md:px-6">
      <h1 id="titulo-demo-mandibula" class="text-xl font-semibold md:text-2xl">
        Demo de mandíbula 3D
      </h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Demo de la Fase 1 con un modelo provisional.
        <AtribucionMandibula />
      </p>
    </div>
    <div class="min-h-0 flex-1">
      <MandibulaScene />
    </div>
  </section>
</template>

<style scoped>
/*
 * Altura = pantalla completa menos lo que reserva el AppShell: la cabecera (--altura-cabecera
 * más su borde y la zona segura superior) y el relleno inferior de <main> que deja libres los
 * botones flotantes. Así la página no se desplaza y el gesto de arrastre queda para el 3D.
 */
.vista-demo {
  display: flex;
  flex-direction: column;
  height: calc(
    100dvh - var(--altura-cabecera) - 1px - var(--area-segura-arriba) -
      max(6rem, calc(var(--area-segura-abajo) + 5rem))
  );
  min-height: 20rem;
}
</style>
