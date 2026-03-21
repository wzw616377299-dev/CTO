'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Send, 
  Upload, 
  Mic, 
  MicOff, 
  History, 
  Lightbulb, 
  MessageSquare, 
  HelpCircle, 
  BookOpen,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Star,
  StarOff,
  Sparkles
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

const EXAMPLE_PROMPTS = [
  "开发说这个需求需要重构底层架构，涉及到微服务拆分，周期要两个月，让我先评估ROI",
  "开发说这个功能涉及到跨域问题，前端实现不了，需要后端配合，让我去找后端",
  "开发说这个需求技术上不可行，数据库不支持这种查询方式",
  "开发说这个功能会影响系统性能，需要做全量压测才能上线",
];

const INTENT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: '正常沟通', color: 'bg-green-100 text-green-800' },
  discussion: { label: '技术讨论', color: 'bg-blue-100 text-blue-800' },
  explanation: { label: '解释说明', color: 'bg-yellow-100 text-yellow-800' },
  obstruction: { label: '可能设置障碍', color: 'bg-orange-100 text-orange-800' },
  deflection: { label: '可能转移话题', color: 'bg-red-100 text-red-800' },
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Ensure user ID exists
  useEffect(() => {
    getUserId();
  }, []);

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
      
      // Try to parse the full content as JSON
      try {
        const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setAnalysisResult({ ...parsed, recordId });
        }
      } catch {
        // If parsing fails, keep the raw content
        console.log('Could not parse as JSON');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert('分析失败，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  }, [inputText, mode, isAnalyzing]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setIsAnalyzing(true);
      const result = await uploadApi.image(file);
      if (result.text) {
        setInputText(result.text);
      } else {
        alert('图片识别失败，请重试');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('上传失败，请重试');
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
          } else {
            alert('语音识别失败，请重试');
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">PM 技术沟通助手</h1>
                <p className="text-xs text-gray-500">让技术沟通不再困难</p>
              </div>
            </div>
            <Link href="/history">
              <Button variant="outline" className="gap-2">
                <History className="w-4 h-4" />
                历史记录
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Input Area */}
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-500" />
                  输入开发的话
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="粘贴企业微信的聊天记录，或描述开发和你沟通的内容..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="min-h-[200px] resize-none text-base"
                  disabled={isAnalyzing}
                />
                
                {/* Input Methods */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    上传截图
                  </Button>
                  
                  <Button
                    variant={isRecording ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isAnalyzing}
                    className="gap-2"
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isRecording ? '停止录音' : '语音输入'}
                  </Button>
                  
                  <div className="flex items-center gap-2 ml-auto">
                    <Switch
                      id="mode"
                      checked={mode === 'detailed'}
                      onCheckedChange={(checked) => setMode(checked ? 'detailed' : 'concise')}
                    />
                    <Label htmlFor="mode" className="text-sm text-gray-600">
                      详细模式
                    </Label>
                  </div>
                </div>
                
                {/* Example Prompts */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">示例场景：</p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_PROMPTS.map((prompt, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        size="sm"
                        onClick={() => setInputText(prompt)}
                        className="text-xs h-auto py-1.5 px-3 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50"
                      >
                        {prompt.slice(0, 20)}...
                      </Button>
                    ))}
                  </div>
                </div>
                
                {/* Analyze Button */}
                <Button
                  onClick={handleAnalyze}
                  disabled={!inputText.trim() || isAnalyzing}
                  className="w-full h-12 text-base bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      正在分析...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      开始分析
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
            
            {/* Privacy Notice */}
            <div className="text-xs text-gray-400 text-center">
              图片和语音仅用于临时识别，识别后立即删除，不会保存
            </div>
          </div>
          
          {/* Right: Analysis Result */}
          <div className="space-y-4">
            {isAnalyzing && !analysisResult && (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-8">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-gray-600">AI 正在分析中...</p>
                  </div>
                  {streamingContent && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                      {streamingContent}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {!isAnalyzing && !analysisResult && (
              <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50">
                <CardContent className="py-12">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <div className="w-16 h-16 rounded-full bg-white shadow-md flex items-center justify-center">
                      <Lightbulb className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-gray-700 font-medium">输入开发的话</p>
                      <p className="text-gray-500 text-sm mt-1">AI 会帮你拆解技术点，分析意图，给出应对话术</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {analysisResult && (
              <div className="space-y-4">
                {/* Technical Points */}
                {analysisResult.technicalPoints && analysisResult.technicalPoints.length > 0 && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleSection('technical')}
                    >
                      <CardTitle className="text-base font-medium flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-blue-500" />
                          技术点拆解
                        </span>
                        {expandedSections.technical ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </CardTitle>
                    </CardHeader>
                    {expandedSections.technical && (
                      <CardContent className="space-y-4">
                        {analysisResult.technicalPoints.map((point, index) => (
                          <div key={index} className="p-4 bg-blue-50 rounded-lg space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                {point.term}
                              </Badge>
                            </div>
                            <p className="text-gray-700 text-sm">{point.explanation}</p>
                            <div className="text-xs text-gray-500 space-y-1">
                              <p><span className="font-medium">为什么提到：</span>{point.whyMentioned}</p>
                              <p><span className="font-medium">实际影响：</span>{point.impact}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )}
                
                {/* Intent Analysis */}
                {analysisResult.intentAnalysis && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleSection('intent')}
                    >
                      <CardTitle className="text-base font-medium flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <HelpCircle className="w-5 h-5 text-amber-500" />
                          意图分析
                        </span>
                        {expandedSections.intent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </CardTitle>
                    </CardHeader>
                    {expandedSections.intent && (
                      <CardContent>
                        <div className="p-4 bg-amber-50 rounded-lg space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge className={INTENT_TYPE_MAP[analysisResult.intentAnalysis.type]?.color || 'bg-gray-100 text-gray-800'}>
                              {INTENT_TYPE_MAP[analysisResult.intentAnalysis.type]?.label || analysisResult.intentAnalysis.type}
                            </Badge>
                          </div>
                          <p className="text-gray-700">{analysisResult.intentAnalysis.summary}</p>
                          <p className="text-sm text-gray-600">{analysisResult.intentAnalysis.reasoning}</p>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}
                
                {/* Response Scripts */}
                {analysisResult.responseScripts && analysisResult.responseScripts.length > 0 && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleSection('scripts')}
                    >
                      <CardTitle className="text-base font-medium flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-green-500" />
                          应对话术
                        </span>
                        {expandedSections.scripts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </CardTitle>
                    </CardHeader>
                    {expandedSections.scripts && (
                      <CardContent className="space-y-3">
                        {analysisResult.responseScripts.map((script, index) => (
                          <div key={index} className="p-4 bg-green-50 rounded-lg group relative">
                            <p className="text-gray-700 pr-8">{script}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyToClipboard(script, index)}
                            >
                              {copiedIndex === index ? (
                                <Check className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )}
                
                {/* Follow-up Questions */}
                {analysisResult.followUpQuestions && analysisResult.followUpQuestions.length > 0 && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleSection('questions')}
                    >
                      <CardTitle className="text-base font-medium flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <HelpCircle className="w-5 h-5 text-purple-500" />
                          追问方向
                        </span>
                        {expandedSections.questions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </CardTitle>
                    </CardHeader>
                    {expandedSections.questions && (
                      <CardContent className="space-y-3">
                        {analysisResult.followUpQuestions.map((question, index) => (
                          <div key={index} className="p-4 bg-purple-50 rounded-lg group relative">
                            <p className="text-gray-700 pr-8">{question}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyToClipboard(question, index + 100)}
                            >
                              {copiedIndex === index + 100 ? (
                                <Check className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )}
                
                {/* Knowledge Extension */}
                {analysisResult.knowledgeExtension && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleSection('knowledge')}
                    >
                      <CardTitle className="text-base font-medium flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-indigo-500" />
                          知识扩展
                        </span>
                        {expandedSections.knowledge ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </CardTitle>
                    </CardHeader>
                    {expandedSections.knowledge && (
                      <CardContent>
                        <div className="p-4 bg-indigo-50 rounded-lg space-y-3">
                          <p className="text-gray-700">{analysisResult.knowledgeExtension.summary}</p>
                          {analysisResult.knowledgeExtension.details && (
                            <ul className="text-sm text-gray-600 space-y-2">
                              {analysisResult.knowledgeExtension.details.map((detail, index) => (
                                <li key={index} className="flex gap-2">
                                  <span className="text-indigo-400">•</span>
                                  {detail}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
