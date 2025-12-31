import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  BookOpen,
  Lightbulb,
  Target,
  CheckCircle2,
  Clock,
  Brain,
  Zap,
  AlertCircle
} from "lucide-react";

const conceptData = {
  "prompt-basics": {
    title: "Prompt Engineering Fundamentals",
    description: "Master the art and science of crafting effective AI prompts",
    estimatedReadTime: "15 min",
    difficulty: "Beginner",
    concepts: [
      {
        id: "what-is-prompt",
        title: "Understanding AI Prompts",
        icon: <Brain className="w-5 h-5" />,
        content: `
          <h3>What is a Prompt?</h3>
          <p>A prompt is your way of communicating with AI systems. Think of it as giving instructions to a highly capable assistant who can understand and respond to natural language.</p>
          
          <h4>Key Characteristics:</h4>
          <ul>
            <li><strong>Input Text:</strong> The text you provide to the AI system</li>
            <li><strong>Context Setting:</strong> Establishes the scenario and expectations</li>
            <li><strong>Task Definition:</strong> Clearly defines what you want the AI to do</li>
            <li><strong>Output Guidance:</strong> Helps shape the format and style of responses</li>
          </ul>

          <h4>Real-World Example:</h4>
          <div class="example-box">
            <p><strong>Basic Prompt:</strong> "Write a story"</p>
            <p><strong>Enhanced Prompt:</strong> "Write a 200-word mystery story set in a Victorian mansion, featuring a detective who discovers a hidden room. Use descriptive language and end with a cliffhanger."</p>
          </div>

          <p>The enhanced prompt provides context, specific requirements, and style guidance, leading to much better results.</p>
        `
      },
      {
        id: "anatomy-good-prompts",
        title: "Anatomy of Effective Prompts",
        icon: <Target className="w-5 h-5" />,
        content: `
          <h3>The Building Blocks of Great Prompts</h3>
          
          <h4>1. Context Setting</h4>
          <p>Provide background information that helps the AI understand the scenario.</p>
          <div class="example-box">
            <p><strong>Example:</strong> "You are a professional marketing consultant working with a small coffee shop..."</p>
          </div>

          <h4>2. Task Definition</h4>
          <p>Clearly state what you want the AI to accomplish.</p>
          <div class="example-box">
            <p><strong>Example:</strong> "...create a social media campaign strategy that will increase customer engagement..."</p>
          </div>

          <h4>3. Constraints and Requirements</h4>
          <p>Specify limitations, format requirements, or specific criteria.</p>
          <div class="example-box">
            <p><strong>Example:</strong> "...the strategy should include 3 platforms, cost under $500/month, and target millennials."</p>
          </div>

          <h4>4. Output Format</h4>
          <p>Guide how you want the response structured.</p>
          <div class="example-box">
            <p><strong>Example:</strong> "Present your recommendations in a bulleted list with explanations for each platform choice."</p>
          </div>

          <h4>The CLEAR Framework:</h4>
          <ul>
            <li><strong>C</strong>ontext: Set the scene</li>
            <li><strong>L</strong>ength: Specify desired output length</li>
            <li><strong>E</strong>xamples: Provide examples when helpful</li>
            <li><strong>A</strong>udience: Define who the output is for</li>
            <li><strong>R</strong>ole: Establish the AI's perspective</li>
          </ul>
        `
      },
      {
        id: "common-mistakes",
        title: "Common Prompting Pitfalls",
        icon: <AlertCircle className="w-5 h-5" />,
        content: `
          <h3>Avoid These Critical Mistakes</h3>

          <h4>1. Vague Instructions</h4>
          <div class="mistake-box">
            <p><strong> Poor:</strong> "Make this better"</p>
            <p><strong> Better:</strong> "Improve the clarity and engagement of this paragraph by adding specific examples and reducing jargon"</p>
          </div>

          <h4>2. Information Overload</h4>
          <div class="mistake-box">
            <p><strong> Poor:</strong> Cramming multiple unrelated tasks into one prompt</p>
            <p><strong> Better:</strong> Breaking complex requests into focused, sequential prompts</p>
          </div>

          <h4>3. Lack of Context</h4>
          <div class="mistake-box">
            <p><strong> Poor:</strong> "Write a proposal"</p>
            <p><strong> Better:</strong> "Write a project proposal for implementing a new employee wellness program at a 200-person tech company"</p>
          </div>

          <h4>4. Assuming AI Knowledge</h4>
          <p>Don't assume the AI knows specifics about your situation, company, or previous conversations unless explicitly provided.</p>

          <h4>5. Ignoring Iteration</h4>
          <p>Great prompts often require refinement. Use follow-up prompts to clarify, expand, or redirect based on initial responses.</p>

          <h4>Pro Tips:</h4>
          <ul>
            <li>Start broad, then narrow down with follow-up prompts</li>
            <li>Use "Let's think step by step" for complex reasoning tasks</li>
            <li>Provide examples of desired output when possible</li>
            <li>Be specific about tone, style, and format preferences</li>
          </ul>
        `
      }
    ],
    keyTakeaways: [
      "Prompts are your primary interface for communicating with AI systems",
      "Effective prompts include context, clear tasks, constraints, and output guidance",
      "The CLEAR framework helps structure comprehensive prompts",
      "Common mistakes include vagueness, information overload, and lack of context",
      "Iteration and refinement are essential for optimal results"
    ],
    nextSteps: [
      "Practice writing prompts using the CLEAR framework",
      "Experiment with different prompt structures for various tasks",
      "Study examples of effective prompts in your field of interest",
      "Learn to iterate and refine prompts based on AI responses"
    ]
  }
};

