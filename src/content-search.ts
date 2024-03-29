import { ScAddr, ScTemplateResult, ScTemplateTriple, ScType } from "ts-sc-client";
import { SCgObjectState } from "./objects-model";


export abstract class SCgSearcher {
    abstract searchContent(keyElements?: ScAddr[]): Promise<boolean>;
    abstract initAppendRemoveElementsUpdate(): Promise<void>;
    abstract destroyAppendRemoveElementsUpdate(): Promise<void>;
}

type SceneTriple = {
    connectorFromScene: ScAddr;
    sceneElement: ScAddr;
    sceneElementState: SCgObjectState;
    sceneElementType: ScType;
};

export class DefaultSCgSearcher extends SCgSearcher {
    maxSCgTriplesNumber = 300;
    constructor() {
        super()
        sandbox.layout = (scene) => scene.layout();
        sandbox.postLayout = (scene) => scene.updateRender();
    }

    splitArray(result: any[], maxNumberOfTriplets: number) {
        if (result.length < maxNumberOfTriplets) return result;
        return result.splice(0, maxNumberOfTriplets);
    }

    filterTriples(triples: SceneTriple[], filterList: ScAddr[] | null) {
        triples = triples.filter(triple => triple.sceneElementType.isEdge());
        if (filterList) triples = triples.filter(
            triple => !filterList.some(element => element.equal(triple.sceneElement)));
        triples = this.splitArray(triples, this.maxSCgTriplesNumber);
        return triples;
    }

    async searchStructureElements(toFilter = false) {
        let scTemplate = new sc.ScTemplate();
        scTemplate.triple(
            sandbox.addr,
            [ScType.EdgeAccessVarPosPerm, "_edge_from_scene"],
            [ScType.Unknown, "_scene_element"],
        );
        let triples = (await scClient.templateSearch(scTemplate)).map((triple: ScTemplateResult) => {
            return {
                connectorFromScene: triple.get("_edge_from_scene"),
                sceneElement: triple.get("_scene_element"),
                sceneElementState: SCgObjectState.FromMemory,
            };
        });
        const sceneElementTypes = await scClient.checkElements(triples.map(triple => triple.sceneElement));
        triples = triples.map((triple, index) => {
            return { sceneElementType: sceneElementTypes[index], ...triple } as SceneTriple;
        });
        if (toFilter) triples = this.filterTriples(triples, null);
        if (!triples.length) return false;

        for (let i = 0; i < triples.length; ++i) {
            const triple = triples[i];
            sandbox.eventStructUpdate(triple);
        }

        return true;
    }

    async initAppendRemoveElementsUpdate() {
        const addArcEventRequest = new sc.ScEventParams(
            sandbox.addr,
            sc.ScEventType.AddOutgoingEdge,
            async (elAddr, edge, otherAddr) => {
                if (!sandbox.eventStructUpdate) return;
                const type = (await scClient.checkElements([edge]))[0];
                if (!type.equal(sc.ScType.EdgeAccessConstPosPerm)) return;

                sandbox.eventStructUpdate({
                    connectorFromScene: edge,
                    sceneElement: otherAddr,
                    sceneElementState: SCgObjectState.MergedWithMemory
                });
            });
        const removeArcEventRequest = new sc.ScEventParams(
            sandbox.addr,
            sc.ScEventType.RemoveOutgoingEdge,
            async (elAddr, edge, otherAddr) => {
                if (!sandbox.eventStructUpdate) return;
                if (await window.scHelper.checkEdge(elAddr.value, sc.ScType.EdgeAccessConstPosPerm, otherAddr.value)) return;

                sandbox.eventStructUpdate({
                    connectorFromScene: edge,
                    sceneElement: otherAddr,
                    sceneElementState: SCgObjectState.RemovedFromMemory
                });
            });
        [self.addArcEvent, self.removeArcEvent] = await window.scClient.eventsCreate([addArcEventRequest, removeArcEventRequest]);
    }

    async destroyAppendRemoveElementsUpdate() {
        let events = [];
        if (self.addArcEvent) events.push(self.addArcEvent);
        if (self.removeArcEvent) events.push(self.removeArcEvent);
        await window.scClient.eventsDestroy(events);
    }

    async searchContent(): Promise<boolean> {
        const status = await this.searchStructureElements(true);
        if (status) return status;

        return await this.searchStructureElements(false);
    }
}

