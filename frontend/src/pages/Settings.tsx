import React from 'react';
import { Card, Form, Input, Button, Switch, message } from 'antd';

const Settings: React.FC = () => {
  const [form] = Form.useForm();

  const onFinish = (values: any) => {
    console.log('Settings:', values);
    message.success('设置已保存');
  };

  return (
    <div>
      <h1>系统设置</h1>

      <Card title="爬取配置" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            crawlInterval: 6,
            publishInterval: 4,
            generateInterval: 12,
            autoPublish: false,
          }}
        >
          <Form.Item
            label="爬取间隔（小时）"
            name="crawlInterval"
            rules={[{ required: true, message: '请输入爬取间隔' }]}
          >
            <Input type="number" />
          </Form.Item>

          <Form.Item
            label="发布间隔（小时）"
            name="publishInterval"
            rules={[{ required: true, message: '请输入发布间隔' }]}
          >
            <Input type="number" />
          </Form.Item>

          <Form.Item
            label="生成间隔（小时）"
            name="generateInterval"
            rules={[{ required: true, message: '请输入生成间隔' }]}
          >
            <Input type="number" />
          </Form.Item>

          <Form.Item
            label="自动发布"
            name="autoPublish"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="API 配置">
        <Form layout="vertical">
          <Form.Item label="OpenAI API Key">
            <Input.Password placeholder="sk-..." />
          </Form.Item>

          <Form.Item label="Anthropic API Key">
            <Input.Password placeholder="sk-ant-..." />
          </Form.Item>

          <Form.Item>
            <Button type="primary">
              更新 API Keys
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;
