#!/usr/bin/env node
// ============================================================================
// Runner da Suíte de Testes no Pipeline CI (Item 3.1 e 3.2 da Etapa 3)
// Executado automaticamente durante o `npm run build` da API em cada push:
// 1. Executa os testes de unidade TDD (api/testes/*.test.js)
// 2. Quando em ambiente CI (ou se os containers não estiverem ativos), sobe o
//    Docker Compose e executa os testes de isolamento e integração (testes/*.test.js)
// ============================================================================
const { execSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function run(cmd, cwd = rootDir) {
  console.log(`\n> [CI Suite] ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

try {
  // 1. Confere que os arquivos de teste existem e roda a base da pirâmide (Unidade TDD)
  run('node --test api/testes/cota-taxa.test.js');

  // 2. Se estiver rodando no GitHub Actions (CI=true), sobe o Docker Compose e roda Isolamento + Integração
  if (process.env.CI === 'true' || process.env.RUN_E2E === 'true') {
    run('docker compose up -d --build');
    run('node --test --test-concurrency=1 testes/isolamento.test.js testes/integracao.test.js');
  }
  console.log('\n✓ [CI Suite] Todos os testes da suíte passaram com sucesso!');
} catch (err) {
  console.error('\n✗ [CI Suite] Falha na suíte de testes! O portão do pipeline fechou.');
  process.exit(1);
}
