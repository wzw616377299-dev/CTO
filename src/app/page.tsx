'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowUp, 
  Image as ImageIcon, 
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
import { useSearchParams, useRouter } from 'next/navigation';

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

// 主题色配置
const THEME = {
  primary: 'text-cyan-400',
  primaryBg: 'bg-cyan-400',
  primaryBorder: 'border-cyan-400',
  highlight: 'text-cyan-300',
  accent: 'text-amber-400',
  accentBg: 'bg-amber-400',
  danger: 'text-rose-400',
  dangerBg: 'bg-rose-500',
};

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = searchParams.get('recordId');
  
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(['work']);
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
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  
  // 用户滚动状态
  const [userScrolled, setUserScrolled] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getUserId(); }, []);
  
  // 从 localStorage 恢复数据
  useEffect(() => {
    if (!recordId) {
      const savedData = localStorage.getItem('cto_current_session');
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          if (parsed.inputText) setInputText(parsed.inputText);
          if (parsed.images) setImages(parsed.images);
          if (parsed.scenarios) setSelectedScenarios(parsed.scenarios);
          if (parsed.analysisResult) setAnalysisResult(parsed.analysisResult);
          if (parsed.topicTitle) setTopicTitle(parsed.topicTitle);
          if (parsed.conversationHistory) setConversationHistory(parsed.conversationHistory);
        } catch {}
      }
    }
  }, [recordId]);
  
  // 保存数据到 localStorage
  useEffect(() => {
    if (!recordId && (inputText || images.length > 0 || analysisResult)) {
      localStorage.setItem('cto_current_session', JSON.stringify({
        inputText,
        images,
        scenarios: selectedScenarios,
        analysisResult,
        topicTitle,
        conversationHistory,
      }));
    }
  }, [inputText, images, selectedScenarios, analysisResult, topicTitle, conversationHistory, recordId]);
  
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
            // 解析多场景
            if (record.mode) {
              const modes = record.mode.split(',');
              setSelectedScenarios(modes.length > 0 ? modes : ['work']);
            }
            
            const history: Message[] = [];
            if (record.input_text) {
              history.push({ role: 'user', content: record.input_text });
            }
            if (record.response_scripts && record.response_scripts.length > 0) {
              const analysisContent = record.response_scripts.join('\n\n');
              history.push({ role: 'assistant', content: analysisContent });
              setAnalysisResult(analysisContent);
            }
            setConversationHistory(history);
            
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

  // 自动滚动（仅在用户没有手动滚动时）
  useEffect(() => {
    if (!userScrolled) {
      resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [analysisResult, reportContent, conversationHistory, userScrolled]);
  
  // 监听滚动
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // 如果滚动到底部附近，重置 userScrolled
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setUserScrolled(!isNearBottom);
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

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
  
  const toggleScenario = (id: string) => {
    setSelectedScenarios(prev => 
      prev.includes(id) 
        ? prev.filter(s => s !== id) 
        : [...prev, id]
    );
  };
  
  const clearAll = () => {
    setInputText('');
    setImages([]);
    setAnalysisResult('');
    setConversationHistory([]);
    setReportContent('');
    setTopicTitle('');
    setSelectedScenarios(['work']);
    localStorage.removeItem('cto_current_session');
  };
  
  // 生成主题标题
  const generateTopicTitle = useCallback(async (inputText: string) => {
    if (!inputText.trim()) return;
    
    setIsGeneratingTitle(true);
    try {
      const response = await fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText }),
      });
      const data = await response.json();
      if (data.title) {
        setTopicTitle(data.title);
      }
    } catch {
      // 失败时使用简单截取
      const title = inputText.replace(/\n/g, ' ').slice(0, 20);
      setTopicTitle(title + (inputText.length > 20 ? '...' : ''));
    } finally {
      setIsGeneratingTitle(false);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    const hasText = inputText.trim().length > 0;
    const hasImages = images.length > 0;
    if (!hasText && !hasImages) return;
    
    setIsAnalyzing(true);
    setAnalysisResult('');
    setConversationHistory([]);
    setReportContent('');
    setTopicTitle('');
    setUserScrolled(false); // 重置滚动状态
    
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
      
      // 生成主题标题
      generateTopicTitle(finalText);
      
      abortControllerRef.current = new AbortController();
      const scenario = selectedScenarios.join(',');
      const stream = await analyzeApi.stream(finalText, scenario, abortControllerRef.current.signal, generateReport);
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
  }, [inputText, images, selectedScenarios, generateReport, generateTopicTitle]);

  const handleFollowUp = useCallback(async () => {
    if (!followUpText.trim() || conversationHistory.length === 0) return;
    
    setIsFollowUp(true);
    setUserScrolled(false);
    const userQuestion = followUpText;
    setFollowUpText('');
    
    // 先添加用户问题到历史
    const newHistory = [...conversationHistory, { role: 'user' as const, content: userQuestion }];
    setConversationHistory(newHistory);
    
    try {
      abortControllerRef.current = new AbortController();
      const scenario = selectedScenarios.join(',');
      const stream = await analyzeApi.followUp(newHistory, userQuestion, scenario, abortControllerRef.current.signal);
      if (!stream) throw new Error('No stream');
      
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let replyContent = '';
      
      // 临时添加一个空的 assistant 消息
      setConversationHistory([...newHistory, { role: 'assistant' as const, content: '' }]);
      
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
                replyContent += parsed.content;
                // 更新最后一个 assistant 消息
                setConversationHistory(prev => {
                  const newHist = [...prev];
                  if (newHist.length > 0 && newHist[newHist.length - 1].role === 'assistant') {
                    newHist[newHist.length - 1] = { role: 'assistant', content: replyContent };
                  }
                  return newHist;
                });
              }
            } catch {}
          }
        }
      }
    } catch {}
    finally { setIsFollowUp(false); abortControllerRef.current = null; }
  }, [followUpText, conversationHistory, selectedScenarios]);

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

  // Markdown 渲染
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
          return <code key={idx} className="bg-slate-700/50 text-cyan-400 px-1.5 py-0.5 rounded text-base font-mono">{part.slice(1, -1)}</code>;
        }
        // 处理 **加粗** - 重点内容青色高亮
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return boldParts.map((bp, j) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return <strong key={`${idx}-${j}`} className="text-cyan-300 font-semibold">{bp.slice(2, -2)}</strong>;
          }
          return bp;
        });
      });
    };

    while (i < lines.length) {
      const line = lines[i];
      
      if (line.trim() === '') {
        i++;
        continue;
      }
      
      if (line.trim() === '---') {
        elements.push(<hr key={key++} className="border-slate-700/50 my-6" />);
        i++;
        continue;
      }
      
      if (line.startsWith('### ')) {
        elements.push(<h4 key={key++} className="text-lg font-semibold text-slate-200 mt-6 mb-3 flex items-center gap-2"><span className="w-1 h-5 bg-cyan-500 rounded-full"></span>{renderInline(line.slice(4))}</h4>);
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(<h3 key={key++} className="text-xl font-semibold text-slate-100 mt-8 mb-3 flex items-center gap-2"><span className="w-1.5 h-6 bg-cyan-500 rounded-full"></span>{renderInline(line.slice(3))}</h3>);
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(<h2 key={key++} className="text-2xl font-bold text-white mt-10 mb-4 flex items-center gap-2"><span className="w-2 h-7 bg-cyan-400 rounded-full"></span>{renderInline(line.slice(2))}</h2>);
        i++;
        continue;
      }
      
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <div key={key++} className="border-l-2 border-cyan-500/60 bg-slate-800/30 pl-4 py-3 my-4 rounded-r-lg group relative">
            <div className="text-base text-slate-300 leading-relaxed whitespace-pre-wrap">{renderInline(quoteLines.join('\n'))}</div>
            <button onClick={() => copyText(quoteLines.join('\n'))} className="absolute top-2 right-2 p-1.5 rounded bg-slate-700/80 opacity-0 group-hover:opacity-100 transition-all hover:bg-slate-600">
              {copiedText === quoteLines.join('\n') ? <Check className="w-4 h-4 text-cyan-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        );
        continue;
      }
      
      if (line.startsWith('- ')) {
        const items: string[] = [];
        while (i < lines.length && lines[i].startsWith('- ')) {
          items.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <ul key={key++} className="my-4 space-y-2.5">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-3 text-base text-slate-300">
                <span className={`${THEME.primary} mt-1.5`}>•</span>
                <span className="flex-1">{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }
      
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
          <ol key={key++} className="my-4 space-y-2.5">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-3 text-base text-slate-300">
                <span className={`${THEME.primary} font-mono font-medium w-6`}>{idx + 1}.</span>
                <span className="flex-1">{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }
      
      elements.push(
        <p key={key++} className="text-base text-slate-300 leading-relaxed my-2">
          {renderInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  // 渲染对话历史
  const renderConversation = () => {
    const elements: React.ReactNode[] = [];
    let followUpCount = 0;
    
    // 渲染第一次回答（使用 analysisResult 支持流式输出）
    if (analysisResult) {
      elements.push(
        <div key="main-answer" className="mb-6">
          {renderMarkdown(analysisResult)}
        </div>
      );
    }
    
    // 渲染追问和回答（从对话历史中跳过前两条）
    if (conversationHistory.length > 2) {
      for (let i = 2; i < conversationHistory.length; i++) {
        const msg = conversationHistory[i];
        
        if (msg.role === 'user') {
          followUpCount++;
          elements.push(
            <div key={`q-${i}`} className="mt-8 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 text-xs font-medium bg-amber-500/15 text-amber-400 rounded-md border border-amber-500/25">
                  追问 {followUpCount}
                </span>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
                <p className="text-slate-300 text-base">{msg.content}</p>
              </div>
            </div>
          );
        } else if (msg.role === 'assistant') {
          elements.push(
            <div key={`a-${i}`} className="bg-gradient-to-br from-cyan-500/5 to-slate-900/50 border border-cyan-500/20 rounded-xl p-5 my-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2.5 py-1 text-xs font-medium bg-cyan-500/15 text-cyan-400 rounded-md border border-cyan-500/25">
                  回答
                </span>
              </div>
              <div className="text-base leading-relaxed">
                {renderMarkdown(msg.content)}
              </div>
            </div>
          );
        }
      }
    }
    
    // 如果正在追问，显示加载状态
    if (isFollowUp && conversationHistory.length > 0 && 
        conversationHistory[conversationHistory.length - 1].role === 'user') {
      elements.push(
        <div key="loading" className="flex items-center gap-2 text-slate-500 text-base mt-4">
          <Loader2 className="w-5 h-5 animate-spin" /><span>思考中...</span>
        </div>
      );
    }
    
    return elements;
  };

  const isProcessing = isAnalyzing || isOcring || isFollowUp || isLoadingRecord;
  const canAnalyze = inputText.trim().length > 0 || images.length > 0;

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100">
      {isDragging && (
        <div className="fixed inset-0 bg-slate-950/98 z-50 flex items-center justify-center border-2 border-dashed border-cyan-500/50 m-4 rounded-xl">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4 border border-slate-700">
              <ImageIcon className="w-8 h-8 text-cyan-400" />
            </div>
            <p className="text-slate-300 text-lg">释放以上传图片</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2Fimage.png&nonce=7d6188c8-2876-4123-8c2f-976324f83bc9&project_id=7619721306493304872&sign=2d19c3b1974a096a5340bfd153d9b533fb181ba0d19454fda04448a02f9bf225"
              alt="CTO"
              className="w-9 h-9 rounded-lg object-cover ring-2 ring-cyan-500/30"
            />
            <div>
              <span className="text-lg font-semibold text-white">首席技术官</span>
              <span className="text-xs text-slate-500 ml-2">CTO</span>
            </div>
          </div>
          <Link href="/history" className="group">
            <Button variant="ghost" size="sm" className="gap-2 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700">
              <Clock className="w-4 h-4" />历史记录
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden justify-center">
        <div className="w-full max-w-[1440px] flex">
          {/* Left: Input */}
          <div className="w-[420px] shrink-0 border-r border-slate-800/60 flex flex-col bg-slate-900/30">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              {/* Scenario - 多选 */}
              <div className="mb-5">
                <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">场景选择</div>
                <div className="flex gap-2 flex-wrap">
                  {SCENARIOS.map((s) => (
                    <button 
                      key={s.id} 
                      onClick={() => toggleScenario(s.id)}
                      className={`px-4 py-2 text-sm rounded-lg transition-all border ${
                        selectedScenarios.includes(s.id) 
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50 shadow-sm shadow-cyan-500/10' 
                          : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Images */}
              {images.length > 0 && (
                <div className="mb-5">
                  <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">{images.length}/{MAX_IMAGES} 张图片</div>
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((img) => (
                      <div key={img.id} className="relative aspect-square bg-slate-800/50 rounded-lg overflow-hidden group border border-slate-700/50">
                        {img.isUploading ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                          </div>
                        ) : (
                          <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        )}
                        <button 
                          onClick={() => removeImage(img.id)} 
                          className="absolute top-1 right-1 w-5 h-5 bg-slate-900/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all border border-slate-700/50 hover:bg-rose-500/20 hover:border-rose-500/50"
                        >
                          <X className="w-3 h-3 text-slate-400 group-hover:text-rose-400" />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="aspect-square border border-dashed border-slate-700 rounded-lg flex items-center justify-center hover:border-cyan-500/50 hover:bg-slate-800/30 transition-all"
                      >
                        <Plus className="w-5 h-5 text-slate-600" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {/* Text Input */}
              <Textarea 
                ref={textareaRef} 
                placeholder="粘贴开发说的话...&#10;&#10;支持 Ctrl+V 粘贴截图" 
                value={inputText} 
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 min-h-0 bg-slate-800/30 border-slate-700/50 text-white text-base placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-cyan-500/10 resize-none overflow-y-auto rounded-lg" 
                disabled={isProcessing} 
              />
              
              {/* 生成汇报选项 */}
              <label className="flex items-center gap-2 mt-4 text-sm text-slate-400 cursor-pointer hover:text-slate-300 transition-colors">
                <input 
                  type="checkbox" 
                  checked={generateReport} 
                  onChange={(e) => setGenerateReport(e.target.checked)} 
                  className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30" 
                />
                <GitBranch className="w-4 h-4 text-slate-500" />
                生成汇报框架
              </label>
              
              {/* Toolbar */}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800/60">
                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = e.target.files;
                      if (files) { for (const file of files) await uploadImage(file); }
                      e.target.value = '';
                    }} />
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700">
                      <ImageIcon className="w-4 h-4" /><span>图片</span>
                    </div>
                  </label>
                  <button 
                    onClick={clearAll} 
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/30"
                  >
                    <Trash2 className="w-4 h-4" /><span>清空</span>
                  </button>
                </div>
                
                {isProcessing ? (
                  <Button onClick={handleStop} className="bg-rose-500 hover:bg-rose-600 text-white rounded-lg h-10 px-5 text-base shadow-lg shadow-rose-500/20">
                    <Square className="w-4 h-4 mr-1.5" />停止
                  </Button>
                ) : (
                  <Button 
                    onClick={handleAnalyze} 
                    disabled={!canAnalyze} 
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-medium rounded-lg h-10 px-5 text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                  >
                    <ArrowUp className="w-4 h-4 mr-1.5" />分析
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Results */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {/* Topic Title */}
            {topicTitle && (
              <div className="shrink-0 px-6 py-4 border-b border-slate-800/60 bg-slate-900/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                  <h1 className="text-xl font-semibold text-white">{topicTitle}</h1>
                  {isGeneratingTitle && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
                </div>
              </div>
            )}
            
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
              {isLoadingRecord && (
                <div className="flex items-center gap-2 text-slate-500 text-base">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>加载历史记录...</span>
                </div>
              )}

              {!isLoadingRecord && isOcring && !isAnalyzing && (
                <div className="flex items-center gap-2 text-slate-500 text-base">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>图片识别中...</span>
                </div>
              )}

              {!isLoadingRecord && (isAnalyzing || isFollowUp) && conversationHistory.length === 0 && (
                <div className="flex items-center gap-2 text-slate-500 text-base">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>分析中...</span>
                </div>
              )}

              {!isLoadingRecord && !isProcessing && conversationHistory.length === 0 && !topicTitle && (
                <div className="flex flex-col items-center justify-center h-full text-slate-600">
                  <div className="w-20 h-20 bg-slate-900/50 rounded-2xl flex items-center justify-center mb-5 border border-slate-800">
                    <ArrowUp className="w-10 h-10 text-slate-700" />
                  </div>
                  <p className="text-lg text-slate-500">输入内容，开始分析</p>
                  <p className="text-sm text-slate-600 mt-2">支持文字和图片</p>
                </div>
              )}

              {/* 主要内容和对话历史 */}
              {!isLoadingRecord && conversationHistory.length > 0 && (
                <div className="text-base leading-relaxed">
                  {renderConversation()}
                </div>
              )}
              
              {/* 汇报框架 */}
              {reportContent && (
                <div className="mt-8 pt-8 border-t border-slate-800/60">
                  <div className="flex items-center gap-2 mb-5">
                    <GitBranch className="w-5 h-5 text-cyan-400" />
                    <span className="text-lg font-semibold text-white">向上级汇报框架</span>
                  </div>
                  <div className="text-base leading-relaxed">{renderMarkdown(reportContent)}</div>
                </div>
              )}
              
              <div ref={resultsEndRef} />
            </div>
            
            {/* 追问输入框 */}
            <div className="shrink-0 border-t border-slate-800/60 p-4 bg-slate-900/20">
              <div className="flex gap-3">
                <Textarea 
                  placeholder={conversationHistory.length > 0 ? "继续追问..." : "输入问题开始分析..."} 
                  value={followUpText}
                  onChange={(e) => setFollowUpText(e.target.value)}
                  className="flex-1 min-h-[52px] max-h-[120px] bg-slate-800/30 border-slate-700/50 text-white text-base placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-cyan-500/10 resize-none rounded-lg"
                  disabled={isFollowUp || isAnalyzing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (conversationHistory.length > 0) handleFollowUp();
                      else if (canAnalyze) handleAnalyze();
                    }
                  }} 
                />
                {isProcessing ? (
                  <Button onClick={handleStop} className="bg-rose-500 hover:bg-rose-600 text-white rounded-lg h-[52px] px-4 shrink-0 shadow-lg shadow-rose-500/20">
                    <Square className="w-5 h-5" />
                  </Button>
                ) : conversationHistory.length > 0 ? (
                  <Button 
                    onClick={handleFollowUp} 
                    disabled={!followUpText.trim()} 
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-medium rounded-lg h-[52px] px-4 shrink-0 disabled:opacity-40 shadow-lg shadow-cyan-500/20"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleAnalyze} 
                    disabled={!canAnalyze} 
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-medium rounded-lg h-[52px] px-4 shrink-0 disabled:opacity-40 shadow-lg shadow-cyan-500/20"
                  >
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
