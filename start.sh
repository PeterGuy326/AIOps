#!/bin/bash

# AIOps 快速启动脚本

echo "🚀 AIOps 系统启动中..."

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo "📝 .env 文件不存在，从 .env.example 复制..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件，填入你的 API keys"
    echo "   特别是 OPENAI_API_KEY 和 ANTHROPIC_API_KEY"
    read -p "按回车键继续..."
fi

# 启动服务
echo "🐳 启动 Docker 容器..."
docker-compose up -d

echo ""
echo "✅ AIOps 系统启动成功！"
echo ""
echo "📊 访问地址："
echo "   - Frontend: http://localhost:5173"
echo "   - Backend API: http://localhost:3000"
echo ""
echo "📝 查看日志："
echo "   docker-compose logs -f"
echo ""
echo "🛑 停止服务："
echo "   docker-compose down"
echo ""
