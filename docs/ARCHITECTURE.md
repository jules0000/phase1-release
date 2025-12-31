# How the Platform Works

This document explains how the Neural AI Learning Platform is built. I've written it in plain English so non-technical people can understand it.

## The Big Picture

Think of the platform like a restaurant:
- **Frontend** = The dining room where customers (users) interact
- **Backend** = The kitchen where the work happens
- **Database** = The pantry where everything is stored

Users interact with the frontend (the website), which talks to the backend (the server), which stores and retrieves information from the database.

## The Three Main Parts

### 1. Frontend (What Users See)

This is the website that runs in your browser. It's built with:
- **React** - A popular tool for building interactive websites
- **TypeScript** - Makes the code more reliable
- **Tailwind CSS** - Makes it look good
- **GSAP** - Adds smooth animations

The frontend has pages like:
- Landing page (homepage)
- Login page
- Dashboard (where users see their progress)
- Learn page (where users take lessons)
- Prompt grader (where users test their prompts)
- Prompt translator (converts prompts between AI models)

### 2. Backend (The Server)

This is the Python application that runs on a server. It handles:
- User authentication (login, registration)
- Storing and retrieving lesson content
- Grading prompts using AI
- Translating prompts between models
- Tracking user progress
- Managing quizzes

It's built with **Flask**, which is a Python framework for building web applications.

The backend has different "endpoints" - think of them like different doors you can knock on:
- `/api/v1/auth/login` - For logging in
- `/api/v1/modules/public/topics` - For getting the list of topics
- `/api/v1/openai/grade-prompt` - For grading a prompt
- And many more...

### 3. Database (Where Data Lives)

This is a MySQL database that stores:
- User accounts and profiles
- All the lesson content (topics, modules, lessons)
- User progress (what lessons they've completed)
- Quiz questions and answers
- AI usage logs

Think of it like a filing cabinet with organized folders.

## How They Work Together

Here's what happens when a user does something:

1. User clicks a button on the website (frontend)
2. Frontend sends a request to the backend
3. Backend processes the request (maybe looks something up in the database)
4. Backend sends a response back to the frontend
5. Frontend updates what the user sees

For example, when a user wants to grade a prompt:
1. User types a prompt and clicks "Grade"
2. Frontend sends the prompt to `/api/v1/openai/grade-prompt`
3. Backend sends the prompt to OpenAI's GPT-4
4. GPT-4 grades it and sends back a score
5. Backend sends the score to the frontend
6. Frontend shows the user their grade

## The MVP Features

This Phase 1 release includes only the 6 core MVP features:

### 1. Home Page Dashboard
- Shows topics on the left
- Shows progress in the middle
- Shows learning objectives on the right
- Built with: Dashboard.tsx (frontend) and dashboard.py (backend)

### 2. AI Prompt Auto-Grader
- User enters a prompt
- System uses GPT-4 to grade it
- Returns a score and feedback
- Built with: PromptGrader.tsx (frontend) and openai.py (backend)

### 3. Prompt Translator
- User enters a prompt for one AI
- System converts it for another AI
- Built with: PromptTranslator.tsx (frontend) and openai.py (backend)

### 4. Model Switcher
- User picks their AI focus (text, art, code)
- Content changes based on their choice
- Preference is saved in the database
- Built with: LearningFocusContext.tsx (frontend) and user preferences in database

### 5. Interactive Modules & Quizzes
- Lessons with content
- Practice activities (drag and drop)
- Quizzes with multiple choice questions
- Built with: Learn.tsx, LessonViewer.tsx, Quiz.tsx (frontend) and modules.py, lessons.py, quiz.py (backend)

### 6. Lesson Content System
- Lessons stored in JSON files and database
- Can be edited manually
- Loaded when users access lessons
- Built with: content.py (backend) and JSON files in data/neural-content/

## What's NOT Included

The following are NOT part of Phase 1 (they're in Phase 2):

- Admin dashboard (comprehensive management interface)
- Subscription system (Stripe payments)
- Advanced gamification (achievements, leaderboards)
- Certificates system
- Guilds and tournaments
- Advanced analytics
- GDPR compliance features
- Multiple advanced AI tools

These features exist in the full codebase but aren't included in the Phase 1 release.

## File Structure (Simplified)

Here's where the important files live:

**Backend:**
- `backend/app/api/v1/` - All the API endpoints
- `backend/app/models/` - Database models (how data is structured)
- `backend/app/services/` - Business logic (the "how" of doing things)

**Frontend:**
- `frontend/client/src/pages/` - The main pages users see
- `frontend/client/src/components/` - Reusable pieces (like buttons, forms)
- `frontend/client/src/contexts/` - Shared state (like who's logged in)

**Data:**
- `data/neural-content/` - The lesson content in JSON format

## Security

The platform includes basic security:
- Passwords are encrypted (hashed) before storing
- Users get tokens (like temporary ID cards) when they log in
- These tokens are checked on every request
- API keys for AI services are stored securely

## How to Understand the Code

If you're not a developer, you probably don't need to dive into the code. But if you want to:

1. Start with the frontend pages - they're the easiest to understand
2. Look at the API endpoints to see what the backend does
3. Check the models to understand the database structure

The code is well-organized and has comments explaining what things do.

## Questions?

If you want to understand how a specific feature works, I'm happy to explain it. Just ask.

The important thing to know is: everything is built to work together smoothly. The frontend talks to the backend, the backend talks to the database and AI services, and it all comes together to create the learning experience.
