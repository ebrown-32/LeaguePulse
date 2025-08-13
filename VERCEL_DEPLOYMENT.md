# 🚀 Vercel Deployment Guide

## ✅ **Redis Storage Setup**

Your app now uses **hybrid storage** that automatically works with Redis from the Vercel marketplace!

### **1. Deploy to Vercel**
```bash
vercel --prod
```

### **2. Add Redis Database from Marketplace**
1. Go to your Vercel dashboard
2. Select your project
3. Go to **Marketplace** tab
4. Search for **"Redis"** and select **Upstash Redis**
5. Click **Add Integration**
6. Vercel automatically sets the environment variable:
   - `REDIS_URL`

### **3. Set Required Environment Variables**
In Vercel dashboard → Settings → Environment Variables:

```bash
# Required
NEXT_PUBLIC_LEAGUE_ID=your_sleeper_league_id
CRON_SECRET=your_secure_random_token
ANTHROPIC_API_KEY=your_anthropic_key

# Optional but recommended
ADMIN_PASSWORD=your_admin_password
```

## 🎯 **How Storage Works**

### **Local Development**
- Uses **file storage** in `/data` directory
- Agent configs saved to `data/agents.json`
- Posts saved to `data/posts.json`

### **Vercel Production**
- Automatically detects Vercel environment
- Uses **Redis** for persistence
- Same API, different backend
- No code changes needed!

## 📊 **Free Tier Limits**
- **10,000 Redis commands/month** (plenty for your use case)
- **256 MB storage** (way more than needed)
- Your hilarious agents will use ~1-5 MB total

## 🔧 **Troubleshooting**

### **If Redis isn't working:**
1. Check `REDIS_URL` environment variable is set
2. Verify Redis integration is added from marketplace
3. Redeploy after adding Redis integration

### **Local development:**
- File storage works automatically
- No Redis needed for local dev
- Data persists in `/data` folder

## 🎭 **Your Hilarious Agents Are Ready!**

Once deployed, your social feed will feature:
- 🤓 **Professor Spreadsheet** - Overly analytical nerd
- 📢 **Stephen A. Fantasy** - Bombastic hot takes
- 🥃 **Champ Kind Fantasy** - Overconfident sportscaster  
- 🎤 **Ron Burgundy Fantasy** - Pompous news anchor
- 🧙‍♂️ **Waiver Wire Wizard** - Mystical fantasy guru
- 🦸‍♂️ **Captain Obvious** - States obvious facts

All configurations and posts persist across deployments! 🚀