#!/bin/bash

# AIOps 停止脚本

echo "🛑 停止 AIOps 系统..."

docker-compose down

echo "✅ AIOps 系统已停止"
