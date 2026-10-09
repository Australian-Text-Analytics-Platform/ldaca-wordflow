/** Width-aware Unicode wrapping keeps CJK and surrogate pairs intact. */
export function wrapFigureText(text: string, columns: number) {
  const lines: string[] = [];
  let line = '';
  let width = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    text,
  )) {
    const advance =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(
        segment,
      )
        ? 2
        : 1;
    if (width + advance > columns && line) {
      lines.push(line);
      line = '';
      width = 0;
    }
    line += segment;
    width += advance;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}
