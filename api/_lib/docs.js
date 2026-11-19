// docs/답변참고문서 읽기 — AI 근거·법령 API 시연 값으로 쓴다. 기획서 성격 문서는 제외(CLAUDE.md: 기획서는 근거 아님)
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'docs', '답변참고문서');
export const EXCLUDED = ['성북 안심 민원 필터 서비스 운영 기준기획안 발췌 (1).md', '문서검토_결과 (1).md'];

export function listDocs() {
  try {
    return readdirSync(DIR).filter((f) => f.endsWith('.md') && !EXCLUDED.includes(f));
  } catch {
    return [];
  }
}

export function readDoc(file) {
  if (!listDocs().includes(file)) return null;
  const raw = readFileSync(path.join(DIR, file), 'utf8');
  const title = (raw.match(/^#\s+(.+)$/m) || [, file.replace(/\.md$/, '')])[1].trim();
  // 맨 위 표(| 항목 | 내용 |)에서 공포·시행·상태·원문 등을 뽑는다
  const meta = {};
  for (const m of raw.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)) {
    const k = m[1].trim();
    if (k && k !== '항목' && !/^-+$/.test(k)) meta[k] = m[2].trim();
  }
  return { file, title, meta, raw };
}

// 「## 확인한 내용」처럼 제목으로 절을 찾아, 같은 단계 이상의 다음 제목 전까지 잘라 온다(하위 ### 는 포함)
export function getSection(file, headingStartsWith) {
  const doc = readDoc(file);
  if (!doc) return null;
  const lines = doc.raw.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,6}\s/.test(l) && l.replace(/^#+\s*/, '').startsWith(headingStartsWith));
  if (start < 0) return null;
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.findIndex((l, i) => i > start && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= level);
  if (end < 0) end = lines.length;
  const heading = lines[start].replace(/^#+\s*/, '').trim();
  const text = lines.slice(start + 1, end).join('\n').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim().slice(0, 2000);
  return { title: doc.title, heading, text };
}

// 「##### 제4조 (제목)」 아래 본문을 다음 조문 전까지 잘라 온다
export function getArticle(file, article) {
  const doc = readDoc(file);
  if (!doc) return null;
  const lines = doc.raw.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^#{2,6}\\s*${article}\\s*(\\(|$)`).test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{2,6}\s/.test(l));
  if (end < 0) end = lines.length;
  const heading = lines[start].replace(/^#+\s*/, '').trim();
  // 마크다운 굵게(**)·이스케이프(\.) 기호를 걷어 낸 본문
  const text = lines.slice(start + 1, end).join('\n').replace(/\*\*/g, '').replace(/\\(?=[.)\]])/g, '').trim().slice(0, 1200);
  return { title: doc.title, article, heading, text };
}
