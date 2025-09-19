// 学習用のサンプルプログラム。すべて assemble を通り、有限ステップで
// 停止することをテストで保証する。

export interface Sample {
  id: string;
  name: string;
  description: string;
  source: string;
}

export const samples: Sample[] = [
  {
    id: 'countup',
    name: 'カウントアップ',
    description: 'r0を1ずつ増やして5回表示する。ループと条件分岐の最小形',
    source: [
      '; r0 を 1 ずつ増やして出力し、5 になったら止まる',
      '        mov  r0, 0',
      '        mov  r1, 5',
      'loop:   addi r0, 1',
      '        out  r0',
      '        cmp  r0, r1',
      '        jnz  loop      ; r0 != 5 の間は繰り返す',
      '        halt',
      '',
    ].join('\n'),
  },
  {
    id: 'sum',
    name: '1からNの合計',
    description: '1から10までを足し込み、結果をメモリ0番地に書いて表示する',
    source: [
      '; 1 + 2 + ... + N を求める',
      '        mov  r0, 0     ; 合計',
      '        mov  r1, 10    ; N',
      '        mov  r2, 0     ; カウンタ',
      'loop:   addi r2, 1',
      '        add  r0, r2',
      '        cmp  r2, r1',
      '        jnz  loop',
      '        store r0, [0]  ; 結果をメモリへ',
      '        out  r0        ; 55 が出力される',
      '        halt',
      '',
    ].join('\n'),
  },
  {
    id: 'fib',
    name: 'フィボナッチ',
    description: '数列の先頭10個をメモリ0番地から書き込む。間接アドレッシングの練習',
    source: [
      '; フィボナッチ数列をメモリに並べる',
      '        mov  r0, 0     ; F(n)',
      '        mov  r1, 1     ; F(n+1)',
      '        mov  r2, 0     ; 書き込み先の番地',
      '        mov  r3, 10    ; 個数',
      'loop:   store r0, [r2] ; メモリ[r2] = F(n)',
      '        mov  r4, r0',
      '        add  r4, r1    ; r4 = F(n) + F(n+1)',
      '        mov  r0, r1',
      '        mov  r1, r4',
      '        addi r2, 1',
      '        cmp  r2, r3',
      '        jlt  loop      ; r2 < 10 の間は繰り返す',
      '        halt',
      '',
    ].join('\n'),
  },
  {
    id: 'kuku',
    name: '7の段',
    description: '掛け算命令がなくても、足し算の繰り返しで九九が作れる',
    source: [
      '; 7 の段(7, 14, ..., 63)を出力する',
      '        mov  r0, 7     ; 段',
      '        mov  r1, 0     ; かける数',
      '        mov  r2, 0     ; 積',
      '        mov  r3, 9     ; かける数の上限',
      'loop:   addi r1, 1',
      '        add  r2, r0    ; 積に 7 を足し込む',
      '        out  r2',
      '        cmp  r1, r3',
      '        jlt  loop',
      '        halt',
      '',
    ].join('\n'),
  },
];

export function sampleById(id: string): Sample | undefined {
  return samples.find((sample) => sample.id === id);
}
