# AIOps - AI 驱动的智能运营系统

一个基于 AI 的全自动内容运营系统，支持智能爬取、内容生成和自动发布到小红书等平台。

## 功能特性

### 核心功能
- **智能爬取**: 使用 Playwright 自动爬取全网热点内容，支持 AI fallback
- **数据分析**: 分析热门内容趋势，提取关键词，生成运营策略
- **AI 内容生成**: 基于 GPT-4 生成高质量小红书爆款文案
- **自动发布**: 自动发布内容到小红书（支持其他平台扩展）
- **定时任务**: 自动化执行爬取、分析、生成和发布流程
- **数据可视化**: Web 管理界面展示运营数据和分析结果

### 技术栈
- **后端**: NestJS + TypeScript + TypeORM + PostgreSQL
- **前端**: React + TypeScript + Ant Design + Vite
- **队列**: BullMQ + Redis
- **爬虫**: Playwright + Chrome
- **AI**: OpenAI GPT-4 / Anthropic Claude
- **部署**: Docker + Docker Compose

## 项目结构

```
AIOps/
├── backend/              # NestJS 后端服务
│   ├── src/
│   │   ├── modules/
│   │   │   ├── crawler/      # 爬虫模块
│   │   │   ├── publisher/    # 发布模块
│   │   │   ├── analytics/    # 数据分析模块
│   │   │   ├── ai/           # AI 服务模块
│   │   │   ├── scheduler/    # 定时任务模块
│   │   │   ├── database/     # 数据库模块
│   │   │   └── cli/          # CLI 历史记录模块
│   │   ├── main.ts
│   │   └── app.module.ts
│   └── Dockerfile
├── frontend/            # React 前端应用
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── api.ts
│   └── Dockerfile
├── cli/                 # CLI 交互工具
│   ├── ai-qa.js
│   └── prompts/
├── database/            # 数据库初始化脚本
│   ├── init.sql
│   └── init.sh
├── docker-compose.yml
├── .env.example
└── README.md
```

## 快速开始

### 前置要求
- Node.js >= 18
- Docker & Docker Compose (可选)
- PostgreSQL 15
- Redis 7

### 使用 Docker Compose (推荐)

1. **克隆项目**
```bash
git clone <repository-url>
cd AIOps
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 API keys
```

3. **启动所有服务**
```bash
docker-compose up -d
```

4. **访问应用**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### 手动安装

#### 1. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install

# CLI 工具
cd ../cli
npm install
```

#### 2. 配置数据库

```bash
# 创建数据库
createdb aiops

# 运行初始化脚本
psql -U your_user -d aiops -f database/init.sql
```

#### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
```

#### 4. 启动服务

```bash
# 启动后端
cd backend
npm run start:dev

# 启动前端
cd frontend
npm run dev

# 启动 CLI 工具
cd cli
npm start
```

## 环境变量配置

主要环境变量说明：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=aiops_user
DB_PASSWORD=your_password
DB_NAME=aiops

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# AI API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# 小红书账号 (用于自动发布)
XIAOHONGSHU_EMAIL=your_email
XIAOHONGSHU_PASSWORD=your_password

# 任务调度配置
CRAWL_INTERVAL_HOURS=6
PUBLISH_INTERVAL_HOURS=4
GENERATE_CONTENT_INTERVAL_HOURS=12
```

## 使用指南

### Web 管理界面

访问 http://localhost:5173 进入管理界面：

1. **数据面板**: 查看运营数据总览
2. **内容管理**: 管理待发布和已发布的内容
3. **数据分析**: 查看热门趋势和关键词分析
4. **系统设置**: 配置爬取和发布参数

### CLI 工具

AIOps CLI 提供交互式命令行界面：

```bash
cd cli
npm start
```

可用命令：
- `/status` - 检查系统状态
- `/analyze [days]` - 分析运营数据
- `/trending` - 查看热门话题
- `/crawl [site]` - 触发爬取任务
- `/generate` - 触发内容生成
- `/publish` - 触发发布任务
- `/help` - 显示帮助信息

你也可以直接提问，AI 会使用相关工具来回答。

### API 接口

主要 API 端点：

#### Analytics
- `GET /analytics/performance?days=7` - 获取性能指标
- `GET /analytics/trending?days=7` - 获取热门话题
- `GET /analytics/daily-stats?days=30` - 获取每日统计
- `GET /analytics/content/:id` - 获取内容详情

#### Publisher
- `GET /publisher/pending` - 获取待发布内容
- `POST /publisher/publish` - 发布内容

#### CLI
- `POST /cli/history` - 保存 CLI 历史
- `GET /cli/history` - 获取 CLI 历史
- `GET /cli/history/search?q=keyword` - 搜索历史

## 定时任务

系统自动执行以下定时任务：

- **每天 9:00** - 爬取全网热点内容
- **每天 10:00** - AI 生成新内容
- **每天 20:00** - 发布内容到小红书
- **每天 23:00** - 分析数据并生成新策略
- **每小时** - 检查队列健康状态

可以在 `backend/src/modules/scheduler/scheduler.service.ts` 中自定义时间。

## 工作流程

```
1. 爬虫模块爬取全网热点
   ↓
2. 数据存储到 raw_content 表
   ↓
3. AI 分析热点数据和策略
   ↓
4. 生成高质量内容
   ↓
5. 内容存储到 contents 表
   ↓
6. 自动发布到小红书
   ↓
7. 收集发布数据
   ↓
8. 分析表现并更新策略
```

## 数据库架构

主要数据表：

- `sites` - 爬取站点配置
- `raw_content` - 原始爬取数据
- `contents` - 生成的内容
- `strategies` - AI 生成的运营策略
- `cli_history` - CLI 交互历史

## 开发指南

### 添加新的爬取源

1. 在 `database/init.sql` 中添加站点配置
2. 配置选择器规则
3. 重启爬虫服务

### 自定义内容生成

编辑 `backend/src/modules/ai/ai.service.ts` 中的 prompt 模板。

### 扩展发布平台

参考 `backend/src/modules/publisher/publisher.service.ts`，实现新平台的发布逻辑。

## 监控和日志

- 日志文件位置: `backend/logs/`
- 队列监控: 通过 Redis 查看任务状态
- 系统健康检查: 使用 `/status` 命令

## 常见问题

### 1. 爬虫无法访问网页

检查网络连接和代理设置。某些网站可能需要配置代理。

### 2. AI 生成内容质量不佳

- 确保 OpenAI API Key 有效
- 调整 prompt 模板
- 增加训练数据样本

### 3. 发布失败

- 检查小红书账号是否正常
- 验证登录凭据
- 查看浏览器是否需要人工验证

## 安全注意事项

- **不要**将 `.env` 文件提交到代码仓库
- **定期更新** API Keys
- **使用强密码**保护数据库
- **限制** API 访问频率
- **遵守**各平台的使用条款

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交 Issue。

---

**注意**: 本项目仅供学习和研究使用，请遵守相关平台的使用规则和法律法规。
