import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Button, Space, message, Table, Tag, Modal } from 'antd';
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
  searchTrending,
} from '../api';
import ClaudeTaskMonitor from '../components/ClaudeTaskMonitor';
import ClaudeTaskDetail from '../components/ClaudeTaskDetail';
import ClaudeTaskHistory from '../components/ClaudeTaskHistory';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalPublished: 0,
    totalLikes: 0,
    avgEngagement: 0,
    publishRate: 0,
  });
  const [trendingContent, setTrendingContent] = useState<any[]>([]);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);

  // 任务详情状态
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const loadStats = async () => {
    try {
      setLoading(true);
      const [perfRes, trendingRes]: any[] = await Promise.all([
        analyticsGetPerformance(7).catch(() => ({ metrics: {} })),
        searchTrending(7, 10).catch(() => ({ hits: [] })),
      ]);

      if (perfRes.metrics) {
        setStats(perfRes.metrics);
      }
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
      const res: any = await crawlerExecuteAll({ streaming: true }); // 使用流式模式
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

  // 查看任务详情
  const handleViewTaskDetail = (taskId: string) => {
    setSelectedTaskId(taskId);
    setDetailModalVisible(true);
  };

  // 关闭任务详情
  const handleCloseDetail = () => {
    setDetailModalVisible(false);
    setSelectedTaskId(null);
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

      {/* Claude 任务监控 - 新组件 */}
      <div style={{ marginBottom: 24 }}>
        <ClaudeTaskMonitor
          onViewTaskDetail={handleViewTaskDetail}
          onViewHistory={() => setHistoryModalVisible(true)}
        />
      </div>

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

      {/* 任务详情弹窗 */}
      <Modal
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        footer={null}
        width={1000}
        style={{ top: 20 }}
        destroyOnClose
        title={null}
        closable={false}
        bodyStyle={{ padding: 0 }}
      >
        {selectedTaskId && (
          <ClaudeTaskDetail
            taskId={selectedTaskId}
            onBack={handleCloseDetail}
          />
        )}
      </Modal>

      {/* 历史任务弹窗 */}
      <Modal
        title="Claude 任务历史"
        open={historyModalVisible}
        onCancel={() => setHistoryModalVisible(false)}
        footer={null}
        width={1200}
        style={{ top: 20 }}
      >
        <ClaudeTaskHistory />
      </Modal>
    </div>
  );
};

export default Dashboard;
