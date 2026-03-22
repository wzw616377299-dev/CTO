import { NextRequest, NextResponse } from 'next/server';
import { SearchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { query, count = 5 } = await request.json();
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '请输入搜索内容' }, { status: 400 });
    }
    
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new SearchClient(config, customHeaders);
    
    const response = await client.webSearch(query, count, true);
    
    const results = (response.web_items || []).map(item => ({
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      siteName: item.site_name,
      publishTime: item.publish_time,
    }));
    
    return NextResponse.json({
      summary: response.summary,
      results,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
