#!/bin/bash

echo "Starting backend server..."
cd /home/rj/dev/refund-resolver/packages/backend
npm run dev &
BACKEND_PID=$!

sleep 5

echo "Testing backend health endpoint..."
curl -s http://localhost:5000/api/health | python3 -m json.tool

echo "Testing products endpoint..."
curl -s http://localhost:5000/api/products | python3 -m json.tool | head -20

echo "Starting frontend server..."
cd /home/rj/dev/refund-resolver/packages/frontend
npm run dev &
FRONTEND_PID=$!

sleep 5

echo "Testing frontend..."
curl -s http://localhost:3040 > /tmp/frontend-test.html
if grep -q "Product Catalog" /tmp/frontend-test.html; then
    echo "✓ Frontend is rendering correctly"
else
    echo "✗ Frontend may have issues"
fi

echo "Stopping servers..."
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null

echo "Test complete!"