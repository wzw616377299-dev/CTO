'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ChevronLeft, 
  Search, 
  Trash2, 
  Star, 
  StarOff,
  Loader2,
  MessageCircle
} from 'lucide-react';
import { recordsApi, getUserId } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AnalysisRecordItem {
  id: string;
  input_text: string;
  input_type: string;
  image_urls?: string[];
  title: string;
  mode: string;
  is_favorite: boolean;
  created_at: string;
  response_scripts?: string[];
}

export default function HistoryPage() {
  const [records, setRecords] = useState<AnalysisRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => { getUserId(); }, []);

  const router = useRouter();

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const result = await recordsApi.list({
        page,
        limit,
        search: search || undefined,
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
  }, [page, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除？')) return;
    
    try {
      await recordsApi.delete(id);
      fetchRecords();
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  };

  const handleToggleFavorite = async (record: AnalysisRecordItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await recordsApi.update(record.id, { isFavorite: !record.is_favorite });
      fetchRecords();
    } catch (error) {
      console.error('Failed to update favorite:', error);
    }
  };

  const handleContinueChat = (record: AnalysisRecordItem) => {
    router.push(`/?recordId=${record.id}`);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const totalPages = Math.ceil(total / limit);

  const getModeLabels = (mode: string) => {
    if (!mode) return [];
    return mode.split(',').map(m => {
      switch (m) {
        case 'work': return '企微沟通';
        case 'understand': return '技术理解';
        case 'concept': return '概念梳理';
        default: return m;
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800/60">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
              <span className="text-base">返回</span>
            </Link>
            <span className="text-slate-700">|</span>
            <span className="text-lg font-medium text-white">历史记录</span>
          </div>
          <span className="text-sm text-slate-500">{total} 条记录</span>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <Input
            placeholder="搜索历史记录..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-12 h-12 bg-slate-900/50 border-slate-800 text-white text-base placeholder:text-slate-600 focus:border-cyan-500/50 rounded-lg"
          />
        </div>

        {/* Records List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-900/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-800">
              <MessageCircle className="w-8 h-8 text-slate-700" />
            </div>
            <p className="text-lg text-slate-500">暂无记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div 
                key={record.id}
                onClick={() => handleContinueChat(record)}
                className="group bg-slate-900/30 border border-slate-800/60 rounded-xl p-4 hover:border-cyan-500/30 cursor-pointer transition-all hover:bg-slate-900/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-white truncate mb-1.5">
                      {record.title || '无标题'}
                    </h3>
                    <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                      {record.input_text}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                      <span>{formatDate(record.created_at)}</span>
                      {record.mode && getModeLabels(record.mode).map((label, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">
                          {label}
                        </span>
                      ))}
                      {record.image_urls && record.image_urls.length > 0 && (
                        <span className="text-slate-500">{record.image_urls.length} 张图片</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleToggleFavorite(record, e)}
                      className="p-2 rounded-lg hover:bg-slate-800/80 transition-colors"
                    >
                      {record.is_favorite ? (
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                      ) : (
                        <StarOff className="w-5 h-5 text-slate-500" />
                      )}
                    </button>
                    <button
                      onClick={(e) => handleDelete(record.id, e)}
                      className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-slate-400 hover:text-white hover:bg-slate-800/50 disabled:opacity-40"
            >
              上一页
            </Button>
            <span className="text-sm text-slate-500 px-4">{page} / {totalPages}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-slate-400 hover:text-white hover:bg-slate-800/50 disabled:opacity-40"
            >
              下一页
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
