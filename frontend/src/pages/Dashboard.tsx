import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Button, Space, message, Table, Tag } from 'antd';
import {
  ArrowUpOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  analyticsGetPerformance,
  crawlerExecuteAll,
  crawlerScheduleTrigger,
  publisherPublishBatch,
  aiGetQueueStatus,
  searchTrending,
} from '../api';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalPublished: 0,
    totalLikes: 0,
    avgEngagement: 0,
    publishRate: 0,
  });
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [trendingContent, setTrendingContent] = useState<any[]>([]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const [perfRes, queueRes, trendingRes]: any[] = await Promise.all([
        analyticsGetPerformance(7).catch(() => ({ metrics: {} })),
        aiGetQueueStatus().catch(() => ({})),
        searchTrending(7, 10).catch(() => ({ hits: [] })),
      ]);

      if (perfRes.metrics) {
        setStats(perfRes.metrics);
      }
      setQueueStatus(queueRes);
      setTrendingContent(trendingRes.hits || []);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const triggerCrawl = async () => {
    try {
      message.loading('正在触发全平台爬取...', 0);
      const res: any = await crawlerExecuteAll();
      message.destroy();
      message.success(`爬取完成: ${res.totalArticles || 0} 篇文章`);
      loadStats();
    } catch (error) {
      message.destroy();
      message.error('爬取失败');
    }
  };

  const triggerScheduleCrawl = async () => {
    try {
      message.loading('正在触发定时爬取...', 0);
      await crawlerScheduleTrigger();
      message.destroy();
      message.success('定时爬取任务已触发');
    } catch (error) {
      message.destroy();
      message.error('触发失败');
    }
  };

  const triggerPublish = async () => {
    try {
      message.loading('正在批量发布...', 0);
      const res: any = await publisherPublishBatch(5);
      message.destroy();
      message.success(`发布完成: 成功 ${res.success || 0} 篇, 失败 ${res.failed || 0} 篇`);
      loadStats();
    } catch (error) {
      message.destroy();
      message.error('发布失败');
    }
  };

  const trendingColumns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
      render: (platform: string) => (
        <Tag color={
          platform === 'zhihu' ? 'blue' :
          platform === 'wechat' ? 'green' :
          platform === 'xiaohongshu' ? 'red' : 'default'
        }>
          {platform}
        </Tag>
      ),
    },
    {
      title: '热度',
      dataIndex: 'score',
      key: 'score',
      width: 80,
      render: (score: number) => score?.toFixed(0) || '-',
    },
  ];

  return (
    <div>
      <h1>数据面板</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总发布数"
              value={stats.totalPublished || 0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<ArrowUpOutlined />}
              suffix="篇"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总点赞数"
              value={stats.totalLikes || 0}
              valueStyle={{ color: '#cf1322' }}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均互动"
              value={stats.avgEngagement || 0}
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="发布频率"
              value={stats.publishRate || 0}
              precision={2}
              suffix="篇/天"
            />
          </Card>
        </Col>
      </Row>

      {queueStatus && (
        <Card title="AI 队列状态" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="队列长度" value={queueStatus.queueLength || 0} />
            </Col>
            <Col span={6}>
              <Statistic
                title="活跃 Worker"
                value={queueStatus.workers?.filter((w: any) => w.busy).length || 0}
                suffix={`/ ${queueStatus.workers?.length || 0}`}
              />
            </Col>
            <Col span={6}>
              <Statistic title="已完成任务" value={queueStatus.stats?.completedTasks || 0} />
            </Col>
            <Col span={6}>
              <Statistic title="失败任务" value={queueStatus.stats?.failedTasks || 0} />
            </Col>
          </Row>
        </Card>
      )}

      <Card title="快速操作" style={{ marginBottom: 24 }}>
        <Space size="large">
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={triggerCrawl}
          >
            全平台爬取
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={triggerScheduleCrawl}
          >
            定时爬取
          </Button>
          <Button
            icon={<CloudUploadOutlined />}
            onClick={triggerPublish}
          >
            批量发布
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadStats}
            loading={loading}
          >
            刷新数据
          </Button>
        </Space>
      </Card>

      <Card title="热门内容 (近7天)">
        <Table
          dataSource={trendingContent}
          columns={trendingColumns}
          rowKey={(record) => record.id || record._id || Math.random()}
          pagination={false}
          size="small"
          loading={loading}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
