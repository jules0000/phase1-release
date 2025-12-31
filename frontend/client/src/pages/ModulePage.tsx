/**
 * ModulePage Component
 * Displays module details and lessons with real learner progress
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ParticleOverlay } from '@/components/ParticleOverlay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    BookOpen,
    Clock,
    Target,
    Star,
    Play,
    CheckCircle2,
    Lock,
    ArrowLeft,
    ArrowRight,
    Trophy,
    Zap
} from 'lucide-react';
import apiService from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Lesson {
    id: string;
    title: string;
    description: string;
    lesson_type: string;
    estimated_time: number;
    xp_reward: number;
    order_index: number;
    is_completed?: boolean;
    is_available?: boolean;
    progress_percentage?: number;
}

interface Module {
    id: string;
    title: string;
    description: string;
    difficulty: string;
    estimated_time: number;
    xp_reward: number;
    total_lessons: number;
    completed_lessons: number;
    progress_percentage: number;
    learning_objectives: string[];
    prerequisites: string[];
    lessons: Lesson[];
}

const ModulePage: React.FC = () => {
    const { moduleId } = useParams<{ moduleId: string }>();
    const [module, setModule] = useState<Module | null>(null);
    const [loading, setLoading] = useState(true);
    const [userProgress, setUserProgress] = useState<any>(null);
    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        if (moduleId) {
            loadModuleData();
        }
    }, [moduleId]);

    // Refresh data when returning from a lesson
    useEffect(() => {
        const handleFocus = () => {
            if (moduleId) {
                loadModuleData();
            }
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [moduleId]);

    const loadModuleData = async () => {
        try {
            setLoading(true);

            // Load module details and lessons with error handling for each
            const [moduleData, lessonsData, progressData] = await Promise.allSettled([
                apiService.getModule(moduleId!).catch(err => {
                    console.error('Error loading module:', err);
                    return null;
                }),
                apiService.getModuleLessons(moduleId!).catch(err => {
                    console.error('Error loading module lessons:', err);
                    return null;
                }),
                apiService.getUserProgress().catch(err => {
                    console.error('Error loading user progress:', err);
                    return null;
                })
            ]);

            // Extract values from settled promises
            const moduleInfo = moduleData.status === 'fulfilled' ? (moduleData.value as any) : null;
            const lessonsResponse = lessonsData.status === 'fulfilled' ? (lessonsData.value as any) : null;
            const progressResponse = progressData.status === 'fulfilled' ? (progressData.value as any) : null;

            if (!moduleInfo) {
                throw new Error('Failed to load module information');
            }

            // Handle lessons response format variations: {lessons: []} or direct array
            const lessons = Array.isArray(lessonsResponse?.lessons)
                ? lessonsResponse.lessons
                : (Array.isArray(lessonsResponse) ? lessonsResponse : []);

            // Handle progress data format variations
            const progress = progressResponse
                ? ((progressResponse.completed_modules || progressResponse.modules || {}) as Record<string, any>)
                : {};

            // Transform data with null safety
            const moduleProgress = progress[moduleId!] || {};

            const transformedModule: Module = {
                id: moduleInfo.id || moduleId!,
                title: moduleInfo.title || 'Untitled Module',
                description: moduleInfo.description || 'Learn essential skills in this module',
                difficulty: moduleInfo.difficulty || 'Beginner',
                estimated_time: moduleInfo.estimated_time || 30,
                xp_reward: moduleInfo.xp_reward || 150,
                total_lessons: lessons.length,
                completed_lessons: moduleProgress.completed_lessons || 0,
                progress_percentage: moduleProgress.progress_percentage || 0,
                learning_objectives: Array.isArray(moduleInfo.learning_objectives)
                    ? moduleInfo.learning_objectives
                    : ['Master the fundamentals'],
                prerequisites: Array.isArray(moduleInfo.prerequisites) ? moduleInfo.prerequisites : [],
                lessons: lessons.map((lesson: any) => {
                    // Handle lesson progress mapping with null safety
                    const lessonProgress = moduleProgress.lessons?.[lesson.id] ||
                        moduleProgress.lessons?.[lesson.lesson_id] ||
                        {};

                    return {
                        id: lesson.id || lesson.lesson_id || '',
                        title: lesson.title || 'Untitled Lesson',
                        description: lesson.description || '',
                        lesson_type: lesson.lesson_type || 'learn',
                        estimated_time: lesson.estimated_time || 10,
                        xp_reward: lesson.xp_reward || 25,
                        order_index: lesson.order_index || 1,
                        is_completed: lessonProgress.is_completed || false,
                        is_available: lessonProgress.is_available !== false,
                        progress_percentage: lessonProgress.progress_percentage || 0
                    };
                })
            };

            setModule(transformedModule);
            setUserProgress(progressResponse);
        } catch (error: any) {
            console.error('Error loading module data:', error);
            const errorMessage = error?.message || error?.error || 'Failed to load module data';
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty.toLowerCase()) {
            case 'beginner': return 'bg-green-100 text-green-800 border-green-200';
            case 'intermediate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'advanced': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'expert': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getLessonStatusIcon = (lesson: Lesson) => {
        if (lesson.is_completed) {
            return <CheckCircle2 className="w-5 h-5 text-green-500" />;
        } else if (lesson.is_available) {
            return <Play className="w-5 h-5 text-blue-500" />;
        } else {
            return <Lock className="w-5 h-5 text-gray-400" />;
        }
    };

    const getLessonStatusColor = (lesson: Lesson) => {
        if (lesson.is_completed) {
            return 'bg-green-50 border-green-200';
        } else if (lesson.is_available) {
            return 'bg-blue-50 border-blue-200';
        } else {
            return 'bg-gray-50 border-gray-200';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col relative">
                <ParticleOverlay />
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
                </div>
            </div>
        );
    }

    if (!module) {
        return (
            <div className="min-h-screen bg-background flex flex-col relative">
                <ParticleOverlay />
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-gray-800 mb-4">Module Not Found</h1>
                        <Link to="/learn">
                            <Button variant="default">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Learn
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col relative">
            <ParticleOverlay />
            <Header />

            <div className="flex-1 flex flex-col">
                <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Back Button */}
                        <Link to="/learn">
                            <Button variant="outline" className="mb-4">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Learn
                            </Button>
                        </Link>

                        {/* Module Header */}
                        <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <BookOpen className="w-8 h-8" />
                                            <Badge className={getDifficultyColor(module.difficulty)}>
                                                {module.difficulty}
                                            </Badge>
                                        </div>
                                        <CardTitle className="text-2xl font-bold mb-2">{module.title}</CardTitle>
                                        <p className="text-blue-100 text-lg">{module.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl font-bold">{module.completed_lessons}</div>
                                        <div className="text-blue-100">of {module.total_lessons} lessons</div>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>

                        {/* Module Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <Clock className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                                    <div className="text-2xl font-bold">{module.estimated_time}</div>
                                    <div className="text-sm text-gray-600">minutes</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <Zap className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                                    <div className="text-2xl font-bold">+{module.xp_reward}</div>
                                    <div className="text-sm text-gray-600">XP Reward</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <Target className="w-6 h-6 mx-auto mb-2 text-green-500" />
                                    <div className="text-2xl font-bold">{module.total_lessons}</div>
                                    <div className="text-sm text-gray-600">Lessons</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <Star className="w-6 h-6 mx-auto mb-2 text-purple-500" />
                                    <div className="text-2xl font-bold">{Math.round(module.progress_percentage)}%</div>
                                    <div className="text-sm text-gray-600">Complete</div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Progress Bar */}
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-medium">Module Progress</span>
                                    <span className="text-sm text-gray-600">
                                        {module.completed_lessons} of {module.total_lessons} lessons completed
                                    </span>
                                </div>
                                <Progress value={module.progress_percentage} className="h-3" />
                            </CardContent>
                        </Card>

                        {/* Learning Objectives */}
                        {module.learning_objectives.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Target className="w-5 h-5" />
                                        Learning Objectives
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-2">
                                        {module.learning_objectives.map((objective, index) => (
                                            <li key={index} className="flex items-start gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                                <span className="text-gray-700">{objective}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        {/* Lessons List */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BookOpen className="w-5 h-5" />
                                    Lessons
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {module.lessons.map((lesson, index) => (
                                        <div
                                            key={lesson.id}
                                            className={`p-4 rounded-lg border-2 transition-all duration-200 ${getLessonStatusColor(lesson)}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    {getLessonStatusIcon(lesson)}
                                                    <div className="flex-1">
                                                        <h3 className="font-semibold text-gray-800">{lesson.title}</h3>
                                                        <p className="text-sm text-gray-600">{lesson.description}</p>
                                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {lesson.estimated_time} min
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Zap className="w-3 h-3" />
                                                                +{lesson.xp_reward} XP
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <BookOpen className="w-3 h-3" />
                                                                {lesson.lesson_type}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {lesson.is_completed && (
                                                        <Badge className="bg-green-100 text-green-800">
                                                            Completed
                                                        </Badge>
                                                    )}
                                                    {lesson.is_available && !lesson.is_completed && (
                                                        <Link to={`/lesson/${lesson.id}`}>
                                                            <Button size="sm">
                                                                <Play className="w-4 h-4 mr-1" />
                                                                Start
                                                            </Button>
                                                        </Link>
                                                    )}
                                                    {!lesson.is_available && (
                                                        <Button size="sm" disabled>
                                                            <Lock className="w-4 h-4 mr-1" />
                                                            Locked
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Action Buttons */}
                        <div className="flex gap-4 justify-center">
                            <Link to="/learn">
                                <Button variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back to Learn
                                </Button>
                            </Link>
                            {module.completed_lessons < module.total_lessons && (
                                <Link to={`/lesson/${module.lessons.find(l => l.is_available && !l.is_completed)?.id}`}>
                                    <Button variant="default">
                                        <Play className="w-4 h-4 mr-2" />
                                        Continue Learning
                                    </Button>
                                </Link>
                            )}
                            {module.completed_lessons === module.total_lessons && (
                                <Button variant="default" className="bg-green-500 hover:bg-green-600">
                                    <Trophy className="w-4 h-4 mr-2" />
                                    Module Complete!
                                </Button>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ModulePage;
