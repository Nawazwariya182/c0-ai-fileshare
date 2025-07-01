@echo off
echo 🚀 Starting P2P File Sharing Development Environment
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

echo 🔧 Starting signaling server on port 8080...
echo 🌐 Starting Next.js app on port 3000...
echo.
echo 📋 Instructions:
echo 1. Wait for both servers to start
echo 2. Open http://localhost:3000 in your browser
echo 3. Sign in with Clerk
echo 4. Create or join a session
echo.
echo 🛑 Press Ctrl+C to stop both servers
echo.

REM Start both servers
npm run dev
