import { escapePrintHtml, printDocument } from '../services/printing'

/**
 * 기존 화면들이 사용하는 호환 진입점입니다.
 * 실제 인쇄는 공통 PrintEngine이 안전한 격리 iframe과 A4 문서를 준비합니다.
 */
export function printHtml(bodyHtml: string, extraCss = ''): void {
  printDocument({
    title: '웅천고 업무도우미 인쇄 문서',
    bodyHtml,
    styles: extraCss,
    pageMode: 'multi-page',
  })
}

/** HTML 특수문자 이스케이프 — 공통 출력엔진과 동일한 규칙을 사용합니다. */
export function escapeHtml(value: string): string {
  return escapePrintHtml(value)
}
