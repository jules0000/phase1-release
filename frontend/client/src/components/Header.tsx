/*
 * BACKEND REQUIREMENTS - Header.tsx (Navigation Header Component):
 * 
 * This component provides the main navigation header with user profile, notifications,
 * and model selection. It requires real-time user data and notification updates.
 * 
 * Backend Endpoints Required:
 * - GET /api/users/profile - Current user profile data
 *   Response: { id, username, email, full_name, level, total_xp, current_streak_days, avatar_url }
 * 
 * - GET /api/users/notifications?unread=true - Unread notifications count
 *   Response: { unreadCount: number, notifications: Notification[] }
 * 
 * - PUT /api/users/notifications/{id}/read - Mark notification as read
 *   Request: { notificationId: string }
 * 
 * - GET /api/users/settings - User preferences and model settings
 *   Response: { selectedModel: string, preferences: object, theme: string }
 * 
 * - PUT /api/users/settings - Update user preferences
 *   Request: { selectedModel: string, preferences: object }
 * 
 * Database Tables Needed:
 * - users: id, username, email, full_name, level, total_xp, current_streak_days, 
 *          avatar_url, is_admin, admin_type, created_at, updated_at
 * - user_notifications: id, user_id, type, title, message, is_read, created_at
 * - user_settings: user_id, selected_model, preferences, theme, updated_at
 * - user_activity_log: user_id, action, ip_address, user_agent, timestamp
 * 
 * Real-time Features:
 * - Live notification count updates
 * - Real-time user profile changes
 * - Live streak and XP updates
 * - Real-time model preference synchronization
 * - Live achievement notifications
 * 
 * Model Integration:
 * - Model switcher for AI tool preferences
 * - Real-time model availability status
 * - Usage tracking and quota monitoring
 * - Model-specific feature availability
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Bell, ChevronDown, Flame, Trophy, User, LogOut, Menu, Settings, Sparkles, Crown, Search } from "lucide-react";
import RealtimeNotifications from '@/components/RealtimeNotifications';
import { useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import ModelSwitcher from "./ModelSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { QuickNavigation } from "./QuickNavigation";
// Dialog import removed - FeatureGate handles upgrade prompts on the page itself
import { TrialBanner } from "@/components/TrialBanner";

export function Header() {
  const location = useLocation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  // All navigation buttons are clickable - FeatureGate handles access control on the page itself
  // Subscription check removed from Header - only used for display purposes if needed

  const isActive = (path: string) => location.pathname === path;

  const handleNotificationClick = () => {
    toast({
      title: "Notifications",
      description: "You have 3 new achievements!"
    });
  };

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out."
    });
  };

  type NavItem = { path: string; label: string; secondary?: boolean; key: string; featureName: string };
  const navigationItems: NavItem[] = [
    { key: 'learn', path: '/learn', label: 'Learn', featureName: 'learn' },
    { key: 'skill-tree', path: '/skill-tree', label: 'Skill Tree', featureName: 'skill_tree' },
    { key: 'dashboard', path: '/dashboard', label: 'Dashboard', featureName: 'dashboard' },
    { key: 'practice', path: '/practice', label: 'Practice', featureName: 'practice' },
    { key: 'progress', path: '/progress', label: 'Progress', secondary: true, featureName: 'progress' },
    { key: 'challenges', path: '/challenges', label: 'Challenges', secondary: true, featureName: 'challenges' },
    { key: 'certificates', path: '/certificates', label: 'Certificates', secondary: true, featureName: 'certificates' },
  ];


  const [toolAvailability, setToolAvailability] = useState<Record<string, boolean>>({});

  const fetchToolAvailability = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      // Try public endpoint first (for learners), fallback to admin endpoint if user is admin
      const endpoint = user?.is_admin
        ? '/api/admin/settings/tool_availability'
        : '/api/users/public-settings/tool_availability';

      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({} as any));
        setToolAvailability((data?.setting?.value || {}) as Record<string, boolean>);
      }
    } catch { }
  }, [isAuthenticated, user?.is_admin]);

  useEffect(() => {
    // Fetch tool availability for all authenticated users (not just admins)
    fetchToolAvailability();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchToolAvailability, 30000);

    // Also refresh when window regains focus (in case admin made changes)
    const handleFocus = () => fetchToolAvailability();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchToolAvailability]);

  const toolsItems = [
    { path: '/prompt-translator', label: 'Prompt Translator', featureName: 'prompt_translator' },
    { path: '/prompt-engineering-sandbox', label: 'Prompt Sandbox', featureName: 'prompt_sandbox' },
    { path: '/image-prompt-mastery', label: 'Image Prompts', featureName: 'image_prompts' },
    { path: '/multi-model-prompting', label: 'Multi-Model', featureName: 'multi_model' },
    { path: '/code-generation-workshop', label: 'Code Workshop', featureName: 'code_workshop' },
    { path: '/content-creation-pipeline', label: 'Content Pipeline', featureName: 'content_pipeline' },
    { path: '/creative-writing', label: 'Creative Writing', featureName: 'creative_writing' },
  ].filter(item => (toolAvailability[item.path] !== false));

  // All navigation links are clickable - FeatureGate handles access control on the page
  const NavigationLinks = ({ mobile = false, onItemClick, inlineAll = true }: { mobile?: boolean; onItemClick?: () => void; inlineAll?: boolean }) => (
    <>
      {navigationItems
        .filter((item: any) => inlineAll ? true : !item.secondary)
        .map((item) => {
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => onItemClick?.()}
            >
              <Button
                variant="ghost"
                className={`${isActive(item.path) ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"} ${mobile ? "w-full justify-start text-base py-3" : "text-xs md:text-sm px-2 md:px-3 lg:px-3 whitespace-nowrap"}`}
              >
                {item.label}
              </Button>
            </Link>
          );
        })}
    </>
  );

  // If not authenticated, show minimal header for landing page
  if (!isAuthenticated) {
    return (
      <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Neural AI
          </span>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link to="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Features
          </Link>
          <Link to="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link to="#about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            About
          </Link>
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link to="/">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>
    );
  }

  // Authenticated user header
  return (
    <>
      <QuickNavigation />
      <header className="sticky top-0 z-40 h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-2 sm:px-4 md:px-6 lg:px-8 xl:px-12 shadow-sm">
        {/* Mobile Menu */}
        <div className="lg:hidden">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 sm:w-80">
              <nav className="flex flex-col gap-4 mt-8">
                {/* Mobile Model Switcher */}

                <NavigationLinks mobile onItemClick={() => setIsOpen(false)} />

                {/* Mobile Tools Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="w-full justify-start text-base py-3">
                      Tools
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-full">
                    {toolsItems.map((item) => {
                      return (
                        <DropdownMenuItem key={item.path} asChild>
                          <Link
                            to={item.path}
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-2"
                          >
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-2 xl:gap-3 2xl:gap-4 flex-1 min-w-0">
          {/* Auto-fitting nav with overflow to More */}
          {(() => {
            const NavAuto = () => {
              const containerRef = useRef<HTMLDivElement | null>(null);
              const moreRef = useRef<HTMLButtonElement | null>(null);
              const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
              const [visibleKeys, setVisibleKeys] = useState<string[]>(navigationItems.map(i => i.key));
              const [overflowKeys, setOverflowKeys] = useState<string[]>([]);

              const recalc = () => {
                const containerWidth = containerRef.current?.clientWidth || 0;
                if (containerWidth === 0) return;
                const moreWidth = (moreRef.current?.offsetWidth || 64) + 8; // include small gap
                const ordered = navigationItems.slice().sort((a, b) => {
                  const pa = a.secondary ? 1 : 0; const pb = b.secondary ? 1 : 0; return pa - pb;
                });
                let used = 0;
                const nextVisible: string[] = [];
                const nextOverflow: string[] = [];
                for (const it of ordered) {
                  const w = (itemRefs.current[it.key]?.offsetWidth || 0) + 8;
                  if (used + w + moreWidth <= containerWidth) {
                    nextVisible.push(it.key);
                    used += w;
                  } else {
                    nextOverflow.push(it.key);
                  }
                }
                const changedVisible = nextVisible.length !== visibleKeys.length || nextVisible.some((k, i) => k !== visibleKeys[i]);
                const changedOverflow = nextOverflow.length !== overflowKeys.length || nextOverflow.some((k, i) => k !== overflowKeys[i]);
                if (changedVisible) setVisibleKeys(nextVisible);
                if (changedOverflow) setOverflowKeys(nextOverflow);
              };

              useLayoutEffect(() => { recalc(); }, []);
              useEffect(() => {
                const ro = new ResizeObserver(() => recalc());
                if (containerRef.current) ro.observe(containerRef.current);
                const handler = () => recalc();
                window.addEventListener('resize', handler);
                return () => { ro.disconnect(); window.removeEventListener('resize', handler); };
              }, []);

              return (
                <>
                  <div ref={containerRef} className="flex items-center gap-2 flex-1 min-w-0">
                    {navigationItems.map((item) => {
                      return (
                        <Link
                          key={item.key}
                          to={item.path}
                          className={visibleKeys.includes(item.key) ? '' : 'hidden'}
                        >
                          <Button
                            ref={(el) => { itemRefs.current[item.key] = el; }}
                            variant="ghost"
                            className={`${isActive(item.path) ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'} text-xs md:text-sm px-2 md:px-3 whitespace-nowrap`}
                          >
                            {item.label}
                          </Button>
                        </Link>
                      );
                    })}

                    {/* Tools Dropdown - Always visible and clickable */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="text-xs md:text-sm px-2 md:px-3 whitespace-nowrap">
                          Tools
                          <ChevronDown className="w-3 h-3 lg:w-4 lg:h-4 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        {toolsItems.map((item) => {
                          return (
                            <DropdownMenuItem key={item.path} asChild>
                              <Link to={item.path} className="flex items-center gap-2">
                                {item.label}
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button ref={moreRef} variant="ghost" className={`gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-3 ${overflowKeys.length === 0 ? 'hidden' : ''}`}>
                        More
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {overflowKeys.map((key) => {
                        const it = navigationItems.find(i => i.key === key)!;
                        return (
                          <DropdownMenuItem key={it.key} asChild>
                            <Link to={it.path} className="flex items-center gap-2">{it.label}</Link>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              );
            };
            return <NavAuto />;
          })()}
        </nav>

        {/* User Stats & Profile */}
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 lg:gap-4 xl:gap-6 overflow-x-auto no-scrollbar flex-shrink-0">
          {/* Model Switcher - Hidden on small screens */}
          <div className="hidden md:block">

          </div>

          {/* Streak - Hidden on small screens */}
          <Link 
            to="/profile" 
            className="hidden 2xl:block"
            aria-label={`Current streak: ${user?.current_streak_days || 0} days`}
          >
            <div 
              className="flex items-center gap-2 bg-gradient-card rounded-lg px-2 lg:px-3 xl:px-4 py-1.5 border border-border/50 hover:shadow-card transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              tabIndex={0}
              role="button"
            >
              <Flame className="w-4 h-4 text-orange-500" aria-hidden="true" />
              <span className="text-xs lg:text-sm font-semibold text-foreground">
                {user?.current_streak_days || 0} day streak
              </span>
            </div>
          </Link>

          {/* XP Points - Hidden on small screens */}
          <Link 
            to="/profile" 
            className="hidden 2xl:block"
            aria-label={`Total XP: ${user?.total_xp?.toLocaleString() || 0}`}
          >
            <div 
              className="flex items-center gap-2 bg-gradient-card rounded-lg px-2 lg:px-3 xl:px-4 py-1.5 border border-border/50 hover:shadow-card transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              tabIndex={0}
              role="button"
            >
              <Trophy className="w-4 h-4 text-learning" aria-hidden="true" />
              <span className="text-xs lg:text-sm font-semibold text-foreground">
                {user?.total_xp?.toLocaleString() || 0} XP
              </span>
            </div>
          </Link>

          {/* Quick Search Button */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            aria-label="Open search (Ctrl+K or Cmd+K)"
            title="Search (Ctrl+K or Cmd+K)"
            onClick={() => {
              // Trigger QuickNavigation via keyboard event
              const event = new KeyboardEvent('keydown', {
                key: 'k',
                ctrlKey: true,
                bubbles: true,
              });
              window.dispatchEvent(event);
            }}
            aria-label="Open quick navigation (CMD+K)"
          >
            <Search className="w-4 h-4" />
          </Button>

          {/* Real-time Notifications */}
          <RealtimeNotifications />

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 lg:gap-3 bg-gradient-card rounded-lg px-2 lg:px-3 xl:px-4 py-1.5 border border-border/50 hover:shadow-card transition-all cursor-pointer min-w-0">
                <Avatar className="w-7 h-7 lg:w-8 lg:h-8 xl:w-9 xl:h-9" key={`${user?.id}-${user?.avatar_url || 'no-avatar'}`}>
                  {user?.avatar_url && (
                    <AvatarImage
                      src={user.avatar_url}
                      alt={user?.full_name || user?.username || 'User'}
                      className="object-cover"
                      onError={(e) => {
                        // Hide image on error, fallback will show
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <AvatarFallback>
                    {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || user?.username?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden 2xl:block truncate">
                  <p className="text-xs lg:text-sm font-medium text-foreground truncate max-w-[140px]">
                    {user?.full_name || user?.username || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Level {user?.level || 1}
                  </p>
                </div>
                <ChevronDown className="w-3 h-3 lg:w-4 lg:h-4 text-muted-foreground hidden sm:block" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 lg:w-64">
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isAuthenticated && user?.is_admin === true && (
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 text-destructive">
                <LogOut className="w-4 h-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </header>
      <TrialBanner />
    </>
  );
}