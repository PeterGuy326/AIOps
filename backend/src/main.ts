import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} [${level}]: ${message}`;
            }),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/combined.log'
        }),
      ],
    }),
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // 注册全局日志拦截器
  app.useGlobalInterceptors(new HttpLoggingInterceptor());

  app.enableCors();

  await app.listen(3000);
  console.log('🚀 AIOps Backend is running on http://localhost:3000');
  console.log('📊 Queue Status: http://localhost:3000/ai/queue/status');
}

bootstrap();
