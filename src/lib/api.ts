// API Client for frontend

const getApiUrl = (path: string) => `/api${path}`;

// Get or create user ID from localStorage
export const getUserId = (): string => {
  if (typeof window === 'undefined') return '';
  
  let userId = localStorage.getItem('pm_assistant_user_id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('pm_assistant_user_id', userId);
  }
  return userId;
};

// Common headers
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-user-id': getUserId(),
});

// User API
export const userApi = {
  get: async () => {
    const response = await fetch(getApiUrl('/user'), {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },
  update: async (data: { nickname?: string }) => {
    const response = await fetch(getApiUrl('/user'), {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return response.json();
  },
};

// Analyze API - returns ReadableStream
export const analyzeApi = {
  stream: async (inputText: string, mode: 'concise' | 'detailed' = 'concise') => {
    const response = await fetch(getApiUrl('/analyze'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        inputText,
        mode,
        saveRecord: true,
        userId: getUserId(),
      }),
    });
    
    if (!response.ok) {
      throw new Error('分析请求失败');
    }
    
    return response.body;
  },
};

// Records API
export const recordsApi = {
  list: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    tagId?: string;
    favorite?: boolean;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);
    if (params.tagId) searchParams.set('tagId', params.tagId);
    if (params.favorite) searchParams.set('favorite', 'true');
    
    const response = await fetch(getApiUrl(`/records?${searchParams.toString()}`), {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },
  
  get: async (id: string) => {
    const response = await fetch(getApiUrl(`/records/${id}`), {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },
  
  update: async (id: string, data: {
    title?: string;
    summary?: string;
    isFavorite?: boolean;
    tagIds?: string[];
  }) => {
    const response = await fetch(getApiUrl(`/records/${id}`), {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return response.json();
  },
  
  delete: async (id: string) => {
    const response = await fetch(getApiUrl(`/records/${id}`), {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return response.json();
  },
};

// Tags API
export const tagsApi = {
  list: async () => {
    const response = await fetch(getApiUrl('/tags'), {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },
  
  create: async (data: { name: string; color?: string }) => {
    const response = await fetch(getApiUrl('/tags'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return response.json();
  },
  
  update: async (id: string, data: { name?: string; color?: string }) => {
    const response = await fetch(getApiUrl(`/tags/${id}`), {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return response.json();
  },
  
  delete: async (id: string) => {
    const response = await fetch(getApiUrl(`/tags/${id}`), {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return response.json();
  },
};

// Upload API
export const uploadApi = {
  image: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(getApiUrl('/upload'), {
      method: 'POST',
      headers: {
        'x-user-id': getUserId(),
      },
      body: formData,
    });
    return response.json();
  },
  
  audio: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(getApiUrl('/transcribe'), {
      method: 'POST',
      headers: {
        'x-user-id': getUserId(),
      },
      body: formData,
    });
    return response.json();
  },
};
