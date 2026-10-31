// Build a small, uncompressed VSIX using only Node's standard library.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const manifest = require('./package.json');
const output = process.argv[2] || path.join(os.tmpdir(), `${manifest.name}-${manifest.version}.vsix`);
const files = new Map([
  ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'],
  ['extension.vsixmanifest', `<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}"/><DisplayName>${manifest.displayName}</DisplayName><Description xml:space="preserve">${manifest.description}</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`],
]);
for (const name of ['package.json', 'extension.cjs', 'README.md']) {
  files.set(`extension/${name}`, fs.readFileSync(path.join(__dirname, name)));
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunks = [];
const directory = [];
let offset = 0;
for (const [filename, content] of files) {
  const name = Buffer.from(filename);
  const data = Buffer.from(content);
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x21, 12); // DOS date: 1980-01-01.
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  chunks.push(header, name, data);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50);
  entry.writeUInt16LE(20, 4);
  header.copy(entry, 6, 4, 30);
  entry.writeUInt32LE(offset, 42);
  directory.push(entry, name);
  offset += header.length + name.length + data.length;
}
const central = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.size, 8);
end.writeUInt16LE(files.size, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
fs.writeFileSync(output, Buffer.concat([...chunks, central, end]));
console.log(output);
