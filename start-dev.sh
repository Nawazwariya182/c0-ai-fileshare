#!/bin/bash

echo "🚀 Starting P2P File Sharing Development Environment"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🔧 Starting signaling server on port 8080..."
echo "🌐 Starting Next.js app on port 3000..."
echo ""
echo "📋 Instructions:"
echo "1. Wait for both servers to start"
echo "2. Open http://localhost:3000 in your browser"
echo "3. Sign in with Clerk"
echo "4. Create or join a session"
echo ""
echo "🛑 Press Ctrl+C to stop both servers"
echo ""

# Start both servers
npm run dev
