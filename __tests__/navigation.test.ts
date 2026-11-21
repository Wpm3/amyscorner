import { clampPosition, stepBack, stepForward } from '../src/text/navigation';

const counts = [2, 3, 1];
const count = (i: number) => counts[i];

describe('reader navigation', () => {
  it('reveals sentences one by one, then loads the next paragraph unrevealed', () => {
    let pos = { block: 0, revealed: 0 };
    const events: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = stepForward(pos, count, 3, false);
      pos = r.pos;
      events.push(r.event);
    }
    expect(events).toEqual(['reveal', 'reveal', 'newParagraph', 'reveal']);
    expect(pos).toEqual({ block: 1, revealed: 1 });
  });

  it('can auto-reveal the first sentence of a new paragraph', () => {
    expect(stepForward({ block: 0, revealed: 2 }, count, 3, true).pos).toEqual({ block: 1, revealed: 1 });
  });

  it('stops at the end of the book', () => {
    expect(stepForward({ block: 2, revealed: 1 }, count, 3, false)).toEqual({ pos: { block: 2, revealed: 1 }, event: 'end' });
  });

  it('goes back a sentence, then to the previous paragraph fully revealed', () => {
    expect(stepBack({ block: 1, revealed: 1 }, count, false)).toEqual({ pos: { block: 1, revealed: 0 }, event: 'back' });
    expect(stepBack({ block: 1, revealed: 0 }, count, false)).toEqual({ pos: { block: 0, revealed: 2 }, event: 'prevParagraph' });
    expect(stepBack({ block: 1, revealed: 1 }, count, true)).toEqual({ pos: { block: 0, revealed: 2 }, event: 'prevParagraph' });
    expect(stepBack({ block: 0, revealed: 0 }, count, false).event).toBe('start');
  });

  it('respects the content range (front/back matter skipped)', () => {
    expect(stepForward({ block: 1, revealed: 3 }, count, 2, false).event).toBe('end');
    expect(stepBack({ block: 1, revealed: 0 }, count, false, 1).event).toBe('start');
  });

  it('clamps stale positions', () => {
    expect(clampPosition({ block: 9, revealed: 9 }, count, 3)).toEqual({ block: 2, revealed: 1 });
    expect(clampPosition({ block: -1, revealed: -3 }, count, 3)).toEqual({ block: 0, revealed: 0 });
  });
});
