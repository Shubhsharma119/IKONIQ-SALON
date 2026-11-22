$root = Split-Path -Parent $PSScriptRoot
$client = Join-Path $root 'client'
New-Item -ItemType Directory -Force -Path (Join-Path $client 'public') | Out-Null
$logo = Get-ChildItem (Join-Path $client 'public') -Filter 'ikoniq-logo.*' | Select-Object -First 1
if (-not $logo) {
  Write-Host 'Newest images in your Downloads:' -ForegroundColor Cyan
  $cands = Get-ChildItem "$HOME\Downloads\*" -Include *.jpg, *.jpeg, *.png, *.webp -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 6
  $cands | Select-Object Name, @{ n = 'KB'; e = { [math]::Round($_.Length / 1KB) } }, LastWriteTime | Format-Table -AutoSize
  $name = Read-Host 'Type the exact file name of the IKONIQ logo from the list above'
  $src = Join-Path "$HOME\Downloads" $name
  if ($name -and (Test-Path $src)) {
    $ext = [IO.Path]::GetExtension($src).ToLower()
    Copy-Item $src (Join-Path $client ('public\ikoniq-logo' + $ext)) -Force
  } else {
    Write-Host 'That file was not found, skipping the logo.' -ForegroundColor Yellow
  }
  $logo = Get-ChildItem (Join-Path $client 'public') -Filter 'ikoniq-logo.*' | Select-Object -First 1
}
if ($logo) {
  Set-Content -Encoding ascii (Join-Path $client 'src\brand.ts') ("export const LOGO_SRC = '/" + $logo.Name + "';")
  Write-Host ('Logo ready: ' + $logo.Name) -ForegroundColor Green
} else {
  Set-Content -Encoding ascii (Join-Path $client 'src\brand.ts') "export const LOGO_SRC = '';"
  Write-Host 'No logo file yet. The page will show IKONIQ SALON as text. Run this step again after saving the logo.' -ForegroundColor Yellow
}
