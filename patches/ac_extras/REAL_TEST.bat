@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title AutoCinematic REAL TEST (ComfyUI)
echo ==============================================
echo   AutoCinematic REAL TEST - open ComfyUI first
echo ==============================================
set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY if exist "venv\Scripts\python.exe" set "PY=venv\Scripts\python.exe"
if not defined PY if exist "env\Scripts\python.exe" set "PY=env\Scripts\python.exe"
if not defined PY (
  where py >nul 2>nul
  if not errorlevel 1 set "PY=py -3"
)
if not defined PY set "PY=python"
%PY% real_test.py %*
echo.
echo Report: %~dp0real_test_report.txt
pause
