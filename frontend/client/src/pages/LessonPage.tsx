/**
 * LessonPage Component
 * Displays lesson content and tracks learner progress
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
    ArrowLeft,
    ArrowRight,
    Trophy,
    Zap,
    Brain,
    MessageSquare,
    Image,
    Code
} from 'lucide-react';
import apiService from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import CongratulationsModal from '@/components/CongratulationsModal';
import { renderFormattedText } from '@/utils/textFormatting';
import { LoadingOverlay, SkeletonCard } from '@/components/LoadingStates';
import { getErrorMessage } from '@/utils/errorMessages';

interface LessonContent {
    sections: Array<{
        title: string;
        content: string;
        type: string;
    }>;
    resources: string[];
}

interface Lesson {
    id: string;
    title: string;
    description: string;
    lesson_type: string;
    estimated_time: number;
    xp_reward: number;
    order_index: number;
    content_data: LessonContent;
    is_completed?: boolean;
    is_available?: boolean;
    progress_percentage?: number;
    module_id: string;
}

const LessonPage: React.FC = () => {
    const { lessonId } = useParams<{ lessonId: string }>();
    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentSection, setCurrentSection] = useState(0);
    const [lessonProgress, setLessonProgress] = useState(0);
    const [isCompleted, setIsCompleted] = useState(false);
    const [showCongratulations, setShowCongratulations] = useState(false);
    const [moduleLessons, setModuleLessons] = useState<any[]>([]);
    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        if (lessonId) {
            loadLessonData();
        }
    }, [lessonId]);

    const loadLessonData = async () => {
        try {
            setLoading(true);

            // Load lesson details and progress with null safety
            const [lessonData, progressData] = await Promise.all([
                apiService.getLesson(lessonId!).catch(err => {
                    console.error('Error loading lesson:', err);
                    return null;
                }),
                apiService.getUserProgress().catch(err => {
                    console.error('Error loading progress:', err);
                    return null;
                })
            ]);

            if (!lessonData) {
                throw new Error('Lesson not found');
            }

            // Load module lessons to determine if this is the last lesson
            const lessonInfo = lessonData as any;
            if (lessonInfo?.module_id) {
                try {
                    const moduleLessonsData = await apiService.getModuleLessons(lessonInfo.module_id);
                    const lessons = (moduleLessonsData as any)?.lessons || [];
                    setModuleLessons(Array.isArray(lessons) ? lessons : []);
                } catch (err) {
                    console.warn('Failed to load module lessons:', err);
                    setModuleLessons([]);
                }
            }

            // Handle progress data with null safety
            const progress = progressData && typeof progressData === 'object'
                ? ((progressData as any)?.completed_lessons || (progressData as any)?.progress || {})
                : {};
            const lessonProgress = (progress && typeof progress === 'object' && lessonId && progress[lessonId])
                ? progress[lessonId]
                : {};

            const transformedLesson: Lesson = {
                id: lessonInfo.id || lessonId!,
                title: lessonInfo.title || 'Untitled Lesson',
                description: lessonInfo.description || 'Learn essential concepts in this lesson',
                lesson_type: lessonInfo.lesson_type || 'learn',
                estimated_time: lessonInfo.estimated_time || 10,
                xp_reward: lessonInfo.xp_reward || 25,
                order_index: lessonInfo.order_index || 1,
                content_data: lessonInfo.content_data || {
                    sections: [
                        {
                            title: 'Introduction',
                            content: 'Welcome to this lesson! Let\'s start learning.',
                            type: 'text'
                        }
                    ],
                    resources: []
                },
                is_completed: lessonProgress.is_completed || false,
                is_available: lessonProgress.is_available !== false,
                progress_percentage: lessonProgress.progress_percentage || 0,
                module_id: (lessonInfo as any).module_id || ''
            };

            setLesson(transformedLesson);
            setLessonProgress(transformedLesson.progress_percentage || 0);
            setIsCompleted(transformedLesson.is_completed || false);
        } catch (error: any) {
            console.error('Error loading lesson data:', error);
            const errorMsg = getErrorMessage(error, 'Failed to load lesson data');
            toast({
                title: errorMsg.title,
                description: errorMsg.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const getLessonTypeIcon = (lessonType: string) => {
        switch (lessonType.toLowerCase()) {
            case 'learn': return <Brain className="w-5 h-5" />;
            case 'practice': return <Target className="w-5 h-5" />;
            case 'quiz': return <MessageSquare className="w-5 h-5" />;
            case 'media': return <Image className="w-5 h-5" />;
            case 'code': return <Code className="w-5 h-5" />;
            default: return <BookOpen className="w-5 h-5" />;
        }
    };

    const getLessonTypeColor = (lessonType: string) => {
        switch (lessonType.toLowerCase()) {
            case 'learn': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'practice': return 'bg-green-100 text-green-800 border-green-200';
            case 'quiz': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'media': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'code': return 'bg-gray-100 text-gray-800 border-gray-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const handleSectionComplete = async () => {
        const newProgress = Math.min(100, lessonProgress + (100 / (lesson?.content_data.sections.length || 1)));
        setLessonProgress(newProgress);

        // Mark lesson as completed if all sections are done
        if (newProgress >= 100) {
            setIsCompleted(true);

            // Save lesson completion to backend
            try {
                // Use completeLessonInModule with module_id and lesson_id
                // XP is awarded by the backend, so we don't need separate addXP call
                const moduleIdNum = parseInt(lesson!.module_id, 10);
                const lessonIdNum = parseInt(lesson!.id, 10);

                let earnedXP = lesson?.xp_reward || 25;
                if (!isNaN(moduleIdNum) && !isNaN(lessonIdNum)) {
                    const completionResponse = await apiService.completeLessonInModule(moduleIdNum, lessonIdNum, {
                        xp_earned: lesson?.xp_reward || 25,
                        time_spent: 0 // Can be tracked if available
                    });
                    // Extract XP from response: {success: true, data: {xp_earned: ..., ...}}
                    const responseData = (completionResponse && typeof completionResponse === 'object' && 'data' in completionResponse)
                        ? completionResponse.data
                        : completionResponse;
                    earnedXP = responseData?.xp_earned || responseData?.xpEarned || earnedXP;
                } else {
                    // Fallback to generic markLessonComplete if IDs aren't numeric
                    await apiService.markLessonComplete(lesson!.id, lesson?.xp_reward || 25);
                }

                toast({
                    title: "🎉 Congratulations!",
                    description: `You completed the lesson and earned ${earnedXP} XP!`,
                    variant: "default",
                });

                // Show congratulations modal
                setTimeout(() => {
                    setShowCongratulations(true);
                }, 1000);
            } catch (error: any) {
                console.error('Error saving lesson progress:', error);
                const errorMsg = getErrorMessage(error, "Failed to save lesson progress. Your completion will be saved when online.");
                toast({
                    title: errorMsg.title,
                    description: errorMsg.message,
                    variant: "destructive",
                    duration: 5000
                });
                // Don't mark as incomplete on error - user still completed it locally
            }
        }
    };

    const handleNextSection = () => {
        if (lesson && currentSection < lesson.content_data.sections.length - 1) {
            setCurrentSection(currentSection + 1);
            handleSectionComplete();
        }
    };

    const handlePrevSection = () => {
        if (currentSection > 0) {
            setCurrentSection(currentSection - 1);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col relative">
                <ParticleOverlay />
                <Header />
                <LoadingOverlay message="Loading lesson..." fullScreen />
            </div>
        );
    }

    if (!lesson) {
        return (
            <div className="min-h-screen bg-background flex flex-col relative">
                <ParticleOverlay />
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-gray-800 mb-4">Lesson Not Found</h1>
                        <Link to="/skill-tree">
                            <Button variant="default">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Skill Tree
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const currentSectionData = lesson.content_data.sections[currentSection];

    return (
        <div className="min-h-screen bg-background flex flex-col relative">
            <ParticleOverlay />
            <Header />

            <div className="flex-1 flex flex-col">
                <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Back Button */}
                        <Link to={`/module/${lesson.module_id}`}>
                            <Button variant="outline" className="mb-4">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Module
                            </Button>
                        </Link>

                        {/* Lesson Header */}
                        <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            {getLessonTypeIcon(lesson.lesson_type)}
                                            <Badge className={getLessonTypeColor(lesson.lesson_type)}>
                                                {lesson.lesson_type}
                                            </Badge>
                                        </div>
                                        <CardTitle className="text-2xl font-bold mb-2">{lesson.title}</CardTitle>
                                        <p className="text-blue-100 text-lg">{lesson.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl font-bold">{Math.round(lessonProgress)}%</div>
                                        <div className="text-blue-100">Complete</div>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>

                        {/* Lesson Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <Clock className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                                    <div className="text-2xl font-bold">{lesson.estimated_time}</div>
                                    <div className="text-sm text-gray-600">minutes</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <Zap className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                                    <div className="text-2xl font-bold">+{lesson.xp_reward}</div>
                                    <div className="text-sm text-gray-600">XP Reward</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <BookOpen className="w-6 h-6 mx-auto mb-2 text-green-500" />
                                    <div className="text-2xl font-bold">{lesson.content_data.sections.length}</div>
                                    <div className="text-sm text-gray-600">Sections</div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Progress Bar */}
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-medium">Lesson Progress</span>
                                    <span className="text-sm text-gray-600">
                                        Section {currentSection + 1} of {lesson.content_data.sections.length}
                                    </span>
                                </div>
                                <Progress value={lessonProgress} className="h-3" />
                            </CardContent>
                        </Card>

                        {/* Section Navigation */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BookOpen className="w-5 h-5" />
                                    {currentSectionData.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="prose max-w-none">
                                    <div
                                        className="text-gray-700 leading-relaxed"
                                        dangerouslySetInnerHTML={{
                                            __html: renderFormattedText(currentSectionData.content)
                                        }}
                                    />
                                </div>

                                {/* Section Navigation */}
                                <div className="flex justify-between items-center mt-6 pt-4 border-t">
                                    <Button
                                        variant="outline"
                                        onClick={handlePrevSection}
                                        disabled={currentSection === 0}
                                    >
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Previous
                                    </Button>

                                    <div className="flex gap-2">
                                        {lesson.content_data.sections.map((_, index) => (
                                            <div
                                                key={index}
                                                className={`w-3 h-3 rounded-full ${index === currentSection ? 'bg-blue-500' :
                                                    index < currentSection ? 'bg-green-500' : 'bg-gray-300'
                                                    }`}
                                            />
                                        ))}
                                    </div>

                                    {currentSection < lesson.content_data.sections.length - 1 ? (
                                        <Button onClick={handleNextSection}>
                                            Next
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={handleSectionComplete}
                                            className="bg-green-500 hover:bg-green-600"
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            Complete Lesson
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Resources */}
                        {lesson.content_data.resources.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Star className="w-5 h-5" />
                                        Resources
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-2">
                                        {lesson.content_data.resources.map((resource, index) => (
                                            <li key={index} className="flex items-center gap-2">
                                                <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                                                <span className="text-gray-700">{resource}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-4 justify-center">
                            <Link to={`/module/${lesson.module_id}`}>
                                <Button variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back to Module
                                </Button>
                            </Link>
                            {isCompleted && (
                                <Button variant="default" className="bg-green-500 hover:bg-green-600">
                                    <Trophy className="w-4 h-4 mr-2" />
                                    Lesson Complete!
                                </Button>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Congratulations Modal */}
            <CongratulationsModal
                isOpen={showCongratulations}
                onClose={() => setShowCongratulations(false)}
                lessonTitle={lesson?.title || ''}
                xpEarned={lesson?.xp_reward || 0}
                isLastLesson={isLastLesson(lesson, moduleLessons)}
                nextLessonId={getNextLessonId(lesson, moduleLessons)}
                moduleId={lesson?.module_id || ''}
            />
        </div>
    );
};

const isLastLesson = (lesson: Lesson | null, moduleLessons: any[]) => {
    if (!lesson || !moduleLessons.length) return false;
    console.log('Checking if last lesson:', {
        lessonId: lesson.id,
        moduleLessonsCount: moduleLessons.length,
        moduleLessons: moduleLessons.map((l: any) => ({ id: l.id, title: l.title }))
    });
    const currentIndex = moduleLessons.findIndex((l: any) => l.id === lesson.id);
    const isLast = currentIndex === moduleLessons.length - 1;
    console.log('Is last lesson?', { currentIndex, totalLessons: moduleLessons.length, isLast });
    return isLast;
};

const getNextLessonId = (lesson: Lesson | null, moduleLessons: any[]) => {
    if (!lesson || !moduleLessons.length) return null;
    const currentIndex = moduleLessons.findIndex((l: any) => l.id === lesson.id);
    const nextLesson = moduleLessons[currentIndex + 1];
    return nextLesson?.id || null;
};

export default LessonPage;
