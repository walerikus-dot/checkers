import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  withCredentials: true,
});

let accessToken: string | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      try {
        const res = await api.post('/api/auth/refresh');
        const { accessToken: newToken, user } = res.data;
        setAccessToken(newToken);
        // Persist new token + user so next page reload doesn't use a stale expired token
        const { useAuthStore } = await import('../store/auth.store');
        useAuthStore.getState().setAuth(user, newToken);
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return api(err.config);
      } catch {
        setAccessToken(null);
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  register: (email: string, username: string, password: string) => api.post('/api/auth/register', { email, username, password }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
};

export const gamesApi = {
  createPrivate: (rulesType?: string) => api.post('/api/games/private', { rulesType }),
  getGame: (id: string) => api.get(`/api/games/${id}`),
  getMoves: (id: string) => api.get(`/api/games/${id}/moves`),
  submitMove: (id: string, from: string, to: string) => api.post(`/api/games/${id}/move`, { from, to }),
  resign: (id: string) => api.delete(`/api/games/${id}`),
  history: (userId?: string) => api.get('/api/games/history', { params: { userId } }),
  quickPlay: (rulesType?: string) => api.post('/api/games/quick-play', { rulesType }),
  cancelQuickPlay: () => api.delete('/api/games/quick-play'),
};

export const usersApi = {
  getProfile: (id: string) => api.get(`/api/users/${id}`),
  update: (id: string, data: any) => api.put(`/api/users/${id}`, data),
  search: (q: string) => api.get('/api/users/search', { params: { q } }),
  leaderboard: (limit?: number) => api.get('/api/users/leaderboard', { params: { limit } }),
};

export const tournamentsApi = {
  list:            ()                             => api.get('/api/tournaments'),
  get:             (id: string)                   => api.get(`/api/tournaments/${id}`),
  getBracket:      (id: string)                   => api.get(`/api/tournaments/${id}/bracket`),
  getParticipants: (id: string)                   => api.get(`/api/tournaments/${id}/participants`),
  create:          (body: any)                    => api.post('/api/tournaments', body),
  join:            (id: string)                   => api.post(`/api/tournaments/${id}/join`),
  leave:           (id: string)                   => api.delete(`/api/tournaments/${id}/join`),
  // Admin actions — require X-Admin-Key header
  adminStart:      (id: string, key: string)      => api.post(`/api/tournaments/${id}/start`,  {}, { headers: { 'x-admin-key': key } }),
  adminCancel:     (id: string, key: string)      => api.post(`/api/tournaments/${id}/cancel`, {}, { headers: { 'x-admin-key': key } }),
  adminResult:     (id: string, matchId: string, winnerId: string | null, key: string) =>
    api.post(`/api/tournaments/${id}/matches/${matchId}/result`, { winnerId }, { headers: { 'x-admin-key': key } }),
  // Schedules (admin only)
  listSchedules:   (key: string)                  => api.get('/api/tournaments/schedules/list',    { headers: { 'x-admin-key': key } }),
  createSchedule:  (body: any, key: string)       => api.post('/api/tournaments/schedules',        body, { headers: { 'x-admin-key': key } }),
  updateSchedule:  (id: string, body: any, key: string) => api.patch(`/api/tournaments/schedules/${id}`, body, { headers: { 'x-admin-key': key } }),
  deleteSchedule:  (id: string, key: string)      => api.delete(`/api/tournaments/schedules/${id}`,      { headers: { 'x-admin-key': key } }),
};

export const friendsApi = {
  list: () => api.get('/api/friends'),
  requests: () => api.get('/api/friends/requests'),
  sendRequest: (userId: string) => api.post(`/api/friends/request/${userId}`),
  accept: (requestId: string) => api.post(`/api/friends/${requestId}/accept`),
  remove: (userId: string) => api.delete(`/api/friends/${userId}`),
};

export default api;
