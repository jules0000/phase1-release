import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SkillTree from "@/components/SkillTree";
import { ParticleOverlay } from "@/components/ParticleOverlay";
import { HeartRegenerationTimer } from "@/components/HeartRegenerationTimer";
import {
  Brain,
  Play,
  CheckCircle2,
  BookOpen,
  Target,
  Zap,
  Heart,
  Flame,
  Trophy,
  Clock,
  Star,
  TrendingUp
} from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import apiService from "@/lib/api";
import { LoadingOverlay, SkeletonCard, SkeletonList } from "@/components/LoadingStates";
import { getErrorMessage } from "@/utils/errorMessages";
import { useXPStats } from "@/lib/xpTracker";
import { EmptyStates } from "@/components/EmptyState";

// Empty arrays as defaults - show real data only, not misleading templates
const dailyGoalsTemplate: any[] = [];
const recentLessonsTemplate: any[] = [];

const Learn = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { stats: xpStats } = useXPStats();

  const [activeTab, setActiveTab] = useState("overview");
  const [userStats, setUserStats] = useState({ currentStreak: 0, longestStreak: 0, totalXP: 0, level: 1, hearts: 5, todayXP: 0 });
  const [heartsData, setHeartsData] = useState<{ current_hearts: number; max_hearts: number; time_until_refill_seconds: number; unlimited_hearts: boolean } | null>(null);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [recommendedModules, setRecommendedModules] = useState<any[]>([]);
  const [recentLessons, setRecentLessons] = useState(recentLessonsTemplate);
  const [dailyGoals, setDailyGoals] = useState(dailyGoalsTemplate);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Load user settings (preferences/interests only, not stats)
        const settings = await apiService.getUserSettings().catch(() => null);
        const prefs = settings?.preferences?.interests || [];
        setPreferences(prefs);
        // Use user object from AuthContext for stats (always up-to-date)
        setUserStats((s) => ({
          ...s,
          totalXP: user?.total_xp || 0,
          currentStreak: user?.current_streak_days || 0,
          longestStreak: user?.longest_streak_days || 0,
          level: user?.level || 1,
        }));

        // Load hearts from backend
        try {
          const heartsResponse = await apiService.getHearts();
          if (heartsResponse?.hearts) {
            setHeartsData(heartsResponse.hearts);
            setUserStats((s) => ({
              ...s,
              hearts: heartsResponse.hearts.current_hearts
            }));
          }
        } catch (error: any) {
          console.error('Failed to load hearts:', error);
          // Don't show toast for hearts as it's not critical
        }

        // Load topics and modules
        try {
          const allTopics = await apiService.getTopics();
          setTopics(allTopics || []);
        } catch (error: any) {
          console.error('Failed to load topics:', error);
          setTopics([]);
          const errorMsg = getErrorMessage(error, 'Failed to load topics. Please refresh the page.');
          toast({
            title: errorMsg.title,
            description: errorMsg.message,
            variant: "destructive",
            duration: 5000
          });
        }

        let allModules: any[] = [];
        try {
          // Use public modules endpoint for learners, admin endpoint requires admin auth
          const modulesResponse = await apiService.getModules(undefined, 1, 100);
          // getModules returns {items: [], pagination: {}} format
          allModules = modulesResponse?.items || [];

          if (allModules.length === 0) {
            console.warn('No modules loaded from backend');
          }
        } catch (error: any) {
          console.error('Failed to load modules:', error);
          // Use empty array as fallback to prevent breaking the UI
          allModules = [];
          const errorMsg = getErrorMessage(error, 'Failed to load modules. Some features may be limited. Please refresh the page.');
          toast({
            title: errorMsg.title,
            description: errorMsg.message,
            variant: "destructive",
            duration: 5000
          });
        }

        // Simple recommendation algorithm by topic preference and basic engagement
        const topicWeights = new Map<string, number>();
        if (Array.isArray(prefs)) {
          prefs.forEach((p: string) => {
            if (p && typeof p === 'string') {
              topicWeights.set(p.toLowerCase(), 1);
            }
          });
        }

        const scored = (allModules || []).map((m: any) => {
          if (!m || typeof m !== 'object') return { ...m, __score: 0 };
          const topicName = (m.topic_name || m.topic || '').toLowerCase();
          const topicMatch = topicWeights.has(topicName) ? 1 : 0;
          const popularity = Number(m.popularity || 0) / 100; // normalized 0..1
          const recency = Number(m.recent_activity || 0) / 100; // normalized 0..1
          const score = topicMatch * 1.0 + popularity * 0.5 + recency * 0.25;
          return { ...m, __score: score };
        }).filter((m: any) => m && typeof m === 'object').sort((a: any, b: any) => (b.__score || 0) - (a.__score || 0));

        setRecommendedModules(scored.slice(0, 10));

        // Load daily goals and recent lessons from API
        try {
          // getDailyGoals already handles standardized response
          const goalsResp = await apiService.getDailyGoals();
          const goals = goalsResp?.goals || goalsResp?.data?.goals || [];
          if (Array.isArray(goals) && goals.length > 0) {
            setDailyGoals(goals);
          }
        } catch (error: any) {
          console.error('Failed to load daily goals:', error);
          // Don't show toast for daily goals as it's not critical
        }

        try {
          // getRecentLessons already handles standardized response
          const recentResp = await apiService.getRecentLessons(5);
          const recent = (recentResp && typeof recentResp === 'object' && 'data' in recentResp)
            ? recentResp.data
            : (Array.isArray(recentResp) ? recentResp : []);
          if (Array.isArray(recent) && recent.length > 0) {
            setRecentLessons(recent);
          }
        } catch (error: any) {
          console.error('Failed to load recent lessons:', error);
          // Don't show toast for recent lessons as it's not critical
        }
      } catch (e: any) {
        console.error('Error loading learn page data:', e);
        const errorMsg = getErrorMessage(e, 'Failed to load page data. Please refresh the page.');
        toast({
          title: errorMsg.title,
          description: errorMsg.message,
          variant: "destructive",
          duration: 5000
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, toast]);

  // Periodic refresh of hearts status to detect regeneration
  useEffect(() => {
    if (!user?.id) return;

    const refreshHearts = async () => {
      try {
        const heartsResponse = await apiService.getHearts();
        // Handle both formats: {hearts: {...}} or {data: {hearts: {...}}}
        const hearts = heartsResponse?.hearts || heartsResponse?.data?.hearts || heartsResponse;
        if (hearts && typeof hearts === 'object') {
          setHeartsData(hearts);
          setUserStats((s) => ({
            ...s,
            hearts: hearts.current_hearts || hearts.currentHearts || 5
          }));
        }
      } catch (error) {
        console.error('Failed to refresh hearts:', error);
      }
    };

    // Refresh every minute to check for regeneration
    const interval = setInterval(refreshHearts, 60000);

    return () => clearInterval(interval);
  }, [user?.id]);

  const handleHeartRefill = async () => {
    try {
      const result = await apiService.refillHearts('premium');

      if (result.refilled) {
        setHeartsData(result.hearts);
        setUserStats((s) => ({
          ...s,
          hearts: result.hearts.current_hearts
        }));

        toast({
          title: "Hearts Refilled! ❤️",
          description: `You now have ${result.hearts.current_hearts} hearts. Keep learning!`
        });
      }
    } catch (error: any) {
      if (error.response?.status === 403) {
        toast({
          title: "Premium Feature",
          description: "Upgrade to Habitual plan for unlimited hearts!",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Refill Info",
          description: "Hearts refill automatically every 1 hour. Or upgrade for unlimited hearts!"
        });
      }
    }
  };

  const goals = useMemo(() => dailyGoals.map(g => ({ ...g })), [dailyGoals]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background relative">
        <Header />
        <LoadingOverlay message="Loading your learning dashboard..." fullScreen />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <ParticleOverlay />
      <Header />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Learn</h1>
              <p className="text-muted-foreground">Master AI prompting with our interactive lessons and skill tree</p>
            </div>

            <TabsList className="grid w-full lg:w-auto grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="skill-tree">Skill Tree</TabsTrigger>
              <TabsTrigger value="practice">Practice</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-8">
            {/* User Stats Dashboard */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-primary flex items-center justify-center gap-1">
                  <Zap className="w-5 h-5" />
                  {user?.total_xp ? user.total_xp.toLocaleString() : xpStats.total_xp.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Total XP</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-foreground flex items-center justify-center gap-1">
                  <Flame className="w-5 h-5 text-orange-500" />
                  {xpStats.streak_days}
                </div>
                <div className="text-sm text-muted-foreground">Day Streak</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-foreground flex items-center justify-center gap-1">
                  <Star className="w-5 h-5 text-yellow-500" />
                  {xpStats.level_info.current.level}
                </div>
                <div className="text-sm text-muted-foreground">Level</div>
              </Card>
              <Card className="p-4 text-center">
                <div className="text-2xl font-bold text-destructive flex items-center justify-center gap-1">
                  {Array.from({ length: heartsData?.max_hearts || 5 }, (_, i) => (
                    <Heart
                      key={i}
                      className={`w-4 h-4 ${i < (heartsData?.current_hearts || userStats.hearts) ? 'fill-destructive text-destructive' : 'text-slate-300'}`}
                    />
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">Hearts</div>
                {heartsData && (
                  <HeartRegenerationTimer
                    timeUntilRefillSeconds={heartsData.time_until_refill_seconds}
                    currentHearts={heartsData.current_hearts}
                    maxHearts={heartsData.max_hearts}
                    unlimitedHearts={heartsData.unlimited_hearts}
                  />
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
              {/* Daily Goals */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Daily Goals
                </h3>
                <div className="space-y-4">
                  {goals.length > 0 ? (
                    goals.map((goal) => {
                      const Icon = goal.icon as any;
                      return (
                        <div key={goal.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {Icon ? <Icon className="w-4 h-4 text-muted-foreground" /> : <Target className="w-4 h-4 text-muted-foreground" />}
                              <span className="text-sm font-medium text-foreground">{goal.title}</span>
                            </div>
                            {goal.completed && (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                          <Progress value={goal.progress} className="h-2" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{goal.current}/{goal.target}</span>
                            <span className="text-primary">{goal.reward}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4">
                      <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No daily goals available</p>
                      <p className="text-xs text-muted-foreground mt-1">Start a lesson to track your progress</p>
                    </div>
                  )}
                </div>
              </Card>



              {/* Streak Tracking */}
              <Card className="p-6 bg-gradient-hero text-white">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Flame className="w-5 h-5" />
                  Streak Status
                </h3>
                <div className="text-center mb-4">
                  <div className="text-4xl font-bold mb-2">{xpStats.streak_days}</div>
                  <div className="text-white/80">days in a row</div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-white/80">
                    <span>Longest streak</span>
                    <span>{userStats.longestStreak || xpStats.streak_days} days</span>
                  </div>

                  <div className="bg-white/10 rounded-lg p-3">
                    <div className="text-sm text-white/80 mb-2">Next milestone:</div>
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      <span className="text-sm font-medium">14 days - Premium trial</span>
                    </div>
                    <Progress value={(xpStats.streak_days / 14) * 100} className="mt-2 bg-white/20" />
                  </div>
                </div>
              </Card>

              {/* Recent Activity */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  {recentLessons.length > 0 ? (
                    recentLessons.map((lesson) => (
                      <div key={lesson.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${lesson.completed ? 'bg-green-100' : 'bg-muted/50'
                          }`}>
                          {lesson.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <Play className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{lesson.title}</div>
                          <div className="text-xs text-muted-foreground">{lesson.module}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{lesson.timeAgo}</span>
                            {lesson.completed && lesson.xpEarned && (
                              <Badge variant="outline" className="text-xs bg-primary/10">
                                +{lesson.xpEarned} XP
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyStates.NoRecentActivity />
                  )}
                </div>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link to="/skill-tree">
                <Card className="p-6 hover:shadow-card transition-all cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Brain className="w-5 h-5 text-primary" />
                    </div>
                    <h4 className="font-semibold text-foreground">Continue Learning</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">Pick up where you left off in your preferred topics</p>
                </Card>
              </Link>

              <Link to="/practice">
                <Card className="p-6 hover:shadow-card transition-all cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-learning/10 rounded-lg flex items-center justify-center">
                      <Target className="w-5 h-5 text-learning" />
                    </div>
                    <h4 className="font-semibold text-foreground">Practice Weak Skills</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">Strengthen your prompt basics with quick exercises</p>
                </Card>
              </Link>

              <Card
                className="p-6 hover:shadow-card transition-all cursor-pointer"
                onClick={handleHeartRefill}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                    <Heart className="w-5 h-5 text-destructive" />
                  </div>
                  <h4 className="font-semibold text-foreground">Refill Hearts</h4>
                </div>
                <p className="text-sm text-muted-foreground">Get more hearts to continue learning without waiting</p>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="skill-tree" className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2">Your Learning Path</h2>
              <p className="text-muted-foreground">
                Progress through our carefully designed skill tree to master AI prompting
              </p>
            </div>
            <SkillTree />
          </TabsContent>

          <TabsContent value="practice" className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2">Practice Mode</h2>
              <p className="text-muted-foreground">
                Strengthen your skills with targeted practice sessions
              </p>
            </div>

            {/* Practice Options */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              <Card className="p-6 hover:shadow-card transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Weak Skills</h3>
                    <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                      Needs practice
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Practice skills that need strengthening based on your recent performance.
                </p>
                <Button variant="neural" className="w-full">
                  Start Practice
                </Button>
              </Card>

              <Card className="p-6 hover:shadow-card transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-learning/10 rounded-lg flex items-center justify-center">
                    <Target className="w-5 h-5 text-learning" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Mixed Review</h3>
                    <Badge className="bg-learning/10 text-learning border-learning/20 text-xs">
                      Recommended
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  A mix of questions from all your completed lessons to maintain knowledge.
                </p>
                <Button variant="outline" className="w-full">
                  Start Review
                </Button>
              </Card>

              <Card className="p-6 hover:shadow-card transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Timed Challenge</h3>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                      +Bonus XP
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Answer questions quickly to earn bonus XP and improve your reaction time.
                </p>
                <Button variant="outline" className="w-full">
                  Start Challenge
                </Button>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Learn;