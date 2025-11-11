import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Button, Space, message } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import api from '../api';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalPublished: 0,
    totalLikes: 0,
    avgEngagement: 0,
    publishRate: 0,
  });

  const loadStats = async () => {
    try {
      setLoading(true);
      const response: any = await api.get('/analytics/performance?days=7');
      setStats(response.metrics);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const triggerTask = async (task: string) => {
    try {
      message.loading(`正在触发${task}任务...`, 0);
      // 这里调用相应的 API
      await new Promise(resolve => setTimeout(resolve, 1000));
      message.destroy();
      message.success(`${task}任务已触发`);
    } catch (error) {
      message.error(`触发失败`);
    }
  };

  return (
    <div>
      <h1>数据面板</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总发布数"
              value={stats.totalPublished}
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
              value={stats.totalLikes}
              valueStyle={{ color: '#cf1322' }}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均互动"
              value={stats.avgEngagement}
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="发布频率"
              value={stats.publishRate}
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
            onClick={() => triggerTask('爬取')}
          >
            触发爬取
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => triggerTask('内容生成')}
          >
            生成内容
          </Button>
          <Button
            onClick={() => triggerTask('发布')}
          >
            触发发布
          </Button>
          <Button
            onClick={loadStats}
            loading={loading}
          >
            刷新数据
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Dashboard;
