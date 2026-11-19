// AI 호출 — CLAUDE_API_KEY → GROQ_API_KEY → GEMINI_API_KEY 순서.
// 앞이 실패하면(키 비어 있음 · 오류 · 시간 초과) 다음으로 넘어가고, 누가 답했는지와 실패 이유를 함께 돌려준다.
// 모델 이름은 코드에 박지 않고, 키로 모델 목록을 조회해 고른다(404 → 모델 이름부터 의심 → 목록 다시 조회).
import Anthropic from '@anthropic-ai/sdk';

export const TIMEOUT_MS = 15000; // 공급자별 시간 초과 [팀 설계안]

const modelCache = {}; // 서버 인스턴스가 살아 있는 동안만 기억

class AIError extends Error {
  constructor(reason, detail, status) {
    super(detail || reason);
    this.reason = reason; // 키 비어 있음 | 승인 안 됨 | 시간 초과 | 모델 없음 | 거절됨 | 오류
    this.status = status;
  }
}

function reasonFromStatus(status) {
  if (status === 401 || status === 403) return '승인 안 됨';
  if (status === 404) return '모델 없음';
  if (status === 408) return '시간 초과';
  if (status === 429) return '사용량 초과';
  return '오류';
}

async function httpJson(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new AIError('시간 초과', `${TIMEOUT_MS / 1000}초 안에 응답 없음`);
    throw new AIError('오류', `연결 실패: ${e.message}`);
  }
  const body = await res.text();
  if (!res.ok) throw new AIError(reasonFromStatus(res.status), `HTTP ${res.status} ${body.slice(0, 160)}`, res.status);
  try { return JSON.parse(body); } catch { throw new AIError('오류', '응답이 JSON 이 아님'); }
}

// ── Claude ──────────────────────────────────────────────
// 기본 선호: claude-opus-5-5. 목록에 없으면 목록의 다른 Opus → Sonnet → 첫 모델
const CLAUDE_PREF = [/^claude-opus-5-5$/, /^claude-opus/, /^claude-sonnet/, /.*/];
// 서버 측 거절 대비(fallbacks: "default")와 effort 를 받는 모델만 해당 옵션을 붙인다
const CLAUDE_FALLBACK_OK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

function pick(ids, prefs) {
  for (const re of prefs) {
    const hit = ids.find((id) => re.test(id));
    if (hit) return hit;
  }
  return null;
}

function claudeClient(key) {
  return new Anthropic({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 0 });
}

async function claudeModel(key, refresh = false) {
  if (modelCache.claude && !refresh) return modelCache.claude;
  const ids = [];
  try {
    for await (const m of claudeClient(key).models.list()) ids.push(m.id);
  } catch (e) {
    throw mapClaudeError(e);
  }
  const model = pick(ids, CLAUDE_PREF);
  if (!model) throw new AIError('모델 없음', '모델 목록이 비어 있음');
  return (modelCache.claude = model);
}

function mapClaudeError(e) {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AIError('시간 초과', `${TIMEOUT_MS / 1000}초 안에 응답 없음`);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AIError('승인 안 됨', e.message, e.status);
  if (e instanceof Anthropic.NotFoundError) return new AIError('모델 없음', e.message, 404);
  if (e instanceof Anthropic.RateLimitError) return new AIError('사용량 초과', e.message, 429);
  if (e instanceof Anthropic.APIConnectionError) return new AIError('오류', `연결 실패: ${e.message}`);
  if (e instanceof Anthropic.APIError) return new AIError(reasonFromStatus(e.status), e.message, e.status);
  return new AIError('오류', e.message);
}

