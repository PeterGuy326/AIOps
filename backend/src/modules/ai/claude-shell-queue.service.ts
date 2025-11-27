import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as net from 'net';

const execAsync = promisify(exec);

interface ClaudeTask {
  id: string;
  prompt: string;
  createdAt: number;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

interface WorkerStatus {
  id: number;
  busy: boolean;
  currentTask?: string;
  startTime?: number;
  taskCount: number;
}

/**
 * Claude Shell 队列服务
 * - 最多 5 个并发实例
 * - FIFO 队列
 * - 超时检测（避免死锁）
 * - 自动重试机制
 */
@Injectable()
export class ClaudeShellQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClaudeShellQueueService.name);

  // 配置参数
  private readonly MAX_WORKERS = 5; // 最大并发数
  private readonly TASK_TIMEOUT = 120000; // 2分钟超时
  private readonly DEADLOCK_CHECK_INTERVAL = 10000; // 10秒检查一次
  private readonly MAX_RETRIES = 2; // 最大重试次数

  // 队列和工作器
  private taskQueue: ClaudeTask[] = [];
  private workers: WorkerStatus[] = [];
  private isProcessing = false;
  private deadlockCheckTimer?: NodeJS.Timeout;

  // 统计信息
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    timeouts: 0,
    retries: 0,
  };

  // Claude 命令路径
  private claudeCommand = 'claude';

  // MCP 工具可用性
  private availableMCPTools: string[] = [];
  private hasBrowserMCP = false;

  // Chrome 进程
  private chromeProcess: ReturnType<typeof import('child_process').spawn> | null = null;
  private readonly CHROME_DEBUG_PORT = 9222;

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  /**
   * 初始化服务
   */
  private async initialize() {
    try {
      this.logger.log('🚀 初始化 Claude Shell 队列服务');

      // 检查 claude 命令
      const { stdout } = await execAsync('which claude', { timeout: 5000 });
      if (stdout && stdout.trim()) {
        this.claudeCommand = stdout.trim();
        this.logger.log(`✅ Claude 命令路径: ${this.claudeCommand}`);
      } else {
        throw new Error('未找到 claude 命令');
      }

      // 初始化工作器
      for (let i = 0; i < this.MAX_WORKERS; i++) {
        this.workers.push({
          id: i,
          busy: false,
          taskCount: 0,
        });
      }

      // 检查 MCP 工具可用性
      await this.checkMCPTools();

      // 如果检测到 Chrome MCP，自动启动 Chrome
      if (this.hasBrowserMCP) {
        const chromeStarted = await this.startChrome();
        if (!chromeStarted) {
          this.logger.warn('⚠️  Chrome 启动失败，爬虫功能可能受限');
        }
      }

      // 启动死锁检测
      this.startDeadlockDetection();

      this.logger.log(`✅ 队列服务已就绪 (${this.MAX_WORKERS} 个工作器)`);
      if (this.hasBrowserMCP) {
        this.logger.log(`✅ Chrome MCP 已就绪: ${this.availableMCPTools.filter(t => this.isBrowserTool(t)).join(', ')}`);
      } else {
        this.logger.warn(`⚠️  未检测到 Chrome MCP，爬虫功能将不可用。配置方法: claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest`);
      }
    } catch (error) {
      this.logger.error('❌ 初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 关闭服务
   */
  private async shutdown() {
    this.logger.log('🛑 关闭 Claude Shell 队列服务');

    // 停止死锁检测
    if (this.deadlockCheckTimer) {
      clearInterval(this.deadlockCheckTimer);
    }

    // 关闭 Chrome
    await this.stopChrome();

    // 取消所有待处理任务
    this.taskQueue.forEach((task) => {
      if (task.timeout) clearTimeout(task.timeout);
      task.reject(new Error('服务关闭'));
    });

    this.taskQueue = [];
    this.logger.log('✅ 队列服务已关闭');
  }

  /**
   * 提交任务到队列
   */
  async submitTask(prompt: string, maxRetries: number = this.MAX_RETRIES): Promise<string> {
    return new Promise((resolve, reject) => {
      const taskId = this.generateTaskId();

      const task: ClaudeTask = {
        id: taskId,
        prompt,
        createdAt: Date.now(),
        resolve,
        reject,
      };

      // 设置任务超时
      task.timeout = setTimeout(() => {
        this.handleTaskTimeout(task);
      }, this.TASK_TIMEOUT);

      // 加入队列
      this.taskQueue.push(task);
      this.stats.totalTasks++;

      this.logger.log(
        `📥 任务入队 [${taskId.substring(0, 8)}] (队列: ${this.taskQueue.length}, 忙碌: ${this.getBusyWorkerCount()}/${this.MAX_WORKERS})`,
      );

      // 触发处理
      this.processQueue();
    });
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.taskQueue.length > 0) {
        // 找到空闲的工作器
        const worker = this.workers.find((w) => !w.busy);
        if (!worker) {
          // 所有工作器都忙，等待
          break;
        }

        // 取出队首任务 (FIFO)
        const task = this.taskQueue.shift();
        if (!task) break;

        // 分配任务给工作器
        this.assignTaskToWorker(worker, task);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 分配任务给工作器
   */
  private async assignTaskToWorker(worker: WorkerStatus, task: ClaudeTask) {
    worker.busy = true;
    worker.currentTask = task.id;
    worker.startTime = Date.now();
    worker.taskCount++;

    this.logger.log(
      `🔧 工作器 [${worker.id}] 开始执行任务 [${task.id.substring(0, 8)}]`,
    );

    try {
      const result = await this.executeClaudeShell(task.prompt, task.id);

      // 清除超时
      if (task.timeout) clearTimeout(task.timeout);

      // 任务完成
      task.resolve(result);
      this.stats.completedTasks++;

      const duration = Date.now() - worker.startTime!;
      this.logger.log(
        `✅ 任务完成 [${task.id.substring(0, 8)}] 耗时: ${duration}ms (工作器: ${worker.id})`,
      );
    } catch (error) {
      // 清除超时
      if (task.timeout) clearTimeout(task.timeout);

      // 任务失败
      task.reject(error);
      this.stats.failedTasks++;

      this.logger.error(`❌ 任务失败 [${task.id.substring(0, 8)}]:`, error.message);
    } finally {
      // 释放工作器
      worker.busy = false;
      worker.currentTask = undefined;
      worker.startTime = undefined;

      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 执行 Claude Shell 命令
   */
  private async executeClaudeShell(prompt: string, taskId: string): Promise<string> {
    // 创建临时文件
    const tmpDir = '/tmp/claude-queue';
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const tmpFile = path.join(tmpDir, `prompt-${taskId}.txt`);

    try {
      // 写入 prompt
      await fs.promises.writeFile(tmpFile, prompt, 'utf-8');

      // 执行命令（使用 taskId 作为会话隔离）
      // --dangerously-skip-permissions: 跳过所有工具确认（爬虫、文件操作等）
      const command = `cat "${tmpFile}" | ${this.claudeCommand} --print --output-format json --dangerously-skip-permissions`;

      this.logger.debug(`执行命令: ${command.substring(0, 100)}...`);

      const { stdout, stderr } = await execAsync(command, {
        timeout: this.TASK_TIMEOUT - 5000, // 留 5 秒缓冲
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: {
          ...process.env,
          CLAUDE_SESSION_ID: taskId, // 使用独立会话 ID
        },
      });

      if (stderr && stderr.includes('error')) {
        this.logger.warn('Claude 警告:', stderr);
      }

      // 解析 Claude CLI 响应
      const cliResponse = JSON.parse(stdout.trim());

      if (cliResponse.is_error) {
        throw new Error(cliResponse.result || '未知错误');
      }

      // 从 Claude 回答中提取 JSON（如果有的话）
      return this.extractJSONFromResponse(cliResponse.result || '');
    } finally {
      // 删除临时文件
      try {
        await fs.promises.unlink(tmpFile);
      } catch (e) {
        // 忽略删除失败
      }
    }
  }

  /**
   * 处理任务超时
   */
  private handleTaskTimeout(task: ClaudeTask) {
    this.logger.warn(`⏰ 任务超时 [${task.id.substring(0, 8)}]`);

    // 从队列中移除
    const index = this.taskQueue.indexOf(task);
    if (index > -1) {
      this.taskQueue.splice(index, 1);
    }

    // 查找执行此任务的工作器
    const worker = this.workers.find((w) => w.currentTask === task.id);
    if (worker) {
      this.logger.warn(`强制释放工作器 [${worker.id}]`);
      worker.busy = false;
      worker.currentTask = undefined;
      worker.startTime = undefined;

      // 继续处理队列
      this.processQueue();
    }

    this.stats.timeouts++;
    task.reject(new Error('任务超时'));
  }

  /**
   * 死锁检测
   */
  private startDeadlockDetection() {
    this.deadlockCheckTimer = setInterval(() => {
      const now = Date.now();

      this.workers.forEach((worker) => {
        if (worker.busy && worker.startTime) {
          const duration = now - worker.startTime;

          // 如果任务运行超过超时时间的 80%，发出警告
          if (duration > this.TASK_TIMEOUT * 0.8) {
            this.logger.warn(
              `⚠️  工作器 [${worker.id}] 任务运行时间过长: ${duration}ms (任务: ${worker.currentTask?.substring(0, 8)})`,
            );
          }
        }
      });

      // 检测队列积压
      if (this.taskQueue.length > 10) {
        this.logger.warn(`⚠️  队列积压: ${this.taskQueue.length} 个任务等待处理`);
      }
    }, this.DEADLOCK_CHECK_INTERVAL);
  }

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 从 Claude 响应中提取 JSON
   * 支持多种格式：纯 JSON、markdown 代码块、混合文本
   */
  private extractJSONFromResponse(text: string): string {
    if (!text || !text.trim()) {
      return '';
    }

    const trimmed = text.trim();

    // 方法1: 尝试直接解析（纯 JSON 响应）
    try {
      JSON.parse(trimmed);
      return trimmed; // 有效 JSON，直接返回
    } catch {
      // 不是纯 JSON，继续尝试其他方法
    }

    // 方法2: 提取 ```json ... ``` 代码块
    const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      const extracted = jsonBlockMatch[1].trim();
      try {
        JSON.parse(extracted);
        return extracted; // 有效 JSON
      } catch {
        // 代码块内容不是有效 JSON，继续
      }
    }

    // 方法3: 提取 ``` ... ``` 代码块（无语言标记）
    const codeBlockMatch = trimmed.match(/```\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const extracted = codeBlockMatch[1].trim();
      try {
        JSON.parse(extracted);
        return extracted;
      } catch {
        // 继续
      }
    }

    // 方法4: 提取第一个完整的 JSON 对象 { ... }
    const objectMatch = this.extractJSONObject(trimmed);
    if (objectMatch) {
      return objectMatch;
    }

    // 方法5: 提取第一个完整的 JSON 数组 [ ... ]
    const arrayMatch = this.extractJSONArray(trimmed);
    if (arrayMatch) {
      return arrayMatch;
    }

    // 都失败了，返回原文（可能是纯文本回答）
    this.logger.debug('无法提取 JSON，返回原始文本');
    return trimmed;
  }

  /**
   * 提取完整的 JSON 对象（处理嵌套括号）
   */
  private extractJSONObject(text: string): string | null {
    const startIndex = text.indexOf('{');
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) {
            const extracted = text.substring(startIndex, i + 1);
            try {
              JSON.parse(extracted);
              return extracted;
            } catch {
              return null;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 提取完整的 JSON 数组（处理嵌套括号）
   */
  private extractJSONArray(text: string): string | null {
    const startIndex = text.indexOf('[');
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[') depth++;
        else if (char === ']') {
          depth--;
          if (depth === 0) {
            const extracted = text.substring(startIndex, i + 1);
            try {
              JSON.parse(extracted);
              return extracted;
            } catch {
              return null;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 获取忙碌的工作器数量
   */
  private getBusyWorkerCount(): number {
    return this.workers.filter((w) => w.busy).length;
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      queueLength: this.taskQueue.length,
      workers: this.workers.map((w) => ({
        id: w.id,
        busy: w.busy,
        currentTask: w.currentTask?.substring(0, 8),
        duration: w.startTime ? Date.now() - w.startTime : 0,
        taskCount: w.taskCount,
      })),
      stats: this.stats,
    };
  }

  /**
   * 检查服务是否就绪
   */
  isReady(): boolean {
    return this.workers.length > 0;
  }

  /**
   * 检查浏览器 MCP 是否可用
   */
  hasBrowserCapability(): boolean {
    return this.hasBrowserMCP;
  }

  /**
   * 获取可用的 MCP 工具列表
   */
  getAvailableMCPTools(): string[] {
    return this.availableMCPTools;
  }

  /**
   * 检查 MCP 工具可用性
   */
  private async checkMCPTools(): Promise<void> {
    try {
      // 使用 claude mcp list 获取已配置的 MCP 服务器
      const { stdout } = await execAsync('claude mcp list 2>/dev/null || echo "[]"', {
        timeout: 10000,
      });

      this.logger.debug('MCP 配置输出:', stdout);

      // 解析输出，查找浏览器相关的 MCP（优先 chrome-devtools）
      const browserKeywords = [
        'chrome-devtools',
        'chrome',
        'devtools',
        'browser',
        'puppeteer',
        'playwright',
      ];

      const lines = stdout.toLowerCase().split('\n');
      for (const line of lines) {
        for (const keyword of browserKeywords) {
          if (line.includes(keyword)) {
            this.hasBrowserMCP = true;
            this.availableMCPTools.push(line.trim());
            break;
          }
        }
      }

      if (this.hasBrowserMCP) {
        this.logger.log(`🌐 检测到 Chrome MCP: ${this.availableMCPTools.length} 个`);
      }
    } catch (error) {
      this.logger.warn('检查 MCP 工具失败:', error.message);
      this.hasBrowserMCP = false;
    }
  }

  /**
   * 判断是否为浏览器相关工具
   */
  private isBrowserTool(tool: string): boolean {
    const keywords = ['chrome-devtools', 'chrome', 'devtools', 'browser', 'puppeteer', 'playwright'];
    return keywords.some(k => tool.toLowerCase().includes(k));
  }
  /**
   * 检查 Chrome 远程调试是否就绪
   */
  private async isChromeDebugReady(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(this.CHROME_DEBUG_PORT, '127.0.0.1');
    });
  }

  /**
   * 获取 Chrome 可执行文件路径
   */
  private getChromePath(): string {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS
      const paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    } else if (platform === 'linux') {
      // Linux
      const paths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    } else if (platform === 'win32') {
      // Windows
      const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    }

    return '';
  }

  /**
   * 启动 Chrome（开启远程调试）
   */
  async startChrome(): Promise<boolean> {
    // 检查是否已经有 Chrome 在调试端口运行
    if (await this.isChromeDebugReady()) {
      this.logger.log(`✅ Chrome 调试端口 ${this.CHROME_DEBUG_PORT} 已就绪`);
      return true;
    }

    const chromePath = this.getChromePath();
    if (!chromePath) {
      this.logger.error('❌ 未找到 Chrome 浏览器');
      return false;
    }

    this.logger.log(`🚀 启动 Chrome: ${chromePath}`);

    // 创建用户数据目录（隔离配置）
    const userDataDir = path.join('/tmp', 'chrome-aiops-debug');
    await fs.promises.mkdir(userDataDir, { recursive: true });

    try {
      // 启动 Chrome
      this.chromeProcess = spawn(chromePath, [
        `--remote-debugging-port=${this.CHROME_DEBUG_PORT}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--headless=new', // 无头模式，不显示窗口
      ], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.chromeProcess.stdout?.on('data', (data) => {
        this.logger.debug(`Chrome stdout: ${data}`);
      });

      this.chromeProcess.stderr?.on('data', (data) => {
        this.logger.debug(`Chrome stderr: ${data}`);
      });

      this.chromeProcess.on('error', (error) => {
        this.logger.error('Chrome 进程错误:', error.message);
        this.chromeProcess = null;
      });

      this.chromeProcess.on('exit', (code) => {
        this.logger.log(`Chrome 进程退出，退出码: ${code}`);
        this.chromeProcess = null;
      });

      // 等待 Chrome 启动
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await this.isChromeDebugReady()) {
          this.logger.log(`✅ Chrome 已启动并就绪 (端口: ${this.CHROME_DEBUG_PORT})`);
          return true;
        }
      }

      this.logger.error('❌ Chrome 启动超时');
      return false;
    } catch (error) {
      this.logger.error('❌ Chrome 启动失败:', error.message);
      return false;
    }
  }

  /**
   * 关闭 Chrome
   */
  async stopChrome(): Promise<void> {
    if (this.chromeProcess) {
      this.logger.log('🛑 关闭 Chrome');
      this.chromeProcess.kill('SIGTERM');

      // 等待进程退出
      await new Promise<void>((resolve) => {
        if (!this.chromeProcess) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          this.chromeProcess?.kill('SIGKILL');
          resolve();
        }, 5000);

        this.chromeProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.chromeProcess = null;
    }
  }

  /**
   * 检查 Chrome 是否运行中
   */
  isChromeRunning(): boolean {
    return this.chromeProcess !== null;
  }
}
