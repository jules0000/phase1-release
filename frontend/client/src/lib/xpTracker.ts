import { useState, useEffect } from 'react';

export interface XPConfig {
  xp_rubrics: {
    lesson_completion: {
      base_xp: number;
      bonus_multipliers: {
        perfect_score: number;
        first_attempt: number;
        streak_bonus: number;
        difficulty_multiplier: Record<string, number>;
      };
    };
    module_completion: {
      base_xp: number;
      bonus_multipliers: {
        perfect_module: number;
        speed_completion: number;
        streak_bonus: number;
      };
    };
    quiz_activities: {
      base_xp: number;
      score_multipliers: Record<string, number>;
    };
    drag_drop_activities: {
      base_xp: number;
      accuracy_multipliers: Record<string, number>;
    };
    prompt_grading: {
      base_xp: number;
      score_multipliers: Record<string, number>;
    };
    daily_challenges: {
      base_xp: number;
      difficulty_multipliers: Record<string, number>;
    };
    weekly_challenges: {
      base_xp: number;
      completion_bonus: number;
    };
    special_events: {
      base_xp: number;
      ranking_bonuses: Record<string, number>;
    };
  };
  levels: Array<{
    level: number;
    xp_required: number;
    title: string;
    color: string;
    badge: string;
  }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    xp_reward: number;
    category: string;
    requirements: Record<string, number>;
  }>;
  streak_bonuses: {
    daily_multiplier: number;
    max_daily_multiplier: number;
    weekly_bonus_xp: number;
    monthly_bonus_xp: number;
  };
}

export interface UserXPStats {
  total_xp: number;
  level_info: {
    current: {
      level: number;
      xp_required: number;
      title: string;
      color: string;
      badge: string;
    };
    next: {
      level: number;
      xp_required: number;
      title: string;
      color: string;
      badge: string;
    } | null;
    xp_to_next: number;
    progress_percent: number;
  };
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    xp_reward: number;
    category: string;
    earned: boolean;
  }>;
  streak_days: number;
  weekly_xp: number;
  monthly_xp: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  total_xp: number;
  level: number;
  streak: number;
}

export interface XPEvent {
  type: 'lesson_completion' | 'quiz_completion' | 'drag_drop_completion' | 'prompt_grading' | 'module_completion' | 'challenge_completion';
  data: any;
  timestamp: number;
}

const XP_STORAGE_KEY = 'neural_user_xp_stats';
const XP_EVENTS_KEY = 'neural_xp_events';
const XP_CONFIG_KEY = 'neural_xp_config';

// Default XP configuration (fallback)
const DEFAULT_XP_CONFIG: XPConfig = {
  xp_rubrics: {
    lesson_completion: {
      base_xp: 25,
      bonus_multipliers: {
        perfect_score: 2.0,
        first_attempt: 1.5,
        streak_bonus: 1.2,
        difficulty_multiplier: {
          easy: 1.0,
          medium: 1.3,
          hard: 1.6,
          expert: 2.0
        }
      }
    },
    module_completion: {
      base_xp: 100,
      bonus_multipliers: {
        perfect_module: 1.5,
        speed_completion: 1.3,
        streak_bonus: 1.2
      }
    },
    quiz_activities: {
      base_xp: 15,
      score_multipliers: {
        '100': 2.0,
        '90-99': 1.8,
        '80-89': 1.5,
        '70-79': 1.2,
        '60-69': 1.0,
        'below_60': 0.5
      }
    },
    drag_drop_activities: {
      base_xp: 20,
      accuracy_multipliers: {
        '100': 2.0,
        '90-99': 1.8,
        '80-89': 1.5,
        '70-79': 1.2,
        '60-69': 1.0,
        'below_60': 0.5
      }
    },
    prompt_grading: {
      base_xp: 30,
      score_multipliers: {
        '5': 2.0,
        '4': 1.6,
        '3': 1.2,
        '2': 0.8,
        '1': 0.4
      }
    },
    daily_challenges: {
      base_xp: 50,
      difficulty_multipliers: {
        easy: 1.0,
        medium: 1.5,
        hard: 2.0,
        expert: 2.5
      }
    },
    weekly_challenges: {
      base_xp: 200,
      completion_bonus: 1.5
    },
    special_events: {
      base_xp: 500,
      ranking_bonuses: {
        top_1: 3.0,
        top_5: 2.5,
        top_10: 2.0,
        top_25: 1.5,
        participant: 1.0
      }
    }
  },
  levels: [
    { level: 1, xp_required: 0, title: "Novice", color: "#6B7280", badge: "🌱" },
    { level: 2, xp_required: 100, title: "Beginner", color: "#3B82F6", badge: "📚" },
    { level: 3, xp_required: 250, title: "Apprentice", color: "#10B981", badge: "🎯" },
    { level: 4, xp_required: 500, title: "Learner", color: "#8B5CF6", badge: "⚡" },
    { level: 5, xp_required: 750, title: "Student", color: "#F59E0B", badge: "🔥" },
    { level: 6, xp_required: 1000, title: "Practitioner", color: "#EF4444", badge: "💎" },
    { level: 7, xp_required: 1500, title: "Specialist", color: "#EC4899", badge: "🏆" },
    { level: 8, xp_required: 2000, title: "Expert", color: "#06B6D4", badge: "👑" },
    { level: 9, xp_required: 3000, title: "Master", color: "#84CC16", badge: "🌟" },
    { level: 10, xp_required: 4000, title: "Grandmaster", color: "#F97316", badge: "🎖️" }
  ],
  achievements: [],
  streak_bonuses: {
    daily_multiplier: 0.1,
    max_daily_multiplier: 2.0,
    weekly_bonus_xp: 100,
    monthly_bonus_xp: 500
  }
};

