import React, { useEffect, useState } from 'react';
import { Card, Table, Tag } from 'antd';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import api from '../api';

const Analytics: React.FC = () => {
  const [trending, setTrending] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [trendingRes, statsRes]: any[] = await Promise.all([
        api.get('/analytics/trending?days=7'),
        api.get('/analytics/daily-stats?days=14'),
      ]);

      setTrending(trendingRes.topics || []);
      setDailyStats(statsRes.stats || []);
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  const columns = [
    {
      title: '排名',
      key: 'rank',
      width: 80,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: '关键词',
      dataIndex: 'keyword',
      key: 'keyword',
    },
    {
      title: '出现次数',
      dataIndex: 'count',
      key: 'count',
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
  ];

  return (
    <div>
      <h1>数据分析</h1>

      <Card title="每日发布统计" style={{ marginBottom: 24 }}>
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
            <Line type="monotone" dataKey="published_count" stroke="#8884d8" name="发布数" />
            <Line type="monotone" dataKey="total_likes" stroke="#82ca9d" name="总点赞" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="热门关键词 TOP 10">
        <Table
          columns={columns}
          dataSource={trending}
          pagination={false}
          rowKey="keyword"
        />
      </Card>
    </div>
  );
};

export default Analytics;