const ModuleConcept = () => {
  const { moduleId } = useParams();
  const [activeSection, setActiveSection] = useState(0);
  const module = conceptData[moduleId as keyof typeof conceptData];

  if (!module) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-4xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Concept Not Found</h1>
          <Link to="/learn">
            <Button variant="neural">Back to Learning</Button>
          </Link>
        </div>
      </div>
    );
  }

  const currentConcept = module.concepts[activeSection];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Breadcrumb */}
        <div className="mb-4 sm:mb-6">
          <Link to="/learn" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Learning
          </Link>
        </div>

        {/* Module Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">{module.title}</h1>
            <Badge className={`${module.difficulty === "Beginner" ? "bg-success/10 text-success border-success/20" :
                module.difficulty === "Intermediate" ? "bg-learning/10 text-learning border-learning/20" :
                  "bg-destructive/10 text-destructive border-destructive/20"
              }`}>
              {module.difficulty}
            </Badge>
          </div>

          <p className="text-base sm:text-lg text-muted-foreground mb-3 sm:mb-4">{module.description}</p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {module.estimatedReadTime}
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              {module.concepts.length} concepts
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card className="p-3 sm:p-4 sticky top-8">
              <h3 className="font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                Concepts
              </h3>
              <div className="space-y-1 sm:space-y-2">
                {module.concepts.map((concept, index) => (
                  <button
                    key={concept.id}
                    onClick={() => setActiveSection(index)}
                    className={`w-full text-left p-2 sm:p-3 rounded-lg border transition-all ${index === activeSection
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'bg-background border-border hover:bg-muted/50 text-muted-foreground'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {concept.icon}
                      <span className="font-medium text-xs sm:text-sm">{concept.title}</span>
                    </div>
                  </button>
                ))}
              </div>

              <Separator className="my-3 sm:my-4" />

              <div className="space-y-2 sm:space-y-3">
                <Link to={`/module/${moduleId}`}>
                  <Button variant="neural" size="sm" className="w-full">
                    View Lessons
                  </Button>
                </Link>
                <Link to={`/quiz/${moduleId}/1`}>
                  <Button variant="outline" size="sm" className="w-full">
                    Take Quiz
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card className="p-4 sm:p-6 lg:p-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                {currentConcept.icon}
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">{currentConcept.title}</h2>
              </div>

              <ScrollArea className="h-[500px] sm:h-[600px] pr-2 sm:pr-4">
                <div
                  className="prose prose-sm sm:prose lg:prose-lg max-w-none
                    prose-headings:text-foreground prose-headings:font-bold
                    prose-h3:text-xl prose-h3:mb-4 prose-h3:mt-6
                    prose-h4:text-lg prose-h4:mb-3 prose-h4:mt-5 prose-h4:text-primary
                    prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:mb-4
                    prose-ul:text-muted-foreground prose-ul:mb-4
                    prose-li:mb-2
                    prose-strong:text-foreground"
                  dangerouslySetInnerHTML={{ __html: currentConcept.content }}
                />
              </ScrollArea>

              {/* Navigation */}
              <div className="flex flex-col sm:flex-row justify-between items-center mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border gap-4 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
                  disabled={activeSection === 0}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous
                </Button>

                <span className="text-xs sm:text-sm text-muted-foreground">
                  {activeSection + 1} of {module.concepts.length}
                </span>

                <Button
                  variant="neural"
                  onClick={() => setActiveSection(Math.min(module.concepts.length - 1, activeSection + 1))}
                  disabled={activeSection === module.concepts.length - 1}
                  className="flex items-center gap-2"
                >
                  Next
                  <Zap className="w-4 h-4" />
                </Button>
              </div>
            </Card>

            {/* Key Takeaways */}
            {activeSection === module.concepts.length - 1 && (
              <div className="mt-6 sm:mt-8 space-y-4 sm:space-y-6">
                <Card className="p-4 sm:p-6 bg-gradient-card border border-border/50">
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    Key Takeaways
                  </h3>
                  <ul className="space-y-1 sm:space-y-2">
                    {module.keyTakeaways.map((takeaway, index) => (
                      <li key={index} className="flex items-start gap-2 sm:gap-3 text-xs sm:text-sm">
                        <div className="w-1.5 h-1.5 bg-success rounded-full mt-2 flex-shrink-0" />
                        <span className="text-muted-foreground">{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card className="p-4 sm:p-6 bg-gradient-hero text-white">
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Next Steps
                  </h3>
                  <ul className="space-y-1 sm:space-y-2 mb-4 sm:mb-6">
                    {module.nextSteps.map((step, index) => (
                      <li key={index} className="flex items-start gap-2 sm:gap-3 text-xs sm:text-sm">
                        <div className="w-1.5 h-1.5 bg-white rounded-full mt-2 flex-shrink-0" />
                        <span className="text-white/90">{step}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <Link to={`/module/${moduleId}`}>
                      <Button variant="secondary" size="lg">
                        Start Lessons
                      </Button>
                    </Link>
                    <Link to="/practice">
                      <Button variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10">
                        Practice Now
                      </Button>
                    </Link>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          .example-box {
            background: hsl(var(--muted));
            border: 1px solid hsl(var(--border));
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
          }
          
          .mistake-box {
            background: hsl(var(--destructive) / 0.1);
            border: 1px solid hsl(var(--destructive) / 0.2);
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
          }
        `
      }} />
    </div>
  );
};

export default ModuleConcept;