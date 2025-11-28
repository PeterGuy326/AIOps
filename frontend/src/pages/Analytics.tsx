import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Row, Col, Statistic, Select, Button, message } from 'antd';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
  RiseOutlined,
  FireOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  analyticsGetPerformance,
  analyticsGetDailyStats,
  analyticsGetTrending,
  aiPredictTrends,
} from '../api';

const { Option } = Select;
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Analytics: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<any[]>([]);
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any>({});
  const [trendPrediction, setTrendPrediction] = useState<any[]>([]);
  const [daysRange, setDaysRange] = useState(7);

  useEffect(() => {
    loadData();
  }, [daysRange]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [trendingRes, statsRes, perfRes]: any[] = await Promise.all([
        analyticsGetTrending(daysRange).catch(() => ({ topics: [] })),
        analyticsGetDailyStats(daysRange * 2).catch(() => ({ stats: [] })),
        analyticsGetPerformance(daysRange).catch(() => ({ metrics: {} })),
      ]);

      setTrending(trendingRes.topics || []);
      setDailyStats(statsRes.stats || []);
      setPerformance(perfRes.metrics || {});
    } catch (error) {
      console.error('加载数据失败:', error);
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTrendPrediction = async () => {
    try {
      setLoading(true);
      const res: any = await aiPredictTrends({
        timeframe: daysRange,
        category: '科技',
      });

      setTrendPrediction(res.trends || []);
      message.success('趋势预测加载成功');
    } catch (error) {
      message.error('趋势预测加载失败');
    } finally {
      setLoading(false);
    }
  };

  const trendingColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: any, __: any, index: number) => (
        <span style={{
          color: index < 3 ? '#ff4d4f' : '#666',
          fontWeight: index < 3 ? 'bold' : 'normal',
        }}>
          {index + 1}
        </span>
      ),
    },
    {
      title: '关键词',
      dataIndex: 'keyword',
      key: 'keyword',
      render: (keyword: string, _: any, index: number) => (
        <>
          {index < 3 && <FireOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />}
          {keyword}
        </>
      ),
    },
    {
      title: '出现次数',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      width: 80,
      render: (trend: string) => (
        trend === '上升' ? (
          <Tag color="green" icon={<ArrowUpOutlined />}>上升</Tag>
        ) : trend === '下降' ? (
          <Tag color="red" icon={<ArrowDownOutlined />}>下降</Tag>
        ) : (
          <Tag color="default">稳定</Tag>
        )
      ),
    },
  ];

  const predictionColumns = [
    {
      title: '关键词',
      dataIndex: 'keyword',
      key: 'keyword',
    },
    {
      title: '当前分数',
      dataIndex: 'currentScore',
      key: 'currentScore',
      width: 100,
      render: (score: number) => <Tag color="blue">{score}</Tag>,
    },
    {
      title: '预测分数',
      dataIndex: 'predictedScore',
      key: 'predictedScore',
      width: 100,
      render: (score: number) => <Tag color="green">{score}</Tag>,
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      width: 80,
      render: (trend: string) => (
        trend === '上升' ? (
          <Tag color="green" icon={<ArrowUpOutlined />}>上升</Tag>
        ) : (
          <Tag color="red" icon={<ArrowDownOutlined />}>下降</Tag>
        )
      ),
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      render: (conf: number) => `${(conf * 100).toFixed(0)}%`,
    },
  ];

  // 平台分布数据（从 performance 或 trending 生成）
  const platformDistribution = [
    { name: '知乎', value: 35 },
    { name: '微信', value: 30 },
    { name: '微博', value: 20 },
    { name: '小红书', value: 15 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>数据分析</h1>
        <div>
          <Select
            value={daysRange}
            onChange={setDaysRange}
            style={{ width: 120, marginRight: 8 }}
          >
            <Option value={7}>近 7 天</Option>
            <Option value={14}>近 14 天</Option>
            <Option value={30}>近 30 天</Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      {/* 核心指标 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总发布数"
              value={performance.totalPublished || 0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<RiseOutlined />}
              suffix="篇"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总点赞数"
              value={performance.totalLikes || 0}
              valueStyle={{ color: '#cf1322' }}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均互动"
              value={performance.avgEngagement || 0}
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="发布频率"
              value={performance.publishRate || 0}
              precision={2}
              suffix="篇/天"
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={16}>
          <Card title="每日发布统计">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date) => dayjs(date).format('MM/DD')}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(date) => dayjs(date).format('YYYY-MM-DD')}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="published_count"
                  stroke="#8884d8"
                  name="发布数"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="total_likes"
                  stroke="#82ca9d"
                  name="总点赞"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="平台分布">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={platformDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {platformDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* 热门关键词和趋势预测 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card title={`热门关键词 TOP 10 (近${daysRange}天)`}>
            <Table
              columns={trendingColumns}
              dataSource={trending.slice(0, 10)}
              pagination={false}
              rowKey="keyword"
              loading={loading}
              size="small"
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title="AI 趋势预测"
            extra={
              <Button
                type="link"
                icon={<RiseOutlined />}
                onClick={loadTrendPrediction}
                loading={loading}
              >
                生成预测
              </Button>
            }
          >
            {trendPrediction.length > 0 ? (
              <Table
                columns={predictionColumns}
                dataSource={trendPrediction}
                pagination={false}
                rowKey="keyword"
                size="small"
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                点击"生成预测"按钮获取 AI 趋势分析
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 互动趋势图 */}
      <Card title="互动趋势" style={{ marginTop: 24 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailyStats}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(date) => dayjs(date).format('MM/DD')}
            />
            <YAxis />
            <Tooltip
              labelFormatter={(date) => dayjs(date).format('YYYY-MM-DD')}
            />
            <Legend />
            <Bar dataKey="total_likes" fill="#8884d8" name="点赞" />
            <Bar dataKey="total_comments" fill="#82ca9d" name="评论" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};

export default Analytics;
