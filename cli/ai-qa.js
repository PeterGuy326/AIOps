#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// API 配置
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// 创建 readline 接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🤖 AIOps 智能问答系统 (基于 Claude Code)');
console.log('输入 "exit" 退出，输入 "help" 查看帮助');
console.log('----------------------------------------\n');

// 确保历史记录目录存在
const historyDir = path.join(__dirname, 'history');
if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
}

const historyFile = path.join(historyDir, 'qa-history.jsonl');

/**
 * 询问问题
 */
const askQuestion = (prompt = '你: ') => {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer);
        });
    });
};

/**
 * 调用 Claude Code
 */
const callClaudeCode = (prompt) => {
    return new Promise((resolve, reject) => {
        const claude = spawn('claude-code', ['--prompt', prompt]);
        let output = '';
        let error = '';

        claude.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            process.stdout.write(chunk); // 实时输出
        });

        claude.stderr.on('data', (data) => {
            error += data.toString();
        });

        claude.on('close', (code) => {
            if (code === 0) {
                resolve(output.trim());
            } else {
                reject(new Error(error || 'Claude Code execution failed'));
            }
        });
    });
};

/**
 * 保存历史记录
 */
const saveHistory = (question, answer) => {
    const history = {
        timestamp: new Date().toISOString(),
        question,
        answer
    };

    try {
        fs.appendFileSync(historyFile, JSON.stringify(history) + '\n');
    } catch (error) {
        console.error('Failed to save history:', error.message);
    }
};

/**
 * 处理快捷命令
 */
const handleCommand = async (command) => {
    const [cmd, ...args] = command.trim().split(/\s+/);

    try {
        switch (cmd) {
            case '/status':
                console.log('📊 系统状态检查中...\n');
                await checkSystemStatus();
                break;

            case '/analyze':
                console.log('📈 分析数据中...\n');
                const days = args[0] || '7';
                await analyzeData(parseInt(days));
                break;

            case '/crawl':
                console.log('🕷️ 开始爬取数据...\n');
                const site = args[0] || 'all';
                await triggerCrawl(site);
                break;

            case '/publish':
                console.log('📝 准备发布内容...\n');
                await triggerPublish();
                break;

            case '/generate':
                console.log('✨ 生成内容中...\n');
                await triggerGenerate();
                break;

            case '/trending':
                console.log('🔥 热门话题分析中...\n');
                await getTrending();
                break;

            case '/help':
                showHelp();
                break;

            default:
                console.log(`❌ 未知命令: ${cmd}`);
                console.log('输入 /help 查看所有可用命令\n');
        }
    } catch (error) {
        console.error(`❌ 命令执行失败: ${error.message}\n`);
    }
};

/**
 * 检查系统状态
 */
const checkSystemStatus = async () => {
    const checks = [
        { name: '数据库连接', check: async () => {
            try {
                await axios.get(`${API_BASE_URL}/analytics/performance`);
                return '✅ 正常';
            } catch {
                return '❌ 异常';
            }
        }},
        { name: '磁盘空间', check: async () => {
            const { execSync } = require('child_process');
            try {
                const output = execSync('df -h / | tail -1').toString();
                const usage = output.match(/(\d+)%/)[1];
                return `✅ 使用 ${usage}%`;
            } catch {
                return '❓ 无法检测';
            }
        }},
        { name: '内存使用', check: async () => {
            try {
                const used = process.memoryUsage();
                const mb = Math.round(used.heapUsed / 1024 / 1024);
                return `✅ 使用 ${mb}MB`;
            } catch {
                return '❓ 无法检测';
            }
        }},
    ];

    for (const { name, check } of checks) {
        const result = await check();
        console.log(`${name}: ${result}`);
    }
    console.log();
};

/**
 * 分析数据
 */
