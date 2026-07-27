const path = require('path')
const fs = require('fs')
const rcedit = require('rcedit')

const root = path.resolve(__dirname, '..')
const unpacked = path.join(root, 'release', 'win-unpacked')
const exe = path.join(unpacked, '웅천고 업무도우미.exe')
const icon = path.join(root, 'resources', 'icon.ico')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = packageJson.version
const updateConfigPath = path.join(unpacked, 'resources', 'app-update.yml')

async function main() {
  if (!fs.existsSync(exe)) throw new Error(`실행 파일을 찾을 수 없습니다: ${exe}`)
  fs.mkdirSync(path.dirname(updateConfigPath), { recursive: true })
  fs.writeFileSync(
    updateConfigPath,
    [
      'provider: github',
      'owner: mathtjungsw',
      'repo: school-webtool-share',
      'updaterCacheDirName: ungcheon-school-helper-updater',
      '',
    ].join('\n'),
    'utf8',
  )
  await rcedit(exe, {
    icon,
    'file-version': version,
    'product-version': version,
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
  console.log(`자동업데이트 설정 생성 완료: ${updateConfigPath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
