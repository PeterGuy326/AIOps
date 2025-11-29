import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Spin,
  Empty,
  Tooltip,
  Typography,
  Divider,
  message,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  DownloadOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { aiGetProcessLogs, aiGetTaskDetail, aiKillProcess, createTaskLogStream } from '../api';

const { Text, Paragraph } = Typography;

interface ProcessLog {
  timestamp: number;
  type: 'stdout' | 'stderr' | 'system';
  content: string;
}

interface TaskDetail {
  taskId: string;
  workerId: number;
  pid?: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startTime: number;
  endTime?: number;
  duration?: number;
  prompt: string;
  result?: string;
  error?: string;
  logs: ProcessLog[];
}

interface Props {
  taskId: string;
  onBack: () => void;
}

const ClaudeTaskDetail: React.FC<Props> = ({ taskId, onBack }) => {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ProcessLog[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // 加载任务详情（包含完整日志）
  const loadTaskDetail = useCallback(async () => {
    try {
      setLoading(true);

      // 先尝试从内存获取
      const memRes: any = await aiGetProcessLogs(taskId);
      if (memRes.logs && memRes.logs.length > 0) {
        setTask({
          taskId: memRes.taskId,
          workerId: memRes.workerId,
          pid: memRes.pid,
          status: memRes.status,
          startTime: memRes.startTime,
          prompt: memRes.prompt,
          result: memRes.result,
          error: memRes.error,
          logs: memRes.logs,
        });
        setLogs(memRes.logs);
      } else {
        // 从数据库获取历史记录
        const dbRes: any = await aiGetTaskDetail(taskId);
        if (dbRes.task) {
          setTask(dbRes.task);
          setLogs(dbRes.task.logs || []);
        }
      }
    } catch (error) {
      console.error('加载任务详情失败:', error);
      message.error('加载任务详情失败');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // 建立 SSE 连接（如果任务正在运行）
  useEffect(() => {
    loadTaskDetail();

    // 建立实时日志连接
    const es = createTaskLogStream(taskId);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'init') {
          // 初始化任务信息
          setTask((prev) => ({
            ...prev,
            taskId: data.taskId,
            workerId: data.workerId,
            pid: data.pid,
            status: data.status,
            startTime: data.startTime,
          } as TaskDetail));
        } else if (data.type === 'log') {
          // 追加新日志
          setLogs((prev) => {
            // 检查是否已存在（避免重复）
            const exists = prev.some(
              (l) => l.timestamp === data.log.timestamp && l.content === data.log.content
            );
            if (exists) return prev;
            return [...prev, data.log];
          });

          // 自动滚动
          if (autoScroll) {
            setTimeout(() => {
              if (logContainerRef.current) {
                logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
              }
            }, 10);
          }

          // 检测任务完成
          if (data.log.type === 'system' &&
              (data.log.content.includes('任务完成') || data.log.content.includes('任务失败'))) {
            loadTaskDetail();
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, [taskId, loadTaskDetail, autoScroll]);

  // 终止任务
  const handleKillTask = async () => {
    try {
      await aiKillProcess(taskId);
      message.success('任务已终止');
      loadTaskDetail();
    } catch (error) {
      message.error('终止任务失败');
    }
  };

  // 复制日志
  const handleCopyLogs = () => {
    const logText = logs
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type}] ${l.content}`)
      .join('\n');
    navigator.clipboard.writeText(logText);
    message.success('日志已复制到剪贴板');
  };

  // 导出日志
  const handleExportLogs = () => {
    const logText = logs
      .map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.type}] ${l.content}`)
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claude-task-${taskId.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('日志已导出');
  };

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

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatDuration = (ms: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  // 日志样式
  const getLogStyle = (type: string, content: string): React.CSSProperties => {
    // 根据日志内容判断样式
    if (content.startsWith('[AI]')) {
      return { color: '#52c41a' }; // AI 输出：绿色
    }
    if (content.startsWith('[Tool]') || content.startsWith('[工具]')) {
      return { color: '#722ed1' }; // 工具调用：紫色
    }
    if (content.startsWith('[Tool Input]') || content.startsWith('[工具输入]')) {
      return { color: '#13c2c2' }; // 工具输入：青色
    }
    if (content.startsWith('[错误]') || content.startsWith('[Error]')) {
      return { color: '#ff4d4f', fontWeight: 'bold' }; // 错误：红色加粗
    }
    if (content.startsWith('[完成]') || content.startsWith('[Done]')) {
      return { color: '#52c41a', fontWeight: 'bold' }; // 完成：绿色加粗
    }

    switch (type) {
      case 'stderr':
        return { color: '#ff4d4f' };
      case 'system':
        return { color: '#1890ff' };
      default:
        return { color: '#d4d4d4' };
    }
  };

  if (loading && !task) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>加载任务详情...</div>
        </div>
      </Card>
    );
  }

  if (!task) {
    return (
      <Card>
        <Empty description="任务不存在">
          <Button onClick={onBack}>返回列表</Button>
        </Empty>
      </Card>
    );
  }

  const statusInfo = getStatusInfo(task.status);

  return (
    <Card
      title={
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回
          </Button>
          <span>任务详情</span>
          <Tag color={statusInfo.color as any} icon={statusInfo.icon}>
            {statusInfo.text}
          </Tag>
          {task.status === 'running' && connected && (
            <Tag color="green">实时连接</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          {task.status === 'running' && (
            <Button danger icon={<StopOutlined />} onClick={handleKillTask}>
              终止任务
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadTaskDetail}>
            刷新
          </Button>
        </Space>
      }
    >
      {/* 任务基本信息 */}
      <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="任务 ID">
          <Text code copyable>{task.taskId}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="PID">
          <Text strong style={{ fontSize: 16 }}>{task.pid || '-'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Worker">
          <Tag>Worker {task.workerId}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="开始时间">
          {formatTime(task.startTime)}
        </Descriptions.Item>
        <Descriptions.Item label="结束时间">
          {task.endTime ? formatTime(task.endTime) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="耗时">
          {task.status === 'running'
            ? formatDuration(Date.now() - task.startTime)
            : formatDuration(task.duration || 0)
          }
        </Descriptions.Item>
      </Descriptions>

      {/* Prompt */}
      <Card size="small" title="Prompt" style={{ marginBottom: 16 }}>
        <Paragraph
          ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {task.prompt}
        </Paragraph>
      </Card>

      {/* 结果 */}
      {task.result && (
        <Card size="small" title="执行结果" style={{ marginBottom: 16 }}>
          <Paragraph
            ellipsis={{ rows: 5, expandable: true, symbol: '展开' }}
            copyable
            style={{
              background: '#f6ffed',
              padding: 12,
              borderRadius: 4,
              margin: 0,
              whiteSpace: 'pre-wrap',
              border: '1px solid #b7eb8f',
            }}
          >
            {task.result}
          </Paragraph>
        </Card>
      )}

      {/* 错误信息 */}
      {task.error && (
        <Alert
          type="error"
          message="执行错误"
          description={task.error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 完整日志 */}
      <Card
        size="small"
        title={
          <Space>
            <span>执行日志</span>
            <Tag>{logs.length} 条</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button
              size="small"
              type={autoScroll ? 'primary' : 'default'}
              onClick={() => setAutoScroll(!autoScroll)}
            >
              自动滚动: {autoScroll ? '开' : '关'}
            </Button>
            <Tooltip title="复制日志">
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopyLogs} />
            </Tooltip>
            <Tooltip title="导出日志">
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExportLogs} />
            </Tooltip>
          </Space>
        }
      >
        <div
          ref={logContainerRef}
          style={{
            background: '#1e1e1e',
            borderRadius: 4,
            padding: 12,
            height: 500,
            overflowY: 'auto',
            fontFamily: 'Monaco, Menlo, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', padding: 50 }}>
              {task.status === 'running' ? '等待日志...' : '无日志记录'}
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: 2 }}>
                <span style={{ color: '#666', marginRight: 8, userSelect: 'none' }}>
                  [{new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}]
                </span>
                <span style={{ ...getLogStyle(log.type, log.content), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {log.content}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* 日志图例 */}
      <Divider style={{ margin: '12px 0' }} />
      <Space wrap>
        <span style={{ color: '#999', fontSize: 12 }}>日志类型：</span>
        <Tag color="blue">系统消息</Tag>
        <Tag color="green">AI 输出</Tag>
        <Tag color="purple">工具调用</Tag>
        <Tag color="cyan">工具参数</Tag>
        <Tag color="red">错误信息</Tag>
      </Space>
    </Card>
  );
};

export default ClaudeTaskDetail;
