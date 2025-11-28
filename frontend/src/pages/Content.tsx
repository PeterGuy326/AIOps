import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, message, Input, Select, Card, Row, Col } from 'antd';
import {
  EyeOutlined,
  DeleteOutlined,
  SearchOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  searchContent,
  searchPopularTags,
  publisherGetPending,
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
  publishTime?: string;
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
        // 搜索模式
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
        // 获取待发布内容
        const response: any = await publisherGetPending();
        setData(response.contents || []);
        setPagination(prev => ({
          ...prev,
          current: 1,
          total: response.count || 0,
        }));
      }
    } catch (error) {
      message.error('加载数据失败');
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          pending: 'orange',
          published: 'green',
          failed: 'red',
          draft: 'default',
        };
        const textMap: Record<string, string> = {
          pending: '待发布',
          published: '已发布',
          failed: '失败',
          draft: '草稿',
        };
        return <Tag color={colorMap[status] || 'default'}>{textMap[status] || status}</Tag>;
      },
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tags: string[]) => (
        <Space wrap size={[0, 4]}>
          {(tags || []).slice(0, 3).map(tag => (
            <Tag key={tag} color="cyan">{tag}</Tag>
          ))}
          {tags && tags.length > 3 && <Tag>+{tags.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: '时间',
      dataIndex: 'publishTime',
      key: 'publishTime',
      width: 160,
      render: (date: string, record: ContentItem) => {
        const time = date || record.created_at;
        return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
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
          {record.status === 'pending' && (
            <Button
              type="link"
              size="small"
              icon={<CloudUploadOutlined />}
              onClick={() => handlePublish(record)}
            >
              发布
            </Button>
          )}
          <Button
            type="link"
            size="small"
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
          selectedContent?.status === 'pending' ? (
            <Space>
              <Button onClick={() => setModalVisible(false)}>关闭</Button>
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                onClick={() => {
                  handlePublish(selectedContent);
                  setModalVisible(false);
                }}
              >
                发布到小红书
              </Button>
            </Space>
          ) : null
        }
        width={800}
      >
        {selectedContent && (
          <div>
            <h2>{selectedContent.title}</h2>

            <Space style={{ marginBottom: 16 }}>
              <Tag color="blue">{selectedContent.platform || '未知平台'}</Tag>
              <Tag color={selectedContent.status === 'published' ? 'green' : 'orange'}>
                {selectedContent.status === 'published' ? '已发布' : '待发布'}
              </Tag>
              {selectedContent.likes !== undefined && (
                <Tag>点赞: {selectedContent.likes}</Tag>
              )}
              {selectedContent.comments !== undefined && (
                <Tag>评论: {selectedContent.comments}</Tag>
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

            {selectedContent.summary && (
              <div style={{ marginBottom: 16 }}>
                <strong>摘要：</strong>
                <p style={{ color: '#666' }}>{selectedContent.summary}</p>
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
                {selectedContent.content}
              </div>
            </div>

            <div style={{ color: '#999', fontSize: 12 }}>
              创建时间：{dayjs(selectedContent.publishTime || selectedContent.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Content;
