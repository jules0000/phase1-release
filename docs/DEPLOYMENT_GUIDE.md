# Deploying to Production

This guide explains how to put the platform on a real server so other people can use it. If you're not technical, you might want to hire someone to help with this part.

## What Production Means

Right now, the platform runs on your computer (localhost). Production means putting it on a server that's always on and accessible to the internet.

## Before You Start

You'll need:
- A server (like from AWS, DigitalOcean, or similar)
- A domain name (like yourdomain.com)
- SSL certificate (for HTTPS - makes it secure)
- MySQL database (can be on the same server or separate)

## The Simple Way: Using Docker

If you have Docker installed, this is the easiest approach.

**Build and start:**
```
docker-compose -f docker-compose.production.yml up -d
```

This starts everything in containers. The configuration is already set up.

## The Manual Way

If you want more control, here's how to do it step by step.

### 1. Set Up Your Server

You'll need a Linux server (Ubuntu is common). Set it up with:
- Python 3.9+
- Node.js 18+
- MySQL
- Nginx (for serving the website)

### 2. Deploy the Code

Copy your code to the server. You can use Git:
```
git clone your-repository-url
```

Or copy files directly using FTP or SCP.

### 3. Set Up the Backend

**Install dependencies:**
```
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

**Configure environment:**
Create a `.env` file with production settings:
```
FLASK_ENV=production
DATABASE_URL=mysql+pymysql://user:pass@host:port/db?charset=utf8mb4
SECRET_KEY=your-production-secret-key
JWT_SECRET_KEY=your-production-jwt-key
CORS_ORIGINS=https://yourdomain.com
```

**Set up the database:**
```
flask db upgrade
```

**Create a service to run it:**
Create a systemd service file so it runs automatically. This is a bit technical - you might want help with this part.

### 4. Set Up the Frontend

**Build the frontend:**
```
cd frontend/client
npm install
npm run build
```

This creates a `dist` folder with the built files.

**Serve the files:**
You can use Nginx to serve the static files, or deploy to a service like Vercel.

### 5. Set Up Nginx

Nginx acts as a reverse proxy. It receives requests and forwards them to your backend.

You'll need to configure Nginx to:
- Serve the frontend files
- Forward API requests to the backend
- Handle SSL/HTTPS

This requires editing Nginx configuration files. Again, you might want technical help here.

### 6. Set Up SSL

You need HTTPS for security. The easiest way is Let's Encrypt:
```
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

This gets you a free SSL certificate.

## Using Hosting Services

### Vercel (Frontend)

Vercel makes frontend deployment easy:
1. Connect your GitHub repository
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add environment variables
5. Deploy

### Render (Backend)

Render can host your Flask backend:
1. Connect your repository
2. Set build command: `pip install -r requirements.txt`
3. Set start command: `gunicorn wsgi:app`
4. Add environment variables
5. Deploy

### Railway

Railway can host both:
1. Connect repository
2. It auto-detects the setup
3. Add environment variables
4. Deploy

## Important Production Settings

Make sure these are set correctly:

**Security:**
- Use strong secret keys (generate new ones, don't reuse development keys)
- Enable HTTPS only
- Set secure cookie settings
- Configure CORS properly (only your domain)

**Database:**
- Use a production database (not localhost)
- Set up backups
- Use connection pooling

**Monitoring:**
- Set up error tracking (like Sentry)
- Monitor server resources
- Set up logging

## Testing Production

Before going live:
1. Test all MVP features
2. Test on different browsers
3. Test on mobile devices
4. Check that HTTPS works
5. Verify database connections
6. Test the AI features

## Maintenance

Once it's live:
- Monitor for errors
- Keep dependencies updated
- Back up the database regularly
- Monitor server resources
- Watch for security updates

## Getting Help

Deployment can be tricky. If you're not comfortable with servers and configuration, consider:
- Hiring a DevOps person
- Using a managed hosting service
- Getting help from a developer

The platform is ready to deploy, but the deployment process itself requires some technical knowledge.

## What's Next

After deployment:
1. Test everything thoroughly
2. Set up monitoring
3. Create your first admin user
4. Add some content
5. Start inviting users

Good luck with your launch!
