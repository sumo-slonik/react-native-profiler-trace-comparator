import {extractComponentNamesFromOperations} from '../utils/operationsParser';

// Helpers to build synthetic ops buffers
// Header: [rendererID=1, rootFiberID=1, stringTableSize]
const RENDERER_ID = 1;
const ROOT_FIBER_ID = 1;

const encodeString = (s: string): number[] => [s.length, ...s.split('').map(c => c.charCodeAt(0))];

const buildOps = (strings: string[], ops: number[]): number[] => {
    const encodedStrings = strings.flatMap(encodeString);
    return [RENDERER_ID, ROOT_FIBER_ID, encodedStrings.length, ...encodedStrings, ...ops];
};

// ADD op: [1, fiberID, elementType, parentID, ownerID, displayNameIdx, keyIdx, compiledWithForget]
const addOp = (fiberID: number, displayNameIdx: number, elementType = 2, parentID = 0, ownerID = 0, keyIdx = 0): number[] =>
    [1, fiberID, elementType, parentID, ownerID, displayNameIdx, keyIdx, 0];

// ADD op for root element (elementType=11, no displayName used)
const rootAddOp = (fiberID: number): number[] =>
    [1, fiberID, 11, 0, 0, 0, 0, 0];

describe('extractComponentNamesFromOperations', () => {

    describe('string table parsing', () => {
        it('returns empty map for empty operations array', () => {
            expect(extractComponentNamesFromOperations([])).toEqual(new Map());
        });

        it('returns empty map when ops buffer is too short', () => {
            expect(extractComponentNamesFromOperations([[1, 1]])).toEqual(new Map());
        });

        it('extracts a single component name', () => {
            const ops = buildOps(['MyComponent'], [...addOp(42, 1)]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.get(42)).toBe('MyComponent');
        });

        it('handles multiple strings in the table', () => {
            const strings = ['Alpha', 'Beta', 'Gamma'];
            const ops = buildOps(strings, [
                ...addOp(1, 1),
                ...addOp(2, 2),
                ...addOp(3, 3),
            ]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.get(1)).toBe('Alpha');
            expect(result.get(2)).toBe('Beta');
            expect(result.get(3)).toBe('Gamma');
        });

        it('skips displayNameIdx=0 (no name)', () => {
            const ops = buildOps(['SomeName'], [...addOp(99, 0)]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.has(99)).toBe(false);
        });

        it('handles empty string table (no ADD ops)', () => {
            const ops = buildOps([], [4, 10, 500]); // only UpdateTreeBaseDuration
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.size).toBe(0);
        });

        it('handles multi-character unicode component names', () => {
            const name = 'Ünïcödé';
            const ops = buildOps([name], [...addOp(7, 1)]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.get(7)).toBe(name);
        });
    });

    describe('ADD op (opcode 1)', () => {
        it('maps fiberID to display name', () => {
            const ops = buildOps(['Button'], [...addOp(100, 1)]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.get(100)).toBe('Button');
        });

        it('does not map root element (elementType=11)', () => {
            const ops = buildOps(['Root'], [...rootAddOp(1), ...addOp(2, 1)]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.has(1)).toBe(false);
            expect(result.get(2)).toBe('Root');
        });

        it('last write wins when same fiberID appears twice', () => {
            const ops = buildOps(['First', 'Second'], [
                ...addOp(5, 1),
                ...addOp(5, 2),
            ]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.get(5)).toBe('Second');
        });
    });

    describe('REMOVE op (opcode 2)', () => {
        it('stays aligned after removing multiple fibers', () => {
            // REMOVE 3 fibers, then ADD one more — parser must not drift
            const ops = buildOps(['View'], [
                2, 3, 10, 20, 30, // REMOVE count=3, ids=[10,20,30]
                ...addOp(40, 1),
            ]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.get(40)).toBe('View');
            expect(result.size).toBe(1);
        });

        it('handles REMOVE count=0 without drift', () => {
            const ops = buildOps(['Text'], [
                2, 0, // REMOVE count=0
                ...addOp(1, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(1)).toBe('Text');
        });
    });

    describe('ReorderChildren op (opcode 3)', () => {
        it('stays aligned after reorder', () => {
            const ops = buildOps(['Header'], [
                3, 99, 2, 10, 20, // REORDER fiberID=99, count=2, children=[10,20]
                ...addOp(5, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(5)).toBe('Header');
        });
    });

    describe('UpdateTreeBaseDuration op (opcode 4)', () => {
        it('stays aligned after duration update', () => {
            const ops = buildOps(['Card'], [
                4, 55, 1200, // UpdateTreeBaseDuration fiberID=55, duration=1200
                ...addOp(3, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(3)).toBe('Card');
        });
    });

    describe('UpdateErrorsOrWarnings op (opcode 5)', () => {
        it('stays aligned after errors/warnings update', () => {
            const ops = buildOps(['Modal'], [
                5, 10, 2, 1, // UpdateErrorsOrWarnings fiberID=10, errors=2, warnings=1
                ...addOp(7, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(7)).toBe('Modal');
        });
    });

    describe('SetSubtreeMode op (opcode 6)', () => {
        it('stays aligned after subtree mode change', () => {
            const ops = buildOps(['Screen'], [
                6, 15, 1, // SetSubtreeMode fiberID=15, mode=1
                ...addOp(8, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(8)).toBe('Screen');
        });
    });

    describe('SuspenseAdd op (opcode 8)', () => {
        it('stays aligned after SuspenseAdd with numRects=0', () => {
            const ops = buildOps(['Input'], [
                8, 200, 0, 0, 0, 0, // SuspenseAdd id=200, parentID=0, nameStringID=0, isSuspended=0, numRects=0
                ...addOp(9, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(9)).toBe('Input');
        });

        it('stays aligned after SuspenseAdd with numRects=1', () => {
            const ops = buildOps(['List'], [
                8, 201, 0, 0, 0, 1, 0, 0, 1024000, 768000, // SuspenseAdd numRects=1, rect=[0,0,1024,768]×1000
                ...addOp(10, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(10)).toBe('List');
        });

        it('stays aligned after SuspenseAdd with numRects=2', () => {
            // This is the case found in profiler-test.json that caused the original bug
            const ops = buildOps(['SavedSearchList'], [
                8, 202, 0, 0, 0, 2, 0, 0, 1024000, 0, 72000, 0, 800000, 600000, // numRects=2
                ...addOp(11, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(11)).toBe('SavedSearchList');
        });
    });

    describe('SuspenseRemove op (opcode 9)', () => {
        it('stays aligned after SuspenseRemove with count=1', () => {
            const ops = buildOps(['Footer'], [
                9, 1, 300, // SuspenseRemove count=1, ids=[300]
                ...addOp(12, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(12)).toBe('Footer');
        });

        it('stays aligned after SuspenseRemove with count=3', () => {
            const ops = buildOps(['Sidebar'], [
                9, 3, 301, 302, 303, // SuspenseRemove count=3
                ...addOp(13, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(13)).toBe('Sidebar');
        });
    });

    describe('unknown opcodes', () => {
        it('does not drift on unknown opcodes with 0 operands', () => {
            // Opcode 0 is unknown — parser should consume only the opcode byte
            const ops = buildOps(['Label'], [
                0, // unknown opcode
                ...addOp(20, 1),
            ]);
            expect(extractComponentNamesFromOperations([ops]).get(20)).toBe('Label');
        });
    });

    describe('mixed op sequences', () => {
        it('handles interleaved ops of all types correctly', () => {
            const strings = ['ComponentA', 'ComponentB'];
            const ops = buildOps(strings, [
                9, 1, 500,          // SuspenseRemove count=1
                ...addOp(1, 1),     // ADD ComponentA
                4, 1, 100,          // UpdateTreeBaseDuration
                2, 2, 10, 20,       // REMOVE 2 fibers
                ...addOp(2, 2),     // ADD ComponentB
                8, 600, 0, 0, 0, 0, // SuspenseAdd numRects=0
                5, 30, 0, 1,        // UpdateErrorsOrWarnings
            ]);
            const result = extractComponentNamesFromOperations([ops]);
            expect(result.get(1)).toBe('ComponentA');
            expect(result.get(2)).toBe('ComponentB');
            expect(result.size).toBe(2);
        });
    });

    describe('multiple ops arrays', () => {
        it('merges names across multiple commits', () => {
            const ops1 = buildOps(['Alpha'], [...addOp(1, 1)]);
            const ops2 = buildOps(['Beta'], [...addOp(2, 1)]);
            const result = extractComponentNamesFromOperations([ops1, ops2]);
            expect(result.get(1)).toBe('Alpha');
            expect(result.get(2)).toBe('Beta');
        });

        it('skips ops arrays shorter than HEADER_SIZE', () => {
            const valid = buildOps(['Valid'], [...addOp(1, 1)]);
            const result = extractComponentNamesFromOperations([[1, 1], valid]);
            expect(result.get(1)).toBe('Valid');
        });
    });

    describe('profiler-test.json fixture', () => {
        const fixture = require('../__mocks__/profiler-test.json');
        const operations: number[][] = fixture.dataForRoots[0].operations;

        it('extracts Forget(SavedSearchList) which is mounted during profiling', () => {
            const result = extractComponentNamesFromOperations(operations);
            const names = [...result.values()];
            expect(names).toContain('Forget(SavedSearchList)');
        });

        it('extracts a large number of component names', () => {
            const result = extractComponentNamesFromOperations(operations);
            expect(result.size).toBeGreaterThan(500);
        });

        it('does not produce undefined names', () => {
            const result = extractComponentNamesFromOperations(operations);
            for (const name of result.values()) {
                expect(name).toBeTruthy();
                expect(typeof name).toBe('string');
            }
        });
    });
});
