'use client';

import React, { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { flushSync } from 'react-dom';
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
  Trash2
} from 'lucide-react';
import { analyzeApi, uploadApi, ocrApi, getUserId, recordsApi } from '@/lib/api';
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

const MAX_IMAGES = 20;

// 暗黑模式配色方案
const COLORS = {
  // 背景层级
  bg0: 'bg-[#000000]',       // 最深 - 页面底层
  bg1: 'bg-[#0A0A0A]',       // 次深 - Header、侧边栏
  bg2: 'bg-[#141414]',       // 内容 - 输入框、卡片
  bg3: 'bg-[#1A1A1A]',       // 悬浮 - hover状态
  bg4: 'bg-[#2C2C2C]',       // 更亮 - 高亮区域
  
  // 边框
  border1: 'border-[#1A1A1A]',
  border2: 'border-[#2C2C2C]',
  border3: 'border-[#3C3C3C]',
  
  // 文字
  text1: 'text-[#FFFFFF]',
  text2: 'text-[#E5E5E5]',
  text3: 'text-[#A0A0A0]',
  text4: 'text-[#666666]',
  text5: 'text-[#4A4A4A]',
  
  // 主题色
  primary: '#07C160',
  primaryLight: '#1AAD19',
  highlight: '#FA9D3B',  // 重点内容高亮色（黄色）
};

