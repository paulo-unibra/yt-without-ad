#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Execute como root.'; exit 1; }
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
getent passwd yt-api >/dev/null || useradd --system --home-dir /var/lib/yt-without-ad --shell /usr/sbin/nologin yt-api
getent passwd yt-deploy >/dev/null || useradd --system --create-home --home-dir /var/lib/yt-deploy --shell /bin/bash yt-deploy
install -d -m 755 -o yt-deploy -g yt-deploy /opt/yt-without-ad /opt/yt-without-ad/releases
install -d -m 700 -o yt-api -g yt-api /var/lib/yt-without-ad /var/lib/yt-without-ad/backups
install -d -m 750 /etc/yt-without-ad
if [[ ! -f /etc/yt-without-ad/backend.env ]]; then
  install -m 600 "$source_dir/backend/.env.example" /etc/yt-without-ad/backend.env
fi
install -m 755 "$source_dir/deploy/deploy.sh" /usr/local/bin/yt-without-ad-deploy
install -m 644 "$source_dir/deploy/yt-without-ad.service" /etc/systemd/system/yt-without-ad.service
install -m 644 "$source_dir/deploy/yt-without-ad-backup.service" /etc/systemd/system/yt-without-ad-backup.service
install -m 644 "$source_dir/deploy/yt-without-ad-backup.timer" /etc/systemd/system/yt-without-ad-backup.timer
printf '%s\n' 'yt-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart yt-without-ad.service' > /etc/sudoers.d/yt-without-ad
chmod 440 /etc/sudoers.d/yt-without-ad
visudo -cf /etc/sudoers.d/yt-without-ad
install -d -m 755 -o root -g root /var/lib/yt-deploy/.ssh
systemctl daemon-reload
systemctl enable yt-without-ad.service
systemctl enable --now yt-without-ad-backup.timer
echo 'Serviço isolado preparado. Instale a chave de deploy e publique uma versão.'
