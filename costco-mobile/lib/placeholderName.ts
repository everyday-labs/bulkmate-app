// Shown in greetings before a user has set a real first name in their
// profile — deliberately silly, clearly-fake placeholder names (in the
// spirit of "Jane Doe") rather than a name mangled out of their email
// address (e.g. "Balajicdevices"). All entries here must stay friendly and
// unoffensive — this rotates for anonymous/unnamed users, so nothing here
// should read as a joke at anyone's expense.
const PLACEHOLDER_NAMES = [
  'Jamie Doe',
  'Alex Sprout',
  'Sam Sterling',
  'Robin Sparks',
  'Casey Wells',
  'Morgan Blue',
];

// Stable per user (hashed from their id) so the same anonymous user keeps
// the same placeholder across app opens, rather than a new one every time —
// only changes once they set a real name.
export function placeholderNameFor(userId: string | null | undefined): string {
  if (!userId) return PLACEHOLDER_NAMES[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_NAMES[hash % PLACEHOLDER_NAMES.length];
}
