import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  MessageSquare, 
  Target, 
  Zap, 
  Image, 
  Code, 
  Users, 
  BookOpen,
  Trophy,
  Settings,
  HelpCircle,
  ExternalLink
} from "lucide-react";

export const Footer = () => {
  const navigationSections = [
    {
      title: "Learning",
      links: [
        { label: "Dashboard", path: "/dashboard" },
        { label: "Learn", path: "/learn" },
        { label: "Skill Tree", path: "/skill-tree" },
        { label: "Progress", path: "/progress" },
        { label: "Learning Path", path: "/learning-path" },
      ]
    },
    {
      title: "Practice",
      links: [
        { label: "Practice", path: "/practice" },
        { label: "Challenges", path: "/challenges" },
        { label: "Timed Challenge", path: "/timed-challenge" },
        { label: "Mixed Review", path: "/mixed-review" },
        { label: "Lesson Practice", path: "/lesson-practice/1/1" },
      ]
    },
    {
      title: "Tools",
      links: [
        { label: "Prompt Translator", path: "/prompt-translator" },
        { label: "Prompt Sandbox", path: "/prompt-engineering-sandbox" },
        { label: "Image Prompts", path: "/image-prompt-mastery" },
        { label: "Multi-Model", path: "/multi-model-prompting" },
        { label: "Code Workshop", path: "/code-generation-workshop" },
        { label: "Content Pipeline", path: "/content-creation-pipeline" },
        { label: "Creative Writing", path: "/creative-writing" },
      ]
    },
    {
      title: "Account",
      links: [
        { label: "Profile", path: "/profile" },
        { label: "Settings", path: "/settings" },
        { label: "Certificates", path: "/certificates" },
        { label: "Activities", path: "/activities" },
        { label: "Admin Panel", path: "/admin" },
      ]
    }
  ];

  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {navigationSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.path}>
                    <Link 
                      to={link.path}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Section */}
        <div className="border-t border-border pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h4 className="font-bold text-foreground">Neural AI Learning</h4>
                <p className="text-xs text-muted-foreground">Master AI prompting like a pro</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3">
              <Link to="/sitemap">
                <Button variant="ghost" size="sm" className="gap-2">
                  <BookOpen className="w-4 h-4" />
                  Site Map
                </Button>
              </Link>
              <Link to="/help">
                <Button variant="ghost" size="sm" className="gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Help
                </Button>
              </Link>
              <Link to="/settings">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Settings
                </Button>
              </Link>
            </div>

            {/* Copyright */}
            <div className="text-sm text-muted-foreground text-center md:text-right">
              <p>&copy; 2024 Neural AI Learning. All rights reserved.</p>
              <div className="flex items-center gap-4 mt-2">
                <Link to="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
                <Link to="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
