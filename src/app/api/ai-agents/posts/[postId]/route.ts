import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/hybridStorage';

// PATCH - Update post (for likes, retweets, etc.)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await context.params;
    const updates = await request.json();

    // Only allow certain fields to be updated
    const allowedUpdates = ['likes', 'retweets', 'replies', 'featured'];
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as any);

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    await storage.updatePost(postId, filteredUpdates);

    return NextResponse.json({
      success: true,
      updates: filteredUpdates
    });

  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

// DELETE - Delete post
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await context.params;

    await storage.deletePost(postId);

    return NextResponse.json({
      success: true
    });

  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}