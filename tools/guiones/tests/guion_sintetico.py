"""Guion sintético mínimo para las pruebas del convertidor.

Es un módulo 1 completo y válido con UNA actividad de cada tipo, un bloque de cada clase y una
marca [verificar]. Las pruebas lo modifican con `construir(...)` para provocar cada caso.
"""

from __future__ import annotations

from textwrap import dedent

CABECERA = dedent(
    """\
    # Modulo 1: Conociendo el hueso

    > BORRADOR de prueba.

    ## Ficha

    - Modulo: 1 de 6
    - Foco: Un foco de prueba para el módulo sintético.
    - Densidad: media
    - Duracion estimada: 30 a 40 minutos [verificar].
    - Logro que se otorga: prueba. Requisito: al menos el 70 % en la evaluación final.
    - Puntaje maximo del modulo: 120 puntos.

    ## Objetivos de aprendizaje

    1. **Describir** la primera cosa importante del módulo de prueba.
    2. **Explicar** la segunda cosa importante del módulo de prueba.

    ## Conexion con el hueso mandibular

    La mandíbula es el ejemplo de prueba. Cada concepto vuelve a ella.

    ## Ilustraciones y modelos requeridos

    | id de archivo | Qué muestra | Capas o zonas (id = etiqueta) | Se usa en |
    |---|---|---|---|
    | `m1_dibujo` | Un dibujo de prueba con tres capas. | `capa_a` = Capa A; `capa_b` = Capa B; `capa_c` = Capa C | Actividad m1_1_multicapa |
    | `m1_escena` | Escena de prueba con dos zonas y una cadena. | `zona_1` = Zona 1; `zona_2` = Zona 2; `cadena` = Cadena | Actividad m1_2_video |
    | `mandibula` (modelo 3D) | Mandíbula. | Hotspots: `cuerpo` = Cuerpo; `rama` = Rama | Actividad m1_2_3d |

    ## Secciones

    > Convenciones de este guion de prueba.

    """
)

