/**
 * 将 MongoDB 现有数据同步到 Elasticsearch
 */
const { MongoClient } = require('mongodb');
const { Client } = require('@elastic/elasticsearch');

async function syncToES() {
  // MongoDB 连接
  const mongoUrl = 'mongodb://root:aiops%402024@localhost:27017/aiops?authSource=admin';
  const mongoClient = new MongoClient(mongoUrl);

  // ES 连接
  const esClient = new Client({ node: 'http://localhost:9200' });

  try {
    await mongoClient.connect();
    console.log('✅ 连接到 MongoDB');

    const db = mongoClient.db('aiops');
    const collection = db.collection('raw_content');

    // 获取所有文档
    const documents = await collection.find({}).toArray();
    console.log(`📊 找到 ${documents.length} 条文档`);

    let synced = 0;
    for (const doc of documents) {
      try {
        await esClient.index({
          index: 'raw_content',
          id: doc._id.toString(),
          document: {
            articleId: doc._id.toString(),
            title: doc.title || '',
            summary: doc.summary || '',
            fullContent: doc.summary || '', // 使用摘要作为全文
            author: doc.author || '',
            platform: doc.platform || '',
            tags: doc.tags || [],
            likes: doc.likes || 0,
            comments: doc.comments || 0,
            url: doc.url || '',
            publishTime: doc.publishTime || new Date(),
            crawledAt: doc.crawledAt || new Date(),
          },
        });
        synced++;
        console.log(`✅ 同步: ${doc.title}`);
      } catch (error) {
        console.error(`❌ 同步失败 ${doc.title}: ${error.message}`);
      }
    }

    console.log(`\n🎉 同步完成: ${synced}/${documents.length}`);

    // 刷新索引
    await esClient.indices.refresh({ index: 'raw_content' });
    console.log('✅ ES 索引已刷新');
  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await mongoClient.close();
    console.log('👋 关闭连接');
  }
}

syncToES();
