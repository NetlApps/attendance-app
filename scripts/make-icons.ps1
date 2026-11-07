# Генерация PNG-иконок PWA из того же мотива, что и favicon.svg.
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [single]($r * 2)
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-AppIcon([int]$size, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [single]($size / 64.0)

  # Градиентный фон на весь квадрат — подходит и для обычной, и для maskable-иконки.
  $start = New-Object System.Drawing.PointF(0, 0)
  $finish = New-Object System.Drawing.PointF($size, $size)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $start,
    $finish,
    [System.Drawing.Color]::FromArgb(67, 56, 202),
    [System.Drawing.Color]::FromArgb(124, 58, 237)
  )
  $g.FillRectangle($bg, 0, 0, $size, $size)
  $bg.Dispose()

  # Мягкий блик в правом верхнем углу.
  $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glowPath.AddEllipse(
    [single]($size * 0.42),
    [single](-$size * 0.34),
    [single]($size * 0.95),
    [single]($size * 0.95)
  )
  $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
  $glow.CenterColor = [System.Drawing.Color]::FromArgb(34, 255, 255, 255)
  $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
  $g.FillPath($glow, $glowPath)
  $glow.Dispose()
  $glowPath.Dispose()

  $white = [System.Drawing.Color]::White

  # Рамка календаря.
  $pen = New-Object System.Drawing.Pen($white, [single](3.6 * $s))
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $calendar = New-RoundedPath ([single](14.5 * $s)) ([single](18 * $s)) ([single](35 * $s)) ([single](31 * $s)) ([single](6 * $s))
  $g.DrawPath($pen, $calendar)
  $calendar.Dispose()

  # Линия-шапка календаря.
  $linePen = New-Object System.Drawing.Pen($white, [single](3.2 * $s))
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine(
    $linePen,
    [single](14.5 * $s),
    [single](27.5 * $s),
    [single](49.5 * $s),
    [single](27.5 * $s)
  )
  $linePen.Dispose()

  # Петельки.
  $g.DrawLine($pen, [single](23 * $s), [single](14.5 * $s), [single](23 * $s), [single](21.5 * $s))
  $g.DrawLine($pen, [single](41 * $s), [single](14.5 * $s), [single](41 * $s), [single](21.5 * $s))
  $pen.Dispose()

  # Галочка.
  $checkPen = New-Object System.Drawing.Pen($white, [single](4 * $s))
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPoints = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF([single](24 * $s), [single](37.5 * $s))),
    (New-Object System.Drawing.PointF([single](29.4 * $s), [single](42.9 * $s))),
    (New-Object System.Drawing.PointF([single](41.5 * $s), [single](30 * $s)))
  )
  $g.DrawLines($checkPen, $checkPoints)
  $checkPen.Dispose()

  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-AppIcon 192 (Join-Path $outDir 'icon-192.png')
New-AppIcon 512 (Join-Path $outDir 'icon-512.png')
New-AppIcon 180 (Join-Path $outDir 'apple-touch-icon.png')

Get-ChildItem $outDir | Select-Object Name, Length | Format-Table -AutoSize
