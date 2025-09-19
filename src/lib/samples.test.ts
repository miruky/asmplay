import { describe, expect, it } from 'vitest';
import { assemble } from './asm';
import { createCpu, run } from './cpu';
import { sampleById, samples } from './samples';

describe('samples', () => {
  it('idは一意で、名前と説明が埋まっている', () => {
    const ids = samples.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sample of samples) {
      expect(sample.name).not.toBe('');
      expect(sample.description).not.toBe('');
    }
  });

  it('全サンプルがエラーなく組み立てられ、有限ステップで停止する', () => {
    for (const sample of samples) {
      const { program, errors } = assemble(sample.source);
      expect(errors, sample.id).toEqual([]);
      const cpu = createCpu();
      const result = run(cpu, program!);
      expect(result.stoppedByLimit, sample.id).toBe(false);
      expect(cpu.halted, sample.id).toBe(true);
    }
  });

  it('カウントアップは1から5を出力する', () => {
    const cpu = createCpu();
    run(cpu, assemble(sampleById('countup')!.source).program!);
    expect(cpu.output).toEqual([1, 2, 3, 4, 5]);
  });

  it('合計は55をメモリ0番地と出力に残す', () => {
    const cpu = createCpu();
    run(cpu, assemble(sampleById('sum')!.source).program!);
    expect(cpu.mem[0]).toBe(55);
    expect(cpu.output).toEqual([55]);
  });

  it('フィボナッチはメモリ先頭に数列を書き込む', () => {
    const cpu = createCpu();
    run(cpu, assemble(sampleById('fib')!.source).program!);
    expect([...cpu.mem.slice(0, 10)]).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34]);
  });

  it('7の段は7から63まで出力する', () => {
    const cpu = createCpu();
    run(cpu, assemble(sampleById('kuku')!.source).program!);
    expect(cpu.output).toEqual([7, 14, 21, 28, 35, 42, 49, 56, 63]);
  });
});
