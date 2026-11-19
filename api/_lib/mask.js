// 개인정보 가림 — AI 에 보내기 전에 이름·연락처·주소 등을 *** 로 바꾼다 [팀 설계안]
// 정규식(정해진 글자 패턴 찾기)만 쓰므로 모든 개인정보를 잡지는 못한다.

const RULES = [
  { type: '주민등록번호', re: /\d{6}\s?-\s?[1-4]\d{6}/g },
  { type: '휴대전화', re: /01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/g },
  { type: '전화번호', re: /0\d{1,2}[\s.-]\d{3,4}[\s.-]\d{4}/g },
  { type: '이메일', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  // 「○○로 12」「○○길 3-4」「○○동 123번지」 꼴
  { type: '주소', re: /[가-힣0-9]+(?:로|길)\s?\d+(?:-\d+)?(?:번길\s?\d+)?|[가-힣]+동\s?\d+(?:-\d+)?\s?번지/g },
  { type: '계좌번호', re: /\d{3,6}-\d{2,6}-\d{2,8}/g },
  // 「이름은 홍길동」「성명: 홍길동」「저는 홍길동입니다」
  { type: '이름', re: /((?:이름|성명)\s*(?:은|는|:)?\s*)[가-힣]{2,4}/g, keep: 1 },
  { type: '이름', re: /(저는\s)[가-힣]{2,4}(?=(?:입니다|이에요|예요|라고))/g, keep: 1 },
];

export function maskPII(text = '') {
  let masked = String(text);
  const found = [];
  for (const rule of RULES) {
    masked = masked.replace(rule.re, (...m) => {
      found.push(rule.type);
      return rule.keep ? `${m[rule.keep]}***` : '***';
    });
  }
  return { masked, found: [...new Set(found)] };
}
