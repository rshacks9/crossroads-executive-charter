# Tour / activity banners for vAMSYS (round 12): 1200x500 JPEG, one per tour, from the login background and the logo.
#   powershell -File render-tour-banners.ps1      -> png\tours\*.jpg   (needs only System.Drawing)
Add-Type -AssemblyName System.Drawing
$png = Join-Path $PSScriptRoot 'png'
$out = Join-Path $png 'tours'
New-Item -ItemType Directory -Force $out | Out-Null
function C([string]$hex, [int]$a = 255) { $c = [System.Drawing.ColorTranslator]::FromHtml($hex); [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B) }
$W = 1200; $H = 500
$bg = [System.Drawing.Image]::FromFile((Join-Path $png 'crossroads-login-background-1706x1600.jpg'))
$logo = [System.Drawing.Image]::FromFile((Join-Path $png 'crossroads-logo-dark-1800x400.png'))
function Font([single]$px, [switch]$regular) {
    $style = if ($regular) { [System.Drawing.FontStyle]::Regular } else { [System.Drawing.FontStyle]::Bold }
    New-Object System.Drawing.Font 'Bahnschrift Condensed', $px, $style, ([System.Drawing.GraphicsUnit]::Pixel)
}
function Banner([string]$file, [string]$title, [string]$kicker, [string]$sub, [string[]]$stops, [single]$focus) {
    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
    $s = [Math]::Max($W / $bg.Width, $H / $bg.Height); $dw = $bg.Width * $s; $dh = $bg.Height * $s
    $g.DrawImage($bg, [single](($W - $dw) / 2), [single](($H - $dh) * $focus), [single]$dw, [single]$dh)
    $shade = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 0, $W, $H), (C '#1b2328' 240), (C '#1b2328' 70), 0.0
    $g.FillRectangle($shade, 0, 0, $W, $H); $shade.Dispose()
    $lw = 330; $lh = [int]($logo.Height * $lw / $logo.Width); $g.DrawImage($logo, 54, 40, $lw, $lh)
    $white = New-Object System.Drawing.SolidBrush (C '#eef2f3'); $orange = New-Object System.Drawing.SolidBrush (C '#e8703a'); $ink = New-Object System.Drawing.SolidBrush (C '#1b2328')
    $f = Font 30; $g.DrawString($kicker, $f, $orange, 56, 150); $f.Dispose()
    $f = Font 92; $g.DrawString($title, $f, $white, 50, 180); $f.Dispose()
    $g.FillRectangle($orange, 58, 292, 110, 6)
    $f = Font 34 -regular; $g.DrawString($sub, $f, $white, 56, 312); $f.Dispose()
    # route strip: stops joined by the logo's route line
    $f = Font 30; $x = 58; $y = 392
    for ($i = 0; $i -lt $stops.Count; $i++) {
        $sz = $g.MeasureString($stops[$i], $f); $cw = [int]$sz.Width + 22
        $chip = New-Object System.Drawing.Rectangle $x, $y, $cw, 44
        $brush = if ($i -eq 0) { $orange } else { New-Object System.Drawing.SolidBrush (C '#eef2f3' 235) }
        $g.FillRectangle($brush, $chip); $g.DrawString($stops[$i], $f, $ink, ($x + 11), ($y + 5))
        $x += $cw
        if ($i -lt $stops.Count - 1) { $pen = New-Object System.Drawing.Pen (C '#e8703a'), 4; $g.DrawLine($pen, $x, ($y + 22), ($x + 26), ($y + 22)); $pen.Dispose(); $x += 26 }
    }
    $f.Dispose()
    $f = Font 18 -regular; $note = 'Fictional virtual airline for flight simulation'
    $nw = $g.MeasureString($note, $f).Width
    $g.DrawString($note, $f, (New-Object System.Drawing.SolidBrush (C '#c8d0d4')), [single]($W - 18 - $nw), [single]($H - 32)); $f.Dispose()
    $g.Dispose()
    $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
    $bmp.Save((Join-Path $out $file), $enc, $ep); $bmp.Dispose()
    "wrote $file"
}
Banner 'crossroads-tour-circuit-1200x500.jpg' 'CROSSROADS CIRCUIT' 'TOUR  |  300 POINTS  |  UNTIL 31 DEC 2027' 'Eight short legs from Indianapolis Executive, each under an hour' @('KTYQ', 'KSDF', 'KMDW', 'KCMH', 'KBNA') 0.45
Banner 'crossroads-tour-ski-season-1200x500.jpg' 'SKI SEASON TOUR 2026-27' 'TOUR  |  500 POINTS  |  UNTIL 15 APR 2027' 'KTYQ to the mountains and back in a light or mid-size jet' @('KTYQ', 'VAIL / EAGLE', 'ASPEN', 'JACKSON HOLE', 'SUN VALLEY') 0.30
Banner 'crossroads-tour-across-the-pond-1200x500.jpg' 'ACROSS THE POND' 'TRANSATLANTIC EXECUTIVE TOUR  |  750 POINTS  |  UNTIL 30 JUN 2027' 'KIND to Europe in the G650, G700 or a VIP A340 or A380' @('KIND', 'PARIS LE BOURGET', 'GENEVA', 'ZURICH') 0.38
$bg.Dispose(); $logo.Dispose()

