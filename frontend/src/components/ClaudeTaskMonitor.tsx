import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Badge,
  Row,
  Col,
  Statistic,
  Tooltip,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  EyeOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { aiGetMonitorStatus, aiKillProcess } from '../api';

interface WorkerInfo {
  id: number;
  busy: boolean;
  currentTask: {
    taskId: string;
    fullTaskId: string;
    pid?: number;
    startTime: number;
    duration: number;
    prompt: string;
    logCount: number;
  } | null;
  totalTaskCount: number;
}

interface TaskInfo {
  taskId: string;
  workerId: number;
  pid?: number;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startTime: number;
  duration?: number;
  prompt: string;
  logCount: number;
  result?: string;
  error?: string;
}

interface MonitorStatus {
  service: {
    ready: boolean;
    hasBrowserMCP: boolean;
    chromeRunning: boolean;
    availableMCPTools: string[];
  };
  queue: {
    length: number;
    pendingTasks: Array<{
      id: string;
      createdAt: number;
      waitTime: number;
      streaming: boolean;
    }>;
  };
  workers: WorkerInfo[];
  runningTasks: TaskInfo[];
  recentTasks: TaskInfo[];
  stats: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    timeouts: number;
    retries: number;
    busyWorkers: number;
    idleWorkers: number;
  };
}

interface Props {
  onViewTaskDetail: (taskId: string) => void;
  onViewHistory?: () => void;
}

