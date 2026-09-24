"""Esquema inicial de la API (F1-04).

Tablas de Fase 1: users, progress_modulos, activity_results, achievements, user_achievements y
usage_events. Tablas creadas vacías para fases posteriores: certificates, chat_sessions y
chat_messages. Escrita a partir de `alembic revision --autogenerate` y revisada a mano: usa tipos
de SQLAlchemy puros (sin importar código de la app) para que siga siendo reproducible aunque los
modelos cambien.

Revision ID: 044fa6bcf84f
Revises:
Create Date: 2026-09-23 21:36:02.925165

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "044fa6bcf84f"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "achievements",
        sa.Column("codigo", sa.String(length=64), nullable=False),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=False),
        sa.Column("modulo", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("codigo", name=op.f("pk_achievements")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=80), nullable=False),
        sa.Column("apellido", sa.String(length=80), nullable=False),
        sa.Column("tipo_identificacion", sa.String(length=8), nullable=False),
        sa.Column("numero_identificacion", sa.String(length=20), nullable=False),
        sa.Column("nivel", sa.String(length=16), nullable=False),
        sa.Column("rol", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(
        "uq_users_identificacion",
        "users",
        ["tipo_identificacion", "numero_identificacion"],
        unique=True,
    )

    op.create_table(
        "activity_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.String(length=64), nullable=False),
        sa.Column("modulo", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=32), nullable=False),
        sa.Column("puntaje", sa.Integer(), nullable=False),
        sa.Column("intentos", sa.Integer(), nullable=False),
        sa.Column("completada", sa.Boolean(), nullable=False),
        sa.Column("detalle", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_activity_results_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_activity_results")),
    )
    op.create_index(
        "ix_activity_results_user_activity",
        "activity_results",
        ["user_id", "activity_id"],
        unique=False,
    )

    op.create_table(
        "certificates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("codigo", sa.String(length=32), nullable=False),
        sa.Column("puntaje_total", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_certificates_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_certificates")),
    )
    op.create_index(op.f("ix_certificates_codigo"), "certificates", ["codigo"], unique=True)
    op.create_index(op.f("ix_certificates_user_id"), "certificates", ["user_id"], unique=False)

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("modulo", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_chat_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_sessions")),
    )
    op.create_index(op.f("ix_chat_sessions_user_id"), "chat_sessions", ["user_id"], unique=False)

    op.create_table(
        "progress_modulos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("modulo", sa.Integer(), nullable=False),
        sa.Column("seccion_actual", sa.String(length=64), nullable=True),
        sa.Column("completado", sa.Boolean(), nullable=False),
        sa.Column("tiempo_total_seg", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_progress_modulos_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_progress_modulos")),
        sa.UniqueConstraint("user_id", "modulo", name="uq_progress_modulos_user_modulo"),
    )
    op.create_table(
        "usage_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_creation_tokens", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_usage_events_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usage_events")),
    )
    op.create_index(
        op.f("ix_usage_events_created_at"), "usage_events", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_usage_events_user_id"), "usage_events", ["user_id"], unique=False)

    op.create_table(
        "user_achievements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("codigo", sa.String(length=64), nullable=False),
        sa.Column("obtenido_en", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["codigo"],
            ["achievements.codigo"],
            name=op.f("fk_user_achievements_codigo_achievements"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_achievements_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_achievements")),
        sa.UniqueConstraint("user_id", "codigo", name="uq_user_achievements_user_codigo"),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["chat_sessions.id"],
            name=op.f("fk_chat_messages_session_id_chat_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_messages")),
    )
    op.create_index(
        op.f("ix_chat_messages_session_id"), "chat_messages", ["session_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_chat_messages_session_id"), table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("user_achievements")
    op.drop_index(op.f("ix_usage_events_user_id"), table_name="usage_events")
    op.drop_index(op.f("ix_usage_events_created_at"), table_name="usage_events")
    op.drop_table("usage_events")
    op.drop_table("progress_modulos")
    op.drop_index(op.f("ix_chat_sessions_user_id"), table_name="chat_sessions")
    op.drop_table("chat_sessions")
    op.drop_index(op.f("ix_certificates_user_id"), table_name="certificates")
    op.drop_index(op.f("ix_certificates_codigo"), table_name="certificates")
    op.drop_table("certificates")
    op.drop_index("ix_activity_results_user_activity", table_name="activity_results")
    op.drop_table("activity_results")
    op.drop_index("uq_users_identificacion", table_name="users")
    op.drop_table("users")
    op.drop_table("achievements")
