"""Esquemas de respuesta del panel docente (`/api/teacher`, docs/api-contract.md, F6-03)."""

from datetime import datetime

from pydantic import BaseModel, Field

# --- Resumen de la cohorte -------------------------------------------------------------------


class ModulosCompletadosBucket(BaseModel):
    """Cuántos estudiantes han completado exactamente `modulos_completados` módulos."""

    modulos_completados: int
    estudiantes: int


class TiempoModulo(BaseModel):
    """Tiempo promedio en un módulo, sobre los estudiantes con fila de progreso en él."""

    modulo: int
    tiempo_promedio_seg: float | None = None
    estudiantes: int = 0


class PuntajeResumen(BaseModel):
    """Puntaje total por estudiante (todos los estudiantes cuentan, con 0 si no puntuaron)."""

    promedio: float | None = None
    mediana: float | None = None


class OverviewRead(BaseModel):
    generado_en: datetime
    estudiantes: int
    activos_7d: int
    activos_30d: int
    modulos_completados: list[ModulosCompletadosBucket]
    tiempo_por_modulo: list[TiempoModulo]
    puntaje: PuntajeResumen


# --- Estudiantes -----------------------------------------------------------------------------


class StudentSummary(BaseModel):
    id: int
    nombre: str
    apellido: str
    tipo_identificacion: str
    # Enmascarada (solo los últimos 3 caracteres) salvo en una búsqueda exacta por número.
    numero_identificacion: str
    identificacion_completa: bool = Field(
        description="`true` si `numero_identificacion` viene completo (búsqueda exacta)."
    )
    nivel: str
    modulos_completados: int
    puntaje_total: int
    ultima_actividad: datetime | None = None
    tiempo_total_seg: int


class StudentPage(BaseModel):
    estudiantes: list[StudentSummary]
    page: int
    page_size: int
    total: int
    total_pages: int


class StudentModulo(BaseModel):
    modulo: int
    seccion_actual: str | None = None
    completado: bool = False
    tiempo_total_seg: int = 0
    updated_at: datetime | None = None


class StudentActividad(BaseModel):
    activity_id: str
    modulo: int
    tipo: str
    mejor_puntaje: int = Field(description="Máximo `puntaje` entre todos los registros.")
    puntaje_contabilizado: int = Field(
        description="Mejor `puntaje` entre los registros completados (el que suma al total)."
    )
    intentos: int = Field(description="Máximo `intentos` reportado por el cliente.")
    registros: int = Field(description="Filas guardadas (historial).")
    completada: bool
    ultimo_intento: datetime | None = None


class StudentMentor(BaseModel):
    consultas: int = 0
    tokens_entrada: int = 0
    tokens_salida: int = 0
    tokens_cache_lectura: int = 0
    tokens_cache_escritura: int = 0
    costo_estimado_usd: float = 0.0
    ultima_consulta: datetime | None = None


class StudentDetail(BaseModel):
    id: int
    nombre: str
    apellido: str
    tipo_identificacion: str
    numero_identificacion: str
    identificacion_completa: bool = False
    nivel: str
    created_at: datetime
    modulos_completados: int
    puntaje_total: int
    tiempo_total_seg: int
    ultima_actividad: datetime | None = None
    progreso: list[StudentModulo]
    actividades: list[StudentActividad]
    mentor: StudentMentor


# --- Actividades -----------------------------------------------------------------------------


class ActivityStat(BaseModel):
    activity_id: str
    modulo: int
    tipo: str
    estudiantes_intentaron: int
    estudiantes_completaron: int
    tasa_finalizacion: float | None = None
    intentos_promedio: float | None = None
    puntaje_promedio: float | None = Field(
        default=None,
        description="Promedio del mejor puntaje completado de cada estudiante que la completó.",
    )


class ModuloActivityStat(BaseModel):
    """Resumen por módulo: el par (estudiante, actividad) es la unidad de conteo."""

    modulo: int
    actividades: int = 0
    estudiantes_intentaron: int = 0
    tasa_finalizacion: float | None = None
    intentos_promedio: float | None = None
    puntaje_promedio: float | None = None


class ActivityStatsRead(BaseModel):
    actividades: list[ActivityStat]
    por_modulo: list[ModuloActivityStat]
    mas_dificiles: list[ActivityStat]


# --- Uso del mentor --------------------------------------------------------------------------


class PreciosMentor(BaseModel):
    moneda: str = "USD"
    entrada_usd_por_mtok: float
    salida_usd_por_mtok: float
    cache_lectura_factor: float
    cache_escritura_factor: float
    nota: str


class MentorTotales(BaseModel):
    consultas: int = 0
    usuarios: int = 0
    tokens_entrada: int = 0
    tokens_salida: int = 0
    tokens_cache_lectura: int = 0
    tokens_cache_escritura: int = 0
    costo_estimado_usd: float = 0.0


class MentorDia(BaseModel):
    fecha: str
    consultas: int = 0
    tokens_entrada: int = 0
    tokens_salida: int = 0
    costo_estimado_usd: float = 0.0


class MentorDiaModelo(BaseModel):
    fecha: str
    modelo: str
    consultas: int
    tokens_entrada: int
    tokens_salida: int
    costo_estimado_usd: float


class MentorModelo(BaseModel):
    modelo: str
    consultas: int
    tokens_entrada: int
    tokens_salida: int
    tokens_cache_lectura: int
    tokens_cache_escritura: int
    costo_estimado_usd: float


class MentorTopUsuario(BaseModel):
    user_id: int
    nombre: str
    apellido: str
    consultas: int
    tokens_entrada: int
    tokens_salida: int
    costo_estimado_usd: float


class MentorUsageRead(BaseModel):
    desde: datetime
    hasta: datetime
    dias: int
    precios: PreciosMentor
    totales: MentorTotales
    por_dia: list[MentorDia]
    por_dia_modelo: list[MentorDiaModelo]
    por_modelo: list[MentorModelo]
    top_usuarios: list[MentorTopUsuario]