export class DistanceBasedSCgSearcher extends SCgSearcher {
    addArcEvent;
    removeArcEvent;
    newElements;
    appendUpdateDelayTime;
    constructor() {
        super()
        let self = this;
        this.addArcEvent = null;
        this.removeArcEvent = null;
        this.newElements = [];
        this.appendUpdateDelayTime = 200;
    }


    async searchAllElements() {
        let scTemplate = new sc.ScTemplate();
        scTemplate.triple(
            sandbox.addr,
            [sc.ScType.EdgeAccessVarPosPerm, "_edge_from_scene"],
            [sc.ScType.Unknown, "_scene_element"],
        );
        return new Set((await scClient.templateSearch(scTemplate)).map((triple) => triple.get("_scene_element").value));
    }

    async searchFromKeyElements(keyElements? : ScAddr[], state = SCgObjectState.FromMemory) {
        let visitedElements = new Set();

        if (keyElements) {
            await this.verifyStructureElements(sandbox.addr, keyElements)
        }
        else {
            await window.scHelper.getStructureMainKeyElements(sandbox.addr);
            keyElements = await window.scHelper.getStructureKeyElements(sandbox.addr);
            return visitedElements;
        }
        const elementTypes = await scClient.checkElements(keyElements.map(triple => triple.structureElement));

        let mainElements = {};
        for (let i = 0; i < keyElements.length; ++i) {
            const triple = keyElements[i];
            const edgeFromScene = triple.connectorFromStructure;
            const sceneElement = triple.structureElement;
            const sceneElementType = elementTypes[i];
            const level = SCgObjectLevel.First;

            mainElements[sceneElement.value] = {
                connectorFromScene: edgeFromScene,
                type: sceneElementType,
                state: state,
                level: level,
            };

            sandbox.eventStructUpdate({
                connectorFromScene: edgeFromScene,
                sceneElement: sceneElement,
                sceneElementType: sceneElementType,
                sceneElementState: state,
                sceneElementLevel: level,
            });
        }

        await searchAllLevelEdges([mainElements], visitedElements, new Set());
        return visitedElements;
    };

    async searchAllLevelEdges(elementsArr, visitedElements, tracedElements) {
        let newElementsArr = [];
        for (let i = 0; i < elementsArr.length; i++) {
            let levelElements = elementsArr[i];
            for (let elementHash in levelElements) {
                elementHash = parseInt(elementHash);
                if (visitedElements.has(elementHash)) continue;
                visitedElements.add(elementHash);

                const element = new sc.ScAddr(elementHash);

                const [edgeFromScene, elementType, state, level] = Object.values(levelElements[elementHash]);
                const nextLevel = level >= SCgObjectLevel.Count - 1 ? SCgObjectLevel.Count - 1 : level + 1;

                const searchFunc = elementType.isEdge() ? searchLevelEdgeElementsEdges : searchLevelNodeEdges;
                const newElements = await searchFunc(
                    edgeFromScene, element, elementType, state, level, nextLevel, tracedElements);
                if (Object.keys(newElements).length) newElementsArr.push(newElements);
            }
        }

        if (newElementsArr.length) await searchAllLevelEdges(newElementsArr, visitedElements, tracedElements);
    };

    async searchLevelNodeEdges(
        edgeFromScene, mainElement, mainElementType, state, level, nextLevel, tracedElements) {
        let nextLevelElements = {};

        await searchLevelEdgesByDirection(
            edgeFromScene, mainElement, mainElementType,
            state, level, nextLevel, nextLevelElements, tracedElements, true
        );
        await searchLevelEdgesByDirection(
            edgeFromScene, mainElement, mainElementType,
            state, level, nextLevel, nextLevelElements, tracedElements, false
        );

        return nextLevelElements;
    };

    async searchLevelEdgeElementsEdges(
        edgeFromScene, mainElement, mainElementType, state, level, nextLevel, tracedElements) {
        let nextLevelElements = {};

        await searchLevelConnectorElements(
            edgeFromScene, mainElement, mainElementType,
            state, level, nextLevel, nextLevelElements, tracedElements
        );
        await searchLevelEdgesByDirection(
            edgeFromScene, mainElement, mainElementType,
            state, level, nextLevel, nextLevelElements, tracedElements, true
        );
        await searchLevelEdgesByDirection(
            edgeFromScene, mainElement, mainElementType,
            state, level, nextLevel, nextLevelElements, tracedElements, false
        );

        return nextLevelElements;
    };

