import { analyzeClauses, type ClausePart } from '../src/text/clauses';
import { sentenceState } from '../src/text/paragraph';

/** Compact view: "text|main0" or "text|aside". */
const view = (parts: ClausePart[]) => parts.map((p) => `${p.text}|${p.role === 'aside' ? 'aside' : `main${p.group}`}`);

describe('analyzeClauses', () => {
  it('colours an interrupting phrase separately and joins the clause around it', () => {
    expect(view(analyzeClauses("I think that, on a good day, it's good to be interesting."))).toEqual([
      'I think that,|main0',
      'on a good day,|aside',
      "it's good to be interesting.|main0",
    ]);
  });

  it('handles asides in dashes and parentheses', () => {
    expect(view(analyzeClauses('My sister — the one in Ohio — finally called me back.'))).toEqual([
      'My sister —|main0',
      'the one in Ohio —|aside',
      'finally called me back.|main0',
    ]);
    expect(view(analyzeClauses('The results (which surprised everyone in the lab) were published quickly.'))).toEqual([
      'The results|main0',
      '(which surprised everyone in the lab)|aside',
      'were published quickly.|main0',
    ]);
  });

  it('handles non-restrictive "which/who" clauses in the middle of a sentence', () => {
    expect(view(analyzeClauses('The old lamp, which had burned for forty years, finally went out.'))).toEqual([
      'The old lamp,|main0',
      'which had burned for forty years,|aside',
      'finally went out.|main0',
    ]);
  });

  it('gives separate clauses separate groups, with asides inside them', () => {
    expect(view(analyzeClauses('He was, of course, very tired, but he kept walking home.'))).toEqual([
      'He was,|main0',
      'of course,|aside',
      'very tired,|main0',
      'but he kept walking home.|main1',
    ]);
    expect(view(analyzeClauses('Although it rained all day, we walked to the old harbor.'))).toEqual([
      'Although it rained all day,|main0',
      'we walked to the old harbor.|main1',
    ]);
  });

  it('does not mistake list items for asides', () => {
    expect(view(analyzeClauses('We need eggs, milk, bread, and butter for the cake tonight.'))).toEqual([
      'We need eggs, milk, bread, and butter for the cake tonight.|main0',
    ]);
    expect(view(analyzeClauses('I bought apples, pears, and plums, but she wanted grapes instead.'))).toEqual([
      'I bought apples, pears, and plums,|main0',
      'but she wanted grapes instead.|main1',
    ]);
  });

  it('leaves openers, trailing clauses and short sentences alone', () => {
    expect(view(analyzeClauses('However, the plan worked perfectly in the end.'))).toEqual(['However, the plan worked perfectly in the end.|main0']);
    expect(view(analyzeClauses('Yes, I know, and so do you.'))).toEqual(['Yes, I know, and so do you.|main0']);
    expect(view(analyzeClauses('She called her brother, who had moved to Ohio last spring.'))).toEqual([
      'She called her brother,|main0',
      'who had moved to Ohio last spring.|main1',
    ]);
  });

  it('does not treat a full clause between commas as an aside', () => {
    const parts = analyzeClauses('It was the best of times, it was the worst of times, it was the age of wisdom.');
    expect(parts.some((p) => p.role === 'aside')).toBe(false);
  });

  it('skips an introductory phrase and finds the real aside after it', () => {
    expect(view(analyzeClauses('In 1931, the lamp, which had burned oil for decades, was finally converted.'))).toEqual([
      'In 1931, the lamp,|main0',
      'which had burned oil for decades,|aside',
      'was finally converted.|main0',
    ]);
  });

  it('finds an aside right before a coordinated clause', () => {
    expect(view(analyzeClauses('Call me Ishmael, if you like, and I will tell you a story.'))).toEqual([
      'Call me Ishmael,|main0',
      'if you like,|aside',
      'and I will tell you a story.|main1',
    ]);
  });

  it('never loses or reorders text', () => {
    const s = 'Mr. Smith, the keeper, said that, on most nights, the lamp — old as it was — still turned; nobody, not even the gulls, complained.';
    expect(analyzeClauses(s).map((p) => p.text).join(' ')).toBe(s);
  });

  it('does not treat numbers like 1,000 as asides', () => {
    expect(view(analyzeClauses('He saved 1,000 dollars over the long winter months.'))).toEqual(['He saved 1,000 dollars over the long winter months.|main0']);
  });
});

describe('sentenceState (focus mode hides every sentence but the current one)', () => {
  it('normally shows read sentences, the current one, and hides the rest', () => {
    expect([0, 1, 2, 3].map((i) => sentenceState(i, 2, false))).toEqual(['past', 'current', 'hidden', 'hidden']);
  });

  it('in focus mode conceals everything except the current sentence', () => {
    expect([0, 1, 2, 3].map((i) => sentenceState(i, 2, true))).toEqual(['concealed', 'current', 'concealed', 'concealed']);
  });

  it('before anything is revealed, focus mode conceals the whole paragraph', () => {
    expect([0, 1].map((i) => sentenceState(i, 0, true))).toEqual(['concealed', 'concealed']);
  });
});
