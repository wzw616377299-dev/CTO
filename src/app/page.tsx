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
  Sparkles,
  X,
  Paperclip
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
  recordId?: string;
}

const INTENT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: '正常沟通', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  discussion: { label: '技术讨论', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  explanation: { label: '解释说明', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  obstruction: { label: '可能设置障碍', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  deflection: { label: '可能转移话题', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
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
  });
  const [isDragging, setIsDragging] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  
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
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPendingImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload and OCR
    try {
      setIsAnalyzing(true);
      const result = await uploadApi.image(file);
      if (result.text) {
        setInputText(result.text);
        setPendingImage(null);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('图片识别失败，请重试');
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
      alert('分析失败，请重试');
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
          alert('语音识别失败，请重试');
        } finally {
          setIsAnalyzing(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      alert('无法访问麦克风，请检查权限');
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
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-xl z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#0071e3]/10 flex items-center justify-center mx-auto mb-4">
              <Image className="w-10 h-10 text-[#0071e3]" />
            </div>
            <p className="text-xl font-medium text-gray-900">释放以上传图片</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-black/5">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0071e3] to-[#5856d6] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-[17px]">PM 助手</span>
          </div>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="gap-2 text-[#0071e3] hover:text-[#0071e3] hover:bg-[#0071e3]/5">
              <Clock className="w-4 h-4" />
              历史记录
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-[32px] font-semibold text-gray-900 tracking-tight mb-3">
            技术沟通，不再困难
          </h1>
          <p className="text-[17px] text-gray-500">
            输入开发说的话，AI 帮你拆解技术点、分析意图、给出应对话术
          </p>
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden mb-6">
          {/* Pending image preview */}
          {pendingImage && (
            <div className="relative p-4 border-b border-black/5">
              <img src={pendingImage} alt="Preview" className="max-h-40 rounded-xl mx-auto" />
              <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                <Loader2 className="w-8 h-8 animate-spin text-[#0071e3]" />
              </div>
            </div>
          )}
          
          {/* Textarea */}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="粘贴或输入开发说的话...&#10;&#10;支持直接粘贴截图"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="min-h-[160px] border-0 rounded-none text-[17px] placeholder:text-gray-400 focus-visible:ring-0 resize-none p-5"
              disabled={isAnalyzing}
            />
          </div>
          
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-black/5 bg-[#fafafa]/80">
            <div className="flex items-center gap-2">
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
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-black/5 transition-colors text-sm">
                  <Paperclip className="w-4 h-4" />
                  <span>图片</span>
                </div>
              </label>
              
              {/* Voice input */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isAnalyzing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isRecording 
                    ? 'text-red-500 bg-red-50' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-black/5'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isRecording ? '停止' : '语音'}</span>
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Mode toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-gray-500">详细模式</span>
                <Switch
                  checked={mode === 'detailed'}
                  onCheckedChange={(checked) => setMode(checked ? 'detailed' : 'concise')}
                />
              </label>
              
              {/* Submit button */}
              <Button
                onClick={handleAnalyze}
                disabled={!inputText.trim() || isAnalyzing}
                className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-5 h-9"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ArrowUp className="w-4 h-4 mr-1" />
                    分析
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Privacy hint */}
        <p className="text-center text-sm text-gray-400 mb-12">
          图片和语音仅用于识别，识别后立即删除
        </p>

        {/* Analysis Result */}
        {isAnalyzing && !analysisResult && streamingContent && (
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 mb-6">
            <div className="flex items-center gap-2 text-[#0071e3] mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-medium">正在分析...</span>
            </div>
            <div className="text-gray-600 whitespace-pre-wrap text-[15px] leading-relaxed">
              {streamingContent}
            </div>
          </div>
        )}

        {analysisResult && (
          <div className="space-y-4">
            {/* Technical Points */}
            {analysisResult.technicalPoints && analysisResult.technicalPoints.length > 0 && (
              <ResultCard
                title="技术点拆解"
                icon="📚"
                expanded={expandedSections.technical}
                onToggle={() => toggleSection('technical')}
              >
                <div className="space-y-4">
                  {analysisResult.technicalPoints.map((point, index) => (
                    <div key={index} className="bg-[#f5f5f7] rounded-xl p-4">
                      <div className="font-medium text-gray-900 mb-2">{point.term}</div>
                      <p className="text-[15px] text-gray-600 leading-relaxed">{point.explanation}</p>
                      <div className="mt-3 pt-3 border-t border-black/5 text-sm text-gray-500 space-y-1">
                        <p><span className="font-medium text-gray-700">为什么提到：</span>{point.whyMentioned}</p>
                        <p><span className="font-medium text-gray-700">实际影响：</span>{point.impact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ResultCard>
            )}
            
            {/* Intent Analysis */}
            {analysisResult.intentAnalysis && (
              <ResultCard
                title="意图分析"
                icon="🎯"
                expanded={expandedSections.intent}
                onToggle={() => toggleSection('intent')}
              >
                <div className="flex items-start gap-3">
                  <Badge className={INTENT_TYPE_MAP[analysisResult.intentAnalysis.type]?.color}>
                    {INTENT_TYPE_MAP[analysisResult.intentAnalysis.type]?.label}
                  </Badge>
                </div>
                <p className="text-[15px] text-gray-700 mt-3 leading-relaxed">{analysisResult.intentAnalysis.summary}</p>
                <p className="text-sm text-gray-500 mt-2">{analysisResult.intentAnalysis.reasoning}</p>
              </ResultCard>
            )}
            
            {/* Response Scripts */}
            {analysisResult.responseScripts && analysisResult.responseScripts.length > 0 && (
              <ResultCard
                title="应对话术"
                icon="💬"
                expanded={expandedSections.scripts}
                onToggle={() => toggleSection('scripts')}
              >
                <div className="space-y-3">
                  {analysisResult.responseScripts.map((script, index) => (
                    <div key={index} className="group relative bg-[#f5f5f7] rounded-xl p-4 pr-12">
                      <p className="text-[15px] text-gray-700 leading-relaxed">{script}</p>
                      <button
                        onClick={() => copyToClipboard(script, index)}
                        className="absolute top-3 right-3 p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-all"
                      >
                        {copiedIndex === index ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </ResultCard>
            )}
            
            {/* Follow-up Questions */}
            {analysisResult.followUpQuestions && analysisResult.followUpQuestions.length > 0 && (
              <ResultCard
                title="追问方向"
                icon="❓"
                expanded={expandedSections.questions}
                onToggle={() => toggleSection('questions')}
              >
                <div className="space-y-3">
                  {analysisResult.followUpQuestions.map((question, index) => (
                    <div key={index} className="group relative bg-[#f5f5f7] rounded-xl p-4 pr-12">
                      <p className="text-[15px] text-gray-700 leading-relaxed">{question}</p>
                      <button
                        onClick={() => copyToClipboard(question, index + 100)}
                        className="absolute top-3 right-3 p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-all"
                      >
                        {copiedIndex === index + 100 ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </ResultCard>
            )}
            
            {/* Knowledge Extension */}
            {analysisResult.knowledgeExtension && (
              <ResultCard
                title="知识扩展"
                icon="📖"
                expanded={expandedSections.knowledge}
                onToggle={() => toggleSection('knowledge')}
              >
                <p className="text-[15px] text-gray-700 leading-relaxed">{analysisResult.knowledgeExtension.summary}</p>
                {analysisResult.knowledgeExtension.details && (
                  <ul className="mt-4 space-y-2">
                    {analysisResult.knowledgeExtension.details.map((detail, index) => (
                      <li key={index} className="flex gap-3 text-[15px] text-gray-600">
                        <span className="text-[#0071e3] mt-0.5">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </ResultCard>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Result Card Component
function ResultCard({ 
  title, 
  icon, 
  expanded, 
  onToggle, 
  children 
}: { 
  title: string; 
  icon: string; 
  expanded: boolean; 
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-black/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5">
          {children}
        </div>
      )}
    </div>
  );
}