    async searchLevelConnectorElements(
        edgeFromScene, mainElement, mainElementType,
        state, level, nextLevel, nextLevelElements, tracedElements
    ) {
        const mainElementHash = mainElement.value;
        if (tracedElements.has(mainElementHash)) return;
        tracedElements.add(mainElementHash);

        let sourceElement, targetElement;
        if (edgeFromScene) {
            [sourceElement, targetElement] = await window.scHelper.getConnectorElements(mainElement);
        } else {
            let scTemplateSearchEdgeElements = new sc.ScTemplate();
            scTemplateSearchEdgeElements.tripleWithRelation(
                [sc.ScType.Unknown, "_source"],
                mainElement,
                [sc.ScType.Unknown, "_target"],
                [sc.ScType.EdgeAccessVarPosPerm, "_edge_from_scene"],
                sandbox.addr,
            );
            const result = await scClient.templateSearch(scTemplateSearchEdgeElements);
            if (!result.length) return;
            [sourceElement, targetElement] = [result[0].get("_source"), result[0].get("_target")];
            edgeFromScene = result[0].get("_edge_from_scene");
        }
        [sourceElementType, targetElementType] = await scClient.checkElements([sourceElement, targetElement]);

        const sourceElementHash = sourceElement.value;
        nextLevelElements[sourceElementHash] = {
            connectorFromScene: null, type: sourceElementType, state: state, level: nextLevel
        };

        const targetElementHash = targetElement.value;
        nextLevelElements[targetElementHash] = {
            connectorFromScene: null, type: targetElementType, state: state, level: nextLevel
        };

        sandbox.eventStructUpdate({
            connectorFromScene: edgeFromScene,
            sceneElement: mainElement,
            sceneElementState: state,
            sceneElementType: mainElementType,
            sceneElementLevel: level,
            sceneElementSource: sourceElement,
            sceneElementSourceType: sourceElementType,
            sceneElementSourceLevel: nextLevel,
            sceneElementTarget: targetElement,
            sceneElementTargetType: targetElementType,
            sceneElementTargetLevel: nextLevel,
        });
    };

    async searchLevelEdgesByDirection(
        edgeFromScene, mainElement, mainElementType,
        state, level, nextLevel, nextLevelElements, tracedElements, withIncomingEdge) {
        let scTemplate = new sc.ScTemplate();
        scTemplate.triple(
            sandbox.addr,
            [sc.ScType.EdgeAccessVarPosPerm, "_edge_from_scene"],
            [sc.ScType.Unknown, "_scene_edge"],
        );
        if (withIncomingEdge) {
            scTemplate.triple(
                [sc.ScType.Unknown, "_scene_edge_source"],
                "_scene_edge",
                mainElement,
            );
        } else {
            scTemplate.triple(
                mainElement,
                "_scene_edge",
                [sc.ScType.Unknown, "_scene_edge_target"],
            );
        }
        const constructions = await scClient.templateSearch(scTemplate);

        const sceneEdgeTypes = await scClient.checkElements(
            constructions.map(triple => triple.get("_scene_edge")));
        const sceneEdgeElementTypes = await scClient.checkElements(
            constructions.map(triple => withIncomingEdge
                ? triple.get("_scene_edge_source") : triple.get("_scene_edge_target")));

        for (let i = 0; i < constructions.length; ++i) {
            const construction = constructions[i];

            edgeFromScene = construction.get("_edge_from_scene");

            const sceneEdge = construction.get("_scene_edge");
            const sceneEdgeHash = sceneEdge.value;
            const sceneEdgeType = sceneEdgeTypes[i];

            const sceneEdgeElement = withIncomingEdge
                ? construction.get("_scene_edge_source")
                : construction.get("_scene_edge_target");
            // if we searched scene structure we'll skip it
            if (sceneEdgeElement.equal(sandbox.addr)) continue;

            if (tracedElements.has(sceneEdgeHash)) continue;
            tracedElements.add(sceneEdgeHash);
            nextLevelElements[sceneEdgeHash] = {
                connectorFromScene: edgeFromScene, type: sceneEdgeType, state: state, level: nextLevel
            };

            const sceneEdgeElementHash = sceneEdgeElement.value;
            const sceneEdgeElementType = sceneEdgeElementTypes[i];
            nextLevelElements[sceneEdgeElementHash] = {
                connectorFromScene: null, type: sceneEdgeElementType, state: state, level: nextLevel
            };

            sandbox.eventStructUpdate({
                connectorFromScene: edgeFromScene,
                sceneElement: sceneEdge,
                sceneElementType: sceneEdgeType,
                sceneElementState: state,
                sceneElementLevel: nextLevel,
                sceneElementSource: withIncomingEdge ? sceneEdgeElement : mainElement,
                sceneElementSourceType: withIncomingEdge ? sceneEdgeElementType : mainElementType,
                sceneElementSourceLevel: withIncomingEdge ? nextLevel : level,
                sceneElementTarget: withIncomingEdge ? mainElement : sceneEdgeElement,
                sceneElementTargetType: withIncomingEdge ? mainElementType : sceneEdgeElementType,
                sceneElementTargetLevel: withIncomingEdge ? level : nextLevel,
            });
        }
    };

