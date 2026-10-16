@echo off
rem ============================================================
rem  Abre WebAppMant con un servidor local (http://localhost:5610)
rem  porque el navegador bloquea la lectura de los datasets si se
rem  abre index.html directamente. Para apagarlo, cierra la ventana
rem  "Servidor WebAppMant".
rem ============================================================
title Abrir WebAppMant
cd /d "%~dp0"

powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 5610); $c.Close(); exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto abrir

where python >nul 2>&1
if %errorlevel%==0 (
  start "Servidor WebAppMant - no cerrar mientras la usas" /min python -m http.server 5610 --bind 127.0.0.1
) else (
  start "Servidor WebAppMant - no cerrar mientras la usas" /min py -3 -m http.server 5610 --bind 127.0.0.1
)
timeout /t 2 /nobreak >nul

:abrir
start "" "http://localhost:5610/"
exit /b
