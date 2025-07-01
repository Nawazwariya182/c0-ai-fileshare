#!/bin/bash

echo "🚀 Starting P2P File Sharing Production Environment"
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

# Kill any existing processes on ports 3000 and 8080
echo "🔧 Cleaning up existing processes..."
npx kill-port 3000 2>/dev/null || true
npx kill-port 8080 2>/dev/null || true

# Wait a moment for ports to be freed
sleep 2

echo "🔧 Starting signaling server on port 8080..."
echo "🌐 Starting Next.js app on port 3000..."
echo ""
echo "📋 Production URLs:"
echo "1. Next.js App: http://localhost:3000"
echo "2. WebSocket Server: ws://localhost:8080"
echo ""
echo "🛑 Press Ctrl+C to stop both servers"
echo ""

# Start both servers in production mode
npm run start:production
