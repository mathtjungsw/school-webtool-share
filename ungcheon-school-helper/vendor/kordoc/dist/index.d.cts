/** kordoc 공통 타입 정의 */
interface CellContext {
    text: string;
    colSpan: number;
    rowSpan: number;
    /** HWP5 셀 열 주소 (0-based) — 병합 테이블 배치용 */
    colAddr?: number;
    /** HWP5 셀 행 주소 (0-based) — 병합 테이블 배치용 */
    rowAddr?: number;
}
/** 블록 타입 — v2.0에서 heading, list, image, separator 추가 */
type IRBlockType = "paragraph" | "table" | "heading" | "list" | "image" | "separator";
interface IRBlock {
    type: IRBlockType;
    text?: string;
    table?: IRTable;
    /** 헤딩 레벨 (1-6), type="heading"일 때 사용 */
    level?: number;
    /** 원본 페이지 번호 (1-based) */
    pageNumber?: number;
    /** 바운딩 박스 — PDF에서만 제공 */
    bbox?: BoundingBox;
    /** 텍스트 스타일 정보 (선택) */
    style?: InlineStyle;
    /** 리스트 타입, type="list"일 때 사용 */
    listType?: "ordered" | "unordered";
    /** 중첩 리스트 아이템 */
    children?: IRBlock[];
    /** 하이퍼링크 URL */
    href?: string;
    /** 각주/미주 텍스트 (인라인 삽입용) */
    footnoteText?: string;
}
/** 바운딩 박스 — PDF 포인트 단위 (72pt = 1인치) */
interface BoundingBox {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
/** 인라인 텍스트 스타일 */
interface InlineStyle {
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    fontName?: string;
}
interface IRTable {
    rows: number;
    cols: number;
    cells: IRCell[][];
    hasHeader: boolean;
}
interface IRCell {
    text: string;
    colSpan: number;
    rowSpan: number;
}
/** 문서 메타데이터 — 각 포맷에서 추출 가능한 필드만 채워짐 */
interface DocumentMetadata {
    /** 문서 제목 */
    title?: string;
    /** 작성자 */
    author?: string;
    /** 작성 프로그램 (예: "한글 2020", "Adobe Acrobat") */
    creator?: string;
    /** 생성일시 (ISO 8601) */
    createdAt?: string;
    /** 수정일시 (ISO 8601) */
    modifiedAt?: string;
    /** 페이지/섹션 수 */
    pageCount?: number;
    /** 문서 포맷 버전 (예: HWP "5.1.0.1") */
    version?: string;
    /** 설명 */
    description?: string;
    /** 키워드 */
    keywords?: string[];
}
/** 파싱 옵션 — parse() 함수에 전달 */
interface ParseOptions {
    /**
     * 파싱할 페이지/섹션 범위 (1-based).
     * - 배열: [1, 2, 3]
     * - 문자열: "1-3", "1,3,5-7"
     *
     * PDF: 정확한 페이지 단위. HWP/HWPX: 섹션 단위 근사치.
     */
    pages?: number[] | string;
    /** 이미지 기반 PDF용 OCR 프로바이더 (선택) */
    ocr?: OcrProvider;
}
/** 파싱 중 스킵/실패한 요소 보고 */
interface ParseWarning {
    /** 관련 페이지 번호 (알 수 있는 경우) */
    page?: number;
    /** 경고 메시지 */
    message: string;
    /** 구조화된 경고 코드 */
    code: WarningCode;
}
type WarningCode = "SKIPPED_IMAGE" | "SKIPPED_OLE" | "TRUNCATED_TABLE" | "OCR_FALLBACK" | "UNSUPPORTED_ELEMENT" | "BROKEN_ZIP_RECOVERY" | "HIDDEN_TEXT_FILTERED";
/** 문서 구조 (헤딩 트리) */
interface OutlineItem {
    level: number;
    text: string;
    pageNumber?: number;
}
/** 구조화된 에러 코드 — 프로그래밍적 에러 핸들링용 */
type ErrorCode = "EMPTY_INPUT" | "UNSUPPORTED_FORMAT" | "ENCRYPTED" | "DRM_PROTECTED" | "CORRUPTED" | "DECOMPRESSION_BOMB" | "ZIP_BOMB" | "IMAGE_BASED_PDF" | "NO_SECTIONS" | "PARSE_ERROR";
type FileType = "hwpx" | "hwp" | "pdf" | "unknown";
interface ParseResultBase {
    fileType: FileType;
    /** PDF 페이지 수 */
    pageCount?: number;
    /** 이미지 기반 PDF 여부 (텍스트 추출 불가) */
    isImageBased?: boolean;
}
interface ParseSuccess extends ParseResultBase {
    success: true;
    /** 추출된 마크다운 텍스트 */
    markdown: string;
    /** 중간 표현 블록 (구조화된 데이터 접근용) */
    blocks: IRBlock[];
    /** 문서 메타데이터 */
    metadata?: DocumentMetadata;
    /** 문서 구조 (헤딩 트리) — v2.0 */
    outline?: OutlineItem[];
    /** 파싱 중 발생한 경고 — v2.0 */
    warnings?: ParseWarning[];
}
interface ParseFailure extends ParseResultBase {
    success: false;
    /** 오류 메시지 */
    error: string;
    /** 구조화된 에러 코드 */
    code?: ErrorCode;
}
type ParseResult = ParseSuccess | ParseFailure;
type DiffChangeType = "added" | "removed" | "modified" | "unchanged";
interface BlockDiff {
    type: DiffChangeType;
    /** 원본 블록 (added이면 undefined) */
    before?: IRBlock;
    /** 변경 후 블록 (removed이면 undefined) */
    after?: IRBlock;
    /** modified 테이블의 셀 단위 diff */
    cellDiffs?: CellDiff[][];
    /** 유사도 (0-1) */
    similarity?: number;
}
interface CellDiff {
    type: DiffChangeType;
    before?: string;
    after?: string;
}
interface DiffResult {
    stats: {
        added: number;
        removed: number;
        modified: number;
        unchanged: number;
    };
    diffs: BlockDiff[];
}
interface FormField {
    label: string;
    value: string;
    /** 0-based 소스 행 */
    row: number;
    /** 0-based 소스 열 */
    col: number;
}
interface FormResult {
    fields: FormField[];
    /** 양식 확신도 (0-1) */
    confidence: number;
}
/** 사용자 제공 OCR 함수 — 페이지 이미지를 받아 텍스트 반환 */
type OcrProvider = (pageImage: Uint8Array, pageNumber: number, mimeType: "image/png") => Promise<string>;
interface WatchOptions {
    dir: string;
    outDir?: string;
    webhook?: string;
    format?: "markdown" | "json";
    pages?: string;
    silent?: boolean;
}

/** 문서 비교 엔진 — IR 레벨 블록 비교로 신구대조표 생성 */

/**
 * 두 문서를 비교하여 블록 단위 diff 생성.
 * 크로스 포맷 지원 — HWP vs HWPX 비교 가능 (IR 레벨).
 */
declare function compare(bufferA: ArrayBuffer, bufferB: ArrayBuffer, options?: ParseOptions): Promise<DiffResult>;
/** IRBlock[] 간 diff — LCS 기반 정렬 */
declare function diffBlocks(blocksA: IRBlock[], blocksB: IRBlock[]): DiffResult;

/** 양식(서식) 필드 인식 — 테이블 기반 label-value 패턴 매칭 */

/**
 * IRBlock[]에서 양식 필드를 인식하여 추출.
 * 테이블의 label-value 패턴을 감지.
 */
declare function extractFormFields(blocks: IRBlock[]): FormResult;

/**
 * Markdown → HWPX 역변환 (MVP)
 *
 * 지원: 단락, 헤딩, 테이블 (텍스트+구조만, 스타일 없음)
 * jszip으로 HWPX ZIP 패키징.
 */
/**
 * 마크다운 텍스트를 HWPX (ArrayBuffer)로 변환.
 *
 * @example
 * ```ts
 * import { markdownToHwpx } from "kordoc"
 * const hwpxBuffer = await markdownToHwpx("# 제목\n\n본문 텍스트")
 * writeFileSync("output.hwpx", Buffer.from(hwpxBuffer))
 * ```
 */
declare function markdownToHwpx(markdown: string): Promise<ArrayBuffer>;

/** 매직 바이트 기반 파일 포맷 감지 */

/** HWPX (ZIP 기반 한컴 문서): PK\x03\x04 */
declare function isHwpxFile(buffer: ArrayBuffer): boolean;
/** HWP 5.x (OLE2 바이너리 한컴 문서): \xD0\xCF\x11\xE0 */
declare function isOldHwpFile(buffer: ArrayBuffer): boolean;
/** PDF 문서: %PDF */
declare function isPdfFile(buffer: ArrayBuffer): boolean;
/** 버퍼로부터 파일 포맷 감지 */
declare function detectFormat(buffer: ArrayBuffer): FileType;

/** 2-pass colSpan/rowSpan 테이블 빌더 및 Markdown 변환 */

declare function blocksToMarkdown(blocks: IRBlock[]): string;

/** kordoc 공용 유틸리티 */
declare const VERSION: string;

/**
 * kordoc — 모두 파싱해버리겠다
 *
 * HWP, HWPX, PDF → Markdown 변환 통합 라이브러리
 */

/**
 * 파일 버퍼를 자동 감지하여 Markdown으로 변환
 *
 * @example
 * ```ts
 * import { parse } from "kordoc"
 * const result = await parse(buffer)
 * if (result.success) {
 *   console.log(result.markdown)     // 마크다운 텍스트
 *   console.log(result.blocks)       // IRBlock[] 구조화 데이터
 *   console.log(result.metadata)     // 문서 메타데이터
 * }
 * ```
 */
declare function parse(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult>;
/** HWPX 파일을 Markdown으로 변환 */
declare function parseHwpx(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult>;
/** HWP 5.x 바이너리 파일을 Markdown으로 변환 */
declare function parseHwp(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult>;
/** PDF 파일에서 텍스트를 추출하여 Markdown으로 변환 */
declare function parsePdf(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult>;

export { type BlockDiff, type BoundingBox, type CellContext, type CellDiff, type DiffChangeType, type DiffResult, type DocumentMetadata, type ErrorCode, type FileType, type FormField, type FormResult, type IRBlock, type IRBlockType, type IRCell, type IRTable, type InlineStyle, type OcrProvider, type OutlineItem, type ParseFailure, type ParseOptions, type ParseResult, type ParseSuccess, type ParseWarning, VERSION, type WarningCode, type WatchOptions, blocksToMarkdown, compare, detectFormat, diffBlocks, extractFormFields, isHwpxFile, isOldHwpFile, isPdfFile, markdownToHwpx, parse, parseHwp, parseHwpx, parsePdf };
