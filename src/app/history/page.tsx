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
  ArrowRight,
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
    // 跳转到首页并带上记录ID
    router.push(`/?recordId=${record.id}`);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
              <span className="text-base">返回</span>
            </Link>
            <span className="text-zinc-700">|</span>
            <span className="text-lg font-medium text-white">历史记录</span>
          </div>
          <span className="text-sm text-zinc-500">{total} 条记录</span>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <Input
            placeholder="搜索历史记录..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-12 h-12 bg-zinc-900 border-zinc-800 text-white text-base placeholder:text-zinc-600 focus:border-amber-500/50"
          />
        </div>

        {/* Records List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-base">暂无记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div 
                key={record.id}
                onClick={() => handleContinueChat(record)}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-white truncate mb-1">
                      {record.title || '无标题'}
                    </h3>
                    <p className="text-sm text-zinc-500 line-clamp-2 mb-2">
                      {record.input_text}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-zinc-600">
                      <span>{formatDate(record.created_at)}</span>
                      {record.mode && (
                        <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">
                          {record.mode === 'work' ? '企微沟通' : record.mode === 'understand' ? '技术理解' : '概念梳理'}
                        </span>
                      )}
                      {record.image_urls && record.image_urls.length > 0 && (
                        <span className="text-zinc-500">{record.image_urls.length} 张图片</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleToggleFavorite(record, e)}
                      className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      {record.is_favorite ? (
                        <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                      ) : (
                        <StarOff className="w-5 h-5 text-zinc-500" />
                      )}
                    </button>
                    <button
                      onClick={(e) => handleDelete(record.id, e)}
                      className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
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
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              上一页
            </Button>
            <span className="text-sm text-zinc-500 px-4">{page} / {totalPages}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              下一页
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
