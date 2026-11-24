// EZD-1906a (editor plan R1, R2, R9): one place for comparing object ids. Ids are compared without case everywhere in
// the editor (a stored key may differ in case from an id in a change), so maps and sets key on `idKey`.

/** The key an id is stored and compared under: the id without case. */
export const idKey = (id: string): string => id.toLowerCase();

/** True when two ids name the same object, case aside. */
export const sameId = (a: string, b: string): boolean => idKey(a) === idKey(b);

/**
 * True when two id lists hold the same ids in the same order, compared exactly (case included). This is the change
 * check the controllers use to skip a notification when nothing moved, so a list that changed only in case still
 * counts as changed.
 */
export const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);
