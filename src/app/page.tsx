'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
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

interface TechnicalPoint {
  term: string;
  inContext: string;
  whyMentioned: string;
  realImpact: string;
  analogy: string;
}

interface DialogContext {
  speakers: string[];
  summary: string;
  background: string;
}

interface IntentVerdict {
  judgment: string;
  reason: string;
  confidence: string;
}

interface AnalysisResult {
  dialogContext?: DialogContext;
  technicalPoints?: TechnicalPoint[];
  intentVerdict?: IntentVerdict;
  scripts?: string[];
  followUp?: string[];
  knowledge?: {
    summary: string;
    details: string[];
  };
  recordId?: string;
}

export default function HomePage() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getUserId();
  }, []);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await processImageFile(file);
          break;
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
      if (files && files[0]?.type.startsWith('image/')) {
        await processImageFile(files[0]);
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
      if (result.text) setInputText(result.text);
    } catch {
      alert('图片识别失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyze = useCallback(async () => {
    if (!inputText.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setStreamingContent('');
    
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
                setStreamingContent(fullContent);
              }
            } catch {}
          }
        }
      }
      
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        setAnalysisResult(JSON.parse(jsonMatch[0]));
      }
    } catch {
      alert('分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }, [inputText, isAnalyzing]);

  const copyText = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
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

      {/* Main Content - Full Height Split */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Input */}
        <div className="w-[400px] shrink-0 border-r border-neutral-100 flex flex-col">
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <Textarea
                ref={textareaRef}
                placeholder="粘贴开发说的话...&#10;&#10;支持 Ctrl+V 粘贴截图"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 min-h-0 border-neutral-200 text-sm placeholder:text-neutral-400 focus:border-neutral-300 resize-none"
                disabled={isAnalyzing}
              />
            </div>
            
            {/* Toolbar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    if (e.target.files?.[0]) await processImageFile(e.target.files[0]);
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
            {isAnalyzing && !analysisResult && streamingContent && (
              <div className="text-neutral-400 text-sm whitespace-pre-wrap leading-relaxed">
                {streamingContent}
              </div>
            )}

            {!isAnalyzing && !analysisResult && (
              <div className="text-neutral-400 text-sm">
                输入内容后点击分析
              </div>
            )}

            {analysisResult && (
              <div className="space-y-6">
                {/* Dialog Context */}
                {analysisResult.dialogContext && (
                  <section>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">对话背景</h3>
                    <p className="text-sm text-neutral-700 leading-relaxed">{analysisResult.dialogContext.summary}</p>
                    {analysisResult.dialogContext.background && (
                      <p className="text-xs text-neutral-500 mt-1">{analysisResult.dialogContext.background}</p>
                    )}
                  </section>
                )}

                {/* Technical Points */}
                {analysisResult.technicalPoints && analysisResult.technicalPoints.length > 0 && (
                  <section>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">技术点</h3>
                    <div className="space-y-4">
                      {analysisResult.technicalPoints.map((point, i) => (
                        <div key={i} className="border-l-2 border-neutral-800 pl-3">
                          <div className="font-medium text-neutral-900 text-sm">{point.term}</div>
                          <p className="text-sm text-neutral-600 mt-1">{point.inContext}</p>
                          <div className="mt-2 text-xs text-neutral-500 space-y-0.5">
                            {point.whyMentioned && <p>为什么提：{point.whyMentioned}</p>}
                            {point.realImpact && <p>实际影响：{point.realImpact}</p>}
                            {point.analogy && <p className="text-neutral-400">类比：{point.analogy}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Intent */}
                {analysisResult.intentVerdict && (
                  <section>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">意图判断</h3>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-neutral-900">{analysisResult.intentVerdict.judgment}</span>
                      {analysisResult.intentVerdict.confidence && (
                        <span className="text-xs text-neutral-400">置信度：{analysisResult.intentVerdict.confidence}</span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-600">{analysisResult.intentVerdict.reason}</p>
                  </section>
                )}

                {/* Scripts */}
                {analysisResult.scripts && analysisResult.scripts.length > 0 && (
                  <section>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">可以这样说</h3>
                    <div className="space-y-2">
                      {analysisResult.scripts.map((script, i) => (
                        <div key={i} className="group relative bg-neutral-50 rounded p-3 pr-9">
                          <p className="text-sm text-neutral-800 leading-relaxed">{script}</p>
                          <button
                            onClick={() => copyText(script, i)}
                            className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-200 transition-all"
                          >
                            {copiedIndex === i ? (
                              <Check className="w-3.5 h-3.5 text-neutral-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-neutral-400" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Follow Up */}
                {analysisResult.followUp && analysisResult.followUp.length > 0 && (
                  <section>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">可以追问</h3>
                    <div className="space-y-2">
                      {analysisResult.followUp.map((q, i) => (
                        <div key={i} className="group relative bg-neutral-50 rounded p-3 pr-9">
                          <p className="text-sm text-neutral-700">{q}</p>
                          <button
                            onClick={() => copyText(q, i + 50)}
                            className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-200 transition-all"
                          >
                            {copiedIndex === i + 50 ? (
                              <Check className="w-3.5 h-3.5 text-neutral-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-neutral-400" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Knowledge */}
                {analysisResult.knowledge && (
                  <section>
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">补充知识</h3>
                    <p className="text-sm text-neutral-600">{analysisResult.knowledge.summary}</p>
                    {analysisResult.knowledge.details && (
                      <ul className="mt-2 text-xs text-neutral-500 space-y-0.5">
                        {analysisResult.knowledge.details.map((d, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-neutral-300">•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
