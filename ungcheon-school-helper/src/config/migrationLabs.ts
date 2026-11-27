export const MIGRATION_LABS = {
  career_tests: { title: '진로검사', original: 'https://career-next-gamma.vercel.app/' },
  yaja_attendance: { title: '야자 도장판', original: 'https://yaja-next.vercel.app/' },
  school_seoga: { title: '웅천 서가', original: 'https://seoga-next.vercel.app/' },
} as const

export type MigrationLabId = keyof typeof MIGRATION_LABS
export const MIGRATION_LAB_IDS = Object.keys(MIGRATION_LABS) as MigrationLabId[]
export function isMigrationLab(id: string): id is MigrationLabId {
  return Object.hasOwn(MIGRATION_LABS, id)
}
