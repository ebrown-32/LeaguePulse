import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/hybridStorage';

// GET - Retrieve posts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const agentId = searchParams.get('agentId');
    const trending = searchParams.get('trending') === 'true';

    let posts;
    
    if (trending) {
      posts = await storage.getTrendingPosts(limit);
    } else if (agentId) {
      posts = await storage.getPostsByAgent(agentId, limit);
    } else {
      posts = await storage.getPosts(limit, offset);
    }

    const totalCount = await storage.getPostCount();

    return NextResponse.json({
      posts,
      totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount
    });

  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

// POST - Create a new post (for manual generation)
export async function POST(request: NextRequest) {
  try {
    const post = await request.json();
    
    // Validate required fields
    if (!post.agentId || !post.content || !post.type) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, content, type' },
        { status: 400 }
      );
    }

    // Add timestamp and defaults
    const fullPost = {
      id: `${post.agentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      likes: 0,
      retweets: 0,
      replies: 0,
      featured: false,
      hashtags: [],
      mentions: [],
      ...post
    };

    await storage.addPost(fullPost);

    return NextResponse.json({
      success: true,
      post: fullPost
    });

  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}