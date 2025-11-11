import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, message } from 'antd';
import { EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';

interface Content {
  id: number;
  title: string;
  content: string;
  status: string;
  likes: number;
  comments: number;
  published_at: string;
  created_at: string;
}

const Content: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Content[]>([]);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      // 这里需要实现一个获取内容列表的 API
      const response: any = await api.get('/publisher/pending');
      setData(response.contents || []);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          pending: 'orange',
          published: 'green',
          failed: 'red',
        };
        return <Tag color={colorMap[status]}>{status}</Tag>;
      },
    },
    {
      title: '点赞',
      dataIndex: 'likes',
      key: 'likes',
      width: 80,
    },
    {
      title: '评论',
      dataIndex: 'comments',
      key: 'comments',
      width: 80,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Content) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedContent(record);
              setModalVisible(true);
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: '确认删除',
                content: '确定要删除这篇内容吗？',
                onOk: () => message.success('删除成功'),
              });
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h1>内容管理</h1>

      <Table
        loading={loading}
        columns={columns}
        dataSource={data}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />

      <Modal
        title="内容详情"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedContent && (
          <div>
            <h3>{selectedContent.title}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{selectedContent.content}</p>
            <div style={{ marginTop: 16 }}>
              <Tag>点赞: {selectedContent.likes}</Tag>
              <Tag>评论: {selectedContent.comments}</Tag>
              <Tag color={selectedContent.status === 'published' ? 'green' : 'orange'}>
                {selectedContent.status}
              </Tag>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Content;
