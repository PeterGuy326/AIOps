import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as net from 'net';
import { ClaudeTask as ClaudeTaskModel, ClaudeTaskDocument } from '../database/schemas/claude-task.schema';

const execAsync = promisify(exec);

interface ClaudeTask {
  id: string;
  prompt: string;
  createdAt: number;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
  streaming?: boolean; // 是否需要流式输出（前端实时日志）
}

export interface ProcessLog {
  timestamp: number;
  type: 'stdout' | 'stderr' | 'system';
  content: string;
}

export interface ProcessInfo {
  taskId: string;
  workerId: number;
  pid?: number;
  startTime: number;
  logs: ProcessLog[];
  status: 'running' | 'completed' | 'failed' | 'timeout';
  prompt: string;
  result?: string;
  error?: string;
}

interface WorkerStatus {
  id: number;
  busy: boolean;
  currentTask?: string;
  startTime?: number;
  taskCount: number;
  pid?: number;
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
  private readonly TASK_TIMEOUT = 300000; // 5分钟超时
  private readonly DEADLOCK_CHECK_INTERVAL = 15000; // 15秒检查一次
  private readonly MAX_RETRIES = 2; // 最大重试次数
  private readonly MAX_LOG_HISTORY = 50; // 最多保留50个任务的日志
  private readonly LOG_SAVE_INTERVAL = 5000; // 5秒保存一次日志到数据库

  // 队列和工作器
  private taskQueue: ClaudeTask[] = [];
  private workers: WorkerStatus[] = [];
  private isProcessing = false;
  private deadlockCheckTimer?: NodeJS.Timeout;
  private logSaveTimer?: NodeJS.Timeout;

  // 进程管理
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private processInfos: Map<string, ProcessInfo> = new Map();
  private logEmitter: EventEmitter = new EventEmitter();
  private pendingLogUpdates: Set<string> = new Set(); // 待保存的任务ID

