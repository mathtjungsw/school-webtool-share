import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../src/styles.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ungcheon-mobile-schedule.jsw890122.chatgpt.site'),
  title: '웅천고 모바일 일정',
  description: '교직원을 위한 읽기 전용 모바일 일정 및 시간표',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  openGraph: {
    title: '웅천고 모바일 일정',
    description: '오늘 시간표 · 일정 · 급식을 빠르게 확인하세요.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '웅천고 모바일 일정',
    description: '오늘 시간표 · 일정 · 급식을 빠르게 확인하세요.',
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#173f35' },
    { media: '(prefers-color-scheme: dark)', color: '#101815' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>
}
