#!/usr/bin/env bash
# Creates the local database and the runtime role that cannot bypass RLS.
set -euo pipefail
APP_PASSWORD="${APP_PASSWORD:-mighty-app-local}"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mighty_app') THEN
    CREATE ROLE mighty_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE mighty_app WITH LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE mighty_movers OWNER postgres'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mighty_movers')\gexec
GRANT CONNECT ON DATABASE mighty_movers TO mighty_app;
SQL
sudo -u postgres psql -d mighty_movers -v ON_ERROR_STOP=1 -c "GRANT USAGE ON SCHEMA public TO mighty_app;"
echo "Database mighty_movers is ready. App role: mighty_app"
