export interface OfficeInfo {
  name: string
  code: string  // eduptl subdomain prefix
}

export const EDUCATION_OFFICES: Record<string, OfficeInfo> = {
  서울: { name: '서울특별시교육청', code: 'sen' },
  경기: { name: '경기도교육청', code: 'goe' },
  경남: { name: '경상남도교육청', code: 'gne' },
  부산: { name: '부산광역시교육청', code: 'pen' },
  대구: { name: '대구광역시교육청', code: 'dge' },
  대전: { name: '대전광역시교육청', code: 'dje' },
  경북: { name: '경상북도교육청', code: 'gbe' },
  세종: { name: '세종특별자치시교육청', code: 'sje' },
  울산: { name: '울산광역시교육청', code: 'use' },
  인천: { name: '인천광역시교육청', code: 'ice' },
  광주: { name: '광주광역시교육청', code: 'gen' },
  전남: { name: '전라남도교육청', code: 'jne' },
  전북: { name: '전북특별자치도교육청', code: 'jbe' },
  충남: { name: '충청남도교육청', code: 'cne' },
  충북: { name: '충청북도교육청', code: 'cbe' },
  강원: { name: '강원특별자치도교육청', code: 'kwe' },
  제주: { name: '제주특별자치도교육청', code: 'jje' },
}

export function getPortalUrl(officeKey: string): string {
  const code = EDUCATION_OFFICES[officeKey]?.code ?? 'jbe'
  return `https://${code}.eduptl.kr`
}

export function getNeisUrl(officeKey: string): string {
  const code = EDUCATION_OFFICES[officeKey]?.code ?? 'jbe'
  return `https://${code}.neis.go.kr/jsp/main.jsp`
}

export function getEdufineUrl(officeKey: string): string {
  const code = EDUCATION_OFFICES[officeKey]?.code ?? 'jbe'
  return `https://klef.${code}.go.kr/keris_ui/main.do`
}