const ClaudeTaskMonitor: React.FC<Props> = ({ onViewTaskDetail, onViewHistory }) => {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res: any = await aiGetMonitorStatus();
      setStatus(res);
    } catch (error) {
      console.error('加载监控状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();

    if (autoRefresh) {
      const interval = setInterval(loadStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [loadStatus, autoRefresh]);

  const handleKillTask = async (taskId: string) => {
    try {
      await aiKillProcess(taskId);
      message.success('任务已终止');
      loadStatus();
    } catch (error) {
      message.error('终止任务失败');
    }
  };

  const getStatusInfo = (statusStr: string) => {
    switch (statusStr) {
      case 'running':
        return { icon: <PlayCircleOutlined spin />, color: 'processing', text: '运行中' };
      case 'completed':
        return { icon: <CheckCircleOutlined />, color: 'success', text: '完成' };
      case 'failed':
        return { icon: <CloseCircleOutlined />, color: 'error', text: '失败' };
      case 'timeout':
        return { icon: <ClockCircleOutlined />, color: 'warning', text: '超时' };
      default:
        return { icon: null, color: 'default', text: statusStr };
    }
  };

  const formatDuration = (ms: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN');
  };

  const columns = [
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 80,
      render: (pid: number | undefined, record: TaskInfo) => (
        <Button
          type="link"
          size="small"
          style={{ fontWeight: 'bold', padding: 0 }}
          onClick={() => onViewTaskDetail(record.taskId)}
        >
          {pid || '-'}
        </Button>
      ),
    },
    {
      title: '任务ID',
      dataIndex: 'taskId',
      key: 'taskId',
      width: 100,
      render: (taskId: string) => (
        <Tooltip title={taskId}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {taskId.substring(0, 8)}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (statusStr: string) => {
        const info = getStatusInfo(statusStr);
        return (
          <Tag color={info.color as any} icon={info.icon}>
            {info.text}
          </Tag>
        );
      },
    },
    {
      title: 'Worker',
      dataIndex: 'workerId',
      key: 'workerId',
      width: 70,
      render: (workerId: number) => <Tag>W{workerId}</Tag>,
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 100,
      render: (time: number) => formatTime(time),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (duration: number | undefined, record: TaskInfo) => {
        if (record.status === 'running') {
          return <span style={{ color: '#1890ff' }}>{formatDuration(Date.now() - record.startTime)}</span>;
        }
        return formatDuration(duration || 0);
      },
    },
    {
      title: '日志数',
      dataIndex: 'logCount',
      key: 'logCount',
      width: 70,
      render: (count: number) => <Badge count={count} showZero style={{ backgroundColor: '#52c41a' }} />,
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt',
      key: 'prompt',
      ellipsis: true,
      render: (prompt: string) => (
        <Tooltip title={prompt}>
          <span style={{ fontSize: 12, color: '#666' }}>{prompt}</span>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: TaskInfo) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => onViewTaskDetail(record.taskId)}
            />
          </Tooltip>
          {record.status === 'running' && (
            <Tooltip title="终止任务">
              <Button
                danger
                size="small"
                icon={<StopOutlined />}
                onClick={() => handleKillTask(record.taskId)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  if (!status) {
    return <Card loading={true} title="Claude 任务监控" />;
  }

  const { service, queue, workers, recentTasks, stats } = status;

  return (
    <Card
      title={
        <Space>
          <span>Claude 任务监控</span>
          <Badge
            status={service.ready ? 'success' : 'error'}
            text={service.ready ? '服务就绪' : '服务离线'}
          />
          {service.chromeRunning && (
            <Tag color="blue">Chrome 运行中</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button
            size="small"
            type={autoRefresh ? 'primary' : 'default'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '自动刷新: 开' : '自动刷新: 关'}
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined spin={loading} />}
            onClick={loadStatus}
          >
            刷新
          </Button>
          {onViewHistory && (
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={onViewHistory}
            >
              历史记录
            </Button>
          )}
        </Space>
      }
    >
      {/* Worker 状态概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="活跃 Worker"
              value={stats.busyWorkers}
              suffix={`/ ${stats.busyWorkers + stats.idleWorkers}`}
              valueStyle={{ color: stats.busyWorkers > 0 ? '#1890ff' : '#999' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="等待队列"
              value={queue.length}
              valueStyle={{ color: queue.length > 0 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="总任务数"
              value={stats.totalTasks}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="完成"
              value={stats.completedTasks}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="失败"
              value={stats.failedTasks}
              valueStyle={{ color: stats.failedTasks > 0 ? '#ff4d4f' : '#999' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="超时"
              value={stats.timeouts}
              valueStyle={{ color: stats.timeouts > 0 ? '#faad14' : '#999' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Worker 槽位可视化 */}
      <Card size="small" title="Worker 状态" style={{ marginBottom: 16 }}>
        <Row gutter={8}>
          {workers.map((worker) => (
            <Col span={Math.floor(24 / workers.length)} key={worker.id}>
              <Card
                size="small"
                style={{
                  background: worker.busy ? '#e6f7ff' : '#f5f5f5',
                  borderColor: worker.busy ? '#1890ff' : '#d9d9d9',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                    Worker {worker.id}
                  </div>
                  {worker.busy && worker.currentTask ? (
                    <>
                      <Tag color="processing">运行中</Tag>
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        <div>PID: {worker.currentTask.pid || '-'}</div>
                        <div>{formatDuration(worker.currentTask.duration)}</div>
                      </div>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => onViewTaskDetail(worker.currentTask!.fullTaskId)}
                      >
                        查看
                      </Button>
                    </>
                  ) : (
                    <Tag>空闲</Tag>
                  )}
                  <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                    累计: {worker.totalTaskCount} 次
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 等待队列 */}
      {queue.length > 0 && (
        <Card size="small" title={`等待队列 (${queue.length})`} style={{ marginBottom: 16 }}>
          <Space wrap>
            {queue.pendingTasks.map((task, idx) => (
              <Tag key={task.id} color="orange">
                #{idx + 1} {task.id} - 等待 {formatDuration(task.waitTime)}
                {task.streaming && ' [流式]'}
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* 任务列表 */}
      <Card size="small" title="最近任务">
        <Table
          dataSource={recentTasks}
          columns={columns}
          rowKey="taskId"
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
          rowClassName={(record) => {
            if (record.status === 'running') return 'row-running';
            if (record.status === 'failed') return 'row-failed';
            return '';
          }}
        />
      </Card>

      <style>{`
        .row-running {
          background-color: #e6f7ff;
        }
        .row-failed {
          background-color: #fff2f0;
        }
      `}</style>
    </Card>
  );
};

export default ClaudeTaskMonitor;
