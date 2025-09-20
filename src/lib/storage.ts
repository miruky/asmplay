// 直前に書いていたソースと実行速度をブラウザに残し、再訪時に続きから書けるようにする。
// localStorage が使えない環境(プライベートモード等)でも壊れないよう、読み書きは握りつぶす。

const SOURCE_KEY = 'asmplay.source';
const SPEED_KEY = 'asmplay.speed';

export function loadSource(): string | null {
  try {
    return localStorage.getItem(SOURCE_KEY);
  } catch {
    return null;
  }
}

export function saveSource(source: string): void {
  try {
    localStorage.setItem(SOURCE_KEY, source);
  } catch {
    // 保存できなくても操作は続けられる
  }
}

export function loadSpeed(fallback: number): number {
  try {
    const raw = localStorage.getItem(SPEED_KEY);
    if (raw === null) return fallback;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveSpeed(speed: number): void {
  try {
    localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // 同上
  }
}
