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

  $ink = [System.Drawing.ColorTranslator]::FromHtml("#1b2741")
  $gold = [System.Drawing.ColorTranslator]::FromHtml("#f8be2e")
  $amber = [System.Drawing.ColorTranslator]::FromHtml("#f59a23")
  $paper = [System.Drawing.ColorTranslator]::FromHtml("#fff8dd")

  $bgMargin = $Size * 0.07
  $bgSize = $Size - $bgMargin * 2
  $bgRadius = $Size * 0.22
  $bgPath = New-RoundedRectanglePath $bgMargin $bgMargin $bgSize $bgSize $bgRadius
  $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new($bgMargin, $bgMargin, $bgSize, $bgSize),
    $gold,
    $amber,
    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
  )
  $graphics.FillPath($bgBrush, $bgPath)

  $shinePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(90, 255, 255, 255), [Math]::Max(1.0, $Size * 0.035))
  $shinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $shinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawBezier($shinePen, $Size * 0.22, $Size * 0.18, $Size * 0.38, $Size * 0.09, $Size * 0.70, $Size * 0.11, $Size * 0.83, $Size * 0.25)

  $linePen = [System.Drawing.Pen]::new($ink, [Math]::Max(1.3, $Size * 0.06))
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLine($linePen, $Size * 0.28, $Size * 0.31, $Size * 0.28, $Size * 0.72)
  foreach ($y in @(0.40, 0.53, 0.66)) {
    $graphics.DrawLine($linePen, $Size * 0.28, $Size * $y, $Size * 0.40, $Size * $y)
  }

  $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38, 88, 52, 0))
  $cardBrush = [System.Drawing.SolidBrush]::new($paper)
  $cardBorderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(65, 27, 39, 65), [Math]::Max(1.0, $Size * 0.012))
  $cardSpecs = @(
    @{ X = 0.40; Y = 0.25; W = 0.38; H = 0.19 },
    @{ X = 0.40; Y = 0.43; W = 0.45; H = 0.21 },
    @{ X = 0.40; Y = 0.63; W = 0.36; H = 0.19 }
  )
  foreach ($spec in $cardSpecs) {
    $x = $Size * $spec.X
    $y = $Size * $spec.Y
    $w = $Size * $spec.W
    $h = $Size * $spec.H
    $r = $Size * 0.08
    $shadow = New-RoundedRectanglePath ($x + $Size * 0.025) ($y + $Size * 0.035) $w $h $r
    $card = New-RoundedRectanglePath $x $y $w $h $r
    $graphics.FillPath($shadowBrush, $shadow)
    $graphics.FillPath($cardBrush, $card)
    $graphics.DrawPath($cardBorderPen, $card)
    $shadow.Dispose()
    $card.Dispose()
  }

  $nodeBrush = [System.Drawing.SolidBrush]::new($ink)
  $nodeSize = [Math]::Max(2.2, $Size * 0.115)
  foreach ($cy in @(0.40, 0.53, 0.66)) {
    $graphics.FillEllipse($nodeBrush, $Size * 0.28 - $nodeSize / 2, $Size * $cy - $nodeSize / 2, $nodeSize, $nodeSize)
  }

  $textPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(214, 27, 39, 65), [Math]::Max(1.0, $Size * 0.038))
  $textPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $textPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($textPen, $Size * 0.50, $Size * 0.345, $Size * 0.68, $Size * 0.345)
  $graphics.DrawLine($textPen, $Size * 0.50, $Size * 0.535, $Size * 0.75, $Size * 0.535)
  $graphics.DrawLine($textPen, $Size * 0.50, $Size * 0.725, $Size * 0.67, $Size * 0.725)

  foreach ($resource in @($bgPath, $bgBrush, $shinePen, $linePen, $shadowBrush, $cardBrush, $cardBorderPen, $nodeBrush, $textPen, $graphics)) {
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
