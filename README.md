# AIOps - AI 智能内容运营系统

> 版本：v2.0 (纯本地 MCP) | 更新时间：2025-11-26

**基于本地 Claude Code MCP 的全自动化内容生产与运营平台**，零费用 AI、数据本地化、完整闭环。

## 快速开始

### 前置要求

- Node.js 18+
- Docker & Docker Compose
- **Claude Code CLI** (必需)

### 1. 克隆项目

```bash
git clone <repository-url>
cd AIOps
```

### 2. 启动基础服务

```bash
docker-compose up -d  # 启动 MongoDB、Elasticsearch、Redis
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 配置数据库连接信息
```

### 4. 在 Claude Code 中启动应用

```bash
# 必须在 Claude Code 环境中运行
claude-code

# 在 Claude Code session 中
cd backend
npm install
npm run start:dev
```

### 5. 验证 MCP 连接

查看日志应该看到：
```
🔌 连接到本地 Claude Code MCP...
✅ MCP 已连接 (X 个工具可用)
```

## 核心功能

### 智能内容生成
- **零费用 AI**：基于本地 Claude Code MCP
- **内容创作**：自动生成小红书爆款文案
- **策略优化**：AI 分析数据生成运营策略
- **内容分析**：质量评分、情感分析、爆款预测

### 多平台爬虫
- **知乎**：热榜、搜索、问答
- **微信公众号**：通过搜狗搜索爬取
- **智能筛选**：AI 判断内容相关性和质量

### 数据管理
- **MongoDB**：内容存储、策略管理
- **Elasticsearch**：全文搜索、数据分析
- **Redis**：任务队列、缓存

## 技术栈

```
后端:  NestJS + TypeScript + MCP SDK
AI:    Claude Code MCP (本地)
数据库: MongoDB + Elasticsearch + Redis
前端:  React 18 + Ant Design
```

## API 接口

### AI 服务

#### 生成内容
```bash
POST /api/ai/content/generate
{
  "rawData": [{"title": "热点", "likes": 1000}],
  "strategy": {"style": "轻松活泼"}
}
```

#### 生成策略
```bash
POST /api/ai/strategy/generate
{
  "analyticsData": {
    "topKeywords": ["AI", "技术"],
    "avgEngagement": 0.15
  }
}
```

#### 分析内容
```bash
POST /api/ai/content/analyze
{
  "content": "待分析的内容..."
}
```

### 爬虫服务

#### 启动爬取
```bash
POST /api/crawler/crawl
{
  "platform": "zhihu",
  "keyword": "人工智能",
  "maxPages": 30
}
```

#### 查询结果
```bash
GET /api/crawler/results?platform=zhihu&keyword=AI
```

## 架构说明

### 本地 MCP 架构

```
应用层 (NestJS)
    ↓
AI Service (ai.service.ts)
    ↓
Claude MCP Service (claude-mcp.service.ts)
    ↓
MCP SDK Client
    ↓
Claude Code MCP Server (本地)
    ↓
AI 响应
```

### 核心实现

#### 1. MCP 连接 (`claude-mcp.service.ts`)

```typescript
// 自动连接到 Claude Code
async connect() {
  const ssePort = process.env.CLAUDE_CODE_SSE_PORT; // 由 Claude Code 自动设置
  const sseUrl = new URL(`http://localhost:${ssePort}/sse`);
  const transport = new SSEClientTransport(sseUrl);

  this.client = new Client(...);
  await this.client.connect(transport);
}

// 调用 AI
private async callClaude(prompt: string) {
  return await this.client.callTool({
    name: 'ask_claude',
    arguments: { prompt, model: 'claude-sonnet-4-5' }
  });
}
```

#### 2. AI 服务 (`ai.service.ts`)

```typescript
// 生成内容
async generateContent(rawData, strategy) {
  if (!this.claudeMCPService.isReady()) {
    throw new Error('MCP 服务未连接');
  }

  const prompt = `生成小红书文案...`;
  const response = await this.claudeMCPService['callClaude'](prompt);
  return JSON.parse(response);
}
```

## 环境变量

### 必需配置

```bash
# MongoDB
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_USER=aiops
MONGO_PASSWORD=your_password
MONGO_DB=aiops

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 自动配置

