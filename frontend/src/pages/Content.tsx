import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, message, Input, Select, Card, Row, Col } from 'antd';
import {
  EyeOutlined,
  DeleteOutlined,
  SearchOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  searchContent,
  searchContentList,
  searchPopularTags,
  publisherPublishNow,
} from '../api';

const { Search } = Input;
const { Option } = Select;

interface ContentItem {
  id: string;
  _id?: string;
  title: string;
  content: string;
  summary?: string;
  platform: string;
  status: string;
  tags?: string[];
  likes?: number;
  comments?: number;
  author?: string;
  url?: string;
  publishTime?: string;
  crawledAt?: string;
  created_at?: string;
}

const Content: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ContentItem[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string | undefined>();
  const [popularTags, setPopularTags] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  const loadData = async (query?: string, platform?: string, page = 1) => {
    try {
      setLoading(true);

      if (query) {
        // 搜索模式 - 使用 ES 搜索
        const response: any = await searchContent({
          q: query,
          platform,
          from: (page - 1) * pagination.pageSize,
          size: pagination.pageSize,
        });

        setData(response.hits || []);
        setPagination(prev => ({
          ...prev,
          current: page,
          total: response.total || 0,
        }));
      } else {
        // 默认模式 - 获取所有爬取的内容
        const response: any = await searchContentList({
          platform,
          from: (page - 1) * pagination.pageSize,
          size: pagination.pageSize,
          sortBy: 'crawledAt',
          sortOrder: 'desc',
        });

        setData(response.hits || []);
        setPagination(prev => ({
          ...prev,
          current: page,
          total: response.total || 0,
        }));
      }
    } catch (error) {
      message.error('加载数据失败');
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPopularTags = async () => {
    try {
      const response: any = await searchPopularTags(20);
      setPopularTags(response.tags || []);
    } catch (error) {
      console.error('加载热门标签失败:', error);
    }
  };

  useEffect(() => {
    loadData();
    loadPopularTags();
  }, []);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    loadData(value, platformFilter, 1);
  };

  const handlePlatformChange = (value: string | undefined) => {
    setPlatformFilter(value);
    loadData(searchQuery, value, 1);
  };

  const handleTableChange = (pag: any) => {
    loadData(searchQuery, platformFilter, pag.current);
  };

  const handlePublish = async (item: ContentItem) => {
    try {
      message.loading('正在发布...', 0);
      const res: any = await publisherPublishNow({
        id: item.id || item._id,
        title: item.title,
        content: item.content,
      });

      message.destroy();
      if (res.result?.success) {
        message.success('发布成功');
        loadData(searchQuery, platformFilter, pagination.current);
      } else {
        message.error(res.result?.error || '发布失败');
      }
    } catch (error) {
      message.destroy();
      message.error('发布失败');
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: ContentItem) => (
        <a onClick={() => {
          setSelectedContent(record);
          setModalVisible(true);
        }}>
          {title}
        </a>
      ),
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
          platform === 'xiaohongshu' ? 'red' :
          platform === 'weibo' ? 'orange' : 'default'
        }>
          {platform || '未知'}
        </Tag>
      ),
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      width: 120,
      ellipsis: true,
      render: (author: string) => author || '-',
    },
    {
      title: '互动',
      key: 'engagement',
      width: 120,
      render: (_: any, record: ContentItem) => (
        <Space size={4}>
          {record.likes !== undefined && record.likes > 0 && (
            <Tag color="red">👍 {record.likes}</Tag>
          )}
          {record.comments !== undefined && record.comments > 0 && (
            <Tag color="blue">💬 {record.comments}</Tag>
          )}
          {(!record.likes && !record.comments) && '-'}
        </Space>
      ),
    },
    {
      title: '爬取时间',
      dataIndex: 'crawledAt',
      key: 'crawledAt',
      width: 160,
      render: (date: string, record: ContentItem) => {
        const time = date || record.created_at || record.publishTime;
        return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: ContentItem) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedContent(record);
              setModalVisible(true);
            }}
          >
            查看
          </Button>
          {record.url && (
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => window.open(record.url, '_blank')}
            >
              原文
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h1>内容管理</h1>

      {/* 搜索和筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Search
              placeholder="搜索内容..."
              allowClear
              enterButton={<><SearchOutlined /> 搜索</>}
              size="large"
              onSearch={handleSearch}
            />
          </Col>
          <Col>
            <Select
              placeholder="选择平台"
              allowClear
              style={{ width: 150 }}
              onChange={handlePlatformChange}
            >
              <Option value="zhihu">知乎</Option>
              <Option value="wechat">微信</Option>
              <Option value="weibo">微博</Option>
              <Option value="xiaohongshu">小红书</Option>
            </Select>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => loadData()}>
              刷新
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 热门标签 */}
      {popularTags.length > 0 && (
        <Card size="small" title="热门标签" style={{ marginBottom: 16 }}>
          <Space wrap>
            {popularTags.slice(0, 15).map((tag: any) => (
              <Tag
                key={tag.key || tag.tag}
                color="blue"
                style={{ cursor: 'pointer' }}
                onClick={() => handleSearch(tag.key || tag.tag)}
              >
                {tag.key || tag.tag} ({tag.doc_count || tag.count})
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* 内容列表 */}
      <Card>
        <Table
          loading={loading}
          columns={columns}
          dataSource={data}
          rowKey={(record) => record.id || record._id || Math.random().toString()}
          pagination={{
            ...pagination,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: false,
          }}
          onChange={handleTableChange}
        />
      </Card>

      {/* 内容详情 Modal */}
      <Modal
        title="内容详情"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={
          <Space>
            <Button onClick={() => setModalVisible(false)}>关闭</Button>
            {selectedContent?.url && (
              <Button
                type="primary"
                icon={<LinkOutlined />}
                onClick={() => window.open(selectedContent.url, '_blank')}
              >
                查看原文
              </Button>
            )}
          </Space>
        }
        width={800}
      >
        {selectedContent && (
          <div>
            <h2>{selectedContent.title}</h2>

            <Space style={{ marginBottom: 16 }} wrap>
              <Tag color="blue">{selectedContent.platform || '未知平台'}</Tag>
              {selectedContent.author && (
                <Tag color="purple">作者: {selectedContent.author}</Tag>
              )}
              {selectedContent.likes !== undefined && selectedContent.likes > 0 && (
                <Tag color="red">👍 {selectedContent.likes}</Tag>
              )}
              {selectedContent.comments !== undefined && selectedContent.comments > 0 && (
                <Tag color="blue">💬 {selectedContent.comments}</Tag>
              )}
            </Space>

            {selectedContent.tags && selectedContent.tags.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <strong>标签：</strong>
                <Space wrap>
                  {selectedContent.tags.map(tag => (
                    <Tag key={tag} color="cyan">{tag}</Tag>
                  ))}
                </Space>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <strong>内容：</strong>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  background: '#f5f5f5',
                  padding: 16,
                  borderRadius: 4,
                  maxHeight: 400,
                  overflow: 'auto',
                }}
              >
                {selectedContent.summary || selectedContent.content || '无内容'}
              </div>
            </div>

            <div style={{ color: '#999', fontSize: 12 }}>
              爬取时间：{dayjs(selectedContent.crawledAt || selectedContent.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Content;