function HomeContent() {
  const searchParams = useSearchParams();
  const recordId = searchParams.get('recordId');
  
  const [inputText, setInputText] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOcring, setIsOcring] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  
  const [followUpText, setFollowUpText] = useState('');
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  
  const [topicTitle, setTopicTitle] = useState<string>('');
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  
  // 用户滚动状态
  const [userScrolled, setUserScrolled] = useState(false);
  // 左栏宽度（可拖拽）
  const [leftWidth, setLeftWidth] = useState<number>(420);
  const isResizingRef = useRef(false);
  // 等待阶段文案
  const [waitingStage, setWaitingStage] = useState(0);
  
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
          if (parsed.extraContext) setExtraContext(parsed.extraContext);
          if (parsed.images) setImages(parsed.images);
          if (parsed.analysisResult) setAnalysisResult(parsed.analysisResult);
          if (parsed.topicTitle) setTopicTitle(parsed.topicTitle);
          if (parsed.conversationHistory) setConversationHistory(parsed.conversationHistory);
          if (typeof parsed.leftWidth === 'number') setLeftWidth(parsed.leftWidth);
        } catch {}
      }
    }
  }, [recordId]);
  
  // 保存数据到 localStorage - 使用防抖优化
  useEffect(() => {
    if (!recordId && (inputText || extraContext || images.length > 0 || analysisResult)) {
      const timer = setTimeout(() => {
        localStorage.setItem('cto_current_session', JSON.stringify({
          inputText,
          extraContext,
          images,
          analysisResult,
          topicTitle,
          conversationHistory,
          leftWidth,
        }));
      }, 500); // 500ms 防抖

      return () => clearTimeout(timer);
    }
  }, [inputText, extraContext, images, analysisResult, topicTitle, conversationHistory, leftWidth, recordId]);
  
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
  }, [analysisResult, conversationHistory, userScrolled]);
  
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
  
  const clearAll = () => {
    setInputText('');
    setExtraContext('');
    setImages([]);
    setAnalysisResult('');
    setConversationHistory([]);
    setTopicTitle('');
    localStorage.removeItem('cto_current_session');
  };
  
  const handleAnalyze = useCallback(async () => {
    const hasText = inputText.trim().length > 0;
    const hasImages = images.length > 0;
    if (!hasText && !hasImages) return;
    
    setIsAnalyzing(true);
    setAnalysisResult('');
    setConversationHistory([]);
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
      
      // 标题和分析并行：先挂一个异步任务，不等它返回就直接启动分析流
      setIsGeneratingTitle(true);
      const titlePromise = fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText: finalText }),
      })
        .then(r => r.json())
        .then(data => {
          const t = (data && typeof data.title === 'string' ? data.title : '').trim();
          if (t) setTopicTitle(t);
          return t;
        })
        .catch(() => {
          const fallback = finalText.replace(/\n/g, ' ').slice(0, 20);
          setTopicTitle(fallback + (finalText.length > 20 ? '...' : ''));
          return '';
        })
        .finally(() => setIsGeneratingTitle(false));

      abortControllerRef.current = new AbortController();
      // 用空标题先发请求，服务端把它当 null 就行；正式标题由前端自己展示
      const stream = await analyzeApi.stream(finalText, '', abortControllerRef.current.signal, '');
      // 异步拿一下最终标题，不阻塞流
      const title = await titlePromise;
      // 如果 title 接口比分析快，已经显示；否则下面这段保险一下兜底
      if (title) setTopicTitle(title);
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
              if (parsed.reset) {
                fullContent = '';
                flushSync(() => {
                  setAnalysisResult('');
                });
                continue;
              }
              if (parsed.content) {
                fullContent += parsed.content;
                // 使用 flushSync 强制立即渲染，实现真正的流式输出
                flushSync(() => {
                  setAnalysisResult(fullContent);
                });
              }
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
  }, [inputText, extraContext, images]);

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
      const stream = await analyzeApi.followUp(newHistory, userQuestion, '', abortControllerRef.current.signal);
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
                // 使用 flushSync 强制立即渲染
                flushSync(() => {
                  setConversationHistory(prev => {
                    const newHist = [...prev];
                    if (newHist.length > 0 && newHist[newHist.length - 1].role === 'assistant') {
                      newHist[newHist.length - 1] = { role: 'assistant', content: replyContent };
                    }
                    return newHist;
                  });
                });
              }
            } catch {}
          }
        }
      }
    } catch {}
    finally { setIsFollowUp(false); abortControllerRef.current = null; }
  }, [followUpText, conversationHistory]);

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
  const renderMarkdown = (content: string, prefix?: React.ReactNode): React.ReactNode => {
    if (!content) return null;
    
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let key = 0;
    let prefixUsed = false;

    const renderInline = (text: string): React.ReactNode => {
      if (!text) return null;
      
      const result: React.ReactNode[] = [];
      let remaining = text;
      let partKey = 0;
      
      while (remaining.length > 0) {
        // 优先匹配代码 `code`
        const codeMatch = remaining.match(/`([^`]+)`/);
        // 三级重点 ***text***
        const h3Match = remaining.match(/\*\*\*([^*]+)\*\*\*/);
        // 二级重点 **text**
        const h2Match = remaining.match(/\*\*([^*]+)\*\*/);
        // 一级重点 *text*（单星号，前后不能是星号）
        const h1Match = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
        
        // 找到最早匹配的
        const matches = [
          codeMatch && { type: 'code', match: codeMatch, index: codeMatch!.index! },
          h3Match && { type: 'h3', match: h3Match, index: h3Match!.index! },
          h2Match && { type: 'h2', match: h2Match, index: h2Match!.index! },
          h1Match && { type: 'h1', match: h1Match, index: h1Match!.index! },
        ].filter(Boolean) as Array<{ type: string; match: RegExpMatchArray; index: number }>;
        
        if (matches.length === 0) {
          // 没有匹配，直接输出剩余文本
          result.push(remaining);
          break;
        }
        
        // 找到最早的匹配
        const earliest = matches.reduce((a, b) => a.index < b.index ? a : b);
        
        // 输出匹配前的文本
        if (earliest.index > 0) {
          result.push(remaining.slice(0, earliest.index));
        }
        
        // 输出匹配的内容
        switch (earliest.type) {
          case 'code':
            result.push(
              <code key={partKey++} style={{ backgroundColor: '#2C2C2C', color: COLORS.primary }} className="px-1.5 py-0.5 rounded text-base font-mono">
                {earliest.match[1]}
              </code>
            );
            remaining = remaining.slice(earliest.index + earliest.match[0].length);
            break;
          case 'h3':
            result.push(
              <em key={partKey++} style={{ color: '#FFFFFF' }} className="font-semibold">
                {earliest.match[1]}
              </em>
            );
            remaining = remaining.slice(earliest.index + earliest.match[0].length);
            break;
          case 'h2':
            result.push(
              <strong key={partKey++} style={{ color: '#FFFFFF' }} className="font-semibold">
                {earliest.match[1]}
              </strong>
            );
            remaining = remaining.slice(earliest.index + earliest.match[0].length);
            break;
          case 'h1':
            result.push(
              <strong key={partKey++} style={{ color: COLORS.highlight }} className="font-semibold">
                {earliest.match[1]}
              </strong>
            );
            remaining = remaining.slice(earliest.index + earliest.match[0].length);
            break;
        }
      }
      
      return result;
    };

    while (i < lines.length) {
      const line = lines[i];
      
      if (line.trim() === '') {
        i++;
        continue;
      }
      
      if (line.trim() === '---') {
        elements.push(<hr key={key++} style={{ borderColor: '#2C2C2C' }} className="my-6" />);
        i++;
        continue;
      }
      
      // 处理所有代码块（包括 mermaid，作为普通代码块渲染）
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3);
        const codeLines: string[] = [];
        i++; // 跳过 ```lang 行
        while (i < lines.length && lines[i].trim() !== '```') {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // 跳过 ``` 行
        
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        
        const code = codeLines.join('\n');
        elements.push(
          <pre key={key++} className="my-3 p-3 rounded-lg text-sm overflow-x-auto" style={{ backgroundColor: '#141414', border: '1px solid #2C2C2C' }}>
            <code style={{ color: '#A0A0A0' }}>{code}</code>
          </pre>
        );
        continue;
      }
      
      if (line.startsWith('### ')) {
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        elements.push(<h4 key={key++} className="text-lg font-semibold mt-6 mb-3 flex items-center gap-2" style={{ color: '#E5E5E5' }}><span style={{ backgroundColor: COLORS.primary }} className="w-1 h-5 rounded-full"></span>{renderInline(line.slice(4))}</h4>);
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        elements.push(<h3 key={key++} className="text-xl font-semibold mt-8 mb-3 flex items-center gap-2" style={{ color: '#FFFFFF' }}><span style={{ backgroundColor: COLORS.primary }} className="w-1.5 h-6 rounded-full"></span>{renderInline(line.slice(3))}</h3>);
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        elements.push(<h2 key={key++} className="text-2xl font-bold mt-10 mb-4 flex items-center gap-2" style={{ color: '#FFFFFF' }}><span style={{ backgroundColor: COLORS.primary }} className="w-2 h-7 rounded-full"></span>{renderInline(line.slice(2))}</h2>);
        i++;
        continue;
      }
      
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        elements.push(
          <div key={key++} style={{ borderColor: COLORS.primary, backgroundColor: 'rgba(7, 193, 96, 0.05)' }} className="border-l-2 pl-4 py-3 my-4 rounded-r-lg group relative">
            <div className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: '#A0A0A0' }}>{renderInline(quoteLines.join('\n'))}</div>
            <button onClick={() => copyText(quoteLines.join('\n'))} className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all hover:opacity-80" style={{ backgroundColor: '#2C2C2C' }}>
              {copiedText === quoteLines.join('\n') ? <Check className="w-4 h-4" style={{ color: COLORS.primary }} /> : <Copy className="w-4 h-4" style={{ color: '#666666' }} />}
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
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        elements.push(
          <ul key={key++} className="my-4 space-y-2.5">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-3" style={{ color: '#A0A0A0' }}>
                <span style={{ color: COLORS.primary }} className="shrink-0 text-base leading-normal">•</span>
                <span className="flex-1 text-base leading-normal">{renderInline(item)}</span>
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
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        elements.push(
          <ol key={key++} className="my-4 space-y-2.5">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-3" style={{ color: '#A0A0A0' }}>
                <span style={{ color: COLORS.primary }} className="font-mono font-medium w-6 shrink-0 text-base leading-normal">{idx + 1}.</span>
                <span className="flex-1 text-base leading-normal">{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }
      
      if (!prefixUsed && prefix) {
        elements.push(
          <p key={key++} className="text-base leading-relaxed my-2" style={{ color: '#A0A0A0' }}>
            {prefix}{renderInline(line)}
          </p>
        );
        prefixUsed = true;
      } else {
        elements.push(
          <p key={key++} className="text-base leading-relaxed my-2" style={{ color: '#A0A0A0' }}>
            {renderInline(line)}
          </p>
        );
      }
      i++;
    }

    return elements;
  };

  const renderConversation = () => {
    const elements: React.ReactNode[] = [];
    
    // 渲染分析结果
    if (analysisResult) {
      elements.push(
        <div key="main-answer" className="mb-6">
          <div className="rounded-xl p-5" style={{ backgroundColor: 'rgba(28, 28, 28, 0.6)', border: '1px solid rgba(44, 44, 44, 0.5)' }}>
            <div className="text-base leading-relaxed">
              {renderMarkdown(analysisResult)}
            </div>
          </div>
        </div>
      );
    }
    
    // 渲染追问和回答（从对话历史中跳过前两条）
    if (conversationHistory.length > 2) {
      for (let i = 2; i < conversationHistory.length; i++) {
        const msg = conversationHistory[i];
        
        if (msg.role === 'user') {
          // 用户追问
          elements.push(
            <div key={`q-${i}`} className="mt-8 pt-6" style={{ borderTop: '1px solid #1A1A1A' }}>
              <p className="text-base leading-relaxed" style={{ color: '#A0A0A0' }}>
                <span className="font-medium" style={{ color: COLORS.primary }}>我：</span>
                {msg.content}
              </p>
            </div>
          );
        } else if (msg.role === 'assistant') {
          // 老陈回答 - 用卡片包裹
          elements.push(
            <div key={`a-${i}`} className="mt-4">
              <div className="rounded-xl p-5" style={{ backgroundColor: 'rgba(28, 28, 28, 0.6)', border: '1px solid rgba(44, 44, 44, 0.5)' }}>
                <div className="text-base leading-relaxed">
                  {renderMarkdown(msg.content, <span className="font-medium" style={{ color: COLORS.primary }}>老陈：</span>)}
                </div>
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
        <div key="loading" className="flex items-center gap-2 text-base mt-4" style={{ color: '#666666' }}>
          <Loader2 className="w-5 h-5 animate-spin" /><span>思考中...</span>
        </div>
      );
    }
    
    return elements;
  };

  const isProcessing = isAnalyzing || isOcring || isFollowUp || isLoadingRecord;
  const canAnalyze = true; // 空输入也允许，老陈会挑个技术场景主动讲解

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#000000', color: '#E5E5E5' }}>
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center m-4 rounded-xl" style={{ backgroundColor: 'rgba(0, 0, 0, 0.98)', border: '2px dashed rgba(7, 193, 96, 0.5)' }}>
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2C2C2C' }}>
              <ImageIcon className="w-8 h-8" style={{ color: COLORS.primary }} />
            </div>
            <p className="text-lg" style={{ color: '#A0A0A0' }}>释放以上传图片</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0" style={{ backgroundColor: '#0A0A0A', borderBottom: '1px solid #1A1A1A' }}>
        <div className="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/avatar.png"
              alt="CTO"
              className="w-9 h-9 rounded-lg object-cover"
              style={{ boxShadow: `0 0 0 2px rgba(7, 193, 96, 0.3)` }}
            />
            <div>
              <span className="text-lg font-semibold" style={{ color: '#FFFFFF' }}>首席技术官-老陈</span>
              <span className="text-xs ml-2" style={{ color: '#4A4A4A' }}>CTO</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-2 border border-transparent transition-all" style={{ color: '#666666' }} 
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2C2C2C'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.backgroundColor = '#1A1A1A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Clock className="w-4 h-4" />历史记录
            </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="w-full flex">
          {/* Left: Input */}
          <div
            className="shrink-0 flex flex-col"
            style={{ width: leftWidth, backgroundColor: '#121212', borderRight: '1px solid #1A1A1A' }}
          >
            <div className="p-5 flex-1 flex flex-col min-h-0">
              {/* 问题背景 */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-xs mb-2 uppercase tracking-wider flex items-center justify-between" style={{ color: '#4A4A4A' }}>
                  <span>问题背景</span>
                  <label className="cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded transition-all hover:bg-[#1A1A1A]" style={{ color: '#666666' }}>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = e.target.files;
                      if (files) { for (const file of files) await uploadImage(file); }
                      e.target.value = '';
                    }} />
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span className="text-xs">补充图片</span>
                  </label>
                </div>
                
                {/* 已上传的图片 */}
                {images.length > 0 && (
                  <div className="mb-3">
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((img) => (
                        <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden group" style={{ backgroundColor: '#141414', border: '1px solid #2C2C2C' }}>
                          {img.isUploading ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.primary }} />
                            </div>
                          ) : (
                            <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                          )}
                          <button 
                            onClick={() => removeImage(img.id)} 
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                            style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', border: '1px solid #3C3C3C' }}
                          >
                            <X className="w-3 h-4" style={{ color: '#666666' }} />
                          </button>
                        </div>
                      ))}
                      {images.length < MAX_IMAGES && (
                        <button 
                          onClick={() => fileInputRef.current?.click()} 
                          className="aspect-square rounded-lg flex items-center justify-center transition-all"
                          style={{ border: '1px dashed #2C2C2C' }}
                        >
                          <Plus className="w-5 h-5" style={{ color: '#3C3C3C' }} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                <Textarea 
                  ref={textareaRef} 
                  placeholder="粘贴开发说的话...&#10;&#10;支持 Ctrl+V 粘贴截图"
                  value={inputText} 
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 min-h-0 text-base resize-none overflow-y-auto rounded-lg"
                  style={{ backgroundColor: '#141414', border: '1px solid #2C2C2C', color: '#FFFFFF' }}
                  disabled={isProcessing} 
                />
              </div>

              {/* 补充问题 */}
              <div className="mt-4">
                <div className="text-xs mb-2 uppercase tracking-wider" style={{ color: '#4A4A4A' }}>
                  补充问题（可选）
                </div>
                <Textarea
                  placeholder="想让我重点解读什么？比如「这个方案风险怎么样」「我要怎么跟老板汇报」"
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  className="min-h-[72px] max-h-[160px] text-sm resize-none overflow-y-auto rounded-lg"
                  style={{ backgroundColor: '#141414', border: '1px solid #2C2C2C', color: '#FFFFFF' }}
                  disabled={isProcessing}
                />
              </div>
              
              {/* Toolbar */}
              <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: '1px solid #1A1A1A' }}>
                <button 
                  onClick={clearAll} 
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border border-transparent"
                  style={{ color: '#4A4A4A' }}
                >
                  <Trash2 className="w-4 h-4" /><span>清空</span>
                </button>
                
                {isProcessing ? (
                  <Button onClick={handleStop} className="rounded-lg h-10 px-5 text-base" style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}>
                    <Square className="w-4 h-4 mr-1.5" />停止
                  </Button>
                ) : (
                  <Button 
                    onClick={handleAnalyze} 
                    disabled={!canAnalyze} 
                    className="rounded-lg h-10 px-5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: COLORS.primary, color: '#000000', fontWeight: 500 }}
                  >
                    <ArrowUp className="w-4 h-4 mr-1.5" />分析
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(e) => {
              e.preventDefault();
              isResizingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';

              const onMove = (ev: MouseEvent) => {
                if (!isResizingRef.current) return;
                const next = Math.min(720, Math.max(320, ev.clientX));
                setLeftWidth(next);
              };
              const onUp = () => {
                isResizingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            onDoubleClick={() => setLeftWidth(420)}
            title="拖拽调整宽度，双击恢复默认"
            className="shrink-0 cursor-col-resize flex items-center justify-center group"
            style={{ width: 6, backgroundColor: 'transparent' }}
          >
            <div
              className="h-10 w-[3px] rounded-full transition-colors"
              style={{ backgroundColor: '#2C2C2C' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLORS.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2C2C2C')}
            />
          </div>

          {/* Right: Results */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: '#000000' }}>
            {/* Topic Title */}
            {topicTitle && (
              <div className="shrink-0 px-6 py-4" style={{ backgroundColor: '#0A0A0A', borderBottom: '1px solid #1A1A1A' }}>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.primary, boxShadow: `0 0 6px ${COLORS.primary}` }} />
                  <h1 className="text-xl font-semibold" style={{ color: '#FFFFFF' }}>{topicTitle}</h1>
                  {isGeneratingTitle && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#4A4A4A' }} />}
                </div>
              </div>
            )}
            
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
              {isLoadingRecord && (
                <div className="flex items-center gap-2 text-base" style={{ color: '#666666' }}>
                  <Loader2 className="w-5 h-5 animate-spin" /><span>加载历史记录...</span>
                </div>
              )}

              {!isLoadingRecord && (isAnalyzing || isFollowUp || isOcring) && !analysisResult && conversationHistory.length === 0 && (
                <AnalysisSkeleton
                  stage={waitingStage}
                  isOcr={isOcring}
                  isFollowUp={isFollowUp}
                  primary={COLORS.primary}
                />
              )}

              {!isLoadingRecord && !isProcessing && conversationHistory.length === 0 && !topicTitle && (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A' }}>
                    <ArrowUp className="w-10 h-10" style={{ color: '#2C2C2C' }} />
                  </div>
                  <p className="text-lg" style={{ color: '#4A4A4A' }}>输入内容，开始分析</p>
                  <p className="text-sm mt-2" style={{ color: '#3C3C3C' }}>支持文字和图片</p>
                </div>
              )}

              {/* 主要内容和对话历史 */}
              {!isLoadingRecord && conversationHistory.length > 0 && (
                <div className="text-base leading-relaxed">
                  {renderConversation()}
                </div>
              )}
              
              <div ref={resultsEndRef} />
            </div>
            
            {/* 追问输入框 */}
            <div className="shrink-0 p-4" style={{ backgroundColor: '#0A0A0A', borderTop: '1px solid #1A1A1A' }}>
              <div className="flex gap-3 items-center">
                {conversationHistory.length > 0 && (
                  <Button 
                    onClick={clearAll}
                    variant="ghost"
                    className="shrink-0 px-4 gap-2"
                    style={{ color: '#666666', border: '1px solid #2C2C2C', height: '40px', backgroundColor: 'transparent' }}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm">新会话</span>
                  </Button>
                )}
                <div className="flex-1 flex gap-3 items-center">
                  <input
                    type="text"
                    placeholder={conversationHistory.length > 0 ? "继续追问..." : "输入问题开始分析..."} 
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    className="flex-1 h-10 px-4 text-sm rounded-lg outline-none"
                    style={{ backgroundColor: 'transparent', border: '1px solid #2C2C2C', color: '#FFFFFF' }}
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
                    <Button onClick={handleStop} className="rounded-lg h-10 px-4 shrink-0" style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}>
                      <Square className="w-5 h-5" />
                    </Button>
                  ) : conversationHistory.length > 0 ? (
                    <Button 
                      onClick={handleFollowUp} 
                      disabled={!followUpText.trim()} 
                      className="rounded-lg h-10 px-4 shrink-0 disabled:opacity-40"
                      style={{ backgroundColor: COLORS.primary, color: '#000000', fontWeight: 500 }}
                    >
                      <ArrowUp className="w-5 h-5" />
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleAnalyze} 
                      disabled={!canAnalyze} 
                      className="rounded-lg h-10 px-4 shrink-0 disabled:opacity-40"
                      style={{ backgroundColor: COLORS.primary, color: '#000000', fontWeight: 500 }}
                    >
                      <ArrowUp className="w-5 h-5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// 加载状态组件
function LoadingFallback() {
  return (
    <div className="h-screen flex items-center justify-center" style={{ backgroundColor: '#000000' }}>
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#07C160' }} />
        <p style={{ color: '#666666' }}>加载中...</p>
      </div>
    </div>
  );
}

// 导出带有 Suspense 边界的页面组件
export default function HomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  );
}

