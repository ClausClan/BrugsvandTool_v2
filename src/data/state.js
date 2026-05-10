export const state = {
    sC: 0,
    rC: 0,
    tC: 0,
    nodes: [{id: "Beholder", type: "beholder"}],
    links: [],
    sim: null,
    reparentingNode: null,
    connectingNodeInfo: null,
    selectedNodes: new Set(),
    lastModel: null,
    lastConfig: null,
    useNames: false,
    customTapsteder: {},
    names: new Map(),
    clipboard: null,
    movingBranch: null,
    isAutoSavingEnabled: true
};

export const gridSize = 10;

export let projektErÆndret = false;

export function setProjektErÆndret(value = true) {
    projektErÆndret = value;
}
