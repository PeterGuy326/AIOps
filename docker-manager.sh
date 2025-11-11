#!/bin/bash

# AIOps Docker 容器管理脚本
# 所有容器和资源都使用 aiops 前缀

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 显示所有 AIOps 容器
show_containers() {
    log_info "AIOps 容器状态："
    echo ""
    docker ps -a --filter "name=aiops-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
    echo ""
}

# 启动所有 AIOps 容器
start_all() {
    log_info "启动所有 AIOps 容器..."

    # 确保网络存在
    docker network inspect aiops-network >/dev/null 2>&1 || docker network create aiops-network

    # 启动所有服务
    docker compose -f docker-compose.yml --env-file .env up -d

    log_success "所有 AIOps 容器已启动"
    sleep 5
    show_containers
}

# 停止所有 AIOps 容器
stop_all() {
    log_info "停止所有 AIOps 容器..."
    docker compose -f docker-compose.yml down
    log_success "所有 AIOps 容器已停止"
}

# 重启所有 AIOps 容器
restart_all() {
    log_info "重启所有 AIOps 容器..."
    docker compose -f docker-compose.yml restart
    log_success "所有 AIOps 容器已重启"
}

# 删除所有 AIOps 容器
remove_all() {
    log_warning "将删除所有 AIOps 容器和资源..."
    read -p "确认删除？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose -f docker-compose.yml down -v --remove-orphans
        log_success "所有 AIOps 容器和资源已删除"
    else
        log_info "取消删除操作"
    fi
}

# 查看 AIOps 容器日志
logs() {
    local service=$1
    if [ -z "$service" ]; then
        log_info "AIOps 容器列表："
        echo "  postgres   - PostgreSQL 数据库"
        echo "  redis     - Redis 缓存"
        echo "  backend   - 后端 API"
        echo "  frontend  - 前端应用"
        echo "  cli       - CLI 工具"
        echo ""
        log_info "使用方法: $0 logs [service]"
    else
        log_info "查看 aiops-$service 容器日志..."
        docker logs -f "aiops-$service"
    fi
}

# 进入 AIOps 容器
exec_container() {
    local service=$1
    if [ -z "$service" ]; then
        log_error "请指定服务名称: $0 exec [postgres|redis|backend|frontend|cli]"
        return 1
    fi

    log_info "进入 aiops-$service 容器..."
    docker exec -it "aiops-$service" sh
}

# 数据库操作
database_ops() {
    local op=$1
    case "$op" in
        "connect")
            log_info "连接 PostgreSQL 数据库..."
            docker exec -it aiops-postgres psql -U aiops_user -d aiops
            ;;
        "backup")
            local timestamp=$(date +"%Y%m%d_%H%M%S")
            local backup_file="database/backups/aiops_backup_${timestamp}.sql"
            mkdir -p database/backups

            log_info "备份数据库到 $backup_file..."
            docker exec aiops-postgres pg_dump -U aiops_user aiops > "$backup_file"

            if [ $? -eq 0 ]; then
                log_success "数据库备份完成: $backup_file"
            else
                log_error "数据库备份失败"
            fi
            ;;
        "restore")
            local backup_file=$2
            if [ -z "$backup_file" ]; then
                log_error "请指定备份文件: $0 database restore [backup_file]"
                return 1
            fi

            log_info "从 $backup_file 恢复数据库..."
            docker exec -i aiops-postgres psql -U aiops_user -d aiops < "$backup_file"

            if [ $? -eq 0 ]; then
                log_success "数据库恢复完成"
            else
                log_error "数据库恢复失败"
            fi
            ;;
        *)
            log_info "数据库操作："
            echo "  connect  - 连接数据库"
            echo "  backup  - 备份数据库"
            echo "  restore - 恢复数据库 [需要指定文件]"
            echo ""
            echo "使用示例:"
            echo "  $0 database connect"
            echo "  $0 database backup"
            echo "  $0 database restore backup.sql"
            ;;
    esac
}

# Redis 操作
redis_ops() {
    local op=$1
    case "$op" in
        "connect")
            log_info "连接 Redis..."
            docker exec -it aiops-redis redis-cli
            ;;
        "flush")
            log_warning "将清空所有 Redis 数据..."
            read -p "确认清空？(y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker exec aiops-redis redis-cli flushall
                log_success "Redis 数据已清空"
            else
                log_info "取消清空操作"
            fi
            ;;
        "info")
            log_info "Redis 信息："
            docker exec aiops-redis redis-cli info
            ;;
        *)
            log_info "Redis 操作："
            echo "  connect  - 连接 Redis"
            echo "  flush   - 清空所有数据"
            echo "  info    - 查看 Redis 信息"
            ;;
    esac
}

