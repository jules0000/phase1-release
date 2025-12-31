import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import apiService from '@/lib/api';
import logoUrl from '@/assets/neural-logo.png';
import secondaryLogoUrl from '@/assets/secondary-neural-logo.png';

export default function WelcomeSetup() {
  const { user, updateUser } = useAuth();
  const { setTheme, actualTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const isDark = actualTheme === 'dark';

  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [themeChoice, setThemeChoice] = useState<'light' | 'dark' | 'system' | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  const goToStep = (next: number) => setStep(next);

  // Check if user should access welcome page - only first-time learners
  useEffect(() => {
    if (!user) {
      setIsCheckingAccess(false);
      return;
    }

    // Admins should not see welcome page
    if ((user as any).is_admin === true) {
      navigate('/admin', { replace: true });
      return;
    }

    // Check if onboarding is already completed
    const onboardingKey = `onboarding_${user.id}`;
    const completed = localStorage.getItem(onboardingKey) === 'true';
    
    if (completed) {
      // User has already completed onboarding, redirect to dashboard
      navigate('/dashboard', { replace: true });
      return;
    }

    // User is a learner and hasn't completed onboarding - allow access
    setIsCheckingAccess(false);
  }, [user, navigate]);

  useEffect(() => {
    // Preload topics
    (async () => {
      try {
        const data = await apiService.getTopics();
        const names = Array.isArray(data) ? data.map((t: any) => t.name || t.title || String(t)) : [];
        setTopics(names.slice(0, 20));
      } catch {
        // fallback demo topics
        setTopics(['Prompting', 'LLMs', 'RAG', 'Agents', 'Vision', 'Audio', 'Evaluation', 'Safety', 'MLOps']);
      }
    })();
  }, []);

  const profileIconUrls = useMemo(() => {
    const mods = import.meta.glob('/src/assets/profile-icons/*', { eager: true, as: 'url' });
    return Object.values(mods) as string[];
  }, []);

  const handleUploadAvatarClick = () => fileInputRef.current?.click();
  const onAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await apiService.uploadAvatarFromFile(file);
    setSelectedAvatar(dataUrl);
  };

  const toggleTopic = (t: string) => {
    setSelectedTopics((prev) => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  };

  const onboardingKey = user ? `onboarding_${user.id}` : 'onboarding';

  const finish = async () => {
    try {
      // Save avatar (if chosen)
      if (selectedAvatar) {
        const updated = await apiService.updateUserProfile({ avatar_url: selectedAvatar });
        updateUser({ ...(user as any), ...updated });
      }
      // Save display name locally (nickname shown in header)
      if (nickname.trim()) {
        localStorage.setItem('display_name', nickname.trim());
      }
      // Save interests in settings
      if (selectedTopics.length > 0) {
        await apiService.updateUserSettings({ preferences: { interests: selectedTopics } });
      }
      // Establish a baseline snapshot for skill trends after onboarding
      // This links the welcome flow to dashboard trend visuals
      // Only if skillTracker is available (optional feature)
      try {
        const skillTracker = await import('@/lib/skillTracker');
        const current = skillTracker.getSkillProgress();
        if (current) {
          skillTracker.saveSkillBaselineFromCurrent();
        }
      } catch (error) {
        // Silently fail if skillTracker doesn't exist or has issues
        // This is an optional feature, so it's okay if it's not available
      }
      localStorage.setItem(onboardingKey, 'true');
      toast({ title: 'All set!', description: 'Welcome to your personalized workspace.' });
      navigate('/dashboard', { replace: true });
    } catch {
      toast({ title: 'Setup failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  // Steps UI - Neobrutalism Design
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

  const colors = getColors();

  // Show loading state while checking access
  if (isCheckingAccess || !user) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-bold">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen w-full bg-background flex items-center justify-center p-6 relative overflow-hidden"
    >
      {/* Neobrutalism Background Pattern */}
      <div className={`absolute inset-0 pointer-events-none ${isDark ? 'opacity-20' : 'opacity-30'}`}>
        {/* Diagonal stripes */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              hsl(var(--primary) / ${isDark ? '0.08' : '0.05'})),
              hsl(var(--primary) / ${isDark ? '0.08' : '0.05'}) 20px,
              transparent 20px,
              transparent 40px
            )`
          }}
        />
        {/* Grid pattern */}
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
        {/* Geometric shapes */}
        <div className="absolute top-10 left-10 w-32 h-32 border-4 opacity-10" style={{ borderColor: `hsl(var(--border))` }} />
        <div className="absolute top-40 right-20 w-24 h-24 border-4 opacity-10" style={{ borderColor: `hsl(var(--border))` }} />
        <div className="absolute bottom-20 left-1/4 w-20 h-20 border-4 opacity-10" style={{ borderColor: `hsl(var(--border))` }} />
        <div className="absolute bottom-40 right-1/3 w-28 h-28 border-4 opacity-10" style={{ borderColor: `hsl(var(--border))` }} />
      </div>

      <div className="w-full max-w-4xl relative z-10">
        {/* Header Section - Bold Neobrutalism */}
        <div className="text-center mb-8 flex flex-col items-center gap-4">
          <div 
            className="border-8 border-foreground bg-card p-4 mb-2" 
            style={{ 
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `8px 8px 0px 0px ${colors.border}`
            }}
          >
            <img src={logoUrl} alt="Neural" className="h-12" />
          </div>
          <h1 
            className="text-6xl font-black tracking-tighter uppercase" 
            style={{ 
              color: colors.primary,
              textShadow: `4px 4px 0px ${colors.border}`,
              letterSpacing: '-0.02em'
            }}
          >
            WELCOME
          </h1>
          <div 
            className="border-4 border-foreground bg-card px-6 py-2 inline-block" 
            style={{ 
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `4px 4px 0px 0px ${colors.border}`
            }}
          >
            <p 
              className="text-lg font-bold uppercase tracking-wide" 
              style={{ color: colors.text }}
            >
              Let's personalize your learning experience
            </p>
          </div>
        </div>

        {/* Step indicator - Bold geometric */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1,2,3,4].map((s)=> (
            <div key={s} className="flex items-center gap-3">
              <div 
                className="h-6 w-6 border-4 border-foreground transition-all"
                style={{ 
                  backgroundColor: step===s ? colors.primary : colors.bg,
                  borderColor: colors.border,
                  boxShadow: step===s ? `4px 4px 0px 0px ${colors.border}` : `2px 2px 0px 0px ${colors.border}`
                }}
              />
              {s < 4 && (
                <div 
                  className="h-1 w-8 border-2 border-foreground"
                  style={{ 
                    backgroundColor: step > s ? colors.primary : colors.bg,
                    borderColor: colors.border
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div 
            className="border-8 border-foreground bg-card p-10 space-y-6"
            style={{ 
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <Label htmlFor="nickname" className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                Hey! What should we call you?
              </Label>
            </div>
            <Input 
              id="nickname" 
              value={nickname} 
              onChange={(e)=>setNickname(e.target.value)} 
              placeholder="ENTER A NICKNAME" 
              className="h-16 text-xl font-bold border-4 border-foreground uppercase tracking-wide"
              style={{ 
                borderColor: colors.border,
                backgroundColor: colors.card,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            />
            <div className="flex justify-end">
              <Button 
                size="lg" 
                onClick={()=>goToStep(2)} 
                disabled={!nickname.trim()}
                className="h-14 px-8 text-lg font-black uppercase border-4 border-foreground disabled:opacity-50 active:translate-x-1 active:translate-y-1"
                style={{ 
                  backgroundColor: nickname.trim() ? colors.primary : (isDark ? 'hsl(0 0% 50%)' : 'hsl(0 0% 70%)'),
                  borderColor: colors.border,
                  color: 'hsl(0 0% 100%)',
                  boxShadow: nickname.trim() ? `6px 6px 0px 0px ${colors.border}` : `2px 2px 0px 0px ${colors.border}`
                }}
              >
                NEXT →
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div 
            className="border-8 border-foreground bg-card p-10 space-y-6"
            style={{ 
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                Choose your theme
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { key: 'light', label: 'LIGHT' },
                { key: 'dark', label: 'DARK' },
                { key: 'system', label: 'SYSTEM' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={async () => {
                    setTheme(key as 'light' | 'dark' | 'system');
                    setThemeChoice(key as 'light' | 'dark' | 'system');
                    try { await apiService.updateUserSettings({ theme: key }); } catch {}
                  }}
                  className="h-20 border-4 border-foreground font-black uppercase tracking-wide text-lg transition-all active:translate-x-1 active:translate-y-1"
                  style={{
                    backgroundColor: themeChoice === key ? colors.primary : colors.card,
                    borderColor: colors.border,
                    color: themeChoice === key ? 'hsl(0 0% 100%)' : colors.text,
                    boxShadow: themeChoice === key ? `6px 6px 0px 0px ${colors.border}` : `4px 4px 0px 0px ${colors.border}`
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-center text-sm font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
              You can change this later in Settings
            </div>
            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={()=>goToStep(1)}
                className="h-12 px-6 font-black uppercase border-4 border-foreground active:translate-x-1 active:translate-y-1"
                style={{ 
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text,
                  boxShadow: `4px 4px 0px 0px ${colors.border}`
                }}
              >
                ← BACK
              </Button>
              <Button 
                onClick={()=>goToStep(3)} 
                disabled={!themeChoice}
                className="h-12 px-6 font-black uppercase border-4 border-foreground disabled:opacity-50 active:translate-x-1 active:translate-y-1"
                style={{ 
                  backgroundColor: themeChoice ? colors.primary : (isDark ? 'hsl(0 0% 50%)' : 'hsl(0 0% 70%)'),
                  borderColor: colors.border,
                  color: 'hsl(0 0% 100%)',
                  boxShadow: themeChoice ? `6px 6px 0px 0px ${colors.border}` : `2px 2px 0px 0px ${colors.border}`
                }}
              >
                NEXT →
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div 
            className="border-8 border-foreground bg-card p-10 space-y-8"
            style={{ 
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 text-center"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                Pick a profile picture
              </div>
            </div>

            {/* Large preview and nickname */}
            <div className="flex flex-col items-center gap-4">
              <div 
                className="w-32 h-32 border-8 border-foreground overflow-hidden"
                style={{ 
                  borderColor: colors.border,
                  backgroundColor: selectedAvatar ? 'transparent' : colors.muted,
                  boxShadow: `6px 6px 0px 0px ${colors.border}`
                }}
              >
                {selectedAvatar ? (
                  <img src={selectedAvatar} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ backgroundColor: colors.muted }} />
                )}
              </div>
              <div 
                className="border-2 border-foreground bg-card px-4 py-1"
                style={{ 
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  boxShadow: `2px 2px 0px 0px ${colors.border}`
                }}
              >
                <div className="text-base font-black uppercase tracking-wide" style={{ color: colors.text }}>
                  {nickname || 'YOUR NICKNAME'}
                </div>
              </div>
            </div>

            {/* Choices */}
            <div className="flex flex-wrap gap-3 justify-center">
              {profileIconUrls.map((url) => (
                <button 
                  key={url} 
                  className="border-4 transition-all active:translate-x-1 active:translate-y-1"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: selectedAvatar === url ? colors.primary : colors.card,
                    padding: selectedAvatar === url ? '4px' : '2px',
                    boxShadow: selectedAvatar === url ? `4px 4px 0px 0px ${colors.border}` : `2px 2px 0px 0px ${colors.border}`
                  }}
                  onClick={()=>setSelectedAvatar(url)}
                >
                  <img src={url} className="w-16 h-16 object-cover" style={{ display: 'block' }} />
                </button>
              ))}
            </div>

            {/* Upload + mini live preview */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleUploadAvatarClick}
                className="h-12 px-6 font-black uppercase tracking-wide border-4 border-foreground active:translate-x-1 active:translate-y-1"
                style={{
                  backgroundColor: isDark ? 'hsl(21 90% 60%)' : 'hsl(21 95% 52%)',
                  borderColor: colors.border,
                  color: 'hsl(0 0% 100%)',
                  boxShadow: `4px 4px 0px 0px ${colors.border}`
                }}
              >
                UPLOAD IMAGE
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarSelected} />
              <div 
                className="w-12 h-12 border-4 border-foreground overflow-hidden"
                style={{ 
                  borderColor: colors.border,
                  boxShadow: `3px 3px 0px 0px ${colors.border}`
                }}
              >
                {selectedAvatar ? (
                  <img src={selectedAvatar} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-black text-lg" style={{ backgroundColor: colors.muted, color: colors.text }}>
                    {user?.full_name?.split(' ').map(n=>n[0]).join('').toUpperCase() || 'U'}
                  </div>
                )}
              </div>
            </div>
            <div className="text-center text-sm font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
              You can change this later in Settings
            </div>

            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={()=>goToStep(2)}
                className="h-12 px-6 font-black uppercase border-4 border-foreground active:translate-x-1 active:translate-y-1"
                style={{ 
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text,
                  boxShadow: `4px 4px 0px 0px ${colors.border}`
                }}
              >
                ← BACK
              </Button>
              <Button 
                onClick={()=>goToStep(4)} 
                className="h-12 px-6 font-black uppercase border-4 border-foreground active:translate-x-1 active:translate-y-1"
                style={{ 
                  backgroundColor: colors.primary,
                  borderColor: colors.border,
                  color: 'hsl(0 0% 100%)',
                  boxShadow: `6px 6px 0px 0px ${colors.border}`
                }}
              >
                NEXT →
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div 
            className="border-8 border-foreground bg-card p-10 space-y-6"
            style={{ 
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `12px 12px 0px 0px ${colors.primary}`
            }}
          >
            <div 
              className="border-4 border-foreground bg-primary p-4 inline-block"
              style={{ 
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`
              }}
            >
              <div className="text-2xl font-black uppercase tracking-wide text-primary-foreground">
                Which topics are you interested in?
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {topics.map((t) => (
                <button 
                  key={t} 
                  className="px-4 py-2 border-4 border-foreground font-bold uppercase tracking-wide text-sm transition-all active:translate-x-1 active:translate-y-1"
                  style={{
                    backgroundColor: selectedTopics.includes(t) ? colors.primary : colors.card,
                    borderColor: colors.border,
                    color: selectedTopics.includes(t) ? 'hsl(0 0% 100%)' : colors.text,
                    boxShadow: selectedTopics.includes(t) ? `4px 4px 0px 0px ${colors.border}` : `2px 2px 0px 0px ${colors.border}`
                  }}
                  onClick={()=>toggleTopic(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={()=>goToStep(3)}
                className="h-12 px-6 font-black uppercase border-4 border-foreground active:translate-x-1 active:translate-y-1"
                style={{ 
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text,
                  boxShadow: `4px 4px 0px 0px ${colors.border}`
                }}
              >
                ← BACK
              </Button>
              <Button 
                onClick={finish}
                className="h-14 px-8 text-lg font-black uppercase border-4 border-foreground active:translate-x-1 active:translate-y-1"
                style={{ 
                  backgroundColor: colors.primary,
                  borderColor: colors.border,
                  color: 'hsl(0 0% 100%)',
                  boxShadow: `6px 6px 0px 0px ${colors.border}`
                }}
              >
                FINISH ✓
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

