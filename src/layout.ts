import { Vector3 } from "three";
import { ModelNode, ModelEdge, ModelContour, ModelLink, ModelObject } from "./objects-model";
import d3, { Simulation } from 'd3'
import { SCgScene } from "./scene";
const SCgLayoutObjectType = {
    Node: 0,
    Edge: 1,
    Link: 2,
    Contour: 3,
    DotPoint: 4
};


class LayoutObject {
    x?: number
    y?: number
    object: ModelObject
    type: number
    contour?: ModelContour // sc-addr of contour

    constructor(object: ModelObject, type: number, contour?: ModelContour, x?: number, y?: number) {
        this.x = x;
        this.y = y;
        this.object = object;
        this.type = type;
        this.contour = contour;
    }
}

class LayoutNode extends LayoutObject {
    constructor(public x: number, public y: number, public object: ModelNode, public contour?: ModelContour) {
        super(object, SCgLayoutObjectType.Node, contour, x, y);
    }
}

class LayoutEdge extends LayoutObject {
    source: LayoutObject
    target: LayoutObject
    object: ModelEdge
    constructor(source: LayoutObject, target: LayoutObject, object: ModelEdge, contour?: ModelContour) {
        super(object, SCgLayoutObjectType.Edge, source.contour);
        this.source = source;
        this.target = target;
        this.object = object;
    }
}

class LayoutLink extends LayoutObject {
    constructor(object: ModelLink, contour?: ModelContour, x?: number, y?: number) {
        super(object, SCgLayoutObjectType.Link, contour);
    }
}

//! TODO: is contour in a contour possible?
class LayoutContour extends LayoutObject {
    constructor(object: ModelContour, x: number, y: number, contour?: ModelContour) {
        super(object, SCgLayoutObjectType.Contour, contour, x, y);
    }
}

// a hack to enable edge that is incident to another edge
//! TODO: is a contour definition needed there?
class LayoutDotPoint extends LayoutObject {
    constructor(object: ModelEdge, public isSource: boolean, contour?: ModelContour) {
        super(object, SCgLayoutObjectType.DotPoint, contour)
    }
}

// type LayoutEdge = LayoutObject & {
//     source: LayoutObject
//     target: LayoutObject
//     object: ModelEdge
// }


// Layout algorithms


/**
 * Base layout algorithm
 */

class LayoutAlgorithm {
    constructor(public nodes: LayoutObject[], public edges: LayoutEdge[], public contours: LayoutObject[], public onTickUpdate: Function) {
        this.nodes = nodes;
        this.edges = edges;
        this.contours = contours;
        this.onTickUpdate = onTickUpdate;
    };
    start() {
    }

    stop() {
    }
}


// --------------------------

class ForceBasedLayoutAlgorithm extends LayoutAlgorithm {
    private rect: { width: number, height: number }
    private force?: Simulation<LayoutObject, LayoutEdge>
    constructor(public nodes: LayoutObject[], public edges: LayoutEdge[], public contours: LayoutObject[], public onTickUpdate: Function, rect: { width: number, height: number }) {
        super(nodes, edges, contours, onTickUpdate);
        this.rect = rect;
    }


    destroy() {
        this.stop();
    };
    stop() {
        if (this.force) {
            this.force.stop();
            delete this.force;
            this.force = undefined;
        }

    };

    start() {
        this.stop();

        // init D3 force layout
        const tick = this.onLayoutTick.bind(this);
        // TODO: check how similar is this to the previous behavior. Has been totally refactored
        this.force = d3.forceSimulation(this.nodes)
            .force("center", d3.forceCenter(this.rect.width / 2, this.rect.height / 2))
            .force("friction", d3.forceManyBody().strength(-0.75))
            .force("link", d3.forceLink(this.edges)
                .distance(function (edge: LayoutEdge) {
                    const p1 = edge.source.object.getConnectionPos(edge.object.target.position, edge.object.source_dot);
                    const p2 = edge.target.object.getConnectionPos(edge.object.source.position, edge.object.target_dot);
                    const cd = edge.object.source.position.clone().sub(edge.object.target.position).length();
                    const d = cd - p1.sub(p2).length();

                    if (edge.source.type == SCgLayoutObjectType.DotPoint ||
                        edge.target.type == SCgLayoutObjectType.DotPoint) {
                        return d + 50;
                    }

                    return 100 + d;
                })
                .strength(function (edge: LayoutEdge) {
                    if (edge.source.type == SCgLayoutObjectType.DotPoint ||
                        edge.target.type == SCgLayoutObjectType.DotPoint) {
                        return 1;
                    }

                    return 0.3;
                })).
            force("charge", d3.forceManyBody<LayoutObject>()
                .strength(function (node) {
                    if (node.type == SCgLayoutObjectType.DotPoint) {
                        return 0;
                    } else if (node.type == SCgLayoutObjectType.Link) {
                        return -900;
                    }

                    return -700;
                }))
            .on('tick', function () {
                tick();
            })
    };

