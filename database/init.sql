-- AIOps Database Schema

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500) NOT NULL,
  selectors JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Raw content table
CREATE TABLE IF NOT EXISTS raw_content (
  id SERIAL PRIMARY KEY,
  site_id INTEGER REFERENCES sites(id),
  title VARCHAR(500),
  content TEXT,
  author VARCHAR(100),
  likes INTEGER DEFAULT 0,
  url VARCHAR(500),
  crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generated contents table
CREATE TABLE IF NOT EXISTS contents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  image_url VARCHAR(500),
  tags JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id SERIAL PRIMARY KEY,
  keywords JSONB,
  min_likes INTEGER DEFAULT 0,
  content_type VARCHAR(50),
  negative_keywords JSONB,
  trend_insight TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CLI history table
CREATE TABLE IF NOT EXISTS cli_history (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_raw_content_crawled_at ON raw_content(crawled_at);
CREATE INDEX IF NOT EXISTS idx_raw_content_likes ON raw_content(likes);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_published_at ON contents(published_at);
CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(status);

-- Insert some sample site configurations
INSERT INTO sites (name, url, selectors) VALUES
  (
    '小红书热门',
    'https://www.xiaohongshu.com/explore',
    '{"itemSelector": ".note-item", "titleSelector": ".title", "authorSelector": ".author", "likesSelector": ".like-count", "linkSelector": "a"}'::jsonb
  ),
  (
    '知乎热榜',
    'https://www.zhihu.com/hot',
    '{"itemSelector": ".HotItem", "titleSelector": ".HotItem-title", "linkSelector": "a"}'::jsonb
  ),
  (
    '微博热搜',
    'https://s.weibo.com/top/summary',
    '{"itemSelector": "tbody tr", "titleSelector": "td:nth-child(2) a", "linkSelector": "a"}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- Insert a default strategy
INSERT INTO strategies (keywords, min_likes, content_type, negative_keywords, trend_insight, status) VALUES
  (
    '["热门", "推荐", "必看", "干货", "分享"]'::jsonb,
    100,
    'general',
    '["广告", "推广", "代购"]'::jsonb,
    'Default initial strategy focusing on popular and valuable content',
    'active'
  )
ON CONFLICT DO NOTHING;

-- Create a view for content performance
CREATE OR REPLACE VIEW content_performance AS
SELECT
  id,
  title,
  status,
  likes,
  comments,
  (likes + comments * 2) as engagement_score,
  published_at,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - published_at)) / 3600 as hours_since_publish
FROM contents
WHERE status = 'published';

COMMENT ON VIEW content_performance IS 'View showing content performance metrics';
