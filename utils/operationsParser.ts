import {TreeOperation, HEADER_SIZE} from "./constants";

/**
 * Extracts fiber ID → component display name mappings from React DevTools
 * profiler `operations` arrays.
 *
 * **Why this is needed:**
 * The profiler `snapshots` field only captures components present in the tree
 * when profiling started. Components mounted *during* the profiling session
 * (e.g. after a navigation or conditional render) are recorded exclusively in
 * the `operations` log. Without parsing operations, those components are
 * invisible to the analysis.
 *
 * **Input format (per operation array):**
 * Each `number[]` is a flat buffer encoding a batch of tree mutations for one
 * commit. The layout is:
 *
 * ```
 * [ rendererID, rootFiberID, stringTableSize,
 *   // — string table (stringTableSize integers) —
 *   charCount₁, ...charCodes₁,   // string at 1-based index 1
 *   charCount₂, ...charCodes₂,   // string at 1-based index 2
 *   ...
 *   // — operations —
 *   opCode, ...operands,
 *   opCode, ...operands,
 *   ... ]
 * ```
 *
 * Display names are stored in the string table and referenced by 1-based index
 * from ADD operations (index 0 means "no name").
 *
 * @see https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/devtools/store.js
 */

const createOpsReader = (buf: number[], startPos: number) => {
    let pos = startPos;
    return {
        hasMore: (upTo: number = buf.length) => pos < upTo,
        next: () => buf[pos++],
        skip: (count: number) => { pos += count; },
    };
};

const parseStringTable = (ops: number[]): string[] => {
    const tableSize = ops[2];
    const strings: string[] = [];
    const reader = createOpsReader(ops, HEADER_SIZE);

    while (reader.hasMore(HEADER_SIZE + tableSize)) {
        const charCount = reader.next();
        const chars: number[] = [];
        for (let j = 0; j < charCount; j++) {
            chars.push(reader.next());
        }
        strings.push(String.fromCharCode(...chars));
    }

    return strings;
};

const resolveString = (index: number, table: string[]): string | null => {
    if (index > 0 && index <= table.length) {
        return table[index - 1];
    }
    return null;
};

export const extractComponentNamesFromOperations = (operations: number[][]): Map<number, string> => {
    const nameMap = new Map<number, string>();

    for (const ops of operations) {
        if (ops.length < HEADER_SIZE) continue;

        const stringTable = parseStringTable(ops);
        const opsStart = HEADER_SIZE + ops[2];
        const reader = createOpsReader(ops, opsStart);

        while (reader.hasMore()) {
            const opType = reader.next();

            switch (opType) {
                case TreeOperation.Add: {
                    const fiberId = reader.next();
                    reader.skip(3); // type, parentID, ownerID
                    const displayNameIdx = reader.next();
                    reader.skip(2); // keyStringID, compiledWithForget

                    const name = resolveString(displayNameIdx, stringTable);
                    if (name) {
                        nameMap.set(fiberId, name);
                    }
                    break;
                }
                case TreeOperation.Remove: {
                    const removedCount = reader.next();
                    reader.skip(removedCount);
                    break;
                }
                case TreeOperation.ReorderChildren: {
                    reader.skip(1); // fiberID
                    const childCount = reader.next();
                    reader.skip(childCount);
                    break;
                }
                case TreeOperation.UpdateTreeBaseDuration:
                    reader.skip(2); // fiberID, duration
                    break;
                case TreeOperation.UpdateErrorsOrWarnings:
                    reader.skip(3); // fiberID, errors, warnings
                    break;
                case TreeOperation.SetSubtreeMode:
                    reader.skip(2); // fiberID, mode
                    break;
                case TreeOperation.SuspenseAdd: {
                    reader.skip(4); // id, parentID, nameStringID, isSuspended
                    const numRects = reader.next();
                    if (numRects > 0) {
                        reader.skip(numRects * 4); // x, y, width, height per rect (×1000 encoded)
                    }
                    break;
                }
                case TreeOperation.SuspenseRemove: {
                    const suspenseCount = reader.next();
                    reader.skip(suspenseCount);
                    break;
                }
                default:
                    break;
            }
        }
    }

    return nameMap;
};
