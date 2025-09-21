// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { samples } from './lib/samples';

// main.ts はimport時に画面を組み立てるので、先に#appを用意してから読み込む
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('./main');
});

describe('main', () => {
  it('エディタ・サンプル・機械の状態ビューが組み上がる', () => {
    expect(document.querySelector('h1')?.textContent).toBe('asmplay');
    expect(document.querySelectorAll('[data-sample]').length).toBe(samples.length);
    expect(document.querySelectorAll('.reg-cell').length).toBe(8);
    expect(document.querySelectorAll('.mem-cell').length).toBe(256);
    expect((document.getElementById('asm-input') as HTMLTextAreaElement).value).toContain('mov');
  });

  it('起動時に最初のサンプルが組み立てられ、実行位置リストができる', () => {
    expect(document.querySelectorAll('.listing-row').length).toBeGreaterThan(3);
    expect(document.querySelector('.listing-row.current')).not.toBeNull();
    expect(document.querySelectorAll('#errors li').length).toBe(0);
  });

  it('1命令ずつ進めるとレジスタと実行位置が動く', () => {
    const stepButton = document.getElementById('step-button') as HTMLButtonElement;
    stepButton.click();
    const r0 = document.querySelectorAll('.reg-cell')[0];
    expect(r0?.querySelector('.reg-value')?.textContent).toContain('0');
    stepButton.click();
    const r1 = document.querySelectorAll('.reg-cell')[1];
    expect(r1?.querySelector('.reg-value')?.textContent).toContain('5');
  });

  it('壊れたソースは行番号付きのエラーが並ぶ', () => {
    const editor = document.getElementById('asm-input') as HTMLTextAreaElement;
    editor.value = 'mov r0\nbogus r1, r2';
    (document.getElementById('build-button') as HTMLButtonElement).click();
    const errors = [...document.querySelectorAll('#errors li')].map((el) => el.textContent ?? '');
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain('1行目');
    expect(errors[1]).toContain('2行目');
  });

  it('サンプルを選ぶとエディタが置き換わり、即座に組み立てられる', () => {
    const chip = document.querySelector<HTMLButtonElement>('[data-sample="fib"]');
    chip?.click();
    expect((document.getElementById('asm-input') as HTMLTextAreaElement).value).toContain(
      'フィボナッチ',
    );
    expect(document.querySelectorAll('#errors li').length).toBe(0);
  });

  it('リセットでレジスタが初期値に戻る', () => {
    (document.getElementById('step-button') as HTMLButtonElement).click();
    (document.getElementById('reset-button') as HTMLButtonElement).click();
    const values = [...document.querySelectorAll('.reg-value')].map((el) => el.textContent);
    expect(values.every((text) => text?.startsWith('0 '))).toBe(true);
  });

  const r0Text = () => document.querySelectorAll('.reg-value')[0]?.textContent ?? '';

  it('戻るボタンで直前の状態へ戻り、履歴が尽きると無効化される', () => {
    const editor = document.getElementById('asm-input') as HTMLTextAreaElement;
    editor.value = 'mov r0, 5\nmov r0, 9\nhalt';
    (document.getElementById('build-button') as HTMLButtonElement).click();
    const back = document.getElementById('back-button') as HTMLButtonElement;
    const stepButton = document.getElementById('step-button') as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    stepButton.click();
    expect(r0Text()).toContain('5');
    expect(back.disabled).toBe(false);
    stepButton.click();
    expect(r0Text()).toContain('9');
    back.click();
    expect(r0Text()).toContain('5');
    back.click();
    expect(r0Text()).toMatch(/^0 /);
    expect(back.disabled).toBe(true);
  });

  it('矢印キーで前後の命令へ進める', () => {
    const editor = document.getElementById('asm-input') as HTMLTextAreaElement;
    editor.value = 'mov r0, 7\nmov r0, 3\nhalt';
    (document.getElementById('build-button') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(r0Text()).toContain('7');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(r0Text()).toMatch(/^0 /);
  });
});
