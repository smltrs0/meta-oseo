from datetime import datetime

from pydantic import BaseModel


class AchievementRead(BaseModel):
    codigo: str
    nombre: str
    descripcion: str
    obtenido: bool
    obtenido_en: datetime | None = None


class AchievementList(BaseModel):
    logros: list[AchievementRead]
