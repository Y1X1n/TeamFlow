import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    'http_req_duration{name:board}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.API_BASE || 'http://localhost:4000/api/v1';
const EMAIL = __ENV.EMAIL || 'alice@example.com';
const PASSWORD = __ENV.PASSWORD || 'Passw0rd!';

export function setup() {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, { 'login ok': (res) => res.status === 200 });
  const token = login.json('accessToken');
  const projects = http.get(`${BASE}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const projectId = projects.json('items.0.id');
  return { token, projectId };
}

export default function (data) {
  const response = http.get(`${BASE}/projects/${data.projectId}/board`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { name: 'board' },
  });
  check(response, {
    'board status 200': (res) => res.status === 200,
    'has columns': (res) => Array.isArray(res.json('columns')) && res.json('columns').length > 0,
  });
  sleep(1);
}
