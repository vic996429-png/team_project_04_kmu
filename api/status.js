// GET /api/status → 키 이름별 「값 있음 / 비어 있음」만 알려 준다. 키 값은 절대 내보내지 않는다.
import { send } from './_lib/http.js';
import { DATA_KEY_ENV } from './trend.js';

const KEYS = [
  { env: 'CLAUDE_API_KEY', use: 'AI 1순위(Claude)' },
  { env: 'GROQ_API_KEY', use: 'AI 2순위(Groq)' },
  { env: 'GEMINI_API_KEY', use: 'AI 3순위(Gemini)' },
  { env: 'LAW_OC', use: '현행 법령·조례·변경이력·신구법' },
  { env: 'LAWMAKING_OC', use: '진행 중 입법예고' },
  { env: DATA_KEY_ENV, use: '권익위 민원빅데이터' },
];

export default function handler(req, res) {
  send(res, 200, { keys: KEYS.map((k) => ({ ...k, set: Boolean((process.env[k.env] || '').trim()) })) });
}
