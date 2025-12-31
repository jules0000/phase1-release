/*
 * BACKEND REQUIREMENTS - Profile.tsx (User Profile and Statistics Page):
 * 
 * This component displays comprehensive user profile information, achievements,
 * progress statistics, and recent activity with real-time updates.
 * 
 * Backend Endpoints Required:
 * - GET /api/users/profile - Fetch detailed user profile information
 *   Response: { id, username, email, full_name, avatar_url, level, total_xp, 
 *              current_streak_days, created_at, last_login, bio, location }
 * 
 * - GET /api/users/progress - Get comprehensive user progress data
 *   Response: { overallProgress: number, completedModules: number, totalModules: number, 
 *              completedLessons: number, totalLessons: number, averageScore: number }
 * 
 * - GET /api/users/xp-transactions - Get XP transaction history
 *   Response: { transactions: XPTransaction[], pagination: PaginationInfo }
 * 
 * - GET /api/users/achievements - Get user achievements and badges
 *   Response: { achievements: Achievement[], recentUnlocks: Achievement[], 
 *              totalBadges: number, nextMilestone: Milestone }
 * 
 * - GET /api/users/activity - Get recent user activity
 *   Response: { activities: Activity[], totalActivities: number, pagination: PaginationInfo }
 * 
 * - GET /api/users/statistics - Get detailed user statistics
 *   Response: { learningStats: LearningStats, performanceStats: PerformanceStats, 
 *              timeStats: TimeStats, skillStats: SkillStats }
 * 
 * - GET /api/users/leaderboard-position - Get user's position in leaderboard
 *   Response: { rank: number, totalUsers: number, percentile: number, 
 *              nearbyUsers: LeaderboardEntry[] }
 * 
 * Database Tables Needed:
 * - users: id, username, email, full_name, avatar_url, level, total_xp, 
 *          current_streak_days, created_at, last_login, bio, location
 * - user_progress: user_id, overall_progress, completed_modules, total_modules, 
 *                  completed_lessons, total_lessons, average_score
 * - xp_transactions: id, user_id, source, amount, description, timestamp, metadata
 * - user_achievements: id, user_id, achievement_type, earned_date, description, 
 *                     badge_url, xp_reward, progress_percentage
 * - user_activity_log: user_id, action, timestamp, metadata, xp_earned, description
 * - user_statistics: user_id, total_learning_time, average_session_duration, 
 *                   favorite_topics, skill_levels, performance_metrics
 * - leaderboard: user_id, total_xp, level, rank, last_updated
 * 
 * Real-time Features:
 * - Live profile updates and changes
 * - Real-time XP and level updates
 * - Live achievement notifications
 * - Real-time progress synchronization
 * - Live leaderboard position updates
 * - Real-time activity feed updates
 * 
 * Profile Features:
 * - Personal information and avatar
 * - Learning progress and statistics
 * - Achievement showcase
 * - Recent activity timeline
 * - Skill development tracking
 * - Leaderboard position
 * - Learning streaks and milestones
 */

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CalendarDays, Trophy, Target, Flame, BookOpen, Award, Star, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useXPStats } from "@/lib/xpTracker";
import { XPDisplay, AchievementCard, XPStatsGrid } from "@/components/XPComponents";
import { useState, useEffect, useRef } from "react";
import apiService from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const Profile = () => {
  const { user } = useAuth();
  const { stats, config } = useXPStats();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // State for real data
  const [userProfile, setUserProfile] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [userProgress, setUserProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load real profile data
  useEffect(() => {
    loadProfileData();
  }, []);

  // Refresh profile data when page becomes visible (e.g., returning from another page)
  useEffect(() => {
    const handleFocus = () => {
      loadProfileData();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadProfileData();
      }
    };

    const handlePageShow = () => {
      loadProfileData();
    };

    const handleStorageChange = (e: StorageEvent) => {
      // Refresh when XP or progress changes in another tab
      if (e.key === 'neural_completed_lessons' || e.key === 'neural_xp' || e.key === 'neural_progress') {
        loadProfileData();
      }
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
  }, []);

  const loadProfileData = async () => {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      setLoading(true);
      // Fail-safe: auto-hide loader after 5s
      timeoutId = setTimeout(() => setLoading(false), 2000);

      // Load user profile
      const profile = await apiService.getUserProfile();
      setUserProfile(profile);

      // Load user progress
      const progress = await apiService.getUserProgress();
      setUserProgress(progress);

      // Load XP transactions for recent activity
      const xpData = await apiService.getXPTransactions(1, 10);
      // getXPTransactions returns paginated format: { data: { items: [...] } } or direct array
      let transactions: any[] = [];
      if (Array.isArray(xpData)) {
        transactions = xpData;
      } else if (xpData && typeof xpData === 'object' && 'items' in xpData && Array.isArray((xpData as any).items)) {
        transactions = (xpData as any).items;
      } else if (xpData && typeof xpData === 'object' && 'data' in xpData) {
        const data = (xpData as any).data;
        if (Array.isArray(data)) {
          transactions = data;
        } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
          transactions = data.items;
        } else if (data && typeof data === 'object' && 'transactions' in data && Array.isArray(data.transactions)) {
          transactions = data.transactions;
        }
      } else if (xpData && typeof xpData === 'object' && 'transactions' in xpData && Array.isArray((xpData as any).transactions)) {
        transactions = (xpData as any).transactions;
      }
      setRecentActivity(transactions.map((tx: any) => ({
        action: tx.description || tx.source || 'XP earned',
        time: new Date(tx.timestamp || tx.created_at || Date.now()).toLocaleString(),
        xp: tx.amount || 0
      })));

    } catch (error) {
      console.error('Error loading profile data:', error);
      toast({
        title: "Error",
        description: "Failed to load profile data",
        variant: "destructive",
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const defaultAvatars = [
    '/avatars/avatar1.png',
    '/avatars/avatar2.png',
    '/avatars/avatar3.png',
    '/avatars/avatar4.png',
    '/avatars/avatar5.png',
  ];

  const handleChooseDefaultAvatar = async (url: string) => {
    try {
      const updated = await apiService.updateUserProfile({ avatar_url: url });
      setUserProfile(updated);
      toast({ title: 'Profile updated', description: 'Avatar changed successfully.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update avatar.', variant: 'destructive' });
    }
  };

  const handleUploadAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await apiService.uploadAvatarFromFile(file);
      const updated = await apiService.updateUserProfile({ avatar_url: dataUrl });
      setUserProfile(updated);
      toast({ title: 'Profile updated', description: 'Avatar uploaded successfully.' });
    } catch (err) {
      toast({ title: 'Upload failed', description: 'Please try a different image.', variant: 'destructive' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Get user's initials for avatar
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Profile Header */}
        <Card className="p-8 mb-8 bg-gradient-hero text-white">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Profile picture beside name */}
            <Avatar className="w-20 h-20 border-4 border-white/20">
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt={user?.full_name || 'User'} className="w-full h-full rounded-full object-cover" />
              ) : null}
              <AvatarFallback className="text-2xl">
                {user ? getInitials(user.full_name) : "U"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">
                {user ? user.full_name : "User"}
              </h1>
              <p className="text-white/80 mb-4">AI Prompt Engineering Student</p>

              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  <span>Joined {userProfile?.created_at || user?.created_at
                    ? new Date(userProfile?.created_at || user?.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : '—'
                  }</span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  <span>Level {stats.level_info.current.level} {stats.level_info.current.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4" />
                  <span>{stats.streak_days}-day streak</span>
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold mb-1">{user?.total_xp ? user.total_xp.toLocaleString() : stats.total_xp.toLocaleString()}</div>
              <div className="text-white/80 text-sm">Total XP</div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* XP Stats Grid */}
            <XPStatsGrid stats={stats} config={config} />

            {/* Learning Progress */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Learning Progress
              </h2>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-foreground">Overall Progress</span>
                    <span className="text-sm text-muted-foreground">
                      Level {stats.level_info.current.level} ({stats.level_info.current.title})
                    </span>
                  </div>
                  <Progress value={stats.level_info.progress_percent} className="mb-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{stats.total_xp.toLocaleString()} XP</span>
                    <span>{stats.level_info.xp_to_next} XP to next level</span>
                  </div>
                </div>

                {stats.level_info.next && (
                  <div className="p-4 bg-gradient-card rounded-lg border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Star className="w-4 h-4 text-accent" />
                      <span className="font-medium text-foreground">Next Level: {stats.level_info.next.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Complete {stats.level_info.xp_to_next} more XP to reach Level {stats.level_info.next.level}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Achievements */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Achievements
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {stats.achievements.map((achievement) => (
                  <AchievementCard key={achievement.id} achievement={achievement} />
                ))}
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            {/* XP Display */}
            <XPDisplay showDetails={true} />

            {/* Profile picture settings moved to Settings page - removed */}

            {/* Quick Stats - real data */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Quick Stats</h3>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Modules Completed</span>
                  <span className="font-semibold text-foreground">{(userProgress?.completed_modules ?? 0)}/{(userProgress?.total_modules ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lessons Finished</span>
                  <span className="font-semibold text-foreground">{(userProgress?.completed_lessons ?? 0)}/{(userProgress?.total_lessons ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quizzes Passed</span>
                  <span className="font-semibold text-foreground">{/* if available */}—</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg. Quiz Score</span>
                  <span className="font-semibold text-foreground">{(userProgress?.average_score ?? 0)}%</span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-1">{(userProgress?.overall_progress ?? 0)}%</div>
                <div className="text-sm text-muted-foreground">Overall Progress</div>
              </div>
            </Card>

            {/* Recent Activity */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>

              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{activity.action}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{activity.time}</span>
                        <Badge variant="outline" className="text-xs">+{activity.xp} XP</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Link to="/learn" className="block">
                <Button variant="neural" className="w-full">
                  Continue Learning
                </Button>
              </Link>
              <Link to="/progress" className="block">
                <Button variant="outline" className="w-full">
                  View Certificates
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;