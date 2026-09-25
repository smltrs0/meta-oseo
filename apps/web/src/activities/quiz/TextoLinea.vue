<script lang="ts">
/**
 * Una línea de texto con el Markdown restringido del contenido (negrita, cursiva, enlaces del
 * glosario y https). ÚNICO lugar del quiz que inyecta HTML: el HTML sale de `renderizarLinea`
 * (`@/content/markdown`), que escapa el HTML crudo y filtra etiquetas y atributos con lista blanca.
 * Nunca se le pasa texto sin renderizar. Se escribe como función de render (y no con `v-html`) para
 * que este sea el único punto auditable y no deje comentarios en el DOM.
 */
import { defineComponent, h } from 'vue';
import { renderizarLinea } from '@/content/markdown';

export default defineComponent({
  name: 'TextoLinea',
  props: { texto: { type: String, default: '' } },
  setup(props) {
    return () =>
      h('span', {
        class: 'texto-linea',
        innerHTML: renderizarLinea(typeof props.texto === 'string' ? props.texto : ''),
      });
  },
});
</script>

<style scoped>
/* Texto largo o sin espacios (Unicode, ids, fórmulas) no debe desbordar la pantalla del móvil. */
.texto-linea {
  overflow-wrap: anywhere;
}
.texto-linea :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.texto-linea :deep(a.enlace-glosario) {
  text-decoration-style: dotted;
}
</style>