async function callClaude(key, system, user, retried = false) {
  const model = await claudeModel(key, retried);
  const params = {
    model,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (CLAUDE_FALLBACK_OK.has(model)) {
    params.output_config = { effort: 'low' }; // 분류·순화는 짧은 작업이라 낮은 effort
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  try {
    const res = await claudeClient(key).beta.messages.create(params);
    if (res.stop_reason === 'refusal') throw new AIError('거절됨', `안전 분류기가 거절함(${res.stop_details?.category ?? '분류 없음'})`);
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, model: res.model || model };
  } catch (e) {
    const err = mapClaudeError(e);
    if (err.reason === '모델 없음' && !retried) return callClaude(key, system, user, true); // 404 → 목록 다시 조회 후 1회 재시도
    throw err;
  }
}

// ── Groq ────────────────────────────────────────────────
const GROQ_PREF = [/llama-3\.3-70b/, /llama-4/, /gpt-oss-120b/, /70b/, /qwen/, /.*/];
const GROQ_SKIP = /whisper|guard|tts|distil|playai|orpheus|prompt-guard/i;

async function groqModel(key, refresh = false) {
  if (modelCache.groq && !refresh) return modelCache.groq;
  const data = await httpJson('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  const ids = (data.data || []).filter((m) => m.active !== false).map((m) => m.id).filter((id) => !GROQ_SKIP.test(id));
  const model = pick(ids, GROQ_PREF);
  if (!model) throw new AIError('모델 없음', '사용할 수 있는 대화 모델이 없음');
  return (modelCache.groq = model);
}

async function callGroq(key, system, user, retried = false) {
  const model = await groqModel(key, retried);
  try {
    const data = await httpJson('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    return { text: data.choices?.[0]?.message?.content ?? '', model };
  } catch (e) {
    if (e.reason === '모델 없음' && !retried) return callGroq(key, system, user, true);
    throw e;
  }
}

// ── Gemini ──────────────────────────────────────────────
const GEMINI_PREF = [/gemini-[\d.]+-flash$/, /gemini-[\d.]+-flash(?!-lite)/, /flash/, /gemini/, /.*/];

async function geminiModel(key, refresh = false) {
  if (modelCache.gemini && !refresh) return modelCache.gemini;
  const data = await httpJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  const usable = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => !/image|tts|embedding|vision|aqa|live|audio/i.test(id))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true })); // 버전이 높은 것 먼저
  const model = pick(usable, GEMINI_PREF);
  if (!model) throw new AIError('모델 없음', '사용할 수 있는 모델이 없음');
  return (modelCache.gemini = model);
}

async function callGemini(key, system, user, retried = false) {
  const model = await geminiModel(key, retried);
  try {
    const data = await httpJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    });
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new AIError('거절됨', `빈 응답(${data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? '이유 없음'})`);
    return { text, model };
  } catch (e) {
    if (e.reason === '모델 없음' && !retried) return callGemini(key, system, user, true);
    throw e;
  }
}

// ── 순서대로 부르기 ─────────────────────────────────────
export const PROVIDERS = [
  { name: 'Claude', env: 'CLAUDE_API_KEY', call: callClaude },
  { name: 'Groq', env: 'GROQ_API_KEY', call: callGroq },
  { name: 'Gemini', env: 'GEMINI_API_KEY', call: callGemini },
];

// 공급자가 JSON 앞뒤에 말을 붙여도 첫 { ... } 를 꺼낸다
export function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AIError('오류', 'JSON 형식 답이 아님');
  try { return JSON.parse(s.slice(start, end + 1)); } catch { throw new AIError('오류', 'JSON 해석 실패'); }
}

/**
 * @param {string} system 지시문
 * @param {string} user   사용자 입력(개인정보 가린 글)
 * @param {(json:any)=>any} validate 형식 검사 — 실패하면 throw → 다음 공급자로
 */
export async function callAI(system, user, validate = (x) => x) {
  const tried = [];
  for (const p of PROVIDERS) {
    const key = (process.env[p.env] || '').trim();
    if (!key) { tried.push({ provider: p.name, ok: false, reason: '키 비어 있음' }); continue; }
    const t0 = Date.now();
    try {
      const { text, model } = await p.call(key, system, user);
      const json = validate(extractJson(text));
      tried.push({ provider: p.name, ok: true, model, ms: Date.now() - t0 });
      return { ok: true, provider: p.name, model, json, tried };
    } catch (e) {
      tried.push({ provider: p.name, ok: false, reason: e.reason || '오류', detail: String(e.message || '').slice(0, 200), ms: Date.now() - t0 });
    }
  }
  return { ok: false, tried };
}
