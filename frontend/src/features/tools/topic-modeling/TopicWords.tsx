import { Fragment } from 'react';
import type { TopicWord } from './api';

export function TopicWords({
  words,
  highlighted,
}: {
  words: TopicWord[];
  highlighted?: Set<string>;
}) {
  return (
    <>
      {words.map((term, index) => (
        <Fragment key={term.word}>
          {index > 0 ? ', ' : ''}
          {highlighted?.has(term.word) ? <mark>{term.word}</mark> : term.word}
        </Fragment>
      ))}
    </>
  );
}
