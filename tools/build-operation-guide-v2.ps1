param(
    [string]$Output = "assets\promo\operation-guide\kiseki-operation-guide-v2.mp4"
)

$ErrorActionPreference = "Stop"
$ffmpeg = "C:\Users\HOME\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
if (-not (Test-Path -LiteralPath $ffmpeg)) { throw "FFmpeg was not found" }

$scenes = @(
    @{ Path="assets\promo\operation-guide\handoff-filming.png"; Duration=3; Filter="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" },
    @{ Path="assets\promo\operation-guide\screenshots\01-dashboard.png"; Duration=4; Filter="crop=1040:720:20:65,scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:color=0xF4ECDD" },
    @{ Path="assets\promo\operation-guide\screenshots\02-mode-choice.png"; Duration=5; Filter="crop=1040:720:20:55,scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:color=0xF4ECDD" },
    @{ Path="assets\promo\operation-guide\screenshots\03-event-setup.png"; Duration=6; Filter="crop=1040:1270:20:55,scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:color=0xF4ECDD" },
    @{ Path="assets\promo\operation-guide\screenshots\05-event-qr.png"; Duration=4; Filter="crop=1040:1200:20:300,scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:color=0xF4ECDD" },
    @{ Path="assets\promo\operation-guide\handoff-filming.png"; Duration=5; Filter="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" },
    @{ Path="assets\promo\operation-guide\screenshots\06-handoff-record.png"; Duration=7; Filter="crop=1040:1160:20:80,scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:color=0xF4ECDD" },
    @{ Path="assets\promo\operation-guide\screenshots\07-handoff-status.png"; Duration=5; Filter="crop=1040:1120:20:520,scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:color=0xF4ECDD" },
    @{ Path="assets\promo\operation-guide\screenshots\08-consumer-play.png"; Duration=4; Filter="scale=1080:1920" },
    @{ Path="assets\promo\operation-guide\screenshots\09-consumer-playing.png"; Duration=6; Filter="scale=1080:1920" },
    @{ Path="assets\promo\operation-guide\handoff-filming.png"; Duration=3; Filter="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" }
)

$arguments = @("-y", "-hide_banner", "-loglevel", "warning")
foreach ($scene in $scenes) {
    $arguments += @("-loop", "1", "-t", [string]$scene.Duration, "-i", $scene.Path)
}
$arguments += @("-i", "assets\promo\operation-guide\operation-guide-bgm.wav")

$filters = New-Object System.Collections.Generic.List[string]
for ($i=0; $i -lt $scenes.Count; $i++) {
    $duration = [double]$scenes[$i].Duration
    $outAt = $duration - 0.15
    $filters.Add("[$i`:v]$($scenes[$i].Filter),setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=0.15,fade=t=out:st=$outAt`:d=0.15,setpts=PTS-STARTPTS[v$i]")
}
$concat = (0..($scenes.Count-1) | ForEach-Object { "[v$_]" }) -join ""
$filters.Add("$concat`concat=n=$($scenes.Count):v=1:a=0[base]")
$ass = (Resolve-Path "assets\promo\operation-guide\operation-guide-v2.ass").Path.Replace("\", "/").Replace(":", "\:")
$filters.Add("[base]subtitles='$ass'[video]")
$filters.Add("[$($scenes.Count)`:a]volume=1.15,atrim=duration=52[audio]")

$arguments += @(
    "-filter_complex", ($filters -join ";"),
    "-map", "[video]", "-map", "[audio]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", "-t", "52", $Output
)

& $ffmpeg @arguments
if ($LASTEXITCODE -ne 0) { throw "FFmpeg exited with code $LASTEXITCODE" }
Write-Output (Resolve-Path $Output).Path
