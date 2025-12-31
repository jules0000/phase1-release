import { useState, useEffect } from 'react';

export interface UserAnswer {
  lessonKey: string; // `${moduleId}-${lessonNumber}`
  activityType: 'quiz' | 'drag-drop' | 'prompt-grader';
  answers: any; // Quiz answers, drag-drop pairs, etc.
  correctAnswers?: any; // Store correct answers for comparison
  score: number; // 0-100
  timeSpent: number; // in seconds
  completedAt: number; // timestamp
  attempts: number;
}

export interface QuizAnswer {
  questionIndex: number;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface DragDropAnswer {
  pairs: Record<string, string>; // term -> definition
  correctPairs: Record<string, string>;
  accuracy: number; // percentage
}

const ANSWER_STORAGE_KEY = 'neural_user_answers';

/**
 * Get all stored answers
 */
export function getAllAnswers(): UserAnswer[] {
  try {
    const stored = localStorage.getItem(ANSWER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Get answer for a specific lesson
 */
export function getAnswer(lessonKey: string): UserAnswer | null {
  const answers = getAllAnswers();
  return answers.find(a => a.lessonKey === lessonKey) || null;
}

/**
 * Save answer for a lesson
 */
export async function saveAnswer(answer: UserAnswer): Promise<void> {
  try {
    const answers = getAllAnswers();
    const existingIndex = answers.findIndex(a => a.lessonKey === answer.lessonKey);
    
    if (existingIndex >= 0) {
      // Update existing answer
      answers[existingIndex] = answer;
    } else {
      // Add new answer
      answers.push(answer);
    }
    
    localStorage.setItem(ANSWER_STORAGE_KEY, JSON.stringify(answers));
    
    // Also save to backend database
    try {
      const { default: apiService } = await import('./api');
      const [moduleId, lessonNumber] = answer.lessonKey.split('-');
      
      // Calculate XP based on score
      const xpEarned = Math.round(answer.score / 2); // 50 XP for 100% score
      
      // Call the lesson completion API
      await apiService.completeLessonInModule(
        parseInt(moduleId),
        parseInt(lessonNumber),
        {
          score: answer.score,
          time_spent: answer.timeSpent,
          xp_earned: xpEarned
        }
      );
      
      console.log(`Lesson ${answer.lessonKey} completed successfully in database with ${xpEarned} XP`);
    } catch (error) {
      console.error(`Failed to save lesson completion to database for ${answer.lessonKey}:`, error);
      // Don't throw error to prevent breaking the UI
    }
  } catch (error) {
    console.warn('Failed to save answer:', error);
  }
}

/**
 * Check if lesson has been completed
 */
export function isLessonAnswered(lessonKey: string): boolean {
  return getAnswer(lessonKey) !== null;
}

/**
 * Get completion statistics
 */
export function getCompletionStats() {
  const answers = getAllAnswers();
  const total = answers.length;
  const correct = answers.filter(a => a.score >= 70).length;
  const averageScore = total > 0 ? answers.reduce((sum, a) => sum + a.score, 0) / total : 0;
  
  return {
    totalCompleted: total,
    correctAnswers: correct,
    averageScore: Math.round(averageScore),
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0
  };
}

/**
 * Format time duration
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Timer hook for activities
 */
export function useTimer(initialTime: number = 0, onComplete?: () => void) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsCompleted(true);
            onComplete?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, onComplete]);

  const start = () => setIsRunning(true);
  const pause = () => setIsRunning(false);
  const reset = () => {
    setTimeLeft(initialTime);
    setIsRunning(false);
    setIsCompleted(false);
  };

  return {
    timeLeft,
    isRunning,
    isCompleted,
    start,
    pause,
    reset,
    formattedTime: formatTime(timeLeft)
  };
}

