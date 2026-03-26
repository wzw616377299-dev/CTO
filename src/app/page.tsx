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
  Trash2,
  ZoomIn,
  ZoomOut,
  Download,
  RotateCcw,
  Move
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
  { id: 'report', label: '汇报框架' },
  { id: 'prompt', label: 'Prompt梳理' },
];

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

// Mermaid 图表渲染组件 - 使用动态导入避免 SSR 问题
const MermaidDiagram = React.memo(({ code }: { code: string }) => {
  const [svg, setSvg] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const renderDiagram = async () => {
      try {
        setLoading(true);
        
        // 动态导入 mermaid
        const mermaid = (await import('mermaid')).default;
        
        // 初始化配置
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#07C160',
            primaryTextColor: '#FFFFFF',
            primaryBorderColor: '#2C2C2C',
            lineColor: '#3C3C3C',
            secondaryColor: '#1A1A1A',
            tertiaryColor: '#141414',
            background: '#141414',
            mainBkg: '#1A1A1A',
            nodeBorder: '#3C3C3C',
            clusterBkg: '#1A1A1A',
            titleColor: '#FFFFFF',
            edgeLabelBackground: '#1A1A1A',
          },
          flowchart: { curve: 'basis', padding: 15, useMaxWidth: true },
          mindmap: { padding: 15, useMaxWidth: true },
          sequence: { useMaxWidth: true },
          securityLevel: 'loose',
        });
        
        // 全面的代码清理，修复常见的 Mermaid 语法错误
        let cleanedCode = code
          // 1. 替换中文括号为英文
          .replace(/[（）【】《》「」『』〈〉]/g, match => {
            const map: Record<string, string> = {
              '（': '(', '）': ')', '【': '[', '】': ']',
              '《': '<', '》': '>', '「': '"', '」': '"',
              '『': '"', '』': '"', '〈': '<', '〉': '>'
            };
            return map[match] || match;
          })
          // 2. 替换中文标点
          .replace(/[，。！？、；：]/g, '')
          // 3. 清理 subgraph 语法 - 确保格式正确
          .replace(/subgraph\s+([^\[\n]+)/g, (match, name) => {
            // 如果名称包含特殊字符，用引号包裹
            const trimmed = name.trim();
            if (trimmed && !trimmed.startsWith('"')) {
              return `subgraph ${trimmed}`;
            }
            return match;
          })
          // 4. 修复节点定义中的中文 - 确保用引号包裹
          .replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*([^\]\[]*[^\x00-\xff][^\]\[]*)\s*\]/g, (match, id, label) => {
            // 如果标签包含中文，确保正确格式
            return `${id}["${label.trim()}"]`;
          })
          // 5. 移除多余的空格和换行
          .replace(/\n\s*\n/g, '\n')
          .trim();
        
        // 验证代码是否有效（基本检查）
        if (!cleanedCode || cleanedCode.length < 10) {
          if (mounted) {
            setLoading(false);
          }
          return;
        }
        
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, cleanedCode);
        
        if (mounted) {
          setSvg(svg);
          setLoading(false);
        }
      } catch (err) {
        // 静默失败，不显示错误
        console.warn('Mermaid render skipped:', err);
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    if (code) {
      renderDiagram();
    }
    
    return () => {
      mounted = false;
    };
  }, [code]);

  // 错误时不显示任何内容
  if (!svg) {
    if (loading) {
      return (
        <div className="my-4 p-4 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2C2C2C', minHeight: '60px' }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: COLORS.primary }} />
        </div>
      );
    }
    // 渲染失败时静默返回 null
    return null;
  }

  return (
    <div 
      className="my-4 p-4 rounded-lg overflow-x-auto"
      style={{ backgroundColor: '#1A1A1A', border: '1px solid #2C2C2C' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

MermaidDiagram.displayName = 'MermaidDiagram';

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = searchParams.get('recordId');
  
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(['work', 'understand', 'concept']);
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
  
  // 保存数据到 localStorage - 使用防抖优化
  useEffect(() => {
    if (!recordId && (inputText || images.length > 0 || analysisResult)) {
      const timer = setTimeout(() => {
        localStorage.setItem('cto_current_session', JSON.stringify({
          inputText,
          images,
          scenarios: selectedScenarios,
          analysisResult,
          topicTitle,
          conversationHistory,
        }));
      }, 500); // 500ms 防抖
      
      return () => clearTimeout(timer);
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
              setSelectedScenarios(modes.length > 0 ? modes : ['work', 'understand', 'concept']);
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
    setTopicTitle('');
    setSelectedScenarios(['work', 'understand', 'concept']);
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
      
      // 先生成主题标题
      let title = '';
      setIsGeneratingTitle(true);
      try {
        const titleResponse = await fetch('/api/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputText: finalText }),
        });
        const titleData = await titleResponse.json();
        if (titleData.title) {
          title = titleData.title;
          setTopicTitle(title);
        }
      } catch {
        // 失败时使用简单截取
        title = finalText.replace(/\n/g, ' ').slice(0, 20);
        setTopicTitle(title + (finalText.length > 20 ? '...' : ''));
      } finally {
        setIsGeneratingTitle(false);
      }
      
      abortControllerRef.current = new AbortController();
      const scenario = selectedScenarios.join(',');
      const stream = await analyzeApi.stream(finalText, scenario, abortControllerRef.current.signal, title);
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
  }, [inputText, images, selectedScenarios]);

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
      
      // 处理 mermaid 代码块
      if (line.trim() === '```mermaid') {
        const codeLines: string[] = [];
        i++; // 跳过 ```mermaid 行
        while (i < lines.length && lines[i].trim() !== '```') {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // 跳过 ``` 行
        
        if (prefix && !prefixUsed) {
          elements.push(<p key={key++} className="text-base leading-relaxed mb-2" style={{ color: '#A0A0A0' }}>{prefix}</p>);
          prefixUsed = true;
        }
        
        const mermaidCode = codeLines.join('\n');
        elements.push(
          <MermaidDiagram key={key++} code={mermaidCode} />
        );
        continue;
      }
      
      // 处理普通代码块
      if (line.trim().startsWith('```') && line.trim() !== '```mermaid') {
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
        
        elements.push(
          <pre key={key++} className="my-4 p-4 rounded-lg overflow-x-auto" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2C2C2C' }}>
            <code className="text-sm font-mono" style={{ color: '#A0A0A0' }}>{codeLines.join('\n')}</code>
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

  // 渲染对话历史
  // 从内容中提取 Mermaid 代码 - 支持多种格式
  const extractMermaidFromContent = (content: string): string | null => {
    // 尝试多种正则格式
    const patterns = [
      /```mermaid\n([\s\S]*?)\n```/,           // 标准 markdown
      /```mermaid\r?\n([\s\S]*?)\r?\n```/,     // 兼容不同换行
      /```mermaid\s*\n([\s\S]*?)```/,          // 宽松匹配
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const code = match[1].trim();
        // 确保提取到的是有效的 mermaid 代码（至少包含 graph 或 flowchart 等关键字）
        if (code.length > 10 && /^(graph|flowchart|sequenceDiagram|mindmap|gantt|classDiagram|stateDiagram)/m.test(code)) {
          return code;
        }
      }
    }
    return null;
  };

  // 检查是否是 Prompt 梳理场景
  const isPromptScenario = selectedScenarios.includes('prompt');

  // Prompt 流程图渲染组件 - 直接渲染 Mermaid，支持缩放、拖拽、下载
  const PromptFlowChart = ({ mermaidCode }: { mermaidCode: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [scale, setScale] = useState(1);
    const [isDraggingChart, setIsDraggingChart] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });

    // 渲染 Mermaid
    useEffect(() => {
      let mounted = true;
      
      const renderDiagram = async () => {
        try {
          const mermaid = (await import('mermaid')).default;
          
          mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            themeVariables: {
              primaryColor: '#07C160',
              primaryTextColor: '#FFFFFF',
              primaryBorderColor: '#2C2C2C',
              lineColor: '#3C3C3C',
              secondaryColor: '#1A1A1A',
              tertiaryColor: '#141414',
              background: '#141414',
              mainBkg: '#1A1A1A',
              nodeBorder: '#3C3C3C',
              clusterBkg: '#1A1A1A',
              titleColor: '#FFFFFF',
              edgeLabelBackground: '#1A1A1A',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: '13px',
            },
            flowchart: {
              curve: 'basis',
              padding: 15,
              useMaxWidth: true,
              htmlLabels: true,
              rankSpacing: 50,
              nodeSpacing: 30,
              defaultRenderer: 'dagre-wrapper',
            },
            sequence: {
              actorMargin: 50,
              boxMargin: 10,
              boxTextMargin: 5,
              noteMargin: 10,
              messageMargin: 35,
            },
            securityLevel: 'loose',
          });
          
          // 清理代码 - 保留 br 标签用于换行
          let cleanedCode = mermaidCode
            .replace(/[（）【】《》「」『』〈〉]/g, match => {
              const map: Record<string, string> = {
                '（': '(', '）': ')', '【': '[', '】': ']',
                '《': '<', '》': '>', '「': '"', '」': '"',
                '『': '"', '』': '"', '〈': '<', '〉': '>'
              };
              return map[match] || match;
            })
            .trim();
          
          const id = `prompt-flowchart-${Date.now()}`;
          const { svg: renderedSvg } = await mermaid.render(id, cleanedCode);
          
          if (mounted) {
            setSvg(renderedSvg);
          }
        } catch (err) {
          console.warn('Mermaid render error:', err);
        }
      };
      
      if (mermaidCode) {
        renderDiagram();
      }
      
      return () => {
        mounted = false;
      };
    }, [mermaidCode]);

    // 缩放控制
    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.3));
    const handleReset = () => {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    };

    // 拖拽控制
    const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingChart(true);
      setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseUp = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDraggingChart(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingChart) return;
      e.preventDefault();
      e.stopPropagation();
      setPosition({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y
      });
    };

    const handleMouseLeave = () => setIsDraggingChart(false);

    // 下载图片
    const handleDownload = () => {
      if (!svg) return;
      
      // 创建 SVG blob
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      // 下载 SVG
      const downloadLink = document.createElement('a');
      downloadLink.href = svgUrl;
      downloadLink.download = `prompt-flowchart-${Date.now()}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(svgUrl);
    };

    return (
      <div className="flex flex-col h-full">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 mb-2" style={{ backgroundColor: '#0A0A0A', borderRadius: '8px' }}>
          <div className="flex items-center gap-1 text-xs" style={{ color: '#666666' }}>
            <Move className="w-4 h-4 mr-1" />
            按住鼠标拖动
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleZoomOut}
              className="p-1.5 rounded hover:bg-[#2C2C2C] transition-colors"
              style={{ color: '#666666' }}
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs min-w-[50px] text-center" style={{ color: '#A0A0A0' }}>
              {Math.round(scale * 100)}%
            </span>
            <button 
              onClick={handleZoomIn}
              className="p-1.5 rounded hover:bg-[#2C2C2C] transition-colors"
              style={{ color: '#666666' }}
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button 
              onClick={handleReset}
              className="p-1.5 rounded hover:bg-[#2C2C2C] transition-colors ml-2"
              style={{ color: '#666666' }}
              title="重置"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button 
              onClick={handleDownload}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#2C2C2C] transition-colors ml-2"
              style={{ color: '#07C160' }}
              title="下载"
            >
              <Download className="w-4 h-4" />
              <span className="text-xs">下载</span>
            </button>
          </div>
        </div>
        
        {/* 画布区域 */}
        <div 
          className="flex-1 overflow-hidden relative"
          style={{ 
            backgroundColor: '#0A0A0A',
            borderRadius: '12px',
            border: '1px solid #2C2C2C',
            cursor: isDraggingChart ? 'grabbing' : 'grab',
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {svg ? (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDraggingChart ? 'none' : 'transform 0.1s ease-out',
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#07C160' }} />
            </div>
          )}
        </div>
      </div>
    );
  };

  // 渲染 Prompt 梳理场景的内容
  const renderPromptContent = (): React.ReactNode => {
    if (!analysisResult) return null;
    
    const mermaidCode = extractMermaidFromContent(analysisResult);
    
    // 如果成功提取到 Mermaid 代码，渲染流程图
    if (mermaidCode) {
      return (
        <div key="prompt-flowchart" className="flex-1 flex flex-col h-full">
          <PromptFlowChart mermaidCode={mermaidCode} />
        </div>
      );
    }
    
    // 如果正在分析且还没提取到完整代码，显示加载状态
    if (isAnalyzing) {
      // 检查是否已经开始输出 mermaid 代码块
      if (analysisResult.includes('```mermaid')) {
        return (
          <div className="flex items-center gap-2 text-base" style={{ color: '#666666' }}>
            <Loader2 className="w-5 h-5 animate-spin" /><span>正在渲染流程图...</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 text-base" style={{ color: '#666666' }}>
          <Loader2 className="w-5 h-5 animate-spin" /><span>生成流程图中...</span>
        </div>
      );
    }
    
    // 分析完成但没有提取到有效 mermaid，尝试查找任何可能的代码块
    const anyCodeBlock = analysisResult.match(/```(\w*)\n([\s\S]*?)```/);
    if (anyCodeBlock && anyCodeBlock[2]) {
      const code = anyCodeBlock[2].trim();
      if (code.length > 10) {
        return (
          <div key="prompt-flowchart-fallback" className="flex-1 flex flex-col min-h-[400px]">
            <PromptFlowChart mermaidCode={code} />
          </div>
        );
      }
    }
    
    // 最后兜底：显示提示信息
    return (
      <div className="rounded-xl p-5" style={{ backgroundColor: 'rgba(28, 28, 28, 0.6)', border: '1px solid rgba(44, 44, 44, 0.5)' }}>
        <div className="text-base" style={{ color: '#999999' }}>
          流程图生成完成，但无法解析有效的图表代码。请尝试重新生成。
        </div>
      </div>
    );
  };

  const renderConversation = () => {
    const elements: React.ReactNode[] = [];
    
    // 如果是 Prompt 梳理场景，使用特殊渲染
    if (isPromptScenario && analysisResult) {
      elements.push(renderPromptContent());
    } else if (analysisResult) {
      // 普通场景的渲染
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
  const canAnalyze = inputText.trim().length > 0 || images.length > 0;

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
          <Link href="/history" className="group">
            <Button variant="ghost" size="sm" className="gap-2 border border-transparent transition-all" style={{ color: '#666666' }} 
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2C2C2C'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.backgroundColor = '#1A1A1A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Clock className="w-4 h-4" />历史记录
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden justify-center">
        <div className="w-full max-w-[1800px] flex">
          {/* Left: Input */}
          <div className="w-[420px] shrink-0 flex flex-col" style={{ backgroundColor: '#121212', borderRight: '1px solid #1A1A1A' }}>
            <div className="p-5 flex-1 flex flex-col min-h-0">
              {/* Scenario - 多选 */}
              <div className="mb-5">
                <div className="text-xs mb-2 uppercase tracking-wider" style={{ color: '#4A4A4A' }}>场景选择</div>
                <div className="grid grid-cols-2 gap-2">
                  {SCENARIOS.map((s) => (
                    <button 
                      key={s.id} 
                      onClick={() => toggleScenario(s.id)}
                      className="py-2 text-sm rounded-lg transition-all"
                      style={selectedScenarios.includes(s.id) 
                        ? { backgroundColor: 'rgba(7, 193, 96, 0.1)', color: COLORS.primary, border: '1px solid rgba(7, 193, 96, 0.5)', boxShadow: '0 0 10px rgba(7, 193, 96, 0.1)' }
                        : { backgroundColor: '#141414', color: '#666666', border: '1px solid #2C2C2C' }
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              
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
                  placeholder={isPromptScenario 
                    ? "粘贴你的 Prompt 内容...&#10;&#10;我会帮你梳理成可视化的流程图" 
                    : "粘贴开发说的话...&#10;&#10;支持 Ctrl+V 粘贴截图"
                  } 
                  value={inputText} 
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 min-h-0 text-base resize-none overflow-y-auto rounded-lg"
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

          {/* Right: Results */}
          <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: '#000000' }}>
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
            
            <div ref={scrollContainerRef} className={`flex-1 ${isPromptScenario ? 'overflow-hidden p-3' : 'overflow-y-auto p-6'}`}>
              {isLoadingRecord && (
                <div className="flex items-center gap-2 text-base" style={{ color: '#666666' }}>
                  <Loader2 className="w-5 h-5 animate-spin" /><span>加载历史记录...</span>
                </div>
              )}

              {!isLoadingRecord && (isAnalyzing || isFollowUp) && conversationHistory.length === 0 && (
                <div className="flex items-center gap-2 text-base" style={{ color: '#666666' }}>
                  <Loader2 className="w-5 h-5 animate-spin" /><span>{isPromptScenario ? '生成流程图中...' : '分析中...'}</span>
                </div>
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
                <div className={`text-base leading-relaxed ${isPromptScenario ? 'h-full flex flex-col overflow-hidden' : ''}`}>
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
