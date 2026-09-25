-- Se ejecuta UNA sola vez, cuando el volumen de PostgreSQL se inicializa por primera vez
-- (mecanismo /docker-entrypoint-initdb.d de la imagen), contra la base POSTGRES_DB y con el
-- superusuario POSTGRES_USER. Si el volumen ya existe no vuelve a correr: en ese caso, ejecutar
-- este mismo comando a mano con `docker compose exec db psql -U <usuario> -d <base>`.
--
-- pgvector lo trae la imagen pgvector/pgvector (el Postgres de Laragon no lo tiene).
CREATE EXTENSION IF NOT EXISTS vector;
