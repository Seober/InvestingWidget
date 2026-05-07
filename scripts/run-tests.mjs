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

// shell: true — Windows 에서 npx.cmd 직접 spawn 시 EINVAL. shell 을 거쳐야 .cmd 인식.
// args 모두 정적 값 (file list 는 readdir 결과) 라 shell injection risk X.
const child = spawn(
  'npx',
  ['tsx', '--tsconfig', 'tsconfig.test.json', '--test', ...files],
  { stdio: 'inherit', shell: true }
)

child.on('exit', (code) => process.exit(code ?? 1))
