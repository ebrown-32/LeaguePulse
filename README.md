# League Pulse - Give life to your fantasy football league.

A modern, feature-rich web application that creates a personalized website for your Sleeper fantasy football league. Built with Next.js, TypeScript, and Tailwind CSS.

Live demo site used for my league: https://league-pulse.vercel.app/

## 🌟 Features

- **League Dashboard**: View league settings, current standings, recent matchups, and league activity.
- **Historical Data**: Track your league's history across multiple seasons including records, achievements, and all-time stats.
- **Next-Gen Stats**: Advanced analytics and performance metrics with engaging visualizations.
- **Media Center**: Live football news from top sources. Customizable AI Media Personalities to report on your league coming soon.
- **Responsive Design**: Works seamlessly on desktop and mobile devices.
- **Dark/Light Mode**: Choose your preferred theme.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or later (or Docker - see Docker section below)
- A Sleeper fantasy football league
- Git (for version control)

### Installation Options

#### Option 1: Local Installation

1. Clone the repository:
```bash
git clone https://github.com/ebrown-32/LeaguePulse
cd LeaguePulse
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_LEAGUE_ID=your_sleeper_league_id
```

Replace `your_sleeper_league_id` with your Sleeper league ID. You can find this in your Sleeper league URL: `https://sleeper.app/leagues/<league_id>`.

4. Start the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to see your league website.

#### Option 2: Using Docker (Recommended for Development)

Docker provides a consistent development environment across all platforms. Here's how to use it:

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

2. Clone the repository:
```bash
git clone https://github.com/ebrown-32/LeaguePulse
cd LeaguePulse
```

3. Build and start the Docker container:
```bash
docker compose up -d
```

The application will be available at `http://localhost:3000`.

#### Option 3: Using VS Code Dev Containers (Best Developer Experience)

Dev Containers provide a full-featured development environment with all necessary extensions and tools:

1. Prerequisites:
   - Install [VS Code](https://code.visualstudio.com/)
   - Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) in VS Code

2. Open in Dev Container:
   - Clone the repository
   - Open the folder in VS Code
   - Press `F1`, type "Dev Containers: Open Folder in Container"
   - VS Code will reload and build the dev container

3. Once inside the container:
   - The terminal will automatically be in the correct directory
   - All necessary extensions will be pre-installed
   - Node.js and npm will be pre-configured
   - Just run `npm install` and `npm run dev` to start developing

## 🌐 Deployment

### Deploy to Vercel (Recommended for Beginners)

Vercel offers the easiest way to deploy your League Pulse website. Here's a step-by-step guide:

1. **Prepare Your Project**
   - Fork the repository to your GitHub account:
     - Visit `https://github.com/ebrown-32/LeaguePulse`
     - Give the project a star! ⭐️
     - Click the "Fork" button in the top-right corner
     - Wait for the fork to complete

2. **Sign Up for Vercel**
   - Go to [Vercel.com](https://vercel.com)
   - Click "Sign Up"
   - Choose "Continue with GitHub" (recommended)
   - Follow the authorization steps

3. **Import Your Project**
   - Once logged in to Vercel:
     - Click "Add New..."
     - Select "Project"
     - Find and select your forked repository
     - Click "Import"

4. **Configure Your Project**
   - Project Name: Choose a name (e.g., `my-league-website`)
   - Framework Preset: Should auto-detect as "Next.js"
   - Root Directory: Leave as `.`
   - IMPORTANT:In the "Environment Variables" section:
     - Click "Add Variable"
     - Name: `NEXT_PUBLIC_LEAGUE_ID`
     - Value: Your Sleeper league ID
     - Click "Add"

5. **Deploy**
   - Click "Deploy"
   - Wait for the deployment to complete (usually 1-2 minutes)
   - Click the "Visit" button to see your live site!

Your site will now be live at `https://your-project-name.vercel.app`

#### Updating Your Vercel Deployment

Vercel will automatically redeploy your site whenever you push changes to your GitHub repository. To update:

1. Pull the latest changes from the main repository (if you want updates):
```bash
git pull origin main
```

2. Push to your fork:
```bash
git push
```

3. Vercel will automatically detect the changes and redeploy your site

## 🔄 Updating

To update to the latest version:

1. Pull the latest changes:
```bash
git pull origin main
```

2. Install any new dependencies:
```bash
npm install
```

3. Rebuild the application:
```bash
npm run build
```

## 🛠️ Configuration

### Required Configuration

The only required configuration is your Sleeper league ID in the `.env.local` file:

```env
NEXT_PUBLIC_LEAGUE_ID=your_sleeper_league_id
```

You can find your league ID in the URL when viewing your league on Sleeper: `https://sleeper.app/leagues/<league_id>`

### Optional Configuration

The application automatically adapts to your league's settings, including:
- Roster positions
- Scoring type (PPR/Standard)
- Playoff settings
- Number of teams
- League history

No additional configuration is needed as all league settings are pulled directly from the Sleeper API.

## 📚 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is open source and free to use for personal, non-commercial purposes. You may not resell, sublicense, or monetize this project or any derivatives of it without explicit permission. All rights reserved.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Data sourced from [Sleeper API](https://docs.sleeper.app/)
