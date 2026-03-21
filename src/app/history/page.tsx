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
  Loader2,
  Sparkles
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
  normal: { label: '正常沟通', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  discussion: { label: '技术讨论', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  explanation: { label: '解释说明', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  obstruction: { label: '设置障碍', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  deflection: { label: '转移话题', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
};

const TAG_COLORS = [
  '#0071e3', '#5856d6', '#af52de', '#ff2d55', '#ff9500',
  '#ffcc00', '#34c759', '#00c7be', '#30b0c7', '#8e8e93'
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
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-black/5">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
              <ChevronLeft className="w-5 h-5" />
              <span>返回</span>
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <span className="font-semibold text-[17px]">历史记录</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleExport} 
            className="gap-2 text-[#0071e3] hover:text-[#0071e3] hover:bg-[#0071e3]/5"
          >
            <Download className="w-4 h-4" />
            导出
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Search & Filters */}
        <div className="mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索记录..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-11 h-11 bg-white border-black/5 rounded-xl"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setFavoriteOnly(!favoriteOnly);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                favoriteOnly 
                  ? 'bg-[#ffcc00]/10 text-[#ff9500] border border-[#ffcc00]/30' 
                  : 'bg-white text-gray-500 border border-black/5 hover:border-black/10'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${favoriteOnly ? 'fill-[#ffcc00]' : ''}`} />
              收藏
            </button>
            
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => {
                  setSelectedTag(selectedTag === tag.id ? '' : tag.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedTag === tag.id 
                    ? 'text-white' 
                    : 'bg-white text-gray-600 border border-black/5 hover:border-black/10'
                }`}
                style={selectedTag === tag.id ? { backgroundColor: tag.color } : {}}
              >
                {tag.name}
              </button>
            ))}
            
            <button
              onClick={() => setShowTagModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-gray-400 hover:text-gray-600 bg-white border border-black/5 hover:border-black/10 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              新标签
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Record List */}
          <div className="lg:col-span-2 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-[#0071e3]" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500">暂无记录</p>
              </div>
            ) : (
              records.map((record) => (
                <div
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  className={`bg-white rounded-xl p-4 cursor-pointer transition-all border ${
                    selectedRecord?.id === record.id 
                      ? 'border-[#0071e3]/30 shadow-sm' 
                      : 'border-black/5 hover:border-black/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {record.title || record.input_text.slice(0, 40)}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(record.created_at).toLocaleDateString('zh-CN', { 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(record);
                        }}
                        className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                      >
                        {record.is_favorite ? (
                          <Star className="w-4 h-4 text-[#ffcc00] fill-[#ffcc00]" />
                        ) : (
                          <StarOff className="w-4 h-4 text-gray-300" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(record.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {record.intent_analysis && (
                    <div className="mt-2">
                      <Badge className={INTENT_TYPE_MAP[record.intent_analysis.type]?.color}>
                        {INTENT_TYPE_MAP[record.intent_analysis.type]?.label}
                      </Badge>
                    </div>
                  )}
                  
                  {record.tags && record.tags.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {record.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="px-2 py-0.5 rounded text-xs text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
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
                  className="p-2 rounded-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-500">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-2 rounded-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {/* Record Detail */}
          <div className="lg:col-span-3">
            {selectedRecord ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="bg-white rounded-xl p-5 border border-black/5">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {selectedRecord.title}
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">
                    {new Date(selectedRecord.created_at).toLocaleString('zh-CN')}
                  </p>
                  <div className="bg-[#f5f5f7] rounded-xl p-4">
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {selectedRecord.input_text}
                    </p>
                  </div>
                </div>
                
                {/* Analysis Results */}
                {selectedRecord.technical_points && selectedRecord.technical_points.length > 0 && (
                  <div className="bg-white rounded-xl p-5 border border-black/5">
                    <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <span>📚</span> 技术点拆解
                    </h3>
                    <div className="space-y-3">
                      {selectedRecord.technical_points.map((point, index) => (
                        <div key={index} className="bg-[#f5f5f7] rounded-xl p-4">
                          <div className="font-medium text-gray-900">{point.term}</div>
                          <p className="text-[15px] text-gray-600 mt-1">{point.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedRecord.intent_analysis && (
                  <div className="bg-white rounded-xl p-5 border border-black/5">
                    <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <span>🎯</span> 意图分析
                    </h3>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={INTENT_TYPE_MAP[selectedRecord.intent_analysis.type]?.color}>
                        {INTENT_TYPE_MAP[selectedRecord.intent_analysis.type]?.label}
                      </Badge>
                    </div>
                    <p className="text-gray-700">{selectedRecord.intent_analysis.summary}</p>
                  </div>
                )}
                
                {selectedRecord.response_scripts && selectedRecord.response_scripts.length > 0 && (
                  <div className="bg-white rounded-xl p-5 border border-black/5">
                    <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <span>💬</span> 应对话术
                    </h3>
                    <div className="space-y-2">
                      {selectedRecord.response_scripts.map((script, index) => (
                        <div key={index} className="bg-[#f5f5f7] rounded-xl p-4 text-gray-700">
                          {script}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedRecord.follow_up_questions && selectedRecord.follow_up_questions.length > 0 && (
                  <div className="bg-white rounded-xl p-5 border border-black/5">
                    <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <span>❓</span> 追问方向
                    </h3>
                    <div className="space-y-2">
                      {selectedRecord.follow_up_questions.map((question, index) => (
                        <div key={index} className="bg-[#f5f5f7] rounded-xl p-4 text-gray-700">
                          {question}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-500">选择一条记录查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* New Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <span className="font-semibold">新建标签</span>
              <button
                onClick={() => setShowTagModal(false)}
                className="p-1 rounded-lg hover:bg-black/5 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <Input
                placeholder="标签名称"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="h-11"
              />
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      newTagColor === color ? 'scale-110 ring-2 ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: color, ['--tw-ring-color' as string]: color }}
                  />
                ))}
              </div>
              <Button 
                className="w-full h-11 bg-[#0071e3] hover:bg-[#0077ed]" 
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
