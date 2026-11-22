$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'server\.env'
$dest = Join-Path $HOME 'salonpro-backups'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw 'DATABASE_URL not found in server\.env' }
$url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim([char]34).Trim([char]39)
if ($url -match '^postgres(?:ql)?://([^:]+):([^@]*)@([^:/]+):?(\d*)/([^?]+)') {
  $dbuser = [uri]::UnescapeDataString($matches[1])
  $dbpass = [uri]::UnescapeDataString($matches[2])
  $dbhost = $matches[3]
  $dbport = if ($matches[4]) { $matches[4] } else { '5432' }
  $dbname = $matches[5]
} else {
  throw 'Could not read DATABASE_URL'
}
$pg = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pg) {
  $pg = Get-ChildItem 'C:\Program Files\PostgreSQL' -Recurse -Filter pg_dump.exe -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $pg) { throw 'pg_dump.exe not found. Install the PostgreSQL command line tools.' }
$env:PGPASSWORD = $dbpass
$file = Join-Path $dest ('salonpro_' + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.dump')
& $pg -h $dbhost -p $dbport -U $dbuser -F c -f $file $dbname
$code = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
if ($code -ne 0) { throw 'pg_dump failed' }
$restore = Join-Path (Split-Path $pg) 'pg_restore.exe'
if (Test-Path $restore) {
  $entries = (& $restore --list $file | Measure-Object).Count
  if ($entries -lt 10) { throw 'Backup file looks incomplete' }
  Write-Host ('Backup verified: ' + $entries + ' entries')
}
Get-ChildItem $dest -Filter 'salonpro_*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
$kb = [math]::Round((Get-Item $file).Length / 1KB)
Write-Host ('Backup saved: ' + $file + ' (' + $kb + ' KB)') -ForegroundColor Green
