# How to Set Up the Platform

This guide will walk you through getting the platform running on your computer. I've tried to make it as simple as possible.

## What You Need First

Before you start, make sure you have these installed:

1. **Python 3.9 or higher** - Download from python.org
2. **Node.js 18 or higher** - Download from nodejs.org
3. **MySQL 8.0 or higher** - Download from mysql.com
4. **Git** - Download from git-scm.com

If you're on Windows, there's a batch file that can help with setup. On Mac or Linux, you'll do it manually.

## Quick Start (Windows)

If you're on Windows, the easiest way is to use the batch file:

1. Open the project folder
2. Double-click `START_PROJECT.bat`
3. Follow the prompts

That's it! It should set everything up for you.

## Manual Setup

If the batch file doesn't work or you're on Mac/Linux, here's how to do it step by step.

### Step 1: Set Up the Backend

Open a terminal (or command prompt on Windows) and navigate to the project folder.

**Go to the backend folder:**
```
cd backend
```

**Create a virtual environment:**
On Windows:
```
python -m venv venv
venv\Scripts\activate
```

On Mac/Linux:
```
python3 -m venv venv
source venv/bin/activate
```

**Install the required packages:**
```
pip install -r requirements.txt
```

**Create your environment file:**
Copy the example file:
```
cp env.example .env
```

On Windows, use:
```
copy env.example .env
```

**Edit the .env file:**
Open `.env` in a text editor and fill in these important values:

```
DATABASE_URL=mysql+pymysql://root:yourpassword@127.0.0.1:3306/neural?charset=utf8mb4
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here
```

For the secret keys, you can generate random ones. Or use this Python command:
```python
import secrets
print(secrets.token_hex(32))
```

Run that twice to get two different keys.

### Step 2: Set Up the Database

**Start MySQL:**
Make sure MySQL is running on your computer.

**Create the database:**
Open MySQL (or use command line):
```sql
CREATE DATABASE neural CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Update the database connection:**
Make sure your `.env` file has the correct database connection string. It should look like:
```
DATABASE_URL=mysql+pymysql://root:yourpassword@127.0.0.1:3306/neural?charset=utf8mb4
```

**Run the database setup:**
Back in your terminal (with the virtual environment activated):
```
flask db upgrade
```

This creates all the necessary tables.

**Create an admin user:**
```
python scripts/ensure_admin.py
```

Or create one manually - the script will guide you.

### Step 3: Set Up the Frontend

Open a new terminal window and navigate to the frontend:

```
cd frontend/client
```

**Install the packages:**
```
npm install
```

This might take a few minutes the first time.

**Create environment file:**
```
cp env.example .env
```

**Edit the .env file:**
Make sure it has:
```
VITE_API_BASE_URL=http://localhost:8085/api/v1
```

### Step 4: Start Everything

**Start the backend:**
In your first terminal (backend folder, virtual environment activated):
```
python wsgi.py
```

You should see it start on port 8085.

**Start the frontend:**
In your second terminal (frontend/client folder):
```
npm run dev
```

You should see it start, usually on port 5173.

### Step 5: Test It

Open your browser and go to:
```
http://localhost:5173
```

You should see the landing page. Try:
1. Creating an account
2. Logging in
3. Viewing the dashboard
4. Browsing topics and modules

## Common Problems

**"Can't connect to database"**
- Make sure MySQL is running
- Check your DATABASE_URL in the .env file
- Make sure the database exists

**"Port already in use"**
- Something else is using port 8085 or 5173
- Change the port in the config, or stop the other program

**"Module not found" errors**
- Make sure your virtual environment is activated
- Try running `pip install -r requirements.txt` again

**Frontend won't connect to backend**
- Check that the backend is running
- Check VITE_API_BASE_URL in frontend .env
- Check CORS_ORIGINS in backend .env

## Getting Help

If you run into issues:
1. Check the error message - it usually tells you what's wrong
2. Make sure all the prerequisites are installed
3. Check that your .env files are set up correctly
4. Try the troubleshooting steps above

If you're still stuck, let me know and I can help.

## Next Steps

Once it's running:
1. Explore the features
2. Try creating content
3. Test the prompt grader
4. Test the prompt translator
5. Go through a lesson

The platform should be fully functional for MVP features.
