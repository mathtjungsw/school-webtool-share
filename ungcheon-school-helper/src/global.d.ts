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
      getAutoLaunch: () => Promise<boolean>
      setAutoLaunch: (enable: boolean) => Promise<void>
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
    }
  }
}
