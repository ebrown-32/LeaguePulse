import Logo from '@/components/ui/Logo';
import { LEAGUE_ID } from '@/config/league';
import { GithubIcon } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-gray-900/50 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-8 md:py-12">
          <div className="flex flex-col items-center space-y-8">
            {/* Logo */}
            <div className="flex items-center space-x-2">
              <Logo className="opacity-80 hover:opacity-100 transition-opacity" />
            </div>

            {/* Built By & Copyright */}
            <div className="flex flex-col items-center space-y-3 text-sm text-gray-400">
              <div className="flex items-center space-x-1">
                <span>Built by</span>
                <a 
                  href="https://elibrown.info" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium text-white hover:text-blue-400 transition-colors"
                >
                  Eli Brown
                </a>
              </div>
              <div className="text-center">
                <p>© {currentYear} League Pulse. All rights reserved.</p>
                <p className="mt-1 text-xs text-gray-500">
                  Data sourced from Sleeper. Not affiliated with Sleeper. All trademarks belong to their respective owners.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
} 