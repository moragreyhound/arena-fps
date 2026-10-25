# Builds the server-less "hosting" bundle and zips it for drag-and-drop hosts
# (Vercel, Netlify Drop, Cloudflare Pages, GitHub Pages...).
#
# Usage:  powershell -ExecutionPolicy Bypass -File mk-hosting.ps1
# Output: dist-static/  (unzipped site, upload the folder or zip it yourself)
#         arena-fps-hosting.zip  (ready to drag & drop / upload)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "Building static (server-less) bundle..."
npm run build:hosting
if ($LASTEXITCODE -ne 0) { Write-Error 'Vite build failed'; exit 1 }

$dist = Join-Path $root 'dist-static'
if (-not (Test-Path $dist)) { Write-Error "Expected build output at $dist"; exit 1 }

Write-Host "Creating deployment zip..."
Set-Content -Path (Join-Path $dist 'DEPLOY.txt') -Value "Arena FPS - static build (solo practice only; LAN needs the node server).`r`n`r`nHow to deploy:`r`n - Netlify Drop: drag THIS UNZIPPED FOLDER onto https://app.netlify.com/drop`r`n - Cloudflare Pages: Create project -> Direct Upload -> drag the folder`r`n - GitHub Pages: push the files inside this folder to a gh-pages branch`r`n - Netlify/Vercel via CLI: npx vercel <this-folder>`r`n`r`nEverything works with relative paths, so it can live in any sub-path." -Encoding utf8
$zip = Join-Path $root 'arena-fps-hosting.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -Force

Write-Host ""
Write-Host "Done!"
Write-Host "  Folder:  $dist"
Write-Host "  Zip:     $zip"
Write-Host ""
Write-Host "Deploy options:"
Write-Host "  - Netlify Drop:   drag the folder onto https://app.netlify.com/drop"
Write-Host "  - Vercel:         npx vercel $dist  (or import the git repo)"
Write-Host "  - Cloudflare:     Direct Upload -> drag the folder"
Write-Host "  - GitHub Pages:   publish the dist-static/ contents"
Write-Host "Note: this build is solo-practice only (no LAN multiplayer)."