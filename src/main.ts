// 画面の組み立てと実行制御。エディタのソースを組み立て、1命令ずつ
// あるいは連続でCPUを進め、機械の状態ビューに反映する。

import './style.css';
import { assemble, type Program } from './lib/asm';
import { createCpu, step, type Cpu } from './lib/cpu';
import { sampleById, samples } from './lib/samples';
import { MachineView } from './ui/machineview';

const BRAND_MARK = `
  <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" class="mark-bg" />
    <rect x="18" y="18" width="28" height="28" rx="6" class="mark-die" />
    <path d="M 24 12 V 18 M 32 12 V 18 M 40 12 V 18 M 24 46 V 52 M 32 46 V 52 M 40 46 V 52 M 12 24 H 18 M 12 32 H 18 M 12 40 H 18 M 46 24 H 52 M 46 32 H 52 M 46 40 H 52" class="mark-pin" />
    <circle cx="32" cy="32" r="5" class="mark-core" />
  </svg>`;

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

app.innerHTML = `
  <div class="app">
    <header class="app-header">
      <div class="brand">
        ${BRAND_MARK}
        <div class="brand-text">
          <h1>asmplay</h1>
          <p class="tagline">アセンブリを書いて、レジスタとメモリの動きを眺める</p>
        </div>
      </div>
      <nav class="sample-bar" aria-label="サンプル">
        <span class="sample-label">サンプル</span>
        ${samples
          .map(
            (sample) =>
              `<button type="button" class="chip" data-sample="${sample.id}" title="${sample.description}">${sample.name}</button>`,
          )
          .join('')}
      </nav>
    </header>
    <main class="panes">
      <section class="editor-pane" aria-label="エディタ">
        <label class="editor-label" for="asm-input">アセンブリ(Cmd+Enterで組み立て)</label>
        <textarea id="asm-input" class="asm-input" spellcheck="false" autocomplete="off"></textarea>
        <div class="editor-actions">
          <button type="button" class="button button-primary" id="build-button">組み立てる</button>
          <button type="button" class="button" id="step-button">1命令</button>
          <button type="button" class="button" id="run-button">実行</button>
          <button type="button" class="button" id="reset-button">リセット</button>
          <label class="speed">
            <span>速度</span>
            <select id="speed-select">
              <option value="6">ゆっくり</option>
              <option value="20" selected>ふつう</option>
              <option value="120">はやい</option>
            </select>
          </label>
        </div>
        <ul class="errors" id="errors"></ul>
        <details class="isa-help">
          <summary>命令リファレンス</summary>
          <table>
            <tbody>
              <tr><td>mov rd, rs/imm</td><td>代入</td></tr>
              <tr><td>add/sub/and/or/xor rd, rs</td><td>演算(256で巻き戻る)</td></tr>
              <tr><td>addi rd, imm</td><td>即値の加算</td></tr>
              <tr><td>load rd, [番地/rs]</td><td>メモリから読む</td></tr>
              <tr><td>store rs, [番地/rd]</td><td>メモリへ書く</td></tr>
              <tr><td>cmp ra, rb</td><td>比較してzero/ltフラグを更新</td></tr>
              <tr><td>jmp/jz/jnz/jlt ラベル</td><td>無条件・条件ジャンプ</td></tr>
              <tr><td>out rs</td><td>出力欄に値を追加</td></tr>
              <tr><td>halt / nop</td><td>停止 / 何もしない</td></tr>
            </tbody>
          </table>
        </details>
      </section>
      <section class="machine-pane" id="machine-host" aria-label="CPUの状態"></section>
    </main>
    <footer class="app-footer">
      <p>
        レジスタとメモリは8ビットで、すべてブラウザ内で動く架空のCPU。
        <a href="https://github.com/miruky/asmplay">ソースコード</a>
      </p>
    </footer>
  </div>`;

const editor = document.getElementById('asm-input') as HTMLTextAreaElement;
const errorsEl = document.getElementById('errors') as HTMLUListElement;
const view = new MachineView(document.getElementById('machine-host') as HTMLElement);

let cpu: Cpu = createCpu();
let program: Program | null = null;
let timer: number | null = null;
const runButton = document.getElementById('run-button') as HTMLButtonElement;

function pause(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  runButton.textContent = '実行';
}

function showErrors(errors: { line: number; message: string }[]): void {
  errorsEl.replaceChildren();
  for (const error of errors) {
    const item = document.createElement('li');
    item.textContent = `${error.line}行目: ${error.message}`;
    errorsEl.append(item);
  }
}

function build(): void {
  pause();
  const result = assemble(editor.value);
  showErrors(result.errors);
  program = result.program;
  cpu = createCpu();
  view.setProgram(program, editor.value);
  view.update(cpu, null);
}

function stepOnce(): void {
  if (!program) build();
  if (!program || cpu.halted) return;
  const change = step(cpu, program);
  view.update(cpu, change);
  if (cpu.halted) pause();
}

document.getElementById('build-button')?.addEventListener('click', build);
document.getElementById('step-button')?.addEventListener('click', () => {
  pause();
  stepOnce();
});

runButton.addEventListener('click', () => {
  if (timer !== null) {
    pause();
    return;
  }
  if (!program) build();
  if (!program || cpu.halted) return;
  const speed = Number.parseInt(
    (document.getElementById('speed-select') as HTMLSelectElement).value,
    10,
  );
  timer = window.setInterval(() => stepOnce(), 1000 / speed);
  runButton.textContent = '一時停止';
});

document.getElementById('reset-button')?.addEventListener('click', () => {
  pause();
  cpu = createCpu();
  view.update(cpu, null);
});

editor.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    build();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const { selectionStart, selectionEnd, value } = editor;
    editor.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    editor.selectionStart = selectionStart + 2;
    editor.selectionEnd = selectionStart + 2;
  }
});

for (const button of app.querySelectorAll<HTMLButtonElement>('[data-sample]')) {
  button.addEventListener('click', () => {
    const sample = sampleById(button.dataset.sample ?? '');
    if (!sample) return;
    editor.value = sample.source;
    build();
  });
}

editor.value = (samples[0] as { source: string }).source;
build();