    async verifyStructureElements(structure, elements) {
        let structureElements = [];
        for (let element of elements) {
            let template = new sc.ScTemplate();
            template.triple(
                structure,
                [sc.ScType.EdgeAccessVarPosPerm, "_edge_from_scene"],
                [element, "_main_node"]
            );

            let result = await scClient.templateSearch(template);
            if (!result.length) continue;
            const triple = result[0];
            structureElements.push({
                connectorFromStructure: triple.get("_edge_from_scene"),
                structureElement: triple.get("_main_node")
            });
        }

        return structureElements;
    };

    const debounceBufferedFunc = (func, wait) => {
        let timerId;

        const clear = () => {
            clearTimeout(timerId);
        };

        const debouncedBufferedCall = (elements) => {
            clear();
            timerId = setTimeout(() => {
                func(elements.splice(0, elements.length));
            }, wait);
        };

        return [debouncedBufferedCall, clear];
    };

    async searchElementsFromElements(elements) {
        const state = SCgObjectState.MergedWithMemory;

        let elementTypes = await scClient.checkElements(elements);
        const edges = elements.filter((triple, index) => elementTypes[index].isEdge());

        let structureElements = new Set();
        let connectorElements = new Set();
        for (let element of edges) {
            const [source, target] = await window.scHelper.getConnectorElements(element);
            const [sourceHash, targetHash] = [source.value, target.value];
            if (!connectorElements.has(sourceHash) && sandbox.scene.getObjectByScAddr(sourceHash)) {
                connectorElements.add(sourceHash);
            }
            if (!connectorElements.has(targetHash) && sandbox.scene.getObjectByScAddr(targetHash)) {
                connectorElements.add(targetHash);
            }
            structureElements.add(targetHash);
        }

        const sceneElements = sandbox.scene.getScAddrs().map(hash => parseInt(hash));
        let unvisitableElements = new Set(sceneElements.filter(hash => !connectorElements.has(hash)));

        connectorElements = Array.from(connectorElements).sort(
            (a, b) => sandbox.scene.getObjectByScAddr(a).level < sandbox.scene.getObjectByScAddr(b).level ? -1 : 1);

        let mainElements = {};
        for (let elementHash of connectorElements) {
            const object = sandbox.scene.getObjectByScAddr(elementHash);
            mainElements[elementHash] = {
                connectorFromScene: new sc.ScAddr(elementHash),
                type: new sc.ScType(object.sc_type),
                state: state,
                level: object.level,
            };
            await searchAllLevelEdges([mainElements], unvisitableElements, new Set(unvisitableElements));
            mainElements = {};
        }

        structureElements = new Set(Array.from(structureElements).filter(hash => !unvisitableElements.has(hash)));
        while (structureElements.size) {
            const [anyElement] = structureElements;
            const keyElements = [new sc.ScAddr(anyElement)];
            const visitedElements = await searchFromKeyElements(keyElements, state);
            if (!visitedElements.size) return;
            structureElements = new Set(
                Array.from(structureElements).filter(hash => !visitedElements.has(hash)));
        }
    };

    const [debouncedAppendElementsUpdate] = debounceBufferedFunc(searchElementsFromElements, this.appendUpdateDelayTime);

