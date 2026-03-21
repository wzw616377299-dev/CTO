'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Search, 
  Trash2, 
  Star, 
  StarOff, 
  Tag, 
  Plus,
  X,
  Download,
  FileText,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { recordsApi, tagsApi, getUserId } from '@/lib/api';
import Link from 'next/link';

interface TechnicalPoint {
  term: string;
  explanation: string;
  whyMentioned: string;
  impact: string;
}

interface IntentAnalysis {
  type: string;
  summary: string;
  reasoning: string;
}

interface TagType {
  id: string;
  name: string;
  color: string;
}

interface AnalysisRecordItem {
  id: string;
  input_text: string;
  input_type: string;
  title: string;
  mode: string;
  is_favorite: boolean;
  created_at: string;
  technical_points?: TechnicalPoint[];
  intent_analysis?: IntentAnalysis;
  response_scripts?: string[];
  follow_up_questions?: string[];
  knowledge_extension?: {
    summary: string;
    details: string[];
  };
  tags?: TagType[];
}

const INTENT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: '正常沟通', color: 'bg-green-100 text-green-800' },
  discussion: { label: '技术讨论', color: 'bg-blue-100 text-blue-800' },
  explanation: { label: '解释说明', color: 'bg-yellow-100 text-yellow-800' },
  obstruction: { label: '设置障碍', color: 'bg-orange-100 text-orange-800' },
  deflection: { label: '转移话题', color: 'bg-red-100 text-red-800' },
};

const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6b7280'
];

