const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico')

const root = path.resolve(__dirname, '..')
const sourceLogoPath = path.join(root, 'src', 'assets', 'ungcheon-logo.png')
const pngPath = path.join(root, 'resources', 'icon.png')
const icoPath = path.join(root, 'resources', 'icon.ico')

async function main() {
  const sourceLogo = fs.readFileSync(sourceLogoPath)
  const png512 = await sharp(sourceLogo)
    .resize(460, 460, { fit: 'contain', background: '#ffffff' })
    .extend({ top: 26, bottom: 26, left: 26, right: 26, background: '#ffffff' })
    .png()
    .toBuffer()
  fs.writeFileSync(pngPath, png512)

  const icoImages = await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map(size =>
      sharp(png512).resize(size, size).png().toBuffer(),
    ),
  )
  const ico = await pngToIco(icoImages)
  fs.writeFileSync(icoPath, ico)

  console.log(`School logo PNG created: ${pngPath}`)
  console.log(`School logo ICO created: ${icoPath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
