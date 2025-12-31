/*
 * BACKEND REQUIREMENTS - LessonViewer.tsx (Lesson Content Viewer):
 * 
 * This component displays individual lesson content from the neural-content JSON files
 * and handles lesson completion tracking with real-time progress updates.
 * 
 * Backend Endpoints Required:
 * - GET /api/content/topic/{topicNumber} - Fetch neural content from JSON files
 *   Response: { modules: Module[], topic_info: object }
 * 
 * - POST /api/progress/update - Mark lesson as completed and award XP
 *   Request: { lessonId: string, moduleId: string, xpEarned: number, timeSpent: number }
 *   Response: { success: boolean, newLevel?: number, achievements?: Achievement[] }
 * 
 * - GET /api/user/progress/{moduleId} - Get user's progress for specific module
 *   Response: { completedLessons: string[], overallProgress: number, xpEarned: number }
 * 
 * - POST /api/notifications/create - Create achievement notifications
 *   Request: { type: string, message: string, userId: string }
 * 
 * Database Tables Needed:
 * - neural_content: topic_id, module_number, lesson_number, content_data, lesson_type
 * - user_lesson_progress: user_id, lesson_id, module_id, is_completed, 
 *                        completion_date, time_spent, xp_earned
 * - user_module_progress: user_id, module_id, completed_lessons_count, 
 *                        overall_progress_percentage, last_accessed
 * - xp_transactions: user_id, source, amount, description, timestamp
 * - user_achievements: user_id, achievement_type, earned_date, description
 * 
 * Real-time Features:
 * - Live progress updates across devices
 * - Real-time XP and level-up notifications
 * - Achievement unlock notifications
 * - Progress synchronization for collaborative learning
 * - Live lesson completion status updates
 * 
 * Content Types Supported:
 * - Learn: Text-based lessons with markdown formatting
 * - Practice: Multiple choice quiz questions
 * - Drag and Drop: Interactive categorization exercises
 * - Prompt Auto Grader: AI-powered prompt evaluation
 */

import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, Clock, Target, Users } from "lucide-react";
import { LessonRenderer } from "@/components/LessonRenderer";
import { LessonBookmark } from "@/components/LessonBookmark";
import { NextLessonPreview } from "@/components/NextLessonPreview";
import apiService from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import CongratulationsModal from '@/components/CongratulationsModal';