export default function HistoryPage() {
  const [records, setRecords] = useState<AnalysisRecordItem[]>([]);
  const [tags, setTags] = useState<TagType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecordItem | null>(null);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  // Ensure user ID exists
  useEffect(() => {
    getUserId();
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const result = await recordsApi.list({
        page,
        limit,
        search: search || undefined,
        tagId: selectedTag || undefined,
        favorite: favoriteOnly || undefined,
      });
      
      if (result.records) {
        setRecords(result.records);
        setTotal(result.total);
      }
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, selectedTag, favoriteOnly]);

  const fetchTags = useCallback(async () => {
    try {
      const result = await tagsApi.list();
      if (result.tags) {
        setTags(result.tags);
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchTags();
  }, [fetchRecords, fetchTags]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    try {
      await recordsApi.delete(id);
      fetchRecords();
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
    } catch (error) {
      console.error('Failed to delete record:', error);
      alert('删除失败，请重试');
    }
  };

  const handleToggleFavorite = async (record: AnalysisRecordItem) => {
    try {
      await recordsApi.update(record.id, { isFavorite: !record.is_favorite });
      fetchRecords();
    } catch (error) {
      console.error('Failed to update favorite:', error);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    
    try {
      const result = await tagsApi.create({ name: newTagName, color: newTagColor });
      if (result.tag) {
        setTags([...tags, result.tag]);
        setNewTagName('');
        setShowTagModal(false);
      }
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const handleExport = () => {
    const data = records.map(r => ({
      标题: r.title,
      内容: r.input_text,
      创建时间: new Date(r.created_at).toLocaleString('zh-CN'),
      技术点: r.technical_points?.map(p => p.term).join(', '),
      意图分析: r.intent_analysis?.summary,
      应对话术: r.response_scripts?.join('\n'),
    }));
    
    const headers = Object.keys(data[0] || {});
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${(row as Record<string, string>)[h] || ''}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `技术沟通记录_${new Date().toLocaleDateString('zh-CN')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  返回
                </Button>
              </Link>
              <div className="h-6 w-px bg-gray-200" />
              <h1 className="text-lg font-bold text-gray-900">历史记录</h1>
            </div>
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              导出
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Filter & List */}
          <div className="lg:col-span-1 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索记录..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={favoriteOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setFavoriteOnly(!favoriteOnly);
                  setPage(1);
                }}
                className="gap-2"
              >
                <Star className="w-4 h-4" />
                收藏
              </Button>
              
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={selectedTag === tag.id ? 'default' : 'outline'}
                  className="cursor-pointer"
                  style={{ 
                    backgroundColor: selectedTag === tag.id ? tag.color : 'transparent',
                    borderColor: tag.color,
                    color: selectedTag === tag.id ? 'white' : tag.color,
                  }}
                  onClick={() => {
                    setSelectedTag(selectedTag === tag.id ? '' : tag.id);
                    setPage(1);
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTagModal(true)}
                className="gap-1 text-gray-500"
              >
                <Plus className="w-3 h-3" />
                新标签
              </Button>
            </div>
            
            {/* Record List */}
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>暂无记录</p>
                </div>
              ) : (
                records.map((record) => (
                  <Card
                    key={record.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedRecord?.id === record.id ? 'ring-2 ring-indigo-500' : ''
                    }`}
                    onClick={() => setSelectedRecord(record)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {record.title || record.input_text.slice(0, 50)}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {new Date(record.created_at).toLocaleDateString('zh-CN')}
                            {record.intent_analysis && (
                              <Badge className={INTENT_TYPE_MAP[record.intent_analysis.type]?.color}>
                                {INTENT_TYPE_MAP[record.intent_analysis.type]?.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(record);
                            }}
                          >
                            {record.is_favorite ? (
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            ) : (
                              <StarOff className="w-4 h-4 text-gray-400" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(record.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                          </Button>
                        </div>
                      </div>
                      {record.tags && record.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {record.tags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="outline"
                              className="text-xs"
                              style={{ borderColor: tag.color, color: tag.color }}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          {/* Right: Record Detail */}
          <div className="lg:col-span-2">
            {selectedRecord ? (
              <div className="space-y-4">
                {/* Header */}
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">{selectedRecord.title}</CardTitle>
                    <p className="text-sm text-gray-500">
                      {new Date(selectedRecord.created_at).toLocaleString('zh-CN')}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-gray-700 whitespace-pre-wrap">{selectedRecord.input_text}</p>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Technical Points */}
                {selectedRecord.technical_points && selectedRecord.technical_points.length > 0 && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Tag className="w-5 h-5 text-blue-500" />
                        技术点拆解
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedRecord.technical_points.map((point, index) => (
                        <div key={index} className="p-3 bg-blue-50 rounded-lg">
                          <Badge className="bg-blue-100 text-blue-800 mb-2">{point.term}</Badge>
                          <p className="text-sm text-gray-700">{point.explanation}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                
                {/* Intent Analysis */}
                {selectedRecord.intent_analysis && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-base">意图分析</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-4 bg-amber-50 rounded-lg">
                        <Badge className={INTENT_TYPE_MAP[selectedRecord.intent_analysis.type]?.color}>
                          {INTENT_TYPE_MAP[selectedRecord.intent_analysis.type]?.label}
                        </Badge>
                        <p className="mt-2 text-gray-700">{selectedRecord.intent_analysis.summary}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Response Scripts */}
                {selectedRecord.response_scripts && selectedRecord.response_scripts.length > 0 && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-base">应对话术</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedRecord.response_scripts.map((script, index) => (
                        <div key={index} className="p-3 bg-green-50 rounded-lg text-gray-700">
                          {script}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                
                {/* Follow-up Questions */}
                {selectedRecord.follow_up_questions && selectedRecord.follow_up_questions.length > 0 && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-base">追问方向</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedRecord.follow_up_questions.map((question, index) => (
                        <div key={index} className="p-3 bg-purple-50 rounded-lg text-gray-700">
                          {question}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>选择一条记录查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* New Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-80">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                创建标签
                <Button variant="ghost" size="sm" onClick={() => setShowTagModal(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="标签名称"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded-full ${newTagColor === color ? 'ring-2 ring-offset-2' : ''}`}
                    style={{ backgroundColor: color, ['--tw-ring-color' as string]: color }}
                    onClick={() => setNewTagColor(color)}
                  />
                ))}
              </div>
              <Button className="w-full" onClick={handleCreateTag}>
                创建
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
