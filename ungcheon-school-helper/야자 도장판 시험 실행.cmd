@echo off
setlocal
set "schoolYaja=%USERPROFILE%\Documents\GitHub\ungcheon-yaja-school"
if defined UNGCHEON_YAJA_SOURCE set "schoolYaja=%UNGCHEON_YAJA_SOURCE%"
if not exist "%schoolYaja%\scripts\desktop-demo.mjs" (
  echo Set UNGCHEON_YAJA_SOURCE to the ungcheon-yaja-school source directory.
  pause
  exit /b 1
)
node "%schoolYaja%\scripts\desktop-demo.mjs" "%~dp0."
if errorlevel 1 pause

