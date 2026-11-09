@echo off
chcp 65001 >nul
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo 未找到 npm，请先安装 Node.js：https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 首次启动，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败。
    pause
    exit /b 1
  )
)

echo.
echo 正在启动项目：http://127.0.0.1:3000
echo 关闭本窗口即可停止服务。
echo.
call npm run dev
if errorlevel 1 pause
