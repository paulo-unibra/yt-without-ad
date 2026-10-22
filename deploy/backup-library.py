#!/usr/bin/env python3
import datetime
from pathlib import Path
import sqlite3

directory = Path('/var/lib/yt-without-ad/backups')
directory.mkdir(mode=0o700, parents=True, exist_ok=True)
target = directory / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d') + '.sqlite')
with sqlite3.connect('file:/var/lib/yt-without-ad/library.sqlite?mode=ro', uri=True) as source:
    with sqlite3.connect(target) as destination:
        source.backup(destination)
        if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup inválido')
for old in sorted(directory.glob('*.sqlite'))[:-7]:
    old.unlink()
print('Backup do banco concluído e verificado.')
