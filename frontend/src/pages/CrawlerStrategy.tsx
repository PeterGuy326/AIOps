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
  SettingOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  RobotOutlined,
  RiseOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import {
  crawlerGetPlatforms,
  crawlerExecuteTask,
  crawlerExecuteAll,
  aiGenerateStrategy,
  aiGenerateKeywords,
  aiGetQueueStatus,
} from '../api';

const { Option } = Select;

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
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<CrawlStrategy | null>(null);
  const [aiSuggestionModal, setAiSuggestionModal] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadPlatforms();
    loadQueueStatus();
    // 本地策略示例数据
    setStrategies([
      {
        id: '1',
        name: '科技热点追踪',
        status: 'active',
        keywords: ['AI', '人工智能', 'ChatGPT'],
        negativeKeywords: [],
        platforms: ['zhihu', 'wechat'],
        qualityThreshold: 70,
        aiOptimization: true,
        scheduleFrequency: 'hourly',
        lastRun: new Date().toISOString(),
        nextRun: dayjs().add(1, 'hour').toISOString(),
        totalCrawled: 156,
        successRate: 0.92,
        aiGeneratedKeywords: [],
      }
    ]);
  }, []);

  const loadPlatforms = async () => {
    try {
      const res: any = await crawlerGetPlatforms();
      setPlatforms(res.platforms || []);
    } catch (error) {
      console.error('加载平台列表失败:', error);
      // 使用默认平台
      setPlatforms(['zhihu', 'wechat', 'weibo', 'xiaohongshu', 'news']);
    }
  };

  const loadQueueStatus = async () => {
    try {
      const res: any = await aiGetQueueStatus();
      setQueueStatus(res);
    } catch (error) {
      console.error('加载队列状态失败:', error);
    }
  };

  const generateAIStrategyHandler = async () => {
    try {
      setLoading(true);
      const response: any = await aiGenerateStrategy({
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

  const generateKeywords = async () => {
    try {
      setLoading(true);
      const response: any = await aiGenerateKeywords({
        targetCount: 10,
        context: '内容创作'
      });

      if (response.keywords) {
        const keywords = response.keywords.map((k: any) => k.keyword);
        form.setFieldsValue({ keywords });
        message.success(`已生成 ${keywords.length} 个关键词`);
      }
    } catch (error) {
      message.error('关键词生成失败');
    } finally {
      setLoading(false);
    }
  };

  const saveStrategy = async (values: any) => {
    try {
      setLoading(true);
      const strategyData: CrawlStrategy = {
        ...values,
        id: editingStrategy?.id || `strategy_${Date.now()}`,
        status: 'active',
        lastRun: new Date().toISOString(),
        nextRun: dayjs().add(1, 'hour').toISOString(),
        totalCrawled: editingStrategy?.totalCrawled || 0,
        successRate: editingStrategy?.successRate || 0,
        aiGeneratedKeywords: [],
        negativeKeywords: values.negativeKeywords || [],
      };

      // 更新本地状态
      if (editingStrategy) {
        setStrategies(prev => prev.map(s => s.id === editingStrategy.id ? strategyData : s));
        message.success('策略更新成功');
      } else {
        setStrategies(prev => [...prev, strategyData]);
        message.success('策略创建成功');
      }

      setModalVisible(false);
    } catch (error) {
      message.error('保存策略失败');
    } finally {
      setLoading(false);
    }
  };

  const executeCrawl = async (strategy: CrawlStrategy) => {
    try {
      setLoading(true);
      message.loading('正在执行爬取任务...', 0);

      // 对每个平台执行爬取
      const results: CrawlResult[] = [];
      for (const platform of strategy.platforms) {
        try {
          const res: any = await crawlerExecuteTask({
            platform,
            keyword: strategy.keywords[0],
          });

          results.push({
            id: `${Date.now()}_${platform}`,
            platform,
            keyword: strategy.keywords[0],
            articlesFound: res.articles || 0,
            qualityScore: 0.8,
            timestamp: new Date().toISOString(),
            duration: 5,
            status: res.success ? 'success' : 'failed',
          });
        } catch (err) {
          results.push({
            id: `${Date.now()}_${platform}`,
            platform,
            keyword: strategy.keywords[0],
            articlesFound: 0,
            qualityScore: 0,
            timestamp: new Date().toISOString(),
            duration: 0,
            status: 'failed',
          });
        }
      }

      setCrawlResults(prev => [...results, ...prev].slice(0, 50));
      message.destroy();
      message.success(`爬取完成: ${results.filter(r => r.status === 'success').length}/${results.length} 成功`);

      // 更新策略统计
      setStrategies(prev => prev.map(s =>
        s.id === strategy.id
          ? {
              ...s,
              totalCrawled: s.totalCrawled + results.reduce((sum, r) => sum + r.articlesFound, 0),
              lastRun: new Date().toISOString(),
            }
          : s
      ));
    } catch (error) {
      message.destroy();
      message.error('启动爬取失败');
    } finally {
      setLoading(false);
    }
  };

  const executeAllPlatforms = async () => {
    try {
      setLoading(true);
      message.loading('正在执行全平台爬取...', 0);

      const res: any = await crawlerExecuteAll();

      message.destroy();
      message.success(`全平台爬取完成: ${res.totalArticles || 0} 篇文章`);
      loadQueueStatus();
    } catch (error) {
      message.destroy();
      message.error('全平台爬取失败');
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
      render: (pfs: string[]) => (
        <Space wrap>
          {pfs.map(platform => (
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
              onClick={() => executeCrawl(record)}
              disabled={record.status === 'stopped'}
              loading={loading}
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
              title="队列任务"
              value={queueStatus?.queueLength || 0}
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
            onClick={generateAIStrategyHandler}
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
          <Button
            icon={<ThunderboltOutlined />}
            onClick={executeAllPlatforms}
            loading={loading}
          >
            全平台爬取
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadQueueStatus}>
            刷新状态
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
            label={
              <Space>
                关键词
                <Button size="small" type="link" onClick={generateKeywords} loading={loading}>
                  AI生成
                </Button>
              </Space>
            }
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
                  {platforms.map(p => (
                    <Option key={p} value={p}>{p}</Option>
                  ))}
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
                tooltip={{ formatter: value => `${value}%` }}
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
                        {aiSuggestions.platformWeights?.map((_: any, index: number) => (
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
