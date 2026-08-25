const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'localFortune.ts'), 'utf8')
const groups = [...source.matchAll(/const (OPENINGS|MOMENTS|ENDINGS) = \[([\s\S]*?)\]/g)]
if (groups.length !== 3) throw new Error('운세 문장 조각 3종을 찾지 못했습니다.')
const values = groups.map(match => [...match[2].matchAll(/'([^']+)'/g)].map(item => item[1]))
const phrases = values[0].flatMap(a => values[1].flatMap(b => values[2].map(c => `${a} ${b} ${c}`)))
const forbidden = ['불행', '실패', '사고', '질병', '불안', '위험', '손해', '갈등', '절망', '나쁜']
if (phrases.length < 1000 || new Set(phrases).size < 1000) throw new Error(`운세 문장이 1000개 미만입니다: ${phrases.length}`)
const unsafe = phrases.find(phrase => forbidden.some(word => phrase.includes(word)))
if (unsafe) throw new Error(`부정적 운세 문장을 발견했습니다: ${unsafe}`)
console.log(`local fortune safety: ${phrases.length} positive/neutral phrases`)
