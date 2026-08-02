Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconsDir = Join-Path $root "icons"
$sourcePath = "C:\Users\rodri\Pictures\Screenshots\Captura de pantalla 2026-08-02 164815.png"
Copy-Item $sourcePath (Join-Path $iconsDir "logo-source.png") -Force

$src = [System.Drawing.Bitmap]::FromFile($sourcePath)

# --- find the tight bounding box of the actual artwork (trim near-white margins) ---
$minX = $src.Width; $maxX = 0; $minY = $src.Height; $maxY = 0
$threshold = 250 # a pixel counts as "background" only if R,G,B are all >= this
for ($y = 0; $y -lt $src.Height; $y += 2) {
  for ($x = 0; $x -lt $src.Width; $x += 2) {
    $p = $src.GetPixel($x, $y)
    if ($p.A -gt 10 -and -not ($p.R -ge $threshold -and $p.G -ge $threshold -and $p.B -ge $threshold)) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$cropW = $maxX - $minX
$cropH = $maxY - $minY
Write-Output "Bounding box: x=$minX y=$minY w=$cropW h=$cropH (source $($src.Width)x$($src.Height))"

$cropRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
$trimmed = New-Object System.Drawing.Bitmap($cropW, $cropH)
$gt = [System.Drawing.Graphics]::FromImage($trimmed)
$gt.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$gt.Dispose()
$src.Dispose()

function New-PaddedIcon {
  param([int]$Size, [string]$OutPath, [double]$MarginRatio = 0.14)

  $canvas = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::White)

  $margin = $Size * $MarginRatio
  $availW = $Size - 2 * $margin
  $availH = $Size - 2 * $margin
  $scale = [Math]::Min($availW / $trimmed.Width, $availH / $trimmed.Height)
  $drawW = $trimmed.Width * $scale
  $drawH = $trimmed.Height * $scale
  $offX = ($Size - $drawW) / 2
  $offY = ($Size - $drawH) / 2

  $g.DrawImage($trimmed, $offX, $offY, $drawW, $drawH)
  $canvas.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $canvas.Dispose()
}

New-PaddedIcon -Size 512 -OutPath (Join-Path $iconsDir "icon-512.png")
New-PaddedIcon -Size 192 -OutPath (Join-Path $iconsDir "icon-192.png")
New-PaddedIcon -Size 180 -OutPath (Join-Path $iconsDir "apple-touch-icon.png") -MarginRatio 0.16
New-PaddedIcon -Size 32 -OutPath (Join-Path $iconsDir "favicon-32.png") -MarginRatio 0.08

$trimmed.Dispose()
Write-Output "Icons regenerated from logo in $iconsDir"
