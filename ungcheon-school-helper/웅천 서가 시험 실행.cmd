@echo off
chcp 65001 >nul
node "%USERPROFILE%\Documents\GitHub\ungcheon-seoga-school\scripts\school-preview.mjs" "%~dp0."
if errorlevel 1 pause
