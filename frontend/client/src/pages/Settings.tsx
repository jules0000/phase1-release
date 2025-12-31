/*
 * BACKEND REQUIREMENTS - Settings.tsx (User Settings and Preferences):
 * 
 * This component manages user settings, preferences, and profile configuration
 * with real-time synchronization across devices.
 * 
 * Backend Endpoints Required:
 * - GET /api/users/settings - Fetch user settings and preferences
 *   Response: { notifications: NotificationSettings, preferences: UserPreferences, 
 *              profile: UserProfile, theme: string }
 * 
 * - PUT /api/users/settings - Update user settings
 *   Request: { notifications: NotificationSettings, preferences: UserPreferences, theme: string }
 *   Response: { success: boolean, updatedSettings: UserSettings }
 * 
 * - GET /api/users/profile - Fetch user profile information
 *   Response: { id, username, email, full_name, avatar_url, created_at, last_login }
 * 
 * - PUT /api/users/profile - Update user profile
 *   Request: { full_name: string, username: string, avatar_url?: string }
 *   Response: { success: boolean, updatedProfile: UserProfile }
 * 
 * - PUT /api/users/notification-preferences - Update notification preferences
 *   Request: { lessonReminders: boolean, achievementAlerts: boolean, 
 *              weeklyProgress: boolean, emailUpdates: boolean }
 * 
 * - GET /api/users/account-status - Get account status and subscription info
 *   Response: { accountType: string, subscriptionStatus: string, expiresAt: string }
 * 
 * - POST /api/users/change-password - Change user password
 *   Request: { currentPassword: string, newPassword: string }
 *   Response: { success: boolean, message: string }
 * 
 * Database Tables Needed:
 * - user_settings: user_id, theme, language, timezone, difficulty_preference, 
 *                  ai_model_preference, updated_at
 * - user_notification_preferences: user_id, lesson_reminders, achievement_alerts, 
 *                                 weekly_progress, email_updates, push_notifications
 * - user_profiles: user_id, full_name, username, avatar_url, bio, location, 
 *                  website, social_links, updated_at
 * - user_accounts: user_id, account_type, subscription_status, expires_at, 
 *                  payment_method, billing_address
 * - user_activity_log: user_id, action, timestamp, ip_address, user_agent
 * 
 * Real-time Features:
 * - Live settings synchronization across devices
 * - Real-time notification preference updates
 * - Live theme changes across sessions
 * - Real-time profile updates
 * - Live account status monitoring
 * - Real-time security event notifications
 * 
 * Settings Categories:
 * - Profile: Personal information, avatar, bio
 * - Notifications: Email, push, in-app notifications
 * - Preferences: Theme, language, timezone, AI model
 * - Security: Password, two-factor authentication, login history
 * - Account: Subscription, billing, data export
 */

