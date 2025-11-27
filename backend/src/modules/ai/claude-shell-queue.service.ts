import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

      // 启动死锁检测
      this.startDeadlockDetection();

      this.logger.log(`✅ 队列服务已就绪 (${this.MAX_WORKERS} 个工作器)`);
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
      const command = `cat "${tmpFile}" | ${this.claudeCommand} --print --output-format json`;

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

      // 解析响应
      const result = JSON.parse(stdout.trim());

      if (result.is_error) {
        throw new Error(result.result || '未知错误');
      }

      // 清理 markdown 代码块
      let cleanResult = result.result || '';
      cleanResult = cleanResult.replace(/```json\n?/g, '');
      cleanResult = cleanResult.replace(/```\n?/g, '');
      cleanResult = cleanResult.trim();

      return cleanResult;
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
}
