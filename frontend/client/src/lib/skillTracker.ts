/**
 * Skill Tracking System
 * Measures Clarity, Specificity, Context, and Structure based on user performance
 */

export interface SkillScore {
  clarity: number;
  specificity: number;
  context: number;
  structure: number;
}

export interface SkillEvent {
  type: 'lesson_completion' | 'quiz_score' | 'drag_drop' | 'prompt_grader' | 'challenge_completion';
  skill: keyof SkillScore;
  score: number; // 0-100
  timestamp: number;
  metadata?: {
    moduleId?: string;
    lessonId?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    timeSpent?: number; // in seconds
    attempts?: number;
  };
}

export interface SkillProgress {
  current: SkillScore;
  history: SkillEvent[];
  lastUpdated: number;
}

// Default skill levels
const DEFAULT_SKILLS: SkillScore = {
  clarity: 50,
  specificity: 50,
  context: 50,
  structure: 50
};

// Skill weights for different activity types
const SKILL_WEIGHTS = {
  lesson_completion: {
    clarity: 0.3,
    specificity: 0.2,
    context: 0.3,
    structure: 0.2
  },
  quiz_score: {
    clarity: 0.2,
    specificity: 0.3,
    context: 0.2,
    structure: 0.3
  },
  drag_drop: {
    clarity: 0.1,
    specificity: 0.4,
    context: 0.3,
    structure: 0.2
  },
  prompt_grader: {
    clarity: 0.4,
    specificity: 0.3,
    context: 0.2,
    structure: 0.1
  },
  challenge_completion: {
    clarity: 0.25,
    specificity: 0.25,
    context: 0.25,
    structure: 0.25
  }
};

// Storage key for skill data
const SKILL_STORAGE_KEY = 'neural_skill_progress';
const SKILL_BASELINE_KEY = 'neural_skill_baseline';

/**
 * Get current skill progress from localStorage
 */
export function getSkillProgress(): SkillProgress {
  try {
    const stored = localStorage.getItem(SKILL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        current: parsed.current || DEFAULT_SKILLS,
        history: parsed.history || [],
        lastUpdated: parsed.lastUpdated || Date.now()
      };
    }
  } catch (error) {
    console.warn('Failed to load skill progress:', error);
  }
  
  return {
    current: { ...DEFAULT_SKILLS },
    history: [],
    lastUpdated: Date.now()
  };
}

/**
 * Save skill progress to localStorage
 */
