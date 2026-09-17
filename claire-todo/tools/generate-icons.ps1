param(
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\icons")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon {
  param([int]$Size)

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $blue = [System.Drawing.ColorTranslator]::FromHtml("#2563eb")
  $teal = [System.Drawing.ColorTranslator]::FromHtml("#0f766e")
  $coral = [System.Drawing.ColorTranslator]::FromHtml("#e76f51")
  $white = [System.Drawing.Color]::White

  $margin = $Size * 0.11
  $cardSize = $Size - $margin * 2
  $radius = $Size * 0.20
  $stroke = [Math]::Max(1.2, $Size * 0.07)

  $shadowPath = New-RoundedRectanglePath ($margin + $Size * 0.018) ($margin + $Size * 0.028) $cardSize $cardSize $radius
  $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(22, 37, 99, 235))
  $graphics.FillPath($shadowBrush, $shadowPath)

  $cardPath = New-RoundedRectanglePath $margin $margin $cardSize $cardSize $radius
  $cardBrush = [System.Drawing.SolidBrush]::new($white)
  $borderPen = [System.Drawing.Pen]::new($blue, $stroke)
  $borderPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.FillPath($cardBrush, $cardPath)
  $graphics.DrawPath($borderPen, $cardPath)

  $checkPen = [System.Drawing.Pen]::new($blue, [Math]::Max(1.6, $Size * 0.105))
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($Size * 0.31, $Size * 0.53),
    [System.Drawing.PointF]::new($Size * 0.45, $Size * 0.66),
    [System.Drawing.PointF]::new($Size * 0.70, $Size * 0.38)
  )
  $graphics.DrawLines($checkPen, $points)

  $accentSize = [Math]::Max(2.0, $Size * 0.13)
  $tealBrush = [System.Drawing.SolidBrush]::new($teal)
  $coralBrush = [System.Drawing.SolidBrush]::new($coral)
  $graphics.FillEllipse($tealBrush, $Size * 0.69, $Size * 0.20, $accentSize, $accentSize)
  $graphics.FillEllipse($coralBrush, $Size * 0.19, $Size * 0.68, $accentSize, $accentSize)

  foreach ($resource in @($shadowPath, $shadowBrush, $cardPath, $cardBrush, $borderPen, $checkPen, $tealBrush, $coralBrush, $graphics)) {
    $resource.Dispose()
  }

  return $bitmap
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

foreach ($size in 16, 32, 48, 128) {
  $icon = New-Icon $size
  try {
    $icon.Save((Join-Path $OutputDir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $icon.Dispose()
  }
}
