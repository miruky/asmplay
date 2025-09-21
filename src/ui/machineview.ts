// CPUの状態(レジスタ・フラグ・メモリ・出力・実行位置)の描画。
// 直前のステップで変わった場所にクラスを付け、点滅で目を誘導する。

import type { Program } from '../lib/asm';
import type { Cpu, StepChange } from '../lib/cpu';

const MEM_COLS = 16;

export class MachineView {
  private readonly regCells: HTMLElement[] = [];
  private readonly memCells: HTMLElement[] = [];
  private readonly flagsEl: HTMLElement;
  private readonly pcEl: HTMLElement;
  private readonly stateEl: HTMLElement;
  private readonly outputEl: HTMLElement;
  private readonly listingEl: HTMLElement;
  private listingRows: HTMLElement[] = [];
  private readonly onToggleBreakpoint?: (index: number, active: boolean) => void;

  constructor(host: HTMLElement, onToggleBreakpoint?: (index: number, active: boolean) => void) {
    this.onToggleBreakpoint = onToggleBreakpoint;
    host.innerHTML = `
      <section class="panel" aria-label="レジスタ">
        <h2>レジスタ</h2>
        <div class="reg-grid" id="reg-grid"></div>
        <p class="machine-meta">
          <span id="pc-view"></span>
          <span id="flags-view"></span>
          <span id="state-view"></span>
        </p>
      </section>
      <section class="panel" aria-label="メモリ">
        <h2>メモリ(256バイト)</h2>
        <div class="mem-grid" id="mem-grid" role="img" aria-label="メモリの内容"></div>
      </section>
      <section class="panel" aria-label="実行中のプログラム">
        <h2>実行位置</h2>
        <ol class="listing" id="listing"></ol>
      </section>
      <section class="panel" aria-label="出力">
        <h2>出力</h2>
        <p class="output" id="output-view" aria-live="polite"></p>
      </section>`;

    const regGrid = host.querySelector('#reg-grid') as HTMLElement;
    for (let i = 0; i < 8; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'reg-cell';
      const name = document.createElement('span');
      name.className = 'reg-name';
      name.textContent = `r${i}`;
      const value = document.createElement('span');
      value.className = 'reg-value';
      cell.append(name, value);
      regGrid.append(cell);
      this.regCells.push(cell);
    }

    const memGrid = host.querySelector('#mem-grid') as HTMLElement;
    // 列見出し(下位ニブル 0〜f)。左端は番地ガターのぶん空ける。
    const head = document.createElement('div');
    head.className = 'mem-row mem-head';
    head.append(document.createElement('span'));
    for (let c = 0; c < MEM_COLS; c += 1) {
      const col = document.createElement('span');
      col.className = 'mem-colhead';
      col.textContent = c.toString(16);
      head.append(col);
    }
    memGrid.append(head);
    // 16セルごとに行を作り、行頭に上位ニブルの番地を置く。
    for (let row = 0; row < 256 / MEM_COLS; row += 1) {
      const rowEl = document.createElement('div');
      rowEl.className = 'mem-row';
      const addr = document.createElement('span');
      addr.className = 'mem-addr';
      addr.textContent = `${(row * MEM_COLS).toString(16).padStart(2, '0')}`;
      rowEl.append(addr);
      for (let c = 0; c < MEM_COLS; c += 1) {
        const i = row * MEM_COLS + c;
        const cell = document.createElement('span');
        cell.className = 'mem-cell';
        cell.title = `番地 ${i} (0x${i.toString(16).padStart(2, '0')})`;
        rowEl.append(cell);
        this.memCells.push(cell);
      }
      memGrid.append(rowEl);
    }

    this.pcEl = host.querySelector('#pc-view') as HTMLElement;
    this.flagsEl = host.querySelector('#flags-view') as HTMLElement;
    this.stateEl = host.querySelector('#state-view') as HTMLElement;
    this.outputEl = host.querySelector('#output-view') as HTMLElement;
    this.listingEl = host.querySelector('#listing') as HTMLElement;
  }

  // プログラムを組み立て直したときに、実行位置リストを作り直す。
  // 各行に行番号のガターを置き、そこをクリックするとブレークポイントを切り替える。
  setProgram(program: Program | null, source: string): void {
    this.listingEl.replaceChildren();
    this.listingRows = [];
    if (!program) return;
    const sourceLines = source.split('\n');
    program.lines.forEach((lineNo, index) => {
      const row = document.createElement('li');
      row.className = 'listing-row';

      const gutter = document.createElement('button');
      gutter.type = 'button';
      gutter.className = 'bp';
      gutter.setAttribute('aria-pressed', 'false');
      gutter.setAttribute('aria-label', `${lineNo}行目のブレークポイント`);
      gutter.textContent = `${lineNo}`;
      gutter.addEventListener('click', () => {
        const active = gutter.getAttribute('aria-pressed') !== 'true';
        gutter.setAttribute('aria-pressed', String(active));
        row.classList.toggle('breakpoint', active);
        this.onToggleBreakpoint?.(index, active);
      });

      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = (sourceLines[lineNo - 1] ?? '').trim();

      row.append(gutter, code);
      this.listingEl.append(row);
      this.listingRows.push(row);
    });
  }

  update(cpu: Cpu, change: StepChange | null): void {
    cpu.regs.forEach((value, i) => {
      const cell = this.regCells[i] as HTMLElement;
      (cell.querySelector('.reg-value') as HTMLElement).textContent =
        `${value} (0x${value.toString(16).padStart(2, '0')})`;
      cell.classList.toggle('changed', change?.reg === i);
    });
    cpu.mem.forEach((value, i) => {
      const cell = this.memCells[i] as HTMLElement;
      cell.textContent = value.toString(16).padStart(2, '0');
      cell.classList.toggle('nonzero', value !== 0);
      cell.classList.toggle('changed', change?.mem === i);
      // 値の大きさを淡い背景の濃さで表す(0は無地)。どこにデータが溜まっているか俯瞰できる。
      cell.style.setProperty('--fill', value === 0 ? '0' : (0.1 + 0.3 * (value / 255)).toFixed(3));
    });
    this.pcEl.textContent = `pc=${cpu.pc}`;
    this.flagsEl.textContent = `zero=${cpu.zero ? 1 : 0} lt=${cpu.lt ? 1 : 0}`;
    this.stateEl.textContent = cpu.halted ? `停止(${cpu.steps}ステップ実行)` : '実行可能';
    this.outputEl.textContent = cpu.output.join(', ');
    this.listingRows.forEach((row, i) => {
      const current = !cpu.halted && i === cpu.pc;
      row.classList.toggle('current', current);
      // 長いプログラムでも実行位置を見失わないよう、現在行を可視域へ送る。
      if (current) row.scrollIntoView({ block: 'nearest' });
    });
  }
}
