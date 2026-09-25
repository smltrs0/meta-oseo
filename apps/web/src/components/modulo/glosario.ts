/**
 * Protocolo del glosario entre los textos y la página de módulo. Los enlaces `[término](glosario:id)`
 * salen de `@/content/markdown` como `<a data-glosario="id" href="#glosario-id">`. Quien pinta el
 * texto (esta carpeta y los componentes de actividad) intercepta el clic y lanza
 * `CustomEvent('ova:glosario', { bubbles, composed, detail: { id } })` sobre el enlace; la página
 * lo escucha en `document` (así también llegan los enlaces que hay dentro de la propia hoja del
 * glosario, que Vue teletransporta al final del `<body>`) y abre la definición.
 */
export const EVENTO_GLOSARIO = 'ova:glosario';

/** Si el clic fue sobre un enlace del glosario, lo anuncia y cancela la navegación al ancla. */
export function interceptarEnlaceGlosario(evento: Event): boolean {
  const objetivo = evento.target;
  if (!(objetivo instanceof Element)) return false;
  const enlace = objetivo.closest('a[data-glosario]');
  if (!enlace) return false;
  evento.preventDefault();
  enlace.dispatchEvent(
    new CustomEvent(EVENTO_GLOSARIO, {
      bubbles: true,
      composed: true,
      detail: { id: enlace.getAttribute('data-glosario') ?? '' },
    }),
  );
  return true;
}
