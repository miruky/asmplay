import { describe, expect, it } from 'vitest';
import { assemble, type Program } from './asm';
import { createCpu, run, step } from './cpu';

function programOf(source: string): Program {
  const { program, errors } = assemble(source);
  if (!program) throw new Error(`組み立て失敗: ${JSON.stringify(errors)}`);
  return program;
}

function runSource(source: string) {
  const cpu = createCpu();
  const program = programOf(source);
  const result = run(cpu, program);
  return { cpu, result };
}

describe('演算', () => {
  it('mov・add・subが動き、8ビットで巻き戻る', () => {
    const { cpu } = runSource('mov r0, 200\nmov r1, 100\nadd r0, r1\nhalt');
    expect(cpu.regs[0]).toBe(44);
    const { cpu: cpu2 } = runSource('mov r0, 10\nmov r1, 20\nsub r0, r1\nhalt');
    expect(cpu2.regs[0]).toBe(246);
  });

  it('and・or・xor・addiが動く', () => {
    const { cpu } = runSource(
      'mov r0, 0xf0\nmov r1, 0x0f\nor r0, r1\nmov r2, 0xff\nand r2, r1\nmov r3, 0xff\nxor r3, r3\naddi r3, 5\nhalt',
    );
    expect(cpu.regs[0]).toBe(0xff);
    expect(cpu.regs[2]).toBe(0x0f);
    expect(cpu.regs[3]).toBe(5);
  });
});

describe('メモリ', () => {
  it('直接番地への読み書きができる', () => {
    const { cpu } = runSource('mov r0, 42\nstore r0, [7]\nload r1, [7]\nhalt');
    expect(cpu.mem[7]).toBe(42);
    expect(cpu.regs[1]).toBe(42);
  });

  it('レジスタ間接で番地を指せる', () => {
    const { cpu } = runSource('mov r0, 99\nmov r1, 0x20\nstore r0, [r1]\nload r2, [r1]\nhalt');
    expect(cpu.mem[0x20]).toBe(99);
    expect(cpu.regs[2]).toBe(99);
  });
});

describe('比較とジャンプ', () => {
  it('cmpがzeroとltを更新し、移動命令は更新しない', () => {
    const cpu = createCpu();
    const program = programOf('mov r0, 3\nmov r1, 5\ncmp r0, r1\nmov r2, 0\nhalt');
    step(cpu, program);
    step(cpu, program);
    step(cpu, program);
    expect(cpu.zero).toBe(false);
    expect(cpu.lt).toBe(true);
    step(cpu, program);
    expect(cpu.lt).toBe(true);
  });

  it('jzは等しいとき、jnzは等しくないときだけ跳ぶ', () => {
    const { cpu } = runSource(
      'mov r0, 1\nmov r1, 1\ncmp r0, r1\njz equal\nmov r7, 99\nequal: halt',
    );
    expect(cpu.regs[7]).toBe(0);
  });

  it('ループで1から5を数えられる', () => {
    const { cpu, result } = runSource(
      'mov r0, 0\nmov r1, 5\nloop: addi r0, 1\ncmp r0, r1\njnz loop\nhalt',
    );
    expect(cpu.regs[0]).toBe(5);
    expect(result.stoppedByLimit).toBe(false);
  });
});

describe('停止と保護', () => {
  it('haltで止まり、それ以降stepはnullを返す', () => {
    const cpu = createCpu();
    const program = programOf('halt\nnop');
    expect(step(cpu, program)).not.toBeNull();
    expect(cpu.halted).toBe(true);
    expect(step(cpu, program)).toBeNull();
  });

  it('終端まで実行すると自動的に停止する', () => {
    const cpu = createCpu();
    run(cpu, programOf('nop\nnop'));
    expect(cpu.halted).toBe(true);
    expect(cpu.steps).toBe(2);
  });

  it('無限ループはステップ上限で打ち切られる', () => {
    const cpu = createCpu();
    const result = run(cpu, programOf('loop: jmp loop'), 1000);
    expect(result.stoppedByLimit).toBe(true);
    expect(result.steps).toBe(1000);
  });
});

describe('出力', () => {
  it('outが値を順に記録する', () => {
    const { cpu } = runSource('mov r0, 1\nout r0\naddi r0, 1\nout r0\nhalt');
    expect(cpu.output).toEqual([1, 2]);
  });
});

describe('変更通知', () => {
  it('stepは変わったレジスタ・メモリ・ジャンプを報告する', () => {
    const cpu = createCpu();
    const program = programOf('mov r3, 7\nstore r3, [9]\njmp end\nnop\nend: halt');
    expect(step(cpu, program)?.reg).toBe(3);
    expect(step(cpu, program)?.mem).toBe(9);
    expect(step(cpu, program)?.jumped).toBe(true);
    expect(cpu.pc).toBe(4);
  });
});
