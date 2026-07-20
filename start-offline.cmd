@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "dist\index.html" (
  echo 未找到构建结果，正在生成离线版本...
  call npm run build
  if errorlevel 1 (
    echo 构建失败，请确认已安装 Node.js 并先执行 npm install。
    pause
    exit /b 1
  )
)

echo 浏览器地址：http://127.0.0.1:4173/
start "" "http://127.0.0.1:4173/"
node scripts\serve-offline.mjs
pause
