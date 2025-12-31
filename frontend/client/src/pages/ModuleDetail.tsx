import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, CheckCircle2, Lock, Clock, BookOpen, Target, Users, Gamepad2, Zap, RefreshCw } from "lucide-react";
import { isLessonCompleted, markLessonComplete } from "@/lib/utils";
import apiService from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { LessonRenderer } from '@/components/LessonRenderer';
import { Header } from '@/components/Header';

/* 
 * BACKEND DATA REQUIREMENTS - ModuleDetail Page:
 * 
 * 1. MODULES table:
 *    - module_id (PK)
 *    - title (string)
 *    - description (text)
 *    - difficulty (enum: 'Beginner', 'Intermediate', 'Advanced')
 *    - estimated_time (string)
 *    - total_lessons (integer)
 *    - learning_objectives (JSON array)
 *    - prerequisites (JSON array)
 *    - certificate_name (string)
 *    - created_at, updated_at (timestamps)
 * 
 * 2. LESSONS table:
 *    - lesson_id (PK)
 *    - module_id (FK to modules table)
 *    - title (string)
 *    - description (text)
 *    - duration (string)
 *    - lesson_type (enum: 'video', 'interactive', 'article', 'practice', 'quiz')
 *    - content_url (string)
 *    - order_index (integer)
 *    - is_required (boolean)
 * 
 * 3. USER_LESSON_PROGRESS table:
 *    - user_id (FK to users table)
 *    - lesson_id (FK to lessons table)
 *    - is_completed (boolean)
 *    - completion_date (timestamp)
 *    - time_spent (integer, in seconds)
 *    - score (integer, for quizzes)
 * 
 * 4. USER_MODULE_PROGRESS table:
 *    - user_id (FK to users table)
 *    - module_id (FK to modules table)
 *    - overall_progress_percentage (integer)
 *    - completed_lessons_count (integer)
 *    - is_certificate_earned (boolean)
 *    - certificate_earned_date (timestamp)
 * 
 * API Endpoints needed:
 * - GET /api/modules/{moduleId} - fetch module details
 * - GET /api/modules/{moduleId}/lessons - fetch all lessons for a module
 * - GET /api/user/modules/{moduleId}/progress - fetch user progress for the module
 * - POST /api/user/lessons/{lessonId}/complete - mark lesson as completed
 * - POST /api/user/modules/{moduleId}/certificate - award certificate when 100% complete
 */

const moduleData = {
  "prompt-basics": {
    title: "Prompt Engineering Basics",
    description: "Master the fundamental principles of crafting effective AI prompts",
    difficulty: "Beginner",
    estimatedTime: "30 minutes",
    lessons: [
      {
        id: 1,
        title: "What is a Prompt?",
        description: "Understanding the basics of AI communication",
        duration: "5 min",
        type: "video",
        completed: true
      },
      {
        id: 2,
        title: "Anatomy of Good Prompts",
        description: "Breaking down the components of effective prompts",
        duration: "8 min",
        type: "interactive",
        completed: true
      },
      {
        id: 3,
        title: "Common Mistakes to Avoid",
        description: "Learn from typical prompting errors",
        duration: "6 min",
        type: "article",
        completed: false
      },
      {
        id: 4,
        title: "Hands-on Practice",
        description: "Apply your knowledge with real examples",
        duration: "10 min",
        type: "practice",
        completed: false
      },
      {
        id: 5,
        title: "Module Quiz",
        description: "Test your understanding",
        duration: "5 min",
        type: "quiz",
        completed: false
      }
    ],
    learningObjectives: [
      "Understand what makes a prompt effective",
      "Identify key components of well-structured prompts",
      "Recognize and avoid common prompting mistakes",
      "Apply basic prompting principles to real scenarios"
    ],
    prerequisites: ["None - Perfect for beginners"],
    certificate: "Prompt Engineering Fundamentals"
  }
};

