#!/usr/bin/env bash
set -euo pipefail

# Executado pela chave SSH exclusiva do GitHub Actions, com comando forçado.
release_sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
[[ "$release_sha" =~ ^[a-f0-9]{40}$ ]] || { echo 'SHA inválido'; exit 1; }
project=/opt/yt-without-ad
exec 9>"$project/deploy.lock"
flock -w 120 9
release="$project/releases/$release_sha"
previous="$(readlink -f "$project/current" || true)"
if [[ ! -d "$release" ]]; then
  mkdir -p "$release"
  trap 'rm -rf "$release"' ERR
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "https://api.github.com/repos/paulo-unibra/yt-without-ad/tarball/$release_sha" \
    | tar --extract --gzip --strip-components=1 --directory="$release"
  (cd "$release/backend" && npm ci --omit=dev --no-audit --no-fund)
  trap - ERR
fi
printf 'RELEASE_SHA=%s\n' "$release_sha" > "$project/release.env"
ln -sfn "$release" "$project/current.next"
mv -Tf "$project/current.next" "$project/current"
sudo /usr/bin/systemctl restart yt-without-ad.service || echo 'Reinício falhou; verificando e restaurando a versão anterior.' >&2
healthy=false
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3011/ | grep -q "$release_sha"; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  if [[ -n "$previous" && "$previous" != "$release" ]]; then
    ln -sfn "$previous" "$project/current.next"
    mv -Tf "$project/current.next" "$project/current"
    printf 'RELEASE_SHA=%s\n' "$(basename "$previous")" > "$project/release.env"
    sudo /usr/bin/systemctl restart yt-without-ad.service
  fi
  echo 'Falha no healthcheck; versão anterior restaurada quando disponível.' >&2
  exit 1
fi
# Mantém a versão atual e as duas versões anteriores; banco e backups ficam fora.
python3 - "$project" "$previous" <<'PY'
from pathlib import Path
import shutil, sys
project, previous = Path(sys.argv[1]), Path(sys.argv[2])
releases = sorted((project / 'releases').iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
keep = {p.resolve() for p in releases[:3]} | {(project / 'current').resolve(), previous.resolve()}
for item in releases:
    if item.resolve() not in keep:
        shutil.rmtree(item)
PY
echo "Deploy concluído: $release_sha"
