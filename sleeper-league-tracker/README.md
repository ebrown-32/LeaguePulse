# Sleeper League Tracker

A modern, responsive web application for tracking your Sleeper fantasy football league stats and records. Built with Next.js 13+, TypeScript, and TailwindCSS.

## Features

- 📊 Real-time standings and statistics
- 🏆 League records and achievements
- 🎮 Current and historical matchups
- 📱 Fully responsive design
- ⚡ Fast and modern UI with beautiful animations
- 🌙 Dark mode by default

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/yourusername/sleeper-league-tracker.git
cd sleeper-league-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory and add your Sleeper league ID:
```env
NEXT_PUBLIC_LEAGUE_ID=your_league_id
```

You can find your league ID in the URL when viewing your league on Sleeper:
`https://sleeper.app/leagues/<league_id>`

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
src/
├── app/                # Next.js 13 app directory
│   ├── page.tsx       # Home page (standings overview)
│   ├── matchups/      # Matchups page
│   ├── standings/     # Detailed standings page
│   └── records/       # League records page
├── components/        # Reusable React components
│   ├── ui/           # UI components (Card, Avatar, etc.)
│   └── layout/       # Layout components (Navbar)
├── lib/              # Utility functions and API
├── types/            # TypeScript type definitions
└── config/           # Configuration files
```

## API Integration

This project uses the Sleeper API to fetch league data. The API is read-only and doesn't require authentication. Key endpoints used:

- League info: `/league/<league_id>`
- Rosters: `/league/<league_id>/rosters`
- Users: `/league/<league_id>/users`
- Matchups: `/league/<league_id>/matchups/<week>`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Sleeper API](https://docs.sleeper.app) for providing the fantasy football data
- [Next.js](https://nextjs.org) for the amazing React framework
- [TailwindCSS](https://tailwindcss.com) for the utility-first CSS framework
- [Heroicons](https://heroicons.com) for the beautiful icons
