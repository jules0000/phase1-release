/*
 * BACKEND REQUIREMENTS - App.tsx (Main Router):
 * 
 * This is the main application router that orchestrates all frontend routes.
 * Each route component has specific backend requirements documented in their respective files.
 * 
 * Authentication & Authorization:
 * - All protected routes require JWT token validation via AuthContext
 * - Admin routes require additional admin role verification
 * - Real-time token refresh and session management
 * 
 * Global Backend Dependencies:
 * - Authentication service: /api/auth/* endpoints
 * - User management: /api/users/* endpoints  
 * - Real-time WebSocket connections for live updates
 * - Error handling and logging services
 * 
 * Route-Specific Backend Requirements:
 * - Dashboard: User progress, modules, topics, analytics
 * - Learn: Neural content from /data/neural-content/* JSON files
 * - Admin: Full CRUD operations, analytics, user management
 * - Tools: AI model integrations, content processing
 * - Progress: User statistics, XP tracking, achievements
 * 
 * Real-time Features Needed:
 * - Live progress updates across sessions
 * - Real-time notifications and achievements
 * - Collaborative features and live leaderboards
 * - System health monitoring for admin users
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LearningFocusProvider } from '@/contexts/LearningFocusContext';
import { ProtectedRoute, AdminRoute } from '@/components/ProtectedRoute';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from '@/components/Header';
import { FeatureGate } from '@/components/FeatureGate';
import { SkipLink } from '@/components/SkipLink';
import * as Sentry from '@sentry/react';
import { LandingPage } from '@/pages/LandingPage';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Learn from '@/pages/Learn';
import Settings from '@/pages/Settings';
import Profile from '@/pages/Profile';
import WelcomeSetup from '@/pages/WelcomeSetup';
import SkillTreePage from '@/pages/SkillTreePage';
import Practice from '@/pages/Practice';
import Progress from '@/pages/Progress';
import Challenges from '@/pages/Challenges';
import Guilds from '@/pages/Guilds';
import Tournaments from '@/pages/Tournaments';
import Certificates from '@/pages/Certificates';
import Tools from '@/pages/Tools';
import PromptTranslator from '@/pages/PromptTranslator';
import PromptEngineeringSandbox from '@/pages/PromptEngineeringSandbox';
import ImagePromptMastery from '@/pages/ImagePromptMastery';
import MultiModelPrompting from '@/pages/MultiModelPrompting';
import CodeGenerationWorkshop from '@/pages/CodeGenerationWorkshop';
import ContentCreationPipeline from '@/pages/ContentCreationPipeline';
import CreativeWriting from '@/pages/CreativeWriting';
import { PromptGrader } from '@/components/PromptGrader';
import { Quiz } from '@/components/Quiz';
import { QualityAssurance } from '@/components/QualityAssurance';
import { Toaster } from '@/components/ui/toaster';
import PageTransitionLoader from '@/components/PageTransitionLoader';
import { PageTransition } from '@/hooks/use-gsap';
import AdminDashboard from '@/pages/AdminDashboard';
import Upgrade from '@/pages/Upgrade';
import CheckoutSuccess from '@/pages/CheckoutSuccess';
import CheckoutCancel from '@/pages/CheckoutCancel';
import { LessonViewer } from '@/pages/LessonViewer';
import ModuleDetail from '@/pages/ModuleDetail';
import LessonPage from '@/pages/LessonPage';
import { useMultiTabSync } from '@/hooks/useMultiTabSync';

function App() {
  // Enable multi-tab synchronization
  useMultiTabSync();

  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <PageTransitionLoader />
      <PageTransition>
        <main id="main-content" role="main">
          <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <FeatureGate feature="dashboard">
                <ErrorBoundary fallback={<div className="p-4">Dashboard encountered an error. Please refresh the page.</div>}>
                  <Dashboard />
                </ErrorBoundary>
              </FeatureGate>
            </ProtectedRoute>
          } />
          <Route path="/welcome" element={
            <ProtectedRoute>
              <WelcomeSetup />
            </ProtectedRoute>
          } />

          <Route path="/learn" element={
            <ProtectedRoute>
              <FeatureGate feature="learn">
                <Learn />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/skill-tree" element={
            <ProtectedRoute>
              <FeatureGate feature="skill_tree">
                <SkillTreePage />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/practice" element={
            <ProtectedRoute>
              <FeatureGate feature="practice">
                <Practice />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/progress" element={
            <ProtectedRoute>
              <FeatureGate feature="progress">
                <ErrorBoundary fallback={<div className="p-4">Progress page encountered an error. Please refresh the page.</div>}>
                  <Progress />
                </ErrorBoundary>
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/challenges" element={
            <ProtectedRoute>
              <FeatureGate feature="challenges">
                <Challenges />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/guilds" element={
            <ProtectedRoute>
              <ErrorBoundary fallback={<div className="p-4">Guilds page encountered an error. Please refresh the page.</div>}>
                <Guilds />
              </ErrorBoundary>
            </ProtectedRoute>
          } />

          <Route path="/tournaments" element={
            <ProtectedRoute>
              <ErrorBoundary fallback={<div className="p-4">Tournaments page encountered an error. Please refresh the page.</div>}>
                <Tournaments />
              </ErrorBoundary>
            </ProtectedRoute>
          } />

          <Route path="/certificates" element={
            <ProtectedRoute>
              <FeatureGate feature="certificates">
                <Certificates />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/tools" element={
            <ProtectedRoute>
              <Tools />
            </ProtectedRoute>
          } />

          {/* Tool routes */}
          <Route path="/prompt-translator" element={
            <ProtectedRoute>
              <FeatureGate feature="prompt_translator">
                <PromptTranslator />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/prompt-engineering-sandbox" element={
            <ProtectedRoute>
              <FeatureGate feature="prompt_sandbox">
                <PromptEngineeringSandbox />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/image-prompt-mastery" element={
            <ProtectedRoute>
              <FeatureGate feature="image_prompts">
                <ImagePromptMastery />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/multi-model-prompting" element={
            <ProtectedRoute>
              <FeatureGate feature="multi_model">
                <MultiModelPrompting />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/code-generation-workshop" element={
            <ProtectedRoute>
              <FeatureGate feature="code_workshop">
                <CodeGenerationWorkshop />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/content-creation-pipeline" element={
            <ProtectedRoute>
              <FeatureGate feature="content_pipeline">
                <ContentCreationPipeline />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/creative-writing" element={
            <ProtectedRoute>
              <FeatureGate feature="creative_writing">
                <CreativeWriting />
              </FeatureGate>
            </ProtectedRoute>
          } />

          <Route path="/prompt-grader" element={
            <ProtectedRoute>
              <>
                <Header />
                <div className="container mx-auto px-4 py-8">
                  <PromptGrader />
                </div>
              </>
            </ProtectedRoute>
          } />
          <Route path="/lesson/:topicNumber/:moduleNumber/:lessonNumber" element={
            <ProtectedRoute>
              <ErrorBoundary fallback={<div className="p-4">Lesson viewer encountered an error. Please refresh the page.</div>}>
                <LessonViewer />
              </ErrorBoundary>
            </ProtectedRoute>
          } />
          <Route path="/lesson/:moduleId/:lessonId" element={
            <ProtectedRoute>
              <LessonPage />
            </ProtectedRoute>
          } />
          <Route path="/module/:moduleId" element={
            <ProtectedRoute>
              <ModuleDetail />
            </ProtectedRoute>
          } />

          <Route path="/quiz/:moduleId/:lessonId" element={
            <ProtectedRoute>
              <Quiz />
            </ProtectedRoute>
          } />

          <Route path="/quality-assurance" element={
            <ProtectedRoute>
              <QualityAssurance />
            </ProtectedRoute>
          } />

          {/* Settings and Profile */}
          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />

          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />

          <Route path="/upgrade" element={
            <ProtectedRoute>
              <Upgrade />
            </ProtectedRoute>
          } />

          <Route path="/checkout/success" element={
            <ProtectedRoute>
              <CheckoutSuccess />
            </ProtectedRoute>
          } />

          <Route path="/checkout/cancel" element={
            <ProtectedRoute>
              <CheckoutCancel />
            </ProtectedRoute>
          } />

          {/* Admin */}
          <Route path="/admin" element={
            <AdminRoute>
              <ErrorBoundary fallback={<div className="p-4">Admin dashboard encountered an error. Please refresh the page.</div>}>
                <AdminDashboard />
              </ErrorBoundary>
            </AdminRoute>
          } />
          <Route path="/admin/:section" element={
            <AdminRoute>
              <ErrorBoundary fallback={<div className="p-4">Admin dashboard encountered an error. Please refresh the page.</div>}>
                <AdminDashboard />
              </ErrorBoundary>
            </AdminRoute>
          } />
          <Route path="/admin/:section/:sub" element={
            <AdminRoute>
              <ErrorBoundary fallback={<div className="p-4">Admin dashboard encountered an error. Please refresh the page.</div>}>
                <AdminDashboard />
              </ErrorBoundary>
            </AdminRoute>
          } />

          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </main>
      </PageTransition>
      <Toaster />
    </div>
  );
}

function AppWithProviders() {
  return (
    <Sentry.ErrorBoundary
      fallback={(errorData: any) => {
        const error: Error = (errorData && 'error' in errorData && errorData.error instanceof Error)
          ? errorData.error
          : new Error('Unknown error');
        const componentStack = (errorData && 'componentStack' in errorData) ? String(errorData.componentStack) : '';
        const resetError = (errorData && 'resetError' in errorData && typeof errorData.resetError === 'function')
          ? errorData.resetError
          : () => { };

        return (
          <ErrorBoundary
            error={error}
            componentStack={componentStack}
            resetError={resetError}
          />
        );
      }}
      showDialog
    >
      <Router>
        <ErrorBoundary>
          <AuthProvider>
            <SubscriptionProvider>
              <ThemeProvider>
                <LearningFocusProvider>
                  <App />
                </LearningFocusProvider>
              </ThemeProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </ErrorBoundary>
      </Router>
    </Sentry.ErrorBoundary>
  );
}

export default AppWithProviders;
