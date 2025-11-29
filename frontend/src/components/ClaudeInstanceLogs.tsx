import React, { useEffect, useState, useRef } from 'react';
import { Card, Tag, Space, Button, Empty, Tooltip, Badge, Row, Col, Statistic } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  ClearOutlined,
  ExpandOutlined,
  CompressOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { createProcessLogStream, aiGetProcessList, aiKillProcess, aiGetTaskStats } from '../api';

interface ProcessLog {
  timestamp: number;
  type: 'stdout' | 'stderr' | 'system';
  content: string;
}

interface ProcessInfo {
  taskId: string;
  workerId: number;
  pid?: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startTime: number;
  duration?: number;
  prompt: string;
  logCount: number;
  error?: string;
}

interface LogEntry {
  taskId: string;
  log: ProcessLog;
}

interface Props {
  onViewHistory?: () => void;
}

const ClaudeInstanceLogs: React.FC<Props> = ({ onViewHistory }) => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [logs, setLogs] = useState<Map<string, ProcessLog[]>>(new Map());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const logContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);

  // 加载进程列表
  const loadProcesses = async () => {
    try {
      const res: any = await aiGetProcessList();
      setProcesses(res.processes || []);
    } catch (error) {
      console.error('加载进程列表失败:', error);
    }
  };

  // 加载统计
  const loadStats = async () => {
    try {
      const res: any = await aiGetTaskStats(1); // 今日统计
      setStats(res.stats);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 建立 SSE 连接
  useEffect(() => {
    loadProcesses();
    loadStats();

    const es = createProcessLogStream();
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'log') {
          const { taskId, log } = data as LogEntry;

          setLogs((prev) => {
            const newLogs = new Map(prev);
            const taskLogs = newLogs.get(taskId) || [];
            newLogs.set(taskId, [...taskLogs, log]);
            return newLogs;
          });

          // 自动滚动到底部
          setTimeout(() => {
            const container = logContainerRefs.current.get(taskId);
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          }, 10);

          // 更新进程状态
          if (log.type === 'system' && (log.content.includes('任务完成') || log.content.includes('任务失败'))) {
            loadProcesses();
            loadStats();
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    // 定期刷新进程列表
    const interval = setInterval(() => {
      loadProcesses();
      loadStats();
    }, 5000);

    return () => {
      es.close();
      clearInterval(interval);
    };
  }, []);

  // 终止任务
  const handleKillTask = async (taskId: string) => {
    try {
      await aiKillProcess(taskId);
      loadProcesses();
    } catch (error) {
      console.error('终止任务失败:', error);
    }
  };

  // 清空日志
  const handleClearLogs = (taskId: string) => {
    setLogs((prev) => {
      const newLogs = new Map(prev);
      newLogs.delete(taskId);
      return newLogs;
    });
  };

  // 展开/折叠
  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  // 获取状态图标和颜色
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'running':
        return { icon: <PlayCircleOutlined spin />, color: 'processing', text: '运行中' };
      case 'completed':
        return { icon: <CheckCircleOutlined />, color: 'success', text: '完成' };
      case 'failed':
        return { icon: <CloseCircleOutlined />, color: 'error', text: '失败' };
      case 'timeout':
        return { icon: <ClockCircleOutlined />, color: 'warning', text: '超时' };
      default:
        return { icon: null, color: 'default', text: status };
    }
  };

  // 获取日志行样式（根据内容类型）
  const getLogStyle = (type: string, content: string): React.CSSProperties => {
    // 根据日志内容判断样式
    if (content.startsWith('[思考]') || content.startsWith('[AI 思考]')) {
      return { color: '#faad14', fontStyle: 'italic' }; // 思考过程：橙色斜体
    }
    if (content.startsWith('[输出]') || content.startsWith('[AI 输出]')) {
      return { color: '#52c41a' }; // AI 输出：绿色
    }
    if (content.startsWith('[工具调用]') || content.startsWith('[准备调用工具]')) {
      return { color: '#722ed1' }; // 工具调用：紫色
    }
    if (content.startsWith('[工具输入]') || content.startsWith('[工具参数]')) {
      return { color: '#13c2c2' }; // 工具输入：青色
    }
    if (content.startsWith('[工具返回]') || content.startsWith('[工具结果]')) {
      return { color: '#1890ff' }; // 工具结果：蓝色
    }
    if (content.startsWith('[错误]')) {
      return { color: '#ff4d4f', fontWeight: 'bold' }; // 错误：红色加粗
    }
    if (content.startsWith('[最终结果')) {
      return { color: '#52c41a', fontWeight: 'bold' }; // 最终结果：绿色加粗
    }
    if (content.startsWith('[Token 使用]')) {
      return { color: '#8c8c8c', fontSize: '10px' }; // Token 统计：灰色小字
    }

    // 按类型判断
    switch (type) {
      case 'stderr':
        return { color: '#ff4d4f' };
      case 'system':
        return { color: '#1890ff' };
      default:
        return { color: '#52c41a' };
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN');
  };

  // 格式化持续时间
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const runningProcesses = processes.filter((p) => p.status === 'running');
  const recentProcesses = processes.slice(0, 5); // 只显示最近5个

  return (
    <Card
      title={
        <Space>
          <span>Claude 实例监控</span>
          <Badge
            status={connected ? 'success' : 'error'}
            text={connected ? '已连接' : '断开'}
          />
        </Space>
      }
      extra={
        <Space>
          {onViewHistory && (
            <Button size="small" icon={<HistoryOutlined />} onClick={onViewHistory}>
              历史记录
            </Button>
          )}
          <Button size="small" onClick={loadProcesses}>
            刷新
          </Button>
        </Space>
      }
    >
      {/* 今日统计 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic
              title="运行中"
              value={runningProcesses.length}
              valueStyle={{ color: '#1890ff', fontSize: 20 }}
              prefix={<PlayCircleOutlined spin={runningProcesses.length > 0} />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="今日完成"
              value={stats.completed || 0}
              valueStyle={{ color: '#52c41a', fontSize: 20 }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="今日失败"
              value={stats.failed || 0}
              valueStyle={{ color: '#ff4d4f', fontSize: 20 }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="平均耗时"
              value={stats.avgDuration ? formatDuration(stats.avgDuration) : '-'}
              valueStyle={{ fontSize: 20 }}
            />
          </Col>
        </Row>
      )}

      {recentProcesses.length === 0 ? (
        <Empty description="暂无任务" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recentProcesses.map((process) => {
            const statusInfo = getStatusInfo(process.status);
            const taskLogs = logs.get(process.taskId) || [];
            const isExpanded = expandedTasks.has(process.taskId);

            return (
              <Card
                key={process.taskId}
                size="small"
                type="inner"
                title={
                  <Space>
                    {/* PID 作为核心标识 */}
                    <Tag
                      color="blue"
                      style={{
                        fontSize: 14,
                        fontWeight: 'bold',
                        padding: '2px 8px',
                      }}
                    >
                      PID: {process.pid || '等待中...'}
                    </Tag>
                    <Tag color={statusInfo.color as any}>
                      {statusInfo.icon} {statusInfo.text}
                    </Tag>
                    <Tag>W{process.workerId}</Tag>
                  </Space>
                }
                extra={
                  <Space size="small">
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {process.taskId.substring(0, 8)}
                    </span>
                    {process.status === 'running' && (
                      <Tooltip title="终止任务">
                        <Button
                          size="small"
                          danger
                          icon={<StopOutlined />}
                          onClick={() => handleKillTask(process.taskId)}
                        />
                      </Tooltip>
                    )}
                    <Tooltip title="清空日志">
                      <Button
                        size="small"
                        icon={<ClearOutlined />}
                        onClick={() => handleClearLogs(process.taskId)}
                      />
                    </Tooltip>
                    <Tooltip title={isExpanded ? '收起' : '展开'}>
                      <Button
                        size="small"
                        icon={isExpanded ? <CompressOutlined /> : <ExpandOutlined />}
                        onClick={() => toggleExpand(process.taskId)}
                      />
                    </Tooltip>
                  </Space>
                }
              >
                {/* 任务信息 */}
                <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
                  <Space split="|">
                    <span>开始: {formatTime(process.startTime)}</span>
                    {process.status === 'running' ? (
                      <span>运行: {formatDuration(Date.now() - process.startTime)}</span>
                    ) : process.duration ? (
                      <span>耗时: {formatDuration(process.duration)}</span>
                    ) : null}
                    <span>日志: {taskLogs.length} 条</span>
                  </Space>
                </div>

                {/* Prompt 预览 */}
                <div
                  style={{
                    padding: '4px 8px',
                    background: '#f5f5f5',
                    borderRadius: 4,
                    fontSize: 12,
                    marginBottom: 8,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {process.prompt}
                </div>

                {/* 日志面板 */}
                <div
                  ref={(el) => {
                    if (el) logContainerRefs.current.set(process.taskId, el);
                  }}
                  style={{
                    background: '#1e1e1e',
                    borderRadius: 4,
                    padding: 8,
                    height: isExpanded ? 300 : 100,
                    overflowY: 'auto',
                    fontFamily: 'Monaco, Menlo, monospace',
                    fontSize: 11,
                    lineHeight: 1.5,
                    transition: 'height 0.3s',
                  }}
                >
                  {taskLogs.length === 0 ? (
                    <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>
                      等待日志...
                    </div>
                  ) : (
                    taskLogs.map((log, idx) => (
                      <div key={idx} style={getLogStyle(log.type, log.content)}>
                        <span style={{ color: '#666', marginRight: 8 }}>
                          [{formatTime(log.timestamp)}]
                        </span>
                        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {log.content}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* 错误信息 */}
                {process.error && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '4px 8px',
                      background: '#fff2f0',
                      border: '1px solid #ffccc7',
                      borderRadius: 4,
                      color: '#ff4d4f',
                      fontSize: 12,
                    }}
                  >
                    {process.error}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default ClaudeInstanceLogs;
