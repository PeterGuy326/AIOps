import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Select, 
  Button, 
  Table, 
  Tag, 
  Switch, 
  Slider, 
  Row, 
  Col,
  Statistic,
  Progress,
  Modal,
  message,
  Space,
  Tooltip,
  Alert
} from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  SettingOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  RobotOutlined,
  RiseOutlined
} from '@ant-design/icons';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import api from '../api';

const { Option } = Select;
const { TextArea } = Input;

interface CrawlStrategy {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'stopped';
  keywords: string[];
  negativeKeywords: string[];
  platforms: string[];
  qualityThreshold: number;
  aiOptimization: boolean;
  scheduleFrequency: string;
  lastRun: string;
  nextRun: string;
  totalCrawled: number;
  successRate: number;
  aiGeneratedKeywords: string[];
}

interface CrawlResult {
  id: string;
  platform: string;
  keyword: string;
  articlesFound: number;
  qualityScore: number;
  timestamp: string;
  duration: number;
  status: 'success' | 'failed' | 'partial';
}

const CrawlerStrategy: React.FC = () => {
  const [strategies, setStrategies] = useState<CrawlStrategy[]>([]);
  const [crawlResults, setCrawlResults] = useState<CrawlResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<CrawlStrategy | null>(null);
  const [aiSuggestionModal, setAiSuggestionModal] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadStrategies();
    loadCrawlResults();
  }, []);

  const loadStrategies = async () => {
    try {
      const response = await api.get('/crawler/strategies');
      setStrategies(response.strategies || []);
    } catch (error) {
      message.error('加载策略失败');
    }
  };

  const loadCrawlResults = async () => {
    try {
      const response = await api.get('/crawler/results?limit=50');
      setCrawlResults(response.results || []);
    } catch (error) {
      console.error('加载爬取结果失败:', error);
    }
  };

  const generateAIStrategy = async () => {
    try {
      setLoading(true);
      const response = await api.post('/ai/generate-strategy', {
        timeframe: 7,
        platforms: ['zhihu', 'wechat', 'news'],
        objectives: ['trending', 'quality', 'engagement']
      });
      
      setAiSuggestions(response.strategy);
      setAiSuggestionModal(true);
      message.success('AI策略生成成功');
    } catch (error) {
      message.error('AI策略生成失败');
    } finally {
      setLoading(false);
    }
  };

  const saveStrategy = async (values: any) => {
    try {
      setLoading(true);
      const strategyData = {
        ...values,
        id: editingStrategy?.id || `strategy_${Date.now()}`,
        status: 'active',
        lastRun: new Date().toISOString(),
        nextRun: dayjs().add(1, 'hour').toISOString(),
        totalCrawled: 0,
        successRate: 0
      };

      if (editingStrategy) {
        await api.put(`/crawler/strategies/${editingStrategy.id}`, strategyData);
        message.success('策略更新成功');
      } else {
        await api.post('/crawler/strategies', strategyData);
        message.success('策略创建成功');
      }

      setModalVisible(false);
      loadStrategies();
    } catch (error) {
      message.error('保存策略失败');
    } finally {
      setLoading(false);
    }
  };

  const executeCrawl = async (strategyId: string) => {
    try {
      setLoading(true);
      await api.post(`/crawler/execute/${strategyId}`);
      message.success('爬取任务已启动');
      setTimeout(loadCrawlResults, 2000);
    } catch (error) {
      message.error('启动爬取失败');
    } finally {
      setLoading(false);
    }
  };

  const strategyColumns = [
    {
      title: '策略名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: CrawlStrategy) => (
        <Space>
          {name}
          {record.aiOptimization && <Tag color="blue" icon={<RobotOutlined />}>AI优化</Tag>}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          active: 'green',
          paused: 'orange',
          stopped: 'red',
        };
        const textMap: Record<string, string> = {
          active: '运行中',
          paused: '已暂停',
          stopped: '已停止',
        };
        return <Tag color={colorMap[status]}>{textMap[status]}</Tag>;
      },
    },
    {
      title: '关键词',
      dataIndex: 'keywords',
      key: 'keywords',
      render: (keywords: string[]) => (
        <Space wrap>
          {keywords.slice(0, 3).map(keyword => (
            <Tag key={keyword}>{keyword}</Tag>
          ))}
          {keywords.length > 3 && <Tag>+{keywords.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platforms',
      key: 'platforms',
      render: (platforms: string[]) => (
        <Space wrap>
          {platforms.map(platform => (
            <Tag key={platform} color="blue">{platform}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      width: 120,
      render: (rate: number) => (
        <Progress 
          percent={Math.round(rate * 100)} 
          size="small" 
          status={rate > 0.8 ? 'success' : rate > 0.5 ? 'normal' : 'exception'}
        />
      ),
    },
    {
      title: '下次执行',
      dataIndex: 'nextRun',
      key: 'nextRun',
      width: 180,
      render: (time: string) => dayjs(time).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: CrawlStrategy) => (
        <Space>
          <Tooltip title="立即执行">
            <Button 
              type="link" 
              icon={<PlayCircleOutlined />}
              onClick={() => executeCrawl(record.id)}
              disabled={record.status === 'stopped'}
            />
          </Tooltip>
          <Tooltip title="编辑策略">
            <Button 
              type="link" 
              icon={<SettingOutlined />}
              onClick={() => {
                setEditingStrategy(record);
                form.setFieldsValue(record);
                setModalVisible(true);
              }}
            />
          </Tooltip>
          <Tooltip title="查看详情">
            <Button 
              type="link" 
              icon={<EyeOutlined />}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const resultColumns = [
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
      render: (platform: string) => <Tag color="blue">{platform}</Tag>,
    },
    {
      title: '关键词',
      dataIndex: 'keyword',
      key: 'keyword',
    },
    {
      title: '发现文章',
      dataIndex: 'articlesFound',
      key: 'articlesFound',
      width: 100,
      render: (count: number) => <Tag color="green">{count}</Tag>,
    },
    {
      title: '质量评分',
      dataIndex: 'qualityScore',
      key: 'qualityScore',
      width: 120,
      render: (score: number) => (
        <Progress 
          percent={Math.round(score * 100)} 
          size="small"
          strokeColor={score > 0.8 ? '#52c41a' : score > 0.6 ? '#faad14' : '#ff4d4f'}
        />
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (duration: number) => `${duration}s`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          success: 'green',
          failed: 'red',
          partial: 'orange',
        };
        const textMap: Record<string, string> = {
          success: '成功',
          failed: '失败',
          partial: '部分成功',
        };
        return <Tag color={colorMap[status]}>{textMap[status]}</Tag>;
      },
    },
    {
      title: '执行时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (time: string) => dayjs(time).format('MM-DD HH:mm:ss'),
    },
  ];

  // 统计数据
  const totalCrawled = strategies.reduce((sum, s) => sum + s.totalCrawled, 0);
  const activeStrategies = strategies.filter(s => s.status === 'active').length;
  const avgSuccessRate = strategies.length > 0 
    ? strategies.reduce((sum, s) => sum + s.successRate, 0) / strategies.length 
    : 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1>智能爬取策略</h1>
        <Alert
          message="AI驱动的智能爬取系统"
          description="基于机器学习算法预测热点趋势，自动优化爬取策略，提升内容质量和效率"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃策略"
              value={activeStrategies}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总爬取数"
              value={totalCrawled}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均成功率"
              value={Math.round(avgSuccessRate * 100)}
              suffix="%"
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="AI优化"
              value={strategies.filter(s => s.aiOptimization).length}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 操作按钮 */}
      <Card style={{ marginBottom: 24 }}>
        <Space>
          <Button 
            type="primary" 
            icon={<RobotOutlined />}
            onClick={generateAIStrategy}
            loading={loading}
          >
            AI生成策略
          </Button>
          <Button 
            type="default" 
            icon={<SettingOutlined />}
            onClick={() => {
              setEditingStrategy(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            创建策略
          </Button>
          <Button icon={<EyeOutlined />} onClick={loadCrawlResults}>
            刷新结果
          </Button>
        </Space>
      </Card>

      {/* 策略列表 */}
      <Card title="爬取策略" style={{ marginBottom: 24 }}>
        <Table
          columns={strategyColumns}
          dataSource={strategies}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 个策略`,
          }}
        />
      </Card>

      {/* 爬取结果 */}
      <Card title="最近爬取结果">
        <Table
          columns={resultColumns}
          dataSource={crawlResults}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      {/* 策略编辑Modal */}
      <Modal
        title={editingStrategy ? '编辑策略' : '创建策略'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={saveStrategy}
        >
          <Form.Item
            label="策略名称"
            name="name"
            rules={[{ required: true, message: '请输入策略名称' }]}
          >
            <Input placeholder="输入策略名称" />
          </Form.Item>

          <Form.Item
            label="关键词"
            name="keywords"
            rules={[{ required: true, message: '请输入关键词' }]}
          >
            <Select
              mode="tags"
              placeholder="输入关键词，支持多个"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            label="排除关键词"
            name="negativeKeywords"
          >
            <Select
              mode="tags"
              placeholder="输入要排除的关键词"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="目标平台"
                name="platforms"
                rules={[{ required: true, message: '请选择目标平台' }]}
              >
                <Select mode="multiple" placeholder="选择爬取平台">
                  <Option value="zhihu">知乎</Option>
                  <Option value="wechat">微信公众号</Option>
                  <Option value="news">新闻网站</Option>
                  <Option value="weibo">微博</Option>
                  <Option value="xiaohongshu">小红书</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="执行频率"
                name="scheduleFrequency"
                rules={[{ required: true, message: '请选择执行频率' }]}
              >
                <Select placeholder="选择执行频率">
                  <Option value="hourly">每小时</Option>
                  <Option value="6hours">每6小时</Option>
                  <Option value="daily">每天</Option>
                  <Option value="weekly">每周</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="质量阈值">
            <Form.Item name="qualityThreshold" noStyle>
              <Slider
                min={0}
                max={100}
                marks={{
                  0: '低',
                  50: '中',
                  100: '高'
                }}
                tipFormatter={value => `${value}%`}
              />
            </Form.Item>
          </Form.Item>

          <Form.Item name="aiOptimization" valuePropName="checked">
            <Switch checkedChildren="AI优化开启" unCheckedChildren="AI优化关闭" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                保存策略
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* AI建议Modal */}
      <Modal
        title="AI策略建议"
        open={aiSuggestionModal}
        onCancel={() => setAiSuggestionModal(false)}
        footer={null}
        width={800}
      >
        {aiSuggestions && (
          <div>
            <Alert
              message="AI分析结果"
              description="基于历史数据和趋势分析，AI为您生成以下策略建议"
              type="success"
              style={{ marginBottom: 16 }}
            />

            <Row gutter={16}>
              <Col span={12}>
                <Card title="推荐关键词" size="small">
                  <Space wrap>
                    {aiSuggestions.keywords?.map((keyword: string) => (
                      <Tag key={keyword} color="blue">{keyword}</Tag>
                    ))}
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                <Card title="建议平台权重" size="small">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={aiSuggestions.platformWeights || []}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                      >
                        {aiSuggestions.platformWeights?.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042'][index % 4]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>

            <Card title="趋势洞察" size="small" style={{ marginTop: 16 }}>
              <p>{aiSuggestions.trendInsight}</p>
            </Card>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button 
                type="primary" 
                onClick={() => {
                  form.setFieldsValue({
                    keywords: aiSuggestions.keywords,
                    platforms: aiSuggestions.recommendedPlatforms,
                    aiOptimization: true
                  });
                  setAiSuggestionModal(false);
                  setModalVisible(true);
                }}
              >
                应用AI建议
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CrawlerStrategy;
