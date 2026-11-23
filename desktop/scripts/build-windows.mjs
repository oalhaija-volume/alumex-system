import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.dirname(root);
const configuration = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const tools = JSON.parse(readFileSync(path.join(root, 'scripts', 'toolchain.json'), 'utf8'));
const cache = path.join(root, '.cache');
const downloads = path.join(cache, 'downloads');
const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const working = path.join(cache, 'builds', stamp);
const appDirectory = path.join(working, 'application');
const output = path.join(root, 'dist', `AlumexFlow-Setup-${configuration.version}-x64-${stamp}.exe`);
for (const directory of [cache, downloads, working, path.dirname(output)]) mkdirSync(directory, { recursive: true });
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const run = (binary, args, cwd = root) => execFileSync(binary, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const report = { version: configuration.version, electron: tools.electron.version, architecture: 'x64', platform: 'win32', origin: 'https://www.alumexflow.com', builtAt: new Date().toISOString(), environmentChanges: 0, globalInstalls: 0 };

async function download(tool) {
  const destination = path.join(downloads, tool.filename);
  if (!existsSync(destination)) {
    console.log(`Downloading ${tool.filename}`);
    const response = await fetch(tool.url, { signal: AbortSignal.timeout(300000) });
    assert.equal(response.status, 200, `Download failed for ${tool.filename}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (tool.sha256) assert.equal(digest(bytes), tool.sha256, `${tool.filename} checksum differs`);
    if (tool.sha512) assert.equal(digest(bytes, 'sha512', 'base64'), tool.sha512, `${tool.filename} integrity differs`);
    writeFileSync(destination, bytes, { flag: 'wx' });
  }
  const bytes = readFileSync(destination);
  if (tool.sha256) assert.equal(digest(bytes), tool.sha256);
  if (tool.sha512) assert.equal(digest(bytes, 'sha512', 'base64'), tool.sha512);
  return destination;
}

function utf32(value) {
  const bytes = Buffer.alloc(value.length * 4);
  [...value].forEach((character, index) => bytes.writeUInt32LE(character.charCodeAt(0), index * 4));
  return bytes;
}

function makeLocalCompiler(toolRoot) {
  if (process.platform === 'win32') return path.join(toolRoot, 'makensis.exe');
  assert.ok(['darwin', 'linux'].includes(process.platform), 'Build host must be Windows, macOS or Linux.');
  const platformDirectory = process.platform === 'darwin' ? 'mac' : 'linux';
  const original = path.join(toolRoot, platformDirectory, 'makensis');
  const local = path.join(toolRoot, platformDirectory, 'makensis-local');
  if (!existsSync(local)) {
    const bytes = readFileSync(original);
    const needle = utf32('/usr/local/share/nsis');
    const offset = bytes.indexOf(needle);
    assert.ok(offset >= 0 && bytes.indexOf(needle, offset + needle.length) < 0, 'Unexpected compiler resource-directory layout.');
    // The upstream POSIX compiler embeds this build-time prefix. Relocate its
    // copied default to cwd instead of changing NSISDIR or any environment.
    bytes.fill(0, offset, offset + needle.length);
    bytes.writeUInt32LE(46, offset);
    writeFileSync(local, bytes, { flag: 'wx' });
    chmodSync(local, 0o755);
  }
  return local;
}

function collectFiles(directory, relative = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Symbolic links are not included in the application.');
    return entry.isDirectory() ? collectFiles(path.join(directory, entry.name), name) : [name];
  });
}

function nsisPath(value) {
  assert.ok(!/[\r\n"$]/.test(value), 'Unexpected NSIS build path.');
  return value.replaceAll(path.sep, '\\');
}

function makeIcon(png) {
  const bytes = readFileSync(png);
  // Windows Vista+ supports a PNG image inside an ICO. Reuse the existing
  // 192px brand image unchanged; no image tool or external assets are needed.
  assert.equal(bytes.readUInt32BE(16), 192); assert.equal(bytes.readUInt32BE(20), 192);
  const icon = Buffer.alloc(22 + bytes.length);
  icon.writeUInt16LE(1, 2); icon.writeUInt16LE(1, 4);
  icon[6] = 192; icon[7] = 192;
  icon.writeUInt16LE(1, 10); icon.writeUInt16LE(32, 12);
  icon.writeUInt32LE(bytes.length, 14); icon.writeUInt32LE(22, 18); bytes.copy(icon, 22);
  return icon;
}

try {
  assert.match(configuration.version, /^\d+\.\d+\.\d+$/);
  const [electronZip, sevenZipArchive, nsisArchive] = await Promise.all([download(tools.electron), download(tools.sevenZip), download(tools.nsis)]);
  const sevenZipRoot = path.join(cache, 'tools', '7zip-bin');
  if (!existsSync(path.join(sevenZipRoot, 'package', 'package.json'))) {
    mkdirSync(sevenZipRoot, { recursive: true });
    run('tar', ['-xzf', sevenZipArchive, '-C', sevenZipRoot]);
  }
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const sevenZip = path.join(sevenZipRoot, 'package', platform, process.arch, process.platform === 'win32' ? '7za.exe' : '7za');
  assert.ok(existsSync(sevenZip), 'A supported local 7zip executable is required.');
  if (process.platform !== 'win32') chmodSync(sevenZip, 0o755);
  const nsisRoot = path.join(cache, 'tools', `nsis-${tools.nsis.version}`);
  if (!existsSync(path.join(nsisRoot, 'Stubs'))) {
    mkdirSync(nsisRoot, { recursive: true });
    run(sevenZip, ['x', nsisArchive, `-o${nsisRoot}`, '-y']);
  }
  const compiler = makeLocalCompiler(nsisRoot);
  report.nsisCompiler = run(compiler, ['-NOCONFIG', '-VERSION'], nsisRoot).trim();
  console.log(`Packaging Electron ${tools.electron.version} for Windows x64`);
  run(sevenZip, ['x', electronZip, `-o${appDirectory}`, '-y']);
  renameSync(path.join(appDirectory, 'electron.exe'), path.join(appDirectory, 'AlumexFlow.exe'));
  const runtimeRoot = path.join(appDirectory, 'resources', 'app');
  mkdirSync(path.join(runtimeRoot, 'src'), { recursive: true });
  mkdirSync(path.join(runtimeRoot, 'assets'), { recursive: true });
  for (const name of ['main.cjs', 'security.cjs', 'connection.html', 'connection.cjs']) copyFileSync(path.join(root, 'src', name), path.join(runtimeRoot, 'src', name));
  writeFileSync(path.join(runtimeRoot, 'package.json'), JSON.stringify({ name: configuration.name, productName: configuration.productName, version: configuration.version, main: 'src/main.cjs' }, null, 2) + '\n', { flag: 'wx' });
  copyFileSync(path.join(repository, 'public', 'icons', 'alumex-symbol-512.png'), path.join(runtimeRoot, 'assets', 'alumex.png'));
  const icon = path.join(runtimeRoot, 'assets', 'alumex.ico');
  writeFileSync(icon, makeIcon(path.join(repository, 'public', 'icons', 'alumex-symbol-192.png')), { flag: 'wx' });
  const runtimeFiles = collectFiles(appDirectory).sort();
  const forbidden = runtimeFiles.filter(value => /(^|[\\/])(?:\.env[^\\/]*|node_modules|artifacts|\.git)([\\/]|$)/.test(value));
  assert.deepEqual(forbidden, [], 'Only Electron runtime and explicit public wrapper files may be bundled.');
  const runtimeExecutable = readFileSync(path.join(appDirectory, 'AlumexFlow.exe'));
  assert.equal(runtimeExecutable.subarray(0, 2).toString(), 'MZ');
  assert.equal(runtimeExecutable.readUInt16LE(runtimeExecutable.readUInt32LE(0x3c) + 4), 0x8664, 'Electron payload must be x64.');
  const installedDirectories = new Set(runtimeFiles.flatMap(file => {
    const result = []; let directory = path.dirname(file);
    while (directory !== '.') { result.push(directory); directory = path.dirname(directory); }
    return result;
  }));
  const uninstall = [
    ...runtimeFiles.map(file => `Delete "$INSTDIR\\${nsisPath(file)}"`),
    ...[...installedDirectories].sort((a, b) => b.length - a.length).map(directory => `RMDir "$INSTDIR\\${nsisPath(directory)}"`),
  ].join('\n');
  const uninstallPath = path.join(working, 'uninstall-files.nsh');
  writeFileSync(uninstallPath, uninstall + '\n', { flag: 'wx' });
  console.log('Compiling the Windows installer');
  const log = run(compiler, ['-NOCONFIG', '-NOCD', '-WX', '-V3', `-DAPP_VERSION=${configuration.version}`, `-DAPP_DIR=${appDirectory}`, `-DAPP_ICON=${icon}`, `-DOUTPUT_FILE=${output}`, `-DUNINSTALL_FILES=${uninstallPath}`, path.join(root, 'installer.nsi')], nsisRoot);
  writeFileSync(path.join(working, 'nsis-build.log'), log, { flag: 'wx' });
  const installer = readFileSync(output);
  assert.equal(installer.subarray(0, 2).toString(), 'MZ');
  assert.ok(installer.length > 10 * 1024 * 1024);
  report.output = path.relative(repository, output); report.bytes = installer.length;
  report.sha256 = digest(installer); report.bundledFiles = runtimeFiles.length;
  report.runtimeFileHashes = Object.fromEntries(runtimeFiles.filter(file => file.replaceAll('\\', '/').startsWith('resources/app/')).map(file => [file.replaceAll('\\', '/'), digest(readFileSync(path.join(appDirectory, file)))]));
  report.includesDesktopShortcut = true; report.includesStartMenuShortcut = true;
  report.userDataPreservedOnUninstall = true; report.codeSigned = false;
  report.installerCompiled = true; report.windowsRuntimeTested = false;
  writeFileSync(`${output}.sha256`, `${report.sha256}  ${path.basename(output)}\n`, { flag: 'wx' });
  writeFileSync(`${output}.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: report.output, bytes: report.bytes, sha256: report.sha256, windowsRuntimeTested: false }));
} catch (error) {
  report.installerCompiled = false; report.error = error.message;
  writeFileSync(path.join(working, 'failure.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.error(error.message); process.exitCode = 1;
}
