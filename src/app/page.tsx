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
  Loader2,
  Square,
  X,
  Plus,
  GitBranch,
  Trash2
} from 'lucide-react';
import { analyzeApi, uploadApi, ocrApi, getUserId, recordsApi } from '@/lib/api';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface ImageItem {
  id: string;
  url: string;
  name: string;
  isUploading: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SCENARIOS = [
  { id: 'work', label: '企微沟通' },
  { id: 'understand', label: '技术理解' },
  { id: 'concept', label: '概念梳理' },
];

const MAX_IMAGES = 20;

export default function HomePage() {
  const searchParams = useSearchParams();
  const recordId = searchParams.get('recordId');
  
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('work');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOcring, setIsOcring] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  
  const [followUpText, setFollowUpText] = useState('');
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  
  const [reportContent, setReportContent] = useState<string>('');
  const [generateReport, setGenerateReport] = useState(false);
  
  const [topicTitle, setTopicTitle] = useState<string>('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getUserId(); }, []);
  
  // 加载历史记录
  useEffect(() => {
    if (recordId) {
      const loadRecord = async () => {
        setIsLoadingRecord(true);
        try {
          const result = await recordsApi.get(recordId);
          if (result.record) {
            const record = result.record;
            setInputText(record.input_text || '');
            setTopicTitle(record.title || '');
            setSelectedScenario(record.mode || 'work');
            
            // 设置对话历史
            const history: Message[] = [];
            if (record.input_text) {
              history.push({ role: 'user', content: record.input_text });
            }
            // 使用 response_scripts 存储分析结果
            if (record.response_scripts && record.response_scripts.length > 0) {
              const analysisContent = record.response_scripts.join('\n\n');
              history.push({ role: 'assistant', content: analysisContent });
              setAnalysisResult(analysisContent);
            }
            setConversationHistory(history);
            
            // 加载图片
            if (record.image_urls && record.image_urls.length > 0) {
              setImages(record.image_urls.map((url: string, idx: number) => ({
                id: `loaded-${idx}`,
                url,
                name: `图片${idx + 1}`,
                isUploading: false
              })));
            }
          }
        } catch (error) {
          console.error('Failed to load record:', error);
        } finally {
          setIsLoadingRecord(false);
        }
      };
      loadRecord();
    }
  }, [recordId]);

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [analysisResult, reportContent]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        for (const file of imageFiles) await uploadImage(file);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [images]);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files) {
        for (const file of files) {
          if (file.type.startsWith('image/')) await uploadImage(file);
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
  }, [images]);

  const uploadImage = async (file: File) => {
    if (images.length >= MAX_IMAGES) return;
    const tempId = `temp-${Date.now()}`;
    setImages(prev => [...prev, { id: tempId, url: '', name: file.name, isUploading: true }]);
    try {
      const result = await uploadApi.image(file);
      if (result.url) setImages(prev => prev.map(img => img.id === tempId ? { ...img, url: result.url, isUploading: false } : img));
    } catch {
      setImages(prev => prev.filter(img => img.id !== tempId));
    }
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));
  
  const clearAll = () => {
    setInputText('');
    setImages([]);
    setAnalysisResult('');
    setConversationHistory([]);
    setReportContent('');
    setTopicTitle('');
  };

  const handleAnalyze = useCallback(async () => {
    const hasText = inputText.trim().length > 0;
    const hasImages = images.length > 0;
    if (!hasText && !hasImages) return;
    
    setIsAnalyzing(true);
    setAnalysisResult('');
    setConversationHistory([]);
    setReportContent('');
    setTopicTitle('');
    
    try {
      let finalText = inputText;
      
      if (hasImages) {
        setIsOcring(true);
        ocrAbortControllerRef.current = new AbortController();
        const imageUrls = images.filter(img => img.url).map(img => img.url);
        const ocrResult = await ocrApi.batch(imageUrls, ocrAbortControllerRef.current.signal);
        if (ocrResult.text) finalText = finalText ? `${finalText}\n\n---\n\n${ocrResult.text}` : ocrResult.text;
        setIsOcring(false);
      }
      
      if (!finalText.trim()) { setIsAnalyzing(false); return; }
      
      abortControllerRef.current = new AbortController();
      const stream = await analyzeApi.stream(finalText, selectedScenario, abortControllerRef.current.signal, generateReport);
      if (!stream) throw new Error('No stream');
      
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let reportText = '';
      
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
              if (parsed.topicTitle) setTopicTitle(parsed.topicTitle);
              if (parsed.reportContent) { reportText += parsed.reportContent; setReportContent(reportText); }
              if (parsed.content) { fullContent += parsed.content; setAnalysisResult(fullContent); }
            } catch {}
          }
        }
      }
      
      // 生成主题标题（从内容中提取）
      if (fullContent) {
        const firstLine = fullContent.split('\n').find(l => l.trim() && !l.startsWith('#')) || '';
        const title = firstLine.replace(/\*\*/g, '').slice(0, 20);
        setTopicTitle(title || '技术分析');
      }
      
      setConversationHistory([
        { role: 'user', content: finalText },
        { role: 'assistant', content: fullContent }
      ]);
    } catch {}
    finally {
      setIsAnalyzing(false);
      setIsOcring(false);
      abortControllerRef.current = null;
      ocrAbortControllerRef.current = null;
    }
  }, [inputText, images, selectedScenario, generateReport]);

  const handleFollowUp = useCallback(async () => {
    if (!followUpText.trim() || conversationHistory.length === 0) return;
    
    setIsFollowUp(true);
    const userQuestion = followUpText;
    setFollowUpText('');
    
    try {
      abortControllerRef.current = new AbortController();
      const stream = await analyzeApi.followUp(conversationHistory, userQuestion, selectedScenario, abortControllerRef.current.signal);
      if (!stream) throw new Error('No stream');
      
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let replyContent = '';
      
      setAnalysisResult(prev => prev + '\n\n---\n\n**追问：** ' + userQuestion + '\n\n');
      const newHistory = [...conversationHistory, { role: 'user' as const, content: userQuestion }];
      
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
              if (parsed.content) { replyContent += parsed.content; setAnalysisResult(prev => prev + parsed.content); }
            } catch {}
          }
        }
      }
      setConversationHistory([...newHistory, { role: 'assistant' as const, content: replyContent }]);
    } catch {}
    finally { setIsFollowUp(false); abortControllerRef.current = null; }
  }, [followUpText, conversationHistory, selectedScenario]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    ocrAbortControllerRef.current?.abort();
    setIsAnalyzing(false);
    setIsOcring(false);
    setIsFollowUp(false);
  }, []);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // 完整的 Markdown 渲染
  const renderMarkdown = (content: string): React.ReactNode => {
    if (!content) return null;
    
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    const renderInline = (text: string): React.ReactNode => {
      if (!text) return null;
      
      // 处理行内代码 `code`
      const parts = text.split(/(`[^`]+`)/g);
      return parts.map((part, idx) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={idx} className="bg-zinc-700 text-amber-400 px-1.5 py-0.5 rounded text-base">{part.slice(1, -1)}</code>;
        }
        // 处理 **加粗** - 重点内容红色高亮
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return boldParts.map((bp, j) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return <strong key={`${idx}-${j}`} className="text-red-400 font-semibold">{bp.slice(2, -2)}</strong>;
          }
          return bp;
        });
      });
    };

    while (i < lines.length) {
      const line = lines[i];
      
      // 空行
      if (line.trim() === '') {
        i++;
        continue;
      }
      
      // 分隔线
      if (line.trim() === '---') {
        elements.push(<hr key={key++} className="border-zinc-700 my-4" />);
        i++;
        continue;
      }
      
      // 标题 ### ## #
      if (line.startsWith('### ')) {
        elements.push(<h4 key={key++} className="text-lg font-semibold text-zinc-100 mt-4 mb-2">{renderInline(line.slice(4))}</h4>);
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(<h3 key={key++} className="text-xl font-semibold text-zinc-100 mt-5 mb-2">{renderInline(line.slice(3))}</h3>);
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(<h2 key={key++} className="text-2xl font-bold text-white mt-6 mb-3">{renderInline(line.slice(2))}</h2>);
        i++;
        continue;
      }
      
      // 引用块
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <div key={key++} className="border-l-4 border-amber-500 bg-zinc-800/50 pl-4 py-3 my-3 rounded-r group relative">
            <div className="text-base text-zinc-200 leading-relaxed whitespace-pre-wrap">{renderInline(quoteLines.join('\n'))}</div>
            <button onClick={() => copyText(quoteLines.join('\n'))} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity">
              {copiedText === quoteLines.join('\n') ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
            </button>
          </div>
        );
        continue;
      }
      
      // 无序列表
      if (line.startsWith('- ')) {
        const items: string[] = [];
        while (i < lines.length && lines[i].startsWith('- ')) {
          items.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <ul key={key++} className="my-3 space-y-2">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-3 text-base text-zinc-200">
                <span className="text-amber-500 mt-1">•</span>
                <span className="flex-1">{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }
      
      // 有序列表
      const orderedMatch = line.match(/^(\d+)\.\s/);
      if (orderedMatch) {
        const items: string[] = [];
        while (i < lines.length) {
          const m = lines[i].match(/^(\d+)\.\s/);
          if (m) {
            items.push(lines[i].replace(/^\d+\.\s/, ''));
            i++;
          } else break;
        }
        elements.push(
          <ol key={key++} className="my-3 space-y-2">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-3 text-base text-zinc-200">
                <span className="text-amber-500 font-medium w-6">{idx + 1}.</span>
                <span className="flex-1">{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }
      
      // 普通段落
      elements.push(
        <p key={key++} className="text-base text-zinc-300 leading-relaxed my-2">
          {renderInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  const isProcessing = isAnalyzing || isOcring || isFollowUp || isLoadingRecord;
  const canAnalyze = inputText.trim().length > 0 || images.length > 0;

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {isDragging && (
        <div className="fixed inset-0 bg-zinc-950/95 z-50 flex items-center justify-center border-2 border-dashed border-zinc-600 m-4 rounded-lg">
          <div className="text-center">
            <Image className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
            <p className="text-zinc-400">释放以上传图片</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-sm">技</span>
            </div>
            <span className="text-lg font-semibold text-white">技术总监</span>
          </div>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="gap-2 text-zinc-400 hover:text-white hover:bg-zinc-800">
              <Clock className="w-4 h-4" />历史记录
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden justify-center">
        <div className="w-full max-w-[1440px] flex">
          {/* Left: Input - 深色背景 */}
          <div className="w-[420px] shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-900">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              {/* Scenario */}
              <div className="mb-4">
                <div className="text-sm text-zinc-500 mb-2">场景</div>
                <div className="flex gap-2">
                  {SCENARIOS.map((s) => (
                    <button key={s.id} onClick={() => setSelectedScenario(s.id)}
                      className={`px-4 py-2 text-sm rounded-lg transition-all ${selectedScenario === s.id ? 'bg-amber-500 text-black font-medium' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Images */}
              {images.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm text-zinc-500 mb-2">{images.length}/{MAX_IMAGES} 张图片</div>
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((img) => (
                      <div key={img.id} className="relative aspect-square bg-zinc-800 rounded-lg overflow-hidden group">
                        {img.isUploading ? <Loader2 className="w-5 h-5 animate-spin text-zinc-500 m-auto" /> : <img src={img.url} alt={img.name} className="w-full h-full object-cover" />}
                        <button onClick={() => removeImage(img.id)} className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <button onClick={() => fileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-zinc-700 rounded-lg flex items-center justify-center hover:border-zinc-500 transition-colors">
                        <Plus className="w-5 h-5 text-zinc-600" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {/* Text Input */}
              <Textarea ref={textareaRef} placeholder="粘贴开发说的话...&#10;&#10;支持 Ctrl+V 粘贴截图" value={inputText} onChange={(e) => setInputText(e.target.value)}
                className="flex-1 min-h-0 bg-zinc-800 border-zinc-700 text-white text-base placeholder:text-zinc-500 focus:border-amber-500/50 resize-none overflow-y-auto" disabled={isProcessing} />
              
              {/* 生成汇报选项 */}
              <label className="flex items-center gap-2 mt-4 text-sm text-zinc-400 cursor-pointer hover:text-zinc-300">
                <input type="checkbox" checked={generateReport} onChange={(e) => setGenerateReport(e.target.checked)} className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/50" />
                <GitBranch className="w-4 h-4" />
                生成汇报框架
              </label>
              
              {/* Toolbar */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = e.target.files;
                      if (files) { for (const file of files) await uploadImage(file); }
                      e.target.value = '';
                    }} />
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                      <Image className="w-4 h-4" /><span>图片</span>
                    </div>
                  </label>
                  <button onClick={clearAll} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                    <Trash2 className="w-4 h-4" /><span>清空</span>
                  </button>
                </div>
                
                {isProcessing ? (
                  <Button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white rounded-lg h-10 px-5 text-base">
                    <Square className="w-4 h-4 mr-1.5" />停止
                  </Button>
                ) : (
                  <Button onClick={handleAnalyze} disabled={!canAnalyze} className="bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg h-10 px-5 text-base disabled:opacity-50">
                    <ArrowUp className="w-4 h-4 mr-1.5" />分析
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Results - 更深的背景 */}
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
            {/* Topic Title */}
            {topicTitle && (
              <div className="shrink-0 px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <h1 className="text-xl font-semibold text-white">{topicTitle}</h1>
                </div>
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingRecord && (
                <div className="flex items-center gap-2 text-zinc-500 text-base">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>加载历史记录...</span>
                </div>
              )}

              {!isLoadingRecord && isOcring && !isAnalyzing && (
                <div className="flex items-center gap-2 text-zinc-500 text-base">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>图片识别中...</span>
                </div>
              )}

              {!isLoadingRecord && (isAnalyzing || isFollowUp) && !analysisResult && (
                <div className="flex items-center gap-2 text-zinc-500 text-base">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>分析中...</span>
                </div>
              )}

              {!isLoadingRecord && !isProcessing && !analysisResult && !topicTitle && (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                  <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
                    <ArrowUp className="w-8 h-8 text-zinc-700" />
                  </div>
                  <p className="text-base">输入内容，开始分析</p>
                </div>
              )}

              {!isLoadingRecord && analysisResult && (
                <div className="text-base leading-relaxed">{renderMarkdown(analysisResult)}</div>
              )}
              
              {/* 汇报框架 */}
              {reportContent && (
                <div className="mt-6 pt-6 border-t border-zinc-800">
                  <div className="flex items-center gap-2 mb-4">
                    <GitBranch className="w-5 h-5 text-amber-500" />
                    <span className="text-lg font-semibold text-white">向上级汇报框架</span>
                  </div>
                  <div className="text-base leading-relaxed">{renderMarkdown(reportContent)}</div>
                </div>
              )}
              
              <div ref={resultsEndRef} />
            </div>
            
            {/* 追问输入框 */}
            <div className="shrink-0 border-t border-zinc-800 p-4 bg-zinc-900">
              <div className="flex gap-3">
                <Textarea placeholder={conversationHistory.length > 0 ? "继续追问..." : "输入问题开始分析..."} value={followUpText}
                  onChange={(e) => setFollowUpText(e.target.value)}
                  className="flex-1 min-h-[52px] max-h-[120px] bg-zinc-800 border-zinc-700 text-white text-base placeholder:text-zinc-500 focus:border-amber-500/50 resize-none"
                  disabled={isFollowUp || isAnalyzing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (conversationHistory.length > 0) handleFollowUp();
                      else if (canAnalyze) handleAnalyze();
                    }
                  }} />
                {isProcessing ? (
                  <Button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white rounded-lg h-[52px] px-4 shrink-0">
                    <Square className="w-5 h-5" />
                  </Button>
                ) : conversationHistory.length > 0 ? (
                  <Button onClick={handleFollowUp} disabled={!followUpText.trim()} className="bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg h-[52px] px-4 shrink-0 disabled:opacity-50">
                    <ArrowUp className="w-5 h-5" />
                  </Button>
                ) : (
                  <Button onClick={handleAnalyze} disabled={!canAnalyze} className="bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg h-[52px] px-4 shrink-0 disabled:opacity-50">
                    <ArrowUp className="w-5 h-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
