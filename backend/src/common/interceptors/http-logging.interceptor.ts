import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * HTTP 日志拦截器
 * - 记录请求入参（body, query, params）
 * - 记录响应出参
 * - 记录响应时间
 * - 自动过滤敏感信息
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  // 敏感字段列表（不记录到日志）
  private readonly sensitiveFields = [
    'password',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',
  ];

  // 忽略的路径（不记录日志）
  private readonly ignoredPaths = [
    '/health',
    '/metrics',
    '/favicon.ico',
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, body, query, params, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const ip = headers['x-forwarded-for'] || request.ip;

    // 检查是否应该忽略此路径
    if (this.shouldIgnore(url)) {
      return next.handle();
    }

    // 生成请求 ID
    const requestId = this.generateRequestId();
    request['requestId'] = requestId;

    // 记录请求开始时间
    const startTime = Date.now();

    // 过滤敏感信息
    const safeBody = this.filterSensitiveData(body);
    const safeQuery = this.filterSensitiveData(query);
    const safeParams = this.filterSensitiveData(params);

    // 记录请求信息
    this.logger.log(
      `→ [${requestId}] ${method} ${url} | IP: ${ip}`,
    );

    // 记录详细参数（Debug 级别）
    if (Object.keys(safeBody || {}).length > 0) {
      this.logger.debug(
        `→ [${requestId}] Body: ${JSON.stringify(safeBody, null, 2)}`,
      );
    }

    if (Object.keys(safeQuery || {}).length > 0) {
      this.logger.debug(
        `→ [${requestId}] Query: ${JSON.stringify(safeQuery, null, 2)}`,
      );
    }

    if (Object.keys(safeParams || {}).length > 0) {
      this.logger.debug(
        `→ [${requestId}] Params: ${JSON.stringify(safeParams, null, 2)}`,
      );
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          // 过滤响应中的敏感信息
          const safeData = this.filterSensitiveData(data);

          // 记录响应信息
          this.logger.log(
            `← [${requestId}] ${method} ${url} | Status: ${statusCode} | Duration: ${duration}ms`,
          );

          // 记录响应数据（Debug 级别）
          if (safeData !== null && safeData !== undefined) {
            const responseStr = this.formatResponseData(safeData);
            this.logger.debug(
              `← [${requestId}] Response: ${responseStr}`,
            );
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          // 记录错误信息
          this.logger.error(
            `✗ [${requestId}] ${method} ${url} | Status: ${statusCode} | Duration: ${duration}ms | Error: ${error.message}`,
          );

          if (error.stack) {
            this.logger.debug(
              `✗ [${requestId}] Stack: ${error.stack}`,
            );
          }
        },
      }),
    );
  }

  /**
   * 检查路径是否应该被忽略
   */
  private shouldIgnore(url: string): boolean {
    return this.ignoredPaths.some((path) => url.includes(path));
  }

  /**
   * 过滤敏感数据
   */
  private filterSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.filterSensitiveData(item));
    }

    const filtered = { ...data };

    for (const key of Object.keys(filtered)) {
      const lowerKey = key.toLowerCase();

      // 检查是否是敏感字段
      if (this.sensitiveFields.some((field) => lowerKey.includes(field))) {
        filtered[key] = '***FILTERED***';
      } else if (typeof filtered[key] === 'object' && filtered[key] !== null) {
        // 递归过滤嵌套对象
        filtered[key] = this.filterSensitiveData(filtered[key]);
      }
    }

    return filtered;
  }

  /**
   * 格式化响应数据
   */
  private formatResponseData(data: any): string {
    try {
      // 限制响应数据的长度
      const MAX_LENGTH = 1000;
      const jsonStr = JSON.stringify(data, null, 2);

      if (jsonStr.length > MAX_LENGTH) {
        return jsonStr.substring(0, MAX_LENGTH) + '... (truncated)';
      }

      return jsonStr;
    } catch (error) {
      return '[无法序列化响应数据]';
    }
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
