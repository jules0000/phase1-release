import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  Copy,
  RotateCcw,
  Zap,
  Target,
  Brain,
  Sparkles,
  CheckCircle,
  ArrowRight,
  Lightbulb,
  History,
  Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ParticleOverlay } from "@/components/ParticleOverlay";
import apiService from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { ToolUsageLimit } from "@/components/ToolUsageLimit";
import { useToolLimits } from "@/hooks/useToolLimits";
import { useToolAvailability } from "@/hooks/useToolAvailability";

interface AIModel {
  id: string;
  name: string;
  type: 'text' | 'image' | 'code' | 'multimodal';
  description: string;
  icon: React.ComponentType<any>;
  capabilities: string[];
  bestFor: string[];
}

interface TranslationHistory {
  id: string;
  originalPrompt: string;
  sourceModel: string;
  targetModel: string;
  translatedPrompt: string;
  timestamp: Date;
  rating?: number;
}

const aiModels: AIModel[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    type: "text",
    description: "Advanced language model for conversation and text generation",
    icon: MessageSquare,
    capabilities: ["Conversation", "Text Generation", "Analysis", "Creative Writing"],
    bestFor: ["General questions", "Writing assistance", "Problem solving", "Creative content"]
  },
  {
    id: "claude",
    name: "Claude",
    type: "text",
    description: "Helpful AI assistant focused on safety and helpfulness",
    icon: Brain,
    capabilities: ["Analysis", "Writing", "Reasoning", "Safety"],
    bestFor: ["Detailed analysis", "Academic writing", "Ethical discussions", "Complex reasoning"]
  },
  {
    id: "midjourney",
    name: "Midjourney",
    type: "image",
    description: "AI art generation with artistic and creative capabilities",
    icon: Sparkles,
    capabilities: ["Image Generation", "Artistic Styles", "Creative Design", "Visual Concepts"],
    bestFor: ["Art creation", "Design inspiration", "Visual storytelling", "Creative projects"]
  },
  {
    id: "dalle",
    name: "DALL-E",
    type: "image",
    description: "OpenAI's image generation model with high detail",
    icon: Target,
    capabilities: ["Image Generation", "High Detail", "Realistic Art", "Creative Variations"],
    bestFor: ["Detailed images", "Realistic art", "Creative variations", "Commercial use"]
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    type: "code",
    description: "AI-powered code completion and generation",
    icon: Zap,
    capabilities: ["Code Generation", "Completion", "Debugging", "Documentation"],
    bestFor: ["Programming", "Code review", "Documentation", "Debugging"]
  },
  {
    id: "gemini",
    name: "Gemini",
    type: "multimodal",
    description: "Google's multimodal AI model for text and images",
    icon: Lightbulb,
    capabilities: ["Text & Image", "Analysis", "Reasoning", "Multilingual"],
    bestFor: ["Multimodal tasks", "Analysis", "Translation", "Research"]
  }
];

const PromptTranslator = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sourceModel, setSourceModel] = useState("chatgpt");
  const [targetModel, setTargetModel] = useState("midjourney");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [translatedPrompt, setTranslatedPrompt] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationHistory, setTranslationHistory] = useState<TranslationHistory[]>([]);
  const [activeTab, setActiveTab] = useState("translator");
  const [availableModels, setAvailableModels] = useState<AIModel[]>(aiModels);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAvailableModels();
    loadTranslationHistory();
  }, []);

  const loadAvailableModels = async () => {
    try {
      setLoading(true);

      // Load available AI models from backend
      const models = await apiService.get('/openai/models') as any;
      if (models && models.length > 0) {
        setAvailableModels(models);
      }

    } catch (error) {
      console.error('Error loading available models:', error);
      // Keep using default models if API fails
    } finally {
      setLoading(false);
    }
  };

  const loadTranslationHistory = async () => {
    try {
      const response = await apiService.getTranslationHistory(50);
      if (response?.history) {
        const formattedHistory: TranslationHistory[] = response.history.map((h: any) => ({
          id: h.id.toString(),
          originalPrompt: h.original_prompt,
          sourceModel: h.source_model,
          targetModel: h.target_model,
          translatedPrompt: h.translated_prompt,
          timestamp: new Date(h.created_at),
          rating: h.rating
        }));
        setTranslationHistory(formattedHistory);
      }
    } catch (error) {
      console.error('Failed to load translation history:', error);
    }
  };

  const getModelById = (id: string) => availableModels.find(model => model.id === id);
  const { getLimit } = useToolLimits();
  const { isToolAvailable } = useToolAvailability();
  const limit = getLimit('/prompt-translator');
  const toolAvailable = isToolAvailable('/prompt-translator');

  const translatePrompt = async () => {
    if (!originalPrompt.trim()) {
      toast({
        title: "No prompt to translate",
        description: "Please enter a prompt to translate.",
        variant: "destructive",
      });
      return;
    }

    // Check if tool is available
    if (!toolAvailable) {
      toast({
        title: "Tool Unavailable",
        description: "This tool is currently disabled. Please contact support or try again later.",
        variant: "destructive",
      });
      return;
    }

    // Check usage limits
    if (limit && !limit.can_use) {
      toast({
        title: "Usage Limit Reached",
        description: limit.message || "You have reached your usage limit for this tool.",
        variant: "destructive",
      });
      return;
    }

    setIsTranslating(true);

    try {
      // Call real AI translation API
      const result = await apiService.post('/openai/translate-prompt', {
        prompt: originalPrompt,
        sourceModel: sourceModel,
        targetModel: targetModel,
        toolPath: '/prompt-translator'
      }) as any;

      setTranslatedPrompt(result.translatedPrompt);

      // Add to history (now persisted to database)
      const newTranslation: TranslationHistory = {
        id: result.history_id?.toString() || Date.now().toString(),
        originalPrompt,
        sourceModel,
        targetModel,
        translatedPrompt: result.translatedPrompt,
        timestamp: new Date()
      };

      setTranslationHistory(prev => [newTranslation, ...prev])

      const target = getModelById(targetModel);
      toast({
        title: "Translation complete!",
        description: `Successfully translated prompt for ${target?.name || targetModel}`,
      });

    } catch (error: any) {
      console.error('Error translating prompt:', error);
      const errorMessage = error?.response?.data?.error || error?.message || "There was an error translating your prompt. Please try again.";
      
      // Check if it's a limit error
      if (errorMessage.includes('limit') || errorMessage.includes('Limit')) {
        toast({
          title: "Usage Limit Reached",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Translation failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard!",
      description: "The prompt has been copied to your clipboard.",
    });
  };

  const swapModels = () => {
    setSourceModel(targetModel);
    setTargetModel(sourceModel);
    setOriginalPrompt(translatedPrompt);
    setTranslatedPrompt("");
  };

  const clearAll = () => {
    setOriginalPrompt("");
    setTranslatedPrompt("");
  };

  const rateTranslation = async (historyId: string, rating: number) => {
    try {
      // Save rating to database
      await apiService.rateTranslation(parseInt(historyId), rating);

      // Update local state
      setTranslationHistory(prev => prev.map(item =>
        item.id === historyId ? { ...item, rating } : item
      ));

      toast({
        title: "Rating saved!",
        description: "Thank you for your feedback.",
      });
    } catch (error) {
      console.error('Failed to save rating:', error);
      toast({
        title: "Failed to save rating",
        description: "Please try again.",
        variant: "destructive"
      });
    }
  };

  const getTranslationTips = () => {
    const source = getModelById(sourceModel);
    const target = getModelById(targetModel);

    if (!source || !target) return [];

    const tips = [];

    if (source.type === "text" && target.type === "image") {
      tips.push("Be specific about visual elements, style, and mood");
      tips.push("Include details about composition, lighting, and perspective");
      tips.push("Mention artistic style or reference images if applicable");
    } else if (source.type === "image" && target.type === "text") {
      tips.push("Focus on describing visual elements clearly");
      tips.push("Include context about the scene or subject");
      tips.push("Mention style, mood, and artistic elements");
    } else if (source.type === "text" && target.type === "code") {
      tips.push("Be clear about the desired functionality");
      tips.push("Specify programming language if important");
      tips.push("Include requirements for error handling and documentation");
    }

    return tips;
  };

  const tips = getTranslationTips();

  return (
    <div className="min-h-screen bg-background relative">
      <ParticleOverlay />
      <Header />

      <div className="max-w-7xl mx-auto p-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb
          items={[
            { label: "Activities", path: "/activities" },
            { label: "Prompt Translator" }
          ]}
          className="mb-6"
        />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Prompt Translator</h1>
          <p className="text-muted-foreground">
            Convert your prompts between different AI models for optimal results
          </p>
        </div>

        {/* Usage Limit Display */}
        <div className="mb-6">
          <ToolUsageLimit toolPath="/prompt-translator" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="translator">Translator</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="translator" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Translation Area */}
              <div className="lg:col-span-2 space-y-6">
                {/* Model Selection */}
                <Card className="p-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      Select Models
                    </CardTitle>
                    <CardDescription>
                      Choose the source and target AI models for translation
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Source Model */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">From Model</Label>
                        <Select value={sourceModel} onValueChange={setSourceModel}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {aiModels.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div className="flex items-center gap-2">
                                  <model.icon className="w-4 h-4" />
                                  {model.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {getModelById(sourceModel) && (
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground">
                              {getModelById(sourceModel)?.description}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Target Model */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">To Model</Label>
                        <Select value={targetModel} onValueChange={setTargetModel}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {aiModels.filter(m => m.id !== sourceModel).map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div className="flex items-center gap-2">
                                  <model.icon className="w-4 h-4" />
                                  {model.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {getModelById(targetModel) && (
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground">
                              {getModelById(targetModel)?.description}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Translation Area */}
                <Card className="p-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      Translate Prompt
                    </CardTitle>
                    <CardDescription>
                      Enter your prompt and get an optimized version for the target model
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    {/* Original Prompt */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        Original Prompt ({getModelById(sourceModel)?.name})
                      </Label>
                      <Textarea
                        placeholder={`Enter a prompt designed for ${getModelById(sourceModel)?.name}...`}
                        value={originalPrompt}
                        onChange={(e) => setOriginalPrompt(e.target.value)}
                        className="min-h-[120px]"
                      />
                    </div>

                    {/* Translation Button */}
                    <div className="flex items-center gap-4">
                      <Button
                        onClick={translatePrompt}
                        disabled={!originalPrompt.trim() || isTranslating}
                        className="flex-1"
                        variant="neural"
                      >
                        {isTranslating ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Translating...
                          </>
                        ) : (
                          <>
                            <ArrowRight className="w-4 h-4 mr-2" />
                            Translate to {getModelById(targetModel)?.name}
                          </>
                        )}
                      </Button>

                      <Button variant="outline" onClick={swapModels} disabled={!translatedPrompt}>
                        <RotateCcw className="w-4 h-4" />
                      </Button>

                      <Button variant="outline" onClick={clearAll}>
                        Clear
                      </Button>
                    </div>

                    {/* Translated Prompt */}
                    {translatedPrompt && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">
                          Translated Prompt ({getModelById(targetModel)?.name})
                        </Label>
                        <div className="relative">
                          <Textarea
                            value={translatedPrompt}
                            readOnly
                            className="min-h-[120px] bg-gradient-card border border-border/50"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => copyToClipboard(translatedPrompt)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Translation Tips */}
                {tips.length > 0 && (
                  <Card className="p-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-primary" />
                        Translation Tips
                      </CardTitle>
                      <CardDescription>
                        Best practices for translating between {getModelById(sourceModel)?.name} and {getModelById(targetModel)?.name}
                      </CardDescription>
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-3">
                        {tips.map((tip, index) => (
                          <div key={index} className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                            <span className="text-sm text-muted-foreground">{tip}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Model Capabilities */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Model Capabilities
                  </h3>

                  <div className="space-y-4">
                    {[sourceModel, targetModel].map((modelId, index) => {
                      const model = getModelById(modelId);
                      if (!model) return null;

                      return (
                        <div key={modelId} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <model.icon className="w-4 h-4 text-primary" />
                            <span className="font-medium text-sm">{model.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {index === 0 ? 'Source' : 'Target'}
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Capabilities:</div>
                            <div className="flex flex-wrap gap-1">
                              {model.capabilities.slice(0, 3).map((capability) => (
                                <Badge key={capability} variant="secondary" className="text-xs">
                                  {capability}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Best for:</div>
                            <div className="text-xs text-muted-foreground">
                              {model.bestFor.slice(0, 2).join(', ')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Quick Actions */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Quick Actions
                  </h3>

                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        setSourceModel("chatgpt");
                        setTargetModel("midjourney");
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Text to Image
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        setSourceModel("midjourney");
                        setTargetModel("chatgpt");
                      }}
                    >
                      <Target className="w-4 h-4 mr-2" />
                      Image to Text
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        setSourceModel("chatgpt");
                        setTargetModel("copilot");
                      }}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Text to Code
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="p-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Translation History
                </CardTitle>
                <CardDescription>
                  Your recent prompt translations and ratings
                </CardDescription>
              </CardHeader>

              <CardContent>
                {translationHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No translation history yet.</p>
                    <p className="text-sm">Start translating prompts to see them here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {translationHistory.map((item) => (
                      <div key={item.id} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {getModelById(item.sourceModel)?.name} → {getModelById(item.targetModel)?.name}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {item.timestamp.toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((rating) => (
                              <button
                                key={rating}
                                onClick={() => rateTranslation(item.id, rating)}
                                className={`p-1 hover:scale-110 transition-transform ${item.rating && item.rating >= rating ? 'text-yellow-500' : 'text-muted-foreground'
                                  }`}
                              >
                                <Star className="w-4 h-4" />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-2">Original</div>
                            <div className="text-sm bg-muted/50 p-3 rounded border">
                              {item.originalPrompt}
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-2">Translated</div>
                            <div className="text-sm bg-gradient-card p-3 rounded border border-border/50">
                              {item.translatedPrompt}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSourceModel(item.sourceModel);
                              setTargetModel(item.targetModel);
                              setOriginalPrompt(item.originalPrompt);
                              setTranslatedPrompt(item.translatedPrompt);
                              setActiveTab("translator");
                            }}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reuse
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(item.translatedPrompt)}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
    </div>
  );
};

export default PromptTranslator;
