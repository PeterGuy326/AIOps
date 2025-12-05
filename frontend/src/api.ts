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
  streaming?: boolean;
}) => api.post('/crawler/task/execute', data);

/** 执行全平台爬取 */
export const crawlerExecuteAll = (data?: { keywords?: string[]; streaming?: boolean }) =>
  api.post('/crawler/task/execute-all', data || {});

/** 触发定时爬取任务 */
export const crawlerScheduleTrigger = () =>
  api.post('/crawler/schedule/trigger');

// ==================== AI 模块 ====================

/** 生成内容 */
export const aiGenerateContent = (data: {
  rawData: any[];
  strategy: any;
  streaming?: boolean;
}) => api.post('/ai/content/generate', data);

/** 分析内容 */
export const aiAnalyzeContent = (data: { content: string; streaming?: boolean }) =>
  api.post('/ai/content/analyze', data);

/** 生成策略 */
export const aiGenerateStrategy = (data?: {
  timeframe?: number;
  platforms?: string[];
  objectives?: string[];
  streaming?: boolean;
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

/** 获取队列状态（简单版本） */
export const aiGetQueueStatus = () =>
  api.get('/ai/queue/status');

/** 获取完整监控状态（统一视图） */
export const aiGetMonitorStatus = () =>
  api.get('/ai/monitor/status');

/** 获取所有进程列表 */
export const aiGetProcessList = () =>
  api.get('/ai/process/list');

/** 获取运行中的进程 */
export const aiGetRunningProcesses = () =>
  api.get('/ai/process/running');

/** 获取指定任务的日志 */
export const aiGetProcessLogs = (taskId: string) =>
  api.get(`/ai/process/logs/${taskId}`);

/** 终止指定任务 */
export const aiKillProcess = (taskId: string) =>
  api.delete(`/ai/process/kill/${taskId}`);

/** 创建 SSE 连接获取所有任务的实时日志 */
export const createProcessLogStream = (): EventSource => {
  return new EventSource('/api/ai/process/stream');
};

/** 创建 SSE 连接获取指定任务的实时日志 */
export const createTaskLogStream = (taskId: string): EventSource => {
  return new EventSource(`/api/ai/process/stream/${taskId}`);
};

/** 获取历史任务列表 */
export const aiGetTaskHistory = (params?: {
  status?: string;
  limit?: number;
  skip?: number;
  startDate?: string;
  endDate?: string;
}) => api.get('/ai/task/history', { params });

/** 获取任务详情（含完整日志） */
export const aiGetTaskDetail = (taskId: string) =>
  api.get(`/ai/task/detail/${taskId}`);

/** 获取任务统计 */
export const aiGetTaskStats = (days?: number) =>
  api.get('/ai/task/stats', { params: { days } });

// ==================== 搜索模块 ====================

/** 获取所有爬取的内容列表（分页） */
export const searchContentList = (params?: {
  platform?: string;
  from?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => api.get('/search/content/list', { params });

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

// ==================== 浏览器登录管理模块 ====================

/** 获取所有平台列表及登录状态 */
export const browserGetPlatforms = () =>
  api.get('/browser/platform/list');

/** 获取平台详情 */
export const browserGetPlatformDetail = (platform: string) =>
  api.get(`/browser/platform/detail/${platform}`);

/** 添加自定义平台 */
export const browserAddPlatform = (data: {
  platform: string;
  platformName: string;
  checkUrl: string;
  loginUrl?: string;
  loggedInSelector?: string;
  loggedOutSelector?: string;
}) => api.post('/browser/platform/add', data);

/** 更新平台配置 */
export const browserUpdatePlatform = (platform: string, data: {
  platformName?: string;
  enabled?: boolean;
  checkConfig?: any;
  remark?: string;
}) => api.post(`/browser/platform/update/${platform}`, data);

/** 删除自定义平台 */
export const browserRemovePlatform = (platform: string) =>
  api.delete(`/browser/platform/remove/${platform}`);

/** 检测所有平台登录状态 */
export const browserCheckAllLogin = () =>
  api.post('/browser/login/check-all');

/** 检测指定平台登录状态 */
export const browserCheckLogin = (platform: string) =>
  api.post(`/browser/login/check/${platform}`);

/** 手动标记为已登录 */
export const browserMarkLoggedIn = (platform: string, username?: string) =>
  api.post(`/browser/login/mark-logged-in/${platform}`, { username });

/** 手动标记为未登录 */
export const browserMarkLoggedOut = (platform: string) =>
  api.post(`/browser/login/mark-logged-out/${platform}`);

/** 获取所有 Chrome 会话 */
export const browserGetSessions = () =>
  api.get('/browser/session/list');

/** 启动平台 Chrome 会话 */
export const browserStartSession = (platform: string, headless: boolean = true) =>
  api.post(`/browser/session/start/${platform}?headless=${headless}`);

/** 停止平台 Chrome 会话 */
export const browserStopSession = (platform: string) =>
  api.post(`/browser/session/stop/${platform}`);

/** 启动主 Chrome（用于手动登录） */
export const browserStartMainChrome = (platform?: string) =>
  api.post('/browser/chrome/start', { platform });

/** 停止主 Chrome */
export const browserStopMainChrome = () =>
  api.post('/browser/chrome/stop');

/** 获取主 Chrome 状态 */
export const browserGetMainChromeStatus = () =>
  api.get('/browser/chrome/status');

/** 获取内置平台配置 */
export const browserGetBuiltinConfigs = () =>
  api.get('/browser/config/builtin');

export default api;