```bash
# 由 Claude Code 自动设置，无需手动配置
CLAUDE_CODE_SSE_PORT=<自动>
```

## 故障排查

### Q: 看到"未检测到 Claude Code 环境"

**原因**：未在 Claude Code 中运行

**解决**：
```bash
claude-code
# 然后在 Claude Code session 中启动应用
```

### Q: "MCP 服务未连接"错误

**检查**：
1. 确认在 Claude Code 中运行
2. 查看是否有 `CLAUDE_CODE_SSE_PORT` 环境变量
```bash
echo $CLAUDE_CODE_SSE_PORT
```

### Q: 想使用非 Claude Code 环境

**说明**：v2.0 版本**必须**在 Claude Code 中运行

**原因**：
- 零费用设计（无云端 API）
- 数据安全（本地处理）
- 架构简化（统一 MCP）

## 项目结构

```
AIOps/
├── backend/              # NestJS 后端
│   └── src/
│       ├── modules/
│       │   ├── ai/      # AI 服务（MCP）
│       │   ├── crawler/  # 爬虫服务
│       │   ├── database/ # 数据库
│       │   └── ...
│       └── main.ts
├── frontend/             # React 前端
├── database/             # 数据库初始化
├── docker-compose.yml    # Docker 配置
├── .env.example          # 环境变量模板
└── README.md
```

## 核心文件

```
backend/src/modules/ai/
├── ai.service.ts              # AI 业务逻辑
├── claude-mcp.service.ts      # MCP 连接服务 ⭐
├── ai.controller.ts           # API 接口
└── ai.module.ts               # 模块配置

backend/src/modules/crawler/
└── crawlers/
    ├── local-mcp.crawler.ts   # 本地 MCP 爬虫基类
    └── zhihu-local-mcp.crawler.ts
```

## 开发调试

### 查看详细日志

```bash
LOG_LEVEL=debug npm run start:dev
```

### 列出可用 MCP 工具

在代码中调用：
```typescript
const tools = await claudeMCPService.listTools();
console.log(tools);
```

### 测试 API

```bash
# 测试内容生成
curl -X POST http://localhost:3000/api/ai/content/generate \
  -H "Content-Type: application/json" \
  -d '{"rawData":[{"title":"测试","likes":100}],"strategy":{"style":"活泼"}}'
```

## 优势对比

### v2.0 (本地 MCP) vs v1.0 (云端 API)

| 特性 | v2.0 本地 MCP | v1.0 云端 API |
|------|-------------|-------------|
| **费用** | ✅ 零费用 | ❌ 按使用计费 |
| **数据隐私** | ✅ 完全本地 | ❌ 上传云端 |
| **API Key** | ✅ 无需配置 | ❌ 必需 |
| **运行环境** | Claude Code | 任意 |
| **响应速度** | 快（本地） | 慢（网络延迟） |
| **依赖** | MCP SDK | OpenAI SDK + Anthropic SDK |

## 迁移说明

### 从 v1.0 升级到 v2.0

已移除的依赖：
```json
{
  "openai": "^4.20.0",           // ❌ 已删除
  "@anthropic-ai/sdk": "^0.20.0" // ❌ 已删除
}
```

已移除的环境变量：
```bash
OPENAI_API_KEY         # ❌ 不再需要
ANTHROPIC_API_KEY      # ❌ 不再需要
CLAUDE_API_KEY         # ❌ 不再需要
```

已废弃的文件：
```
backend/src/modules/crawler/crawlers/
├── base-mcp.crawler.ts      # ❌ 废弃（云端 API）
├── zhihu-mcp.crawler.ts     # ❌ 废弃（云端 API）
└── wechat-mcp.crawler.ts    # ❌ 废弃（云端 API）
```

推荐使用：
```
✅ local-mcp.crawler.ts        # 本地 MCP 基类
✅ zhihu-local-mcp.crawler.ts  # 知乎本地爬虫
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

- Issues: GitHub Issues
- Discussions: GitHub Discussions

---

**注意**：本项目必须在 Claude Code 环境中运行才能使用 AI 功能。
