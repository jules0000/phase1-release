import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Sparkles, BookOpen, Target, Trophy, Users, Crown, Loader2, AlertCircle, Triangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import apiService from "@/lib/api";
import neuralLogo from "@/assets/neural-logo.png";
import { Link } from "react-router-dom";

interface FormErrors {
  email?: string;
  password?: string;
  username?: string;
  fullName?: string;
}

export function LandingPage() {
  const [activeTab, setActiveTab] = useState("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const { toast } = useToast();
  const { login } = useAuth();

  // Force light mode for login page
  useEffect(() => {
    // Store the current theme
    const currentTheme = document.documentElement.getAttribute('data-theme');

    // Force light mode
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');

    // Cleanup function to restore theme when component unmounts
    return () => {
      if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        } else {
          document.documentElement.classList.add('light');
          document.documentElement.classList.remove('dark');
        }
      }
    };
  }, []);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    username: "",
    fullName: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user types
    if (errors[e.target.name as keyof FormErrors]) {
      setErrors({ ...errors, [e.target.name]: undefined });
    }
  };

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Password strength calculation
  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: "", color: "" };

    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    const labels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
    const colors = ["", "text-red-600", "text-orange-600", "text-yellow-600", "text-green-600", "text-green-700"];

    return {
      strength,
      label: labels[strength] || "",
      color: colors[strength] || ""
    };
  };

  // Real-time validation
  const validateForm = (isSignUp: boolean = false): boolean => {
    const newErrors: FormErrors = {};

    // Email validation
    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    // Sign-up specific validations
    if (isSignUp) {
      if (!formData.username) {
        newErrors.username = "Username is required";
      } else if (formData.username.length < 3) {
        newErrors.username = "Username must be at least 3 characters";
      } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
        newErrors.username = "Username can only contain letters, numbers, and underscores";
      }

      if (!formData.fullName) {
        newErrors.fullName = "Full name is required";
      } else if (formData.fullName.length < 2) {
        newErrors.fullName = "Full name must be at least 2 characters";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm(false)) {
      return;
    }

    setIsLoading(true);

    try {
      await login(formData.email, formData.password);
      toast({
        title: "Welcome back!",
        description: "Successfully logged in to Neural AI Learning Platform"
      });
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message || "Please check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm(true)) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiService.register(
        formData.email,
        formData.password,
        formData.fullName,
        formData.username
      );

      // If registration successful, automatically log in
      if (response.access_token && response.user) {
        await login(formData.email, formData.password);
        toast({
          title: "Welcome!",
          description: "Account created successfully. Welcome to Neural AI Learning Platform!"
        });
      } else {
        throw new Error("Registration failed - invalid response from server");
      }
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || "Please try again with different credentials.";
      toast({
        title: "Sign up failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = activeTab === "signup" ? getPasswordStrength(formData.password) : null;

  return (
    <div className="min-h-screen bg-[#FFF8E7] light-mode-only relative overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Strict Grid System - Invisible but structural */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(to right, transparent 0%, transparent calc(50% - 1px), #000 50%, transparent calc(50% + 1px), transparent 100%)',
        backgroundSize: '100% 100%'
      }}></div>

      {/* Decorative Geometry - Non-interactive, Visual Rhythm */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Geometric ornaments following visual rhythm */}
        <div className="absolute top-16 right-16 w-16 h-16 bg-[#FFD700] border-[3px] border-black transform rotate-12"></div>
        <div className="absolute top-32 left-12 w-12 h-12 bg-[#FF6B6B] border-[3px] border-black transform -rotate-6"></div>
        <div className="absolute bottom-32 right-24 w-10 h-10 bg-[#4ECDC4] border-[3px] border-black transform rotate-45"></div>
        <div className="absolute top-1/2 left-8 w-8 h-8 bg-[#95E1D3] border-[2px] border-black transform rotate-12"></div>
        <div className="absolute bottom-20 left-1/4 w-6 h-6 bg-[#FFD700] border-[2px] border-black"></div>
      </div>

      {/* Neobrutalist Split Layout - Grid Discipline */}
      <div className="min-h-screen flex flex-col lg:flex-row relative z-10">
        {/* Mobile Hero - Neobrutalist Design System Implementation */}
        <div className="lg:hidden bg-[#FF6B3D] relative overflow-hidden" style={{ fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif" }}>
          {/* Decorative Geometry Layer - Absolute positioned, non-overlapping */}
          <div className="absolute top-12 right-8 w-12 h-12 bg-[#FFF3E0] border-[3px] border-black pointer-events-none"></div>
          <div className="absolute top-16 right-12 w-10 h-10 bg-[#FFF3E0] border-[3px] border-black pointer-events-none"></div>
          <div className="absolute top-20 right-10 w-8 h-8 bg-[#3DDAD7] border-[3px] border-black transform rotate-45 pointer-events-none"></div>
          <div className="absolute bottom-24 left-5 w-12 h-12 bg-[#FFD400] border-[3px] border-black transform -rotate-6 pointer-events-none"></div>
          <div className="absolute bottom-32 left-8 w-8 h-8 bg-[#FFF3E0] border-[3px] border-black pointer-events-none"></div>
          
          <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 py-12 sm:py-16 relative z-10">
            {/* Brand Header Block - Rotated for human imperfection */}
            <div className="mb-10 sm:mb-12 relative inline-block">
              {/* Yellow Pin Flag - Structural element */}
              <div className="absolute -top-4 -left-4 z-20 pointer-events-none">
                <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-b-[18px] border-b-[#FFD400] border-t-0"></div>
                <div className="absolute top-[18px] left-1/2 transform -translate-x-1/2 w-[24px] h-[5px] bg-[#FFD400] border-[3px] border-black"></div>
              </div>
              
              {/* Logo Card - Cream background, 3px border, -1.5deg rotation */}
              <div className="bg-[#FFF3E0] border-[3px] border-black p-4 sm:p-6 transform rotate-[-1.5deg] relative z-10 inline-block">
                <img
                  src={neuralLogo}
                  alt="Neural AI Logo"
                  className="h-20 sm:h-24 w-auto"
                />
              </div>
            </div>
            
            {/* Hero Headline - Center Authority, Typography Power */}
            <div className="mb-8 sm:mb-10 text-center max-w-lg px-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-3 text-black leading-[1.1] uppercase" style={{ 
                fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                fontWeight: 900,
                letterSpacing: '-0.02em'
              }}>
                MASTER AI
              </h1>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-0 text-black leading-[1.1] uppercase" style={{ 
                fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                fontWeight: 900,
                letterSpacing: '-0.02em'
              }}>
                WITH NEURAL
              </h1>
            </div>
            
            {/* Value Proposition Box - Poster Caption Style */}
            <div className="bg-[#FFF3E0] border-[3px] border-black px-6 py-5 mb-10 sm:mb-12 max-w-lg w-full">
              <p className="text-sm sm:text-base font-bold text-black leading-[1.2] text-center" style={{ 
                fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif"
              }}>
                Unlock the power of artificial intelligence through interactive learning, hands-on practice, and expert guidance.
              </p>
            </div>
            
            {/* Feature Icons - Structured Brutalism, 3-up Grid */}
            <div className="grid grid-cols-3 gap-4 sm:gap-6 max-w-lg w-full">
              <div className="flex flex-col items-center gap-3">
                <div className="bg-[#FFF3E0] border-[3px] border-black w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 sm:h-10 sm:w-10 text-black" strokeWidth={3} />
                </div>
                <span className="text-xs sm:text-sm font-black text-black uppercase text-center" style={{ 
                  fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                  fontWeight: 900
                }}>AI-POWERED</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="bg-[#FFF3E0] border-[3px] border-black w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
                  <BookOpen className="h-8 w-8 sm:h-10 sm:w-10 text-black" strokeWidth={3} />
                </div>
                <span className="text-xs sm:text-sm font-black text-black uppercase text-center" style={{ 
                  fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                  fontWeight: 900
                }}>INTERACTIVE</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="bg-[#FFF3E0] border-[3px] border-black w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
                  <Trophy className="h-8 w-8 sm:h-10 sm:w-10 text-black" strokeWidth={3} />
                </div>
                <span className="text-xs sm:text-sm font-black text-black uppercase text-center" style={{ 
                  fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                  fontWeight: 900
                }}>CERTIFIED</span>
              </div>
            </div>
          </div>
        </div>

        {/* Left Side - Branding (Desktop) - Neobrutalist Design System */}
        <div className="hidden lg:flex lg:w-1/2 bg-[#FF6B3D] relative overflow-hidden" style={{ fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif" }}>
          {/* Decorative Geometry Layer - Absolute positioned, non-overlapping */}
          <div className="absolute top-20 right-24 w-16 h-16 bg-[#FFF3E0] border-[3px] border-black pointer-events-none"></div>
          <div className="absolute top-28 right-28 w-12 h-12 bg-[#FFF3E0] border-[3px] border-black pointer-events-none"></div>
          <div className="absolute top-32 right-24 w-10 h-10 bg-[#3DDAD7] border-[3px] border-black transform rotate-45 pointer-events-none"></div>
          <div className="absolute bottom-32 left-16 w-20 h-20 bg-[#FFD400] border-[3px] border-black transform -rotate-6 pointer-events-none"></div>
          <div className="absolute bottom-20 left-32 w-12 h-12 bg-[#FFF3E0] border-[3px] border-black transform -rotate-12 pointer-events-none"></div>
          
          <div className="flex flex-col justify-center items-center p-12 text-center w-full relative z-10">
            {/* Brand Header Block - Rotated for human imperfection */}
            <div className="mb-14 relative inline-block">
              {/* Yellow Pin Flag - Structural element */}
              <div className="absolute -top-5 -left-5 z-20 pointer-events-none">
                <div className="w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-b-[22px] border-b-[#FFD400] border-t-0"></div>
                <div className="absolute top-[22px] left-1/2 transform -translate-x-1/2 w-[32px] h-[6px] bg-[#FFD400] border-[3px] border-black"></div>
              </div>
              
              {/* Logo Card - Cream background, 3px border, -1.5deg rotation */}
              <div className="bg-[#FFF3E0] border-[3px] border-black p-6 transform rotate-[-1.5deg] relative z-10 inline-block">
                <img
                  src={neuralLogo}
                  alt="Neural AI Logo"
                  className="h-32 w-auto"
                />
              </div>
            </div>
            
            {/* Hero Headline - Center Authority, Typography Power */}
            <div className="mb-12 max-w-3xl">
              <h1 className="text-7xl font-black mb-4 text-black leading-[1.1] uppercase" style={{ 
                fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                fontWeight: 900,
                letterSpacing: '-0.02em'
              }}>
                MASTER AI
              </h1>
              <h1 className="text-7xl font-black mb-0 text-black leading-[1.1] uppercase" style={{ 
                fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                fontWeight: 900,
                letterSpacing: '-0.02em'
              }}>
                WITH NEURAL
              </h1>
            </div>
            
            {/* Value Proposition Box - Poster Caption Style */}
            <div className="bg-[#FFF3E0] border-[3px] border-black px-10 py-7 mb-14 max-w-2xl w-full">
              <p className="text-lg font-bold text-black leading-[1.2] text-center" style={{ 
                fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif"
              }}>
                Unlock the power of artificial intelligence through interactive learning, hands-on practice, and expert guidance.
              </p>
            </div>
            
            {/* Feature Icons - Structured Brutalism, 3-up Grid */}
            <div className="grid grid-cols-3 gap-10 max-w-3xl w-full">
              <div className="flex flex-col items-center gap-4">
                <div className="bg-[#FFF3E0] border-[3px] border-black w-28 h-28 flex items-center justify-center">
                  <Sparkles className="h-14 w-14 text-black" strokeWidth={3} />
                </div>
                <span className="text-sm text-black font-black uppercase text-center" style={{ 
                  fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                  fontWeight: 900
                }}>AI-POWERED</span>
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="bg-[#FFF3E0] border-[3px] border-black w-28 h-28 flex items-center justify-center">
                  <BookOpen className="h-14 w-14 text-black" strokeWidth={3} />
                </div>
                <span className="text-sm text-black font-black uppercase text-center" style={{ 
                  fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                  fontWeight: 900
                }}>INTERACTIVE</span>
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="bg-[#FFF3E0] border-[3px] border-black w-28 h-28 flex items-center justify-center">
                  <Trophy className="h-14 w-14 text-black" strokeWidth={3} />
                </div>
                <span className="text-sm text-black font-black uppercase text-center" style={{ 
                  fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
                  fontWeight: 900
                }}>CERTIFIED</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Auth Form - Neobrutalist: Flat, Heavy Strokes */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-8 bg-[#FFF8E7] relative">
          {/* Decorative geometry - visual rhythm */}
          <div className="absolute top-12 left-6 w-10 h-10 bg-[#FFD700] border-[3px] border-black transform rotate-12 hidden lg:block"></div>
          <div className="absolute bottom-24 right-10 w-8 h-8 bg-[#FF6B35] border-[3px] border-black transform -rotate-6 hidden lg:block"></div>
          
          <div className="w-full max-w-md relative z-10">
            <Card className="bg-[#FFF8E7] border-[3px] border-black overflow-hidden relative">
              {/* Decorative corner elements - visual rhythm */}
              <div className="absolute top-3 right-3 w-5 h-5 bg-[#FFD700] border-[2px] border-black transform rotate-45"></div>
              <div className="absolute bottom-3 left-3 w-4 h-4 bg-[#4ECDC4] border-[2px] border-black transform -rotate-12"></div>
              
              <CardHeader className="text-center bg-[#FF6B35] text-black p-6 sm:p-8 border-b-[3px] border-black relative">
                {/* Decorative elements */}
                <div className="absolute top-4 left-4 w-3 h-3 bg-[#FFF8E7] border-[2px] border-black"></div>
                <div className="absolute top-4 right-4 w-3 h-3 bg-[#FFF8E7] border-[2px] border-black"></div>
                
                <div>
                  {/* Icon - Enhanced Neobrutalist Style */}
                  <div className="mb-5 sm:mb-6 flex justify-center relative">
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-accent border-2 border-foreground"></div>
                    <div className="bg-background border-6 border-foreground p-4 transform hover:translate-x-2 hover:translate-y-2 transition-transform relative z-10" style={{ boxShadow: '8px 8px 0px 0px hsl(var(--foreground))' }}>
                      <div className="bg-primary border-3 border-foreground p-2">
                        <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-foreground" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Title - Bold Neobrutalist Typography */}
                  <CardTitle className="text-2xl sm:text-3xl lg:text-4xl text-foreground mb-3 font-black tracking-tight uppercase leading-tight" style={{
                    textShadow: '4px 4px 0px hsl(var(--muted))',
                    letterSpacing: '-0.02em'
                  }}>
                    JOIN THE MASTERY
                  </CardTitle>
                  
                  {/* Description - Neobrutalist Box */}
                  <CardDescription className="text-foreground font-black text-sm sm:text-base lg:text-lg uppercase leading-tight">
                    Start your AI prompting journey today
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-5 sm:p-6 lg:p-7 bg-[#FFF8E7] relative">
                {/* Decorative elements - visual rhythm */}
                <div className="absolute top-2 right-2 w-3 h-3 bg-[#FFD700] border-[2px] border-black"></div>
                <div className="absolute bottom-2 left-2 w-3 h-3 bg-[#FF6B35] border-[2px] border-black"></div>
                
                <Tabs defaultValue="signin" value={activeTab} onValueChange={setActiveTab} className="w-full">
                  {/* Tab Design - Pill-shaped, Heavy Strokes, Yellow Active */}
                  <TabsList className="grid w-full grid-cols-2 mb-6 sm:mb-8 h-12 sm:h-14 bg-[#E8E8E8] border-[3px] border-black p-1 gap-1 relative">
                    {/* Decorative corner */}
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#FFD700] border-[2px] border-black"></div>
                    <TabsTrigger
                      value="signin"
                      className="font-black text-xs sm:text-sm uppercase tracking-wide data-[state=active]:bg-[#FFD700] data-[state=active]:text-black data-[state=active]:border-[3px] data-[state=active]:border-black transition-all duration-150 border-[3px] border-transparent data-[state=active]:translate-x-0.5 data-[state=active]:translate-y-0.5 rounded-none"
                      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                    >
                      SIGN IN
                    </TabsTrigger>
                    <TabsTrigger
                      value="signup"
                      className="font-black text-xs sm:text-sm uppercase tracking-wide data-[state=active]:bg-[#FFD700] data-[state=active]:text-black data-[state=active]:border-[3px] data-[state=active]:border-black transition-all duration-150 border-[3px] border-transparent data-[state=active]:translate-x-0.5 data-[state=active]:translate-y-0.5 rounded-none"
                      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                    >
                      SIGN UP
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="signin" className="space-y-4 sm:space-y-5 mt-0">
                    <form onSubmit={handleSignIn} className="space-y-4 sm:space-y-5">
                      <div className="space-y-2.5 relative">
                        {/* Decorative element - visual rhythm */}
                        <div className="absolute -left-2 top-8 w-3 h-3 bg-[#FFD700] border-[2px] border-black transform rotate-45"></div>
                        
                        <Label htmlFor="signin-email" className="font-black text-sm text-foreground flex items-center gap-2 uppercase">
                          <div className="bg-primary border-2 border-foreground p-1">
                            <Mail className="w-3 h-3 text-foreground" aria-hidden="true" />
                          </div>
                          Email Address
                        </Label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary/70 z-10 pointer-events-none flex items-center justify-center">
                            <Mail className="w-5 h-5" aria-hidden="true" />
                          </div>
                          <Input
                            id="signin-email"
                            name="email"
                            type="email"
                            placeholder="your.email@example.com"
                            value={formData.email}
                            onChange={handleInputChange}
                            onBlur={() => validateForm(false)}
                            required
                            disabled={isLoading}
                            className={`pl-11 h-11 sm:h-12 border-4 focus:border-foreground transition-all bg-background ${errors.email ? "border-destructive" : "border-foreground"}`}
                            style={{ boxShadow: errors.email ? '4px 4px 0px 0px hsl(var(--destructive))' : '4px 4px 0px 0px hsl(var(--foreground))' }}
                            aria-invalid={errors.email ? "true" : "false"}
                            aria-describedby={errors.email ? "signin-email-error" : undefined}
                          />
                        </div>
                        {errors.email && (
                          <p id="signin-email-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errors.email}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2.5 relative">
                        {/* Decorative element - visual rhythm */}
                        <div className="absolute -right-2 top-8 w-3 h-3 bg-[#FF6B35] border-[2px] border-black transform -rotate-45"></div>
                        
                        <Label htmlFor="signin-password" className="font-black text-sm text-black flex items-center gap-2 uppercase" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          <div className="bg-[#FF6B35] border-[2px] border-black p-1">
                            <Lock className="w-3 h-3 text-black" aria-hidden="true" strokeWidth={2.5} />
                          </div>
                          Password
                        </Label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/60 z-10 pointer-events-none flex items-center justify-center">
                            <Lock className="w-5 h-5" aria-hidden="true" strokeWidth={2} />
                          </div>
                          <Input
                            id="signin-password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            value={formData.password}
                            onChange={handleInputChange}
                            onBlur={() => validateForm(false)}
                            required
                            disabled={isLoading}
                            className={`pl-11 pr-12 h-11 sm:h-12 border-[3px] focus:border-black transition-all bg-[#FFF8E7] rounded-none ${errors.password ? "border-red-600" : "border-black"}`}
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                            aria-invalid={errors.password ? "true" : "false"}
                            aria-describedby={errors.password ? "signin-password-error" : undefined}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-10 w-10 p-0 min-w-[44px] touch-manipulation rounded-none border-[2px] border-black hover:bg-[#E8E8E8]"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="w-5 h-5 text-black" aria-hidden="true" strokeWidth={2} /> : <Eye className="w-5 h-5 text-black" aria-hidden="true" strokeWidth={2} />}
                          </Button>
                        </div>
                        {errors.password && (
                          <p id="signin-password-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errors.password}
                          </p>
                        )}
                        <div className="text-right pt-1">
                          <Link
                            to="/password-reset"
                            className="text-sm text-[#FF6B35] hover:text-[#FF6B35]/80 hover:underline font-bold touch-manipulation transition-colors"
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                            aria-label="Reset your password"
                          >
                            Forgot password?
                          </Link>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        variant="neural"
                        size="lg"
                        className="w-full h-12 sm:h-14 font-black text-base sm:text-lg uppercase tracking-wide mt-6 bg-[#FFD700] text-black hover:bg-[#FFD700]/90 border-[3px] border-black transform hover:translate-x-1 hover:translate-y-1 active:translate-x-2 active:translate-y-2 transition-transform relative rounded-none"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                        disabled={isLoading}
                      >
                        {/* Decorative corner elements */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 bg-[#4ECDC4] border-[2px] border-black"></div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#FF6B6B] border-[2px] border-black"></div>
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin mr-2 relative z-10" aria-hidden="true" />
                            <span className="relative z-10">SIGNING IN...</span>
                          </>
                        ) : (
                          <>
                            <span className="relative z-10">SIGN IN</span>
                            <ArrowRight className="w-5 h-5 ml-2 relative z-10" aria-hidden="true" strokeWidth={2.5} />
                          </>
                        )}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup" className="space-y-4 sm:space-y-5 mt-0">
                    <form onSubmit={handleSignUp} className="space-y-4 sm:space-y-5">
                      <div className="space-y-2.5">
                        <Label htmlFor="signup-email" className="font-black text-sm text-black flex items-center gap-2 uppercase" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          <div className="bg-[#FF6B35] border-[2px] border-black p-1">
                            <Mail className="w-3 h-3 text-black" aria-hidden="true" strokeWidth={2.5} />
                          </div>
                          Email Address
                        </Label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/60 z-10 pointer-events-none flex items-center justify-center">
                            <Mail className="w-5 h-5" aria-hidden="true" strokeWidth={2} />
                          </div>
                          <Input
                            id="signup-email"
                            name="email"
                            type="email"
                            placeholder="your.email@example.com"
                            value={formData.email}
                            onChange={handleInputChange}
                            onBlur={() => validateForm(true)}
                            required
                            disabled={isLoading}
                            className={`pl-11 h-11 sm:h-12 border-[3px] focus:border-black transition-all bg-[#FFF8E7] rounded-none ${errors.email ? "border-red-600" : "border-black"}`}
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                            aria-invalid={errors.email ? "true" : "false"}
                            aria-describedby={errors.email ? "signup-email-error" : undefined}
                          />
                        </div>
                        {errors.email && (
                          <p id="signup-email-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errors.email}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        <Label htmlFor="signup-username" className="font-black text-sm text-black flex items-center gap-2 uppercase" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          <div className="bg-[#FF6B35] border-[2px] border-black p-1">
                            <User className="w-3 h-3 text-black" aria-hidden="true" strokeWidth={2.5} />
                          </div>
                          Username
                        </Label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/60 z-10 pointer-events-none flex items-center justify-center">
                            <User className="w-5 h-5" aria-hidden="true" strokeWidth={2} />
                          </div>
                          <Input
                            id="signup-username"
                            name="username"
                            type="text"
                            placeholder="Choose a username"
                            value={formData.username}
                            onChange={handleInputChange}
                            onBlur={() => validateForm(true)}
                            required
                            disabled={isLoading}
                            minLength={3}
                            pattern="[a-zA-Z0-9_]+"
                            className={`pl-11 h-11 sm:h-12 border-[3px] focus:border-black transition-all bg-[#FFF8E7] rounded-none ${errors.username ? "border-red-600" : "border-black"}`}
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                            aria-invalid={errors.username ? "true" : "false"}
                            aria-describedby={errors.username ? "signup-username-error" : undefined}
                          />
                        </div>
                        {errors.username && (
                          <p id="signup-username-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errors.username}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Letters, numbers, and underscores only (min. 3 characters)
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        <Label htmlFor="signup-fullname" className="font-black text-sm text-black flex items-center gap-2 uppercase" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          <div className="bg-[#FF6B35] border-[2px] border-black p-1">
                            <User className="w-3 h-3 text-black" aria-hidden="true" strokeWidth={2.5} />
                          </div>
                          Full Name
                        </Label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/60 z-10 pointer-events-none flex items-center justify-center">
                            <User className="w-5 h-5" aria-hidden="true" strokeWidth={2} />
                          </div>
                          <Input
                            id="signup-fullname"
                            name="fullName"
                            type="text"
                            placeholder="Enter your full name"
                            value={formData.fullName}
                            onChange={handleInputChange}
                            onBlur={() => validateForm(true)}
                            required
                            disabled={isLoading}
                            minLength={2}
                            className={`pl-11 h-11 sm:h-12 border-[3px] focus:border-black transition-all bg-[#FFF8E7] rounded-none ${errors.fullName ? "border-red-600" : "border-black"}`}
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                            aria-invalid={errors.fullName ? "true" : "false"}
                            aria-describedby={errors.fullName ? "signup-fullname-error" : undefined}
                          />
                        </div>
                        {errors.fullName && (
                          <p id="signup-fullname-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errors.fullName}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        <Label htmlFor="signup-password" className="font-black text-sm text-black flex items-center gap-2 uppercase" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          <div className="bg-[#FF6B35] border-[2px] border-black p-1">
                            <Lock className="w-3 h-3 text-black" aria-hidden="true" strokeWidth={2.5} />
                          </div>
                          Password
                        </Label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-black/60 z-10 pointer-events-none flex items-center justify-center">
                            <Lock className="w-5 h-5" aria-hidden="true" strokeWidth={2} />
                          </div>
                          <Input
                            id="signup-password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a strong password"
                            value={formData.password}
                            onChange={handleInputChange}
                            onBlur={() => validateForm(true)}
                            required
                            disabled={isLoading}
                            minLength={6}
                            className={`pl-11 pr-12 h-11 sm:h-12 border-[3px] focus:border-black transition-all bg-[#FFF8E7] rounded-none ${errors.password ? "border-red-600" : "border-black"}`}
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                            aria-invalid={errors.password ? "true" : "false"}
                            aria-describedby={errors.password ? "signup-password-error" : "signup-password-strength"}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-10 w-10 p-0 min-w-[44px] touch-manipulation rounded-none border-[2px] border-black hover:bg-[#E8E8E8]"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="w-5 h-5 text-black" aria-hidden="true" strokeWidth={2} /> : <Eye className="w-5 h-5 text-black" aria-hidden="true" strokeWidth={2} />}
                          </Button>
                        </div>
                        {errors.password && (
                          <p id="signup-password-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" />
                            {errors.password}
                          </p>
                        )}
                        {passwordStrength && formData.password && (
                          <div id="signup-password-strength" className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-[#E8E8E8] border-[2px] border-black overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${passwordStrength.strength <= 1
                                    ? "bg-[#FF6B6B]"
                                    : passwordStrength.strength <= 2
                                      ? "bg-[#FF6B35]"
                                      : passwordStrength.strength <= 3
                                        ? "bg-[#FFD700]"
                                        : passwordStrength.strength <= 4
                                          ? "bg-[#4ECDC4]"
                                          : "bg-[#95E1D3]"
                                    }`}
                                  style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                                />
                              </div>
                              {passwordStrength.label && (
                                <span className={`text-xs font-black border-[2px] border-black px-2 py-0.5 ${passwordStrength.strength <= 1
                                  ? "bg-[#FF6B6B] text-black"
                                  : passwordStrength.strength <= 2
                                    ? "bg-[#FF6B35] text-black"
                                    : passwordStrength.strength <= 3
                                      ? "bg-[#FFD700] text-black"
                                      : passwordStrength.strength <= 4
                                        ? "bg-[#4ECDC4] text-black"
                                        : "bg-[#95E1D3] text-black"
                                  }`} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                  {passwordStrength.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-black font-bold" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                              Minimum 6 characters required. Use uppercase, lowercase, numbers, and symbols for a stronger password.
                            </p>
                          </div>
                        )}
                      </div>

                      <Button
                        type="submit"
                        variant="neural"
                        size="lg"
                        className="w-full h-12 sm:h-14 font-black text-base sm:text-lg uppercase tracking-wide mt-6 bg-[#FFD700] text-black hover:bg-[#FFD700]/90 border-[3px] border-black transform hover:translate-x-1 hover:translate-y-1 active:translate-x-2 active:translate-y-2 transition-transform relative rounded-none"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                        disabled={isLoading}
                      >
                        {/* Decorative corner elements */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 bg-[#4ECDC4] border-[2px] border-black"></div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#FF6B6B] border-[2px] border-black"></div>
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin mr-2 relative z-10" aria-hidden="true" />
                            <span className="relative z-10">CREATING ACCOUNT...</span>
                          </>
                        ) : (
                          <>
                            <span className="relative z-10">CREATE ACCOUNT</span>
                            <Crown className="w-5 h-5 ml-2 relative z-10" aria-hidden="true" strokeWidth={2.5} />
                          </>
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>

              <CardFooter className="border-t-6 border-foreground bg-muted p-5 sm:p-6">
                <p className="text-center text-xs sm:text-sm text-foreground w-full leading-relaxed font-bold">
                  By signing up, you agree to our{" "}
                  <Link to="/terms" className="text-primary hover:text-primary/80 hover:underline font-black transition-colors touch-manipulation uppercase">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary hover:text-primary/80 hover:underline font-black transition-colors touch-manipulation uppercase">
                    Privacy Policy
                  </Link>
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}