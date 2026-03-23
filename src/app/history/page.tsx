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

const COLORS = {
  primary: '#07C160',
  primaryLight: '#1AAD19',
};

export default function HistoryPage() {
  const [records, setRecords] = useState<AnalysisRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30;

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
    <div className="min-h-screen" style={{ backgroundColor: '#000000', color: '#E5E5E5' }}>
      {/* Header */}
      <header className="sticky top-0 z-40" style={{ backgroundColor: '#0A0A0A', borderBottom: '1px solid #1A1A1A' }}>
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1 transition-colors" style={{ color: '#666666' }}>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-base">返回</span>
            </Link>
            <span style={{ color: '#2C2C2C' }}>|</span>
            <span className="text-lg font-medium" style={{ color: '#FFFFFF' }}>历史记录</span>
          </div>
          <span className="text-sm" style={{ color: '#4A4A4A' }}>{total} 条记录</span>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#4A4A4A' }} />
          <Input
            placeholder="搜索历史记录..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-12 h-12 text-base rounded-lg"
            style={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A', color: '#FFFFFF' }}
          />
        </div>

        {/* Records List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#3C3C3C' }} />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A' }}>
              <MessageCircle className="w-8 h-8" style={{ color: '#2C2C2C' }} />
            </div>
            <p className="text-lg" style={{ color: '#4A4A4A' }}>暂无记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div 
                key={record.id}
                onClick={() => handleContinueChat(record)}
                className="group rounded-xl p-4 cursor-pointer transition-all"
                style={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium truncate mb-1.5" style={{ color: '#FFFFFF' }}>
                      {record.title || '无标题'}
                    </h3>
                    <p className="text-sm line-clamp-2 mb-3" style={{ color: '#666666' }}>
                      {record.input_text}
                    </p>
                    <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#4A4A4A' }}>
                      <span>{formatDate(record.created_at)}</span>
                      {record.mode && getModeLabels(record.mode).map((label, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(7, 193, 96, 0.1)', color: COLORS.primary, border: '1px solid rgba(7, 193, 96, 0.2)' }}>
                          {label}
                        </span>
                      ))}
                      {record.image_urls && record.image_urls.length > 0 && (
                        <span style={{ color: '#4A4A4A' }}>{record.image_urls.length} 张图片</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleToggleFavorite(record, e)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ backgroundColor: 'transparent' }}
                    >
                      {record.is_favorite ? (
                        <Star className="w-5 h-5" style={{ color: '#F59E0B', fill: '#F59E0B' }} />
                      ) : (
                        <StarOff className="w-5 h-5" style={{ color: '#4A4A4A' }} />
                      )}
                    </button>
                    <button
                      onClick={(e) => handleDelete(record.id, e)}
                      className="p-2 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" style={{ color: '#4A4A4A' }} />
                    </button>
                    <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(7, 193, 96, 0.1)', border: '1px solid rgba(7, 193, 96, 0.2)' }}>
                      <MessageCircle className="w-5 h-5" style={{ color: COLORS.primary }} />
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
              className="disabled:opacity-40"
              style={{ color: '#666666' }}
            >
              上一页
            </Button>
            <span className="text-sm px-4" style={{ color: '#4A4A4A' }}>{page} / {totalPages}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="disabled:opacity-40"
              style={{ color: '#666666' }}
            >
              下一页
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
