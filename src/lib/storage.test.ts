import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSource, loadSpeed, saveSource, saveSpeed } from './storage';

// メモリ上の最小Storage。環境のlocalStorage実装に依存せず、保存ロジックだけを検証する。
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('保存できる環境', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('ソースは書いたものをそのまま読み戻せる', () => {
    saveSource('mov r0, 1\nhalt');
    expect(loadSource()).toBe('mov r0, 1\nhalt');
  });

  it('未保存のソースはnullを返す', () => {
    expect(loadSource()).toBeNull();
  });

  it('速度は保存した値を読み戻す', () => {
    saveSpeed(120);
    expect(loadSpeed(20)).toBe(120);
  });

  it('未保存の速度は既定値を返す', () => {
    expect(loadSpeed(20)).toBe(20);
  });

  it('不正な速度は既定値に落とす', () => {
    localStorage.setItem('asmplay.speed', 'abc');
    expect(loadSpeed(20)).toBe(20);
    localStorage.setItem('asmplay.speed', '-5');
    expect(loadSpeed(20)).toBe(20);
  });
});

describe('localStorageが使えない環境', () => {
  beforeEach(() => {
    // プライベートモード等で例外を投げる実装を模す
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('unavailable');
      },
    });
  });

  it('読み書きが例外を投げても落ちず、既定にフォールバックする', () => {
    expect(() => saveSource('x')).not.toThrow();
    expect(loadSource()).toBeNull();
    expect(() => saveSpeed(60)).not.toThrow();
    expect(loadSpeed(20)).toBe(20);
  });
});
