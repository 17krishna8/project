param(
    [string]$TargetUrl = "http://127.0.0.1:5173/",
    [string]$OutputFile = "real_frontend_dashboard.png"
)

$profileDir = "$env:TEMP\chrome-profile"
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}
$outFile = "$profileDir\temp_snap.png"
$artifactDest = "C:\Users\vamsi krishna\.gemini\antigravity-ide\brain\17f82c13-fa5c-417f-a0a2-dcf3f9e92b97\$OutputFile"

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$procArgs = @(
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--user-data-dir=$profileDir",
    "--screenshot=$outFile",
    "--window-size=1536,2000",
    "--virtual-time-budget=3000",
    $TargetUrl
)

Write-Host "Running Chrome for $TargetUrl..."
Start-Process $chrome -ArgumentList $procArgs -Wait -NoNewWindow
Start-Sleep -Seconds 2

if (Test-Path $outFile) {
    Copy-Item $outFile $artifactDest -Force
    $size = (Get-Item $artifactDest).Length
    Write-Host "SUCCESS: Captured $artifactDest ($size bytes)"
} else {
    Write-Host "FAILED: $outFile was not created"
}
