/**
 * Names people give Topics (issue 366).
 *
 * The Topics slider renumbers Topics at every count, so a name is kept per
 * group of the run's natural Topics (a Topic's `leaves`, joined as "3,7,12"),
 * never per number. A merged or split Topic is another group: it has no name
 * of its own, but shows a hint built from the named groups it holds or sits
 * in, and moving the slider back brings the names back.
 */
import type { TopicModelingTopic } from '@/api';
import { isUngrouped } from './ungrouped';

export type TopicNames = Readonly<Record<string, string>>;

/** Longest name; matches the backend. */
const TOPIC_NAME_MAX_LENGTH = 120;

/** The Topic's group key, or null when it cannot be named (Ungrouped, or unknown groups). */
export function topicGroupKey(topic: Pick<TopicModelingTopic, 'id' | 'leaves'>): string | null {
  if (isUngrouped(topic.id) || !topic.leaves || topic.leaves.length === 0) return null;
  return topic.leaves.join(',');
}

export interface TopicNameDisplay {
  /** The name given to exactly this group. */
  name: string | null;
  /** For an unnamed group: "includes Sleep, Diet" or "part of Sleep". */
  hint: string | null;
}

const leavesOf = (key: string) => new Set(key.split(',').map(Number));

/** What to show for a Topic's name. */
export function topicNameDisplay(
  topic: Pick<TopicModelingTopic, 'id' | 'leaves'>,
  names: TopicNames,
): TopicNameDisplay {
  const key = topicGroupKey(topic);
  if (key === null) return { name: null, hint: null };
  const own = names[key];
  if (own) return { name: own, hint: null };
  const group = leavesOf(key);
  const included: string[] = [];
  const containing: string[] = [];
  for (const [otherKey, name] of Object.entries(names)) {
    const other = leavesOf(otherKey);
    if ([...other].every((leaf) => group.has(leaf))) included.push(name);
    else if ([...group].every((leaf) => other.has(leaf))) containing.push(name);
  }
  if (included.length > 0) return { name: null, hint: `includes ${included.join(', ')}` };
  if (containing.length > 0) return { name: null, hint: `part of ${containing.join(', ')}` };
  return { name: null, hint: null };
}

/** The names with this Topic's name set, or removed when empty. */
export function withTopicName(names: TopicNames, key: string, name: string): TopicNames {
  const trimmed = name.trim();
  const others = Object.fromEntries(Object.entries(names).filter(([other]) => other !== key));
  return trimmed ? { ...others, [key]: trimmed } : others;
}

/** A local check before saving: too long, or a name the app uses itself. */
export function topicNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length > TOPIC_NAME_MAX_LENGTH) {
    return `Use at most ${String(TOPIC_NAME_MAX_LENGTH)} characters.`;
  }
  if (/^(topic\s*\d+|t\d+|ungrouped)$/i.test(trimmed)) {
    return 'Choose a name that is not a Topic number or Ungrouped.';
  }
  return null;
}
