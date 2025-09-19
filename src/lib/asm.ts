// 小さなアセンブリ言語のアセンブラ。8本のレジスタ(r0-r7)、256バイトの
// メモリ、ラベルとコメント(;)だけの教育用文法を、命令列に変換する。
// エラーは行番号付きで全件報告し、最初の1個で止めない。

export type Operand = { kind: 'reg'; reg: number } | { kind: 'imm'; value: number };
export type Address = { kind: 'direct'; addr: number } | { kind: 'indirect'; reg: number };

export type Instr =
  | { op: 'mov'; rd: number; src: Operand }
  | { op: 'add' | 'sub' | 'and' | 'or' | 'xor'; rd: number; rs: number }
  | { op: 'addi'; rd: number; imm: number }
  | { op: 'load'; rd: number; addr: Address }
  | { op: 'store'; rs: number; addr: Address }
  | { op: 'cmp'; ra: number; rb: number }
  | { op: 'jmp' | 'jz' | 'jnz' | 'jlt'; target: number; label: string }
  | { op: 'out'; rs: number }
  | { op: 'halt' }
  | { op: 'nop' };

export interface AsmError {
  line: number;
  message: string;
}

export interface Program {
  instrs: Instr[];
  // instrs[i] が由来する1始まりのソース行番号。実行中のハイライトに使う
  lines: number[];
}

export interface AssembleResult {
  program: Program | null;
  errors: AsmError[];
}

const LABEL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const JUMPS = new Set(['jmp', 'jz', 'jnz', 'jlt']);

function parseReg(token: string): number | null {
  const match = /^r([0-7])$/.exec(token);
  return match ? Number.parseInt(match[1] as string, 10) : null;
}

function parseNumber(token: string): number | null {
  if (/^0x[0-9a-fA-F]+$/.test(token)) return Number.parseInt(token.slice(2), 16);
  if (/^-?\d+$/.test(token)) return Number.parseInt(token, 10);
  return null;
}

function parseAddress(token: string): Address | 'malformed' | 'range' | null {
  const match = /^\[(.+)\]$/.exec(token);
  if (!match) return null;
  const inner = (match[1] as string).trim();
  const reg = parseReg(inner);
  if (reg !== null) return { kind: 'indirect', reg };
  const value = parseNumber(inner);
  if (value === null) return 'malformed';
  if (value < 0 || value > 255) return 'range';
  return { kind: 'direct', addr: value };
}

interface Draft {
  line: number;
  mnemonic: string;
  operands: string[];
}

