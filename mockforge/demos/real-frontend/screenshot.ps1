$tempFile = "$env:TEMP\real_frontend_enterprise_tasks.png"
$targetDir = "C:\Users\vamsi krishna\.gemini\antigravity-ide\brain\17f82c13-fa5c-417f-a0a2-dcf3f9e92b97"
$targetFile = "$targetDir\real_frontend_enterprise_tasks.png"

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$args = @(
    "--headless=new",
    "--screenshot=$tempFile",
    "--window-size=1536,960",
    "--virtual-time-budget=4000",
    "http://127.0.0.1:5173/"
)

& $chrome $args
Start-Sleep -Seconds 2

if (Test-Path $tempFile) {
    Copy-Item $tempFile $targetFile -Force
    $size = (Get-Item $targetFile).Length
    Write-Host "SUCCESS: Screenshot saved to $targetFile ($size bytes)"
} else {
    Write-Host "FAILED: tempFile not found"
}
