import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Brain, Zap, Target, Crown, ArrowLeft, Mail, Lock, User, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import apiService from "@/lib/api";

interface FormErrors {
  email?: string;
  password?: string;
  username?: string;
  fullName?: string;
}

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [activeTab, setActiveTab] = useState("signin");
  const { login } = useAuth();
  const { toast } = useToast();

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
    if (!email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Password validation
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    // Sign-up specific validations
    if (isSignUp) {
      if (!username) {
        newErrors.username = "Username is required";
      } else if (username.length < 3) {
        newErrors.username = "Username must be at least 3 characters";
      } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        newErrors.username = "Username can only contain letters, numbers, and underscores";
      }

      if (!fullName) {
        newErrors.fullName = "Full name is required";
      } else if (fullName.length < 2) {
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

    setLoading(true);

    const timeoutId = setTimeout(() => setLoading(false), 10000);

    try {
      await login(email, password);
      clearTimeout(timeoutId);
      toast({
        title: "Welcome back!",
        description: "Successfully signed in to your account.",
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      toast({
        title: "Sign in failed",
        description: error.message || "Please check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm(true)) {
      return;
    }

    setLoading(true);

    const timeoutId = setTimeout(() => setLoading(false), 10000);

    try {
      const response = await apiService.register(email, password, fullName, username);

      // If registration successful, automatically log in
      if (response.access_token && response.user) {
        await login(email, password);
        clearTimeout(timeoutId);
        toast({
          title: "Account created!",
          description: "Welcome to the AI Prompt Mastery platform.",
        });
      } else {
        throw new Error("Registration failed - invalid response from server");
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error?.message || error?.error?.message || "Please try again with different credentials.";
      toast({
        title: "Sign up failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = activeTab === "signup" ? getPasswordStrength(password) : null;

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 relative overflow-hidden">
      {/* Enhanced Background Elements */}
      <div className="absolute inset-0">
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 animate-pulse" />
        {/* Geometric pattern overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)`,
        }} />
        {/* Radial gradients for depth */}
        <div className="absolute top-0 left-0 w-full h-full" style={{
          background: 'radial-gradient(circle at top left, hsl(var(--primary) / 0.2), transparent 50%)'
        }} />
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2" style={{
          background: 'radial-gradient(circle at bottom right, hsl(var(--secondary) / 0.15), transparent 50%)'
        }} />
      </div>

      {/* Back Button - Responsive positioning */}
      <Link
        to="/"
        className="absolute top-3 left-3 sm:top-4 sm:left-4 md:top-6 md:left-6 z-10"
        aria-label="Back to home"
      >
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-white hover:text-white/80 hover:bg-primary/20 h-10 sm:h-11 px-3 sm:px-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Back to Home</span>
          <span className="sm:hidden">Back</span>
        </Button>
      </Link>

      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 items-center">
        {/* Left Side - Branding (Hidden on mobile, condensed on tablet) */}
        <div className="hidden md:block space-y-4 sm:space-y-6 lg:space-y-8 text-center lg:text-left relative z-10">
          <div className="space-y-3 sm:space-y-4 lg:space-y-5">
            <Badge variant="outline" className="bg-background/95 backdrop-blur-sm border-4 border-primary/30 text-xs sm:text-sm lg:text-base px-3 sm:px-4 lg:px-5 py-1.5 sm:py-2 lg:py-2.5 shadow-brutal hover:shadow-brutal-lg transition-all">
              <Brain className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 mr-2 animate-pulse" aria-hidden="true" />
              AI PROMPT MASTERY
            </Badge>

            <div className="space-y-2 sm:space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-black text-white leading-tight drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]">
                MASTER YOUR
                <span className="block text-white bg-gradient-to-r from-white via-primary-foreground to-white bg-clip-text text-transparent">
                  AI SKILLS
                </span>
              </h1>
            </div>

            <p className="text-sm sm:text-base lg:text-lg xl:text-xl text-white/95 font-bold max-w-md mx-auto lg:mx-0 leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]">
              Master the art of AI prompting with interactive lessons, skill trees, and real-world challenges.
            </p>
          </div>

          {/* Feature Highlights - Enhanced design */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5 max-w-lg mx-auto lg:max-w-none lg:mx-0">
            <Card className="bg-background/95 backdrop-blur-sm border-4 border-primary/20 hover:border-primary/40 shadow-brutal hover:shadow-brutal-lg transition-all group">
              <CardContent className="p-3 sm:p-4 lg:p-5 text-center">
                <div className="mb-2 sm:mb-3 flex justify-center">
                  <div className="p-2 sm:p-3 bg-primary/10 border-4 border-primary/20 rounded-none group-hover:bg-primary/20 transition-colors">
                    <Target className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="font-black text-xs sm:text-sm lg:text-base text-foreground uppercase tracking-wider mb-1">STRUCTURED LEARNING</h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Progress through skill trees</p>
              </CardContent>
            </Card>

            <Card className="bg-background/95 backdrop-blur-sm border-4 border-primary/20 hover:border-primary/40 shadow-brutal hover:shadow-brutal-lg transition-all group">
              <CardContent className="p-3 sm:p-4 lg:p-5 text-center">
                <div className="mb-2 sm:mb-3 flex justify-center">
                  <div className="p-2 sm:p-3 bg-primary/10 border-4 border-primary/20 rounded-none group-hover:bg-primary/20 transition-colors">
                    <Zap className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="font-black text-xs sm:text-sm lg:text-base text-foreground uppercase tracking-wider mb-1">HANDS-ON PRACTICE</h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Real AI challenges</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Mobile Branding - Compact version */}
        <div className="md:hidden text-center mb-4 space-y-3 relative z-10">
          <Badge variant="outline" className="bg-background/95 backdrop-blur-sm border-4 border-primary/30 text-xs px-3 py-1.5 shadow-brutal">
            <Brain className="w-4 h-4 mr-2" aria-hidden="true" />
            AI PROMPT MASTERY
          </Badge>
          <h2 className="text-xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            MASTER YOUR AI SKILLS
          </h2>
        </div>

        {/* Right Side - Auth Forms */}
        <Card className="bg-background shadow-brutal-lg border-4 border-border w-full max-w-md mx-auto lg:max-w-none relative z-10 hover:shadow-brutal-lg transition-shadow">
          <CardHeader className="text-center bg-gradient-to-br from-primary via-primary to-secondary text-white p-5 sm:p-6 lg:p-7 relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12" />
            <div className="relative z-10">
              <div className="mb-3 sm:mb-4 flex justify-center">
                <div className="p-3 sm:p-4 bg-white/10 border-4 border-white/20 rounded-none backdrop-blur-sm">
                  <Crown className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-white drop-shadow-lg" aria-hidden="true" />
                </div>
              </div>
              <CardTitle className="text-xl sm:text-2xl lg:text-3xl text-white mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">JOIN THE MASTERY</CardTitle>
              <CardDescription className="text-white/95 font-bold text-sm sm:text-base lg:text-lg">
                Start your AI prompting journey today
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6 lg:p-7 bg-gradient-to-b from-background to-muted/30">
            <Tabs defaultValue="signin" value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-5 sm:mb-6 h-14 bg-muted/50 border-4 border-border">
                <TabsTrigger
                  value="signin"
                  className="font-black text-xs sm:text-sm uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-brutal transition-all"
                >
                  SIGN IN
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="font-black text-xs sm:text-sm uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-brutal transition-all"
                >
                  SIGN UP
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-3 sm:space-y-4">
                <form onSubmit={handleSignIn} className="space-y-3 sm:space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="font-black uppercase tracking-wider text-xs sm:text-sm text-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4 text-primary" aria-hidden="true" />
                      Email Address
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary z-10 pointer-events-none flex items-center justify-center">
                        <Mail className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="your.email@example.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) {
                            setErrors({ ...errors, email: undefined });
                          }
                        }}
                        onBlur={() => validateForm(false)}
                        required
                        disabled={loading}
                        className={`pl-12 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
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

                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="font-black uppercase tracking-wider text-xs sm:text-sm text-foreground flex items-center gap-2">
                      <Lock className="w-4 h-4 text-primary" aria-hidden="true" />
                      Password
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary z-10 pointer-events-none flex items-center justify-center">
                        <Lock className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errors.password) {
                            setErrors({ ...errors, password: undefined });
                          }
                        }}
                        onBlur={() => validateForm(false)}
                        required
                        disabled={loading}
                        className={`pl-12 pr-12 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        aria-invalid={errors.password ? "true" : "false"}
                        aria-describedby={errors.password ? "signin-password-error" : undefined}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 h-11 w-11 p-0 min-w-[44px] touch-manipulation"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                      </Button>
                    </div>
                    {errors.password && (
                      <p id="signin-password-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                        <AlertCircle className="w-3 h-3" aria-hidden="true" />
                        {errors.password}
                      </p>
                    )}
                    <div className="text-right">
                      <Link
                        to="/password-reset"
                        className="text-sm sm:text-base text-primary hover:underline font-medium h-11 flex items-center justify-end touch-manipulation"
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
                    className="w-full h-12 sm:h-14 font-black text-base sm:text-lg uppercase tracking-wider shadow-brutal-lg hover:shadow-brutal-lg hover:-translate-x-0 hover:-translate-y-0 active:translate-x-1 active:translate-y-1 transition-all"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
                        SIGNING IN...
                      </>
                    ) : (
                      <>
                        SIGN IN
                        <ArrowLeft className="w-5 h-5 ml-2 rotate-180" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>

                {/* Register Link */}
                <div className="mt-4 sm:mt-6 text-center">
                  <p className="text-xs sm:text-sm text-primary">
                    Don't have an account?{" "}
                    <Link
                      to="/register"
                      className="text-primary hover:underline font-medium touch-manipulation"
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab("signup");
                      }}
                    >
                      Create one here
                    </Link>
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="signup" className="space-y-3 sm:space-y-4">
                <form onSubmit={handleSignUp} className="space-y-3 sm:space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="font-black uppercase tracking-wider text-xs sm:text-sm text-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4 text-primary" aria-hidden="true" />
                      Email Address
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary z-10 pointer-events-none flex items-center justify-center">
                        <Mail className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your.email@example.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) {
                            setErrors({ ...errors, email: undefined });
                          }
                        }}
                        onBlur={() => validateForm(true)}
                        required
                        disabled={loading}
                        className={`pl-12 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
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

                  <div className="space-y-2">
                    <Label htmlFor="signup-username" className="font-black uppercase tracking-wider text-xs sm:text-sm text-foreground flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" aria-hidden="true" />
                      Username
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary z-10 pointer-events-none flex items-center justify-center">
                        <User className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <Input
                        id="signup-username"
                        type="text"
                        placeholder="Choose a username"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (errors.username) {
                            setErrors({ ...errors, username: undefined });
                          }
                        }}
                        onBlur={() => validateForm(true)}
                        required
                        disabled={loading}
                        minLength={3}
                        pattern="[a-zA-Z0-9_]+"
                        className={`pl-12 ${errors.username ? "border-destructive focus-visible:ring-destructive" : ""}`}
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

                  <div className="space-y-2">
                    <Label htmlFor="signup-fullname" className="font-black uppercase tracking-wider text-xs sm:text-sm text-foreground flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" aria-hidden="true" />
                      Full Name
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary z-10 pointer-events-none flex items-center justify-center">
                        <User className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <Input
                        id="signup-fullname"
                        type="text"
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          if (errors.fullName) {
                            setErrors({ ...errors, fullName: undefined });
                          }
                        }}
                        onBlur={() => validateForm(true)}
                        required
                        disabled={loading}
                        minLength={2}
                        className={`pl-12 ${errors.fullName ? "border-destructive focus-visible:ring-destructive" : ""}`}
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

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="font-black uppercase tracking-wider text-xs sm:text-sm text-foreground flex items-center gap-2">
                      <Lock className="w-4 h-4 text-primary" aria-hidden="true" />
                      Password
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary z-10 pointer-events-none flex items-center justify-center">
                        <Lock className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a strong password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errors.password) {
                            setErrors({ ...errors, password: undefined });
                          }
                        }}
                        onBlur={() => validateForm(true)}
                        required
                        disabled={loading}
                        minLength={6}
                        className={`pl-12 pr-12 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        aria-invalid={errors.password ? "true" : "false"}
                        aria-describedby={errors.password ? "signup-password-error" : "signup-password-strength"}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 h-11 w-11 p-0 min-w-[44px] touch-manipulation"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                      </Button>
                    </div>
                    {errors.password && (
                      <p id="signup-password-error" className="text-xs text-destructive flex items-center gap-1" role="alert">
                        <AlertCircle className="w-3 h-3" aria-hidden="true" />
                        {errors.password}
                      </p>
                    )}
                    {passwordStrength && password && (
                      <div id="signup-password-strength" className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted border-2 border-border overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${passwordStrength.strength <= 1
                                ? "bg-red-600"
                                : passwordStrength.strength <= 2
                                  ? "bg-orange-600"
                                  : passwordStrength.strength <= 3
                                    ? "bg-yellow-600"
                                    : passwordStrength.strength <= 4
                                      ? "bg-green-600"
                                      : "bg-green-700"
                                }`}
                              style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                            />
                          </div>
                          {passwordStrength.label && (
                            <span className={`text-xs font-bold ${passwordStrength.color}`}>
                              {passwordStrength.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Minimum 6 characters required. Use uppercase, lowercase, numbers, and symbols for a stronger password.
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="neural"
                    size="lg"
                    className="w-full h-12 sm:h-14 font-black text-base sm:text-lg uppercase tracking-wider shadow-brutal-lg hover:shadow-brutal-lg hover:-translate-x-0 hover:-translate-y-0 active:translate-x-1 active:translate-y-1 transition-all"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
                        CREATING ACCOUNT...
                      </>
                    ) : (
                      <>
                        CREATE ACCOUNT
                        <Crown className="w-5 h-5 ml-2" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>

          <CardFooter className="border-t-4 border-border bg-gradient-to-b from-muted/80 to-muted p-4 sm:p-5">
            <p className="text-center text-xs sm:text-sm text-muted-foreground w-full leading-relaxed">
              By signing up, you agree to our{" "}
              <Link to="/terms" className="text-primary hover:text-primary/80 hover:underline font-black transition-colors touch-manipulation">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary hover:text-primary/80 hover:underline font-black transition-colors touch-manipulation">
                Privacy Policy
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Login;
