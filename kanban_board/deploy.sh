#!/bin/bash

echo "Building Docker image..."
docker-compose build

echo "Starting container..."
docker-compose up -d

echo "Deployment complete!"
echo "Access your kanban board at http://localhost:3000"
