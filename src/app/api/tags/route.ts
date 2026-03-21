import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/tags - List all tags for user
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const client = getSupabaseClient();
    
    const { data: tags, error } = await client
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching tags:', error);
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }
    
    return NextResponse.json({ tags: tags || [] });
  } catch (error) {
    console.error('Tags GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const body = await request.json();
    const { name, color = '#6366f1' } = body;
    
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }
    
    const client = getSupabaseClient();
    
    // Check if tag already exists
    const { data: existing } = await client
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .eq('name', name.trim())
      .single();
    
    if (existing) {
      return NextResponse.json({ tag: existing });
    }
    
    // Create new tag
    const { data: tag, error } = await client
      .from('tags')
      .insert({
        user_id: userId,
        name: name.trim(),
        color,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating tag:', error);
      return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
    }
    
    return NextResponse.json({ tag });
  } catch (error) {
    console.error('Tags POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
