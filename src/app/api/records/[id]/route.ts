import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/records/[id] - Get a single record with tags
export async function GET(
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
    
    // Get record
    const { data: record, error: recordError } = await client
      .from('analysis_records')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (recordError || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    
    // Get tags for this record
    const { data: recordTags } = await client
      .from('record_tags')
      .select('tag_id, tags(*)')
      .eq('record_id', id);
    
    const tags = recordTags?.map(rt => rt.tags).filter(Boolean) || [];
    
    return NextResponse.json({ record: { ...record, tags } });
  } catch (error) {
    console.error('Record GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/records/[id] - Update a record
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
    const { title, summary, isFavorite, tagIds } = body;
    
    const client = getSupabaseClient();
    
    // Update record
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (summary !== undefined) updateData.summary = summary;
    if (isFavorite !== undefined) updateData.is_favorite = isFavorite;
    
    const { data: record, error: updateError } = await client
      .from('analysis_records')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error updating record:', updateError);
      return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
    }
    
    // Update tags if provided
    if (tagIds !== undefined) {
      // Remove existing tags
      await client.from('record_tags').delete().eq('record_id', id);
      
      // Add new tags
      if (tagIds.length > 0) {
        const tagInserts = tagIds.map((tagId: string) => ({
          record_id: id,
          tag_id: tagId,
        }));
        await client.from('record_tags').insert(tagInserts);
      }
    }
    
    return NextResponse.json({ record });
  } catch (error) {
    console.error('Record PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/records/[id] - Delete a record
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
    
    // Delete record tags first
    await client.from('record_tags').delete().eq('record_id', id);
    
    // Delete record
    const { error: deleteError } = await client
      .from('analysis_records')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (deleteError) {
      console.error('Error deleting record:', deleteError);
      return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Record DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
