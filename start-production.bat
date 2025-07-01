@echo off
echo 🚀 Starting P2P File Sharing Production Environment
echo ==================================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

REM Kill any existing processes on ports 3000 and 8080
echo 🔧 Cleaning up existing processes...
npx kill-port 3000 >nul 2>&1
npx kill-port 8080 >nul 2>&1

REM Wait a moment for ports to be freed
timeout /t 2 /nobreak >nul

echo 🔧 Starting signaling server on port 8080...
echo 🌐 Starting Next.js app on port 3000...
echo.
echo 📋 Production URLs:
echo 1. Next.js App: http://localhost:3000
echo 2. WebSocket Server: ws://localhost:8080
echo.
echo 🛑 Press Ctrl+C to stop both servers
echo.

REM Start both servers in production mode
npm run start:production