// === 等待骨架屏 ==============================================
const WAIT_STAGES = [
  '正在读取你提供的内容…',
  '正在拆解技术术语…',
  '正在评估当前风险和进展…',
  '正在整理你需要跟进的事项…',
  '正在准备可直接使用的话术…',
];

function AnalysisSkeleton({
  stage,
  isOcr,
  isFollowUp,
  primary,
}: {
  stage: number;
  isOcr: boolean;
  isFollowUp: boolean;
  primary: string;
}) {
  const headline = isOcr
    ? '正在识别图片中的文字…'
    : isFollowUp
    ? '老陈正在思考你的追问…'
    : '老陈正在思考…';

  const subline = WAIT_STAGES[stage] || WAIT_STAGES[0];

  return (
    <div className="max-w-3xl">
      <style>{`
        @keyframes ctoShimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes ctoPulse {
          0%, 100% { opacity: .45; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* 标题行 */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: primary, animation: 'ctoPulse 1.2s ease-in-out infinite' }}
        />
        <div>
          <div className="text-base font-semibold" style={{ color: '#E5E5E5' }}>{headline}</div>
          <div className="text-xs mt-0.5 transition-opacity" style={{ color: '#666666' }}>{subline}</div>
        </div>
      </div>

      {/* 小白版区块骨架 */}
      <SkeletonBlock title="🙋 小白版" lines={3} primary={primary} />
      {/* 技术点解读 */}
      <SkeletonBlock title="技术点解读" lines={4} primary={primary} dotted />
      {/* 当前进展 */}
      <SkeletonBlock title="当前进展判断" lines={3} primary={primary} dotted />
      {/* 你需要跟进的 */}
      <SkeletonBlock title="⚠️ 你需要跟进的" lines={3} primary={primary} dotted />
      {/* 建议话术 */}
      <SkeletonBlock title="💬 建议你这样问" lines={2} primary={primary} />
    </div>
  );
}

function SkeletonBlock({
  title,
  lines,
  primary,
  dotted = false,
}: {
  title: string;
  lines: number;
  primary: string;
  dotted?: boolean;
}) {
  const shimmerStyle: React.CSSProperties = {
    background:
      'linear-gradient(90deg, #1a1a1a 0%, #262626 50%, #1a1a1a 100%)',
    backgroundSize: '400px 100%',
    animation: 'ctoShimmer 1.6s linear infinite',
    borderRadius: 6,
    height: 10,
  };
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-4 rounded-full" style={{ backgroundColor: primary }} />
        <span className="text-sm font-semibold" style={{ color: '#9A9A9A' }}>{title}</span>
      </div>
      <div className="space-y-2.5 pl-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            {dotted && (
              <span
                className="w-1 h-1 rounded-full shrink-0"
                style={{ backgroundColor: '#2C2C2C' }}
              />
            )}
            <div
              style={{
                ...shimmerStyle,
                width: `${72 - (i % 3) * 10}%`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