const ModuleDetail = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  // Function to load module data
  const loadModuleData = async (mounted: boolean) => {
    try {
      // Prefer dedicated lessons endpoint (provides module_info + user_progress)
      const resp = await apiService.getModuleLessons(moduleId!);
      console.log('Module lessons API response:', resp);

      if (mounted) {
        const info = resp?.module_info || {};
        const lessons = Array.isArray(resp?.lessons) ? resp.lessons : [];
        const userProgress = resp?.user_progress || {};

        console.log('Parsed data:', { info, lessons, userProgress });

        // Get completed lessons from localStorage
        const getCompletedLessons = () => {
          try {
            const raw = localStorage.getItem('neural_completed_lessons');
            if (!raw) return new Set();
            const arr: string[] = JSON.parse(raw);
            return new Set(arr);
          } catch {
            return new Set();
          }
        };
        const completedSet = getCompletedLessons();

        // Sort lessons by order_index to preserve backend ordering
        const sortedLessons = [...lessons].sort((a: any, b: any) => {
          const aOrder = a.order_index !== undefined ? Number(a.order_index) : (a.orderIndex !== undefined ? Number(a.orderIndex) : a.lesson_number || a.lessonNumber || 0);
          const bOrder = b.order_index !== undefined ? Number(b.order_index) : (b.orderIndex !== undefined ? Number(b.orderIndex) : b.lesson_number || b.lessonNumber || 0);
          return aOrder - bOrder;
        });

        // Use the processed lessons from backend (prioritize backend completion status)
        const normalizedLessons = sortedLessons.map((l: any, idx: number) => {
          const ln = Number(l.lesson_number ?? l.lessonNumber ?? idx + 1);
          const lessonKey = `${moduleId}-${ln}`;
          const isCompletedLocally = completedSet.has(lessonKey);
          // Prioritize backend completion status, fallback to local storage
          const isCompleted = l.is_completed === true || (l.is_completed !== false && isCompletedLocally);
          return {
            lessonNumber: ln,
            lessonId: l.id,
            lessonTitle: l.title || `Lesson ${ln}`,
            lessonType: l.lesson_type || l.type || 'interactive',
            duration: l.duration || l.estimated_time || '5 min',
            completed: isCompleted,
            locked: l.is_locked || false,
            description: l.description || '',
            content: l.content_data || l.content || l.content_url || '',
            orderIndex: l.order_index !== undefined ? Number(l.order_index) : (l.orderIndex !== undefined ? Number(l.orderIndex) : idx),
            xpReward: l.xp_reward || l.xpReward || 50
          };
        });

        // Use backend completion stats if available, otherwise calculate from lessons
        const completedCount = userProgress?.completed_lessons_count !== undefined
          ? userProgress.completed_lessons_count
          : normalizedLessons.filter((l: any) => l.completed).length;
        const totalLessons = info.total_lessons || normalizedLessons.length;
        const progressPercent = info.progress_percentage !== undefined
          ? Math.round(info.progress_percentage)
          : (totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0);

        const moduleData = {
          id: info.id || moduleId,
          title: info.title || `Module ${moduleId}`,
          description: info.description || '',
          difficulty: info.difficulty || 'Beginner',
          estimatedTime: info.estimated_time || '30 min',
          totalLessons: totalLessons,
          learningObjectives: info.learning_objectives || [],
          prerequisites: info.prerequisites || [],
          certificateName: info.certificate_name || '',
          moduleNumber: info.module_number || info.moduleNumber || moduleId,
          topicId: info.topic_id || info.topicId || '1',
          lessons: normalizedLessons,
          completedLessonsCount: completedCount,
          progressPercentage: progressPercent,
          isCompleted: info.is_completed === true || (completedCount === totalLessons && totalLessons > 0)
        };

        setModule(moduleData);
      }
    } catch (error: any) {
      console.error('ModuleDetail: Error loading module data:', error);
      const errorMessage = error?.message || error?.error || 'Failed to load module data. Please refresh the page.';
      toast({
        title: "Error Loading Module",
        description: errorMessage,
        variant: "destructive",
        duration: 5000
      });

      // Fallback data if API fails
      if (mounted) {
        const fallbackData = {
          id: moduleId,
          title: `Module ${moduleId}`,
          description: 'Loading module content...',
          difficulty: 'Beginner',
          estimatedTime: '30 min',
          totalLessons: 0,
          learningObjectives: [],
          prerequisites: [],
          certificateName: '',
          moduleNumber: moduleId,
          topicId: '1',
          lessons: []
        };
        setModule(fallbackData);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    (async () => {
      try {
        setLoading(true);
        // Fail-safe: auto-hide loader after 3s
        timeoutId = setTimeout(() => {
          if (mounted) {
            setLoading(false);
          }
        }, 3000);

        await loadModuleData(mounted);
      } catch (error: any) {
        console.error('Failed to fetch module:', error);
        const errorMessage = error?.message || error?.error || 'Failed to load module details';
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        if (mounted) {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    })();
    return () => { mounted = false };
  }, [moduleId]);

  // Refresh module data when page becomes visible (e.g., returning from lesson)
  useEffect(() => {
    const handleFocus = () => {
      loadModuleData(true);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadModuleData(true);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'neural_completed_lessons') {
        loadModuleData(true);
      }
    };

    // Also refresh when the page loads (in case user navigated back from lesson)
    const handlePageShow = () => {
      loadModuleData(true);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [moduleId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading module...</p>
        </div>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Module Not Found</h1>
          <Link to="/dashboard">
            <Button variant="neural">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Use backend-calculated progress
  const completedLessons = module.completedLessonsCount || 0;
  const progressPercent = module.progressPercentage || 0;

  // Debug logging
  console.log('Module progress debug:', {
    totalLessons: module.totalLessons,
    completedLessons,
    progressPercent,
    lessons: module.lessons?.map(l => ({ id: l.lessonId, title: l.lessonTitle, completed: l.completed, locked: l.locked }))
  });
  const totalLessons = module.lessons?.length || 0;
  const estimatedMinutes = totalLessons * 5;
  const difficultyLabel = (() => {
    const n = Number(module.moduleNumber) || 1;
    if (n <= 10) return 'Beginner';
    if (n <= 20) return 'Intermediate';
    return 'Advanced';
  })();
  const nextLesson = module.lessons?.find((l: any) => !l.completed) || module.lessons?.[0];

  const getLessonHref = (ln: number) => {
    // Use topic_number and module_number for routing (numbers, not IDs)
    const topicNum = module?.topicId ?? module?.topicNumber ?? module?.topic_number ?? 1;
    const modNum = module?.moduleNumber ?? module?.module_number ?? 1;
    return `/lesson/${topicNum}/${modNum}/${ln}`;
  };

  const getLessonIcon = (lesson: any) => {
    if (lesson.completed) return <CheckCircle2 className="w-5 h-5 text-success" />;

    const type = lesson.lessonType || lesson.type || 'learn';
    switch (type) {
      case "learn": return <BookOpen className="w-5 h-5 text-blue-600" />;
      case "practice":
      case "quiz": return <Target className="w-5 h-5 text-green-600" />;
      case "drag-drop": return <Gamepad2 className="w-5 h-5 text-purple-600" />;
      case "prompt-grader": return <Zap className="w-5 h-5 text-orange-600" />;
      default: return <BookOpen className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (lesson: any) => {
    const type = lesson.lessonType || lesson.type || 'learn';
    switch (type) {
      case "learn": return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Learn</Badge>;
      case "practice":
      case "quiz": return <Badge className="bg-green-100 text-green-800 border-green-200">Practice</Badge>;
      case "drag-drop": return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Drag & Drop</Badge>;
      case "prompt-grader": return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Prompt Grader</Badge>;
      default: return <Badge variant="outline">Lesson</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-6xl mx-auto p-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>

        {/* Module Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{module.title}</h1>
              <Badge className="bg-primary/10 text-primary border-primary/20">
                Module {module.moduleNumber}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadModuleData(true);
                toast({
                  title: "Refreshed",
                  description: "Module progress updated",
                });
              }}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Progress
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground mb-6">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              {module.lessons?.length || 0} lessons
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Topic {module.topicId}
            </div>
          </div>

          {/* Progress */}
          <Card className="p-4 bg-gradient-card border border-border/50">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-foreground">Module Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedLessons}/{totalLessons} completed
              </span>
            </div>
            <Progress value={progressPercent} className="mb-2" />
            <p className="text-xs text-muted-foreground">{Math.round(progressPercent)}% complete</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Lessons */}
            <Card className="p-6 mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">Lessons</h2>

              <div className="space-y-4">
                {module.lessons?.map((lesson: any, index: number) => {
                  const isLocked = lesson.locked || false;
                  const canStart = !isLocked;

                  return (
                    <div
                      key={lesson.lessonNumber}
                      className={`p-4 rounded-lg border transition-all ${lesson.completed
                        ? 'bg-success/5 border-success/20'
                        : canStart
                          ? 'bg-background border-border hover:shadow-card'
                          : 'bg-muted/30 border-muted/50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center">
                            {isLocked ? (
                              <Lock className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              getLessonIcon(lesson)
                            )}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-medium text-foreground">{lesson.lessonTitle}</h3>
                              {getTypeBadge(lesson)}
                            </div>
                            <span className="text-xs text-muted-foreground">Lesson {lesson.lessonNumber}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {lesson.completed && (
                            <Badge className="bg-success/10 text-success border-success/20">
                              Completed
                            </Badge>
                          )}

                          {canStart ? (
                            <Link to={getLessonHref(lesson.lessonNumber)} state={{ fromModuleId: moduleId }}>
                              <Button
                                variant={lesson.completed ? "outline" : "neural"}
                                size="sm"
                                className={!lesson.completed ? "text-foreground" : undefined}
                              >
                                {lesson.completed ? "Review" : "Start Lesson"}
                              </Button>
                            </Link>
                          ) : (
                            <Button variant="ghost" size="sm" disabled>
                              Locked
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Module Completion */}
            <Card className="p-6 bg-gradient-hero text-white">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-6 h-6" />
                <h3 className="text-xl font-semibold">Complete Module</h3>
              </div>
              <p className="text-white/80 mb-4">
                Complete all lessons to master this module and unlock the next one.
              </p>
              <Button
                variant="secondary"
                size="lg"
                disabled={progressPercent < 100}
                onClick={() => {
                  if (progressPercent < 100) return;
                  try {
                    (module.lessons || []).forEach((l: any) => {
                      markLessonComplete(`${moduleId}-${l.lessonNumber}`, l);
                    });
                  } catch { }
                  // Refresh local completion state
                  const refreshed = {
                    ...module,
                    lessons: (module.lessons || []).map((l: any) => ({
                      ...l,
                      completed: true,
                    })),
                  };
                  setModule(refreshed);
                }}
              >
                {progressPercent === 100 ? "MODULE COMPLETE!" : `${Math.round(progressPercent)}% Complete`}
              </Button>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Module Info */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Module Information
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Module • Topic</span>
                  <span className="font-medium">{module.moduleNumber} • {module.topicId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Difficulty</span>
                  <Badge variant="outline" className={`${difficultyLabel === 'Beginner' ? 'bg-success/10 text-success border-success/20' : difficultyLabel === 'Intermediate' ? 'bg-learning/10 text-learning border-learning/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>{difficultyLabel}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated Time</span>
                  <span className="font-medium">≈ {estimatedMinutes} min</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Lessons Completed</span>
                  <span className="font-medium">{completedLessons}/{totalLessons}</span>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{Math.round(progressPercent)}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
                {Array.isArray(module.learningObjectives) && module.learningObjectives.length > 0 && (
                  <div className="pt-2">
                    <span className="text-muted-foreground block mb-2">What you'll learn</span>
                    <ul className="list-disc list-inside space-y-1">
                      {module.learningObjectives.slice(0, 4).map((o: string, idx: number) => (
                        <li key={idx} className="text-foreground/90">{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>

            {/* Next Up */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Next Up</h3>
              {nextLesson ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Lesson {nextLesson.lessonNumber}</p>
                      <p className="font-medium text-foreground">{nextLesson.lessonTitle}</p>
                    </div>
                    {getTypeBadge(nextLesson)}
                  </div>
                  <Link to={getLessonHref(nextLesson.lessonNumber)} state={{ fromModuleId: moduleId }}>
                    <Button variant="learning" className="w-full">
                      {nextLesson.completed ? 'Review Lesson' : 'Continue Lesson'}
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">All lessons completed. Great job!</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleDetail;