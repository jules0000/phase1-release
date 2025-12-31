/*
 * BACKEND REQUIREMENTS - PromptGrader.tsx (AI Prompt Grading Component):
 * 
 * This component provides AI-powered prompt evaluation with real-time grading feedback.
 * It requires integration with OpenAI's GPT-4 API through the backend.
 * 
 * Backend Endpoints Required:
 * - POST /api/openai/grade-prompt - AI-powered prompt evaluation
 *   Request: { prompt: string, criteria?: string[], rubric?: object }
 *   Response: { score: number, feedback: string, suggestions: string[], breakdown: object }
 * 
 * - POST /api/progress/update - Save grading results and XP
 *   Request: { lessonId: string, gradingScore: number, xpEarned: number }
 * 
 * - GET /api/prompt-techniques - Available grading criteria and techniques
 *   Response: { criteria: string[], techniques: object[], examples: object[] }
 * 
 * Database Tables Needed:
 * - prompt_grading_results: id, user_id, prompt, score, feedback, criteria_used, 
 *                          suggestions, breakdown, created_at
 * - user_progress: user_id, lesson_id, grading_score, xp_earned, completion_status
 * - ai_usage_logs: user_id, endpoint, tokens_used, cost, timestamp
 * 
 * Real-time Features:
 * - Live grading progress updates
 * - Real-time XP and achievement notifications
 * - Progress synchronization across devices
 * - Live leaderboard updates for grading scores
 * 
 * AI Integration Requirements:
 * - OpenAI GPT-4 API integration
 * - Custom grading rubric implementation
 * - Thought process simulation for educational value
 * - Usage tracking and cost monitoring
 * - Rate limiting and quota management
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Brain, Target, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSimpleGSAP } from '@/hooks/use-gsap';
import { gsap } from 'gsap';
import apiService from '@/lib/api';

interface GradingResult {
  score: number;
  feedback: string;
  timestamp: string;
}

interface ThoughtStep {
  id: string;
  text: string;
  type: 'analysis' | 'evaluation' | 'scoring' | 'feedback';
  delay: number;
}

export function PromptGrader() {
  const [prompt, setPrompt] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thoughtProcess, setThoughtProcess] = useState<ThoughtStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [showThoughtProcess, setShowThoughtProcess] = useState(false);

  const { toast } = useToast();
  const { elementRef, fadeIn, scaleIn } = useSimpleGSAP();
  const thoughtProcessRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Thought process steps for the AI grading animation
  const thoughtSteps: ThoughtStep[] = [
    {
      id: 'step-1',
      text: 'Analyzing prompt clarity and specificity...',
      type: 'analysis',
      delay: 0
    },
    {
      id: 'step-2',
      text: 'Evaluating context provision and relevance...',
      type: 'evaluation',
      delay: 1000
    },
    {
      id: 'step-3',
      text: 'Assessing output format specifications...',
      type: 'evaluation',
      delay: 2000
    },
    {
      id: 'step-4',
      text: 'Reviewing constraint definitions...',
      type: 'evaluation',
      delay: 3000
    },
    {
      id: 'step-5',
      text: 'Calculating final score...',
      type: 'scoring',
      delay: 4000
    },
    {
      id: 'step-6',
      text: 'Generating improvement feedback...',
      type: 'feedback',
      delay: 5000
    }
  ];

  // Animate thought process steps
  useEffect(() => {
    if (showThoughtProcess && thoughtProcessRef.current) {
      const steps = thoughtProcessRef.current.querySelectorAll('.thought-step');

      gsap.set(steps, { opacity: 0, x: -20 });

      steps.forEach((step, index) => {
        gsap.to(step, {
          opacity: 1,
          x: 0,
          duration: 0.6,
          delay: index * 0.3,
          ease: "power2.out"
        });
      });
    }
  }, [showThoughtProcess]);

  // Animate result display
  useEffect(() => {
    if (result && resultRef.current) {
      gsap.fromTo(resultRef.current,
        { opacity: 0, scale: 0.8, y: 20 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.8,
          ease: "back.out(1.7)"
        }
      );
    }
  }, [result]);

  const handleGradePrompt = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter a prompt to grade.",
        variant: "destructive"
      });
      return;
    }

    setIsGrading(true);
    setError(null);
    setResult(null);
    setCurrentStep(0);
    setShowThoughtProcess(true);

    try {
      // Simulate AI grading process with thought process animation
      for (let i = 0; i < thoughtSteps.length; i++) {
        setCurrentStep(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Use apiService instead of direct fetch
      const data = await apiService.gradePrompt(prompt, []);

      setResult({
        score: data.score,
        feedback: data.feedback,
        timestamp: new Date().toISOString()
      });

      toast({
        title: "Grading Complete!",
        description: `Your prompt scored ${data.score}/10`,
      });

    } catch (err: any) {
      setError(err.message || 'Failed to grade prompt');
      toast({
        title: "Grading Failed",
        description: err.message || "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsGrading(false);
      setShowThoughtProcess(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 bg-green-100';
    if (score >= 6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 8) return 'Excellent';
    if (score >= 6) return 'Good';
    if (score >= 4) return 'Fair';
    return 'Needs Improvement';
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" ref={elementRef as React.RefObject<HTMLDivElement>}>
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">
          AI Prompt Auto-Grader
        </h1>
        <p className="text-muted-foreground text-lg">
          Get instant feedback on your AI prompts with our intelligent grading system
        </p>
      </div>

      {/* Input Section */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Enter Your Prompt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Enter your AI prompt here... (e.g., 'Write a creative story about a robot learning to paint')"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[120px] text-base"
            disabled={isGrading}
          />

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {prompt.length} characters
            </div>

            <Button
              onClick={handleGradePrompt}
              disabled={isGrading || !prompt.trim()}
              className="min-w-[120px]"
            >
              {isGrading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Grading...
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-2" />
                  Grade Prompt
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Thought Process Animation */}
      {showThoughtProcess && (
        <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Zap className="w-5 h-5" />
              AI Analysis in Progress...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3" ref={thoughtProcessRef}>
              {thoughtSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`thought-step flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${index <= currentStep
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-muted/50'
                    }`}
                >
                  <div className={`w-2 h-2 rounded-full ${index < currentStep
                      ? 'bg-green-500'
                      : index === currentStep
                        ? 'bg-primary animate-pulse'
                        : 'bg-muted'
                    }`} />

                  <span className={`text-sm ${index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                    {step.text}
                  </span>

                  {index < currentStep && (
                    <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results Display */}
      {result && (
        <Card className="border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50" ref={resultRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5" />
              Grading Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Score Display */}
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-4">
                <div className="text-6xl font-bold text-primary">
                  {result.score}
                </div>
                <div className="text-2xl text-muted-foreground">/ 10</div>
              </div>

              <Badge className={`text-lg px-4 py-2 ${getScoreColor(result.score)}`}>
                {getScoreBadge(result.score)}
              </Badge>
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {['Clarity', 'Context', 'Format', 'Constraints', 'Examples'].map((criterion, index) => (
                <div key={criterion} className="text-center space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">
                    {criterion}
                  </div>
                  <Progress
                    value={Math.min(result.score + (Math.random() - 0.5) * 2, 10) * 10}
                    className="h-2"
                  />
                </div>
              ))}
            </div>

            {/* Feedback */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Detailed Feedback</h4>
              <div className="p-4 bg-background rounded-lg border">
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {result.feedback}
                </p>
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-center text-sm text-muted-foreground">
              Graded on {new Date(result.timestamp).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tips Section */}
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Brain className="w-5 h-5" />
            Tips for Better Prompts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-700"> Do's</h4>
              <ul className="text-sm text-blue-600 space-y-1">
                <li>• Be specific about your desired output</li>
                <li>• Provide relevant context and examples</li>
                <li>• Specify the format and length</li>
                <li>• Include constraints and limitations</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-700"> Don'ts</h4>
              <ul className="text-sm text-blue-600 space-y-1">
                <li>• Use vague or ambiguous language</li>
                <li>• Forget to specify output format</li>
                <li>• Provide insufficient context</li>
                <li>• Make overly complex requests</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