    onLayoutTick() {
        let dots: Array<LayoutEdge> = [];
        for (const node of this.nodes) {

            if (node.type === SCgLayoutObjectType.Node) {
                node.object.setPosition(new Vector3(node.x, node.y, 0));
            } else if (node.type === SCgLayoutObjectType.Link) {
                node.object.setPosition(new Vector3(node.x, node.y, 0));
            } else if (node.type === SCgLayoutObjectType.DotPoint) {
                //! TODO: check how does this cast work
                dots.push(<LayoutEdge>node);
            } else if (node.type === SCgLayoutObjectType.Contour) {
                node.object.setPosition(new Vector3(node.x, node.y, 0));
            }
        }

        // setup dot points positions 
        for (let idx in dots) {
            const dot = dots[idx];

            let edge = dot.object.target;
            if (dot.source)
                edge = dot.object.source;

            dot.x = edge.position.x;
            dot.y = edge.position.y;
        }

        this.onTickUpdate();
    };

}
// ------------------------------------

export class LayoutManager {
    algorithm?: LayoutAlgorithm;
    scene: SCgScene;
    // the map key is the contour id
    edges: Map<number, LayoutEdge[]> = new Map();
    nodes: Map<number, LayoutNode[]> = new Map();
    objDict: Map<number, LayoutObject> = new Map();

    constructor(scene: SCgScene) {
        this.scene = scene;
        this.nodes.set(0, []);
        this.edges.set(0, []);
        this.algorithm = new ForceBasedLayoutAlgorithm(this.nodes.get(0)!, this.edges.get(0)!, [], this.onTickUpdate.bind(this), scene.getContainerSize());
    };

    /**
     * Prepare objects for layout
     */
    prepareObjects() {

        // check whether the object is in the contour and push it to the respective map index
        const appendElement = (element: LayoutObject, elements: Map<number, LayoutObject[]>) => {
            const contour = element.contour ? element.contour.sc_addr ?? 0 : 0;
            if (!elements.get(contour)) {
                elements.set(contour, []);
            }
            elements.get(contour)!.push(element);

        }

        // we need to collect objects from scene and build the layout representation for them
        for (const node of this.scene.nodes) {
            const obj = new LayoutNode(
                node.position.x,
                node.position.y,
                node,
                node.contour)
            this.objDict.set(node.id, obj);

            appendElement(obj, this.nodes);
        }

        for (const link of this.scene.links) {
            const obj = new LayoutLink(
                link,
                link.contour,
                link.position.x,
                link.position.y
            )

            this.objDict.set(link.id, obj);

            appendElement(obj, this.nodes);
        }

        for (const contour of this.scene.contours) {

            //! TODO: is contour in a contour possible?
            const obj = new LayoutContour(contour, contour.position.x, contour.position.y);

            this.objDict.set(contour.id, obj);

            appendElement(obj, this.nodes);
        }

        for (const edge of this.scene.edges) {
            const layoutEdge = (edge: ModelEdge): LayoutEdge => {

                let source = this.objDict.get(edge.source.id)
                let target = this.objDict.get(edge.target.id);

                /* since we already pushed all the other possible objects in a Layout,
                if we can't find the source or target in the objDict, it means 
                that it should be some other edge inside the scene that we haven't seen yet;
                
                We'll make a fake LayoutDotPoint for it and append it to the nodes array
                */
                if (!source) {
                    const sourceEdge = this.scene.edges.find(e => e.id == edge.source.id)
                    if (sourceEdge) {
                        source = new LayoutDotPoint(sourceEdge, true, sourceEdge.contour);
                        appendElement(source, this.nodes)
                    }
                    else {
                        throw Error("Could not find source of edge " + edge.id);
                    }
                }
                if (!target) {
                    const targetEdge = this.scene.edges.find(e => e.id == edge.target.id)
                    if (targetEdge) {
                        target = new LayoutDotPoint(targetEdge, false, targetEdge.contour)
                        appendElement(target, this.nodes)
                    }
                    else {
                        throw Error("Could not find target of edge " + edge.id);
                    }
                }
                if (source && target) { return new LayoutEdge(source, target, edge, edge.contour) }
                else throw Error("Could not find source or target of edge " + edge.id);
            }

            const obj = layoutEdge(edge)
            this.objDict.set(edge.id, obj);
            appendElement(obj, this.edges);
        }
    }

    /**
     * Starts layout in scene
     */
    doLayout() {
        if (this.algorithm) {
            this.algorithm.stop();
            delete this.algorithm;
        }

        this.prepareObjects();
        this.algorithm = new ForceBasedLayoutAlgorithm(this.nodes.get(0)!, this.edges.get(0)!, [],
            this.onTickUpdate.bind(this),
            this.scene.getContainerSize());
        this.algorithm.start();
    };

    onTickUpdate() {
        this.scene.updateObjectsVisual();
        this.scene.pointed_object = null;
    };
}