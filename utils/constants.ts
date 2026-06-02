// React DevTools encodes tree mutations as flat number arrays.
// Layout: [rendererID, rootFiberID, stringTableSize, ...stringTable, ...operations]
// See: https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/devtools/store.js

export const enum TreeOperation {
    Add = 1,
    Remove = 2,
    ReorderChildren = 3,
    UpdateTreeBaseDuration = 4,
    UpdateErrorsOrWarnings = 5,
    SetSubtreeMode = 6,
    // Suspense tree operations (React DevTools main branch)
    SuspenseAdd = 8,    // [id, parentID, nameStringID, isSuspended, numRects, ...4*numRects]
    SuspenseRemove = 9, // [count, ...count_ids]
}

export const HEADER_SIZE = 3; // rendererID + rootFiberID + stringTableSize
