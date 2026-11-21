import { splitClauses, splitSentences } from '../src/text/segment';

describe('splitSentences', () => {
  const cases: [string, string[]][] = [
    ['Mr. Smith went to Washington. He arrived at 3 p.m. on Friday.', ['Mr. Smith went to Washington.', 'He arrived at 3 p.m. on Friday.']],
    ['J. R. R. Tolkien wrote it. Pi is 3.14 roughly.', ['J. R. R. Tolkien wrote it.', 'Pi is 3.14 roughly.']],
    ['“Stop!” she said. Then she left.', ['“Stop!” she said.', 'Then she left.']],
    ['He paused... then continued. Wait… What was that?', ['He paused... then continued.', 'Wait…', 'What was that?']],
    ['Visit https://example.com/a.b?x=1. Email me at jo.doe@mail.co.uk for more.', ['Visit https://example.com/a.b?x=1.', 'Email me at jo.doe@mail.co.uk for more.']],
    ['1. Preheat the oven. 2. Mix the flour.', ['1. Preheat the oven.', '2. Mix the flour.']],
    ['She lives in the U.S. The rent is high.', ['She lives in the U.S.', 'The rent is high.']],
    ['The U.S. Army arrived.', ['The U.S. Army arrived.']],
    ['See Fig. 3 and p. 12 for details.', ['See Fig. 3 and p. 12 for details.']],
    ['Bring pens, paper, etc. We start Jan. 5 at No. 10 Main St. downtown.', ['Bring pens, paper, etc.', 'We start Jan. 5 at No. 10 Main St. downtown.']],
    ['We met Dr. Who, i.e. the Doctor, e.g. a Time Lord.', ['We met Dr. Who, i.e. the Doctor, e.g. a Time Lord.']],
    ['He said "Go." She went.', ['He said "Go."', 'She went.']],
    ['', []],
  ];
  it.each(cases)('%s', (input, expected) => {
    expect(splitSentences(input)).toEqual(expected);
  });
});

describe('splitClauses', () => {
  const cases: [string, string[]][] = [
    ['I bought apples, pears, and plums.', ['I bought apples, pears, and plums.']],
    ['I bought apples, pears, and plums, but she wanted grapes instead.', ['I bought apples, pears, and plums,', 'but she wanted grapes instead.']],
    ['Although it rained all day, we walked to the old harbor.', ['Although it rained all day,', 'we walked to the old harbor.']],
    ['She called her brother, who had moved to Ohio last spring.', ['She called her brother,', 'who had moved to Ohio last spring.']],
    ['He saved 1,000 dollars, and then he spent it all at once.', ['He saved 1,000 dollars,', 'and then he spent it all at once.']],
    ['It was late; the trains had stopped running for the night.', ['It was late;', 'the trains had stopped running for the night.']],
    ['The plan had one flaw: nobody had checked the weather forecast.', ['The plan had one flaw:', 'nobody had checked the weather forecast.']],
    ['My sister — the one in Ohio — called.', ['My sister — the one in Ohio — called.']],
    ['My sister — the one in Ohio — finally called me back.', ['My sister — the one in Ohio —', 'finally called me back.']],
    ['He wanted to go, for example to Rome, but money was tight.', ['He wanted to go, for example to Rome,', 'but money was tight.']],
    ['She said, "I will come, but only if you cook," and smiled.', ['She said, "I will come, but only if you cook," and smiled.']],
    ['The results (which surprised everyone in the lab) were published quickly.', ['The results (which surprised everyone in the lab)', 'were published quickly.']],
    ['Yes, and no.', ['Yes, and no.']],
    ['He ran, and she followed.', ['He ran, and she followed.']],
  ];
  it.each(cases)('%s', (input, expected) => {
    expect(splitClauses(input)).toEqual(expected);
  });

  it('clauses always reassemble to the original sentence', () => {
    const s = 'Although it rained all day, we walked to the old harbor; nobody, not even the dog, complained.';
    expect(splitClauses(s).join(' ')).toBe(s);
  });
});
