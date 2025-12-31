import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Sidebar } from "@/components/Sidebar";
import { ModuleGrid } from "@/components/ModuleGrid";
import { LearningObjectives } from "@/components/LearningObjectives";
import { ParticleOverlay } from "@/components/ParticleOverlay";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Menu, ChevronDown, Target, Upload, MessageSquare, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { computeProgressByTopic, getCompletedLessons } from "@/lib/utils";
import apiService from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingOverlay, SkeletonCard, SkeletonList } from "@/components/LoadingStates";
import { getErrorMessage } from "@/utils/errorMessages";

/* 
 * BACKEND DATA REQUIREMENTS - Dashboard Page:
 * 
 * This page orchestrates data from multiple components, requiring:
 * 
 * 1. USER_DASHBOARD_STATE table:
 *    - user_id (FK to users table)
 *    - selected_topic_id (FK to topics table)
 *    - dashboard_preferences (JSON object for UI state)
 *    - last_visited (timestamp)
 *    - sidebar_collapsed (boolean)
 *    - objectives_expanded (boolean)
 * 
 * 2. Combined data requirements from child components:
 *    - Header: User profile, notifications, streaks
 *    - Sidebar: Topics with progress
 *    - ModuleGrid: Modules filtered by selected topic
 *    - LearningObjectives: Current objectives, skills, daily challenges
 * 
 * API Endpoints needed:
 * - GET /api/user/dashboard - fetch complete dashboard data for a user
 * - PUT /api/user/dashboard/state - save dashboard UI state preferences
 * - GET /api/user/dashboard/summary - fetch summary stats for dashboard
 * 
 * Real-time updates may be needed for:
 * - Notification counts
 * - Progress updates from other sessions
 * - Daily challenge status changes
 */

