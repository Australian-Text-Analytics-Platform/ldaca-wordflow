import { DataType, util, type Field } from 'apache-arrow';

/**
 * Whether two Data Blocks' columns hold the same kind of values, for Stack.
 * Used by: useConcatSubTab's schema check.
 *
 * Arrow's `util.compareTypes` also compares a category (dictionary) column's
 * dictionary id, which IPC numbers by the column's position among the
 * category columns of its table. Changing one column to a category in one
 * Data Block then shifted the ids of every later category column, and Stack
 * listed them all as different types (issue 276). Compare what the column
 * holds instead: value type, index type and ordering, recursively through
 * nested columns.
 */
export function columnTypesMatch(left: DataType, right: DataType): boolean {
  if (DataType.isDictionary(left) || DataType.isDictionary(right)) {
    return (
      DataType.isDictionary(left) &&
      DataType.isDictionary(right) &&
      left.isOrdered === right.isOrdered &&
      columnTypesMatch(left.indices as DataType, right.indices as DataType) &&
      columnTypesMatch(left.dictionary as DataType, right.dictionary as DataType)
    );
  }
  // Arrow types say children is always an array, but simple types carry null.
  const leftChildren = (left.children as Field[] | null) ?? [];
  const rightChildren = (right.children as Field[] | null) ?? [];
  if (leftChildren.length > 0 || rightChildren.length > 0) {
    return (
      left.typeId === right.typeId &&
      leftChildren.length === rightChildren.length &&
      leftChildren.every((child, index) => {
        const other = rightChildren[index];
        if (!other) return false;
        return (
          child.name === other.name &&
          columnTypesMatch(child.type as DataType, other.type as DataType)
        );
      }) &&
      ('listSize' in left ? left.listSize === (right as typeof left).listSize : true)
    );
  }
  return util.compareTypes(left, right);
}
