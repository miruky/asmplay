// CPUの実行部。レジスタとメモリは8ビットで、演算は256で巻き戻る。
// フラグはcmpだけが更新する(zero: 等しい / lt: 左が小さい)。
// stepは「何が変わったか」を返し、画面のハイライトに使う。

import type { Address, Instr, Program } from './asm';

export interface Cpu {
  regs: Uint8Array;
  mem: Uint8Array;
  pc: number;
  zero: boolean;
  lt: boolean;
  halted: boolean;
  output: number[];
  steps: number;
}

export interface StepChange {
  pcBefore: number;
  reg?: number;
  mem?: number;
  out?: boolean;
  jumped: boolean;
}

export const MEM_SIZE = 256;
export const MAX_STEPS = 65536;

export function createCpu(): Cpu {
  return {
    regs: new Uint8Array(8),
    mem: new Uint8Array(MEM_SIZE),
    pc: 0,
    zero: false,
    lt: false,
    halted: false,
    output: [],
    steps: 0,
  };
}

function resolveAddr(cpu: Cpu, addr: Address): number {
  return addr.kind === 'direct' ? addr.addr : (cpu.regs[addr.reg] ?? 0);
}

// 1命令だけ実行する。停止済み・プログラム終端ではnullを返す
export function step(cpu: Cpu, program: Program): StepChange | null {
  if (cpu.halted || cpu.pc >= program.instrs.length) {
    cpu.halted = true;
    return null;
  }
  const instr = program.instrs[cpu.pc] as Instr;
  const change: StepChange = { pcBefore: cpu.pc, jumped: false };
  let nextPc = cpu.pc + 1;
  cpu.steps += 1;

  switch (instr.op) {
    case 'mov':
      cpu.regs[instr.rd] =
        instr.src.kind === 'imm' ? instr.src.value : (cpu.regs[instr.src.reg] ?? 0);
      change.reg = instr.rd;
      break;
    case 'add':
      cpu.regs[instr.rd] = ((cpu.regs[instr.rd] ?? 0) + (cpu.regs[instr.rs] ?? 0)) & 0xff;
      change.reg = instr.rd;
      break;
    case 'sub':
      cpu.regs[instr.rd] = ((cpu.regs[instr.rd] ?? 0) - (cpu.regs[instr.rs] ?? 0)) & 0xff;
      change.reg = instr.rd;
      break;
    case 'and':
      cpu.regs[instr.rd] = (cpu.regs[instr.rd] ?? 0) & (cpu.regs[instr.rs] ?? 0);
      change.reg = instr.rd;
      break;
    case 'or':
      cpu.regs[instr.rd] = (cpu.regs[instr.rd] ?? 0) | (cpu.regs[instr.rs] ?? 0);
      change.reg = instr.rd;
      break;
    case 'xor':
      cpu.regs[instr.rd] = (cpu.regs[instr.rd] ?? 0) ^ (cpu.regs[instr.rs] ?? 0);
      change.reg = instr.rd;
      break;
    case 'addi':
      cpu.regs[instr.rd] = ((cpu.regs[instr.rd] ?? 0) + instr.imm) & 0xff;
      change.reg = instr.rd;
      break;
    case 'load': {
      const addr = resolveAddr(cpu, instr.addr);
      cpu.regs[instr.rd] = cpu.mem[addr] ?? 0;
      change.reg = instr.rd;
      break;
    }
    case 'store': {
      const addr = resolveAddr(cpu, instr.addr);
      cpu.mem[addr] = cpu.regs[instr.rs] ?? 0;
      change.mem = addr;
      break;
    }
    case 'cmp': {
      const a = cpu.regs[instr.ra] ?? 0;
      const b = cpu.regs[instr.rb] ?? 0;
      cpu.zero = a === b;
      cpu.lt = a < b;
      break;
    }
    case 'jmp':
      nextPc = instr.target;
      change.jumped = true;
      break;
    case 'jz':
      if (cpu.zero) {
        nextPc = instr.target;
        change.jumped = true;
      }
      break;
    case 'jnz':
      if (!cpu.zero) {
        nextPc = instr.target;
        change.jumped = true;
      }
      break;
    case 'jlt':
      if (cpu.lt) {
        nextPc = instr.target;
        change.jumped = true;
      }
      break;
    case 'out':
      cpu.output.push(cpu.regs[instr.rs] ?? 0);
      change.out = true;
      break;
    case 'halt':
      cpu.halted = true;
      break;
    case 'nop':
      break;
  }

  cpu.pc = nextPc;
  if (cpu.pc >= program.instrs.length) cpu.halted = true;
  return change;
}

export interface RunResult {
  steps: number;
  stoppedByLimit: boolean;
}

// haltか終端まで実行する。無限ループ対策に上限を設ける
export function run(cpu: Cpu, program: Program, maxSteps: number = MAX_STEPS): RunResult {
  let steps = 0;
  while (!cpu.halted && steps < maxSteps) {
    if (step(cpu, program) === null) break;
    steps += 1;
  }
  return { steps, stoppedByLimit: steps >= maxSteps && !cpu.halted };
}
