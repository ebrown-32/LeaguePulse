'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { 
  ChevronUpIcon, 
  ChevronDownIcon,
  HeartIcon,
  ShareIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Article {
  headline: string;
  description: string;
  published: string;
  images: {
    url: string;
    caption: string;
    height: number;
    width: number;
  }[];
  links: {
    web: {
      href: string;
    };
  };
  byline?: string;
}

export default function NewsView() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likedArticles, setLikedArticles] = useState<Set<number>>(new Set());
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [page, setPage] = useState(0);
  const [dominantColor, setDominantColor] = useState('#1a1a2e');
  const [secondaryColor, setSecondaryColor] = useState('#0f4392');
  const [showTooltip, setShowTooltip] = useState(true);

  const fetchNews = useCallback(async (pageNum: number) => {
    try {
      const response = await fetch(`/api/news?limit=20&page=${pageNum}`);
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      const data = await response.json();
      return data.articles || [];
    } catch (error) {
      console.error('Failed to fetch news:', error);
      return [];
    }
  }, []);

  // Initial news load
  useEffect(() => {
    const loadInitialNews = async () => {
      const initialArticles = await fetchNews(0);
      setArticles(initialArticles);
      setLoading(false);
    };

    loadInitialNews();
  }, [fetchNews]);

  // Load more articles when near the end
  useEffect(() => {
    const loadMore = async () => {
      if (currentIndex >= articles.length - 5 && !loadingMore) {
        setLoadingMore(true);
        const nextPage = page + 1;
        const newArticles = await fetchNews(nextPage);
        
        if (newArticles.length > 0) {
          setPage(nextPage);
          setArticles(prevArticles => {
            const existingHeadlines = new Set(prevArticles.map(a => a.headline));
            const uniqueNewArticles = newArticles.filter((a: Article) => !existingHeadlines.has(a.headline));
            return [...prevArticles, ...uniqueNewArticles];
          });
        }
        setLoadingMore(false);
      }
    };

    loadMore();
  }, [currentIndex, articles.length, fetchNews, loadingMore, page]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          paginate(-1);
          break;
        case 'ArrowDown':
          paginate(1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Color extraction effect
  useEffect(() => {
    const extractColorsFromCurrentImage = async () => {
      if (!articles.length || !articles[currentIndex]?.images?.[0]?.url) return;
      
      const imageUrl = articles[currentIndex].images[0].url;
      try {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
        
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0;
        let count = 0;

        for (let i = 0; i < imageData.length; i += 16) {
          r += imageData[i];
          g += imageData[i + 1];
          b += imageData[i + 2];
          count++;
        }

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        const darkerR = Math.floor(r * 0.7);
        const darkerG = Math.floor(g * 0.7);
        const darkerB = Math.floor(b * 0.7);

        setDominantColor(`rgb(${r}, ${g}, ${b})`);
        setSecondaryColor(`rgb(${darkerR}, ${darkerG}, ${darkerB})`);
      } catch (error) {
        console.error('Failed to extract colors:', error);
      }
    };

    extractColorsFromCurrentImage();
  }, [articles, currentIndex]);

  const paginate = (direction: number) => {
    setCurrentIndex((prevIndex) => {
      let nextIndex = prevIndex + direction;
      if (nextIndex < 0) nextIndex = articles.length - 1;
      if (nextIndex >= articles.length) nextIndex = 0;
      return nextIndex;
    });
    setShowFullDescription(false);
  };

  const toggleLike = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLikedArticles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const shareArticle = async (article: Article, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.share({
        title: article.headline,
        text: article.description,
        url: article.links.web.href
      });
    } catch (error) {
      window.open(article.links.web.href, '_blank');
    }
  };

  useEffect(() => {
    // Hide tooltip after 3 seconds
    const timer = setTimeout(() => {
      setShowTooltip(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!articles.length) return null;

  const article = articles[currentIndex];
  const mainImage = article.images?.[0];
  const isLiked = likedArticles.has(currentIndex);

  return (
    <div className="relative h-[calc(100vh-6rem)] w-full overflow-hidden bg-gray-900 dark:bg-gray-900 bg-white">
      {/* Initial tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-6 py-3 rounded-full 
              bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700
              text-gray-800 dark:text-white text-sm font-medium backdrop-blur-md"
          >
            Swipe or use arrow keys to navigate articles
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 200 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -200 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30
          }}
          className="relative h-full w-full max-w-5xl mx-auto"
        >
          {/* Navigation Indicators */}
          <div className="absolute left-0 md:-left-16 top-1/2 -translate-y-1/2 flex flex-col items-center space-y-4 z-20">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-full bg-white/80 dark:bg-white/10 backdrop-blur-md 
                hover:bg-gray-100 dark:hover:bg-white/20 transition-colors 
                border border-gray-200 dark:border-white/10 shadow-lg"
              onClick={() => paginate(-1)}
              aria-label="Previous article"
            >
              <ChevronUpIcon className="w-6 h-6 text-gray-700 dark:text-white" />
            </motion.button>
            
            <div className="py-4 flex flex-col items-center space-y-2">
              {articles.slice(Math.max(0, currentIndex - 2), Math.min(articles.length, currentIndex + 3)).map((_, idx) => {
                const currentIdx = idx + Math.max(0, currentIndex - 2);
                return (
                  <div
                    key={currentIdx}
                    className={`w-1 h-6 rounded-full transition-all duration-300 shadow-lg ${
                      currentIdx === currentIndex 
                        ? 'bg-gray-800 dark:bg-white scale-100' 
                        : 'bg-gray-400 dark:bg-white/30 scale-75'
                    }`}
                  />
                );
              })}
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-full bg-white/80 dark:bg-white/10 backdrop-blur-md 
                hover:bg-gray-100 dark:hover:bg-white/20 transition-colors 
                border border-gray-200 dark:border-white/10 shadow-lg"
              onClick={() => paginate(1)}
              aria-label="Next article"
            >
              <ChevronDownIcon className="w-6 h-6 text-gray-700 dark:text-white" />
            </motion.button>
          </div>

          {/* Main Content */}
          <div className="relative h-full flex flex-col md:flex-row items-center justify-center p-4 md:p-8 gap-8">
            {/* Image Section */}
            <motion.div 
              className="relative w-full md:w-2/3 h-[40vh] md:h-[70vh] rounded-3xl overflow-hidden shadow-2xl cursor-pointer group"
              onClick={() => paginate(1)}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3 }}
            >
              {mainImage ? (
                <>
                  <Image
                    src={mainImage.url}
                    alt={mainImage.caption || article.headline}
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90" />
                </>
              ) : (
                <div className="w-full h-full bg-gradient-to-b from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-950" />
              )}
              
              {/* Click indicator */}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex items-center justify-center backdrop-blur-sm">
                <span className="text-white text-lg font-medium px-6 py-3 rounded-full bg-white/10 border border-white/20 shadow-xl">
                  Click to see next article
                </span>
              </div>
            </motion.div>

            {/* Content Section */}
            <div className="relative w-full md:w-1/3 mt-4 md:mt-0">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="backdrop-blur-xl bg-white/80 dark:bg-white/10 rounded-3xl p-6 
                  border border-gray-200 dark:border-white/10 shadow-2xl 
                  text-gray-800 dark:text-white"
              >
                <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                  {article.headline}
                </h2>
                <div 
                  className={`text-gray-600 dark:text-gray-200 text-sm md:text-base mb-4 cursor-pointer ${showFullDescription ? '' : 'line-clamp-3'}`}
                  onClick={() => setShowFullDescription(!showFullDescription)}
                >
                  {article.description}
                </div>
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-300 mb-6">
                  <span>{new Date(article.published).toLocaleDateString()}</span>
                  {article.byline && (
                    <>
                      <span className="mx-2">•</span>
                      <span>{article.byline}</span>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-6 pt-4 border-t border-gray-200 dark:border-white/10">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => toggleLike(currentIndex, e)}
                    className="flex flex-col items-center"
                    aria-label={isLiked ? "Unlike article" : "Like article"}
                  >
                    {isLiked ? (
                      <HeartIconSolid className="w-8 h-8 text-red-500 drop-shadow-glow-red" />
                    ) : (
                      <HeartIcon className="w-8 h-8 text-gray-700 dark:text-white" />
                    )}
                    <span className="text-sm mt-1">Like</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => shareArticle(article, e)}
                    className="flex flex-col items-center"
                    aria-label="Share article"
                  >
                    <ShareIcon className="w-8 h-8 text-gray-700 dark:text-white" />
                    <span className="text-sm mt-1">Share</span>
                  </motion.button>

                  <motion.a
                    href={article.links.web.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center text-gray-700 dark:text-white"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    aria-label="Read full article"
                    onClick={e => e.stopPropagation()}
                  >
                    <ArrowTopRightOnSquareIcon className="w-8 h-8" />
                    <span className="text-sm mt-1">Read</span>
                  </motion.a>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Loading indicator */}
      {loadingMore && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <LoadingSpinner />
        </div>
      )}

      <style jsx global>{`
        .drop-shadow-glow-red {
          filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.5));
        }
      `}</style>
    </div>
  );
} 