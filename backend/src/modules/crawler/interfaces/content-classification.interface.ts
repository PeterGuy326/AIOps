/**
 * 内容分类枚举
 */
export enum ContentCategory {
  TECHNOLOGY = 'technology',
  BUSINESS = 'business',
  FINANCE = 'finance',
  EDUCATION = 'education',
  ENTERTAINMENT = 'entertainment',
  SPORTS = 'sports',
  HEALTH = 'health',
  SCIENCE = 'science',
  POLITICS = 'politics',
  LIFESTYLE = 'lifestyle',
  TRAVEL = 'travel',
  FOOD = 'food',
  FASHION = 'fashion',
  AUTOMOTIVE = 'automotive',
  REAL_ESTATE = 'real_estate',
  OTHER = 'other',
}

/**
 * 受众级别枚举
 */
export enum AudienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
  GENERAL = 'general',
}

/**
 * 内容分类结果接口
 */
export interface ContentClassification {
  category: ContentCategory;
  confidence: number;
  subCategories?: string[];
  keywords?: string[];
  audienceLevel?: AudienceLevel;
}

/**
 * 内容质量评分接口
 */
export interface QualityScore {
  overall: number;
  originality: number;
  readability: number;
  relevance: number;
  credibility: number;
}
