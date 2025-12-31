import React, { ReactNode } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Star, Zap, Clock, AlertTriangle } from 'lucide-react';

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
  upgradeMessage?: string;
  className?: string;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
  upgradeMessage,
  className
}: FeatureGateProps) {
  // Check if user is admin - admins bypass all subscription checks
  let authState = { user: null };
  try {
    authState = useAuth();
  } catch (error) {
    // AuthProvider not ready yet
  }
  
  const isAdmin = authState.user?.is_admin === true;
  
  // Admins have full access to all features
  if (isAdmin) {
    return <>{children}</>;
  }

  const {
    hasFeatureAccess,
    isTrialUser,
    isSubscriber,
    subscription,
    subscriptionConfig,
    shouldShowUpgradeModal,
    isInGracePeriod,
    getGracePeriodRemaining,
    getTrialDaysRemaining,
    features
  } = useSubscription();

  const hasAccess = hasFeatureAccess(feature);

  // If user has full access (subscriber), show content normally
  if (hasAccess) {
    return <>{children}</>;
  }

  // Check if this feature allows trial access
  // Use feature config from API, or check default list if not loaded
  const featureConfig = features[feature];

  // Default features that trial users can fully access (when API fails)
  const defaultTrialAccessFeatures = ['learn', 'skill_tree', 'dashboard', 'practice', 'progress', 'challenges', 'certificates'];
  const hasTrialAccess = featureConfig?.free_trial_access ?? defaultTrialAccessFeatures.includes(feature);

  // During grace period, if feature has free_trial_access, allow full access
  // The trial banner is now handled globally in TrialBanner component, not here
  // This prevents overlap issues with headers
  if (isInGracePeriod() && hasTrialAccess) {
    return <>{children}</>;
  }

  // Also allow access for trial users if no subscription data loaded yet (API fail) but feature is in default list
  if (isTrialUser() && hasTrialAccess) {
    return <>{children}</>;
  }

  // User doesn't have access - show grayed out content with upgrade prompt
  // This applies when: trial period expired, OR feature doesn't have free_trial_access
  const defaultUpgradeMessage = upgradeMessage || `This feature is available for Habitual plan subscribers.`;
  const { habitual_price_monthly, payment_url, trial_total_days } = subscriptionConfig;

  // For trial users viewing premium-only features, show a less intrusive overlay
  const isPremiumFeatureForTrialUser = isTrialUser() && isInGracePeriod() && !hasTrialAccess;

  if (isPremiumFeatureForTrialUser) {
    // Premium feature during trial - show grayed out with a simple upgrade banner
    return (
      <div className="relative min-h-screen">
        {/* Premium badge at top */}
        <div className="sticky top-0 z-40 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 shadow-lg">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5" />
              <span className="font-medium">
                Premium Feature - Upgrade to unlock full access
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              onClick={() => window.location.href = '/upgrade'}
            >
              Upgrade Now
            </Button>
          </div>
        </div>

        {/* Grayed out content - visible but not interactive */}
        <div className="opacity-40 pointer-events-none select-none">
          {children}
        </div>
      </div>
    );
  }

  // Grace period expired or not a trial user - show full upgrade modal
  return (
    <div className="relative min-h-screen">
      {/* Grayed out content in background */}
      <div className="opacity-30 pointer-events-none select-none filter blur-[1px]">
        {children}
      </div>

      {/* Fixed centered overlay with modal */}
      <div className="fixed inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-50">
        <Card className={`p-8 text-center max-w-md mx-4 shadow-2xl border-2 border-purple-200 ${className || ''}`}>
          <div className="flex flex-col items-center space-y-5">
            {/* Premium Icon */}
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                <Crown className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center shadow-md">
                <Star className="w-4 h-4 text-yellow-800" />
              </div>
            </div>

            {/* Title and Description */}
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-foreground">Premium Feature</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {defaultUpgradeMessage}
              </p>
            </div>

            {/* Upgrade Button */}
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 shadow-lg"
              onClick={() => {
                window.location.href = '/upgrade';
              }}
            >
              <Crown className="w-5 h-5 mr-2" />
              Upgrade to Habitual
            </Button>

            {/* Trial Info */}
            {isTrialUser() && (
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-blue-600 border-blue-600">
                  <Clock className="w-3 h-3 mr-1" />
                  Trial Grace Period Ended
                </Badge>
              </div>
            )}

            {subscription?.days_remaining && subscription.days_remaining > 0 && (
              <span className="text-xs text-muted-foreground">
                {subscription.days_remaining} days of trial remaining
              </span>
            )}

            {/* Benefits */}
            <div className="text-sm text-muted-foreground space-y-1 pt-2">
              <p className="flex items-center justify-center gap-2">
                <span className="text-green-500">✓</span> {trial_total_days}-day free trial
              </p>
              <p className="flex items-center justify-center gap-2">
                <span className="text-green-500">✓</span> Cancel anytime
              </p>
              <p className="flex items-center justify-center gap-2">
                <span className="text-green-500">✓</span> All features included
              </p>
              <p className="flex items-center justify-center gap-2 font-medium text-purple-600">
                Only ${habitual_price_monthly}/month
              </p>
            </div>

            {/* Continue with Trial button for trial users (if trial still active) */}
            {isTrialUser() && subscription?.is_trial_active && (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  window.location.href = '/learn';
                }}
              >
                Continue with Trial
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Convenience component for simple access checks
interface FeatureAccessProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureAccess({ feature, children, fallback }: FeatureAccessProps) {
  const { hasFeatureAccess } = useSubscription();

  return hasFeatureAccess(feature) ? <>{children}</> : <>{fallback}</>;
}

// Component for showing feature badges
interface FeatureBadgeProps {
  feature: string;
  className?: string;
}

export function FeatureBadge({ feature, className }: FeatureBadgeProps) {
  const { hasFeatureAccess, isSubscriber } = useSubscription();
  const hasAccess = hasFeatureAccess(feature);

  if (!hasAccess) return null;

  return (
    <Badge
      variant={isSubscriber() ? "default" : "secondary"}
      className={`${className || ''}`}
    >
      {isSubscriber() ? (
        <>
          <Crown className="w-3 h-3 mr-1" />
          Premium
        </>
      ) : (
        <>
          <Zap className="w-3 h-3 mr-1" />
          Trial
        </>
      )}
    </Badge>
  );
}

