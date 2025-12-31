import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { recordSkillEvent, analyzeLessonSkills, SkillEvent } from "./skillTracker"
import { recordXP, XPEvent } from "./xpTracker"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type LessonKey = string; // `${moduleId}-${lessonNumber}`

const STORAGE_KEYS = {
  completed: 'neural_completed_lessons',
};

export function getCompletedLessons(): Set<LessonKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.completed);
    if (!raw) return new Set();
    const arr: string[] = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export async function markLessonComplete(key: LessonKey, lessonData?: any) {
  const set = getCompletedLessons();
  set.add(key);
  localStorage.setItem(STORAGE_KEYS.completed, JSON.stringify(Array.from(set)));
  
  // Extract module and lesson IDs from key
  const [moduleId, lessonNumber] = key.split('-');
  
  // Calculate XP earned based on lesson type and performance
  let xpEarned = 50; // Default XP for lesson completion
  let score = 100; // Default score
  
  if (lessonData) {
    // Calculate XP based on lesson type and performance
    if (lessonData.type === 'drag-drop') {
      xpEarned = lessonData.correctPairs ? Math.round((lessonData.correctPairs / lessonData.totalPairs) * 50) : 50;
      score = lessonData.correctPairs ? Math.round((lessonData.correctPairs / lessonData.totalPairs) * 100) : 100;
    } else if (lessonData.type === 'quiz' || lessonData.type === 'practice') {
      xpEarned = lessonData.score ? Math.round(lessonData.score / 2) : 50;
      score = lessonData.score || 100;
    } else if (lessonData.type === 'prompt_grader') {
      xpEarned = lessonData.promptScore ? Math.round(lessonData.promptScore / 2) : 50;
      score = lessonData.promptScore || 100;
    }
    
    // Track skill improvement
    const skillFocus = analyzeLessonSkills(lessonData);
    
    // Create skill event based on lesson type
    const event: SkillEvent = {
      type: lessonData.type === 'drag-drop' ? 'drag_drop' : 
            lessonData.type === 'quiz' || lessonData.type === 'practice' ? 'quiz_score' :
            'lesson_completion',
      skill: 'clarity', // Default skill, will be weighted by skillFocus
      score: score,
      timestamp: Date.now(),
      metadata: {
        moduleId,
        lessonId: lessonNumber,
        difficulty: 'medium'
      }
    };
    
    // Record skill events for each skill that this lesson focuses on
    Object.entries(skillFocus).forEach(([skill, weight]) => {
      if (weight && weight > 0) {
        const skillEvent = {
          ...event,
          skill: skill as keyof typeof skillFocus,
          score: Math.round(score * weight * 100) // Scale based on focus weight
        };
        recordSkillEvent(skillEvent);
      }
    });

    // Record XP event
    const xpEvent: XPEvent = {
      type: lessonData.type === 'drag-drop' ? 'drag_drop_completion' :
            lessonData.type === 'quiz' || lessonData.type === 'practice' ? 'quiz_completion' :
            'lesson_completion',
      data: {
        moduleId,
        lessonId: lessonNumber,
        score: score,
        attempts: lessonData.attempts || 1,
        difficulty: lessonData.difficulty || 'medium',
        accuracy: lessonData.accuracy || 100
      },
      timestamp: Date.now()
    };
    
    recordXP(xpEvent);
  }
  
  // Call backend API to save progress to database
  try {
    // Import apiService dynamically to avoid circular imports
    const { default: apiService } = await import('./api');
    
    // Call the lesson completion API endpoint
    await apiService.completeLessonInModule(
      parseInt(moduleId), 
      parseInt(lessonNumber), 
      {
        score: score,
        time_spent: lessonData?.timeSpent || 300, // Default 5 minutes
        xp_earned: xpEarned
      }
    );
    
    console.log(`Lesson ${key} completed successfully in database with ${xpEarned} XP`);
  } catch (error) {
    console.error(`Failed to save lesson completion to database for ${key}:`, error);
    // Don't throw error to prevent breaking the UI, but log it for debugging
  }
}

export function isLessonCompleted(key: LessonKey): boolean {
  return getCompletedLessons().has(key);
}

export function computeProgressByTopic(topicId: string, moduleLessons: { moduleId: string; lessons: number }[]) {
  const completed = getCompletedLessons();
  let totalLessons = 0;
  let completedCount = 0;
  for (const m of moduleLessons) {
    totalLessons += m.lessons;
    for (let i = 1; i <= m.lessons; i += 1) {
      if (completed.has(`${m.moduleId}-${i}`)) completedCount += 1;
    }
  }
  const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  return { totalLessons, completedCount, progress };
}

export function computeModuleProgressByTopic(topicId: string, moduleLessons: { moduleId: string; lessons: number }[]) {
  const completed = getCompletedLessons();
  let totalModules = moduleLessons.length;
  let completedModules = 0;
  for (const m of moduleLessons) {
    let moduleCompleted = true;
    for (let i = 1; i <= m.lessons; i += 1) {
      if (!completed.has(`${m.moduleId}-${i}`)) {
        moduleCompleted = false;
        break;
      }
    }
    if (moduleCompleted) completedModules += 1;
  }
  const progress = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
  return { totalModules, completedModules, progress };
}

