# API Reference - MVP Features Only

This document explains the API endpoints available in the MVP version. If you're not technical, you can skip this - it's mainly for developers who need to integrate with the system.

## What is an API?

An API (Application Programming Interface) is like a menu at a restaurant. It lists what you can order (what requests you can make) and what you'll get back (the responses).

## Base URL

When running locally: `http://localhost:8085/api/v1`
When deployed: `https://yourdomain.com/api/v1`

## Authentication

Most endpoints require you to be logged in. When you log in, you get a token. You include this token in your requests like this:

```
Authorization: Bearer your-token-here
```

## MVP Endpoints

These are the endpoints included in Phase 1 (MVP features only).

### Authentication

**POST /api/v1/auth/login**
- What it does: Logs a user in
- What you send: Email and password
- What you get back: A token and user information
- Example: User logs in with their email and password

**POST /api/v1/auth/register**
- What it does: Creates a new user account
- What you send: Email, password, username, full name
- What you get back: A token and user information
- Example: New user signs up

**GET /api/v1/auth/me**
- What it does: Gets information about the currently logged-in user
- What you send: Just your token
- What you get back: Your user profile
- Example: Check who's logged in

**POST /api/v1/auth/refresh**
- What it does: Gets a new token when your old one expires
- What you send: Your refresh token
- What you get back: New tokens
- Example: Your session is about to expire, so you refresh it

**POST /api/v1/auth/logout**
- What it does: Logs you out
- What you send: Your token
- What you get back: Confirmation
- Example: User clicks logout

### Content and Learning

**GET /api/v1/modules/public/topics**
- What it does: Gets the list of all learning topics
- Authentication: Not required (public)
- What you get back: List of topics like "AI 101", "Text Generation", etc.
- Example: Show topics on the dashboard

**GET /api/v1/modules/public/modules**
- What it does: Gets all the learning modules
- Authentication: Not required (public)
- What you can filter by: Topic ID
- What you get back: List of modules with their details
- Example: Show modules for a specific topic

**GET /api/v1/modules/public/modules/<module_id>**
- What it does: Gets details about a specific module
- Authentication: Not required (public)
- What you get back: Module details including all lessons
- Example: User clicks on a module to see what's inside

**GET /api/v1/lessons/<lesson_id>**
- What it does: Gets a specific lesson
- Authentication: Required
- What you get back: Lesson content, practice activities, quiz questions
- Example: User opens a lesson to learn

**GET /api/v1/content/topic/<topic_number>**
- What it does: Gets neural content for a topic
- Authentication: Required
- What you get back: Content from JSON files
- Example: Load the learning content for a topic

### Progress Tracking

**GET /api/v1/progress/summary**
- What it does: Gets a user's overall progress
- Authentication: Required
- What you get back: Total XP, level, modules completed, etc.
- Example: Show progress on dashboard

**POST /api/v1/modules/<module_id>/progress**
- What it does: Updates progress for a module
- Authentication: Required
- What you send: Completion status, score, time spent
- What you get back: Updated progress
- Example: User completes a module

**POST /api/v1/lessons/<lesson_id>/progress**
- What it does: Updates progress for a lesson
- Authentication: Required
- What you send: Completion status, score
- What you get back: Updated progress
- Example: User finishes a lesson

### Quizzes

**GET /api/v1/quiz/<module_id>/<lesson_id>**
- What it does: Gets quiz questions for a lesson
- Authentication: Required
- What you get back: Quiz questions and answers
- Example: User starts a quiz

**POST /api/v1/quiz/<module_id>/<lesson_id>/submit**
- What it does: Submits quiz answers
- Authentication: Required
- What you send: User's answers
- What you get back: Score and feedback
- Example: User completes a quiz and sees their score

### AI Features

**POST /api/v1/openai/grade-prompt**
- What it does: Grades a prompt using GPT-4
- Authentication: Required
- What you send: The prompt to grade
- What you get back: Score (1-5), feedback, suggestions
- Example: User wants to know if their prompt is good

**POST /api/v1/openai/translate-prompt**
- What it does: Translates a prompt between AI models
- Authentication: Required
- What you send: Prompt, source model, target model
- What you get back: Translated prompt and explanation
- Example: User has a ChatGPT prompt and wants it for Midjourney

**POST /api/v1/openai/test-prompt**
- What it does: Tests a prompt with an AI model
- Authentication: Required
- What you send: Prompt and model to use
- What you get back: AI's response
- Example: User wants to see what an AI would say to their prompt

**GET /api/v1/openai/config**
- What it does: Gets available AI models and settings
- Authentication: Required
- What you get back: List of models and configuration
- Example: Show user which AI models are available

**GET /api/v1/openai/usage**
- What it does: Gets AI usage statistics
- Authentication: Required
- What you get back: Tokens used, costs, requests made
- Example: Show user how much AI they've used

### Dashboard

**GET /api/v1/dashboard/summary**
- What it does: Gets dashboard data
- Authentication: Required
- What you get back: Progress, recent activity, recommendations
- Example: Load the dashboard when user logs in

### User Profile

**GET /api/v1/users/profile**
- What it does: Gets user profile information
- Authentication: Required
- What you get back: User's profile data
- Example: Show user's profile page

**PUT /api/v1/users/profile**
- What it does: Updates user profile
- Authentication: Required
- What you send: Updated profile information
- What you get back: Updated profile
- Example: User changes their name or bio

### Health Check

**GET /api/v1/health**
- What it does: Checks if the system is running
- Authentication: Not required
- What you get back: System status
- Example: Check if the server is up

## Response Format

When you make a request, you'll get a response that looks like this:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description",
  "error_code": "ERROR_CODE",
  "status_code": 400
}
```

## Error Codes

- 200 - Success
- 400 - Bad request (you sent invalid data)
- 401 - Unauthorized (you need to log in)
- 403 - Forbidden (you don't have permission)
- 404 - Not found (the thing you're looking for doesn't exist)
- 500 - Server error (something went wrong on our end)

## Rate Limiting

To prevent abuse, some endpoints have rate limits:
- Login: 5 attempts per 15 minutes
- Registration: 3 attempts per hour
- AI endpoints: Varies based on usage

If you hit a rate limit, you'll get an error and need to wait before trying again.

## Testing the API

You can test these endpoints using:
- Postman (a tool for testing APIs)
- curl (command line tool)
- The frontend application (which uses these endpoints)

## What's NOT Included

These endpoints are NOT in the MVP (they're in Phase 2):
- Admin endpoints (user management, content management)
- Subscription endpoints (Stripe integration)
- Advanced gamification endpoints (achievements, leaderboards)
- Certificate endpoints
- Guild and tournament endpoints
- Advanced analytics endpoints
- GDPR endpoints
- And others beyond MVP scope

## Need Help?

If you need to integrate with the API or have questions about specific endpoints, I'm happy to help. Just ask.
