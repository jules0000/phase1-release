import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Brain, Zap, Target, Crown, ArrowLeft, CheckCircle, AlertCircle, Mail, Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import apiService from "@/lib/api";

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = "Full name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = "Password must contain uppercase, lowercase, and number";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (!formData.acceptTerms) {
      newErrors.acceptTerms = "You must accept the terms and conditions";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    // Fail-safe: auto-hide loader after 5s
    const timeoutId = setTimeout(() => setLoading(false), 10000);

    try {
      // Generate username from email (part before @) or use a sanitized version of full name
      const emailUsername = formData.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const sanitizedFullName = formData.fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const username = sanitizedFullName || emailUsername || `user${Date.now()}`;

      const response = await apiService.register(
        formData.email,
        formData.password,
        formData.fullName,
        username
      );

      clearTimeout(timeoutId);

      // Handle API response format
      const data = response.data || response;

      if (data && (data.user || data.access_token)) {
        toast({
          title: "Account created successfully!",
          description: "Your account has been created. You can now sign in.",
        });
        navigate("/login");
      } else {
        throw new Error("Registration failed - invalid response from server");
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error?.message || error?.error?.message || "Please try again with different credentials.";
      toast({
        title: "Registration failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (password: string) => {
    if (!password) return { score: 0, label: "", color: "" };

    let score = 0;
    if (password.length >= 8) score++;
    if (/(?=.*[a-z])/.test(password)) score++;
    if (/(?=.*[A-Z])/.test(password)) score++;
    if (/(?=.*\d)/.test(password)) score++;
    if (/(?=.*[!@#$%^&*])/.test(password)) score++;

    const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
    const colors = ["text-destructive", "text-orange-500", "text-yellow-500", "text-blue-500", "text-success"];

    return {
      score: Math.min(score, 4),
      label: labels[Math.min(score, 4)],
      color: colors[Math.min(score, 4)]
    };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-foreground/5 to-transparent" />
      </div>

      {/* Back Button */}
      <Link
        to="/"
        className="absolute top-6 left-6 z-10"
      >
        <Button variant="ghost" size="sm" className="gap-2 text-primary hover:text-primary/80 hover:bg-primary/10">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Button>
      </Link>

      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-6 sm:gap-8 items-center">
        {/* Left Side - Branding */}
        <div className="space-y-6 sm:space-y-8 text-center lg:text-left">
          <div className="space-y-3 sm:space-y-4">
            <Badge variant="outline" className="bg-background/90 backdrop-blur text-sm sm:text-base lg:text-lg px-3 sm:px-4 py-1.5 sm:py-2">
              <Brain className="w-5 h-5 mr-2" />
              JOIN THE REVOLUTION
            </Badge>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black text-primary-foreground">
              START YOUR
              <span className="block text-primary-foreground">AI JOURNEY</span>
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-primary-foreground/80 font-bold max-w-md mx-auto lg:mx-0">
              Join thousands of learners mastering AI prompting with our interactive platform.
            </p>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-lg mx-auto lg:max-w-none lg:mx-0">
            <Card className="bg-background/90 backdrop-blur border-4">
              <CardContent className="p-3 sm:p-4 text-center">
                <Target className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-primary" />
                <h3 className="font-bold text-xs sm:text-sm">FREE ACCESS</h3>
                <p className="text-xs text-muted-foreground mt-1">Start learning immediately</p>
              </CardContent>
            </Card>

            <Card className="bg-background/90 backdrop-blur border-4">
              <CardContent className="p-3 sm:p-4 text-center">
                <Zap className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-primary" />
                <h3 className="font-bold text-xs sm:text-sm">INSTANT START</h3>
                <p className="text-xs text-muted-foreground mt-1">No waiting, no delays</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Side - Registration Form */}
        <Card className="bg-background shadow-brutal-lg border-4 w-full max-w-md mx-auto lg:max-w-none">
          <CardHeader className="text-center bg-primary text-primary-foreground">
            <Crown className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2" />
            <CardTitle className="text-xl sm:text-2xl">CREATE ACCOUNT</CardTitle>
            <CardDescription className="text-primary-foreground/80 font-bold text-sm sm:text-base">
              Join the AI mastery community
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleSignUp} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName" className="font-bold uppercase tracking-wide">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    className={`pl-10 ${errors.fullName ? "border-destructive" : ""}`}
                  />
                </div>
                {errors.fullName && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    {errors.fullName}
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="font-bold uppercase tracking-wide">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className={`pl-10 ${errors.email ? "border-destructive" : ""}`}
                  />
                </div>
                {errors.email && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    {errors.email}
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="font-bold uppercase tracking-wide">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    className={`pl-10 pr-10 ${errors.password ? "border-destructive" : ""}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-auto p-1"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`w-8 h-2 rounded-full ${level <= passwordStrength.score
                              ? passwordStrength.color.replace('text-', 'bg-')
                              : 'bg-muted'
                              }`}
                          />
                        ))}
                      </div>
                      <span className={`text-xs font-medium ${passwordStrength.color}`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Include uppercase, lowercase, numbers, and symbols
                    </div>
                  </div>
                )}

                {errors.password && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    {errors.password}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="font-bold uppercase tracking-wide">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                    className={`pl-10 pr-10 ${errors.confirmPassword ? "border-destructive" : ""}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-auto p-1"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    {errors.confirmPassword}
                  </div>
                )}
              </div>

              {/* Terms and Conditions */}
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="acceptTerms"
                    checked={formData.acceptTerms}
                    onChange={(e) => handleInputChange("acceptTerms", e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary border-border rounded focus:ring-primary focus:ring-2"
                  />
                  <Label htmlFor="acceptTerms" className="text-sm text-muted-foreground leading-relaxed">
                    I agree to the{" "}
                    <Link to="/terms" className="text-primary hover:underline font-medium">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link to="/privacy" className="text-primary hover:underline font-medium">
                      Privacy Policy
                    </Link>
                  </Label>
                </div>
                {errors.acceptTerms && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    {errors.acceptTerms}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="neural"
                size="lg"
                className="w-full"
                disabled={loading}
              >
                {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
              </Button>
            </form>

            {/* Login Link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Sign in here
                </Link>
              </p>
            </div>
          </CardContent>

          <CardFooter className="border-t-4 border-border bg-muted p-4">
            <div className="text-center text-xs text-muted-foreground w-full">
              <p className="mb-2">By creating an account, you agree to our terms and privacy policy.</p>
              <p>Your data is protected and will never be shared with third parties.</p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Register;
