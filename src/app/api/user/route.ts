import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/user - Get or create user by ID
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const client = getSupabaseClient();
    
    // Try to get existing user
    const { data: existingUser, error: fetchError } = await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (existingUser) {
      return NextResponse.json({ user: existingUser });
    }
    
    // Create new user if not exists
    const { data: newUser, error: createError } = await client
      .from('users')
      .insert({ id: userId })
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating user:', createError);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
    
    return NextResponse.json({ user: newUser });
  } catch (error) {
    console.error('User API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/user - Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const body = await request.json();
    const { nickname } = body;
    
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('users')
      .update({ 
        nickname,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating user:', error);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
    
    return NextResponse.json({ user: data });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
