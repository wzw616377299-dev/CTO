import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// PATCH /api/tags/[id] - Update a tag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id');
    const { id } = await params;
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const body = await request.json();
    const { name, color } = body;
    
    const client = getSupabaseClient();
    
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;
    
    const { data: tag, error } = await client
      .from('tags')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating tag:', error);
      return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
    }
    
    return NextResponse.json({ tag });
  } catch (error) {
    console.error('Tag PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/tags/[id] - Delete a tag
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = request.headers.get('x-user-id');
    const { id } = await params;
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const client = getSupabaseClient();
    
    // Delete record_tags associations first
    await client.from('record_tags').delete().eq('tag_id', id);
    
    // Delete tag
    const { error } = await client
      .from('tags')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error deleting tag:', error);
      return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Tag DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