  // 统计信息
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    timeouts: 0,
    retries: 0,
  };

  constructor(
    @InjectModel(ClaudeTaskModel.name) private claudeTaskModel: Model<ClaudeTaskDocument>,
  ) {}

  // Claude 命令路径（绝对路径，避免 PATH 问题）
  private claudeCommand = '/Users/huyz/.nvm/versions/node/v22.14.0/bin/claude';

  // MCP 工具可用性
  private availableMCPTools: string[] = [];
  private hasBrowserMCP = false;

  // Chrome 进程
  private chromeProcess: ReturnType<typeof import('child_process').spawn> | null = null;
  // 使用独立端口 9223，避免与用户日常使用的 Chrome（可能在 9222）冲突
  private readonly CHROME_DEBUG_PORT = 9223;
  private currentChromeUserDataDir: string | null = null; // 当前 Chrome 使用的 userDataDir

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

      // 检查 claude 命令（优先使用 which 查找，否则使用默认路径）
      try {
        const { stdout } = await execAsync('which claude', { timeout: 5000 });
        if (stdout && stdout.trim()) {
          this.claudeCommand = stdout.trim();
        }
      } catch {
        // which 失败，使用默认路径
        this.logger.debug('which claude 失败，使用默认路径');
      }

      // 验证 Claude CLI 存在
      const fs = await import('fs');
      if (!fs.existsSync(this.claudeCommand)) {
        throw new Error(`Claude CLI 不存在: ${this.claudeCommand}`);
      }
      this.logger.log(`✅ Claude 命令路径: ${this.claudeCommand}`);

      // 验证 Claude CLI 可用性
      try {
        const testResult = await execAsync(`echo "test" | ${this.claudeCommand} --print --output-format json 2>&1`, {
          timeout: 60000,
          env: {
            ...process.env,
            HOME: process.env.HOME || '/Users/huyz',
            PATH: `${require('path').dirname(this.claudeCommand)}:/usr/local/bin:/usr/bin:/bin`,
          }
        });
        
        // 解析测试结果以检测是否是认证问题
        const response = testResult.stdout.trim();
        if (response.includes('API Error: Connection error') || response.includes('Authentication required') || response.includes('Unauthorized')) {
          this.logger.warn(`⚠️ Claude CLI 测试发现认证问题`);
          this.logger.warn(`💡 建议: 请运行 'claude setup-token' 来配置认证`);
          this.logger.warn(`💡 或者检查网络连接和 Claude 订阅状态`);
        } else {
          this.logger.log(`✅ Claude CLI 测试成功`);
          this.logger.debug(`Claude CLI 响应: ${response.substring(0, 200)}...`);
        }
      } catch (testError) {
        this.logger.warn(`⚠️ Claude CLI 测试失败: ${testError.message}`);
        this.logger.warn(`💡 可能原因: 网络问题、认证过期或 Claude 服务不可用`);
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

      // 注意：不再在服务初始化时自动启动 Chrome
      // 原因：用户可能已经为特定平台启动了 Chrome（使用专属 userDataDir）
      // 自动启动会使用默认 userDataDir，导致关闭用户的 Chrome
      // 改为按需启动：当用户点击登录或检测时再启动
      if (this.hasBrowserMCP) {
        // 检查是否已有 Chrome 在运行
        if (await this.isChromeDebugReady()) {
          this.logger.log(`✅ 检测到 Chrome 已在端口 ${this.CHROME_DEBUG_PORT} 运行，跳过自动启动`);
        } else {
          this.logger.log(`ℹ️  Chrome MCP 已就绪，Chrome 将按需启动`);
        }
      }

      // 启动死锁检测
      this.startDeadlockDetection();

      // 启动日志定时保存
      this.startLogSaveTimer();

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

    // 停止日志保存定时器
    if (this.logSaveTimer) {
      clearInterval(this.logSaveTimer);
    }

    // 保存所有待保存的日志
    await this.flushPendingLogs();

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
   * @param prompt 提示词
   * @param streaming 是否流式输出（默认 true，记录完整思考过程）
   */
  async submitTask(prompt: string, streaming: boolean = true): Promise<string> {
    return new Promise((resolve, reject) => {
      const taskId = this.generateTaskId();

      const task: ClaudeTask = {
        id: taskId,
        prompt,
        createdAt: Date.now(),
        resolve,
        reject,
        streaming,
      };

      // 设置任务超时
      task.timeout = setTimeout(() => {
        this.handleTaskTimeout(task);
      }, this.TASK_TIMEOUT);

      // 加入队列
      this.taskQueue.push(task);
      this.stats.totalTasks++;

      this.logger.log(
        `📥 任务入队 [${taskId.substring(0, 8)}] (队列: ${this.taskQueue.length}, 忙碌: ${this.getBusyWorkerCount()}/${this.MAX_WORKERS}, 流式: ${streaming})`,
      );

      // 触发处理
      this.processQueue();
    });
  }

  /**
   * 提交任务并返回结果和日志（用于前端展示 AI 思考过程）
   * @param prompt 提示词
   * @param streaming 是否流式输出（默认 true，记录完整思考过程）
   * @returns { result: string, logs: ProcessLog[], taskId: string }
   */
  async submitTaskWithLogs(prompt: string, streaming: boolean = true): Promise<{
    result: string;
    logs: ProcessLog[];
    taskId: string;
  }> {
    const taskId = this.generateTaskId();

    return new Promise((resolve, reject) => {
      const task: ClaudeTask = {
        id: taskId,
        prompt,
        createdAt: Date.now(),
        resolve: (result: string) => {
          // 获取任务日志
          const processInfo = this.getProcessInfo(taskId);
          resolve({
            result,
            logs: processInfo?.logs || [],
            taskId,
          });
        },
        reject,
        streaming,
      };

      // 设置任务超时
      task.timeout = setTimeout(() => {
        this.handleTaskTimeout(task);
      }, this.TASK_TIMEOUT);

      // 加入队列
      this.taskQueue.push(task);
      this.stats.totalTasks++;

      this.logger.log(
        `📥 任务入队 [${taskId.substring(0, 8)}] (队列: ${this.taskQueue.length}, 忙碌: ${this.getBusyWorkerCount()}/${this.MAX_WORKERS}, 流式: ${streaming}, withLogs: true)`,
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

    // 初始化进程信息
    const processInfo: ProcessInfo = {
      taskId: task.id,
      workerId: worker.id,
      startTime: Date.now(),
      logs: [],
      status: 'running',
      prompt: task.prompt.substring(0, 200) + (task.prompt.length > 200 ? '...' : ''),
    };
    this.processInfos.set(task.id, processInfo);
    this.cleanupOldLogs();

    // 创建数据库记录
    await this.createTaskRecord(task.id, worker.id, task.prompt);

    this.logger.log(
      `🔧 工作器 [${worker.id}] 开始执行任务 [${task.id.substring(0, 8)}]`,
    );

    // 发送系统日志
    this.addLog(task.id, 'system', `任务开始执行 (Worker: ${worker.id})`);

    try {
      const result = await this.executeClaudeShell(task.prompt, task.id, worker, task.streaming);

      // 清除超时
      if (task.timeout) clearTimeout(task.timeout);

      // 更新进程信息
      processInfo.status = 'completed';
      processInfo.result = result;

      // 任务完成
      task.resolve(result);
      this.stats.completedTasks++;

      const duration = Date.now() - worker.startTime!;
      this.logger.log(
        `✅ 任务完成 [${task.id.substring(0, 8)}] 耗时: ${duration}ms (工作器: ${worker.id})`,
      );
      this.addLog(task.id, 'system', `任务完成，耗时: ${duration}ms`);

      // 更新数据库记录
      await this.updateTaskRecord(task.id, 'completed', result, undefined, duration);
    } catch (error) {
      // 清除超时
      if (task.timeout) clearTimeout(task.timeout);

      // 更新进程信息
      processInfo.status = 'failed';
      processInfo.error = error.message;

      // 任务失败
      task.reject(error);
      this.stats.failedTasks++;

      this.logger.error(`❌ 任务失败 [${task.id.substring(0, 8)}]:`, error.message);
      this.addLog(task.id, 'system', `任务失败: ${error.message}`);

      // 更新数据库记录
      const duration = Date.now() - worker.startTime!;
      await this.updateTaskRecord(task.id, 'failed', undefined, error.message, duration);
    } finally {
      // 清理进程
      this.activeProcesses.delete(task.id);

      // 释放工作器
      worker.busy = false;
      worker.currentTask = undefined;
      worker.startTime = undefined;
      worker.pid = undefined;

      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 执行 Claude Shell 命令
   * @param streaming 流式模式（前端实时日志）使用 stream-json，普通模式使用 json
   */
  private async executeClaudeShell(prompt: string, taskId: string, worker: WorkerStatus, streaming: boolean = false): Promise<string> {
    // 创建临时文件
    const tmpDir = '/tmp/claude-queue';
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const tmpFile = path.join(tmpDir, `prompt-${taskId}.txt`);

    try {
      // 写入 prompt
      await fs.promises.writeFile(tmpFile, prompt, 'utf-8');

      this.addLog(taskId, 'system', `Prompt 已写入临时文件`);

      if (streaming) {
        // 流式模式：实时输出日志
        return this.executeStreaming(tmpFile, taskId, worker);
      } else {
        // 普通模式：只返回结果
        return this.executeSimple(tmpFile, taskId, worker);
      }
    } catch (error) {
      // 清理临时文件
      await fs.promises.unlink(tmpFile).catch(() => {});
      throw error;
    }
  }

  /**
   * 普通模式执行（只关心结果，更快）
   */
  private executeSimple(tmpFile: string, taskId: string, worker: WorkerStatus): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      // 使用 json 格式，简单直接
      // 确保传递完整的环境变量，特别是 PATH、HOME、代理设置等
      const claudeDir = path.dirname(this.claudeCommand);
      const child = spawn('sh', [
        '-c',
        `cat "${tmpFile}" | ${this.claudeCommand} --print --output-format json --dangerously-skip-permissions`
      ], {
        env: {
          ...process.env,
          CLAUDE_SESSION_ID: taskId,
          HOME: process.env.HOME || '/Users/huyz',
          PATH: `${claudeDir}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
        },
      });

      // 保存进程引用
      this.activeProcesses.set(taskId, child);
      worker.pid = child.pid;

      const processInfo = this.processInfos.get(taskId);
      if (processInfo) {
        processInfo.pid = child.pid;
      }

      this.addLog(taskId, 'system', `进程已启动 (PID: ${child.pid}, 模式: 普通)`);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        this.addLog(taskId, 'system', `进程启动失败: ${err.message}`);
        reject(new Error(`进程启动失败: ${err.message}`));
      });

      child.on('close', (code) => {
        this.addLog(taskId, 'system', `进程退出 (code: ${code})`);

        // 清理临时文件
        fs.promises.unlink(tmpFile).catch(() => {});

        if (code !== 0) {
          const errorDetail = stderr || stdout || '无输出';
          this.logger.error(`Claude CLI 失败 [${taskId.substring(0, 8)}]: code=${code}`);
          reject(new Error(`Claude CLI 失败 (code: ${code}): ${errorDetail.substring(0, 200)}`));
          return;
        }

        try {
          const cliResponse = JSON.parse(stdout.trim());
          if (cliResponse.is_error) {
            reject(new Error(cliResponse.result || '未知错误'));
            return;
          }
          resolve(this.extractJSONFromResponse(cliResponse.result || ''));
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });

      // 设置超时
      setTimeout(() => {
        if (this.activeProcesses.has(taskId)) {
          this.addLog(taskId, 'system', '进程超时，强制终止');
          child.kill('SIGTERM');
          setTimeout(() => {
            if (this.activeProcesses.has(taskId)) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }
      }, this.TASK_TIMEOUT - 5000);
    });
  }

  /**
   * 流式模式执行（实时输出日志到前端）
   */
  private executeStreaming(tmpFile: string, taskId: string, worker: WorkerStatus): Promise<string> {
    return new Promise((resolve, reject) => {
      let finalResult = '';
      let stderr = '';
      let buffer = '';

      // 使用 stream-json 格式，需要 --verbose
      // 确保传递完整的环境变量
      const claudeDir = path.dirname(this.claudeCommand);
      const child = spawn('sh', [
        '-c',
        `cat "${tmpFile}" | ${this.claudeCommand} --print --verbose --output-format stream-json --dangerously-skip-permissions`
      ], {
        env: {
          ...process.env,
          CLAUDE_SESSION_ID: taskId,
          HOME: process.env.HOME || '/Users/huyz',
          PATH: `${claudeDir}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
        },
      });

      // 保存进程引用
      this.activeProcesses.set(taskId, child);
      worker.pid = child.pid;

      const processInfo = this.processInfos.get(taskId);
      if (processInfo) {
        processInfo.pid = child.pid;
      }

      this.addLog(taskId, 'system', `进程已启动 (PID: ${child.pid}, 模式: 流式)`);

      // 流式读取 stdout，解析 stream-json 格式
      child.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            this.handleStreamEvent(taskId, event);

            if (event.type === 'result') {
              finalResult = event.result || '';
            }
          } catch {
            this.addLog(taskId, 'stdout', line);
          }
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        this.addLog(taskId, 'system', `进程启动失败: ${err.message}`);
        reject(new Error(`进程启动失败: ${err.message}`));
      });

      child.on('close', (code) => {
        // 处理最后的 buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            this.handleStreamEvent(taskId, event);
            if (event.type === 'result') {
              finalResult = event.result || '';
            }
          } catch {
            this.addLog(taskId, 'stdout', buffer);
          }
        }

        this.addLog(taskId, 'system', `进程退出 (code: ${code})`);

        // 清理临时文件
        fs.promises.unlink(tmpFile).catch(() => {});

        if (code !== 0) {
          const errorDetail = stderr || finalResult || '无输出';
          this.logger.error(`Claude CLI 失败 [${taskId.substring(0, 8)}]: code=${code}`);
          reject(new Error(`Claude CLI 失败 (code: ${code}): ${errorDetail.substring(0, 200)}`));
          return;
        }

        resolve(this.extractJSONFromResponse(finalResult));
      });

      // 设置超时
      setTimeout(() => {
        if (this.activeProcesses.has(taskId)) {
          this.addLog(taskId, 'system', '进程超时，强制终止');
          child.kill('SIGTERM');
          setTimeout(() => {
            if (this.activeProcesses.has(taskId)) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }
      }, this.TASK_TIMEOUT - 5000);
    });
  }

  /**
   * 处理 stream-json 事件
   * Claude CLI stream-json 格式事件类型：
   * - init: 初始化信息
   * - assistant: AI 正在输出文本
   * - content_block_start: 内容块开始
   * - content_block_delta: 内容块增量（思考过程）
   * - content_block_stop: 内容块结束
   * - tool_use: AI 调用工具
   * - tool_result: 工具返回结果
   * - result: 最终结果
   * - error: 错误信息
   */
  private handleStreamEvent(taskId: string, event: any) {
    const { type } = event;

    switch (type) {
      case 'init':
        // 初始化信息
        this.addLog(taskId, 'system', `[初始化] 会话ID: ${event.session_id || 'N/A'}`);
        break;

      case 'system':
        // 系统消息
        if (event.message) {
          this.addLog(taskId, 'system', `[系统] ${event.message}`);
        }
        break;

      case 'assistant':
        // AI 完整消息
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text' && block.text) {
              this.addLog(taskId, 'stdout', `[AI 输出]\n${block.text}`);
            } else if (block.type === 'thinking' && block.thinking) {
              this.addLog(taskId, 'stdout', `[AI 思考]\n${block.thinking}`);
            } else if (block.type === 'tool_use') {
              this.addLog(taskId, 'system', `[工具调用] ${block.name}`);
            }
          }
        }
        break;

      case 'content_block_start':
        // 内容块开始
        if (event.content_block?.type === 'thinking') {
          this.addLog(taskId, 'system', `[开始思考...]`);
        } else if (event.content_block?.type === 'text') {
          this.addLog(taskId, 'system', `[开始输出...]`);
        } else if (event.content_block?.type === 'tool_use') {
          this.addLog(taskId, 'system', `[准备调用工具] ${event.content_block.name || ''}`);
        }
        break;

      case 'content_block_delta':
        // 流式文本块（思考过程的核心！）
        if (event.delta?.type === 'thinking_delta' && event.delta?.thinking) {
          // 思考过程
          this.addLog(taskId, 'stdout', `[思考] ${event.delta.thinking}`);
        } else if (event.delta?.type === 'text_delta' && event.delta?.text) {
          // 文本输出
          this.addLog(taskId, 'stdout', `[输出] ${event.delta.text}`);
        } else if (event.delta?.type === 'input_json_delta' && event.delta?.partial_json) {
          // 工具输入参数（增量）
          this.addLog(taskId, 'stdout', `[工具参数] ${event.delta.partial_json}`);
        } else if (event.delta?.text) {
          // 通用文本
          this.addLog(taskId, 'stdout', event.delta.text);
        }
        break;

      case 'content_block_stop':
        // 内容块结束
        this.addLog(taskId, 'system', `[内容块结束]`);
        break;

      case 'tool_use':
        // AI 调用工具
        const toolName = event.name || event.tool_name || 'unknown';
        this.addLog(taskId, 'system', `[工具调用] ${toolName}`);
        if (event.input) {
          const inputStr = typeof event.input === 'string'
            ? event.input
            : JSON.stringify(event.input, null, 2);
          // 记录完整工具输入（最多 2000 字符）
          this.addLog(taskId, 'stdout', `[工具输入]\n${inputStr.substring(0, 2000)}${inputStr.length > 2000 ? '...(truncated)' : ''}`);
        }
        break;

      case 'tool_result':
        // 工具返回结果
        const resultContent = event.content || event.result || '';
        const resultStr = typeof resultContent === 'string'
          ? resultContent
          : JSON.stringify(resultContent, null, 2);
        this.addLog(taskId, 'system', `[工具结果] 长度: ${resultStr.length} 字符`);
        // 记录工具结果（最多 1000 字符，避免日志过大）
        if (resultStr.length > 0) {
          this.addLog(taskId, 'stdout', `[工具返回]\n${resultStr.substring(0, 1000)}${resultStr.length > 1000 ? '...(truncated)' : ''}`);
        }
        break;

      case 'result':
        // 最终结果
        this.addLog(taskId, 'system', `[完成] 任务执行完成`);
        if (event.result) {
          const resultPreview = typeof event.result === 'string'
            ? event.result.substring(0, 500)
            : JSON.stringify(event.result).substring(0, 500);
          this.addLog(taskId, 'stdout', `[最终结果预览]\n${resultPreview}${event.result.length > 500 ? '...' : ''}`);
        }
        break;

      case 'error':
        // 错误信息
        const errorMsg = event.error?.message || event.message || JSON.stringify(event);
        this.addLog(taskId, 'stderr', `[错误] ${errorMsg}`);
        break;

      case 'message_start':
        // 消息开始
        this.addLog(taskId, 'system', `[消息开始] model: ${event.message?.model || 'unknown'}`);
        break;

      case 'message_delta':
        // 消息增量
        if (event.delta?.stop_reason) {
          this.addLog(taskId, 'system', `[消息结束] 原因: ${event.delta.stop_reason}`);
        }
        if (event.usage) {
          this.addLog(taskId, 'system', `[Token 使用] 输入: ${event.usage.input_tokens || 0}, 输出: ${event.usage.output_tokens || 0}`);
        }
        break;

      case 'message_stop':
        // 消息停止
        this.addLog(taskId, 'system', `[消息完成]`);
        break;

      default:
        // 其他事件类型，记录原始数据便于调试
        if (type) {
          this.addLog(taskId, 'system', `[${type}] ${JSON.stringify(event).substring(0, 300)}`);
        }
    }
  }

  /**
   * 添加日志并通知订阅者
   */
  private addLog(taskId: string, type: ProcessLog['type'], content: string) {
    const processInfo = this.processInfos.get(taskId);
    if (!processInfo) return;

    const log: ProcessLog = {
      timestamp: Date.now(),
      type,
      content,
    };

    processInfo.logs.push(log);

    // 标记待保存到数据库
    this.pendingLogUpdates.add(taskId);

    // 发送事件
    this.logEmitter.emit('log', { taskId, log });
    this.logEmitter.emit(`log:${taskId}`, log);
  }

  /**
   * 清理旧日志
   */
  private cleanupOldLogs() {
    if (this.processInfos.size > this.MAX_LOG_HISTORY) {
      // 按时间排序，删除最旧的
      const entries = Array.from(this.processInfos.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime);

      const toDelete = entries.slice(0, entries.length - this.MAX_LOG_HISTORY);
      toDelete.forEach(([key]) => this.processInfos.delete(key));
    }
  }

  /**
   * 获取日志 EventEmitter（供 SSE 使用）
   */
  getLogEmitter(): EventEmitter {
    return this.logEmitter;
  }

  /**
   * 获取进程信息
   */
  getProcessInfo(taskId: string): ProcessInfo | undefined {
    return this.processInfos.get(taskId);
  }

  /**
   * 获取所有活跃进程信息
   */
  getAllProcessInfos(): ProcessInfo[] {
    return Array.from(this.processInfos.values())
      .sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * 获取正在运行的进程
   */
  getRunningProcesses(): ProcessInfo[] {
    return Array.from(this.processInfos.values())
      .filter(p => p.status === 'running');
  }

  /**
   * 终止指定任务
   */
  killTask(taskId: string): boolean {
    const process = this.activeProcesses.get(taskId);
    if (process) {
      this.addLog(taskId, 'system', '用户手动终止任务');
      process.kill('SIGTERM');
      return true;
    }
    return false;
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
        pid: w.pid,
      })),
      stats: this.stats,
    };
  }

  /**
   * 获取完整的监控状态（统一视图）
   * 合并 Worker 状态、队列状态、进程信息
   */
  getMonitorStatus() {
    const runningProcesses = this.getRunningProcesses();
    const recentProcesses = this.getAllProcessInfos().slice(0, 20);

    return {
      // 服务状态
      service: {
        ready: this.isReady(),
        hasBrowserMCP: this.hasBrowserMCP,
        chromeRunning: this.isChromeRunning(),
        availableMCPTools: this.availableMCPTools,
      },

      // 队列状态
      queue: {
        length: this.taskQueue.length,
        pendingTasks: this.taskQueue.map(t => ({
          id: t.id.substring(0, 8),
          createdAt: t.createdAt,
          waitTime: Date.now() - t.createdAt,
          streaming: t.streaming,
        })),
      },

      // Worker 状态（实时）
      workers: this.workers.map((w) => {
        const processInfo = w.currentTask ? this.processInfos.get(w.currentTask) : undefined;
        return {
          id: w.id,
          busy: w.busy,
          currentTask: w.currentTask ? {
            taskId: w.currentTask.substring(0, 8),
            fullTaskId: w.currentTask,
            pid: w.pid,
            startTime: w.startTime,
            duration: w.startTime ? Date.now() - w.startTime : 0,
            prompt: processInfo?.prompt || '',
            logCount: processInfo?.logs.length || 0,
          } : null,
          totalTaskCount: w.taskCount,
        };
      }),

      // 正在运行的任务
      runningTasks: runningProcesses.map(p => ({
        taskId: p.taskId,
        workerId: p.workerId,
        pid: p.pid,
        startTime: p.startTime,
        duration: Date.now() - p.startTime,
        prompt: p.prompt,
        logCount: p.logs.length,
      })),

      // 最近的任务
      recentTasks: recentProcesses.map(p => ({
        taskId: p.taskId,
        workerId: p.workerId,
        pid: p.pid,
        status: p.status,
        startTime: p.startTime,
        duration: p.status === 'running' ? Date.now() - p.startTime : undefined,
        prompt: p.prompt,
        logCount: p.logs.length,
        result: p.result ? p.result.substring(0, 100) + '...' : undefined,
        error: p.error,
      })),

      // 统计信息
      stats: {
        ...this.stats,
        busyWorkers: this.getBusyWorkerCount(),
        idleWorkers: this.MAX_WORKERS - this.getBusyWorkerCount(),
      },
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
   * 获取用户真实的 Chrome 配置目录
   * 这样可以保留用户的登录态、Cookie、书签等
   */
  private getUserChromeDataDir(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    if (platform === 'darwin') {
      // macOS
      return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
    } else if (platform === 'linux') {
      // Linux
      return path.join(homeDir, '.config', 'google-chrome');
    } else if (platform === 'win32') {
      // Windows
      return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
    }

    // 默认返回临时目录（降级方案）
    return path.join('/tmp', 'chrome-aiops-debug');
  }

  /**
   * 获取 AIOps 专用的 Chrome 配置目录
   * 使用独立目录，避免与用户日常使用的 Chrome 冲突
   */
  private getAIOpsChomeDataDir(): string {
    return '/tmp/chrome-aiops-profile';
  }

  /**
   * 同步 Cookie 从用户 Chrome 到 AIOps Chrome
   * 这样爬虫可以使用用户的登录态，同时不锁定用户的 Chrome
   */
  private async syncCookiesFromUserChrome(): Promise<void> {
    const userDir = this.getUserChromeDataDir();
    const aiopsDir = this.getAIOpsChomeDataDir();

    // 确保 AIOps 目录存在
    await fs.promises.mkdir(path.join(aiopsDir, 'Default', 'Network'), { recursive: true });

    // Cookie 文件路径
    const userCookiePaths = [
      path.join(userDir, 'Default', 'Cookies'),
      path.join(userDir, 'Default', 'Network', 'Cookies'),
    ];

    const aiopsCookiePath = path.join(aiopsDir, 'Default', 'Network', 'Cookies');

    for (const userCookiePath of userCookiePaths) {
      if (fs.existsSync(userCookiePath)) {
        try {
          // 复制 Cookie 文件
          await fs.promises.copyFile(userCookiePath, aiopsCookiePath);
          this.logger.log(`✅ 已同步 Cookie: ${userCookiePath} → ${aiopsCookiePath}`);
          return;
        } catch (error) {
          this.logger.warn(`Cookie 同步失败: ${error.message}`);
        }
      }
    }

    this.logger.warn('⚠️ 未找到用户 Chrome Cookie 文件，爬虫可能无法使用登录态');
  }

  /**
   * 启动 Chrome（开启远程调试）
   *
   * 策略（优化后）：
   * 1. 使用独立的 AIOps 配置目录，避免与用户 Chrome 冲突
   * 2. 启动前同步用户 Chrome 的 Cookie，保持登录态
   * 3. 如果指定了 userDataDir，则使用指定的目录
   *
   * @param userDataDir 可选的用户数据目录，默认使用 AIOps 专用目录
   * @param forceRestart 是否强制重启（当需要切换 userDataDir 时）
   * @param headless 是否使用无头模式（默认 false，显示浏览器窗口方便调试）
   * @param startUrl 启动后打开的 URL（可选）
   */
  async startChrome(
    userDataDir?: string,
    forceRestart: boolean = false,
    headless: boolean = false,
    startUrl?: string,
  ): Promise<boolean> {
    // 默认使用 AIOps 专用目录（避免与用户 Chrome 冲突）
    const targetUserDataDir = userDataDir || this.getAIOpsChomeDataDir();

    // 如果使用 AIOps 专用目录，先同步 Cookie
    if (targetUserDataDir === this.getAIOpsChomeDataDir()) {
      await this.syncCookiesFromUserChrome();
    }

    // 检查是否需要重启 Chrome（userDataDir 变化）
    if (this.chromeProcess && this.currentChromeUserDataDir !== targetUserDataDir) {
      this.logger.log(`🔄 Chrome userDataDir 变化，需要重启: ${this.currentChromeUserDataDir} → ${targetUserDataDir}`);
      forceRestart = true;
    }

    // 强制重启时先关闭现有 Chrome
    if (forceRestart && this.chromeProcess) {
      await this.stopChrome();
    }

    // 检查是否已经有 Chrome 在调试端口运行
    if (await this.isChromeDebugReady()) {
      // 如果 userDataDir 匹配，直接使用现有 Chrome
      if (this.currentChromeUserDataDir === targetUserDataDir) {
        this.logger.log(`✅ Chrome 调试端口 ${this.CHROME_DEBUG_PORT} 已就绪 (userDataDir: ${targetUserDataDir})`);
        // 如果指定了 startUrl，导航到该页面
        if (startUrl) {
          this.logger.log(`🌐 导航到: ${startUrl}`);
          await this.navigateToUrl(startUrl);
        }
        return true;
      }

      // currentChromeUserDataDir 为 null 说明这个 Chrome 不是我们管理的
      // 可能是用户通过登录管理启动的，尝试检测它的 userDataDir
      if (this.currentChromeUserDataDir === null) {
        // 尝试从进程参数中获取 userDataDir
        const detectedDir = await this.detectChromeUserDataDir();
        if (detectedDir === targetUserDataDir) {
          this.logger.log(`✅ 检测到现有 Chrome 使用目标 userDataDir: ${targetUserDataDir}`);
          this.currentChromeUserDataDir = targetUserDataDir;
          // 如果指定了 startUrl，导航到该页面
          if (startUrl) {
            this.logger.log(`🌐 导航到: ${startUrl}`);
            await this.navigateToUrl(startUrl);
          }
          return true;
        }
        this.logger.warn(`⚠️ Chrome 已在端口 ${this.CHROME_DEBUG_PORT} 运行，检测到 userDataDir: ${detectedDir || 'unknown'}`);
      } else {
        this.logger.warn(`⚠️ Chrome userDataDir 不匹配: ${this.currentChromeUserDataDir} != ${targetUserDataDir}`);
      }

      // userDataDir 不匹配，需要关闭并重启
      this.logger.log(`🔄 关闭现有 Chrome 并用新的 userDataDir 重启`);
      await this.stopChrome();
    }

    const chromePath = this.getChromePath();
    if (!chromePath) {
      this.logger.error('❌ 未找到 Chrome 浏览器');
      return false;
    }

    this.logger.log(`🚀 启动 Chrome: ${chromePath} (userDataDir: ${targetUserDataDir}, headless: ${headless}, url: ${startUrl || 'none'})`);

    // 确保用户数据目录存在
    await fs.promises.mkdir(targetUserDataDir, { recursive: true });

    try {
      // 构建 Chrome 启动参数 - 保留用户配置，只添加必要的调试选项
      const chromeArgs = [
        `--remote-debugging-port=${this.CHROME_DEBUG_PORT}`,
        `--user-data-dir=${targetUserDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        // 注意：不禁用 extensions，保留用户的扩展（可能包含登录相关插件）
        // 注意：不禁用 sync，保留用户的同步数据
        // 注意：不禁用 popup，某些登录流程需要弹窗
      ];

      // 根据 headless 参数决定是否启用无头模式
      if (headless) {
        chromeArgs.push('--headless=new');
      }

      // 添加启动 URL（如果指定）
      if (startUrl) {
        chromeArgs.push(startUrl);
      }

      // 启动 Chrome
      this.chromeProcess = spawn(chromePath, chromeArgs, {
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
          this.currentChromeUserDataDir = targetUserDataDir; // 记录当前使用的 userDataDir
          this.logger.log(`✅ Chrome 已启动并就绪 (端口: ${this.CHROME_DEBUG_PORT})`);
          this.logger.log(`✅ 使用用户配置目录: ${targetUserDataDir}`);
          this.logger.log(`✅ 已保留用户登录态、Cookie 和扩展`);
          return true;
        }
      }

      this.logger.error('❌ Chrome 启动超时');
      this.logger.log('💡 可能原因: Chrome 已在运行但未开启调试端口，或配置目录被锁定');
      this.logger.log('💡 解决方案: 关闭所有 Chrome 窗口后重试');
      this.currentChromeUserDataDir = null;
      return false;
    } catch (error) {
      this.logger.error('❌ Chrome 启动失败:', error.message);
      this.logger.log('💡 如果提示配置目录被锁定，请关闭所有 Chrome 窗口后重试');
      this.currentChromeUserDataDir = null;
      return false;
    }
  }

  /**
   * 关闭 Chrome
   * 支持关闭我们管理的进程，也支持关闭外部启动的 Chrome（通过端口查找）
   */
  async stopChrome(): Promise<void> {
    if (this.chromeProcess) {
      this.logger.log('🛑 关闭 Chrome (内部进程)');
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
      this.currentChromeUserDataDir = null;
    } else if (await this.isChromeDebugReady()) {
      // 没有内部进程引用，但端口上有 Chrome 运行
      // 尝试通过进程查找并关闭
      this.logger.log('🛑 关闭 Chrome (外部进程)');
      try {
        // 查找并杀死监听指定端口的 Chrome 主进程
        await execAsync(
          `ps aux | grep -i "chrome" | grep -- "--remote-debugging-port=${this.CHROME_DEBUG_PORT}" | grep -v "Helper" | awk '{print $2}' | xargs kill 2>/dev/null || true`,
          { timeout: 5000 }
        );
        // 等待进程退出
        await new Promise(r => setTimeout(r, 1000));
        this.currentChromeUserDataDir = null;
      } catch (error) {
        this.logger.debug(`关闭外部 Chrome 失败: ${error.message}`);
      }
    }
  }

  /**
   * 通过 Chrome DevTools Protocol 导航到指定 URL
   * 当 Chrome 已经在运行时，使用此方法打开新页面
   */
  async navigateToUrl(url: string): Promise<boolean> {
    if (!await this.isChromeDebugReady()) {
      this.logger.error('Chrome 未运行，无法导航');
      return false;
    }

    try {
      const http = await import('http');

      // 1. 获取当前页面列表
      const pagesJson = await new Promise<string>((resolve, reject) => {
        http.get(`http://127.0.0.1:${this.CHROME_DEBUG_PORT}/json`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
          res.on('error', reject);
        }).on('error', reject);
      });

      const pages = JSON.parse(pagesJson);

      if (pages.length === 0) {
        // 没有页面，创建新页面（使用 PUT 方法，Chrome 115+ 要求）
        await new Promise<string>((resolve, reject) => {
          const options = {
            hostname: '127.0.0.1',
            port: this.CHROME_DEBUG_PORT,
            path: `/json/new?${encodeURIComponent(url)}`,
            method: 'PUT',
          };
          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
          });
          req.on('error', reject);
          req.end();
        });
        this.logger.log(`✅ 已在新标签页打开: ${url}`);
      } else {
        // 有页面，在第一个页面中导航
        const pageId = pages[0].id;
        const WebSocket = (await import('ws')).default;

        const ws = new WebSocket(pages[0].webSocketDebuggerUrl);

        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            // 发送 Page.navigate 命令
            ws.send(JSON.stringify({
              id: 1,
              method: 'Page.navigate',
              params: { url },
            }));
          });

          ws.on('message', (data: Buffer) => {
            const response = JSON.parse(data.toString());
            if (response.id === 1) {
              ws.close();
              resolve();
            }
          });

          ws.on('error', reject);

          // 超时处理
          setTimeout(() => {
            ws.close();
            reject(new Error('导航超时'));
          }, 10000);
        });

        this.logger.log(`✅ 已导航到: ${url}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`导航失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取当前 Chrome 使用的 userDataDir
   */
  getCurrentChromeUserDataDir(): string | null {
    return this.currentChromeUserDataDir;
  }

  /**
   * 检测当前运行的 Chrome 使用的 userDataDir
   * 通过查找 Chrome 进程的命令行参数来获取
   */
  private async detectChromeUserDataDir(): Promise<string | null> {
    try {
      // 查找监听指定端口的 Chrome 进程
      const { stdout } = await execAsync(
        `ps aux | grep -i chrome | grep -- "--remote-debugging-port=${this.CHROME_DEBUG_PORT}" | grep -- "--user-data-dir=" | head -1`,
        { timeout: 5000 }
      );

      if (!stdout.trim()) {
        return null;
      }

      // 从命令行参数中提取 user-data-dir
      const match = stdout.match(/--user-data-dir=([^\s]+)/);
      if (match && match[1]) {
        return match[1];
      }

      return null;
    } catch (error) {
      this.logger.debug(`检测 Chrome userDataDir 失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 检查 Chrome 是否运行中
   */
  isChromeRunning(): boolean {
    return this.chromeProcess !== null;
  }

  // ==================== 数据库操作 ====================

  /**
   * 启动日志定时保存
   */
  private startLogSaveTimer() {
    this.logSaveTimer = setInterval(() => {
      this.flushPendingLogs().catch(err => {
        this.logger.error('保存日志失败:', err.message);
      });
    }, this.LOG_SAVE_INTERVAL);
  }

  /**
   * 保存所有待保存的日志到数据库
   */
  private async flushPendingLogs() {
    if (this.pendingLogUpdates.size === 0) return;

    const taskIds = Array.from(this.pendingLogUpdates);
    this.pendingLogUpdates.clear();

    for (const taskId of taskIds) {
      const processInfo = this.processInfos.get(taskId);
      if (!processInfo) continue;

      try {
        await this.claudeTaskModel.updateOne(
          { taskId },
          {
            $set: {
              logs: processInfo.logs,
              status: processInfo.status,
            },
          },
        );
      } catch (error) {
        this.logger.error(`保存任务 ${taskId.substring(0, 8)} 日志失败:`, error.message);
        // 重新加入待保存队列
        this.pendingLogUpdates.add(taskId);
      }
    }
  }

  /**
   * 创建任务记录
   */
  private async createTaskRecord(taskId: string, workerId: number, prompt: string) {
    try {
      await this.claudeTaskModel.create({
        taskId,
        workerId,
        status: 'running',
        startTime: Date.now(),
        prompt,
        logs: [],
      });
    } catch (error) {
      this.logger.error(`创建任务记录失败 [${taskId.substring(0, 8)}]:`, error.message);
    }
  }

  /**
   * 更新任务记录
   */
  private async updateTaskRecord(
    taskId: string,
    status: 'completed' | 'failed' | 'timeout',
    result?: string,
    error?: string,
    duration?: number,
  ) {
    try {
      const processInfo = this.processInfos.get(taskId);

      await this.claudeTaskModel.updateOne(
        { taskId },
        {
          $set: {
            status,
            endTime: Date.now(),
            duration,
            result: result?.substring(0, 10000), // 限制结果长度
            error,
            logs: processInfo?.logs || [],
          },
        },
      );
    } catch (err) {
      this.logger.error(`更新任务记录失败 [${taskId.substring(0, 8)}]:`, err.message);
    }
  }

  /**
   * 查询历史任务
   */
  async getTaskHistory(options: {
    status?: string;
    limit?: number;
    skip?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const { status, limit = 50, skip = 0, startDate, endDate } = options;

    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = startDate.getTime();
      if (endDate) query.startTime.$lte = endDate.getTime();
    }

    const [tasks, total] = await Promise.all([
      this.claudeTaskModel
        .find(query)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit)
        .select('-logs') // 列表不返回日志，减少数据量
        .lean(),
      this.claudeTaskModel.countDocuments(query),
    ]);

    return { tasks, total, limit, skip };
  }

  /**
   * 获取单个任务详情（包含日志）
   */
  async getTaskDetail(taskId: string) {
    return this.claudeTaskModel.findOne({ taskId }).lean();
  }

  /**
   * 获取任务统计
   */
  async getTaskStats(days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.claudeTaskModel.aggregate([
      {
        $match: {
          startTime: { $gte: startDate.getTime() },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
        },
      },
    ]);

    const result = {
      total: 0,
      completed: 0,
      failed: 0,
      timeout: 0,
      running: 0,
      avgDuration: 0,
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const stat of stats) {
      result[stat._id as keyof typeof result] = stat.count;
      result.total += stat.count;
      if (stat.avgDuration) {
        totalDuration += stat.avgDuration * stat.count;
        durationCount += stat.count;
      }
    }

    result.avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    return result;
  }
}
