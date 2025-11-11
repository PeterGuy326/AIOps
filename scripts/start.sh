#!/bin/bash

# AIOps 启动脚本
# 使用方法: ./scripts/start.sh [dev|prod|cli]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi

    if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装"
        exit 1
    fi

    log_success "依赖检查通过"
}

# 检查环境变量
check_env() {
    if [ ! -f ".env" ]; then
        if [ -f ".env.docker" ]; then
            cp .env.docker .env
            log_warning "已创建 .env 文件，请填入正确的配置值"
        else
            log_error ".env 和 .env.docker 都不存在"
            exit 1
        fi
    fi
}

# 创建目录
create_directories() {
    log_info "创建必要目录..."
    mkdir -p logs/{backend,nginx}
    mkdir -p cli_history
    mkdir -p database/backups
    log_success "目录创建完成"
}

# 设置权限
set_permissions() {
    log_info "设置权限..."
    chmod -R 755 logs/
    chmod -R 755 cli_history/
    chmod +x scripts/*.sh
    log_success "权限设置完成"
}

# 开发模式
start_dev() {
    log_info "启动开发环境..."

    export NODE_ENV=development
    docker compose -f docker-compose.yml --env-file .env up --build
}

# 生产模式
start_prod() {
    log_info "启动生产环境..."

    export NODE_ENV=production
    docker compose -f docker-compose.yml --env-file .env up --build -d

    log_info "等待服务启动..."
    sleep 30

    check_health
    show_info
}

# CLI模式
start_cli() {
    log_info "启动CLI模式..."

    # 先启动基础服务
    export NODE_ENV=development
    docker compose -f docker-compose.yml --env-file .env up -d postgres redis

    sleep 10

    # 运行CLI
    docker compose -f docker-compose.yml --env-file .env run --rm cli
}

# 健康检查
check_health() {
    log_info "检查服务状态..."

    # PostgreSQL
    if docker compose -f docker-compose.yml exec -T postgres pg_isready -U aiops_user -d aiops > /dev/null 2>&1; then
        log_success "✓ PostgreSQL 运行正常"
    else
        log_error "✗ PostgreSQL 启动失败"
    fi

    # Redis
    if docker compose -f docker-compose.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "✓ Redis 运行正常"
    else
        log_error "✗ Redis 启动失败"
    fi

    # Backend
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_success "✓ 后端API 运行正常"
    else
        log_warning "⚠ 后端API 可能还在启动中"
    fi

    # Frontend
    if curl -f http://localhost:5173 > /dev/null 2>&1; then
        log_success "✓ 前端应用 运行正常"
    else
        log_warning "⚠ 前端应用 可能还在启动中"
    fi
}

# 显示信息
show_info() {
    echo ""
    log_success "=== AIOps 服务已启动 ==="
    echo -e "${BLUE}服务地址:${NC}"
    echo -e "  前端应用: ${GREEN}http://localhost:5173${NC}"
    echo -e "  后端API:  ${GREEN}http://localhost:3000${NC}"
    echo -e "  API文档:  ${GREEN}http://localhost:3000/api${NC}"
    echo -e "  PostgreSQL: ${GREEN}localhost:5432${NC}"
    echo -e "  Redis:      ${GREEN}localhost:6379${NC}"
    echo ""
    echo -e "${BLUE}常用命令:${NC}"
    echo "  查看日志: docker compose -f docker-compose.yml logs -f [service]"
    echo "  停止服务: docker compose -f docker-compose.yml down"
    echo "  重启服务: docker compose -f docker-compose.yml restart [service]"
    echo "  进入容器: docker compose -f docker-compose.yml exec [service] sh"
    echo ""
}

# 停止服务
stop_services() {
    log_info "停止所有服务..."
    docker compose -f docker-compose.yml down
    log_success "服务已停止"
}

# 清理
cleanup() {
    log_info "清理资源..."
    docker compose -f docker-compose.yml down --volumes --remove-orphans
    docker system prune -f
    log_success "清理完成"
}

# 显示帮助
show_help() {
    echo "AIOps 统一启动脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [command]"
    echo ""
    echo "命令:"
    echo "  dev     - 启动开发环境"
    echo "  prod    - 启动生产环境 (后台运行)"
    echo "  cli     - 启动CLI工具"
    echo "  health  - 检查服务健康状态"
    echo "  stop    - 停止所有服务"
    echo "  cleanup - 清理资源"
    echo "  help    - 显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 dev      # 开发环境"
    echo "  $0 prod     # 生产环境"
    echo "  $0 cli      # CLI工具"
    echo ""
}

# 主函数
main() {
    local command=${1:-dev}

    case "$command" in
        "dev")
            check_dependencies
            check_env
            create_directories
            set_permissions
            start_dev
            ;;
        "prod")
            check_dependencies
            check_env
            create_directories
            set_permissions
            start_prod
            ;;
        "cli")
            check_dependencies
            check_env
            start_cli
            ;;
        "health")
            check_health
            ;;
        "stop")
            stop_services
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

# 捕获中断信号
trap 'log_warning "收到中断信号，正在清理..."; docker compose -f docker-compose.yml down; exit 1' INT TERM

# 执行主函数
main "$@"