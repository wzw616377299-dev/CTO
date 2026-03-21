'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  Search, 
  Trash2, 
  Star, 
  StarOff, 
  Plus,
  X,
  Download,
  FileText,
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

const INTENT_TYPE_MAP: Record<string, { label: string }> = {
  normal: { label: '正常沟通' },
  discussion: { label: '技术讨论' },
  explanation: { label: '解释说明' },
  obstruction: { label: '设置障碍' },
  deflection: { label: '转移话题' },
};

const TAG_COLORS = [
  '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4',
  '#171717', '#262626', '#525252', '#737373', '#a3a3a3'
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
    if (!confirm('确定删除？')) return;
    
    try {
      await recordsApi.delete(id);
      fetchRecords();
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
    } catch (error) {
      console.error('Failed to delete record:', error);
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
      时间: new Date(r.created_at).toLocaleString('zh-CN'),
      技术点: r.technical_points?.map(p => p.term).join(', '),
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
    a.download = `记录_${new Date().toLocaleDateString('zh-CN')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-neutral-100">
        <div className="max-w-4xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1 text-neutral-500 hover:text-neutral-900 transition-colors">
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">返回</span>
            </Link>
            <span className="text-neutral-300">|</span>
            <span className="font-medium text-neutral-900">历史记录</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleExport} 
            className="gap-2 text-neutral-500 hover:text-neutral-900"
          >
            <Download className="w-4 h-4" />
            导出
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {/* Search & Filters */}
        <div className="mb-6">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              placeholder="搜索..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9 border-neutral-200 focus:border-neutral-400"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setFavoriteOnly(!favoriteOnly);
                setPage(1);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-sm transition-colors ${
                favoriteOnly 
                  ? 'bg-neutral-900 text-white' 
                  : 'border border-neutral-200 text-neutral-600 hover:border-neutral-300'
              }`}
            >
              <Star className={`w-3 h-3 ${favoriteOnly ? 'fill-white' : ''}`} />
              收藏
            </button>
            
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => {
                  setSelectedTag(selectedTag === tag.id ? '' : tag.id);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded text-sm transition-colors ${
                  selectedTag === tag.id 
                    ? 'bg-neutral-900 text-white' 
                    : 'border border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
              >
                {tag.name}
              </button>
            ))}
            
            <button
              onClick={() => setShowTagModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-sm text-neutral-400 hover:text-neutral-600 border border-neutral-200 hover:border-neutral-300 transition-colors"
            >
              <Plus className="w-3 h-3" />
              标签
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Record List */}
          <div className="md:col-span-2 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                <p className="text-sm text-neutral-400">暂无记录</p>
              </div>
            ) : (
              records.map((record) => (
                <div
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  className={`p-3 cursor-pointer transition-colors border rounded ${
                    selectedRecord?.id === record.id 
                      ? 'border-neutral-400 bg-neutral-50' 
                      : 'border-neutral-100 hover:border-neutral-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {record.title || record.input_text.slice(0, 30)}
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {new Date(record.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(record);
                        }}
                        className="p-1 rounded hover:bg-neutral-100 transition-colors"
                      >
                        {record.is_favorite ? (
                          <Star className="w-3.5 h-3.5 text-neutral-900 fill-neutral-900" />
                        ) : (
                          <StarOff className="w-3.5 h-3.5 text-neutral-300" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(record.id);
                        }}
                        className="p-1 rounded hover:bg-neutral-100 text-neutral-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  
                  {record.intent_analysis && (
                    <Badge variant="outline" className="mt-2 text-xs border-neutral-200 text-neutral-600">
                      {INTENT_TYPE_MAP[record.intent_analysis.type]?.label}
                    </Badge>
                  )}
                </div>
              ))
            )}
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-neutral-400">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {/* Record Detail */}
          <div className="md:col-span-3">
            {selectedRecord ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="border border-neutral-200 rounded p-4">
                  <h2 className="font-medium text-neutral-900 mb-1">
                    {selectedRecord.title}
                  </h2>
                  <p className="text-xs text-neutral-400 mb-3">
                    {new Date(selectedRecord.created_at).toLocaleString('zh-CN')}
                  </p>
                  <div className="bg-neutral-50 rounded p-3">
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">
                      {selectedRecord.input_text}
                    </p>
                  </div>
                </div>
                
                {/* Technical Points */}
                {selectedRecord.technical_points && selectedRecord.technical_points.length > 0 && (
                  <div className="border border-neutral-200 rounded p-4">
                    <h3 className="text-sm font-medium text-neutral-900 mb-3">技术点</h3>
                    <div className="space-y-3">
                      {selectedRecord.technical_points.map((point, index) => (
                        <div key={index} className="border-l-2 border-neutral-200 pl-3">
                          <div className="text-sm font-medium text-neutral-900">{point.term}</div>
                          <p className="text-sm text-neutral-600 mt-0.5">{point.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Intent */}
                {selectedRecord.intent_analysis && (
                  <div className="border border-neutral-200 rounded p-4">
                    <h3 className="text-sm font-medium text-neutral-900 mb-2">意图</h3>
                    <Badge variant="outline" className="border-neutral-300 text-neutral-700">
                      {INTENT_TYPE_MAP[selectedRecord.intent_analysis.type]?.label}
                    </Badge>
                    <p className="text-sm text-neutral-600 mt-2">{selectedRecord.intent_analysis.summary}</p>
                  </div>
                )}
                
                {/* Scripts */}
                {selectedRecord.response_scripts && selectedRecord.response_scripts.length > 0 && (
                  <div className="border border-neutral-200 rounded p-4">
                    <h3 className="text-sm font-medium text-neutral-900 mb-3">话术</h3>
                    <div className="space-y-2">
                      {selectedRecord.response_scripts.map((script, index) => (
                        <div key={index} className="bg-neutral-50 rounded p-3 text-sm text-neutral-700">
                          {script}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Questions */}
                {selectedRecord.follow_up_questions && selectedRecord.follow_up_questions.length > 0 && (
                  <div className="border border-neutral-200 rounded p-4">
                    <h3 className="text-sm font-medium text-neutral-900 mb-3">追问</h3>
                    <div className="space-y-2">
                      {selectedRecord.follow_up_questions.map((question, index) => (
                        <div key={index} className="bg-neutral-50 rounded p-3 text-sm text-neutral-700">
                          {question}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center border border-neutral-100 rounded">
                <div className="text-center">
                  <FileText className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                  <p className="text-sm text-neutral-400">选择记录查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-72">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="text-sm font-medium">新建标签</span>
              <button
                onClick={() => setShowTagModal(false)}
                className="p-1 rounded hover:bg-neutral-100 transition-colors"
              >
                <X className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <Input
                placeholder="标签名称"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="h-9 border-neutral-200"
              />
              <div className="flex flex-wrap gap-1.5">
                {TAG_COLORS.slice(0, 5).map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      newTagColor === color ? 'scale-110 ring-2 ring-offset-1 ring-neutral-400' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <Button 
                className="w-full h-9 bg-neutral-900 hover:bg-neutral-800" 
                onClick={handleCreateTag}
              >
                创建
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
