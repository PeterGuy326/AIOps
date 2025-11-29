import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Tooltip,
  Descriptions,
  Alert,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  LoginOutlined,
  LogoutOutlined,
  ChromeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  browserGetPlatforms,
  browserCheckLogin,
  browserCheckAllLogin,
  browserStartMainChrome,
  browserStopMainChrome,
  browserGetMainChromeStatus,
  browserMarkLoggedIn,
  browserMarkLoggedOut,
  browserUpdatePlatform,
  browserAddPlatform,
  browserGetPlatformDetail,
} from '../api';

interface PlatformInfo {
  platform: string;
  platformName: string;
  status: 'logged_in' | 'logged_out' | 'expired' | 'checking';
  username?: string;
  avatarUrl?: string;
  lastLoginTime?: string;
  lastCheckTime?: string;
  lastError?: string;
  enabled: boolean;
  loginUrl?: string;
}

const LoginManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [chromeRunning, setChromeRunning] = useState(false);
  const [checkingPlatform, setCheckingPlatform] = useState<string | null>(null);
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [currentPlatform, setCurrentPlatform] = useState<PlatformInfo | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [platformDetail, setPlatformDetail] = useState<any>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm] = Form.useForm();

  // 加载平台列表
  const loadPlatforms = async () => {
    setLoading(true);
    try {
      const res: any = await browserGetPlatforms();
      setPlatforms(res.platforms || []);
    } catch (error) {
      message.error('加载平台列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 检查 Chrome 状态
  const checkChromeStatus = async () => {
    try {
      const res: any = await browserGetMainChromeStatus();
      setChromeRunning(res.running);
    } catch {
      setChromeRunning(false);
    }
  };

  useEffect(() => {
    loadPlatforms();
    checkChromeStatus();
    // 定时检查 Chrome 状态
    const timer = setInterval(checkChromeStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  // 检测单个平台登录状态
  const handleCheckLogin = async (platform: string) => {
    setCheckingPlatform(platform);
    try {
      const res: any = await browserCheckLogin(platform);
      if (res.result?.isLoggedIn) {
        message.success(`${res.result.platform} 已登录`);
      } else {
        message.warning(`${res.result.platform} 未登录`);
      }
      loadPlatforms();
    } catch (error) {
      message.error('检测失败');
    } finally {
      setCheckingPlatform(null);
    }
  };

  // 检测所有平台
  const handleCheckAll = async () => {
    setLoading(true);
    try {
      await browserCheckAllLogin();
      message.success('检测完成');
      loadPlatforms();
    } catch (error) {
      message.error('检测失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开登录弹窗
  const openLoginModal = (platform: PlatformInfo) => {
    setCurrentPlatform(platform);
    setLoginModalVisible(true);
  };

  // 启动 Chrome 进行登录
  const handleStartLogin = async () => {
    if (!currentPlatform) return;

    try {
      message.loading('正在启动 Chrome...', 0);
      const res: any = await browserStartMainChrome(currentPlatform.platform);
      message.destroy();
      message.success(res.message || 'Chrome 已启动，请在浏览器中完成登录');
      setChromeRunning(true);
    } catch (error) {
      message.destroy();
      message.error('启动 Chrome 失败');
    }
  };

  // 关闭 Chrome
  const handleStopChrome = async () => {
    try {
      await browserStopMainChrome();
      message.success('Chrome 已关闭');
      setChromeRunning(false);
    } catch (error) {
      message.error('关闭 Chrome 失败');
    }
  };

  // 验证登录状态
  const handleVerifyLogin = async () => {
    if (!currentPlatform) return;

    setCheckingPlatform(currentPlatform.platform);
    try {
      const res: any = await browserCheckLogin(currentPlatform.platform);
      if (res.result?.isLoggedIn) {
        message.success('登录验证成功！');
        setLoginModalVisible(false);
        loadPlatforms();
      } else {
        message.warning('未检测到登录状态，请确认已在浏览器中完成登录');
      }
    } catch (error) {
      message.error('验证失败');
    } finally {
      setCheckingPlatform(null);
    }
  };

  // 手动标记登录状态
  const handleMarkLogin = async (platform: string, loggedIn: boolean) => {
    try {
      if (loggedIn) {
        await browserMarkLoggedIn(platform);
        message.success('已标记为已登录');
      } else {
        await browserMarkLoggedOut(platform);
        message.success('已标记为未登录');
      }
      loadPlatforms();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 切换启用状态
  const handleToggleEnabled = async (platform: string, enabled: boolean) => {
    try {
      await browserUpdatePlatform(platform, { enabled });
      message.success(enabled ? '已启用' : '已禁用');
      loadPlatforms();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 查看详情
  const handleViewDetail = async (platform: string) => {
    try {
      const res: any = await browserGetPlatformDetail(platform);
      setPlatformDetail(res);
      setDetailModalVisible(true);
    } catch (error) {
      message.error('获取详情失败');
    }
  };

  // 添加自定义平台
  const handleAddPlatform = async (values: any) => {
    try {
      await browserAddPlatform(values);
      message.success('添加成功');
      setAddModalVisible(false);
      addForm.resetFields();
      loadPlatforms();
    } catch (error: any) {
      message.error(error.response?.data?.message || '添加失败');
    }
  };

  // 状态标签
  const renderStatus = (status: string) => {
    const statusMap: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      logged_in: { color: 'success', icon: <CheckCircleOutlined />, text: '已登录' },
      logged_out: { color: 'error', icon: <CloseCircleOutlined />, text: '未登录' },
      expired: { color: 'warning', icon: <ExclamationCircleOutlined />, text: '已过期' },
      checking: { color: 'processing', icon: <SyncOutlined spin />, text: '检测中' },
    };
    const info = statusMap[status] || { color: 'default', icon: null, text: status };
    return (
      <Tag color={info.color}>
        {info.icon} {info.text}
      </Tag>
    );
  };

  // 统计数据
  const loggedInCount = platforms.filter(p => p.status === 'logged_in').length;
  const loggedOutCount = platforms.filter(p => p.status === 'logged_out').length;
  const enabledCount = platforms.filter(p => p.enabled).length;

  const columns = [
    {
      title: '平台',
      dataIndex: 'platformName',
      key: 'platformName',
      render: (name: string, record: PlatformInfo) => (
        <Space>
          {record.avatarUrl && (
            <img
              src={record.avatarUrl}
              alt={name}
              style={{ width: 24, height: 24, borderRadius: '50%' }}
            />
          )}
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: renderStatus,
    },
    {
      title: '登录账号',
      dataIndex: 'username',
      key: 'username',
      width: 150,
      render: (username?: string) => username || '-',
    },
    {
      title: '最后检测',
      dataIndex: 'lastCheckTime',
      key: 'lastCheckTime',
      width: 150,
      render: (time?: string) =>
        time ? dayjs(time).format('MM-DD HH:mm') : '-',
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: PlatformInfo) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={(checked) => handleToggleEnabled(record.platform, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: any, record: PlatformInfo) => (
        <Space size="small">
          <Tooltip title="检测登录状态">
            <Button
              size="small"
              icon={<SyncOutlined spin={checkingPlatform === record.platform} />}
              onClick={() => handleCheckLogin(record.platform)}
              loading={checkingPlatform === record.platform}
            >
              检测
            </Button>
          </Tooltip>
          <Tooltip title="打开浏览器登录">
            <Button
              size="small"
              type="primary"
              icon={<LoginOutlined />}
              onClick={() => openLoginModal(record)}
            >
              登录
            </Button>
          </Tooltip>
          <Tooltip title="查看详情">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.platform)}
            />
          </Tooltip>
          {record.status === 'logged_in' ? (
            <Tooltip title="标记为未登录">
              <Button
                size="small"
                danger
                icon={<LogoutOutlined />}
                onClick={() => handleMarkLogin(record.platform, false)}
              />
            </Tooltip>
          ) : (
            <Tooltip title="手动标记为已登录">
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleMarkLogin(record.platform, true)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h1>登录管理</h1>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="已登录"
              value={loggedInCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
              suffix={`/ ${platforms.length}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="未登录"
              value={loggedOutCount}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已启用"
              value={enabledCount}
              prefix={<SettingOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Chrome 状态"
              value={chromeRunning ? '运行中' : '已停止'}
              valueStyle={{ color: chromeRunning ? '#1890ff' : '#999' }}
              prefix={<ChromeOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Chrome 状态提示 */}
      {chromeRunning && (
        <Alert
          message="Chrome 浏览器正在运行"
          description="请在打开的 Chrome 浏览器中完成登录操作，登录完成后点击相应平台的「检测」按钮验证登录状态。"
          type="info"
          showIcon
          action={
            <Button size="small" danger onClick={handleStopChrome}>
              关闭 Chrome
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 平台列表 */}
      <Card
        title="平台登录状态"
        extra={
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}>
              添加平台
            </Button>
            <Button icon={<SyncOutlined />} onClick={handleCheckAll} loading={loading}>
              检测全部
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadPlatforms}>
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={platforms}
          columns={columns}
          rowKey="platform"
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      {/* 登录弹窗 */}
      <Modal
        title={`登录 ${currentPlatform?.platformName || ''}`}
        open={loginModalVisible}
        onCancel={() => setLoginModalVisible(false)}
        footer={null}
        width={500}
      >
        {currentPlatform && (
          <div>
            <Alert
              message="登录步骤"
              description={
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>点击"打开浏览器"按钮启动 Chrome</li>
                  <li>在打开的浏览器中完成登录操作</li>
                  <li>登录成功后，点击"验证登录状态"按钮</li>
                </ol>
              }
              type="info"
              style={{ marginBottom: 16 }}
            />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <strong>当前状态：</strong>
                {renderStatus(currentPlatform.status)}
                {currentPlatform.username && (
                  <span style={{ marginLeft: 8 }}>({currentPlatform.username})</span>
                )}
              </div>

              {currentPlatform.loginUrl && (
                <div>
                  <strong>登录地址：</strong>
                  <a href={currentPlatform.loginUrl} target="_blank" rel="noopener noreferrer">
                    {currentPlatform.loginUrl}
                  </a>
                </div>
              )}

              <Space>
                {!chromeRunning ? (
                  <Button type="primary" icon={<ChromeOutlined />} onClick={handleStartLogin}>
                    打开浏览器
                  </Button>
                ) : (
                  <Button danger icon={<ChromeOutlined />} onClick={handleStopChrome}>
                    关闭浏览器
                  </Button>
                )}
                <Button
                  icon={<SyncOutlined />}
                  onClick={handleVerifyLogin}
                  loading={checkingPlatform === currentPlatform.platform}
                  disabled={!chromeRunning}
                >
                  验证登录状态
                </Button>
              </Space>

              {currentPlatform.lastError && (
                <Alert
                  message="上次检测错误"
                  description={currentPlatform.lastError}
                  type="error"
                  showIcon
                />
              )}
            </Space>
          </div>
        )}
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="平台详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={700}
      >
        {platformDetail && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="平台标识">{platformDetail.platform}</Descriptions.Item>
            <Descriptions.Item label="平台名称">{platformDetail.platformName}</Descriptions.Item>
            <Descriptions.Item label="登录状态">
              {renderStatus(platformDetail.status)}
            </Descriptions.Item>
            <Descriptions.Item label="启用状态">
              {platformDetail.enabled ? '已启用' : '已禁用'}
            </Descriptions.Item>
            <Descriptions.Item label="登录账号">
              {platformDetail.username || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="最后登录">
              {platformDetail.lastLoginTime
                ? dayjs(platformDetail.lastLoginTime).format('YYYY-MM-DD HH:mm:ss')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="最后检测">
              {platformDetail.lastCheckTime
                ? dayjs(platformDetail.lastCheckTime).format('YYYY-MM-DD HH:mm:ss')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="用户数据目录" span={2}>
              <code>{platformDetail.userDataDir}</code>
            </Descriptions.Item>
            <Descriptions.Item label="检测 URL" span={2}>
              {platformDetail.checkConfig?.checkUrl}
            </Descriptions.Item>
            <Descriptions.Item label="登录 URL" span={2}>
              {platformDetail.checkConfig?.loginUrl}
            </Descriptions.Item>
            {platformDetail.lastError && (
              <Descriptions.Item label="最后错误" span={2}>
                <span style={{ color: '#ff4d4f' }}>{platformDetail.lastError}</span>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* 添加平台弹窗 */}
      <Modal
        title="添加自定义平台"
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          addForm.resetFields();
        }}
        onOk={() => addForm.submit()}
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddPlatform}>
          <Form.Item
            name="platform"
            label="平台标识"
            rules={[
              { required: true, message: '请输入平台标识' },
              { pattern: /^[a-z0-9_]+$/, message: '只能包含小写字母、数字和下划线' },
            ]}
          >
            <Input placeholder="如: my_platform" />
          </Form.Item>
          <Form.Item
            name="platformName"
            label="平台名称"
            rules={[{ required: true, message: '请输入平台名称' }]}
          >
            <Input placeholder="如: 我的平台" />
          </Form.Item>
          <Form.Item
            name="checkUrl"
            label="检测 URL"
            rules={[
              { required: true, message: '请输入检测 URL' },
              { type: 'url', message: '请输入有效的 URL' },
            ]}
          >
            <Input placeholder="用于检测登录状态的页面 URL" />
          </Form.Item>
          <Form.Item name="loginUrl" label="登录 URL">
            <Input placeholder="登录页面 URL（可选）" />
          </Form.Item>
          <Form.Item name="loggedInSelector" label="已登录选择器">
            <Input placeholder="如: .user-avatar（可选）" />
          </Form.Item>
          <Form.Item name="loggedOutSelector" label="未登录选择器">
            <Input placeholder="如: .login-button（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LoginManager;