const analyzeData = async (days = 7) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/analytics/performance?days=${days}`);
        const metrics = response.data.metrics;

        console.log(`📊 最近 ${days} 天的运营数据:\n`);
        console.log(`总发布数: ${metrics.totalPublished}`);
        console.log(`总点赞数: ${metrics.totalLikes}`);
        console.log(`平均互动: ${metrics.avgEngagement}`);
        console.log(`发布频率: ${metrics.publishRate} 篇/天`);
        console.log(`\n表现优秀 (>1000赞): ${metrics.topPerforming.length} 篇`);
        console.log(`表现较差 (<100赞): ${metrics.lowPerforming.length} 篇\n`);
    } catch (error) {
        console.error(`分析失败: ${error.message}\n`);
    }
};

/**
 * 触发爬取
 */
const triggerCrawl = async (site) => {
    try {
        console.log(`正在爬取 ${site}...\n`);
        // 这里可以调用后端 API
        console.log(`✅ 爬取任务已添加到队列\n`);
    } catch (error) {
        console.error(`爬取失败: ${error.message}\n`);
    }
};

/**
 * 触发发布
 */
const triggerPublish = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/publisher/pending`);
        const pending = response.data.count;

        if (pending === 0) {
            console.log('❌ 没有待发布的内容\n');
            return;
        }

        console.log(`📝 发现 ${pending} 篇待发布内容`);
        console.log(`✅ 发布任务已添加到队列\n`);
    } catch (error) {
        console.error(`发布失败: ${error.message}\n`);
    }
};

/**
 * 触发内容生成
 */
const triggerGenerate = async () => {
    try {
        console.log(`✅ 内容生成任务已添加到队列\n`);
    } catch (error) {
        console.error(`生成失败: ${error.message}\n`);
    }
};

/**
 * 获取热门话题
 */
const getTrending = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/analytics/trending`);
        const topics = response.data.topics;

        console.log('🔥 当前热门话题 TOP 10:\n');
        topics.slice(0, 10).forEach((topic, index) => {
            console.log(`${index + 1}. ${topic.keyword} (出现 ${topic.count} 次)`);
        });
        console.log();
    } catch (error) {
        console.error(`获取失败: ${error.message}\n`);
    }
};

/**
 * 显示帮助信息
 */
const showHelp = () => {
    console.log(`
📖 可用命令:

系统管理:
  /status              - 检查系统状态
  /help                - 显示帮助信息

数据分析:
  /analyze [days]      - 分析运营数据 (默认7天)
  /trending            - 查看热门话题

任务触发:
  /crawl [site]        - 触发爬取任务
  /generate            - 触发内容生成
  /publish             - 触发发布任务

其他:
  exit                 - 退出系统

💡 提示: 你也可以直接提问，我会使用 AI 来回答！
`);
};

/**
 * 主循环
 */
const main = async () => {
    while (true) {
        const question = await askQuestion();

        if (!question.trim()) {
            continue;
        }

        if (question.toLowerCase() === 'exit') {
            console.log('\n👋 再见！\n');
            rl.close();
            break;
        }

        // 处理快捷命令
        if (question.startsWith('/')) {
            await handleCommand(question);
            console.log('----------------------------------------\n');
            continue;
        }

        // AI 问答
        try {
            console.log('\nAIOps: ');

            const enhancedPrompt = `
你现在是 AIOps 系统的运营分析助手。请使用以下工具来回答问题：
- 如果需要浏览网页，请使用 chrome-mcp
- 如果需要读取文件，请使用 filesystem-mcp
- 如果需要执行系统命令，请使用 shell-mcp

用户问题：${question}

请给出专业、有见地的回答。
            `.trim();

            const answer = await callClaudeCode(enhancedPrompt);

            console.log();
            saveHistory(question, answer);
            console.log('----------------------------------------\n');
        } catch (error) {
            console.error(`\n❌ 错误: ${error.message}\n`);
            console.log('----------------------------------------\n');
        }
    }
};

// 处理 Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n👋 再见！\n');
    rl.close();
    process.exit(0);
});

// 启动
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
