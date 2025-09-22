// 画面の組み立てと実行制御。エディタのソースを組み立て、1命令ずつ
// あるいは連続でCPUを進め、機械の状態ビューに反映する。

import './style.css';
import { assemble, type Program } from './lib/asm';
import { cloneCpu, createCpu, step, type Cpu } from './lib/cpu';
import { sampleById, samples } from './lib/samples';
import { encodeSourceToHash, readSourceFromHash } from './lib/share';
import { loadSource, loadSpeed, saveSource, saveSpeed } from './lib/storage';
import { MachineView } from './ui/machineview';

// 1命令戻る用に控える状態の上限。長時間の実行でも記憶が際限なく増えないようにする。
const MAX_HISTORY = 4096;

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
          <button type="button" class="button" id="back-button" disabled>戻る</button>
          <button type="button" class="button" id="step-button">1命令</button>
          <button type="button" class="button" id="run-button">実行</button>
          <button type="button" class="button" id="reset-button">リセット</button>
          <button type="button" class="button" id="share-button">共有リンク</button>
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
// ブレークポイントは命令インデックスの集合。組み立て直すたびに作り直す。
const breakpoints = new Set<number>();
const view = new MachineView(
  document.getElementById('machine-host') as HTMLElement,
  (index, active) => {
    if (active) breakpoints.add(index);
    else breakpoints.delete(index);
  },
);

let cpu: Cpu = createCpu();
let program: Program | null = null;
let timer: number | null = null;
const history: Cpu[] = [];
const runButton = document.getElementById('run-button') as HTMLButtonElement;
const backButton = document.getElementById('back-button') as HTMLButtonElement;

function pause(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  runButton.textContent = '実行';
}

function refreshControls(): void {
  backButton.disabled = history.length === 0;
}

const shareButton = document.getElementById('share-button') as HTMLButtonElement;
let shareTimer: number | null = null;

// 共有ボタンに一時的な手応えを出す。一定時間で元の文言へ戻す。
function flashShare(message: string): void {
  shareButton.textContent = message;
  if (shareTimer !== null) window.clearTimeout(shareTimer);
  shareTimer = window.setTimeout(() => {
    shareButton.textContent = '共有リンク';
  }, 1600);
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
  history.length = 0;
  breakpoints.clear();
  view.setProgram(program, editor.value);
  view.update(cpu, null);
  saveSource(editor.value);
  // 現在のプログラムをURLに反映しておき、そのままコピーすれば共有できる。
  window.history.replaceState(null, '', encodeSourceToHash(editor.value));
  refreshControls();
}

function stepOnce(): void {
  if (!program) build();
  if (!program || cpu.halted) return;
  // 戻れるよう、進む前の状態を控える。上限を超えたら古いものから捨てる。
  history.push(cloneCpu(cpu));
  if (history.length > MAX_HISTORY) history.shift();
  const change = step(cpu, program);
  view.update(cpu, change);
  refreshControls();
  if (cpu.halted) pause();
}

function stepBack(): void {
  pause();
  const previous = history.pop();
  if (!previous) return;
  cpu = previous;
  view.update(cpu, null);
  refreshControls();
}

const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;

document.getElementById('build-button')?.addEventListener('click', build);
document.getElementById('step-button')?.addEventListener('click', () => {
  pause();
  stepOnce();
});
backButton.addEventListener('click', stepBack);

runButton.addEventListener('click', () => {
  if (timer !== null) {
    pause();
    return;
  }
  if (!program) build();
  if (!program || cpu.halted) return;
  const speed = Number.parseInt(speedSelect.value, 10);
  timer = window.setInterval(() => {
    stepOnce();
    // ブレークポイントの行に着いたら止める(その命令の手前で停止)。
    if (!cpu.halted && breakpoints.has(cpu.pc)) pause();
  }, 1000 / speed);
  runButton.textContent = '一時停止';
});

document.getElementById('share-button')?.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}${encodeSourceToHash(editor.value)}`;
  window.history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    flashShare('リンクをコピーした');
  } catch {
    // クリップボードが使えない場合でもURLは反映済み。手でコピーできる旨を伝える。
    flashShare('URLを更新した(コピーは手動で)');
  }
});

document.getElementById('reset-button')?.addEventListener('click', () => {
  pause();
  cpu = createCpu();
  history.length = 0;
  view.update(cpu, null);
  refreshControls();
});

speedSelect.addEventListener('change', () => {
  saveSpeed(Number.parseInt(speedSelect.value, 10));
});

// エディタの外では矢印キーで前後の命令へ。学習中に手をマウスへ移さず追える。
document.addEventListener('keydown', (event) => {
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    pause();
    stepOnce();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    stepBack();
  }
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

// 共有リンクのソースを最優先、次に前回の続き、無ければ最初のサンプルから始める。速度も引き継ぐ。
speedSelect.value = String(loadSpeed(Number.parseInt(speedSelect.value, 10)));
editor.value =
  readSourceFromHash(location.hash) ?? loadSource() ?? (samples[0] as { source: string }).source;
build();