    async appendElementsUpdate(elAddr, edge, otherAddr) {
        if (!sandbox.eventStructUpdate) return;
        const type = (await scClient.checkElements([edge]))[0];
        if (!type.equal(sc.ScType.EdgeAccessConstPosPerm)) return;

        self.newElements.push(otherAddr);
        debouncedAppendElementsUpdate(self.newElements);
    };

    async removeElementsUpdate(elAddr, edge, otherAddr) {
        if (!sandbox.eventStructUpdate) return;
        if (await window.scHelper.checkEdge(elAddr.value, sc.ScType.EdgeAccessConstPosPerm, otherAddr.value)) return;

        sandbox.eventStructUpdate({
            connectorFromScene: edge,
            sceneElement: otherAddr,
            sceneElementState: SCgObjectState.RemovedFromMemory,
        });
    }

    async initAppendRemoveElementsUpdate() {
        [self.addArcEvent, self.removeArcEvent] = await window.scClient.eventsCreate(
            [new sc.ScEventParams(
                sandbox.addr,
                sc.ScEventType.AddOutgoingEdge,
                appendElementsUpdate
            ), new sc.ScEventParams(
                sandbox.addr,
                sc.ScEventType.RemoveOutgoingEdge,
                removeElementsUpdate
            )]
        );
    };

    async destroyAppendRemoveElementsUpdate() {
        let events = [];
        if (self.addArcEvent) events.push(self.addArcEvent);
        if (self.removeArcEvent) events.push(self.removeArcEvent);
        await window.scClient.eventsDestroy(events);
    };

    
    async searchContent(keyElements) {
            sandbox.layout = (scene) => keyElements ? scene.updateRender() : scene.layout();
            sandbox.postLayout = (scene) => keyElements ? scene.layout() : scene.updateRender();
            sandbox.onceUpdatableObjects = {};

            let status = false;
            let structureElements = await this.searchAllElements();
            while (structureElements.size) {
                const visitedElements = await this.searchFromKeyElements(keyElements);
                if (!status) status = visitedElements.size > 0;
                if (!status) return status;
                structureElements = new Set(
                    Array.from(structureElements).filter(hash => !visitedElements.has(hash)));
                const [anyElement] = structureElements;
                keyElements = [new sc.ScAddr(anyElement)];
            }

            return status;
        }
};

class SCgLinkContentSearcher extends SCgSearcher {
    contentBucket: never[];
    contentBucketSize: number;
    appendContentTimeoutId: number;
    appendContentTimeout: number;

    constructor(sandbox, linkAddr) {
    super()
    let self = this;
    this.contentBucket = [];
    this.contentBucketSize = 20;
    this.appendContentTimeoutId = 0;
    this.appendContentTimeout = 2;
    }
    async forceAppendData(oldBucket) {
        for (let content of oldBucket) {
            await sandbox.eventDataAppend(content.data);
        }
    };

    async sliceAndForceAppendData() {
        const oldBucket = this.contentBucket.slice();
        this.contentBucket = [];
        await forceAppendData(await scClient.getLinkContents(oldBucket));
    };

    async searchContent(element) {
        this.contentBucket.push(element);
        if (this.appendContentTimeoutId) clearTimeout(self.appendContentTimeoutId);

        if (self.contentBucket.length > self.contentBucketSize) {
            clearTimeout(self.appendContentTimeoutId);
            await sliceAndForceAppendData();
        }
        else {
            this.appendContentTimeoutId = setTimeout(sliceAndForceAppendData, self.appendContentTimeout);
        }

        return true;
    };

    async initAppendRemoveElementsUpdate() {
        [this.addArcEvent, self.removeArcEvent] = await window.scClient.eventsCreate(
            [new sc.ScEventParams(
                sandbox.addr,
                sc.ScEventType.AddOutgoingEdge,
                appendElementsUpdate
            ), new sc.ScEventParams(
                sandbox.addr,
                sc.ScEventType.RemoveOutgoingEdge,
                removeElementsUpdate
            )]
        );
    };

    async destroyAppendRemoveElementsUpdate() {
        let events = [];
        if (self.addArcEvent) events.push(self.addArcEvent);
        if (self.removeArcEvent) events.push(self.removeArcEvent);
        await window.scClient.eventsDestroy(events);
    };


}
