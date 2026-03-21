import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/records - List records with pagination and search
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const tagId = searchParams.get('tagId') || '';
    const favoriteOnly = searchParams.get('favorite') === 'true';
    
    const client = getSupabaseClient();
    const offset = (page - 1) * limit;
    
    // Build query
    let query = client
      .from('analysis_records')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (search) {
      query = query.or(`input_text.ilike.%${search}%,title.ilike.%${search}%`);
    }
    
    if (favoriteOnly) {
      query = query.eq('is_favorite', true);
    }
    
    if (tagId) {
      // Get record IDs with this tag
      const { data: recordTags } = await client
        .from('record_tags')
        .select('record_id')
        .eq('tag_id', tagId);
      
      if (recordTags && recordTags.length > 0) {
        const recordIds = recordTags.map(rt => rt.record_id);
        query = query.in('id', recordIds);
      } else {
        return NextResponse.json({ records: [], total: 0, page, limit });
      }
    }
    
    const { data: records, error, count } = await query.range(offset, offset + limit - 1);
    
    if (error) {
      console.error('Error fetching records:', error);
      return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
    }
    
    return NextResponse.json({
      records: records || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Records GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/records - Create a new record
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const body = await request.json();
    const {
      inputText,
      inputType = 'text',
      title,
      summary,
      mode = 'concise',
      technicalPoints,
      intentAnalysis,
      responseScripts,
      followUpQuestions,
      knowledgeExtension,
      tagIds = [],
    } = body;
    
    if (!inputText) {
      return NextResponse.json({ error: 'Input text is required' }, { status: 400 });
    }
    
    const client = getSupabaseClient();
    
    // Create record
    const { data: record, error: recordError } = await client
      .from('analysis_records')
      .insert({
        user_id: userId,
        input_text: inputText,
        input_type: inputType,
        title: title || inputText.slice(0, 100),
        summary,
        mode,
        technical_points: technicalPoints,
        intent_analysis: intentAnalysis,
        response_scripts: responseScripts,
        follow_up_questions: followUpQuestions,
        knowledge_extension: knowledgeExtension,
      })
      .select()
      .single();
    
    if (recordError) {
      console.error('Error creating record:', recordError);
      return NextResponse.json({ error: 'Failed to create record' }, { status: 500 });
    }
    
    // Add tags if provided
    if (tagIds.length > 0 && record) {
      const tagInserts = tagIds.map((tagId: string) => ({
        record_id: record.id,
        tag_id: tagId,
      }));
      
      await client.from('record_tags').insert(tagInserts);
    }
    
    return NextResponse.json({ record });
  } catch (error) {
    console.error('Records POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