# 资源监控
monitor() {
    log_info "AIOps 资源监控："
    echo ""

    # 容器状态
    echo -e "${BLUE}=== 容器状态 ===${NC}"
    show_containers

    # 资源使用
    echo ""
    echo -e "${BLUE}=== 资源使用 ===${NC}"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}" $(docker ps -q --filter "name=aiops-")

    # 磁盘使用
    echo ""
    echo -e "${BLUE}=== 磁盘使用 ===${NC}"
    df -h | grep -E "(postgres_data|redis_data|Filesystem)"

    # 网络信息
    echo ""
    echo -e "${BLUE}=== 网络信息 ===${NC}"
    docker network inspect aiops-network --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}'
}

# 清理资源
cleanup() {
    log_info "清理 AIOps 相关资源..."

    # 停止并删除容器
    docker compose -f docker-compose.yml down -v --remove-orphans 2>/dev/null || true

    # 清理未使用的镜像
    docker image prune -f --filter "label!=com.docker.compose.service" 2>/dev/null || true

    # 清理未使用的网络
    docker network prune -f 2>/dev/null || true

    log_success "资源清理完成"
}

# 健康检查
health_check() {
    log_info "AIOps 服务健康检查："
    echo ""

    # 检查容器状态
    local containers=("aiops-postgres" "aiops-redis" "aiops-backend" "aiops-frontend")
    local healthy=0

    for container in "${containers[@]}"; do
        if docker ps --filter "name=$container" --quiet | grep -q .; then
            echo -e "  ${GREEN}✓ $container 运行中${NC}"
            ((healthy++))
        else
            echo -e "  ${RED}✗ $container 未运行${NC}"
        fi
    done

    # 检查服务连通性
    echo ""
    echo -e "${BLUE}=== 服务连通性 ===${NC}"

    # PostgreSQL
    if docker exec aiops-postgres pg_isready -U aiops_user -d aiops >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓ PostgreSQL 连接正常${NC}"
    else
        echo -e "  ${RED}✗ PostgreSQL 连接失败${NC}"
    fi

    # Redis
    if docker exec aiops-redis redis-cli ping >/dev/null 2>&1 | grep -q PONG; then
        echo -e "  ${GREEN}✓ Redis 连接正常${NC}"
    else
        echo -e "  ${RED}✗ Redis 连接失败${NC}"
    fi

    # Backend API
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓ 后端API 正常${NC}"
    else
        echo -e "  ${YELLOW}⚠ 后端API 可能还在启动中${NC}"
    fi

    # Frontend
    if curl -f http://localhost:5173 >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓ 前端应用 正常${NC}"
    else
        echo -e "  ${YELLOW}⚠ 前端应用 可能还在启动中${NC}"
    fi

    echo ""
    log_info "健康检查完成: $healthy/${#containers[@]} 容器运行正常"
}

# 显示帮助
show_help() {
    echo "AIOps Docker 容器管理脚本"
    echo ""
    echo "使用方法: $0 [command] [options]"
    echo ""
    echo "基础命令:"
    echo "  ps          - 显示所有 AIOps 容器状态"
    echo "  start       - 启动所有 AIOps 容器"
    echo "  stop        - 停止所有 AIOps 容器"
    echo "  restart     - 重启所有 AIOps 容器"
    echo "  remove      - 删除所有 AIOps 容器和资源"
    echo "  cleanup     - 清理未使用的资源"
    echo ""
    echo "容器操作:"
    echo "  logs [service]  - 查看容器日志"
    echo "  exec [service]  - 进入容器"
    echo ""
    echo "数据库操作:"
    echo "  database connect      - 连接 PostgreSQL"
    echo "  database backup      - 备份数据库"
    echo "  database restore [file] - 恢复数据库"
    echo ""
    echo "Redis操作:"
    echo "  redis connect      - 连接 Redis"
    echo "  redis flush        - 清空 Redis 数据"
    echo "  redis info         - 查看 Redis 信息"
    echo ""
    echo "监控命令:"
    echo "  monitor       - 显示资源监控"
    echo "  health        - 健康检查"
    echo ""
    echo "服务列表: postgres, redis, backend, frontend, cli"
    echo ""
    echo "示例:"
    echo "  $0 start                    # 启动所有服务"
    echo "  $0 logs backend             # 查看后端日志"
    echo "  $0 exec postgres             # 进入数据库容器"
    echo "  $0 database backup          # 备份数据库"
    echo "  $0 redis connect            # 连接Redis"
    echo "  $0 monitor                  # 资源监控"
}

# 主函数
main() {
    local command=${1:-help}

    case "$command" in
        "ps")
            show_containers
            ;;
        "start")
            start_all
            ;;
        "stop")
            stop_all
            ;;
        "restart")
            restart_all
            ;;
        "remove")
            remove_all
            ;;
        "logs")
            logs "$2"
            ;;
        "exec")
            exec_container "$2"
            ;;
        "database")
            database_ops "$2" "$3"
            ;;
        "redis")
            redis_ops "$2"
            ;;
        "monitor")
            monitor
            ;;
        "health")
            health_check
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

# 执行主函数
main "$@"