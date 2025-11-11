// MongoDB 初始化脚本
// 该脚本会在容器首次启动时自动执行

// 切换到 admin 数据库创建用户
db = db.getSiblingDB('admin');

// 创建 aiops 用户（如果不存在）
try {
  db.createUser({
    user: 'aiops',
    pwd: 'aiops@2024',
    roles: [
      { role: 'readWrite', db: 'aiops' },
      { role: 'dbAdmin', db: 'aiops' }
    ]
  });
  print('用户 aiops 创建成功');
} catch (e) {
  print('用户可能已存在: ' + e);
}

// 切换到 aiops 数据库
db = db.getSiblingDB('aiops');

// 创建集合（可选，因为 Mongoose 会自动创建）
db.createCollection('sites');
db.createCollection('raw_content');
db.createCollection('contents');
db.createCollection('strategies');
db.createCollection('cli_history');

// 插入一些默认数据
db.sites.insertMany([
  {
    name: '知乎',
    url: 'https://www.zhihu.com',
    selectors: {
      searchUrl: 'https://www.zhihu.com/search',
      type: 'zhihu'
    },
    createdAt: new Date()
  },
  {
    name: '微信公众号',
    url: 'https://weixin.sogou.com',
    selectors: {
      searchUrl: 'https://weixin.sogou.com/weixin',
      type: 'wechat'
    },
    createdAt: new Date()
  },
  {
    name: '新闻网站',
    url: 'https://news.baidu.com',
    selectors: {
      searchUrl: 'https://news.baidu.com/ns',
      type: 'news'
    },
    createdAt: new Date()
  }
]);

print('MongoDB 初始化完成');
