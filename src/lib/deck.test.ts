import { describe, expect, it } from 'vitest';
import { fromTuple, type Card, type CardTuple } from './card';
import { banlistFromParams, banlistLabel, deckFromParams, deckToParams, parseAny, parseShareCode, parseYdk, parseYdke, resolveBanlist, toShareCode, toYdk, toYdke, validateDeck, type Deck } from './deck';

const deck: Deck = { name: '测试', main: [14558127, 14558127, 89631139, 5000000], extra: [10000], side: [44330098] };

describe('ydke', () => {
  it('round-trips', () => {
    const code = toYdke(deck);
    expect(code.startsWith('ydke://')).toBe(true);
    expect(parseYdke(code, '测试')).toEqual(deck);
  });

  it('decodes a known code', () => {
    // 1 张 89631139（青眼白龙）
    expect(parseYdke('ydke://o6lXBQ==!!!').main).toEqual([89631139]);
  });
});

describe('ydk', () => {
  it('round-trips', () => {
    expect(parseYdk(toYdk(deck), '测试')).toEqual(deck);
  });

  it('handles CRLF, comments and leading zeros', () => {
    const d = parseYdk('#created by someone\r\n#main\r\n08903700\r\n#extra\r\n!side\r\n00001\r\n');
    expect(d.main).toEqual([8903700]);
    expect(d.side).toEqual([1]);
  });
});

describe('share params', () => {
  it('round-trips through URLSearchParams', () => {
    const p = new URLSearchParams(deckToParams(deck).toString());
    expect(deckFromParams(p)).toEqual(deck);
  });

  it('uses a compact code that needs no escaping in URLs', () => {
    const code = toShareCode(deck);
    expect(code).toMatch(/^[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/);
    expect(parseShareCode(code, '测试')).toEqual(deck);
    expect(deckToParams(deck).toString()).not.toMatch(/%2F|%2B|%3D|%21|%3A/);
  });

  it('still opens old links that carry ydke://', () => {
    const old = new URLSearchParams();
    old.set('deck', toYdke(deck));
    old.set('name', '测试');
    expect(deckFromParams(new URLSearchParams(old.toString()))).toEqual(deck);
  });

  it('can shorten the name for QR codes', () => {
    const long = { ...deck, name: '一二三四五六七八九十十一十二十三' };
    expect(deckToParams(long, { maxNameLength: 12 }).get('name')).toBe('一二三四五六七八九十十一');
    expect(deckToParams({ ...deck, name: '' }).has('name')).toBe(false);
  });

  it('encodes and decodes the selected banlist', () => {
    const p = new URLSearchParams(deckToParams(deck, { banlistName: '2025.10 OCG' }).toString());
    expect(p.get('banlist')).toBe('2025.10 OCG');
    expect(deckFromParams(p)).toEqual(deck);
    expect(banlistFromParams(p)).toBe('2025.10 OCG');
  });

  it('encodes 无限制 as an empty banlist param', () => {
    const p = new URLSearchParams(deckToParams(deck, { banlistName: '' }).toString());
    expect(p.has('banlist')).toBe(true);
    expect(banlistFromParams(p)).toBe('');
  });

  it('treats missing banlist as unspecified so old links still open', () => {
    const p = new URLSearchParams(deckToParams(deck).toString());
    expect(p.has('banlist')).toBe(false);
    expect(banlistFromParams(p)).toBeUndefined();
    expect(deckFromParams(p)).toEqual(deck);
  });

  it('round-trips empty zones', () => {
    const d = { name: '', main: [1, 2], extra: [], side: [] };
    expect(parseShareCode(toShareCode(d))).toEqual(d);
  });

  it('parseAny recognises every format', () => {
    const url = `https://example.com/#/view?${deckToParams(deck, { banlistName: '2025.10 OCG' })}`;
    expect(parseAny(url)?.main).toEqual(deck.main);
    expect(parseAny(`分享给你：${toYdke(deck)} 好用`)?.extra).toEqual(deck.extra);
    expect(parseAny(toYdk(deck))?.side).toEqual(deck.side);
    expect(parseAny('随便写点什么')).toBeNull();
  });
});

describe('validateDeck', () => {
  const t = (id: number, type: number, alias = 0): CardTuple => [id, `卡${id}`, '', 3, alias, [], type, 0, 0, 4, 1, 1];
  const cards = new Map<number, Card>(
    [t(1, 0x21), t(2, 0x21 | 0x40), t(3, 0x2), t(4, 0x21, 1)].map((r) => [r[0], fromTuple(r)]),
  );
  const lookup = (id: number) => cards.get(id);

  it('counts alt arts as the same card', () => {
    const issues = validateDeck({ name: '', main: [1, 1, 4, 4], extra: [], side: [] }, lookup);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('4 张'))).toBe(true);
  });

  it('applies banlist', () => {
    const issues = validateDeck({ name: '', main: [3], extra: [], side: [] }, lookup, { name: 'x', cards: { 3: 0 } });
    expect(issues.some((i) => i.message.includes('禁止卡'))).toBe(true);
  });

  it('resolves a named banlist and labels it', () => {
    const lists = [
      { name: '2025.10 OCG', cards: {} },
      { name: '2024.01 TCG', cards: {} },
    ];
    expect(resolveBanlist(lists, '2024.01 TCG')?.name).toBe('2024.01 TCG');
    expect(resolveBanlist(lists)?.name).toBe('2025.10 OCG');
    expect(resolveBanlist(lists, 'gone')?.name).toBe('2025.10 OCG');
    expect(resolveBanlist(lists, '')).toBeNull();
    expect(banlistLabel(lists[0])).toBe('禁卡表 2025.10 OCG');
    expect(banlistLabel(null)).toBe('禁卡表 无限制');
  });

  it('rejects extra deck monsters in main deck', () => {
    const issues = validateDeck({ name: '', main: [2], extra: [1], side: [] }, lookup);
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(2);
  });
});
