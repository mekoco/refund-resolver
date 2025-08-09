import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

export const api = axios.create({ baseURL: BASE_URL, timeout: 30000 });

export async function healthcheck() {
  const res = await api.get('/health');
  return res.data;
} 