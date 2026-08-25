export {}

declare global {
  interface Window {
    electron: {
      minimize: () => void
      maximize: () => void
      close: () => void
      configGet: (key: string) => Promise<unknown>
      configSet: (key: string, value: unknown) => Promise<void>
      configSetMany: (patch: Record<string, unknown>) => Promise<void>
      configGetAll: () => Promise<Record<string, unknown>>
      configDelete: (key: string) => Promise<void>
      apiKeySet: (name: string, value: string) => Promise<void>
      apiKeyGet: (name: string) => Promise<string>
      apiKeyDelete: (name: string) => Promise<void>
      apiKeyGetAll: () => Promise<Record<string, string>>
      subjectRemarksSet: (value: string) => Promise<void>
      subjectRemarksGet: () => Promise<string>
      subjectRemarksClear: () => Promise<void>
      openExternal: (url: string) => Promise<void>
      openPath: (filePath: string) => Promise<string>
      getVersion: () => Promise<string>
      onUpdateAvailable: (cb: () => void) => () => void
      onUpdateDownloaded: (cb: () => void) => () => void
      onUpdateNone: (cb: () => void) => () => void
      onUpdateError: (cb: (msg: string) => void) => () => void
      installUpdate: () => void
      checkForUpdates: () => Promise<boolean>
      notifierStart: (cfg: unknown) => void
      notifierStop: () => void
      notifierStatus: () => Promise<boolean>
      onNotifierResult: (cb: (result: unknown) => void) => () => void
      openFileDialog: (filters?: Electron.FileFilter[]) => Promise<string | null>
      openFilesDialog: (filters?: Electron.FileFilter[]) => Promise<string[]>
      saveFileDialog: (defaultName: string, buffer: number[]) => Promise<boolean>
      saveFilesToDir: (files: { name: string; bytes: number[] }[]) => Promise<number>
      buildTimetablePlanHwp: (draft: import('./services/timetablePlan').TimetablePlanDraft) => Promise<number[]>
      buildVolunteerHwp: (draft: import('./services/volunteerWork').VolunteerCertificateDraft) => Promise<number[]>
      buildClassVolunteerHwpx: (draft: import('./services/volunteerWork').ClassVolunteerCertificateDraft) => Promise<number[]>
      buildClassVolunteerPdf: (draft: import('./services/volunteerWork').ClassVolunteerCertificateDraft) => Promise<number[]>
      buildCoordinatorVolunteerPdf: (draft: import('./services/volunteerWork').CoordinatorVolunteerCertificateDraft) => Promise<number[]>
      printClassVolunteer: (draft: import('./services/volunteerWork').ClassVolunteerCertificateDraft) => Promise<boolean>
      storeGeneratedVolunteerHwp: (name: string, bytes: number[]) => Promise<import('./services/volunteerWork').StoredVolunteerHwp>
      storeGeneratedVolunteerForms: (title: string, forms: import('./services/volunteerWork').ParsedVolunteerForm[]) => Promise<import('./services/volunteerWork').StoredVolunteerHwp>
      importVolunteerHwp: (filePath: string, allowDuplicate?: boolean) => Promise<import('./services/volunteerWork').StoredVolunteerHwp>
      listVolunteerHwp: () => Promise<import('./services/volunteerWork').StoredVolunteerHwp[]>
      parseVolunteerHwp: (id: string) => Promise<import('./services/volunteerWork').ParsedVolunteerForm[]>
      updateVolunteerForms: (id: string, forms: import('./services/volunteerWork').ParsedVolunteerForm[], title?: string) => Promise<import('./services/volunteerWork').StoredVolunteerHwp>
      openVolunteerHwp: (id: string) => Promise<string>
      deleteVolunteerHwp: (id: string) => Promise<import('./services/volunteerWork').StoredVolunteerHwp>
      parseDocument: (filePath: string) => Promise<any>
      checkJava: () => Promise<boolean>
      checkOcrTools: () => Promise<{ hybrid: boolean; tesseract: boolean }>
      extractDocument: (
        filePath: string,
        format: 'text' | 'markdown' | 'json',
      ) => Promise<any>
      extractPdfLayout: (filePath: string) => Promise<unknown>
      readFile: (filePath: string) => Promise<number[]>
      readFileBase64: (filePath: string) => Promise<string>
      portalSetPassword: (password: string) => Promise<void>
      portalGetPassword: () => Promise<string>
      portalClearPassword: () => Promise<void>
      fetchWeather: (url: string) => Promise<unknown>
      fetchNotices: () => Promise<unknown>
      schoolHubRequest: (request: Record<string, unknown>) => Promise<unknown>
      schoolHubDiagnose: () => Promise<{
        checkedAt: string
        get: { ok: boolean; status: number; elapsedMs: number; version: number | null; error: string }
        post: { ok: boolean; status: number; elapsedMs: number; version: number | null; error: string }
        roster: { ok: boolean; status: number; elapsedMs: number; version: number | null; error: string }
        tasks: { ok: boolean; status: number; elapsedMs: number; version: number | null; error: string }
      }>
      schoolHubCacheGetAll: () => Promise<Array<{
        cacheKey: string
        resource: string
        data: unknown
        revision: string
        signature: string
        loadedAt: number
      }>>
      schoolHubCacheSet: (entry: {
        cacheKey: string
        resource: string
        data: unknown
        revision: string
        signature: string
        loadedAt: number
      }) => Promise<boolean>
      schoolHubCacheDeleteResource: (resource: string) => Promise<void>
      schoolHubCacheClear: () => Promise<void>
      schoolHubCacheStatus: () => Promise<{
        count: number
        newestAt: number | null
        encrypted: boolean
        resources: string[]
      }>
      getAutoLaunch: () => Promise<boolean>
      setAutoLaunch: (enable: boolean) => Promise<void>
      showWidget: () => Promise<boolean>
      hideWidget: () => Promise<boolean>
      widgetGetSettings: () => Promise<import('./components/widget/WidgetApp').WidgetSettings>
      widgetUpdateSettings: (patch: Partial<import('./components/widget/WidgetApp').WidgetSettings>) => Promise<import('./components/widget/WidgetApp').WidgetSettings>
      widgetFitHeight: (height: number) => Promise<boolean>
      widgetOpenMain: (page?: string) => Promise<boolean>
      onWidgetSettingsChanged: (cb: (settings: import('./components/widget/WidgetApp').WidgetSettings) => void) => () => void
      notifyAuthChanged: () => void
      onAuthChanged: (cb: () => void) => () => void
      onNavigateRequest: (cb: (page: string) => void) => () => void
      getResourcesPath: () => Promise<string>
      weeklyPlanGetMonth: (
        year: number,
        month: number,
        force?: boolean,
      ) => Promise<import('./types').WeeklyPlanResult>
      dutyScheduleGetMonth: (
        year: number,
        month: number,
        teacherName: string,
        force?: boolean,
      ) => Promise<import('./types').DutyScheduleResult>
      creativeScheduleGetMonth: (
        year: number,
        month: number,
        force?: boolean,
      ) => Promise<import('./types').CreativeScheduleResult>
      curriculumGetPdfUrl: (id: 'all' | 'grade1' | 'grade2' | 'grade3') => Promise<string>
      curriculumOpenPdf: (id: 'all' | 'grade1' | 'grade2' | 'grade3') => Promise<string>
      curriculumSavePdf: (
        id: 'all' | 'grade1' | 'grade2' | 'grade3',
        defaultName: string,
      ) => Promise<boolean>
      schoolInfoSearchSchools: (
        query: string,
        force?: boolean,
      ) => Promise<import('./services/schoolInfo').SchoolInfoSearchResponse>
      schoolInfoSearchSchoolsByRegion: (
        sido: string,
        sgg: string,
        force?: boolean,
      ) => Promise<import('./services/schoolInfo').SchoolInfoSearchResponse>
      schoolInfoGetEvaluationPlan: (
        request: import('./services/schoolInfo').SchoolInfoEvaluationRequest,
      ) => Promise<import('./services/schoolInfo').SchoolInfoEvaluationResponse>
      schoolInfoClearCache: () => Promise<boolean>
    }
  }
}
