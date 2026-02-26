# update-apex.ps1
$repo = "beatle72298/apex-chat"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"

Write-Host "Checking for latest release..." -ForegroundColor Cyan
$release = Invoke-RestMethod -Uri $apiUrl

$asset = $release.assets | Where-Object { $_.name -like "ApexChat-Win-Setup-*.exe" } | Select-Object -First 1

if ($asset) {
    $downloadUrl = $asset.browser_download_url
    $fileName = $asset.name
    Write-Host "Found latest build: $fileName. Downloading..." -ForegroundColor Green
    Invoke-WebRequest -Uri $downloadUrl -OutFile "$PSScriptRoot\$fileName"
    Write-Host "Download complete. Running installer..." -ForegroundColor Green
    Start-Process -FilePath "$PSScriptRoot\$fileName"
} else {
    Write-Host "No Windows installer found in the latest release." -ForegroundColor Red
}
