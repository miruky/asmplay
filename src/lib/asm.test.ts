import { describe, expect, it } from 'vitest';
import { assemble } from './asm';

describe('assemble', () => {
  it('命令・ラベル・コメントを解釈する', () => {
    const { program, errors } = assemble(
      [
        '; コメント行',
        'start: mov r0, 10',
        '  addi r0, -1   ; 減らす',
        '  jnz start',
        '  halt',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(program?.instrs.length).toBe(4);
    expect(program?.instrs[0]).toEqual({ op: 'mov', rd: 0, src: { kind: 'imm', value: 10 } });
    expect(program?.instrs[2]).toEqual({ op: 'jnz', target: 0, label: 'start' });
    expect(program?.lines).toEqual([2, 3, 4, 5]);
  });

  it('16進即値とレジスタ間movを解釈する', () => {
    const { program } = assemble('mov r1, 0xff\nmov r2, r1');
    expect(program?.instrs[0]).toEqual({ op: 'mov', rd: 1, src: { kind: 'imm', value: 255 } });
    expect(program?.instrs[1]).toEqual({ op: 'mov', rd: 2, src: { kind: 'reg', reg: 1 } });
  });

  it('直接・間接のメモリ参照を区別する', () => {
    const { program } = assemble('load r0, [16]\nstore r0, [r3]');
    expect(program?.instrs[0]).toEqual({ op: 'load', rd: 0, addr: { kind: 'direct', addr: 16 } });
    expect(program?.instrs[1]).toEqual({ op: 'store', rs: 0, addr: { kind: 'indirect', reg: 3 } });
  });

  it('ラベルだけの行は次の命令を指す', () => {
    const { program } = assemble('loop:\n  nop\n  jmp loop');
    expect(program?.instrs[1]).toEqual({ op: 'jmp', target: 0, label: 'loop' });
  });

  it('未定義ラベルは行番号付きのエラーになる', () => {
    const { program, errors } = assemble('jmp nowhere');
    expect(program).toBeNull();
    expect(errors[0]?.line).toBe(1);
    expect(errors[0]?.message).toContain('nowhere');
  });

  it('複数のエラーをまとめて報告する', () => {
    const { errors } = assemble('mov r9, 1\nfoo r0\nmov r0, 999');
    expect(errors.length).toBe(3);
    expect(errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  it('オペランドの数が違うとエラーになる', () => {
    const { errors } = assemble('add r0\nhalt r1');
    expect(errors.length).toBe(2);
    expect(errors[0]?.message).toContain('2個');
  });

  it('ラベルの重複を拒否する', () => {
    const { errors } = assemble('a: nop\na: nop');
    expect(errors[0]?.message).toContain('重複');
  });

  it('範囲外の番地と即値を拒否する', () => {
    const { errors } = assemble('load r0, [256]\nmov r0, 300');
    expect(errors.length).toBe(2);
  });

  it('メモリ参照の書式違いを拒否する', () => {
    const { errors } = assemble('load r0, [abc]\nstore r1, 5');
    expect(errors.length).toBe(2);
    expect(errors[0]?.message).toContain('メモリ参照');
    expect(errors[1]?.message).toContain('メモリ参照');
  });

  it('空のソースは空のプログラムになる', () => {
    const { program, errors } = assemble('\n; コメントだけ\n');
    expect(errors).toEqual([]);
    expect(program?.instrs).toEqual([]);
  });
});
