// Cross-platform test runner — Windows PowerShell 의 glob 미expand issue 회피.
// readdir 으로 *.test.ts 발견 → tsx --test 에 file list pass.
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const TEST_DIR = resolve('test')

const entries = await readdir(TEST_DIR)
const files = entries.filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`)

if (files.length === 0) {
  console.error('[run-tests] test/ 안 *.test.ts 발견 안 됨')
  process.exit(1)
}

const isWindows = process.platform === 'win32'
const child = spawn(
  isWindows ? 'npx.cmd' : 'npx',
  ['tsx', '--tsconfig', 'tsconfig.test.json', '--test', ...files],
  { stdio: 'inherit', shell: false }
)

child.on('exit', (code) => process.exit(code ?? 1))
