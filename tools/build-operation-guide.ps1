param(
    [string]$Output = "assets\promo\operation-guide\kiseki-operation-guide-v1.mp4"
)

$ErrorActionPreference = "Stop"
$ffmpeg = "C:\Users\HOME\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"

if (-not (Test-Path -LiteralPath $ffmpeg)) {
    throw "FFmpeg was not found: $ffmpeg"
}

$inputs = @(
    @{ Path = "assets\promo\operation-guide\handoff-filming.png"; Duration = 5 },
    @{ Path = "assets\promo\operation-guide\screenshots\01-dashboard.png"; Duration = 6 },
    @{ Path = "assets\promo\operation-guide\screenshots\02-mode-choice.png"; Duration = 7 },
    @{ Path = "assets\promo\operation-guide\screenshots\03-event-setup.png"; Duration = 9 },
    @{ Path = "assets\promo\operation-guide\screenshots\05-event-qr.png"; Duration = 6 },
    @{ Path = "assets\promo\operation-guide\handoff-filming.png"; Duration = 8 },
    @{ Path = "assets\promo\operation-guide\screenshots\06-handoff-record.png"; Duration = 8 },
    @{ Path = "assets\promo\operation-guide\screenshots\07-handoff-status.png"; Duration = 8 },
    @{ Path = "assets\promo\operation-guide\screenshots\08-consumer-play.png"; Duration = 6 },
    @{ Path = "assets\promo\operation-guide\screenshots\09-consumer-playing.png"; Duration = 8 },
    @{ Path = "assets\promo\restaurant-qr-lunch.png"; Duration = 7 },
    @{ Path = "assets\promo\operation-guide\handoff-filming.png"; Duration = 5 }
)

$args = @("-y")
foreach ($input in $inputs) {
    $args += @("-loop", "1", "-t", [string]$input.Duration, "-i", $input.Path)
}
$args += @("-i", "assets\promo\operation-guide\operation-guide-bgm.wav")

$filters = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $inputs.Count; $i++) {
    $duration = [double]$inputs[$i].Duration
    $fadeOut = $duration - 0.25
    $filters.Add("[$i`:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=$fadeOut`:d=0.25,setpts=PTS-STARTPTS[v$i]")
}

$concatInputs = (0..($inputs.Count - 1) | ForEach-Object { "[v$_]" }) -join ""
$filters.Add("$concatInputs`concat=n=$($inputs.Count):v=1:a=0[base]")
$subtitlePath = (Resolve-Path "assets\promo\operation-guide\operation-guide.ass").Path.Replace("\", "/").Replace(":", "\:")
$filters.Add("[base]subtitles='$subtitlePath'[video]")
$filters.Add("[$($inputs.Count)`:a]volume=1.15,atrim=duration=83[audio]")

$args += @(
    "-filter_complex", ($filters -join ";"),
    "-map", "[video]",
    "-map", "[audio]",
    "-c:v", "libx264",
    "-preset", "faster",
    "-crf", "20",
    "-profile:v", "high",
    "-level", "4.1",
    "-c:a", "aac",
    "-b:a", "160k",
    "-movflags", "+faststart",
    "-t", "83",
    $Output
)

& $ffmpeg @args
if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg exited with code $LASTEXITCODE"
}

Write-Output (Resolve-Path $Output).Path