import React, { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { User, Bell, Shield, Globe, Palette, Brain, Volume2, Mail, Moon, Sun, Monitor, Settings as SettingsIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import apiService from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const Settings = () => {
  const { toast } = useToast();
  const { theme, setTheme, actualTheme } = useTheme();
  const { user } = useAuth();
  
  const isDark = actualTheme === 'dark';
  
  // Helper function to get theme-aware colors
  const getColors = () => {
    if (isDark) {
      return {
        bg: 'hsl(0 0% 12%)',
        card: 'hsl(0 0% 18%)',
        border: 'hsl(14 40% 40%)',
        text: 'hsl(14 20% 85%)',
        textMuted: 'hsl(0 0% 70%)',
        primary: 'hsl(14 95% 65%)',
        muted: 'hsl(0 0% 25%)',
        shadow: 'hsl(14 95% 65%)',
      };
    }
    return {
      bg: 'hsl(0 0% 98%)',
      card: 'hsl(0 0% 100%)',
      border: 'hsl(0 0% 15%)',
      text: 'hsl(0 0% 15%)',
      textMuted: 'hsl(0 0% 40%)',
      primary: 'hsl(14 100% 60%)',
      muted: 'hsl(14 25% 92%)',
      shadow: 'hsl(0 0% 15%)',
    };
  };

  const [notifications, setNotifications] = useState({
    lessonReminders: true,
    achievementAlerts: true,
    weeklyProgress: true,
    emailUpdates: false
  });

  const [preferences, setPreferences] = useState({
    language: "english",
    timezone: "utc-5",
    difficulty: "adaptive",
    aiModel: "gpt-4"
  });

  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showEmailChangeDialog, setShowEmailChangeDialog] = useState(false);
  const [showUsernameChangeDialog, setShowUsernameChangeDialog] = useState(false);

  const loadUserSettings = async () => {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      setLoading(true);
      // Fail-safe: auto-hide loader after 5s
      timeoutId = setTimeout(() => setLoading(false), 2000);

      // Load user profile
      const profile = await apiService.getUserProfile();
      setUserProfile(profile);

      // Load user settings
      const settings = await apiService.getUserSettings();
      if (settings.notifications) {
        setNotifications(settings.notifications);
      }
      if (settings.preferences) {
        setPreferences(settings.preferences);
      }

    } catch (error) {
      console.error('Error loading user settings:', error);
      toast({
        title: "Error",
        description: "Failed to load user settings",
        variant: "destructive",
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveProfile = async () => {
    try {
      const updated = await apiService.updateUserProfile({
        full_name: userProfile.full_name,
        username: userProfile.username,
        avatar_url: userProfile.avatar_url,
      });
      setUserProfile(updated);
      toast({
        title: "Profile Updated",
        description: "Your profile information has been saved successfully."
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: "Failed to save profile",
        variant: "destructive",
      });
    }
  };

  const defaultAvatars = ['/avatars/avatar1.png', '/avatars/avatar2.png', '/avatars/avatar3.png', '/avatars/avatar4.png', '/avatars/avatar5.png'];
  const handleUploadAvatarClick = () => fileInputRef.current?.click();
  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await apiService.uploadAvatarFromFile(file);
      const updated = await apiService.updateUserProfile({ avatar_url: dataUrl });
      setUserProfile(updated);
      toast({ title: 'Profile updated', description: 'Avatar uploaded successfully.' });
    } catch {
      toast({ title: 'Upload failed', description: 'Please try a different image.', variant: 'destructive' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const chooseDefaultAvatar = async (url: string) => {
    try {
      const updated = await apiService.updateUserProfile({ avatar_url: url });
      setUserProfile(updated);
      toast({ title: 'Profile updated', description: 'Avatar changed successfully.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update avatar.', variant: 'destructive' });
    }
  };

  const handleSaveSettings = async () => {
    try {
      await apiService.updateUserSettings({
        preferences,
        notifications
      });
      toast({
        title: "Settings Saved",
        description: "All your preferences have been updated successfully."
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
  };

  const handleUpgrade = () => {
    toast({
      title: "Upgrade Coming Soon",
      description: "Premium features will be available soon!"
    });
  };

  const handleResetDefaults = () => {
    setNotifications({
      lessonReminders: true,
      achievementAlerts: true,
      weeklyProgress: true,
      emailUpdates: false
    });
    setPreferences({
      language: "english",
      timezone: "utc-5",
      difficulty: "adaptive",
      aiModel: "gpt-4"
    });
    toast({
      title: "Settings Reset",
      description: "All settings have been reset to default values."
    });
  };

  // Get theme-aware colors
  const colors = getColors();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <Header />

      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 relative">
        {/* Neobrutalism Background Pattern */}
        <div className={`absolute inset-0 pointer-events-none ${isDark ? 'opacity-20' : 'opacity-30'}`}>
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(
                45deg,
                hsl(var(--primary) / ${isDark ? '0.08' : '0.05'}),
                hsl(var(--primary) / ${isDark ? '0.08' : '0.05'}) 20px,
                transparent 20px,
                transparent 40px
              )`
            }}
          />
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(hsl(var(--border) / ${isDark ? '0.1' : '0.03'}) 1px, transparent 1px),
                linear-gradient(90deg, hsl(var(--border) / ${isDark ? '0.1' : '0.03'}) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }}
          />
        </div>

        {/* Header Section */}
        <div className="relative z-10 mb-8">
          <div 
            className="border-8 border-foreground bg-primary p-6 inline-block mb-4"
            style={{ 
              borderColor: colors.border,
              boxShadow: `8px 8px 0px 0px ${colors.border}`
            }}
          >
            <div className="flex items-center gap-3">
              <SettingsIcon className="w-8 h-8 text-primary-foreground" />
              <h1 
                className="text-5xl font-black uppercase tracking-tighter text-primary-foreground"
                style={{ letterSpacing: '-0.02em' }}
              >
                SETTINGS
              </h1>
            </div>
          </div>
          <div 
            className="border-4 border-foreground bg-card px-6 py-2 inline-block"
            style={{ 
              borderColor: colors.border,
              backgroundColor: colors.card,
              boxShadow: `4px 4px 0px 0px ${colors.border}`
            }}
          >
            <p className="text-lg font-bold uppercase tracking-wide" style={{ color: colors.text }}>
            Customize your Neural learning experience
          </p>
          </div>
        </div>

        <div className="space-y-8 relative z-10">
          {/* Profile Settings */}
          <div 
            className="border-8 border-foreground bg-card p-8"
            style={{ 
              borderColor: colors.border,
              backgroundColor: colors.card,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block mb-6"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="flex items-center gap-3">
                <User className="w-6 h-6 text-primary-foreground" />
                <h2 className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                  Profile Information
                </h2>
              </div>
            </div>

            {/* Avatar Section - Prominent Design */}
            <div className="mb-8">
              <div 
                className="border-8 border-foreground bg-card p-8"
                style={{ 
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  boxShadow: `8px 8px 0px 0px ${colors.primary}`
                }}
              >
                <div 
                  className="border-4 border-foreground bg-primary p-3 inline-block mb-6"
                  style={{ 
                    borderColor: colors.border,
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                  <h3 className="text-xl font-black uppercase tracking-wide text-primary-foreground">
                    Profile Avatar
                  </h3>
                </div>

                {/* Large Avatar Preview */}
                <div className="flex flex-col items-center mb-8">
                  <div 
                    className="w-40 h-40 border-8 border-foreground overflow-hidden mb-4"
                    style={{ 
                      borderColor: colors.border,
                      boxShadow: `8px 8px 0px 0px ${colors.border}`
                    }}
                  >
                    {userProfile?.avatar_url ? (
                      <img src={userProfile.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-4xl" style={{ backgroundColor: colors.muted, color: colors.text }}>
                        {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div 
                    className="border-2 border-foreground bg-card px-4 py-2"
                    style={{ 
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      boxShadow: `2px 2px 0px 0px ${colors.border}`
                    }}
                  >
                    <p className="text-sm font-black uppercase tracking-wide" style={{ color: colors.text }}>
                      {userProfile?.full_name || user?.full_name || 'Your Name'}
                    </p>
                  </div>
                </div>

                {/* Upload Button */}
                <div className="mb-8">
                  <div className="flex justify-center">
                    <button
                      onClick={handleUploadAvatarClick}
                      className="h-14 px-8 text-lg font-black uppercase tracking-wide border-4 border-foreground transition-all active:translate-x-1 active:translate-y-1"
                      style={{
                        backgroundColor: isDark ? 'hsl(21 90% 60%)' : 'hsl(21 95% 52%)',
                        borderColor: colors.border,
                        color: 'hsl(0 0% 100%)',
                        boxShadow: `6px 6px 0px 0px ${colors.border}`
                      }}
                    >
                      Upload Custom Image
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileSelected} />
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4 mb-6">
                  <div 
                    className="h-1 flex-1"
                    style={{ backgroundColor: colors.border }}
                  />
                  <div 
                    className="px-4 py-1 border-2 border-foreground bg-card"
                    style={{ 
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      boxShadow: `2px 2px 0px 0px ${colors.border}`
                    }}
                  >
                    <span className="text-xs font-black uppercase tracking-wide" style={{ color: colors.textMuted }}>
                      OR
                    </span>
                  </div>
                  <div 
                    className="h-1 flex-1"
                    style={{ backgroundColor: colors.border }}
                  />
                </div>

                {/* Default Avatars Grid */}
                <div className="mb-4">
                  <div 
                    className="border-4 border-foreground bg-primary p-3 inline-block mb-4"
                    style={{ 
                      borderColor: colors.border,
                      boxShadow: `4px 4px 0px 0px ${colors.border}`
                    }}
                  >
                    <h4 className="text-base font-black uppercase tracking-wide text-primary-foreground">
                      Choose Default Avatar
                    </h4>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-4">
                    {defaultAvatars.map((src) => (
                      <button 
                        key={src} 
                        className="border-4 transition-all active:translate-x-1 active:translate-y-1 relative"
                        style={{
                          borderColor: colors.border,
                          backgroundColor: userProfile?.avatar_url === src ? colors.primary : colors.card,
                          padding: userProfile?.avatar_url === src ? '4px' : '2px',
                          boxShadow: userProfile?.avatar_url === src ? `4px 4px 0px 0px ${colors.border}` : `2px 2px 0px 0px ${colors.border}`
                        }}
                        onClick={() => chooseDefaultAvatar(src)}
                      >
                        <img src={src} className="w-full h-full object-cover" style={{ display: 'block', aspectRatio: '1/1' }} />
                        {userProfile?.avatar_url === src && (
                          <div 
                            className="absolute -top-2 -right-2 w-6 h-6 border-2 border-foreground flex items-center justify-center"
                            style={{ 
                              backgroundColor: colors.primary,
                              borderColor: colors.border,
                              boxShadow: `2px 2px 0px 0px ${colors.border}`
                            }}
                          >
                            <span className="text-xs font-black text-primary-foreground">✓</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              </div>

            <div 
              className="h-1 w-full mb-6"
              style={{ backgroundColor: colors.border }}
            />

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="fullName" className="text-base font-black uppercase tracking-wide" style={{ color: colors.text }}>
                  Full Name
                </Label>
                <Input 
                  id="fullName" 
                  value={userProfile?.full_name || ''} 
                  onChange={(e) => setUserProfile((p: any) => ({ ...p, full_name: e.target.value }))}
                  className="h-12 text-base font-bold border-4 border-foreground uppercase tracking-wide"
                  style={{ 
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="email" className="text-base font-black uppercase tracking-wide" style={{ color: colors.text }}>
                  Email Address
                </Label>
                <div className="flex gap-3 items-center">
                  <Input 
                    id="email" 
                    value={userProfile?.email || ''} 
                    type="email" 
                    disabled
                    className="h-12 text-base font-bold border-4 border-foreground"
                    style={{ 
                      borderColor: colors.border,
                      backgroundColor: colors.muted,
                      boxShadow: `4px 4px 0px 0px ${colors.border}`
                    }}
                  />
                  <Dialog open={showEmailChangeDialog} onOpenChange={setShowEmailChangeDialog}>
                    <DialogTrigger asChild>
                      <button
                        className="h-12 px-4 font-black uppercase tracking-wide border-4 border-foreground"
                        style={{
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          color: colors.text,
                          boxShadow: `4px 4px 0px 0px ${colors.border}`
                        }}
                      >
                        Request Change
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Request email change</DialogTitle>
                        <DialogDescription>
                          You can change your email only once every 3 months. Proceed?
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEmailChangeDialog(false)}>Cancel</Button>
                        <Button onClick={() => { setShowEmailChangeDialog(false); toast({ title: 'Request submitted', description: 'We will enable email change if eligible.' }); }}>Confirm</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="username" className="text-base font-black uppercase tracking-wide" style={{ color: colors.text }}>
                  Username
                </Label>
                <div className="flex gap-3 items-center">
                  <Input 
                    id="username" 
                    value={userProfile?.username || ''} 
                    onChange={(e) => setUserProfile((p: any) => ({ ...p, username: e.target.value }))}
                    className="h-12 text-base font-bold border-4 border-foreground uppercase tracking-wide"
                    style={{ 
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      boxShadow: `4px 4px 0px 0px ${colors.border}`
                    }}
                  />
                  <Dialog open={showUsernameChangeDialog} onOpenChange={setShowUsernameChangeDialog}>
                    <DialogTrigger asChild>
                      <button
                        className="h-12 px-4 font-black uppercase tracking-wide border-4 border-foreground"
                        style={{
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          color: colors.text,
                          boxShadow: `4px 4px 0px 0px ${colors.border}`
                        }}
                      >
                        Change
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Change username</DialogTitle>
                        <DialogDescription>
                          You may change your username up to two times per month. Proceed?
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowUsernameChangeDialog(false)}>Cancel</Button>
                        <Button onClick={() => { setShowUsernameChangeDialog(false); toast({ title: 'Username updated', description: 'Remember: max 2 changes per month.' }); }}>Confirm</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="role" className="text-base font-black uppercase tracking-wide" style={{ color: colors.text }}>
                  Learning Goal
                </Label>
                <Select defaultValue="professional">
                  <SelectTrigger 
                    className="h-12 text-base font-bold border-4 border-foreground uppercase tracking-wide"
                    style={{ 
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      boxShadow: `4px 4px 0px 0px ${colors.border}`
                    }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional Development</SelectItem>
                    <SelectItem value="academic">Academic Research</SelectItem>
                    <SelectItem value="creative">Creative Projects</SelectItem>
                    <SelectItem value="personal">Personal Interest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-8 pt-6">
              <div 
                className="h-1 w-full mb-6"
                style={{ backgroundColor: colors.border }}
              />
              <Button 
                onClick={handleSaveProfile}
                className="h-14 px-8 text-lg font-black uppercase border-4 border-foreground"
                style={{
                  backgroundColor: colors.primary,
                  borderColor: colors.border,
                  color: 'hsl(0 0% 100%)',
                  boxShadow: `6px 6px 0px 0px ${colors.border}`
                }}
              >
                Save Profile Changes
              </Button>
            </div>
          </div>

          {/* Notification Settings */}
          <div 
            className="border-8 border-foreground bg-card p-8"
            style={{ 
              borderColor: colors.border,
              backgroundColor: colors.card,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block mb-6"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="flex items-center gap-3">
                <Bell className="w-6 h-6 text-primary-foreground" />
                <h2 className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                  Notifications
                </h2>
              </div>
            </div>

            <div className="space-y-6">
              {[
                { key: 'lessonReminders', title: 'Lesson Reminders', desc: 'Get notified about scheduled learning sessions' },
                { key: 'achievementAlerts', title: 'Achievement Alerts', desc: 'Celebrate your accomplishments and milestones' },
                { key: 'weeklyProgress', title: 'Weekly Progress', desc: 'Receive weekly learning progress summaries' },
                { key: 'emailUpdates', title: 'Email Updates', desc: 'Important updates and new features via email' }
              ].map(({ key, title, desc }) => (
                <div 
                  key={key}
                  className="border-4 border-foreground bg-card p-4 flex items-center justify-between"
                  style={{ 
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                  <div className="flex-1">
                    <h3 className="text-base font-black uppercase tracking-wide mb-1" style={{ color: colors.text }}>
                      {title}
                    </h3>
                    <p className="text-sm font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                      {desc}
                    </p>
                </div>
                <Switch
                    checked={notifications[key as keyof typeof notifications] as boolean}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, [key]: checked }))}
                />
              </div>
              ))}
                </div>
              </div>

          {/* Learning Preferences */}
          <div 
            className="border-8 border-foreground bg-card p-8"
            style={{ 
              borderColor: colors.border,
              backgroundColor: colors.card,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block mb-6"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-primary-foreground" />
                <h2 className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                  Learning Preferences
                </h2>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[
                { key: 'aiModel', label: 'Preferred AI Model', options: [
                  { value: 'gpt-4', label: 'GPT-4 (Recommended)' },
                  { value: 'claude', label: 'Claude' },
                  { value: 'gemini', label: 'Gemini' }
                ]},
                { key: 'difficulty', label: 'Difficulty Level', options: [
                  { value: 'beginner', label: 'Beginner' },
                  { value: 'intermediate', label: 'Intermediate' },
                  { value: 'advanced', label: 'Advanced' },
                  { value: 'adaptive', label: 'Adaptive (Recommended)' }
                ]},
                { key: 'language', label: 'Language', options: [
                  { value: 'english', label: 'English' },
                  { value: 'spanish', label: 'Spanish' },
                  { value: 'french', label: 'French' },
                  { value: 'german', label: 'German' }
                ]},
                { key: 'timezone', label: 'Timezone', options: [
                  { value: 'utc-8', label: 'Pacific Time (UTC-8)' },
                  { value: 'utc-5', label: 'Eastern Time (UTC-5)' },
                  { value: 'utc+0', label: 'GMT (UTC+0)' },
                  { value: 'utc+1', label: 'Central European Time (UTC+1)' }
                ]}
              ].map(({ key, label, options }) => (
                <div key={key} className="space-y-3">
                  <Label className="text-base font-black uppercase tracking-wide" style={{ color: colors.text }}>
                    {label}
                  </Label>
                  <Select 
                    value={preferences[key as keyof typeof preferences] as string} 
                    onValueChange={(value) => setPreferences(prev => ({ ...prev, [key]: value }))}
                  >
                    <SelectTrigger 
                      className="h-12 text-base font-bold border-4 border-foreground uppercase tracking-wide"
                      style={{ 
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        boxShadow: `4px 4px 0px 0px ${colors.border}`
                      }}
                    >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                      {options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              ))}
              </div>
              </div>

          {/* Theme Settings */}
          <div 
            className="border-8 border-foreground bg-card p-8"
            style={{ 
              borderColor: colors.border,
              backgroundColor: colors.card,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block mb-6"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
                  >
              <div className="flex items-center gap-3">
                <Palette className="w-6 h-6 text-primary-foreground" />
                <h2 className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                  Appearance
                </h2>
                      </div>
                    </div>

            <div className="space-y-6">
              <div>
                <Label className="text-base font-black uppercase tracking-wide mb-4 block" style={{ color: colors.text }}>
                  Theme Preference
                </Label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: 'light', icon: Sun, label: 'LIGHT' },
                    { key: 'dark', icon: Moon, label: 'DARK' },
                    { key: 'system', icon: Monitor, label: 'SYSTEM' }
                  ].map(({ key, icon: Icon, label }) => (
                  <button
                      key={key}
                      onClick={async () => { setTheme(key as 'light' | 'dark' | 'system'); try { await apiService.updateUserSettings({ theme: key }); } catch { } }}
                      className="h-24 border-4 border-foreground font-black uppercase tracking-wide transition-all active:translate-x-1 active:translate-y-1"
                      style={{
                        backgroundColor: theme === key ? colors.primary : colors.card,
                        borderColor: colors.border,
                        color: theme === key ? 'hsl(0 0% 100%)' : colors.text,
                        boxShadow: theme === key ? `6px 6px 0px 0px ${colors.border}` : `4px 4px 0px 0px ${colors.border}`
                      }}
                  >
                      <div className="flex flex-col items-center gap-2">
                        <Icon className="w-6 h-6" />
                        <span className="text-sm">{label}</span>
                    </div>
                  </button>
                  ))}
                </div>
                <p className="text-sm font-bold uppercase tracking-wide mt-4" style={{ color: colors.textMuted }}>
                  Choose your preferred color scheme. System will match your device settings.
                </p>
              </div>

              <div 
                className="h-1 w-full"
                style={{ backgroundColor: colors.border }}
              />

              <div className="space-y-4">
                {[
                  { key: 'reducedMotion', title: 'Reduced Motion', desc: 'Minimize animations and transitions' },
                  { key: 'highContrast', title: 'High Contrast', desc: 'Increase contrast for better readability' }
                ].map(({ key, title, desc }) => (
                  <div 
                    key={key}
                    className="border-4 border-foreground bg-card p-4 flex items-center justify-between"
                    style={{ 
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      boxShadow: `4px 4px 0px 0px ${colors.border}`
                    }}
                  >
                    <div className="flex-1">
                      <h3 className="text-base font-black uppercase tracking-wide mb-1" style={{ color: colors.text }}>
                        {title}
                      </h3>
                      <p className="text-sm font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                        {desc}
                      </p>
                  </div>
                  <Switch />
                </div>
                ))}
                  </div>
                </div>
              </div>

          {/* Privacy & Security */}
          <div 
            className="border-8 border-foreground bg-card p-8"
            style={{ 
              borderColor: colors.border,
              backgroundColor: colors.card,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block mb-6"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-primary-foreground" />
                <h2 className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                  Privacy & Security
                </h2>
              </div>
            </div>

            <div className="space-y-6">
              {[
                { key: 'profileVisibility', title: 'Profile Visibility', desc: 'Allow other learners to see your progress', defaultChecked: true },
                { key: 'analyticsData', title: 'Analytics Data', desc: 'Help improve the platform with usage data', defaultChecked: true }
              ].map(({ key, title, desc, defaultChecked }) => (
                <div 
                  key={key}
                  className="border-4 border-foreground bg-card p-4 flex items-center justify-between"
                  style={{ 
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                  <div className="flex-1">
                    <h3 className="text-base font-black uppercase tracking-wide mb-1" style={{ color: colors.text }}>
                      {title}
                    </h3>
                    <p className="text-sm font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                      {desc}
                    </p>
                </div>
                  <Switch defaultChecked={defaultChecked} />
              </div>
              ))}

              <div 
                className="h-1 w-full"
                style={{ backgroundColor: colors.border }}
              />

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  className="h-12 px-6 font-black uppercase tracking-wide border-4 border-foreground"
                  style={{
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                  Change Password
                </button>
                <button
                  className="h-12 px-6 font-black uppercase tracking-wide border-4 border-foreground"
                  style={{
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                  Download My Data
                </button>
                <button
                  className="h-12 px-6 font-black uppercase tracking-wide border-4 border-foreground"
                  style={{
                    backgroundColor: isDark ? 'hsl(0 80% 60%)' : 'hsl(0 84% 51%)',
                    borderColor: colors.border,
                    color: 'hsl(0 0% 100%)',
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div 
            className="border-8 border-foreground bg-card p-8"
            style={{ 
              borderColor: colors.border,
              backgroundColor: colors.card,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block mb-6"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="flex items-center gap-3">
                <Globe className="w-6 h-6 text-primary-foreground" />
                <h2 className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                  Subscription
                </h2>
              </div>
            </div>

            <div className="mb-6">
              <div 
                className="border-4 border-foreground bg-card p-4 mb-4"
                style={{ 
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  boxShadow: `4px 4px 0px 0px ${colors.border}`
                }}
              >
                <h3 className="text-lg font-black uppercase tracking-wide flex items-center gap-3 mb-2" style={{ color: colors.text }}>
                  Free Plan
                  <span 
                    className="px-3 py-1 text-xs font-black uppercase border-2 border-foreground"
                    style={{ 
                      borderColor: colors.border,
                      backgroundColor: colors.primary,
                      color: 'hsl(0 0% 100%)',
                      boxShadow: `2px 2px 0px 0px ${colors.border}`
                    }}
                  >
                    Current
                  </span>
                </h3>
                <p className="text-sm font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                  Basic features with limited AI interactions
                </p>
            </div>

              <div 
                className="border-4 border-foreground p-6"
                style={{ 
                  borderColor: colors.border,
                  backgroundColor: colors.primary,
                  boxShadow: `6px 6px 0px 0px ${colors.border}`
                }}
              >
                <h4 className="text-xl font-black uppercase tracking-wide mb-4 text-primary-foreground">
                  Upgrade to Neural Pro
                </h4>
                <ul className="text-sm font-bold uppercase tracking-wide space-y-2 mb-6 text-primary-foreground">
                <li>• Unlimited AI prompt grading</li>
                <li>• Advanced model switching</li>
                <li>• Priority support</li>
                <li>• Exclusive content</li>
              </ul>
                <button
                  onClick={handleUpgrade}
                  className="h-12 px-6 font-black uppercase tracking-wide border-4 border-foreground"
                  style={{
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                    boxShadow: `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                Upgrade Now
                </button>
            </div>
            </div>
          </div>

          {/* Save Changes */}
          <div className="flex flex-col sm:flex-row justify-end gap-4">
            <button
              onClick={handleResetDefaults}
              className="h-12 px-6 font-black uppercase tracking-wide border-4 border-foreground"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              Reset to Defaults
            </button>
            <button
              onClick={handleSaveSettings}
              className="h-14 px-8 text-lg font-black uppercase tracking-wide border-4 border-foreground"
              style={{
                backgroundColor: colors.primary,
                borderColor: colors.border,
                color: 'hsl(0 0% 100%)',
                boxShadow: `6px 6px 0px 0px ${colors.border}`
              }}
            >
              Save All Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;