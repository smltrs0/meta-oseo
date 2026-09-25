"""Certificado con instantánea de identidad y un solo certificado por usuario (F5-05).

- Agrega a `certificates` nombre, apellido, tipo y número de identificación (copia de los datos del
  usuario al emitir), `puntaje_obligatorias` y `puntaje_maximo` (nulos sin manifiesto).
- Vuelve único el índice `ix_certificates_user_id`: un certificado por usuario. Es la base de la
  emisión idempotente y segura ante peticiones simultáneas.

La tabla estaba vacía en Fase 1. Si tuviera filas, las nuevas columnas de texto quedan en cadena
vacía (el valor por defecto solo existe durante la migración). Usa tipos de SQLAlchemy puros para
seguir siendo reproducible aunque los modelos cambien.

Revision ID: a3c81e5d7b02
Revises: 044fa6bcf84f
Create Date: 2026-09-24 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c81e5d7b02"
down_revision: str | Sequence[str] | None = "044fa6bcf84f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TEXT_COLUMNS = (
    ("nombre", 80),
    ("apellido", 80),
    ("tipo_identificacion", 8),
    ("numero_identificacion", 20),
)


def upgrade() -> None:
    with op.batch_alter_table("certificates") as batch_op:
        for name, length in _TEXT_COLUMNS:
            batch_op.add_column(
                sa.Column(name, sa.String(length=length), nullable=False, server_default="")
            )
        batch_op.add_column(sa.Column("puntaje_obligatorias", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("puntaje_maximo", sa.Integer(), nullable=True))
    # El valor por defecto solo servía para las filas previas: el modelo no lo declara.
    with op.batch_alter_table("certificates") as batch_op:
        for name, length in _TEXT_COLUMNS:
            batch_op.alter_column(
                name,
                existing_type=sa.String(length=length),
                existing_nullable=False,
                server_default=None,
            )
    op.drop_index(op.f("ix_certificates_user_id"), table_name="certificates")
    op.create_index(op.f("ix_certificates_user_id"), "certificates", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_certificates_user_id"), table_name="certificates")
    op.create_index(op.f("ix_certificates_user_id"), "certificates", ["user_id"], unique=False)
    with op.batch_alter_table("certificates") as batch_op:
        batch_op.drop_column("puntaje_maximo")
        batch_op.drop_column("puntaje_obligatorias")
        for name, _ in reversed(_TEXT_COLUMNS):
            batch_op.drop_column(name)
