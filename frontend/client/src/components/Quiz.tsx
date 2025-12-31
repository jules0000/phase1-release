/*
 * BACKEND REQUIREMENTS - Quiz.tsx (Interactive Quiz Component):
 * 
 * This component handles interactive quizzes with multiple question types including
 * multiple choice, drag-and-drop, and prompt grading exercises.
 * 
 * Backend Endpoints Required:
 * - GET /api/quiz/{moduleId}/{lessonId} - Fetch quiz data and questions
 *   Response: { questions: QuizQuestion[], timeLimit?: number, attempts: number }
 * 
 * - POST /api/quiz/{moduleId}/{lessonId}/submit - Submit quiz answers
 *   Request: { answers: QuizAnswer[], timeSpent: number }
 *   Response: { score: number, correctAnswers: number, totalQuestions: number, 
 *              xpEarned: number, feedback: QuizFeedback[] }
 * 
 * - GET /api/quiz/{moduleId}/{lessonId}/attempts - Get user's quiz attempt history
 *   Response: { attempts: QuizAttempt[], bestScore: number, totalAttempts: number }
 * 
 * Database Tables Needed:
 * - quiz_questions: id, module_id, lesson_id, question_text, question_type, 
 *                   options, correct_answer, explanation, order_index
 * - quiz_attempts: id, user_id, module_id, lesson_id, answers, score, 
 *                  time_spent, completed_at, attempt_number
 * - user_progress: user_id, lesson_id, quiz_score, quiz_attempts, completion_status
 * - xp_transactions: user_id, source, amount, description, timestamp
 * 
 * Real-time Features:
 * - Live quiz progress tracking
 * - Real-time score updates and XP awards
 * - Progress synchronization across devices
 * - Live leaderboard updates for quiz scores
 * - Real-time achievement notifications
 * 
 * Quiz Types Supported:
 * - Multiple Choice: Standard 4-option questions
 * - Drag and Drop: Categorization and matching exercises
 * - Prompt Grading: AI-powered prompt evaluation
 * - Timed Challenges: Time-limited quiz sessions
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, ArrowRight, RotateCcw, Trophy, Clock, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGSAP } from '@/hooks/use-gsap';
import { gsap } from 'gsap';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  type: 'multiple-choice' | 'drag-drop' | 'prompt-grading';
}

interface QuizResult {
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeSpent: number;
  completedAt: string;
}

interface DragDropItem {
  id: string;
  text: string;
  category: string;
}

interface DragDropTask {
  id: string;
  title: string;
  description: string;
  items: DragDropItem[];
  categories: string[];
  correctMapping: Record<string, string>;
}

export function Quiz() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);
  const [dragDropItems, setDragDropItems] = useState<DragDropItem[]>([]);
  const [dragDropResults, setDragDropResults] = useState<Record<string, string>>({});
  const [promptGradingResults, setPromptGradingResults] = useState<Record<string, number>>({});
  
  const { toast } = useToast();
  const { elementRef, fadeIn, staggerIn } = useGSAP();
  const questionRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Sample quiz questions
  const quizQuestions: QuizQuestion[] = [
    {
      id: 'q1',
      question: 'What is the primary purpose of a prompt when working with AI?',
      options: [
        'To confuse the AI system',
        'To provide clear instructions for desired output',
        'To test the AI\'s capabilities',
        'To save time'
      ],
      correctAnswer: 1,
      explanation: 'Prompts serve as clear instructions that guide AI systems to produce the specific type of response you\'re looking for.',
      type: 'multiple-choice'
    },
    {
      id: 'q2',
      question: 'Which of these is a better prompt for getting a recipe?',
      options: [
        'Give me food',
        'Recipe please',
        'Write a detailed recipe for chocolate chip cookies that serves 12 people',
        'Cookies'
      ],
      correctAnswer: 2,
      explanation: 'Specific prompts that include details about what you want, format, and quantity lead to much better results.',
      type: 'multiple-choice'
    },
    {
      id: 'q3',
      question: 'What makes a prompt effective for image generation?',
      options: [
        'Using only technical terms',
        'Being vague and open-ended',
        'Providing specific visual details and style references',
        'Using as many words as possible'
      ],
      correctAnswer: 2,
      explanation: 'Effective image generation prompts include specific visual details, style references, composition, lighting, and artistic direction.',
      type: 'multiple-choice'
    }
  ];

  // Sample drag and drop task
  const dragDropTask: DragDropTask = {
    id: 'drag-drop-1',
    title: 'Prompt Engineering Elements',
    description: 'Drag each element to the correct category to understand what makes a good prompt.',
    items: [
      { id: 'item1', text: 'Be specific about output format', category: 'clarity' },
      { id: 'item2', text: 'Provide relevant context', category: 'context' },
      { id: 'item3', text: 'Include examples when helpful', category: 'examples' },
      { id: 'item4', text: 'Set clear constraints', category: 'constraints' },
      { id: 'item5', text: 'Use descriptive language', category: 'clarity' },
      { id: 'item6', text: 'Specify target audience', category: 'context' }
    ],
    categories: ['clarity', 'context', 'examples', 'constraints'],
    correctMapping: {
      'item1': 'clarity',
      'item2': 'context',
      'item3': 'examples',
      'item4': 'constraints',
      'item5': 'clarity',
      'item6': 'context'
    }
  };

  // Timer effect
  useEffect(() => {
    if (!isCompleted && !showResults) {
      const timer = setInterval(() => {
        setTimeSpent(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isCompleted, showResults]);

  // Animate question changes
  useEffect(() => {
    if (questionRef.current) {
      gsap.fromTo(questionRef.current,
        { opacity: 0, x: 50 },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          ease: "power2.out"
        }
      );
    }
  }, [currentQuestionIndex]);

  // Animate results
  useEffect(() => {
    if (showResults && resultRef.current) {
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
  }, [showResults]);

  // Initialize drag and drop items
  useEffect(() => {
    setDragDropItems([...dragDropTask.items].sort(() => Math.random() - 0.5));
  }, []);

  const handleAnswerSelect = (questionId: string, answerIndex: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: answerIndex
    }));
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, category: string) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    
    setDragDropResults(prev => ({
      ...prev,
      [itemId]: category
    }));

    // Remove item from available items
    setDragDropItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      handleCompleteQuiz();
    }
  };

  const handleCompleteQuiz = () => {
    const correctAnswers = Object.keys(selectedAnswers).filter(questionId => {
      const question = quizQuestions.find(q => q.id === questionId);
      return question && selectedAnswers[questionId] === question.correctAnswer;
    }).length;

    const totalQuestions = quizQuestions.length;
    const score = Math.round((correctAnswers / totalQuestions) * 100);

    setShowResults(true);
    setIsCompleted(true);

    toast({
      title: "Quiz Completed!",
      description: `You scored ${score}% (${correctAnswers}/${totalQuestions})`,
    });
  };

  const handleRetryQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setShowResults(false);
    setIsCompleted(false);
    setTimeSpent(0);
    setDragDropItems([...dragDropTask.items].sort(() => Math.random() - 0.5));
    setDragDropResults({});
    setPromptGradingResults({});
  };

  const getCurrentQuestion = () => quizQuestions[currentQuestionIndex];
  const currentQuestion = getCurrentQuestion();

  const isAnswerCorrect = (questionId: string, answerIndex: number) => {
    const question = quizQuestions.find(q => q.id === questionId);
    return question && answerIndex === question.correctAnswer;
  };

  const isAnswerSelected = (questionId: string, answerIndex: number) => {
    return selectedAnswers[questionId] === answerIndex;
  };

  const getProgressPercentage = () => {
    return ((currentQuestionIndex + 1) / quizQuestions.length) * 100;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (showResults) {
    const correctAnswers = Object.keys(selectedAnswers).filter(questionId => {
      const question = quizQuestions.find(q => q.id === questionId);
      return question && selectedAnswers[questionId] === question.correctAnswer;
    }).length;

    const totalQuestions = quizQuestions.length;
    const score = Math.round((correctAnswers / totalQuestions) * 100);

    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6" ref={resultRef}>
        <Card className="border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">Quiz Completed!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Score Display */}
            <div className="text-center space-y-4">
              <div className="text-6xl font-bold text-green-600">
                {score}%
              </div>
              <div className="text-xl text-muted-foreground">
                {correctAnswers} out of {totalQuestions} questions correct
              </div>
              
              <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Time: {formatTime(timeSpent)}
                </div>
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Score: {score}/100
                </div>
              </div>
            </div>

            {/* Performance Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-background rounded-lg border">
                <div className="text-2xl font-bold text-green-600">{correctAnswers}</div>
                <div className="text-sm text-muted-foreground">Correct</div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg border">
                <div className="text-2xl font-bold text-red-600">{totalQuestions - correctAnswers}</div>
                <div className="text-sm text-muted-foreground">Incorrect</div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg border">
                <div className="text-2xl font-bold text-blue-600">{formatTime(timeSpent)}</div>
                <div className="text-sm text-muted-foreground">Time</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={handleRetryQuiz} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Retry Quiz
              </Button>
              <Button className="gap-2">
                <ArrowRight className="w-4 h-4" />
                Continue Learning
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" ref={elementRef}>
      {/* Quiz Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">
          Module Quiz
        </h1>
        <p className="text-muted-foreground text-lg">
          Test your knowledge and understanding of the concepts
        </p>
      </div>

      {/* Progress Bar */}
      <Card className="border-2 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-muted-foreground">
              Question {currentQuestionIndex + 1} of {quizQuestions.length}
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              {formatTime(timeSpent)}
            </div>
          </div>
          <Progress value={getProgressPercentage()} className="h-2" />
        </CardContent>
      </Card>

      {/* Current Question */}
      <Card className="border-2 border-primary/20" ref={questionRef}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Question {currentQuestionIndex + 1}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-lg font-medium">
            {currentQuestion.question}
          </div>

          {/* Multiple Choice Options */}
          <div className="space-y-3">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(currentQuestion.id, index)}
                className={`w-full p-4 text-left rounded-lg border-2 transition-all duration-200 ${
                  isAnswerSelected(currentQuestion.id, index)
                    ? isAnswerCorrect(currentQuestion.id, index)
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-red-500 bg-red-50 text-red-700'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
                disabled={showResults}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    isAnswerSelected(currentQuestion.id, index)
                      ? isAnswerCorrect(currentQuestion.id, index)
                        ? 'border-green-500 bg-green-500'
                        : 'border-red-500 bg-red-500'
                      : 'border-muted-foreground'
                  }`}>
                    {isAnswerSelected(currentQuestion.id, index) && (
                      isAnswerCorrect(currentQuestion.id, index) ? (
                        <CheckCircle className="w-4 h-4 text-white" />
                      ) : (
                        <XCircle className="w-4 h-4 text-white" />
                      )
                    )}
                  </div>
                  <span className="font-medium">{option}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Explanation (shown after answering) */}
          {selectedAnswers[currentQuestion.id] !== undefined && (
            <Alert className={`${
              isAnswerCorrect(currentQuestion.id, selectedAnswers[currentQuestion.id])
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex items-center gap-2">
                {isAnswerCorrect(currentQuestion.id, selectedAnswers[currentQuestion.id]) ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription>
                  <strong>Explanation:</strong> {currentQuestion.explanation}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </Button>
            
            <Button
              onClick={handleNextQuestion}
              disabled={selectedAnswers[currentQuestion.id] === undefined}
              className="gap-2"
            >
              {currentQuestionIndex === quizQuestions.length - 1 ? (
                <>
                  Complete Quiz
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next Question
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