export function getXPConfig(): XPConfig {
  try {
    const stored = localStorage.getItem(XP_CONFIG_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_XP_CONFIG;
  } catch (e) {
    console.error("Failed to load XP config from localStorage", e);
    return DEFAULT_XP_CONFIG;
  }
}

export function saveXPConfig(config: XPConfig) {
  try {
    localStorage.setItem(XP_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save XP config to localStorage", e);
  }
}

export function getUserXPStats(): UserXPStats {
  try {
    const stored = localStorage.getItem(XP_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load user XP stats from localStorage", e);
  }
  
  // Return default stats
  return {
    total_xp: 0,
    level_info: {
      current: DEFAULT_XP_CONFIG.levels[0],
      next: DEFAULT_XP_CONFIG.levels[1],
      xp_to_next: 100,
      progress_percent: 0
    },
    achievements: [],
    streak_days: 0,
    weekly_xp: 0,
    monthly_xp: 0
  };
}

export function saveUserXPStats(stats: UserXPStats) {
  try {
    localStorage.setItem(XP_STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error("Failed to save user XP stats to localStorage", e);
  }
}

export function recordXPEvent(event: XPEvent) {
  try {
    const stored = localStorage.getItem(XP_EVENTS_KEY);
    const events: XPEvent[] = stored ? JSON.parse(stored) : [];
    events.push(event);
    
    // Keep only last 100 events
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
    
    localStorage.setItem(XP_EVENTS_KEY, JSON.stringify(events));
  } catch (e) {
    console.error("Failed to record XP event to localStorage", e);
  }
}

export function getXPEvents(): XPEvent[] {
  try {
    const stored = localStorage.getItem(XP_EVENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load XP events from localStorage", e);
    return [];
  }
}

export function calculateLocalXP(event: XPEvent): number {
  const config = getXPConfig();
  const stats = getUserXPStats();
  
  let baseXP = 0;
  let multiplier = 1.0;
  
  switch (event.type) {
    case 'lesson_completion':
      baseXP = config.xp_rubrics.lesson_completion.base_xp;
      if (event.data.score === 100) {
        multiplier *= config.xp_rubrics.lesson_completion.bonus_multipliers.perfect_score;
      }
      if (event.data.attempts === 1) {
        multiplier *= config.xp_rubrics.lesson_completion.bonus_multipliers.first_attempt;
      }
      break;
      
    case 'quiz_completion':
      baseXP = config.xp_rubrics.quiz_activities.base_xp;
      const score = event.data.score;
      if (score === 100) {
        multiplier *= config.xp_rubrics.quiz_activities.score_multipliers['100'];
      } else if (score >= 90) {
        multiplier *= config.xp_rubrics.quiz_activities.score_multipliers['90-99'];
      } else if (score >= 80) {
        multiplier *= config.xp_rubrics.quiz_activities.score_multipliers['80-89'];
      } else if (score >= 70) {
        multiplier *= config.xp_rubrics.quiz_activities.score_multipliers['70-79'];
      } else if (score >= 60) {
        multiplier *= config.xp_rubrics.quiz_activities.score_multipliers['60-69'];
      } else {
        multiplier *= config.xp_rubrics.quiz_activities.score_multipliers['below_60'];
      }
      break;
      
    case 'drag_drop_completion':
      baseXP = config.xp_rubrics.drag_drop_activities.base_xp;
      const accuracy = event.data.accuracy;
      if (accuracy === 100) {
        multiplier *= config.xp_rubrics.drag_drop_activities.accuracy_multipliers['100'];
      } else if (accuracy >= 90) {
        multiplier *= config.xp_rubrics.drag_drop_activities.accuracy_multipliers['90-99'];
      } else if (accuracy >= 80) {
        multiplier *= config.xp_rubrics.drag_drop_activities.accuracy_multipliers['80-89'];
      } else if (accuracy >= 70) {
        multiplier *= config.xp_rubrics.drag_drop_activities.accuracy_multipliers['70-79'];
      } else if (accuracy >= 60) {
        multiplier *= config.xp_rubrics.drag_drop_activities.accuracy_multipliers['60-69'];
      } else {
        multiplier *= config.xp_rubrics.drag_drop_activities.accuracy_multipliers['below_60'];
      }
      break;
      
    case 'prompt_grading':
      baseXP = config.xp_rubrics.prompt_grading.base_xp;
      const grade = event.data.score;
      multiplier *= config.xp_rubrics.prompt_grading.score_multipliers[grade.toString()] || 1.0;
      break;
      
    case 'module_completion':
      baseXP = config.xp_rubrics.module_completion.base_xp;
      if (event.data.perfect_completion) {
        multiplier *= config.xp_rubrics.module_completion.bonus_multipliers.perfect_module;
      }
      break;
      
    case 'challenge_completion':
      if (event.data.type === 'daily') {
        baseXP = config.xp_rubrics.daily_challenges.base_xp;
        multiplier *= config.xp_rubrics.daily_challenges.difficulty_multipliers[event.data.difficulty] || 1.0;
      } else if (event.data.type === 'weekly') {
        baseXP = config.xp_rubrics.weekly_challenges.base_xp;
        multiplier *= config.xp_rubrics.weekly_challenges.completion_bonus;
      } else if (event.data.type === 'special') {
        baseXP = config.xp_rubrics.special_events.base_xp;
        multiplier *= config.xp_rubrics.special_events.ranking_bonuses[event.data.ranking] || 1.0;
      }
      break;
  }
  
  // Apply streak bonus
  if (stats.streak_days > 0) {
    const streakMultiplier = Math.min(
      1 + (stats.streak_days * config.streak_bonuses.daily_multiplier),
      config.streak_bonuses.max_daily_multiplier
    );
    multiplier *= streakMultiplier;
  }
  
  return Math.round(baseXP * multiplier);
}

export function updateUserXPStats(xpGained: number, event: XPEvent) {
  const stats = getUserXPStats();
  const config = getXPConfig();
  
  const newTotalXP = stats.total_xp + xpGained;
  
  // Calculate new level
  let currentLevel = config.levels[0];
  let nextLevel = config.levels[1];
  
  for (let i = 0; i < config.levels.length; i++) {
    if (newTotalXP >= config.levels[i].xp_required) {
      currentLevel = config.levels[i];
      nextLevel = config.levels[i + 1] || null;
    } else {
      break;
    }
  }
  
  const xpToNext = nextLevel ? nextLevel.xp_required - newTotalXP : 0;
  const progressPercent = nextLevel ? 
    ((newTotalXP - currentLevel.xp_required) / (nextLevel.xp_required - currentLevel.xp_required)) * 100 : 100;
  
  const updatedStats: UserXPStats = {
    ...stats,
    total_xp: newTotalXP,
    level_info: {
      current: currentLevel,
      next: nextLevel,
      xp_to_next: xpToNext,
      progress_percent: Math.min(100, progressPercent)
    }
  };
  
  saveUserXPStats(updatedStats);
  recordXPEvent(event);
  
  return updatedStats;
}

export function useXPStats() {
  const [stats, setStats] = useState<UserXPStats>(getUserXPStats());
  const [config, setConfig] = useState<XPConfig>(getXPConfig());
  
  useEffect(() => {
    const handleStorageChange = () => {
      setStats(getUserXPStats());
      setConfig(getXPConfig());
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
  
  const recordXP = (event: XPEvent) => {
    const xpGained = calculateLocalXP(event);
    const updatedStats = updateUserXPStats(xpGained, event);
    setStats(updatedStats);
    return { xpGained, updatedStats };
  };
  
  return { stats, config, recordXP };
}

export function getLevelColor(level: number): string {
  const config = getXPConfig();
  const levelData = config.levels.find(l => l.level === level);
  return levelData?.color || '#6B7280';
}

export function getLevelTitle(level: number): string {
  const config = getXPConfig();
  const levelData = config.levels.find(l => l.level === level);
  return levelData?.title || 'Unknown';
}

export function getLevelBadge(level: number): string {
  const config = getXPConfig();
  const levelData = config.levels.find(l => l.level === level);
  return levelData?.badge || '❓';
}

// Standalone recordXP function for use in utils.ts
export function recordXP(event: XPEvent) {
  const xpGained = calculateLocalXP(event);
  const updatedStats = updateUserXPStats(xpGained, event);
  return { xpGained, updatedStats };
}