export const LessonViewer = () => {
  const { topicNumber, moduleNumber, lessonNumber, moduleId } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState<any>(null);
  const [module, setModule] = useState<any>(null);
  const [topic, setTopic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [showCongratulations, setShowCongratulations] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);
  const [nextLesson, setNextLesson] = useState<any>(null);

  // Helper: normalize lesson number across APIs
  const getLessonNumber = (l: any): number => Number(l?.lessonNumber ?? l?.lesson_number ?? 0);

  // Derived indexes for navigation/stepper
  const currentIndex = module ? module.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber || '1')) : 0;
  const totalLessons = module?.lessons?.length || 0;
  const prevAvailable = currentIndex > 0;
  const nextAvailable = currentIndex < totalLessons - 1;

  useEffect(() => {
    loadLessonData();
  }, [topicNumber, moduleNumber, lessonNumber]);

  const loadLessonData = async () => {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      setLoading(true);
      // Fail-safe: auto-hide loader after 3s
      timeoutId = setTimeout(() => {
        console.log('LessonViewer: Loading timeout - hiding loader');
        setLoading(false);
      }, 3000);

      // Load topic content
      const topicData = await apiService.getTopicContent(parseInt(topicNumber!));
      console.log('LessonViewer: Loaded topic data:', {
        hasModules: !!topicData.modules,
        moduleCount: topicData.modules?.length || 0,
        topicInfo: topicData.topicInfo,
        firstModuleNumber: topicData.modules?.[0]?.moduleNumber || topicData.modules?.[0]?.module_number,
        requestedModuleNumber: parseInt(moduleNumber!)
      });
      setTopic(topicData);

      // Find the specific module
      const targetModule = topicData.modules.find((m: any) => m.moduleNumber === parseInt(moduleNumber!) || m.module_number === parseInt(moduleNumber!));
      if (!targetModule) {
        console.error('LessonViewer: Module not found!', {
          requestedModuleNumber: parseInt(moduleNumber!),
          availableModules: topicData.modules.map((m: any) => ({
            moduleNumber: m.moduleNumber || m.module_number,
            title: m.title
          }))
        });
        toast({
          title: "Module Not Found",
          description: `Module ${moduleNumber} not found. Available modules: ${topicData.modules.length}`,
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      console.log('LessonViewer: Found module:', {
        moduleNumber: targetModule.moduleNumber || targetModule.module_number,
        title: targetModule.title,
        lessonCount: targetModule.lessons?.length || 0,
        firstLessonNumber: targetModule.lessons?.[0]?.lessonNumber || targetModule.lessons?.[0]?.lesson_number,
        requestedLessonNumber: parseInt(lessonNumber!)
      });
      setModule(targetModule);

      // Find the specific lesson
      const targetLesson = targetModule.lessons.find((l: any) => getLessonNumber(l) === parseInt(lessonNumber!));
      if (!targetLesson) {
        console.error('LessonViewer: Lesson not found!', {
          requestedLessonNumber: parseInt(lessonNumber!),
          availableLessons: targetModule.lessons.map((l: any) => ({
            lessonNumber: l.lessonNumber || l.lesson_number,
            title: l.title
          }))
        });
        toast({
          title: "Lesson Not Found",
          description: `Lesson ${lessonNumber} not found in module ${moduleNumber}`,
          variant: "destructive",
        });
        navigate(`/dashboard`);
        return;
      }

      console.log('LessonViewer: Found lesson:', {
        lessonNumber: targetLesson.lessonNumber || targetLesson.lesson_number,
        title: targetLesson.title,
        type: targetLesson.type,
        hasContent: !!targetLesson.content,
        contentType: typeof targetLesson.content,
        contentPreview: targetLesson.content ? JSON.stringify(targetLesson.content).substring(0, 200) + '...' : 'No content',
        lessonId: targetLesson.id || targetLesson.lesson_id,
        moduleId: targetModule.id || targetModule.module_id
      });
      setLesson(targetLesson);

      // Load next lesson preview
      const currentLessonIndex = targetModule.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!));
      const nextLessonData = targetModule.lessons[currentLessonIndex + 1];
      if (nextLessonData) {
        setNextLesson({
          id: nextLessonData.id || nextLessonData.lesson_id || String(getLessonNumber(nextLessonData)),
          title: nextLessonData.title,
          description: nextLessonData.description,
          estimatedTime: nextLessonData.estimated_time || 10,
          difficulty: nextLessonData.difficulty || 'Beginner',
          isLocked: false, // Could check prerequisites here
        });
      } else {
        setNextLesson(null);
      }

    } catch (error) {
      console.error('Error loading lesson data:', error);
      toast({
        title: "Error",
        description: "Failed to load lesson data",
        variant: "destructive",
      });
      navigate('/dashboard');
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  // Helper function to check if this is the last lesson
  const isLastLesson = () => {
    if (!module || !lesson) return false;
    const currentLessonIndex = module.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!));
    const isLast = currentLessonIndex === module.lessons.length - 1;
    console.log('Is last lesson?', { currentLessonIndex, totalLessons: module.lessons.length, isLast });
    return isLast;
  };

  const handleLessonComplete = async (lessonId: string, xp: number) => {
    try {
      // Try to get the actual lesson database ID from the lesson object
      const actualLessonId = lesson.id || lesson.lesson_id || lessonNumber;
      // Use moduleNumber (from URL) as the database module ID
      const actualModuleId = moduleNumber;
      const urlModuleId = moduleId; // From URL params

      console.log('LessonViewer: Completing lesson:', {
        actualLessonId,
        actualModuleId,
        urlModuleId,
        moduleNumber,
        lessonNumber,
        xp,
        lessonData: lesson,
        moduleData: module
      });

      // Save to backend database if we have module and lesson numbers
      if (actualModuleId && lessonNumber && !isNaN(Number(actualModuleId))) {
        try {
          // Mark lesson as complete using the new endpoint that accepts numbers
          const response = await apiService.completeLessonByNumber(
            Number(actualModuleId),
            Number(lessonNumber),
            {
              score: 100,
              time_spent: 0,
              xp_earned: xp
            }
          );
          console.log('LessonViewer: Lesson completion response:', response);
          // Extract XP from standardized response: {success: true, data: {xp_earned: ...}}
          let responseData = response;
          if (response && typeof response === 'object') {
            if ('data' in response) {
              responseData = response.data;
            } else if ('success' in response && response.success && 'data' in response) {
              responseData = response.data;
            }
          }
          const actualXP = responseData?.xp_earned || responseData?.xpEarned || responseData?.lesson_progress?.xp_earned || xp;
          if (actualXP !== xp) {
            xp = actualXP; // Use the actual XP awarded by backend
          }
        } catch (apiError: any) {
          console.warn('Could not save lesson completion to database (using JSON data):', apiError);
          // Show user-friendly message
          const errorMsg = apiError?.message || apiError?.error || 'Failed to sync completion. Progress saved locally.';
          toast({
            title: "Sync Warning",
            description: errorMsg,
            variant: "destructive",
            duration: 3000
          });
        }
      } else {
        console.log('Using JSON lesson data - skipping database save');
      }

      setCompleted(true);
      setXpEarned(xp);

      // Also mark locally for immediate UI update
      const lessonKey = `${urlModuleId}-${lessonNumber}`;
      try {
        const { markLessonComplete: markLocal } = await import('@/lib/utils');
        markLocal(lessonKey, lesson);
      } catch (e) {
        console.warn('Could not mark lesson locally:', e);
      }

      toast({
        title: "Lesson Completed!",
        description: `Great job! You earned ${xp} XP.`,
      });

      // Show congratulations modal
      console.log('Lesson completed! Showing congratulations modal...');
      console.log('isLastLesson:', isLastLesson());
      setShowCongratulations(true);

    } catch (error: any) {
      console.error('Error completing lesson:', error);
      const errorMessage = error?.message || error?.error || "Failed to mark lesson as complete. Please try again.";
      toast({
        title: "Completion Error",
        description: errorMessage,
        variant: "destructive",
        duration: 5000
      });
    }
  };

  const handleProgress = async (lessonId: string, progress: number) => {
    try {
      await apiService.updateModuleProgress(module.id, progress);
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading lesson...</p>
        </div>
      </div>
    );
  }

  if (!lesson || !module || !topic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Lesson Not Found</h2>
          <p className="text-muted-foreground mb-4">The requested lesson could not be found.</p>
          <Button onClick={() => navigate('/learn')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Learning
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-gradient-to-r from-card to-muted/40 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const fromModuleId = (location.state as any)?.fromModuleId;
                  if (fromModuleId) {
                    navigate(`/module/${fromModuleId}`);
                  } else {
                    navigate(`/module/${moduleNumber}`);
                  }
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Module
              </Button>

              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-muted/60">Topic {topic?.topicInfo?.topicNumber ?? topicNumber}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted/60">Module {module?.moduleNumber ?? moduleNumber}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted/60">Lesson {getLessonNumber(lesson)}</span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{lesson.title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {completed && (
                <Badge className="bg-green-100 text-green-800">
                  Completed
                </Badge>
              )}

              <LessonBookmark
                lessonId={lesson?.id || lesson?.lesson_id || String(getLessonNumber(lesson))}
                moduleId={String(moduleNumber || 1)}
              />

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{user?.username}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Progress / Stepper */}
          <Card className="p-4 mb-6 shadow-md border border-border/60 bg-gradient-to-br from-card to-muted/30 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Module Progress</span>
              <span className="text-sm text-muted-foreground">
                {module.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!)) + 1} of {module.lessons.length} lessons
              </span>
            </div>
            <Progress
              value={(module.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!)) + 1) / module.lessons.length * 100}
              className="h-2.5"
            />
            <div className="mt-3 grid grid-cols-12 gap-1">
              {module.lessons.map((l: any, i: number) => (
                <div
                  key={i}
                  className={`h-1.5 rounded ${i < currentIndex ? 'bg-primary' : i === currentIndex ? 'bg-learning' : 'bg-muted'}`}
                />
              ))}
            </div>
          </Card>

          {/* Lesson Content */}
          <Card className="p-6 border border-border/60 rounded-xl shadow-sm">
            <LessonRenderer
              lesson={lesson}
              onComplete={handleLessonComplete}
              onProgress={handleProgress}
            />
          </Card>

          {/* Next Lesson Preview */}
          {nextLesson && !isLastLesson() && (
            <div className="mt-6">
              <NextLessonPreview
                nextLesson={nextLesson}
                moduleId={String(moduleNumber || 1)}
              />
            </div>
          )}

          {/* Sticky Bottom Navigation */}
          <div className="h-20" />
          <div className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur border-t border-border py-3 z-50">
            <div className="container mx-auto px-4 flex items-center justify-between">
              {prevAvailable ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    const currentLessonIndex = module.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!));
                    const prevLesson = module.lessons[currentLessonIndex - 1];
                    if (prevLesson) {
                      navigate(`/lesson/${topicNumber}/${moduleNumber}/${getLessonNumber(prevLesson)}`);
                    } else {
                      navigate(`/module/${moduleNumber}`);
                    }
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              ) : (
                <div />
              )}

              <Button
                onClick={async () => {
                  // Complete the current lesson
                  console.log('Lesson data:', { lesson, module });
                  const lessonId = lesson?.id || lesson?.lesson_id || lesson?.lessonId || String(getLessonNumber(lesson));
                  const moduleId = module?.id || module?.module_id || module?.moduleId || moduleNumber;
                  const xpToEarn = lesson?.xp_reward || 25;

                  console.log('Lesson completion data:', { lessonId, moduleId, xpToEarn, completed });

                  if (!completed && lessonId && moduleId) {
                    console.log('Completing lesson via Next button');
                    await handleLessonComplete(lessonId.toString(), xpToEarn);
                  } else {
                    // Already completed, just navigate
                    const currentLessonIndex = module.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!));
                    const nextLesson = module.lessons[currentLessonIndex + 1];
                    if (nextLesson) {
                      navigate(`/lesson/${topicNumber}/${moduleNumber}/${getLessonNumber(nextLesson)}`);
                    } else {
                      navigate(`/module/${moduleNumber}`);
                    }
                  }
                }}
                size="sm"
                variant="learning"
                className="ml-auto"
              >
                {completed ? (isLastLesson() ? 'Lesson Finished!' : 'Next') : (isLastLesson() ? 'Lesson Finished!' : 'Complete & Continue')}
                <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
              </Button>
            </div>
          </div>

        </div>
      </div>

      {/* Congratulations Modal */}
      <CongratulationsModal
        isOpen={showCongratulations}
        onClose={() => {
          setShowCongratulations(false);
          // Navigate after closing modal
          if (isLastLesson()) {
            // If last lesson, go back to module
            navigate(`/module/${moduleNumber || 1}`);
          } else {
            // Otherwise, go to next lesson
            const currentLessonIndex = module.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!));
            const nextLesson = module.lessons[currentLessonIndex + 1];
            if (nextLesson) {
              navigate(`/lesson/${topicNumber}/${moduleNumber}/${getLessonNumber(nextLesson)}`);
            }
          }
        }}
        lessonTitle={lesson?.title || ''}
        xpEarned={xpEarned}
        isLastLesson={isLastLesson()}
        nextLessonId={(() => {
          const currentLessonIndex = module?.lessons.findIndex((l: any) => getLessonNumber(l) === parseInt(lessonNumber!)) || -1;
          const nextLesson = module?.lessons[currentLessonIndex + 1];
          return nextLesson ? (nextLesson.id || nextLesson.lesson_id || String(getLessonNumber(nextLesson))) : undefined;
        })()}
        moduleId={String(moduleNumber || 1)}
      />
    </div>
  );
};