SECCION_1 = dedent(
    """\
    ### Seccion 1.1: Primera sección (id "m1_1_primera")

    #### Contenido

    Un párrafo inicial sin título que abre la sección de prueba.

    **Un subtítulo en negrita**

    Un párrafo con una cifra dudosa: el 99 % del calcio [verificar]. Sigue el texto.

    - Primer elemento de la lista.
    - Segundo elemento de la lista.

    | Rasgo | Uno | Otro |
    |---|---|---|
    | Matriz | Blanda | Rígida |
    | Células | Fibroblastos | Osteoblastos |

    > Clinico: el aviso clínico empieza en minúscula.

    > Dato: un dato clave.

    > Atención: con tilde también vale.

    > Recuerda: una idea para retener.

    ![Un dibujo de prueba con tres capas y su descripción](m1_dibujo)

    **Para profundizar (plegable; no se evalúa)**

    Un texto de profundización que solo ve el posgrado.

    #### Actividades

    ##### Actividad m1_1_multicapa

    ```yaml
    tipo: multicapa
    titulo: "Explora el dibujo"
    instrucciones: "Toca cada capa del dibujo para leer qué es. Visita las tres capas."
    obligatoria: true
    puntaje_max: 20
    concepto: "Capas de prueba"
    retroalimentacion:
      acierto: "Muy bien, ya conoces las tres capas del dibujo."
      error: "Todavía faltan capas por visitar en el dibujo."
    interaccion: "Ratón, táctil y teclado."
    svg: m1_dibujo
    modo: explorar
    capas:
      - id: capa_a
        etiqueta: "Capa A"
        descripcion: "Descripción de la capa A de prueba."
      - id: capa_b
        etiqueta: "Capa B"
        descripcion: "Descripción de la capa B de prueba."
      - id: capa_c
        etiqueta: "Capa C"
        descripcion: "Descripción de la capa C de prueba."
    requeridas: [capa_a, capa_b, capa_c]
    ```

    ##### Actividad m1_1_quiz

    ```yaml
    tipo: quiz
    titulo: "Quiz de prueba"
    instrucciones: "Responde cada pregunta y lee la explicación que aparece después."
    obligatoria: true
    puntaje_max: 20
    concepto: "osificacion_de_prueba"
    retroalimentacion:
      acierto: "Correcto, dominas el tema de prueba."
      parcial: "Vas bien, repasa las explicaciones."
      error: "Repasa la sección y vuelve a intentarlo."
    preguntas:
      - id: m1_1_q1
        formato: opcion_multiple
        enunciado: "¿Cuál es la respuesta correcta de la pregunta uno?"
        opciones:
          - id: a
            texto: "Opción A"
          - id: b
            texto: "Opción B"
          - id: c
            texto: "Opción C"
        correcta: b
        explicacion: "La opción B es la correcta porque sí, de prueba."
        dificultad: 1
        concepto: "Concepto de la pregunta"
      - id: m1_1_q2
        formato: verdadero_falso
        enunciado: "Este enunciado de prueba es falso, ¿verdad?"
        correcta: falso
        explicacion: "Es falso, la explicación lo dice de prueba."
        dificultad: 2
      - id: m1_1_q3
        formato: ordenar_pasos
        enunciado: "Ordena los pasos de la secuencia de prueba."
        pasos:
          - id: p1
            texto: "1. Tercer paso"
          - id: p2
            texto: "Primer paso"
          - id: p3
            texto: "Segundo paso"
        correcta: [p2, p3, p1]
        explicacion: "El orden correcto es primero, segundo y tercero."
        dificultad: 2
      - id: m1_1_q4
        formato: opcion_multiple
        enunciado: "Marca todas las respuestas correctas de esta pregunta."
        opciones:
          - id: a
            texto: "Correcta uno"
          - id: b
            texto: "Correcta dos"
          - id: c
            texto: "Incorrecta uno"
          - id: d
            texto: "Incorrecta dos"
        correcta: [a, b]
        explicacion: "Las dos primeras son correctas, las otras no."
    ```

    ##### Actividad m1_1_video

    ```yaml
    tipo: video-texto
    titulo: "Recorrido en pasos"
    instrucciones: "Avanza paso a paso con Siguiente hasta el último paso."
    obligatoria: false
    puntaje_max: 10
    concepto: "Pasos de prueba"
    retroalimentacion:
      acierto: "Completaste el recorrido de prueba."
      error: "Llega hasta el último paso para completar."
    ilustracion: m1_escena
    pasos:
      - id: paso_1
        titulo: "Primer paso"
        texto_narrado: "En el primer paso solo se ve la zona uno."
        capas_visibles: [zona_1]
      - id: paso_2
        titulo: "Segundo paso"
        texto: "En el segundo paso se ven las dos zonas y se resalta la segunda."
        cambia_escena:
          mostrar: [zona_1, zona_2]
          resaltar: [zona_2]
          animacion: "La zona dos pulsa."
      - id: v3_cadena
        titulo: "Tercer paso"
        texto: "En el tercer paso aparece la cadena."
        escena: "Aparece la cadena junto a zona_2."
    ```

    """
)

SECCION_2 = dedent(
    """\
    ### Seccion 1.2: Segunda sección (id "m1_2_segunda")

    #### Contenido

    Un párrafo de la segunda sección de prueba.

    #### Actividades

    ##### Actividad m1_2_relacion

    ```yaml
    tipo: relacion-columnas
    titulo: "Une cada cosa"
    instrucciones: "Toca un elemento de cada columna para unirlos. Sobra una descripción."
    obligatoria: true
    puntaje_max: 20
    concepto: "Relación de prueba"
    retroalimentacion:
      acierto: "Correcto, todas las uniones son correctas."
      error: "Alguna unión no es correcta, repasa la sección."
    izquierda:
      - id: f_uno
        texto: "Uno"
      - id: f_dos
        texto: "Dos"
      - id: f_tres
        texto: "Tres"
    derecha:
      - id: d_uno
        texto: "Descripción del uno."
      - id: d_dos
        texto: "Descripción del dos."
      - id: d_tres
        texto: "Descripción del tres."
      - id: d_sobra
        texto: "Descripción que sobra."
    pares:
      - izquierda: f_uno
        derecha: d_uno
        explicacion: "El uno se une con su descripción propia."
      - izquierda: f_dos
        derecha: d_dos
      - izquierda: f_tres
        derecha: d_tres
    ```

    ##### Actividad m1_2_arrastre

    ```yaml
    tipo: arrastre-molecular
    titulo: "Lleva cada molécula"
    instrucciones: "Arrastra cada molécula hasta su receptor y observa el efecto. Una no encaja."
    obligatoria: true
    puntaje_max: 20
    concepto: "Moléculas de prueba"
    retroalimentacion:
      acierto: "Muy bien, cada molécula encaja en su receptor."
      error: "Esa molécula no encaja ahí, fíjate en su origen."
    svg: m1_escena
    escena: "Una escena de prueba con tres receptores en la membrana de una célula."
    moleculas:
      - id: alfa
        nombre: "Alfa (molécula con nombre largo de prueba)"
        descripcion: "Molécula alfa de prueba que activa su receptor."
      - id: beta
        nombre: "Beta"
        descripcion: "Molécula beta de prueba que bloquea su receptor."
    receptores:
      - id: recept_uno
        nombre: "Receptor uno"
        descripcion: "Receptor de la molécula alfa en la membrana."
      - id: recept_dos
        nombre: "Receptor dos"
        descripcion: "Receptor de la molécula beta en la membrana."
    pares:
      - molecula: alfa
        receptor: recept_uno
        efecto:
          titulo: "Se activa la señal"
          descripcion: "La molécula alfa activa el receptor y la señal avanza."
          que_se_anima: "La señal se activa con un pulso."
      - molecula: beta
        receptor: recept_dos
        efecto:
          titulo: "Se bloquea el receptor"
          descripcion: "La molécula beta bloquea el receptor de la célula."
          animacion: inhibicion
          indicadores:
            - etiqueta: "Señal"
              direccion: disminuye
    distractores:
      - molecula: gamma
        nombre: "Gamma"
        descripcion: "Molécula gamma que no encaja en ningún receptor."
        por_que: "La gamma no se une a ninguno de los receptores de esta escena."
    ```

    ##### Actividad m1_2_3d

    ```yaml
    tipo: exploracion-3d
    titulo: "Recorre la mandíbula"
    instrucciones: "Gira la mandíbula y toca cada punto marcado para leer su descripción."
    obligatoria: true
    puntaje_max: 10
    concepto: "Anatomía de prueba"
    retroalimentacion:
      acierto: "Excelente, reconoces las partes de la mandíbula."
      error: "Todavía quedan puntos por visitar en el modelo."
    modelo: mandibula
    hotspots:
      - id: cuerpo
        etiqueta: "Cuerpo"
        descripcion: "Porción horizontal de la mandíbula, de prueba."
        zona_anatomica: "Porción horizontal"
      - id: rama
        etiqueta: "Rama"
        descripcion: "Porción vertical de la mandíbula, de prueba."
    requeridos: [cuerpo, rama]
    ```

    ##### Actividad m1_2_evaluacion_final

    ```yaml
    tipo: quiz
    titulo: "Evaluación final"
    instrucciones: "Responde las preguntas de la evaluación final del módulo."
    obligatoria: true
    puntaje_max: 20
    concepto: "Evaluación de prueba"
    retroalimentacion:
      acierto: "Excelente, has terminado la evaluación final."
      error: "Repasa el módulo y vuelve a intentarlo."
    preguntas:
      - id: m1_e_q1
        formato: verdadero_falso
        enunciado: "Esta afirmación de la evaluación es verdadera, ¿cierto?"
        correcta: verdadero
        explicacion: "Es verdadera, como dice la explicación de prueba."
        dificultad: 1
    ```

    """
)

FINAL = dedent(
    """\
    ## Glosario

    - **Osteoblasto:** célula que forma la matriz ósea nueva [verificar].
    - **Matriz:** material que rodea a las células de un tejido.
    - **Osteona (sistema de Havers, unidad estructural del hueso cortical compacto):** unidad estructural del hueso.

    ## Referencias

    1. Ross MH, Pawlina W. *Ross. Histología: Texto y Atlas.* Wolters Kluwer.

    ## Banco de preguntas para el mentor

    1. Pregunta: ¿Algo?

    ## Ganchos para el mentor

    Texto.

    ## Notas de verificacion para el docente

    Texto.
    """
)


def construir(seccion_1: str | None = None, seccion_2: str | None = None, extra: str = "") -> str:
    """Guion completo; `seccion_1`/`seccion_2` sustituyen a las de base para provocar un caso."""
    return CABECERA + (seccion_1 or SECCION_1) + (seccion_2 or SECCION_2) + extra + FINAL
