'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowUp, 
  Image, 
  Mic, 
  MicOff, 
  Clock, 
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  X
} from 'lucide-react';
import { analyzeApi, uploadApi, getUserId } from '@/lib/api';
import Link from 'next/link';

interface TechnicalPoint {
  term: string;
  explanation: string;
  whyMentioned: string;
  impact: string;
}

interface IntentAnalysis {
  type: string;
  summary: string;
  reasoning: string;
}

interface AnalysisResult {
  technicalPoints?: TechnicalPoint[];
  intentAnalysis?: IntentAnalysis;
  responseScripts?: string[];
  followUpQuestions?: string[];
  knowledgeExtension?: {
    summary: string;
    details: string[];
  };
  relatedHistory?: {
    id: string;
    title: string;
    similarity: string;
  }[];
  recordId?: string;
}

const INTENT_TYPE_MAP: Record<string, { label: string }> = {
  normal: { label: '正常沟通' },
  discussion: { label: '技术讨论' },
  explanation: { label: '解释说明' },
  obstruction: { label: '可能设置障碍' },
  deflection: { label: '可能转移话题' },
};

export default function HomePage() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [mode, setMode] = useState<'concise' | 'detailed'>('concise');
  const [isRecording, setIsRecording] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    technical: true,
    intent: true,
    scripts: true,
    questions: true,
    knowledge: false,
    history: true,
  });
  const [isDragging, setIsDragging] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    getUserId();
  }, []);

  // Handle paste event
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await processImageFile(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Handle drag and drop
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          await processImageFile(file);
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
        setInputText(result.text);
      }
    } catch (error) {
      console.error('Upload error:', error);
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
      const stream = await analyzeApi.stream(inputText, mode);
      if (!stream) throw new Error('No stream returned');
      
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let recordId = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
              if (parsed.recordId) {
                recordId = parsed.recordId;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
      
      try {
        const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setAnalysisResult({ ...parsed, recordId });
        }
      } catch {
        console.log('Could not parse as JSON');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert('分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }, [inputText, mode, isAnalyzing]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        
        try {
          setIsAnalyzing(true);
          const result = await uploadApi.audio(file);
          if (result.text) {
            setInputText(result.text);
          }
        } catch (error) {
          console.error('Transcribe error:', error);
          alert('语音识别失败');
        } finally {
          setIsAnalyzing(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      alert('无法访问麦克风');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-white/95 z-50 flex items-center justify-center border-2 border-dashed border-neutral-300 m-4">
          <div className="text-center">
            <Image className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
            <p className="text-neutral-600">释放以上传图片</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-neutral-100">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <span className="font-medium text-neutral-900">PM 助手</span>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="gap-2 text-neutral-500 hover:text-neutral-900">
              <Clock className="w-4 h-4" />
              历史
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Input Area */}
        <div className="mb-8">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="输入或粘贴开发说的话...&#10;&#10;支持 Ctrl+V 直接粘贴截图"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="min-h-[120px] border-neutral-200 rounded-lg text-base placeholder:text-neutral-400 focus:border-neutral-400 resize-none"
              disabled={isAnalyzing}
            />
          </div>
          
          {/* Toolbar */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1">
              {/* File upload */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) await processImageFile(file);
                    e.target.value = '';
                  }}
                />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
                  <Image className="w-4 h-4" />
                  <span>图片</span>
                </div>
              </label>
              
              {/* Voice input */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isAnalyzing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                  isRecording 
                    ? 'text-red-600 bg-red-50' 
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isRecording ? '停止' : '语音'}</span>
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Mode toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-neutral-500">详细</span>
                <Switch
                  checked={mode === 'detailed'}
                  onCheckedChange={(checked) => setMode(checked ? 'detailed' : 'concise')}
                />
              </label>
              
              {/* Submit button */}
              <Button
                onClick={handleAnalyze}
                disabled={!inputText.trim() || isAnalyzing}
                className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg h-9 px-4"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ArrowUp className="w-4 h-4 mr-1.5" />
                    分析
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Streaming content */}
        {isAnalyzing && !analysisResult && streamingContent && (
          <div className="bg-neutral-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-neutral-600 mb-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">分析中...</span>
            </div>
            <div className="text-neutral-600 whitespace-pre-wrap text-sm leading-relaxed">
              {streamingContent}
            </div>
          </div>
        )}

        {/* Analysis Result */}
        {analysisResult && (
          <div className="space-y-4">
            {/* Related History */}
            {analysisResult.relatedHistory && analysisResult.relatedHistory.length > 0 && (
              <ResultSection
                title="相关历史"
                expanded={expandedSections.history}
                onToggle={() => toggleSection('history')}
              >
                <div className="space-y-2">
                  {analysisResult.relatedHistory.map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                      <span className="text-sm text-neutral-700">{item.title}</span>
                      <span className="text-xs text-neutral-400">{item.similarity}</span>
                    </div>
                  ))}
                </div>
              </ResultSection>
            )}
            
            {/* Technical Points */}
            {analysisResult.technicalPoints && analysisResult.technicalPoints.length > 0 && (
              <ResultSection
                title="技术点"
                expanded={expandedSections.technical}
                onToggle={() => toggleSection('technical')}
              >
                <div className="space-y-4">
                  {analysisResult.technicalPoints.map((point, index) => (
                    <div key={index} className="border-l-2 border-neutral-200 pl-4">
                      <div className="font-medium text-neutral-900 mb-1">{point.term}</div>
                      <p className="text-sm text-neutral-600 leading-relaxed">{point.explanation}</p>
                      <div className="mt-2 text-xs text-neutral-500 space-y-0.5">
                        <p>提到原因：{point.whyMentioned}</p>
                        <p>实际影响：{point.impact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ResultSection>
            )}
            
            {/* Intent Analysis */}
            {analysisResult.intentAnalysis && (
              <ResultSection
                title="意图"
                expanded={expandedSections.intent}
                onToggle={() => toggleSection('intent')}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="border-neutral-300 text-neutral-700">
                    {INTENT_TYPE_MAP[analysisResult.intentAnalysis.type]?.label}
                  </Badge>
                </div>
                <p className="text-sm text-neutral-700 leading-relaxed">{analysisResult.intentAnalysis.summary}</p>
                <p className="text-xs text-neutral-500 mt-2">{analysisResult.intentAnalysis.reasoning}</p>
              </ResultSection>
            )}
            
            {/* Response Scripts */}
            {analysisResult.responseScripts && analysisResult.responseScripts.length > 0 && (
              <ResultSection
                title="话术"
                expanded={expandedSections.scripts}
                onToggle={() => toggleSection('scripts')}
              >
                <div className="space-y-2">
                  {analysisResult.responseScripts.map((script, index) => (
                    <div key={index} className="group relative bg-neutral-50 rounded p-3 pr-10">
                      <p className="text-sm text-neutral-700 leading-relaxed">{script}</p>
                      <button
                        onClick={() => copyToClipboard(script, index)}
                        className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-200 transition-all"
                      >
                        {copiedIndex === index ? (
                          <Check className="w-3.5 h-3.5 text-neutral-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-neutral-400" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </ResultSection>
            )}
            
            {/* Follow-up Questions */}
            {analysisResult.followUpQuestions && analysisResult.followUpQuestions.length > 0 && (
              <ResultSection
                title="追问"
                expanded={expandedSections.questions}
                onToggle={() => toggleSection('questions')}
              >
                <div className="space-y-2">
                  {analysisResult.followUpQuestions.map((question, index) => (
                    <div key={index} className="group relative bg-neutral-50 rounded p-3 pr-10">
                      <p className="text-sm text-neutral-700 leading-relaxed">{question}</p>
                      <button
                        onClick={() => copyToClipboard(question, index + 100)}
                        className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-200 transition-all"
                      >
                        {copiedIndex === index + 100 ? (
                          <Check className="w-3.5 h-3.5 text-neutral-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-neutral-400" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </ResultSection>
            )}
            
            {/* Knowledge Extension */}
            {analysisResult.knowledgeExtension && (
              <ResultSection
                title="延伸"
                expanded={expandedSections.knowledge}
                onToggle={() => toggleSection('knowledge')}
              >
                <p className="text-sm text-neutral-700 leading-relaxed">{analysisResult.knowledgeExtension.summary}</p>
                {analysisResult.knowledgeExtension.details && (
                  <ul className="mt-3 space-y-1.5">
                    {analysisResult.knowledgeExtension.details.map((detail, index) => (
                      <li key={index} className="flex gap-2 text-sm text-neutral-600">
                        <span className="text-neutral-400">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </ResultSection>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Result Section Component
function ResultSection({ 
  title, 
  expanded, 
  onToggle, 
  children 
}: { 
  title: string; 
  expanded: boolean; 
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors"
      >
        <span className="font-medium text-neutral-900 text-sm">{title}</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-neutral-100 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
