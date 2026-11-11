# Renders vAMSYS rank icons, version 2 (round 12): 170x72 (2x the 85x36 slot), shoulder boards with stripes.
# Same design as render-rank-icons.mjs plus a slate outline, so the ink board stays visible on the ink top bar,
# and two extra ranks: Cadet (one stripe) and Staff Team (orange band with STAFF and a star).
#   powershell -File render-rank-icons-v2.ps1      -> png\ranks\v2\*.png   (needs only System.Drawing)
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot 'png\ranks\v2'
New-Item -ItemType Directory -Force $out | Out-Null
function C([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
$ink = C '#1b2328'; $slate = C '#55646c'; $signal = C '#e8703a'; $onInk = C '#f2f5f6'; $edge = C '#8a989f'

function RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure(); $p
}
function Diamond($g, [single]$cx, [single]$cy) {
    $s = 12.7
    $pts = [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF($cx, ($cy - $s))), (New-Object System.Drawing.PointF(($cx + $s), $cy)), (New-Object System.Drawing.PointF($cx, ($cy + $s))), (New-Object System.Drawing.PointF(($cx - $s), $cy)))
    $b = New-Object System.Drawing.SolidBrush $onInk; $g.FillPolygon($b, $pts); $b.Dispose()
}
function Star($g, [single]$cx, [single]$cy, [single]$r) {
    $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
    for ($i = 0; $i -lt 10; $i++) {
        $rad = if ($i % 2 -eq 0) { $r } else { $r * 0.42 }
        $a = [Math]::PI * ($i * 36 - 90) / 180
        $pts.Add((New-Object System.Drawing.PointF(($cx + $rad * [Math]::Cos($a)), ($cy + $rad * [Math]::Sin($a)))))
    }
    $b = New-Object System.Drawing.SolidBrush $onInk; $g.FillPolygon($b, $pts.ToArray()); $b.Dispose()
}
function Board([string]$file, [int]$stripes, [int]$diamonds, [switch]$staff) {
    $bmp = New-Object System.Drawing.Bitmap 170, 72, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.Clear([System.Drawing.Color]::Transparent)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc(4, 4, 12, 12, 180, 90); $p.AddLine(10, 4, 150, 4); $p.AddLine(150, 4, 166, 36); $p.AddLine(166, 36, 150, 68)
    $p.AddLine(150, 68, 10, 68); $p.AddArc(4, 56, 12, 12, 90, 90); $p.CloseFigure()
    $b = New-Object System.Drawing.SolidBrush $ink; $g.FillPath($b, $p); $b.Dispose()
    $pen = New-Object System.Drawing.Pen $edge, 2; $pen.LineJoin = 'Round'; $g.DrawPath($pen, $p); $pen.Dispose()
    $b = New-Object System.Drawing.SolidBrush $slate; $g.FillEllipse($b, 13, 31, 10, 10); $b.Dispose()
    $o = New-Object System.Drawing.SolidBrush $signal
    if ($staff) {
        $rr = RoundRect 34 14 78 44 3; $g.FillPath($o, $rr)
        $f = New-Object System.Drawing.Font 'Bahnschrift Condensed', 25, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
        $tb = New-Object System.Drawing.SolidBrush $ink
        $g.DrawString('STAFF', $f, $tb, (New-Object System.Drawing.RectangleF 34, 15, 78, 44), $sf); $tb.Dispose(); $f.Dispose()
        Star $g 133 36 15
    } else {
        for ($i = 0; $i -lt $stripes; $i++) { $rr = RoundRect (34 + $i * 18) 12 10 48 2; $g.FillPath($o, $rr) }
        if ($diamonds -eq 1) { Diamond $g 133 36 }
        if ($diamonds -eq 2) { Diamond $g 123 36; Diamond $g 147 36 }
    }
    $o.Dispose(); $g.Dispose()
    $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    "wrote $file"
}
Board 'rank-0-cadet.png' 1 0
Board 'rank-1-first-officer.png' 2 0
Board 'rank-2-captain.png' 3 0
Board 'rank-3-senior-captain.png' 4 0
Board 'rank-4-charter-captain.png' 4 1
Board 'rank-5-chief-pilot.png' 4 2
Board 'rank-staff-team.png' 0 0 -staff
