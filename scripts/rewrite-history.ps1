param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("BACKUP_VPS_CONFIRMADO")]
  [string]$Confirmation
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repositoryRoot

if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
  throw "Instale git-filter-repo antes de continuar: pipx install git-filter-repo"
}

if (git status --porcelain) {
  throw "O repositorio precisa estar limpo e com todas as mudancas commitadas."
}

$remoteUrl = git remote get-url origin
Write-Host "Reescrevendo o historico local. Clones existentes precisarao ser substituidos."
git filter-repo --force --path-glob "data/*.sqlite*" --path "frontend/node_modules" --invert-paths

if (-not (git remote get-url origin 2>$null)) {
  git remote add origin $remoteUrl
}

Write-Host "Historico local limpo. Revise com: git log --all -- data/gastos.sqlite frontend/node_modules"
Write-Host "Atualize as referencias remotas com: git fetch origin --prune"
Write-Host "Somente depois da revisao, publique conscientemente com: git push --force-with-lease origin --all"
Write-Host "Publique tambem as tags, se aplicavel: git push --force-with-lease origin --tags"
