#!/usr/bin/env bash
set -euo pipefail

environment_file="${DINDIN_ENV_FILE:-/etc/dindin.env}"
backup_directory="${DINDIN_BACKUP_DIR:-/var/backups/dindin}"

if [[ ! -r "$environment_file" ]]; then
  echo "Arquivo de ambiente nao encontrado: $environment_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$environment_file"
set +a

if [[ -z "${DB_FILE:-}" || ! -f "$DB_FILE" ]]; then
  echo "Banco SQLite nao encontrado em DB_FILE." >&2
  exit 1
fi

install -d -o root -g root -m 0700 "$backup_directory"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_directory/gastos-$timestamp.sqlite"

sqlite3 "$DB_FILE" ".timeout 10000" ".backup '$destination'"
integrity="$(sqlite3 "$destination" "PRAGMA integrity_check;")"
if [[ "$integrity" != "ok" ]]; then
  rm -f -- "$destination"
  echo "Falha na verificacao do backup: $integrity" >&2
  exit 1
fi

chmod 0600 "$destination"
sha256sum "$destination" > "$destination.sha256"
chmod 0600 "$destination.sha256"
echo "Backup verificado: $destination"
