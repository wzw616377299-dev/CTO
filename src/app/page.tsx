'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowUp, 
  Image, 
  Clock, 
  Copy,
  Check,
  Loader2
} from 'lucide-react';
import { analyzeApi, uploadApi, getUserId } from '@/lib/api';
import Link from 'next/link';

export default function HomePage() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getUserId();
  }, []);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      // 收集所有图片
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      
      if (imageFiles.length > 0) {
        e.preventDefault();
        // 依次处理所有图片，追加文本
        for (const file of imageFiles) {
          await processImageFile(file);
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files) {
        // 处理所有拖入的图片
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            await processImageFile(file);
          }
        }
      }
    };
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);

  const processImageFile = async (file: File) => {
    try {
      setIsAnalyzing(true);
      const result = await uploadApi.image(file);
      if (result.text) {
        // 追加而不是替换
        setInputText(prev => {
          const newText = result.text;
          return prev ? `${prev}\n\n${newText}` : newText;
        });
        // 滚动到底部
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
          }
        }, 0);
      }
    } catch {
      alert('图片识别失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyze = useCallback(async () => {
    if (!inputText.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisResult('');
    
    try {
      const stream = await analyzeApi.stream(inputText, 'concise');
      if (!stream) throw new Error('No stream');
      
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setAnalysisResult(fullContent);
              }
            } catch {}
          }
        }
      }
    } catch {
      alert('分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }, [inputText, isAnalyzing]);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // 简单的 Markdown 渲染
  const renderMarkdown = (content: string): React.ReactNode => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inQuote = false;
    let quoteContent: string[] = [];
    let inList = false;
    let listItems: string[] = [];

    const flushQuote = () => {
      if (quoteContent.length > 0) {
        elements.push(
          <div key={`quote-${elements.length}`} className="bg-neutral-50 border-l-2 border-neutral-800 pl-3 py-2 my-2 group relative">
            <div className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed pr-8">
              {quoteContent.join('\n')}
            </div>
            <button
              onClick={() => copyText(quoteContent.join('\n'))}
              className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-200 transition-all"
            >
              {copiedText === quoteContent.join('\n') ? (
                <Check className="w-3.5 h-3.5 text-neutral-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-neutral-400" />
              )}
            </button>
          </div>
        );
        quoteContent = [];
      }
    };

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <div key={`list-${elements.length}`} className="space-y-1 my-2">
            {listItems.map((item, i) => (
              <div key={i} className="flex gap-2 text-sm text-neutral-700 group relative">
                <span className="text-neutral-400 shrink-0">•</span>
                <span className="flex-1">{item}</span>
                <button
                  onClick={() => copyText(item)}
                  className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-100 transition-all"
                >
                  {copiedText === item ? (
                    <Check className="w-3 h-3 text-neutral-600" />
                  ) : (
                    <Copy className="w-3 h-3 text-neutral-400" />
                  )}
                </button>
              </div>
            ))}
          </div>
        );
        listItems = [];
      }
    };

    lines.forEach((line, idx) => {
      // 引用块
      if (line.startsWith('> ')) {
        flushList();
        inQuote = true;
        quoteContent.push(line.slice(2));
        return;
      }
      
      if (inQuote && line.startsWith('> ')) {
        quoteContent.push(line.slice(2));
        return;
      }
      
      if (inQuote) {
        flushQuote();
        inQuote = false;
      }

      // 列表
      if (line.startsWith('- ')) {
        flushQuote();
        inList = true;
        listItems.push(line.slice(2));
        return;
      }

      if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ') || line.startsWith('4. ')) {
        flushQuote();
        inList = true;
        listItems.push(line.replace(/^\d+\.\s*/, ''));
        return;
      }

      if (inList && line.trim() === '') {
        flushList();
        inList = false;
      }

      if (inList) {
        // 继续列表项
        if (!line.startsWith('- ') && !line.match(/^\d+\.\s/)) {
          flushList();
          inList = false;
        }
      }

      // 标题
      if (line.startsWith('**') && line.endsWith('**')) {
        flushList();
        const title = line.slice(2, -2);
        elements.push(
          <h3 key={idx} className="text-sm font-medium text-neutral-900 mt-5 mb-2 first:mt-0">
            {title}
          </h3>
        );
        return;
      }

      // 空行
      if (line.trim() === '') {
        flushList();
        flushQuote();
        return;
      }

      // 普通段落
      flushList();
      flushQuote();
      
      // 处理加粗
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const renderedLine = parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-medium text-neutral-900">{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      elements.push(
        <p key={idx} className="text-sm text-neutral-700 leading-relaxed mb-1">
          {renderedLine}
        </p>
      );
    });

    // 处理结尾
    flushQuote();
    flushList();

    return elements;
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {isDragging && (
        <div className="fixed inset-0 bg-white/95 z-50 flex items-center justify-center border-2 border-dashed border-neutral-300 m-4">
          <div className="text-center">
            <Image className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
            <p className="text-neutral-600">释放以上传图片</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 border-b border-neutral-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 h-11 flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-900">PM 助手</span>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="gap-1.5 text-neutral-500 hover:text-neutral-900 h-8">
              <Clock className="w-3.5 h-3.5" />
              历史
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Input */}
        <div className="w-[380px] shrink-0 border-r border-neutral-100 flex flex-col">
          <div className="p-4 flex-1 flex flex-col min-h-0">
            {/* Input Area */}
            <div className="flex-1 min-h-0 flex flex-col">
              <Textarea
                ref={textareaRef}
                placeholder="粘贴开发说的话...&#10;&#10;支持 Ctrl+V 粘贴多张截图"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 min-h-0 border-neutral-200 text-sm placeholder:text-neutral-400 focus:border-neutral-300 resize-none overflow-y-auto"
                disabled={isAnalyzing}
              />
            </div>
            
            {/* Toolbar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (files) {
                      for (const file of files) {
                        await processImageFile(file);
                      }
                    }
                    e.target.value = '';
                  }}
                />
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
                  <Image className="w-4 h-4" />
                  <span>图片</span>
                </div>
              </label>
              
              <Button
                onClick={handleAnalyze}
                disabled={!inputText.trim() || isAnalyzing}
                className="bg-neutral-900 hover:bg-neutral-800 text-white rounded h-8 px-3 text-sm"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ArrowUp className="w-3.5 h-3.5 mr-1" />
                    分析
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-3xl">
            {isAnalyzing && !analysisResult && (
              <div className="flex items-center gap-2 text-neutral-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>分析中...</span>
              </div>
            )}

            {isAnalyzing && analysisResult && (
              <div className="text-sm text-neutral-600 leading-relaxed">
                {renderMarkdown(analysisResult)}
              </div>
            )}

            {!isAnalyzing && !analysisResult && (
              <div className="text-neutral-400 text-sm">
                输入开发说的话，我来帮你分析
              </div>
            )}

            {!isAnalyzing && analysisResult && (
              <div className="text-sm leading-relaxed">
                {renderMarkdown(analysisResult)}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