export function assemble(source: string): AssembleResult {
  const errors: AsmError[] = [];
  const drafts: Draft[] = [];
  const labels = new Map<string, number>();

  source.split('\n').forEach((raw, index) => {
    const line = index + 1;
    let text = raw;
    const comment = text.indexOf(';');
    if (comment !== -1) text = text.slice(0, comment);
    text = text.trim();
    if (text === '') return;

    // 行頭のラベル(複数可)を取り込み、次の命令の位置を指すようにする
    while (true) {
      const colon = text.indexOf(':');
      if (colon === -1) break;
      const name = text.slice(0, colon).trim();
      if (!LABEL_PATTERN.test(name)) {
        errors.push({ line, message: `ラベル名 '${name}' が不正です(英字で始まる英数字)` });
      } else if (labels.has(name)) {
        errors.push({ line, message: `ラベル '${name}' が重複しています` });
      } else {
        labels.set(name, drafts.length);
      }
      text = text.slice(colon + 1).trim();
    }
    if (text === '') return;

    const spaceSplit = text.split(/\s+/);
    const mnemonic = (spaceSplit[0] as string).toLowerCase();
    const operandText = text.slice((spaceSplit[0] as string).length).trim();
    const operands =
      operandText === '' ? [] : operandText.split(',').map((part) => part.trim().toLowerCase());
    drafts.push({ line, mnemonic, operands });
  });

  const instrs: Instr[] = [];
  const lines: number[] = [];

  const need = (draft: Draft, count: number): boolean => {
    if (draft.operands.length !== count) {
      errors.push({
        line: draft.line,
        message: `${draft.mnemonic} はオペランドを${count}個取ります(${draft.operands.length}個書かれています)`,
      });
      return false;
    }
    return true;
  };

  const regOf = (draft: Draft, index: number): number | null => {
    const token = draft.operands[index] ?? '';
    const reg = parseReg(token);
    if (reg === null) {
      errors.push({ line: draft.line, message: `'${token}' はレジスタではありません(r0〜r7)` });
    }
    return reg;
  };

  for (const draft of drafts) {
    const { mnemonic } = draft;
    const push = (instr: Instr) => {
      instrs.push(instr);
      lines.push(draft.line);
    };

    if (mnemonic === 'halt' || mnemonic === 'nop') {
      if (need(draft, 0)) push({ op: mnemonic });
      continue;
    }
    if (mnemonic === 'out') {
      if (!need(draft, 1)) continue;
      const rs = regOf(draft, 0);
      if (rs !== null) push({ op: 'out', rs });
      continue;
    }
    if (JUMPS.has(mnemonic)) {
      if (!need(draft, 1)) continue;
      const label = draft.operands[0] as string;
      const target = labels.get(label);
      if (target === undefined) {
        errors.push({ line: draft.line, message: `ラベル '${label}' が見つかりません` });
        continue;
      }
      push({ op: mnemonic as 'jmp', target, label });
      continue;
    }
    if (mnemonic === 'mov') {
      if (!need(draft, 2)) continue;
      const rd = regOf(draft, 0);
      if (rd === null) continue;
      const srcToken = draft.operands[1] as string;
      const srcReg = parseReg(srcToken);
      if (srcReg !== null) {
        push({ op: 'mov', rd, src: { kind: 'reg', reg: srcReg } });
        continue;
      }
      const value = parseNumber(srcToken);
      if (value === null) {
        errors.push({
          line: draft.line,
          message: `'${srcToken}' はレジスタでも数値でもありません`,
        });
        continue;
      }
      if (value < 0 || value > 255) {
        errors.push({ line: draft.line, message: `即値 ${value} が範囲外です(0〜255)` });
        continue;
      }
      push({ op: 'mov', rd, src: { kind: 'imm', value } });
      continue;
    }
    if (mnemonic === 'addi') {
      if (!need(draft, 2)) continue;
      const rd = regOf(draft, 0);
      if (rd === null) continue;
      const imm = parseNumber(draft.operands[1] as string);
      if (imm === null || imm < -255 || imm > 255) {
        errors.push({
          line: draft.line,
          message: `'${draft.operands[1]}' は即値として使えません(-255〜255)`,
        });
        continue;
      }
      push({ op: 'addi', rd, imm });
      continue;
    }
    if (
      mnemonic === 'add' ||
      mnemonic === 'sub' ||
      mnemonic === 'and' ||
      mnemonic === 'or' ||
      mnemonic === 'xor'
    ) {
      if (!need(draft, 2)) continue;
      const rd = regOf(draft, 0);
      const rs = rd === null ? null : regOf(draft, 1);
      if (rd !== null && rs !== null) push({ op: mnemonic, rd, rs });
      continue;
    }
    if (mnemonic === 'cmp') {
      if (!need(draft, 2)) continue;
      const ra = regOf(draft, 0);
      const rb = ra === null ? null : regOf(draft, 1);
      if (ra !== null && rb !== null) push({ op: 'cmp', ra, rb });
      continue;
    }
    if (mnemonic === 'load' || mnemonic === 'store') {
      if (!need(draft, 2)) continue;
      const reg = regOf(draft, 0);
      if (reg === null) continue;
      const addr = parseAddress(draft.operands[1] as string);
      if (addr === null || addr === 'malformed') {
        errors.push({
          line: draft.line,
          message: `'${draft.operands[1]}' はメモリ参照ではありません([番地] か [レジスタ])`,
        });
        continue;
      }
      if (addr === 'range') {
        errors.push({ line: draft.line, message: '番地が範囲外です(0〜255)' });
        continue;
      }
      if (mnemonic === 'load') push({ op: 'load', rd: reg, addr });
      else push({ op: 'store', rs: reg, addr });
      continue;
    }
    errors.push({ line: draft.line, message: `'${mnemonic}' という命令はありません` });
  }

  if (errors.length > 0) return { program: null, errors };
  return { program: { instrs, lines }, errors: [] };
}
