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
  GitBranch
} from 'lucide-react';
import { analyzeApi, uploadApi, ocrApi, getUserId } from '@/lib/api';
import Link from 'next/link';

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
  { id: 'work', label: '企微沟通', desc: '工作群聊、需求对接' },
  { id: 'understand', label: '技术理解', desc: '理解技术方案、评估可行性' },
  { id: 'concept', label: '概念梳理', desc: '学习技术概念、扫清知识盲区' },
];

const MAX_IMAGES = 20;

export default function HomePage() {
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('work');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOcring, setIsOcring] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [followUpText, setFollowUpText] = useState('');
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  
  const [reportContent, setReportContent] = useState<string>('');
  const [generateReport, setGenerateReport] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getUserId(); }, []);

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
    if (images.length >= MAX_IMAGES) { alert(`最多支持 ${MAX_IMAGES} 张图片`); return; }
    const tempId = `temp-${Date.now()}`;
    setImages(prev => [...prev, { id: tempId, url: '', name: file.name, isUploading: true }]);
    try {
      const result = await uploadApi.image(file);
      if (result.url) setImages(prev => prev.map(img => img.id === tempId ? { ...img, url: result.url, isUploading: false } : img));
    } catch {
      setImages(prev => prev.filter(img => img.id !== tempId));
      alert('图片上传失败');
    }
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));

  const handleAnalyze = useCallback(async () => {
    const hasText = inputText.trim().length > 0;
    const hasImages = images.length > 0;
    if (!hasText && !hasImages) return;
    
    setIsAnalyzing(true);
    setAnalysisResult('');
    setConversationHistory([]);
    setReportContent('');
    
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
              if (parsed.reportStart) { /* 开始报告 */ }
              if (parsed.reportContent) { reportText += parsed.reportContent; setReportContent(reportText); }
              if (parsed.content) { fullContent += parsed.content; setAnalysisResult(fullContent); }
            } catch {}
          }
        }
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
      
      setAnalysisResult(prev => prev + '\n\n---\n\n**追问：**\n\n' + userQuestion + '\n\n**回复：**\n\n');
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

  const renderMarkdown = (content: string): React.ReactNode => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inQuote = false, quoteContent: string[] = [];
    let inList = false, listItems: string[] = [];
    let inCodeBlock = false, codeContent: string[] = [];

    const flushQuote = () => {
      if (quoteContent.length > 0) {
        elements.push(
          <div key={`quote-${elements.length}`} className="bg-amber-50 border-l-2 border-amber-400 pl-3 py-2 my-2 group relative rounded-r">
            <div className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed pr-8">{quoteContent.join('\n')}</div>
            <button onClick={() => copyText(quoteContent.join('\n'))} className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-amber-100 transition-all">
              {copiedText === quoteContent.join('\n') ? <Check className="w-3.5 h-3.5 text-neutral-600" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
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
                <span className="flex-1">{renderInlineFormat(item)}</span>
                <button onClick={() => copyText(item)} className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-200 transition-all">
                  {copiedText === item ? <Check className="w-3 h-3 text-neutral-600" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                </button>
              </div>
            ))}
          </div>
        );
        listItems = [];
      }
    };

    const flushCodeBlock = () => {
      if (codeContent.length > 0) {
        elements.push(
          <div key={`code-${elements.length}`} className="bg-neutral-900 text-neutral-100 rounded-lg p-3 my-2 overflow-x-auto group relative">
            <pre className="text-sm font-mono">{codeContent.join('\n')}</pre>
            <button onClick={() => copyText(codeContent.join('\n'))} className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-800 transition-all">
              {copiedText === codeContent.join('\n') ? <Check className="w-3.5 h-3.5 text-neutral-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
            </button>
          </div>
        );
        codeContent = [];
      }
    };

    const renderInlineFormat = (text: string): React.ReactNode => {
      const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-medium text-neutral-900">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-neutral-200 px-1 rounded text-neutral-800">{part.slice(1, -1)}</code>;
        return part;
      });
    };

    lines.forEach((line, idx) => {
      if (line.startsWith('```')) { if (inCodeBlock) { flushCodeBlock(); inCodeBlock = false; } else { flushList(); flushQuote(); inCodeBlock = true; } return; }
      if (inCodeBlock) { codeContent.push(line); return; }
      if (line.startsWith('> ')) { flushList(); inQuote = true; quoteContent.push(line.slice(2)); return; }
      if (inQuote && line.startsWith('> ')) { quoteContent.push(line.slice(2)); return; }
      if (inQuote) { flushQuote(); inQuote = false; }
      if (line.startsWith('- ')) { flushQuote(); inList = true; listItems.push(line.slice(2)); return; }
      if (line.match(/^\d+\.\s/)) { flushQuote(); inList = true; listItems.push(line.replace(/^\d+\.\s*/, '')); return; }
      if (inList && line.trim() === '') { flushList(); inList = false; }
      if (inList && !line.startsWith('- ') && !line.match(/^\d+\.\s/)) { flushList(); inList = false; }
      if (line.startsWith('**') && line.endsWith('**')) { flushList(); elements.push(<h3 key={idx} className="text-sm font-medium text-neutral-900 mt-5 mb-2 first:mt-0">{line.slice(2, -2)}</h3>); return; }
      if (line.trim() === '---') { flushList(); flushQuote(); elements.push(<hr key={idx} className="my-4 border-neutral-200" />); return; }
      if (line.trim() === '') { flushList(); flushQuote(); return; }
      flushList(); flushQuote();
      elements.push(<p key={idx} className="text-sm text-neutral-700 leading-relaxed mb-1">{renderInlineFormat(line)}</p>);
    });

    flushCodeBlock(); flushQuote(); flushList();
    return elements;
  };

  const isProcessing = isAnalyzing || isOcring || isFollowUp;
  const canAnalyze = inputText.trim().length > 0 || images.length > 0;

  return (
    <div className="h-screen flex flex-col bg-white">
      {isDragging && (
        <div className="fixed inset-0 bg-white/95 z-50 flex items-center justify-center border-2 border-dashed border-neutral-300 m-4">
          <div className="text-center"><Image className="w-12 h-12 text-neutral-400 mx-auto mb-3" /><p className="text-neutral-600">释放以上传图片</p></div>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 border-b border-neutral-200 bg-white">
        <div className="max-w-[1280px] mx-auto px-6 h-12 flex items-center justify-between">
          <span className="text-base font-medium text-neutral-900">技术总监</span>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="gap-1.5 text-neutral-500 hover:text-neutral-900 h-8">
              <Clock className="w-4 h-4" />历史
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden justify-center">
        <div className="w-full max-w-[1280px] flex">
          {/* Left: Input - 白色背景 */}
          <div className="w-[400px] shrink-0 border-r border-neutral-200 flex flex-col bg-white">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              {/* Scenario */}
              <div className="mb-4">
                <div className="text-xs text-neutral-400 mb-2">选择场景</div>
                <div className="flex flex-wrap gap-2">
                  {SCENARIOS.map((s) => (
                    <button key={s.id} onClick={() => setSelectedScenario(s.id)}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${selectedScenario === s.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Images */}
              {images.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-neutral-500 mb-2">{images.length}/{MAX_IMAGES} 张图片</div>
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((img) => (
                      <div key={img.id} className="relative aspect-square bg-neutral-100 rounded overflow-hidden group">
                        {img.isUploading ? <Loader2 className="w-5 h-5 animate-spin text-neutral-400 m-auto" /> : <img src={img.url} alt={img.name} className="w-full h-full object-cover" />}
                        <button onClick={() => removeImage(img.id)} className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <button onClick={() => fileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-neutral-200 rounded flex items-center justify-center hover:border-neutral-300 transition-colors">
                        <Plus className="w-5 h-5 text-neutral-400" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {/* Text Input */}
              <Textarea ref={textareaRef} placeholder="粘贴开发说的话...&#10;&#10;支持 Ctrl+V 粘贴截图" value={inputText} onChange={(e) => setInputText(e.target.value)}
                className="flex-1 min-h-0 border-neutral-200 text-sm placeholder:text-neutral-400 focus:border-neutral-300 resize-none overflow-y-auto" disabled={isProcessing} />
              
              {/* 生成汇报选项 */}
              <label className="flex items-center gap-2 mt-4 text-xs text-neutral-500 cursor-pointer">
                <input type="checkbox" checked={generateReport} onChange={(e) => setGenerateReport(e.target.checked)} className="rounded border-neutral-300" />
                <GitBranch className="w-3.5 h-3.5" />
                生成汇报框架（金字塔原理）
              </label>
              
              {/* Toolbar */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200">
                <label className="cursor-pointer">
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                    const files = e.target.files;
                    if (files) { for (const file of files) await uploadImage(file); }
                    e.target.value = '';
                  }} />
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded text-sm text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
                    <Image className="w-4 h-4" /><span>图片</span>
                  </div>
                </label>
                
                {isProcessing ? (
                  <Button onClick={handleStop} className="bg-neutral-900 hover:bg-neutral-800 text-white rounded h-9 px-4 text-sm">
                    <Square className="w-3.5 h-3.5 mr-1" />停止
                  </Button>
                ) : (
                  <Button onClick={handleAnalyze} disabled={!canAnalyze} className="bg-neutral-900 hover:bg-neutral-800 text-white rounded h-9 px-4 text-sm">
                    <ArrowUp className="w-3.5 h-3.5 mr-1" />分析
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Results - 浅灰背景 */}
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50">
            <div className="flex-1 overflow-y-auto p-6">
              {isOcring && !isAnalyzing && (
                <div className="flex items-center gap-2 text-neutral-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /><span>图片识别中...</span>
                </div>
              )}

              {(isAnalyzing || isFollowUp) && !analysisResult && (
                <div className="flex items-center gap-2 text-neutral-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /><span>分析中...</span>
                </div>
              )}

              {!isProcessing && !analysisResult && (
                <div className="text-neutral-400 text-sm">选择场景，输入内容，我来帮你分析</div>
              )}

              {analysisResult && (
                <div className="text-sm leading-relaxed">{renderMarkdown(analysisResult)}</div>
              )}
              
              {/* 汇报框架 */}
              {reportContent && (
                <div className="mt-6 pt-6 border-t border-neutral-200">
                  <div className="flex items-center gap-2 mb-4">
                    <GitBranch className="w-4 h-4 text-neutral-600" />
                    <span className="text-sm font-medium text-neutral-900">向上级汇报框架</span>
                  </div>
                  <div className="text-sm leading-relaxed">{renderMarkdown(reportContent)}</div>
                </div>
              )}
              
              <div ref={resultsEndRef} />
            </div>
            
            {/* 追问输入框 */}
            <div className="shrink-0 border-t border-neutral-200 p-4 bg-white">
              <div className="flex gap-3">
                <Textarea ref={textareaRef} placeholder={conversationHistory.length > 0 ? "继续追问..." : "输入问题开始分析..."} value={followUpText}
                  onChange={(e) => setFollowUpText(e.target.value)}
                  className="flex-1 min-h-[44px] max-h-[120px] border-neutral-200 text-sm placeholder:text-neutral-400 focus:border-neutral-300 resize-none"
                  disabled={isFollowUp || isAnalyzing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (conversationHistory.length > 0) handleFollowUp();
                      else if (canAnalyze) handleAnalyze();
                    }
                  }} />
                {isProcessing ? (
                  <Button onClick={handleStop} className="bg-neutral-900 hover:bg-neutral-800 text-white rounded h-11 px-4 text-sm shrink-0">
                    <Square className="w-4 h-4" />
                  </Button>
                ) : conversationHistory.length > 0 ? (
                  <Button onClick={handleFollowUp} disabled={!followUpText.trim()} className="bg-neutral-900 hover:bg-neutral-800 text-white rounded h-11 px-4 text-sm shrink-0">
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button onClick={handleAnalyze} disabled={!canAnalyze} className="bg-neutral-900 hover:bg-neutral-800 text-white rounded h-11 px-4 text-sm shrink-0">
                    <ArrowUp className="w-4 h-4" />
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