const Dashboard = () => {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isObjectivesOpen, setIsObjectivesOpen] = useState(false);
  const [topics, setTopics] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [userProgress, setUserProgress] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Load dashboard data from API
  useEffect(() => {
    // Only load data if user is authenticated
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated]);

  const loadDashboardData = async () => {
    let timeoutId: NodeJS.Timeout | null = null;
    let loadedTopics: any[] = [];

    try {
      setLoading(true);

      // Fail-safe: auto-hide loader after 3 seconds
      timeoutId = setTimeout(() => {
        console.log('Dashboard: Loading timeout - hiding loader');
        setLoading(false);
      }, 3000);

      // Use aggregated dashboard data endpoint for better performance
      console.log('Dashboard: Loading aggregated dashboard data...');
      
      try {
        const dashboardData = await apiService.getDashboardData();
        
        // Handle APIResponse wrapper format
        const data = dashboardData?.data || dashboardData;
        
        // Extract topics from response
        if (data?.topics && Array.isArray(data.topics)) {
          loadedTopics = data.topics;
          setTopics(loadedTopics);
          console.log('Dashboard: Topics loaded successfully', loadedTopics.length);
        } else {
          console.warn('Dashboard: No topics in response, falling back to individual API calls');
          // Fallback to individual API call
          try {
            const topicsData = await apiService.getTopics();
            loadedTopics = Array.isArray(topicsData) ? topicsData : [];
            setTopics(loadedTopics);
          } catch (fallbackError: any) {
            console.error('Dashboard: Failed to load topics (fallback):', fallbackError);
            setTopics([]);
          }
        }

        // Extract user progress from response
        if (data?.user_progress || data?.summary) {
          // Map to expected format (can be user_progress object or summary)
          const progressData = data.user_progress || data.summary || {};
          setUserProgress(progressData);
          console.log('Dashboard: Progress loaded successfully');
        } else {
          console.warn('Dashboard: No user_progress in response, falling back to individual API call');
          // Fallback to individual API call
          try {
            const progressData = await apiService.getProgressSummary();
            setUserProgress(progressData);
          } catch (fallbackError: any) {
            console.error('Dashboard: Failed to load progress (fallback):', fallbackError);
            setUserProgress(null);
          }
        }

        // Handle topic selection
        const urlParams = new URLSearchParams(location.search);
        const topicFromUrl = urlParams.get('topic');

        if (topicFromUrl) {
          setSelectedTopic(topicFromUrl);
          // Try to load modules from aggregated data first
          const selectedTopicData = loadedTopics.find(t => String(t.id) === topicFromUrl);
          if (selectedTopicData?.modules && Array.isArray(selectedTopicData.modules)) {
            setModules(selectedTopicData.modules);
            console.log(`Dashboard: Loaded ${selectedTopicData.modules.length} modules from aggregated data`);
          } else {
            // Fallback to individual API call
            await loadModulesForTopic(topicFromUrl);
          }
        } else {
          // Auto-select first topic if available
          const firstTopic = Array.isArray(loadedTopics) && loadedTopics.length > 0 ? loadedTopics[0] : null;
          if (firstTopic && firstTopic.id) {
            const topicId = firstTopic.id?.toString() || String(firstTopic.id);
            setSelectedTopic(topicId);
            // Try to load modules from aggregated data first
            if (firstTopic.modules && Array.isArray(firstTopic.modules)) {
              setModules(firstTopic.modules);
              console.log(`Dashboard: Loaded ${firstTopic.modules.length} modules from aggregated data`);
            } else {
              // Fallback to individual API call
              await loadModulesForTopic(topicId);
            }
          } else if (loadedTopics.length === 0) {
            // No topics available, set empty modules
            setModules([]);
          }
        }

      } catch (error: any) {
        console.error('Dashboard: Failed to load aggregated dashboard data, falling back to individual calls:', error);
        
        // Fallback to individual API calls if aggregated endpoint fails
        try {
          const topicsData = await apiService.getTopics();
          loadedTopics = Array.isArray(topicsData) ? topicsData : [];
          setTopics(loadedTopics);
          console.log('Dashboard: Topics loaded successfully (fallback)', loadedTopics.length);
        } catch (topicsError: any) {
          console.error('Dashboard: Failed to load topics:', topicsError);
          setTopics([]);
          const errorMsg = getErrorMessage(topicsError, 'Failed to load topics. Please refresh the page.');
          toast({
            title: errorMsg.title,
            description: errorMsg.message,
            variant: "destructive",
            duration: 5000
          });
        }

        try {
          const progressData = await apiService.getProgressSummary();
          setUserProgress(progressData);
          console.log('Dashboard: Progress loaded successfully (fallback)');
        } catch (progressError: any) {
          console.error('Dashboard: Failed to load progress:', progressError);
          setUserProgress(null);
          const errorMsg = getErrorMessage(progressError, 'Failed to load progress. Your progress will sync when available.');
          toast({
            title: errorMsg.title,
            description: errorMsg.message,
            variant: "destructive",
            duration: 5000
          });
        }

        // Handle topic selection for fallback scenario
        const urlParams = new URLSearchParams(location.search);
        const topicFromUrl = urlParams.get('topic');

        if (topicFromUrl) {
          setSelectedTopic(topicFromUrl);
          await loadModulesForTopic(topicFromUrl);
        } else {
          const firstTopic = Array.isArray(loadedTopics) && loadedTopics.length > 0 ? loadedTopics[0] : null;
          if (firstTopic && firstTopic.id) {
            const topicId = firstTopic.id?.toString() || String(firstTopic.id);
            setSelectedTopic(topicId);
            await loadModulesForTopic(topicId);
          } else if (loadedTopics.length === 0) {
            setModules([]);
          }
        }
      }

    } catch (error: any) {
      console.error('Dashboard: Error loading dashboard data:', error);
      const errorMsg = getErrorMessage(error, "Some dashboard data failed to load");
      toast({
        title: errorMsg.title,
        description: `${errorMsg.message}. You can still continue learning.`,
        variant: "destructive",
        duration: 5000
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
      console.log('Dashboard: Loading completed');
    }
  };

  const loadModulesForTopic = async (topicId: string) => {
    try {
      console.log(`Dashboard: Loading modules for topic ${topicId}`);
      const modulesData = await apiService.getModules(topicId);
      // getModules returns {items: [], pagination: {}} format
      const items = modulesData?.items || [];
      setModules(items);
      console.log(`Dashboard: Loaded ${items.length} modules for topic ${topicId}`);
    } catch (error: any) {
      console.error(`Dashboard: Error loading modules for topic ${topicId}:`, error);
      setModules([]);
      const errorMessage = error?.message || error?.error || 'Failed to load modules';
      toast({
        title: "Error Loading Modules",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <ParticleOverlay />
      <Header />
      <div className="flex-1 flex relative z-10 overflow-hidden">
        {/* Mobile Topic Selector - Bottom Sheet */}
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0">
            <Sidebar
              selectedTopic={selectedTopic}
              onTopicSelect={async (topicId) => {
                setSelectedTopic(topicId);
                await loadModulesForTopic(topicId);
                setIsSidebarOpen(false); // Close on mobile
              }}
            />
          </SheetContent>
        </Sheet>

        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar
            selectedTopic={selectedTopic}
            onTopicSelect={async (topicId) => {
              setSelectedTopic(topicId);
              await loadModulesForTopic(topicId);
            }}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Topic Selector */}
          <div className="lg:hidden p-4 border-b border-border/50 bg-card/50 backdrop-blur-sm">
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <Menu className="w-4 h-4 mr-2" />
                  Select Learning Topic
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <div className="mt-6">
                  <Sidebar
                    selectedTopic={selectedTopic}
                    onTopicSelect={async (topic) => {
                      setSelectedTopic(topic);
                      await loadModulesForTopic(topic);
                      setIsSidebarOpen(false);
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
            {/* Module Grid */}
            <div className="flex-1 min-w-0 relative">
              {loading ? (
                <div className="p-6 space-y-4">
                  <SkeletonCard lines={3} showImage={false} />
                  <SkeletonCard lines={3} showImage={false} />
                  <SkeletonCard lines={3} showImage={false} />
                </div>
              ) : (
                <ModuleGrid topicId={selectedTopic} />
              )}
            </div>

            {/* Learning Objectives - Desktop */}
            <div className="hidden xl:block w-80">
              <LearningObjectives />
            </div>
          </div>

          {/* Quick Access Tools - Mobile */}
          <div className="xl:hidden border-t border-border/50 bg-card/50 backdrop-blur-sm p-4">
            <h3 className="text-lg font-semibold text-foreground mb-3">Quick Access</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/prompt-translator">
                <Button variant="outline" className="w-full justify-start text-sm">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Prompt Translator
                </Button>
              </Link>
              <Link to="/practice">
                <Button variant="outline" className="w-full justify-start text-sm">
                  <Target className="w-4 h-4 mr-2" />
                  Practice
                </Button>
              </Link>
              <Link to="/challenges">
                <Button variant="outline" className="w-full justify-start text-sm">
                  <Trophy className="w-4 h-4 mr-2" />
                  Challenges
                </Button>
              </Link>
            </div>
          </div>

          {/* Learning Objectives - Mobile Collapsible */}
          <div className="xl:hidden border-t border-border/50 bg-card/50 backdrop-blur-sm">
            <Collapsible open={isObjectivesOpen} onOpenChange={setIsObjectivesOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-4 h-auto">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span className="font-medium">Learning Objectives</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isObjectivesOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="max-h-80 overflow-y-auto">
                <LearningObjectives />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Dashboard;