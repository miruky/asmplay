import { describe, expect, it } from 'vitest';
import { encodeSourceToHash, readSourceFromHash } from './share';

describe('URL共有', () => {
  it('日本語コメントを含むソースも往復できる', () => {
    const source = 'mov r0, 1 ; 一を入れる\nout r0\nhalt';
    expect(readSourceFromHash(encodeSourceToHash(source))).toBe(source);
  });

  it('先頭の#は付いていても付いていなくても読める', () => {
    const hash = encodeSourceToHash('halt');
    expect(readSourceFromHash(hash)).toBe('halt');
    expect(readSourceFromHash(hash.slice(1))).toBe('halt');
  });

  it('共有用でないハッシュはnullを返す', () => {
    expect(readSourceFromHash('#section')).toBeNull();
    expect(readSourceFromHash('')).toBeNull();
  });

  it('壊れたパーセントエンコードはnullを返す', () => {
    expect(readSourceFromHash('#src=%')).toBeNull();
  });
});