export function saveSkillProgress(progress: SkillProgress): void {
  try {
    localStorage.setItem(SKILL_STORAGE_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn('Failed to save skill progress:', error);
  }
}

/**
 * Persist a baseline snapshot used for showing trends (e.g., last week values)
 */
export function saveSkillBaselineFromCurrent(): void {
  try {
    const progress = getSkillProgress();
    const baseline = {
      snapshot: progress.current,
      timestamp: Date.now()
    };
    localStorage.setItem(SKILL_BASELINE_KEY, JSON.stringify(baseline));
  } catch (error) {
    console.warn('Failed to save skill baseline:', error);
  }
}

/**
 * Load baseline snapshot
 */
function getSkillBaseline(): { snapshot: SkillScore; timestamp: number } | null {
  try {
    const stored = localStorage.getItem(SKILL_BASELINE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed?.snapshot) return null;
    return parsed;
  } catch (error) {
    console.warn('Failed to load skill baseline:', error);
    return null;
  }
}

/**
 * Calculate skill improvement based on activity performance
 */
function calculateSkillImprovement(
  currentSkills: SkillScore,
  event: SkillEvent
): SkillScore {
  const weights = SKILL_WEIGHTS[event.type];
  const improvement = (event.score - 50) / 100; // Normalize to -0.5 to +0.5
  
  const newSkills = { ...currentSkills };
  
  // Apply weighted improvement to each skill
  Object.keys(weights).forEach(skill => {
    const skillKey = skill as keyof SkillScore;
    const weight = weights[skillKey];
    const skillImprovement = improvement * weight * 10; // Scale to reasonable range
    
    newSkills[skillKey] = Math.max(0, Math.min(100, 
      currentSkills[skillKey] + skillImprovement
    ));
  });
  
  return newSkills;
}

/**
 * Record a skill event and update progress
 */
export function recordSkillEvent(event: SkillEvent): SkillScore {
  const progress = getSkillProgress();
  
  // Add event to history
  const newHistory = [...progress.history, event];
  
  // Calculate new skill levels
  const newSkills = calculateSkillImprovement(progress.current, event);
  
  // Update progress
  const updatedProgress: SkillProgress = {
    current: newSkills,
    history: newHistory,
    lastUpdated: Date.now()
  };
  
  saveSkillProgress(updatedProgress);
  return newSkills;
}

export interface SkillTrendItem {
  key: keyof SkillScore;
  label: string;
  thisWeek: number; // current level
  lastWeek: number; // baseline level
  trend: 'up' | 'down' | 'flat';
}

/**
 * Compute trend items from current skills and stored baseline.
 * If no baseline exists, use current values for both to show neutral trend.
 */
export function getSkillTrends(): SkillTrendItem[] {
  const { current } = getSkillProgress();
  const baseline = getSkillBaseline()?.snapshot || current;

  const items: Array<{ key: keyof SkillScore; label: string }> = [
    { key: 'clarity', label: 'Prompt Clarity' },
    { key: 'context', label: 'Context Setting' },
    { key: 'specificity', label: 'Specificity' }
  ];

  return items.map(({ key, label }) => {
    const thisWeek = Math.round(current[key]);
    const lastWeek = Math.round(baseline[key]);
    const trend: 'up' | 'down' | 'flat' = thisWeek > lastWeek ? 'up' : thisWeek < lastWeek ? 'down' : 'flat';
    return { key, label, thisWeek, lastWeek, trend };
  });
}

/**
 * Get skill level description
 */
export function getSkillLevel(score: number): string {
  if (score >= 90) return 'Expert';
  if (score >= 80) return 'Advanced';
  if (score >= 70) return 'Intermediate';
  if (score >= 60) return 'Developing';
  if (score >= 50) return 'Beginner';
  return 'Novice';
}

/**
 * Get skill color based on level
 */
export function getSkillColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-learning';
  if (score >= 40) return 'text-warning';
  return 'text-destructive';
}

/**
 * Analyze lesson content to determine skill focus
 */
export function analyzeLessonSkills(lesson: any): Partial<SkillScore> {
  const content = lesson.content || {};
  const title = lesson.lessonTitle || '';
  const type = lesson.type || '';
  
  const skills: Partial<SkillScore> = {};
  
  // Analyze based on lesson type and content
  if (type === 'learn' || type === 'article') {
    // Learning lessons focus on context and clarity
    skills.context = 0.4;
    skills.clarity = 0.3;
    skills.specificity = 0.2;
    skills.structure = 0.1;
  } else if (type === 'drag-drop') {
    // Drag-drop focuses on specificity and context
    skills.specificity = 0.4;
    skills.context = 0.3;
    skills.clarity = 0.2;
    skills.structure = 0.1;
  } else if (type === 'prompt-grader') {
    // Prompt grading focuses on clarity and structure
    skills.clarity = 0.4;
    skills.structure = 0.3;
    skills.specificity = 0.2;
    skills.context = 0.1;
  } else if (type === 'quiz' || type === 'practice') {
    // Quizzes test all skills equally
    skills.clarity = 0.25;
    skills.specificity = 0.25;
    skills.context = 0.25;
    skills.structure = 0.25;
  }
  
  return skills;
}

/**
 * Calculate overall skill score
 */
export function getOverallSkillScore(skills: SkillScore): number {
  return Math.round(
    (skills.clarity + skills.specificity + skills.context + skills.structure) / 4
  );
}

/**
 * Get skill recommendations based on current levels
 */
export function getSkillRecommendations(skills: SkillScore): string[] {
  const recommendations: string[] = [];
  
  if (skills.clarity < 60) {
    recommendations.push('Focus on writing clearer, more direct prompts');
  }
  if (skills.specificity < 60) {
    recommendations.push('Practice adding more specific details to your prompts');
  }
  if (skills.context < 60) {
    recommendations.push('Work on providing better background context');
  }
  if (skills.structure < 60) {
    recommendations.push('Improve your prompt organization and formatting');
  }
  
  return recommendations;
}

