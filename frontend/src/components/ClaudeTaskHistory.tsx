import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Select,
  DatePicker,
  Modal,
  Descriptions,
  message,
  Statistic,
  Row,
  Col,
  Input,
} from 'antd';
import {
  ReloadOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { aiGetTaskHistory, aiGetTaskDetail, aiGetTaskStats } from '../api';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface TaskRecord {
  _id: string;
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
  createdAt: string;
}

interface TaskLog {
  timestamp: number;
  type: 'stdout' | 'stderr' | 'system';
  content: string;
}

const ClaudeTaskHistory: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [filters, setFilters] = useState<{
    status?: string;
    dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
    pid?: string;
  }>({});
  const [stats, setStats] = useState<any>(null);
  const [detailModal, setDetailModal] = useState<{
    visible: boolean;
    task: (TaskRecord & { logs?: TaskLog[] }) | null;
  }>({ visible: false, task: null });

  // 加载任务列表
  const loadTasks = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: pagination.pageSize,
        skip: (pagination.current - 1) * pagination.pageSize,
      };

      if (filters.status) params.status = filters.status;
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].startOf('day').toISOString();
        params.endDate = filters.dateRange[1].endOf('day').toISOString();
      }

      const res: any = await aiGetTaskHistory(params);

      // 如果有 PID 筛选，在前端过滤
      let filteredTasks = res.tasks || [];
      if (filters.pid) {
        filteredTasks = filteredTasks.filter(
          (t: TaskRecord) => t.pid?.toString().includes(filters.pid!)
        );
      }

      setTasks(filteredTasks);
      setTotal(res.total || 0);
    } catch (error) {
      message.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载统计
  const loadStats = async () => {
    try {
      const res: any = await aiGetTaskStats(7);
      setStats(res.stats);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 查看详情
  const viewDetail = async (taskId: string) => {
    try {
      const res: any = await aiGetTaskDetail(taskId);
      setDetailModal({ visible: true, task: res.task });
    } catch (error) {
      message.error('加载任务详情失败');
    }
  };

  useEffect(() => {
    loadTasks();
    loadStats();
  }, [pagination, filters.status, filters.dateRange]);

  // 状态标签
  const renderStatus = (status: string) => {
    const statusMap: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      running: { color: 'processing', icon: <PlayCircleOutlined spin />, text: '运行中' },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
      timeout: { color: 'warning', icon: <ClockCircleOutlined />, text: '超时' },
    };
    const info = statusMap[status] || { color: 'default', icon: null, text: status };
    return (
      <Tag color={info.color}>
        {info.icon} {info.text}
      </Tag>
    );
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return dayjs(timestamp).format('MM-DD HH:mm:ss');
  };

  // 格式化持续时间
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // 日志行样式
  const getLogStyle = (type: string): React.CSSProperties => {
    switch (type) {
      case 'stderr':
        return { color: '#ff4d4f' };
      case 'system':
        return { color: '#1890ff' };
      default:
        return { color: '#52c41a' };
    }
  };

  const columns = [
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 80,
      render: (pid?: number) => (
        <Tag color="blue">{pid || '-'}</Tag>
      ),
    },
    {
      title: 'Task ID',
      dataIndex: 'taskId',
      key: 'taskId',
      width: 100,
      render: (id: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {id.substring(0, 8)}...
        </span>
      ),
    },
    {
      title: 'Worker',
      dataIndex: 'workerId',
      key: 'workerId',
      width: 70,
      render: (id: number) => <Tag>W{id}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 130,
      render: formatTime,
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: formatDuration,
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt',
      key: 'prompt',
      ellipsis: true,
      render: (prompt: string) => (
        <span style={{ fontSize: 12 }}>{prompt}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: TaskRecord) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => viewDetail(record.taskId)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="总任务" value={stats.total} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="已完成"
                value={stats.completed}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="失败"
                value={stats.failed}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="超时"
                value={stats.timeout}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="运行中"
                value={stats.running}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic
                title="平均耗时"
                value={formatDuration(stats.avgDuration)}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选器 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="按 PID 搜索"
            prefix={<SearchOutlined />}
            style={{ width: 150 }}
            value={filters.pid}
            onChange={(e) => setFilters({ ...filters, pid: e.target.value })}
            onPressEnter={loadTasks}
            allowClear
          />
          <Select
            placeholder="状态筛选"
            style={{ width: 120 }}
            allowClear
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
          >
            <Option value="running">运行中</Option>
            <Option value="completed">已完成</Option>
            <Option value="failed">失败</Option>
            <Option value="timeout">超时</Option>
          </Select>
          <RangePicker
            value={filters.dateRange}
            onChange={(dates) =>
              setFilters({
                ...filters,
                dateRange: dates as [dayjs.Dayjs, dayjs.Dayjs],
              })
            }
          />
          <Button icon={<ReloadOutlined />} onClick={loadTasks}>
            刷新
          </Button>
        </Space>
      </Card>

      {/* 任务列表 */}
      <Card title="任务历史" size="small">
        <Table
          dataSource={tasks}
          columns={columns}
          rowKey="taskId"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) =>
              setPagination({ current: page, pageSize }),
          }}
          size="small"
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={
          <Space>
            <span>任务详情</span>
            {detailModal.task?.pid && (
              <Tag color="blue">PID: {detailModal.task.pid}</Tag>
            )}
            {detailModal.task && renderStatus(detailModal.task.status)}
          </Space>
        }
        open={detailModal.visible}
        onCancel={() => setDetailModal({ visible: false, task: null })}
        footer={null}
        width={900}
      >
        {detailModal.task && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Task ID">
                <code>{detailModal.task.taskId}</code>
              </Descriptions.Item>
              <Descriptions.Item label="Worker">
                {detailModal.task.workerId}
              </Descriptions.Item>
              <Descriptions.Item label="PID">
                {detailModal.task.pid || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {formatDuration(detailModal.task.duration)}
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {formatTime(detailModal.task.startTime)}
              </Descriptions.Item>
              <Descriptions.Item label="结束时间">
                {detailModal.task.endTime
                  ? formatTime(detailModal.task.endTime)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Prompt" span={2}>
                <div
                  style={{
                    maxHeight: 100,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                  }}
                >
                  {detailModal.task.prompt}
                </div>
              </Descriptions.Item>
              {detailModal.task.error && (
                <Descriptions.Item label="错误" span={2}>
                  <span style={{ color: '#ff4d4f' }}>
                    {detailModal.task.error}
                  </span>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* 日志 */}
            <div style={{ marginTop: 16 }}>
              <h4>执行日志 ({detailModal.task.logs?.length || 0} 条)</h4>
              <div
                style={{
                  background: '#1e1e1e',
                  borderRadius: 4,
                  padding: 12,
                  maxHeight: 400,
                  overflowY: 'auto',
                  fontFamily: 'Monaco, Menlo, monospace',
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                {detailModal.task.logs?.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center' }}>
                    暂无日志
                  </div>
                ) : (
                  detailModal.task.logs?.map((log, idx) => (
                    <div key={idx} style={getLogStyle(log.type)}>
                      <span style={{ color: '#666', marginRight: 8 }}>
                        [{dayjs(log.timestamp).format('HH:mm:ss.SSS')}]
                      </span>
                      <span style={{ color: '#888', marginRight: 8 }}>
                        [{log.type}]
                      </span>
                      <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {log.content}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 结果 */}
            {detailModal.task.result && (
              <div style={{ marginTop: 16 }}>
                <h4>执行结果</h4>
                <div
                  style={{
                    background: '#f5f5f5',
                    borderRadius: 4,
                    padding: 12,
                    maxHeight: 200,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                  }}
                >
                  {detailModal.task.result}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ClaudeTaskHistory;
