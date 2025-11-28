import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60秒超时（AI接口可能较慢）
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// ==================== 爬虫模块 ====================

/** 获取支持的平台列表 */
export const crawlerGetPlatforms = () =>
  api.get('/crawler/platform/list');

/** 添加爬取任务到队列 */
export const crawlerAddJob = (data: {
  platform: string;
  keyword?: string;
  priority?: number;
}) => api.post('/crawler/job/add', data);

/** 立即执行单平台爬取 */
export const crawlerExecuteTask = (data: {
  platform: string;
  keyword?: string;
}) => api.post('/crawler/task/execute', data);

/** 执行全平台爬取 */
export const crawlerExecuteAll = (data?: { keywords?: string[] }) =>
  api.post('/crawler/task/execute-all', data || {});

/** 触发定时爬取任务 */
export const crawlerScheduleTrigger = () =>
  api.post('/crawler/schedule/trigger');

// ==================== AI 模块 ====================

/** 生成内容 */
export const aiGenerateContent = (data: {
  rawData: any[];
  strategy: any;
}) => api.post('/ai/content/generate', data);

/** 分析内容 */
export const aiAnalyzeContent = (data: { content: string }) =>
  api.post('/ai/content/analyze', data);

/** 生成策略 */
export const aiGenerateStrategy = (data?: {
  timeframe?: number;
  platforms?: string[];
  objectives?: string[];
}) => api.post('/ai/strategy/generate', data || {});

/** 优化策略 */
export const aiOptimizeStrategy = (data: {
  currentStrategy: any;
  performanceData: any;
  objectives: string[];
}) => api.post('/ai/strategy/optimize', data);

/** 生成关键词 */
export const aiGenerateKeywords = (data?: {
  baseKeywords?: string[];
  targetCount?: number;
  context?: string;
}) => api.post('/ai/keyword/generate', data || {});

/** 预测趋势 */
export const aiPredictTrends = (data?: {
  timeframe?: number;
  category?: string;
  keywords?: string[];
}) => api.post('/ai/trend/predict', data || {});

/** 获取队列状态 */
export const aiGetQueueStatus = () =>
  api.get('/ai/queue/status');

// ==================== 搜索模块 ====================

/** 搜索内容 */
export const searchContent = (params: {
  q: string;
  platform?: string;
  tags?: string;
  from?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => api.get('/search/content/query', { params });

/** 查找相似内容 */
export const searchSimilar = (id: string, size?: number) =>
  api.get(`/search/content/similar/${id}`, { params: { size } });

/** 获取热门标签 */
export const searchPopularTags = (size?: number) =>
  api.get('/search/tag/popular', { params: { size } });

/** 获取热门内容 */
export const searchTrending = (days?: number, size?: number) =>
  api.get('/search/content/trending', { params: { days, size } });

// ==================== 分析模块 ====================

/** 获取性能分析统计 */
export const analyticsGetPerformance = (days?: number) =>
  api.get('/analytics/stats/performance', { params: { days } });

/** 获取每日统计数据 */
export const analyticsGetDailyStats = (days?: number) =>
  api.get('/analytics/stats/daily', { params: { days } });

/** 获取热门话题 */
export const analyticsGetTrending = (days?: number) =>
  api.get('/analytics/content/trending', { params: { days } });

/** 获取内容性能详情 */
export const analyticsGetContentDetail = (id: number) =>
  api.get('/analytics/content/detail', { params: { id } });

// ==================== 发布模块 ====================

/** 添加发布任务到队列 */
export const publisherAddJob = (content: any) =>
  api.post('/publisher/job/add', content);

/** 立即发布内容 */
export const publisherPublishNow = (content: any) =>
  api.post('/publisher/content/publish', content);

/** 批量发布内容 */
export const publisherPublishBatch = (limit?: number) =>
  api.post('/publisher/content/publish-batch', { limit });

/** 获取待发布内容列表 */
export const publisherGetPending = () =>
  api.get('/publisher/content/pending');

// ==================== CLI 历史模块 ====================

/** 保存命令历史 */
export const cliSaveHistory = (data: { question: string; answer: string }) =>
  api.post('/cli/history/save', data);

/** 获取历史记录列表 */
export const cliGetHistory = (limit?: number, offset?: number) =>
  api.get('/cli/history/list', { params: { limit, offset } });

/** 搜索历史记录 */
export const cliSearchHistory = (q: string) =>
  api.get('/cli/history/search', { params: { q } });

export default api;
