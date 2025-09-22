// 書いたプログラムをURLのハッシュに載せ、リンク1本で共有・再現できるようにする。
// サーバーを持たないので、ソースそのものを #src= に percent-encode して埋める。

const PREFIX = 'src=';

export function encodeSourceToHash(source: string): string {
  return `#${PREFIX}${encodeURIComponent(source)}`;
}

// ハッシュにプログラムが載っていれば取り出す。形式が違う・壊れている場合はnull。
export function readSourceFromHash(hash: string): string | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!body.startsWith(PREFIX)) return null;
  try {
    return decodeURIComponent(body.slice(PREFIX.length));
  } catch {
    return null;
  }
}
