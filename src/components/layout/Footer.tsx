import Logo from '@/components/ui/Logo';
import { GithubIcon, Heart, ExternalLink } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden">
      {/* Background with gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"></div>
      
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-5 dark:opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '20px 20px'
        }}></div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-12 md:py-16">
          {/* Main footer content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            
            {/* Logo and tagline */}
            <div className="lg:col-span-1 flex flex-col items-center lg:items-start space-y-4">
              <div className="flex items-center space-x-3">
                <Logo className="opacity-90 hover:opacity-100 transition-all duration-300 transform hover:scale-105 scale-125" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center lg:text-left max-w-xs">
                Your fantasy football league's story.
              </p>
            </div>

            {/* GitHub advertisement - centered on mobile, right-aligned on desktop */}
            <div className="lg:col-span-1 flex justify-center lg:justify-center">
              <div className="group relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-700 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                  <div className="flex flex-col items-center space-y-3">
                    <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                      <span>Check out the free</span>
                      <a 
                        href="https://github.com/ebrown-32/LeaguePulse" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group/link"
                      >
                        <GithubIcon className="w-5 h-5 group-hover/link:animate-bounce" />
                        <span>GitHub repo</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    </div>
                    <p className="text-center text-sm text-gray-600 dark:text-gray-400 font-medium">
                      Drop a ⭐ and modify the site to your liking!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Credits and legal */}
            <div className="lg:col-span-1 flex flex-col items-center lg:items-end space-y-4">
              <div className="flex flex-col items-center lg:items-end space-y-2">
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                  <span>Built by</span>
                  <a 
                    href="https://elibrown.info" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Eli Brown
                  </a>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-500 text-center lg:text-right">
                  © {currentYear} League Pulse
                </p>
              </div>
            </div>
          </div>

          {/* Bottom section with legal text */}
          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-500 max-w-2xl mx-auto leading-relaxed">
                Data sourced from Sleeper. Not affiliated with Sleeper. All trademarks belong to their respective owners.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
} 