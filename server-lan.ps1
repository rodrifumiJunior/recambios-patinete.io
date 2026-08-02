# Servidor accesible desde otros dispositivos de tu misma red WiFi (por ejemplo,
# tu móvil), para poder abrir e instalar la app sin publicarla en internet.
# Usa sockets TCP en bruto (no HttpListener) para no requerir permisos de administrador.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5501

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".ico"  = "image/x-icon"
}

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown"
} | Select-Object -First 1 -ExpandProperty IPAddress)

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()
Write-Output "Sirviendo $root"
if ($lanIp) {
  Write-Output "Abre esto en tu movil (misma WiFi): http://${lanIp}:$port/"
} else {
  Write-Output "No se detecto una IP de red local. Ejecuta 'ipconfig' y usa la IPv4 de tu WiFi, puerto $port."
}
Write-Output "Pulsa Ctrl+C para parar el servidor."

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)

    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrEmpty($requestLine)) { $client.Close(); continue }
    $parts = $requestLine.Split(" ")
    $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

    while (-not [string]::IsNullOrEmpty($reader.ReadLine())) { }

    $path = $rawPath.Split("?")[0]
    if ($path -eq "/") { $path = "/index.html" }
    $decodedPath = [System.Uri]::UnescapeDataString($path)
    $filePath = Join-Path $root ($decodedPath.TrimStart("/"))

    if (Test-Path $filePath -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($filePath)
      $contentType = $mime[$ext]
      if (-not $contentType) { $contentType = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($bytes, 0, $bytes.Length)
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $decodedPath")
      $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
  } catch {
    # conexión cerrada por el cliente u otro error puntual: se ignora y se sigue sirviendo
  } finally {
    $client.Close()
  }
}
