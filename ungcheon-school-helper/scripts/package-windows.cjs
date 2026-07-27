const path = require('path')
const fs = require('fs')
const rcedit = require('rcedit')

const root = path.resolve(__dirname, '..')
const unpacked = path.join(root, 'release', 'win-unpacked')
const exe = path.join(unpacked, '웅천고 업무도우미.exe')
const icon = path.join(root, 'resources', 'icon.ico')

async function main() {
  if (!fs.existsSync(exe)) throw new Error(`실행 파일을 찾을 수 없습니다: ${exe}`)
  await rcedit(exe, {
    icon,
    'file-version': '1.0.0',
    'product-version': '1.0.0',
    'version-string': {
      CompanyName: '웅천고등학교',
      FileDescription: '웅천고 업무도우미',
      ProductName: '웅천고 업무도우미',
      InternalName: 'UngcheonSchoolHelper',
      OriginalFilename: '웅천고 업무도우미.exe',
      LegalCopyright: `Copyright © ${new Date().getFullYear()} 웅천고등학교`,
    },
  })
  console.log(`브랜딩 적용 완료: ${exe}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
